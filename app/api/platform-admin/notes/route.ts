import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";
import { requirePlatformAdmin } from "../auth";

type NotesBody = {
  groupId: string;
  notes: string;
};

export async function PATCH(request: NextRequest) {
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json({ error: "Admin not configured." }, { status: 503 });
  }

  try {
    await requirePlatformAdmin(request);

    const body = (await request.json()) as NotesBody;
    const { groupId, notes } = body;

    if (!groupId) {
      return NextResponse.json({ error: "groupId is required." }, { status: 400 });
    }

    const adminDb = getFirebaseAdminDb();
    const groupRef = adminDb.collection("groups").doc(groupId);
    const groupSnap = await groupRef.get();

    if (!groupSnap.exists) {
      return NextResponse.json({ error: "Group not found." }, { status: 404 });
    }

    await groupRef.update({
      platformNotes: notes.trim() || null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed.";
    const status = message === "Forbidden." ? 403 : message === "Missing bearer token." ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
