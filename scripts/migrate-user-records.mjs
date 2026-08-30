/**
 * migrate-user-records
 *
 * Re-points every record belonging to one account at another account, for the
 * case where a member had to re-register (e.g. a mistyped email at signup) and
 * their history must follow them to the new uid.
 *
 * This MOVES records — it does not duplicate them. Copying would leave two
 * member rows and double-count season points.
 *
 * The app already has lib/firestore.ts linkPlaceholderMember, which does this
 * for placeholder members. It is not enough here: a placeholder never signs
 * in, so it omits everything a real player accumulates — RSVPs, posts and
 * comments, marker duties on other players' cards, tee-time assignments and
 * notifications. This covers all of it.
 *
 * Every uid-bearing location, as of this writing:
 *
 *   Doc id IS the uid (recreate under the new id, delete the old):
 *     members/{uid}
 *     seasonStandings/{groupId}_{season}_{uid}
 *     handicapHistory/{roundId}_{uid}
 *     rounds/{roundId}/rsvps/{uid}
 *
 *   Field holds the uid (update in place):
 *     scorecards.playerId, scorecards.markerId
 *     posts.authorId, posts/{id}/comments.authorId, posts/{id}/reactions.userId
 *     rounds/{id}/sideClaims.winnerId, .updatedBy
 *     notifications.recipientId
 *     memberInvites.createdBy
 *
 *   Embedded in arrays or map keys (rebuild the structure):
 *     results.rankings[].playerId
 *     results.sideResults.{ntp[],ld,t2,t3}.winnerId
 *     rounds.teeTimes[].playerIds[]
 *     rounds.playerTeeAssignments  (map keyed by uid)
 *     groups.adminIds[]
 *
 * The old Auth account is left signed-up and enabled — nothing is deleted, so
 * the migration can be inspected and reversed. Pass --retire-old to also set
 * users/{oldUid}.status = "retired" so the stale account stops appearing in
 * rosters.
 *
 * Setup:
 *   1. Firebase Console -> Project Settings -> Service accounts
 *      -> Generate new private key. Save the JSON next to this file.
 *   2. Run from a folder where firebase-admin is installed.
 *
 * Usage (dry run — writes nothing, prints the full plan):
 *   node migrate-user-records.mjs ./serviceAccount.json <oldEmailOrUid> <newUid>
 *
 * Apply:
 *   node migrate-user-records.mjs ./serviceAccount.json <oldEmailOrUid> <newUid> --commit --retire-old
 *
 * Read the dry run before committing. The service account JSON is a master key
 * to the project — keep it out of git and delete it when you're done.
 */

import { readFileSync } from "node:fs";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const [keyPath, oldRef, newUid, ...rest] = process.argv.slice(2);
const commit = rest.includes("--commit");
const retireOld = rest.includes("--retire-old");

if (!keyPath || !oldRef || !newUid) {
  console.error(
    "Usage:\n" +
      "  node migrate-user-records.mjs <serviceAccount.json> <oldEmailOrUid> <newUid> [--commit] [--retire-old]"
  );
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
} catch (error) {
  console.error(`Could not read ${keyPath}: ${error.message}`);
  process.exit(1);
}
if (!serviceAccount.project_id || !serviceAccount.private_key) {
  console.error(`${keyPath} doesn't look like a service account key.`);
  process.exit(1);
}

const app = getApps()[0] ?? initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth(app);
const db = getFirestore(app);

// ─── Resolve both accounts ───────────────────────────────────────────────────

const resolveUser = async (ref, label) => {
  try {
    return ref.includes("@")
      ? await auth.getUserByEmail(ref.trim().toLowerCase())
      : await auth.getUser(ref.trim());
  } catch (error) {
    console.error(`Could not resolve the ${label} account "${ref}": ${error.code ?? error.message}`);
    process.exit(1);
  }
};

console.log(`\nProject: ${serviceAccount.project_id}\n`);

const oldUser = await resolveUser(oldRef, "source");
const newUser = await resolveUser(newUid, "destination");
const oldUid = oldUser.uid;
const destUid = newUser.uid;

if (oldUid === destUid) {
  console.error("Source and destination are the same account. Nothing to do.");
  process.exit(1);
}

const [oldUserDoc, newUserDoc] = await Promise.all([
  db.collection("users").doc(oldUid).get(),
  db.collection("users").doc(destUid).get(),
]);

