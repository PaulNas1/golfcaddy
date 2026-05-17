import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdminAuth, getFirebaseAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";
import { requirePlatformAdmin } from "../auth";

export async function GET(request: NextRequest) {
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json({ error: "Admin not configured." }, { status: 503 });
  }

  try {
    await requirePlatformAdmin(request);

    const adminDb = getFirebaseAdminDb();
    const adminAuth = getFirebaseAdminAuth();

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Fetch all groups
    // No orderBy — Firestore excludes docs missing the field when you use orderBy.
    // Sort in-memory instead so groups without createdAt still appear.
    const groupsSnap = await adminDb.collection("groups").get();

    // For each group, grab the primary admin's email + activity signals
    const groups = await Promise.all(
      groupsSnap.docs.map(async (doc) => {
        const data = doc.data();
        const groupId = doc.id;
        const adminIds: string[] = data.adminIds ?? [];

        const [
          adminUserSnap,
          lastRoundSnap,
          roundsLast30Snap,
          newMembersSnap,
          allMembersSnap,
        ] = await Promise.all([
          adminIds.length > 0
            ? adminDb.collection("users").doc(adminIds[0]).get()
            : Promise.resolve(null),
          adminDb.collection("rounds")
            .where("groupId", "==", groupId)
            .orderBy("date", "desc")
            .limit(1)
            .get(),
          adminDb.collection("rounds")
            .where("groupId", "==", groupId)
            .where("date", ">=", thirtyDaysAgo)
            .count()
            .get(),
          adminDb.collection("members")
            .where("groupId", "==", groupId)
            .where("createdAt", ">=", thirtyDaysAgo)
            .count()
            .get(),
          adminDb.collection("members")
            .where("groupId", "==", groupId)
            .select()
            .get(),
        ]);

        const adminEmail = adminUserSnap?.data()?.email ?? null;
        const lastRoundAt = lastRoundSnap.docs[0]?.data()?.date?.toDate?.()?.toISOString() ?? null;
        const roundsLast30Days = roundsLast30Snap.data().count;
        const newMembersLast30Days = newMembersSnap.data().count;

        // Count members who logged in within the last 7 days
        const memberUids = allMembersSnap.docs.map((d) => d.id);
        let membersActiveThisWeek = 0;
        const totalMembers = memberUids.length;
        if (memberUids.length > 0) {
          try {
            const authResult = await adminAuth.getUsers(
              memberUids.map((uid) => ({ uid }))
            );
            membersActiveThisWeek = authResult.users.filter((u) => {
              const t = u.metadata.lastSignInTime;
              return t && new Date(t) >= sevenDaysAgo;
            }).length;
          } catch {
            // non-fatal — login data unavailable
          }
        }

        return {
          id: groupId,
          name: data.name ?? groupId,
          slug: data.slug ?? groupId,
          logoUrl: data.logoUrl ?? null,
          memberCount: data.memberCount ?? 0,
          currentSeason: data.currentSeason ?? new Date().getFullYear(),
          adminEmail,
          platformNotes: data.platformNotes ?? null,
          subscription: data.subscription
            ? {
                status: data.subscription.status ?? null,
                plan: data.subscription.plan ?? null,
                exemptReason: data.subscription.exemptReason ?? null,
                stripeCustomerId: data.subscription.stripeCustomerId ?? null,
                stripeSubscriptionId: data.subscription.stripeSubscriptionId ?? null,
                trialEndsAt: data.subscription.trialEndsAt?.toDate?.()?.toISOString() ?? null,
                currentPeriodEndsAt: data.subscription.currentPeriodEndsAt?.toDate?.()?.toISOString() ?? null,
                updatedAt: data.subscription.updatedAt?.toDate?.()?.toISOString() ?? null,
              }
            : null,
          createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
          activity: {
            lastRoundAt,
            roundsLast30Days,
            newMembersLast30Days,
            membersActiveThisWeek,
            totalMembers,
          },
        };
      })
    );

    // Sort newest-first; groups without createdAt fall to the bottom.
    groups.sort((a, b) => {
      if (!a.createdAt && !b.createdAt) return 0;
      if (!a.createdAt) return 1;
      if (!b.createdAt) return -1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

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
