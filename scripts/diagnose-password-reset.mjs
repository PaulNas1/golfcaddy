/**
 * diagnose-password-reset
 *
 * Answers one question: when a password reset email doesn't arrive, is the
 * problem the account, the link generation, or Firebase's mail delivery?
 *
 * It separates the three failure points that look identical from the outside:
 *
 *   1. The account isn't what you think — wrong address stored, a typo at
 *      signup, a disabled account, or a Google-only account with no password.
 *   2. Firebase can't generate a reset link at all — project misconfiguration.
 *   3. The link generates fine, so the request is reaching Google and the
 *      failure is purely in delivery (Firebase's mailer, a custom SMTP
 *      config, quota, or the recipient's spam filter).
 *
 * generatePasswordResetLink() does NOT send an email — it only mints the link.
 * So if step 3 succeeds while the user still receives nothing, delivery is the
 * culprit and no amount of app-side code will fix it.
 *
 * Usage:
 *   npm run diagnose:reset -- someone@example.com
 *
 * Requires FIREBASE_ADMIN_* credentials in .env.local (same ones the app uses).
 * The reset link it prints is a live credential — treat it like a password.
 */

import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const target = process.argv[2]?.trim().toLowerCase();

if (!target) {
  console.error("Usage: npm run diagnose:reset -- someone@example.com");
  process.exit(1);
}

const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (
  !process.env.FIREBASE_ADMIN_PROJECT_ID ||
  !process.env.FIREBASE_ADMIN_CLIENT_EMAIL ||
  !privateKey
) {
  console.error(
    "Missing Firebase Admin credentials. Set FIREBASE_ADMIN_PROJECT_ID,\n" +
      "FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY in .env.local."
  );
  process.exit(1);
}

const app =
  getApps()[0] ??
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
  });

const auth = getAuth(app);

const line = (label, value) => console.log(`  ${label.padEnd(22)} ${value}`);

// ─── Step 1: does the account exist, and is it usable? ───────────────────────

console.log(`\nProject: ${process.env.FIREBASE_ADMIN_PROJECT_ID}`);
console.log(`Looking up: ${target}\n`);

let user = null;

try {
  user = await auth.getUserByEmail(target);
  console.log("[1/3] Account found.");
  line("uid", user.uid);
  line("email (as stored)", JSON.stringify(user.email));
  line("email verified", user.emailVerified);
  line("disabled", user.disabled ? "YES — reset emails are not sent" : "no");
  line("providers", user.providerData.map((p) => p.providerId).join(", ") || "(none)");
  line("has password", user.providerData.some((p) => p.providerId === "password"));
  line("created", user.metadata.creationTime);
  line("last sign-in", user.metadata.lastSignInTime ?? "never");
} catch (error) {
  if (error.code === "auth/user-not-found") {
    console.log("[1/3] NO ACCOUNT exists for this address.");
    console.log("      Firebase sends nothing, and the console's reset action");
    console.log("      would have had no user to send to.");
    await suggestNearMatches(target);
    process.exit(0);
  }
  console.error("[1/3] Lookup failed:", error.code ?? error.message);
  process.exit(1);
}

// ─── Step 2: near-miss addresses (catches typos at signup) ───────────────────

await suggestNearMatches(target, user.uid);

// ─── Step 3: can Firebase mint a reset link? ─────────────────────────────────

console.log("\n[3/3] Generating a reset link (this does NOT send an email)...");

try {
  const link = await auth.generatePasswordResetLink(target);
  console.log("      Link generated successfully.\n");
  console.log("      " + link + "\n");
  console.log("      What this proves:");
  console.log("      Firebase accepts the reset request and the project is");
  console.log("      configured correctly. If the user still receives nothing");
  console.log("      when you trigger a reset from the console, the failure is");
  console.log("      in EMAIL DELIVERY, not in your app or your Firebase setup.");
  console.log("\n      You can send the link above to the user directly as an");
  console.log("      immediate unblock. It is single-use and expires — treat it");
  console.log("      like a password and send it over a private channel.");
} catch (error) {
  console.error("      Link generation FAILED:", error.code ?? error.message);
  console.error("\n      This is a project-level problem, not a delivery one.");
  if (error.code === "auth/unauthorized-continue-uri") {
    console.error("      The continue URL's domain is not in");
    console.error("      Authentication -> Settings -> Authorized domains.");
  }
  process.exit(1);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Scans every account for addresses within a couple of edits of the target.
 * A reset sent from the Firebase console goes to the address on the account,
 * so a typo made at signup ("gmial.com") means the mail is delivered exactly
 * as instructed — to a mailbox the user cannot read.
 */
async function suggestNearMatches(address, excludeUid) {
  const matches = [];
  let pageToken;

  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const record of page.users) {
      if (!record.email || record.uid === excludeUid) continue;
      const distance = editDistance(record.email.toLowerCase(), address);
      if (distance > 0 && distance <= 3) {
        matches.push({ email: record.email, uid: record.uid, distance });
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);

  console.log(
    `\n[2/3] Similar addresses on other accounts: ${matches.length || "none"}`
  );
  for (const match of matches.sort((a, b) => a.distance - b.distance)) {
    console.log(`      ${match.email}  (${match.distance} char diff, uid ${match.uid})`);
  }
  if (matches.length) {
    console.log("      A near-match usually means a typo at signup — the reset");
    console.log("      email is being delivered to an address nobody reads.");
  }
}

function editDistance(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 3) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = row;
  }
  return prev[b.length];
}