const groupId = oldUserDoc.data()?.groupId ?? newUserDoc.data()?.groupId;
if (!groupId) {
  console.error("Neither user doc has a groupId — cannot scope the migration.");
  process.exit(1);
}

const destName =
  newUserDoc.data()?.displayName ??
  newUser.displayName ??
  oldUserDoc.data()?.displayName ??
  "Unknown";

console.log("Source (records move FROM here):");
console.log(`  uid        ${oldUid}`);
console.log(`  email      ${oldUser.email}`);
console.log(`  name       ${oldUserDoc.data()?.displayName ?? "(no user doc)"}`);
console.log(`  group      ${oldUserDoc.data()?.groupId ?? "(none)"}`);
console.log("\nDestination (records move TO here):");
console.log(`  uid        ${destUid}`);
console.log(`  email      ${newUser.email}`);
console.log(`  name       ${destName}`);
console.log(`  group      ${newUserDoc.data()?.groupId ?? "(no user doc)"}`);

if (
  oldUserDoc.exists &&
  newUserDoc.exists &&
  oldUserDoc.data().groupId !== newUserDoc.data().groupId
) {
  console.error(
    "\nThe two accounts are in different groups. Refusing — check the uids."
  );
  process.exit(1);
}

console.log(`\nScoping to group: ${groupId}\n`);

// ─── Plan ────────────────────────────────────────────────────────────────────

/** Every write is queued here first so the dry run can show the whole plan. */
const plan = [];
const add = (label, apply) => plan.push({ label, apply });
const tally = new Map();
const note = (label) => tally.set(label, (tally.get(label) ?? 0) + 1);

const stamp = () => FieldValue.serverTimestamp();

// 1. members/{uid} — carry stats onto the destination doc, drop the old row.
const oldMember = await db.collection("members").doc(oldUid).get();
if (oldMember.exists) {
  const data = oldMember.data();
  add(`members/${destUid} (merge stats from ${oldUid})`, (batch) => {
    batch.set(
      db.collection("members").doc(destUid),
      {
        ...data,
        id: destUid,
        userId: destUid,
        displayName: destName,
        isPlaceholder: false,
        updatedAt: stamp(),
      },
      { merge: true }
    );
  });
  add(`members/${oldUid} (delete)`, (batch) => batch.delete(oldMember.ref));
  note("members");
  console.log(
    `  members: carrying handicap ${data.currentHandicap}, ` +
      `${data.roundsPlayed ?? 0} rounds, ${data.seasonPoints ?? 0} season points`
  );
}

// 2/3. scorecards — as player, and as marker of someone else's card.
for (const keyField of ["playerId", "markerId"]) {
  const snap = await db
    .collection("scorecards")
    .where(keyField, "==", oldUid)
    .get();
  for (const d of snap.docs) {
    add(`scorecards/${d.id}.${keyField}`, (batch) =>
      batch.update(d.ref, { [keyField]: destUid, updatedAt: stamp() })
    );
    note(`scorecards.${keyField}`);
  }
}

// 4. seasonStandings — doc id embeds the uid, so recreate and delete.
{
  const snap = await db
    .collection("seasonStandings")
    .where("memberId", "==", oldUid)
    .get();
  for (const d of snap.docs) {
    const data = d.data();
    const newId = `${data.groupId}_${data.season}_${destUid}`;
    add(`seasonStandings/${newId} (from ${d.id})`, (batch) => {
      batch.set(db.collection("seasonStandings").doc(newId), {
        ...data,
        id: newId,
        memberId: destUid,
        memberName: destName,
        updatedAt: stamp(),
      });
      batch.delete(d.ref);
    });
    note("seasonStandings");
  }
}

// 5. handicapHistory — doc id is `${roundId}_${uid}`. The app's own
//    linkPlaceholderMember only rewrites the field and leaves a stale id,
//    which would collide with future writes; recreate under the correct id.
{
  const snap = await db
    .collection("handicapHistory")
    .where("memberId", "==", oldUid)
    .get();
  for (const d of snap.docs) {
    const data = d.data();
    const newId = data.roundId ? `${data.roundId}_${destUid}` : null;
    add(`handicapHistory/${newId ?? d.id}`, (batch) => {
      if (newId && newId !== d.id) {
        batch.set(db.collection("handicapHistory").doc(newId), {
          ...data,
          id: newId,
          memberId: destUid,
          memberName: destName,
          updatedAt: stamp(),
        });
        batch.delete(d.ref);
      } else {
        batch.update(d.ref, {
          memberId: destUid,
          memberName: destName,
          updatedAt: stamp(),
        });
      }
    });
    note("handicapHistory");
  }
}

