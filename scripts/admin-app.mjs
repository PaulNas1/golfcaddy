/**
 * Shared Firebase Admin bootstrap for the scripts in this directory.
 *
 * Reads the same FIREBASE_ADMIN_* credentials the app uses. Scripts are run
 * with `node --env-file=.env.local`, so no dotenv dependency is needed.
 */

import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export function initAdmin() {
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

  return { app, auth: getAuth(app), db: getFirestore(app) };
}

export const projectId = () => process.env.FIREBASE_ADMIN_PROJECT_ID;

export const field = (label, value) => console.log(`  ${label.padEnd(22)} ${value}`);
