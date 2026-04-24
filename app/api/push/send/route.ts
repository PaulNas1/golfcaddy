import { NextRequest, NextResponse } from "next/server";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import {
  getFirebaseAdminAuth,
  getFirebaseAdminDb,
  getFirebaseAdminMessaging,
  isFirebaseAdminConfigured,
} from "@/lib/firebaseAdmin";

type PushRequestBody = {
  recipientUserIds?: string[];
  title?: string;
  body?: string;
  deepLink?: string | null;
  type?: string;
};

const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

export async function POST(request: NextRequest) {
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Firebase Admin is not configured for push delivery." },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";

  if (!idToken) {
    return NextResponse.json({ error: "Missing bearer token." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as PushRequestBody | null;
  const recipientUserIds = Array.from(
    new Set((body?.recipientUserIds ?? []).filter(Boolean))
  );
  const title = body?.title?.trim() ?? "";
  const messageBody = body?.body?.trim() ?? "";
  const deepLink = body?.deepLink?.trim() || "/notifications";
  const type = body?.type?.trim() || "notification";

  if (recipientUserIds.length === 0 || !title || !messageBody) {
    return NextResponse.json(
      { error: "recipientUserIds, title, and body are required." },
      { status: 400 }
    );
  }

  try {
    const adminAuth = getFirebaseAdminAuth();
    const adminDb = getFirebaseAdminDb();
    const adminMessaging = getFirebaseAdminMessaging();

    const decoded = await adminAuth.verifyIdToken(idToken);
    const callerSnap = await adminDb.collection("users").doc(decoded.uid).get();
    if (!callerSnap.exists) {
      return NextResponse.json({ error: "Caller not found." }, { status: 403 });
    }

    const caller = callerSnap.data() ?? {};
    if (caller.status !== "active" || !caller.groupId) {
      return NextResponse.json(
        { error: "Only active members can dispatch push notifications." },
        { status: 403 }
      );
    }

    const recipientSnaps = await Promise.all(
      recipientUserIds.map((uid) => adminDb.collection("users").doc(uid).get())
    );

    const allowedRecipients: Array<{
      id: string;
      groupId?: string;
      fcmToken?: string | null;
    }> = [];

    recipientSnaps.forEach((snap: DocumentSnapshot) => {
      if (!snap.exists) return;
      const recipient = {
        id: snap.id,
        ...(snap.data() ?? {}),
      } as {
        id: string;
        groupId?: string;
        fcmToken?: string | null;
      };
      if (recipient.groupId !== caller.groupId || !recipient.fcmToken) return;
      allowedRecipients.push(recipient);
    });

    if (allowedRecipients.length === 0) {
      return NextResponse.json({
        attempted: recipientUserIds.length,
        delivered: 0,
        skipped: recipientUserIds.length,
      });
    }

    const link = deepLink.startsWith("http")
      ? deepLink
      : new URL(deepLink, request.nextUrl.origin).toString();

    const response = await adminMessaging.sendEachForMulticast({
      tokens: allowedRecipients.map((recipient) => recipient.fcmToken!),
      data: {
        title,
        body: messageBody,
        deepLink,
        type,
      },
      webpush: {
        fcmOptions: {
          link,
        },
        headers: {
          Urgency: "high",
        },
      },
    });

    const invalidRecipientIds: string[] = [];
    response.responses.forEach((result, index) => {
      if (!result.success) {
        const code = result.error?.code ?? "";
        if (INVALID_TOKEN_CODES.has(code)) {
          invalidRecipientIds.push(allowedRecipients[index].id);
        }
      }
    });

    if (invalidRecipientIds.length > 0) {
      await Promise.all(
        invalidRecipientIds.map((uid) =>
          adminDb.collection("users").doc(uid).update({ fcmToken: null })
        )
      );
    }

    return NextResponse.json({
      attempted: recipientUserIds.length,
      delivered: response.successCount,
      failed: response.failureCount,
      skipped: recipientUserIds.length - allowedRecipients.length,
      invalidRecipientIds,
    });
  } catch (error) {
    console.error("Push send failed", error);
    return NextResponse.json(
      { error: "Push delivery failed." },
      { status: 500 }
    );
  }
}