// 6. results — rankings and side results are embedded arrays.
{
  const snap = await db.collection("results").where("groupId", "==", groupId).get();
  for (const d of snap.docs) {
    const data = d.data();
    const rankings = data.rankings ?? [];
    const sr = data.sideResults ?? {};

    const remapSide = (s) =>
      s && s.winnerId === oldUid ? { ...s, winnerId: destUid, winnerName: destName } : s;

    const touchesRankings = rankings.some((r) => r.playerId === oldUid);
    const touchesSides =
      (sr.ntp ?? []).some((s) => s?.winnerId === oldUid) ||
      [sr.ld, sr.t2, sr.t3].some((s) => s?.winnerId === oldUid);

    if (!touchesRankings && !touchesSides) continue;

    add(`results/${d.id} (rankings + sideResults)`, (batch) =>
      batch.update(d.ref, {
        rankings: rankings.map((r) =>
          r.playerId === oldUid ? { ...r, playerId: destUid, playerName: destName } : r
        ),
        sideResults: {
          ...sr,
          ntp: (sr.ntp ?? []).map(remapSide),
          ld: remapSide(sr.ld ?? null),
          t2: remapSide(sr.t2 ?? null),
          t3: remapSide(sr.t3 ?? null),
        },
        updatedAt: stamp(),
      })
    );
    note("results");
  }
}

// 7/8/9. rounds — embedded tee times and assignments, plus the rsvps and
//        sideClaims subcollections.
{
  const snap = await db.collection("rounds").where("groupId", "==", groupId).get();
  for (const d of snap.docs) {
    const data = d.data();

    const teeTimes = data.teeTimes ?? [];
    const assignments = data.playerTeeAssignments ?? {};
    const inTeeTimes = teeTimes.some((t) => (t.playerIds ?? []).includes(oldUid));
    const inAssignments = Object.hasOwn(assignments, oldUid);

    if (inTeeTimes || inAssignments) {
      const nextAssignments = { ...assignments };
      if (inAssignments) {
        nextAssignments[destUid] = nextAssignments[oldUid];
        delete nextAssignments[oldUid];
      }
      add(`rounds/${d.id} (teeTimes / playerTeeAssignments)`, (batch) =>
        batch.update(d.ref, {
          teeTimes: teeTimes.map((t) => ({
            ...t,
            playerIds: (t.playerIds ?? []).map((id) => (id === oldUid ? destUid : id)),
          })),
          playerTeeAssignments: nextAssignments,
          updatedAt: stamp(),
        })
      );
      note("rounds");
    }

    // rsvps — the doc id IS the member uid.
    const rsvp = await d.ref.collection("rsvps").doc(oldUid).get();
    if (rsvp.exists) {
      const rsvpData = rsvp.data();
      add(`rounds/${d.id}/rsvps/${destUid} (from ${oldUid})`, (batch) => {
        batch.set(d.ref.collection("rsvps").doc(destUid), {
          ...rsvpData,
          memberId: destUid,
          memberName: destName,
          ...(rsvpData.respondedById === oldUid ? { respondedById: destUid } : {}),
          updatedAt: stamp(),
        });
        batch.delete(rsvp.ref);
      });
      note("rsvps");
    }

    // sideClaims — id is the prize, uid lives in fields.
    const claims = await d.ref.collection("sideClaims").get();
    for (const claim of claims.docs) {
      const c = claim.data();
      const patch = {};
      if (c.winnerId === oldUid) {
        patch.winnerId = destUid;
        patch.winnerName = destName;
      }
      if (c.updatedBy === oldUid) patch.updatedBy = destUid;
      if (Object.keys(patch).length === 0) continue;
      add(`rounds/${d.id}/sideClaims/${claim.id}`, (batch) =>
        batch.update(claim.ref, { ...patch, updatedAt: stamp() })
      );
      note("sideClaims");
    }
  }
}

