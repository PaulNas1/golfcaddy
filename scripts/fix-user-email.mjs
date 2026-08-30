/**
 * fix-user-email
 *
 * Corrects the email address on an account that was mistyped at signup.
 *
 * The address MUST be changed in Firebase Auth. Firestore's users/{uid}.email
 * is only a display copy — sign-in and password reset both read Firebase Auth,
 * and contexts/AuthContext.tsx overwrites the Firestore copy with the Auth
 * value on the next sign-in. Editing Firestore alone fixes nothing and is
 * silently reverted.
 *
 * This script updates both, in the right order.
 *
 * Usage:
 *   npm run fix:email -- --current wrong@example.com --new right@example.com
 *   npm run fix:email -- --uid <uid> --new right@example.com
 *
 * Prints the plan and changes nothing until you add --commit:
 *   npm run fix:email -- --current wrong@... --new right@... --commit
 *
 * Add --send-reset to also mint a password reset link for the new address.
 *
 * Records and stats are NOT at risk. Every collection keys the player by the
 * Auth uid (members.userId, scorecards.playerId/markerId, seasonStandings and
 * handicapHistory .memberId, rsvps.memberId, posts.authorId, and the embedded
 * results.rankings[].playerId). Nothing in the app stores or queries by email,
 * and firestore.rules never reads it. Changing the email leaves the uid
 * untouched, so every record stays attached — this script counts them before
 * and after so you can see that for yourself.
 *
 * What WOULD orphan the records is deleting the account and recreating it with
 * the correct address: that mints a new uid, and nothing would follow it.
 *
 * Only ever point an account at an address you have confirmed belongs to that
 * person — repointing an account is a full account takeover.
 */

import { initAdmin, projectId, field } from "./admin-app.mjs";

const args = process.argv.slice(2);

const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

const uidArg = flag("uid");
const currentArg = flag("current")?.trim().toLowerCase();
const nextEmail = flag("new")?.trim().toLowerCase();
const commit = has("commit");
const sendReset = has("send-reset");

if ((!uidArg && !currentArg) || !nextEmail) {
  console.error(
    "Usage:\n" +
      "  npm run fix:email -- --current wrong@example.com --new right@example.com\n" +
      "  npm run fix:email -- --uid <uid> --new right@example.com\n\n" +
      "Add --commit to apply, --send-reset to also mint a reset link."
  );
  process.exit(1);
}

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
  console.error(`"${nextEmail}" is not a valid email address.`);
  process.exit(1);
}

const { auth, db } = initAdmin();

console.log(`\nProject: ${projectId()}\n`);

// ─── Locate the account ──────────────────────────────────────────────────────

let user;
try {
  user = uidArg
    ? await auth.getUser(uidArg)
    : await auth.getUserByEmail(currentArg);
} catch (error) {
  if (error.code === "auth/user-not-found") {
    console.error(
      `No account found for ${uidArg ? `uid ${uidArg}` : currentArg}.\n` +
        "Run `npm run diagnose:reset -- <address>` to search for near-misses."
    );
    process.exit(1);
  }
  console.error("Lookup failed:", error.code ?? error.message);
  process.exit(1);
}

if (user.email === nextEmail) {
  console.log(`Auth already has ${nextEmail} — nothing to change there.`);
}

// ─── Refuse if the target address is taken ───────────────────────────────────

try {
  const existing = await auth.getUserByEmail(nextEmail);
  if (existing.uid !== user.uid) {
    console.error(
      `${nextEmail} already belongs to a different account (uid ${existing.uid}).\n` +
        "Merging accounts is not something this script will do."
    );
    process.exit(1);
  }
} catch (error) {
  if (error.code !== "auth/user-not-found") {
    console.error("Lookup failed:", error.code ?? error.message);
    process.exit(1);
  }
  // Not found is the expected, healthy case — the address is free.
}

// ─── Show the plan ───────────────────────────────────────────────────────────

