import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";
import { requirePlatformAdmin } from "../auth";

export async function GET(request: NextRequest) {
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json({ error: "Admin not configured." }, { status: 503 });
  }

  try {
    await requirePlatformAdmin(request);

    const adminDb = getFirebaseAdminDb();

    // Fetch all groups
    const groupsSnap = await adminDb.collection("groups").orderBy("createdAt", "desc").get();

    // For each group, grab the primary admin's email
    const groups = await Promise.all(
      groupsSnap.docs.map(async (doc) => {
        const data = doc.data();
        const adminIds: string[] = data.adminIds ?? [];
        let adminEmail: string | null = null;

        if (adminIds.length > 0) {
          try {
            const adminUserSnap = await adminDb.collection("users").doc(adminIds[0]).get();
            adminEmail = adminUserSnap.data()?.email ?? null;
          } catch {
            // non-fatal
          }
        }

        return {
          id: doc.id,
          name: data.name ?? doc.id,
          slug: data.slug ?? doc.id,
          logoUrl: data.logoUrl ?? null,
          memberCount: data.memberCount ?? 0,
          currentSeason: data.currentSeason ?? new Date().getFullYear(),
          adminEmail,
          subscription: data.subscription ?? null,
          createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
        };
      })
    );

    // Platform-level stats
    const stats = {
      total: groups.length,
      exempt: groups.filter((g) => g.subscription?.status === "exempt").length,
      trial: groups.filter((g) => g.subscription?.status === "trial").length,
      active: groups.filter((g) => g.subscription?.status === "active").length,
      past_due: groups.filter((g) => g.subscription?.status === "past_due").length,
      suspended: groups.filter((g) => g.subscription?.status === "suspended").length,
      none: groups.filter((g) => !g.subscription).length,
    };

    return NextResponse.json({ groups, stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed.";
    const status = message === "Forbidden." ? 403 : message === "Missing bearer token." ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