// 10/11/12. posts, and their comments and reactions.
{
  const snap = await db.collection("posts").where("groupId", "==", groupId).get();
  for (const d of snap.docs) {
    if (d.data().authorId === oldUid) {
      add(`posts/${d.id}.authorId`, (batch) =>
        batch.update(d.ref, { authorId: destUid, authorName: destName, updatedAt: stamp() })
      );
      note("posts");
    }

    const comments = await d.ref.collection("comments").get();
    for (const c of comments.docs) {
      if (c.data().authorId !== oldUid) continue;
      add(`posts/${d.id}/comments/${c.id}`, (batch) =>
        batch.update(c.ref, { authorId: destUid, authorName: destName, updatedAt: stamp() })
      );
      note("comments");
    }

    const reactions = await d.ref.collection("reactions").get();
    for (const r of reactions.docs) {
      if (r.data().userId !== oldUid) continue;
      add(`posts/${d.id}/reactions/${r.id}`, (batch) =>
        batch.update(r.ref, { userId: destUid, updatedAt: stamp() })
      );
      note("reactions");
    }
  }
}

// 13. notifications — the doc id embeds the uid, but they're transient, so
//     rewriting the field is enough; a stale id only risks a duplicate.
{
  const snap = await db
    .collection("notifications")
    .where("recipientId", "==", oldUid)
    .get();
  for (const d of snap.docs) {
    add(`notifications/${d.id}.recipientId`, (batch) =>
      batch.update(d.ref, { recipientId: destUid })
    );
    note("notifications");
  }
}

// 14. groups.adminIds — only relevant if the old account was an admin.
{
  const g = await db.collection("groups").doc(groupId).get();
  const adminIds = g.data()?.adminIds ?? [];
  if (adminIds.includes(oldUid)) {
    add(`groups/${groupId}.adminIds`, (batch) =>
      batch.update(g.ref, {
        adminIds: [...new Set(adminIds.map((id) => (id === oldUid ? destUid : id)))],
        updatedAt: stamp(),
      })
    );
    note("groups.adminIds");
  }
}

// 15. memberInvites raised by the old account.
{
  const snap = await db
    .collection("memberInvites")
    .where("createdBy", "==", oldUid)
    .get();
  for (const d of snap.docs) {
    add(`memberInvites/${d.id}.createdBy`, (batch) =>
      batch.update(d.ref, { createdBy: destUid, createdByName: destName, updatedAt: stamp() })
    );
    note("memberInvites");
  }
}

// 16. Retire the old user doc so it stops showing up in rosters. The document
//     is kept, not deleted, so the migration stays inspectable.
if (retireOld && oldUserDoc.exists) {
  add(`users/${oldUid}.status = "retired"`, (batch) =>
    batch.update(oldUserDoc.ref, { status: "retired", updatedAt: stamp() })
  );
  note("users (retire)");
}

// ─── Report ──────────────────────────────────────────────────────────────────

console.log("Planned changes:\n");
if (tally.size === 0) {
  console.log("  Nothing references the source uid. Nothing to migrate.\n");
  process.exit(0);
}
for (const [label, count] of [...tally.entries()].sort()) {
  console.log(`  ${label.padEnd(24)} ${count}`);
}
console.log(`\n  ${plan.length} write operations total.`);

if (!commit) {
  console.log("\nDetail:");
  for (const step of plan) console.log(`  - ${step.label}`);
  console.log("\nDry run — nothing was written. Re-run with --commit to apply.");
  if (!retireOld) {
    console.log("Add --retire-old to also mark the old user doc retired.");
  }
  console.log();
  process.exit(0);
}

// ─── Apply, in batches under Firestore's 500-op limit ────────────────────────

console.log("\nApplying...");

const CHUNK = 200;
let written = 0;

for (let i = 0; i < plan.length; i += CHUNK) {
  const slice = plan.slice(i, i + CHUNK);
  const batch = db.batch();
  for (const step of slice) step.apply(batch);
  try {
    await batch.commit();
    written += slice.length;
    console.log(`  committed ${written}/${plan.length}`);
  } catch (error) {
    console.error(`\n  Batch failed at operation ${i}: ${error.message}`);
    console.error(
      `  ${written} operations were already committed. Re-run the dry run to\n` +
        "  see what remains — the migration is safe to run again, since each\n" +
        "  step only matches records still pointing at the old uid."
    );
    process.exit(1);
  }
}

console.log(`\nDone. ${written} operations committed.`);
console.log(
  `\nThe old Auth account (${oldUser.email}) is untouched and still enabled.\n` +
    "Verify the destination account looks right in the app, then disable or\n" +
    "delete the old one from the Firebase Console.\n"
);