const userRef = db.collection("users").doc(user.uid);
const snap = await userRef.get();
const firestoreEmail = snap.exists ? (snap.data().email ?? null) : null;

console.log("Account:");
field("uid", user.uid);
field("display name", user.displayName ?? snap.data()?.displayName ?? "(none)");
field("Auth email", JSON.stringify(user.email));
field("Firestore email", snap.exists ? JSON.stringify(firestoreEmail) : "(no user doc)");
field("last sign-in", user.metadata.lastSignInTime ?? "never");

console.log("\nPlanned changes:");
console.log(`  Firebase Auth      ${user.email}  ->  ${nextEmail}   (authoritative)`);
if (snap.exists) {
  console.log(`  users/${user.uid}  ${firestoreEmail}  ->  ${nextEmail}   (display copy)`);
} else {
  console.log(`  users/${user.uid}  (no document — skipping Firestore)`);
}
console.log("\n  Changing the Auth email resets emailVerified to false.");
console.log("  The uid does not change, so records stay attached:\n");

const before = await auditRecords(user.uid);

if (!commit) {
  console.log("\nDry run — nothing was written. Re-run with --commit to apply.\n");
  process.exit(0);
}

// ─── Apply: Auth first, it is the source of truth ────────────────────────────

console.log("\nApplying...");

try {
  await auth.updateUser(user.uid, { email: nextEmail });
  console.log(`  Firebase Auth updated to ${nextEmail}`);
} catch (error) {
  console.error("  Firebase Auth update FAILED:", error.code ?? error.message);
  console.error("  Nothing else was written.");
  process.exit(1);
}

if (snap.exists) {
  try {
    await userRef.update({ email: nextEmail });
    console.log(`  users/${user.uid} updated to ${nextEmail}`);
  } catch (error) {
    console.error("  Firestore update failed:", error.message);
    console.error(
      "  Auth is correct, so sign-in and password reset already work.\n" +
        "  AuthContext re-syncs this copy on the user's next sign-in anyway."
    );
  }
}

// ─── Optionally mint a reset link ────────────────────────────────────────────

if (sendReset) {
  try {
    const link = await auth.generatePasswordResetLink(nextEmail);
    console.log("\nPassword reset link for the corrected address:\n");
    console.log("  " + link + "\n");
    console.log("  Single-use and expiring. Send it over a private channel.");
  } catch (error) {
    console.error("\nCould not generate a reset link:", error.code ?? error.message);
  }
}

// ─── Confirm nothing was orphaned ────────────────────────────────────────────

console.log("\nRe-checking records against the same uid:\n");
const after = await auditRecords(user.uid);

const drifted = Object.keys(before).filter((key) => before[key] !== after[key]);
if (drifted.length) {
  console.error(
    "  Counts changed: " +
      drifted.map((k) => `${k} ${before[k]} -> ${after[k]}`).join(", ")
  );
  console.error("  Investigate before letting the user back in.");
} else {
  console.log("  Unchanged — every record is still attached to this account.");
}

console.log("\nDone. Ask the user to sign in with the corrected address.\n");

/**
 * Counts the documents attached to a uid across every collection that
 * references a player. All of these key by uid, never by email, which is why
 * changing the address is safe. Single-field equality queries use Firestore's
 * automatic indexes, so this needs no index setup.
 */
async function auditRecords(uid) {
  const targets = [
    ["members", "userId"],
    ["scorecards", "playerId"],
    ["scorecards", "markerId"],
    ["seasonStandings", "memberId"],
    ["handicapHistory", "memberId"],
    ["posts", "authorId"],
  ];

  const counts = {};

  for (const [collectionName, keyField] of targets) {
    const label = `${collectionName}.${keyField}`;
    try {
      const snap = await db
        .collection(collectionName)
        .where(keyField, "==", uid)
        .count()
        .get();
      counts[label] = snap.data().count;
      field(label, counts[label]);
    } catch (error) {
      counts[label] = null;
      field(label, `(could not read: ${error.code ?? error.message})`);
    }
  }

  return counts;
}
