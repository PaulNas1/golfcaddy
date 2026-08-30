/**
 * fix-user-email-standalone
 *
 * A portable copy of fix-user-email.mjs that needs no repository checkout and
 * no .env.local — just this one file, a service account JSON, and a folder
 * where firebase-admin is installed. It deliberately duplicates the repo
 * version so it can be dropped anywhere and run; prefer `npm run fix:email`
 * when you do have a working clone.
 *
 * Why this is needed at all: the Firebase Console cannot edit a user's email
 * address. Its row menu offers only Reset password / Disable / Delete. The
 * Admin SDK is the only supported way to correct one.
 *
 * DO NOT use "Delete account" and re-create the user. That mints a NEW uid,
 * and every record in this app keys the player by uid (members.userId,
 * scorecards.playerId/markerId, seasonStandings and handicapHistory
 * .memberId, rsvps.memberId, posts.authorId, results.rankings[].playerId).
 * Deleting orphans all of it. Editing the email in place changes nothing but
 * the address — the uid is immutable and every record stays attached.
 *
 * Setup:
 *   1. Firebase Console -> Project Settings -> Service accounts
 *      -> Generate new private key. Save the JSON next to this file.
 *   2. Put this file in a folder where firebase-admin is installed
 *      (your existing project folder already has it), or run:
 *        npm install firebase-admin
 *
 * Usage (dry run — writes nothing):
 *   node fix-user-email-standalone.mjs ./serviceAccount.json wrong@x.com right@x.com
 *
 * Apply:
 *   node fix-user-email-standalone.mjs ./serviceAccount.json wrong@x.com right@x.com --commit
 *
 * Add --send-reset to also mint a password reset link for the new address.
 *
 * The service account JSON is a master key to the whole project. Keep it out
 * of git and delete it when you're done.
 */

import { readFileSync } from "node:fs";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const [keyPath, currentRaw, nextRaw, ...rest] = process.argv.slice(2);
const commit = rest.includes("--commit");
const sendReset = rest.includes("--send-reset");

if (!keyPath || !currentRaw || !nextRaw) {
  console.error(
    "Usage:\n" +
      "  node fix-user-email-standalone.mjs <serviceAccount.json> <current@email> <new@email> [--commit] [--send-reset]"
  );
  process.exit(1);
}

const currentEmail = currentRaw.trim().toLowerCase();
const nextEmail = nextRaw.trim().toLowerCase();

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
  console.error(`"${nextRaw}" is not a valid email address.`);
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
} catch (error) {
  console.error(`Could not read the service account JSON at ${keyPath}:`);
  console.error(`  ${error.message}`);
  process.exit(1);
}

if (!serviceAccount.project_id || !serviceAccount.private_key) {
  console.error(
    `${keyPath} doesn't look like a service account key.\n` +
      "Download one from Firebase Console -> Project Settings -> Service accounts."
  );
  process.exit(1);
}

const app =
  getApps()[0] ?? initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth(app);
const db = getFirestore(app);

const field = (label, value) => console.log(`  ${label.padEnd(22)} ${value}`);

console.log(`\nProject: ${serviceAccount.project_id}\n`);

// ─── Locate the account ──────────────────────────────────────────────────────

let user;
try {
  user = await auth.getUserByEmail(currentEmail);
} catch (error) {
  if (error.code === "auth/user-not-found") {
    console.error(`No account found for ${currentEmail}.`);
    process.exit(1);
  }
  console.error("Lookup failed:", error.code ?? error.message);
  process.exit(1);
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

const userRef = db.collection("users").doc(user.uid);
const snap = await userRef.get();

console.log("Account:");
field("uid", user.uid);
field("display name", user.displayName ?? snap.data()?.displayName ?? "(none)");
field("Auth email", JSON.stringify(user.email));
field("Firestore email", snap.exists ? JSON.stringify(snap.data().email ?? null) : "(no user doc)");
field("last sign-in", user.metadata.lastSignInTime ?? "never");

console.log("\nPlanned changes:");
console.log(`  Firebase Auth      ${user.email}  ->  ${nextEmail}   (authoritative)`);
console.log(
  snap.exists
    ? `  users/${user.uid}  ->  ${nextEmail}   (display copy)`
    : `  users/${user.uid}  (no document — skipping Firestore)`
);
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

console.log("\nRe-checking records against the same uid:\n");
const after = await auditRecords(user.uid);

const drifted = Object.keys(before).filter((key) => before[key] !== after[key]);
if (drifted.length) {
  console.error(
    "  Counts changed: " +
      drifted.map((k) => `${k} ${before[k]} -> ${after[k]}`).join(", ")
  );
} else {
  console.log("  Unchanged — every record is still attached to this account.");
}

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

console.log("\nDone. Ask the user to sign in with the corrected address.\n");

/**
 * Counts documents attached to a uid across every collection that references
 * a player. All of these key by uid, never by email — which is exactly why
 * changing the address is safe.
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
      const snapshot = await db
        .collection(collectionName)
        .where(keyField, "==", uid)
        .count()
        .get();
      counts[label] = snapshot.data().count;
      field(label, counts[label]);
    } catch (error) {
      counts[label] = null;
      field(label, `(could not read: ${error.code ?? error.message})`);
    }
  }
  return counts;
}
