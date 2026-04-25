import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import {
  getFirebaseAdminAuth,
  getFirebaseAdminDb,
  isFirebaseAdminConfigured,
} from "@/lib/firebaseAdmin";

type ResetAction =
  | "clear_feed"
  | "clear_notifications"
  | "remove_selected_members"
  | "full_reset_except_me";

type ResetRequestBody = {
  action?: ResetAction;
  userIds?: string[];
};

const BATCH_LIMIT = 400;
const FEED_NOTIFICATION_TYPES = new Set([
  "announcement",
  "new_comment",
  "new_reaction",
]);

function createBatchWriter(adminDb: ReturnType<typeof getFirebaseAdminDb>) {
  let batch = adminDb.batch();
  let operationCount = 0;

  const flush = async () => {
    if (operationCount === 0) return;
    await batch.commit();
    batch = adminDb.batch();
    operationCount = 0;
  };

  return {
    delete: async (ref: FirebaseFirestore.DocumentReference) => {
      batch.delete(ref);
      operationCount += 1;
      if (operationCount >= BATCH_LIMIT) {
        await flush();
      }
    },
    set: async (
      ref: FirebaseFirestore.DocumentReference,
      data: FirebaseFirestore.DocumentData,
      options?: FirebaseFirestore.SetOptions
    ) => {
      if (options) {
        batch.set(ref, data, options);
      } else {
        batch.set(ref, data);
      }
      operationCount += 1;
      if (operationCount >= BATCH_LIMIT) {
        await flush();
      }
    },
    flush,
  };
}

async function deleteDocuments(
  writer: ReturnType<typeof createBatchWriter>,
  docs: FirebaseFirestore.QueryDocumentSnapshot[]
) {
  for (const doc of docs) {
    await writer.delete(doc.ref);
  }
}

async function getRoundSubcollectionDocs(
  rounds: FirebaseFirestore.QueryDocumentSnapshot[],
  collectionName: string
) {
  const subcollectionSnaps = await Promise.all(
    rounds.map((roundDoc) => roundDoc.ref.collection(collectionName).get())
  );
  return subcollectionSnaps.flatMap((snap) => snap.docs);
}

async function getPostSubcollectionDocs(
  posts: FirebaseFirestore.QueryDocumentSnapshot[],
  collectionName: string
) {
  const subcollectionSnaps = await Promise.all(
    posts.map((postDoc) => postDoc.ref.collection(collectionName).get())
  );
  return subcollectionSnaps.flatMap((snap) => snap.docs);
}

async function clearFeed({
  adminDb,
  groupId,
}: {
  adminDb: ReturnType<typeof getFirebaseAdminDb>;
  groupId: string;
}) {
  const writer = createBatchWriter(adminDb);
  const [postsSnap, notificationsSnap] = await Promise.all([
    adminDb.collection("posts").where("groupId", "==", groupId).get(),
    adminDb.collection("notifications").where("groupId", "==", groupId).get(),
  ]);
  const [commentDocs, reactionDocs] = await Promise.all([
    getPostSubcollectionDocs(postsSnap.docs, "comments"),
    getPostSubcollectionDocs(postsSnap.docs, "reactions"),
  ]);

  await deleteDocuments(writer, commentDocs);
  await deleteDocuments(writer, reactionDocs);
  await deleteDocuments(
    writer,
    notificationsSnap.docs.filter((doc) => {
      const data = doc.data() ?? {};
      return Boolean(data.postId) || FEED_NOTIFICATION_TYPES.has(data.type);
    })
  );
  await deleteDocuments(writer, postsSnap.docs);
  await writer.flush();

  return {
    postsDeleted: postsSnap.size,
    commentsDeleted: commentDocs.length,
    reactionsDeleted: reactionDocs.length,
  };
}

async function clearNotifications({
  adminDb,
  groupId,
}: {
  adminDb: ReturnType<typeof getFirebaseAdminDb>;
  groupId: string;
}) {
  const writer = createBatchWriter(adminDb);
  const usersSnap = await adminDb
    .collection("users")
    .where("groupId", "==", groupId)
    .get();
  const recipientIds = usersSnap.docs.map((doc) => doc.id);
  const notificationDocs = new Map<
    string,
    FirebaseFirestore.QueryDocumentSnapshot
  >();

  const notificationsByGroupSnap = await adminDb
    .collection("notifications")
    .where("groupId", "==", groupId)
    .get();
  notificationsByGroupSnap.docs.forEach((doc) => notificationDocs.set(doc.id, doc));

  for (const recipientId of recipientIds) {
    const recipientNotificationsSnap = await adminDb
      .collection("notifications")
      .where("recipientId", "==", recipientId)
      .get();
    recipientNotificationsSnap.docs.forEach((doc) => notificationDocs.set(doc.id, doc));
  }

  await deleteDocuments(writer, Array.from(notificationDocs.values()));
  await writer.flush();

  return {
    notificationsDeleted: notificationDocs.size,
  };
}

async function removeSelectedMembers({
  adminDb,
  adminAuth,
  groupId,
  callerUid,
  userIds,
}: {
  adminDb: ReturnType<typeof getFirebaseAdminDb>;
  adminAuth: ReturnType<typeof getFirebaseAdminAuth>;
  groupId: string;
  callerUid: string;
  userIds: string[];
}) {
  const targetIds = Array.from(
    new Set(userIds.filter((userId) => userId && userId !== callerUid))
  );
  if (targetIds.length === 0) {
    throw new Error("Choose at least one player to remove.");
  }

  const writer = createBatchWriter(adminDb);
  const [userSnaps, roundsSnap, notificationsSnap] = await Promise.all([
    Promise.all(targetIds.map((userId) => adminDb.collection("users").doc(userId).get())),
    adminDb.collection("rounds").where("groupId", "==", groupId).get(),
    adminDb.collection("notifications").where("groupId", "==", groupId).get(),
  ]);
  const rsvpDocs = await getRoundSubcollectionDocs(roundsSnap.docs, "rsvps");

  const usersToDelete = userSnaps.filter((doc) => {
    if (!doc.exists) return false;
    const data = doc.data() ?? {};
    return data.groupId === groupId && data.role !== "admin";
  });
  const removedUserIds = new Set(usersToDelete.map((doc) => doc.id));

  if (removedUserIds.size === 0) {
    throw new Error("No removable players were found in this group.");
  }

  for (const userDoc of usersToDelete) {
    try {
      await adminAuth.deleteUser(userDoc.id);
    } catch (error) {
      console.warn(`Unable to delete auth user ${userDoc.id}`, error);
    }
    await writer.delete(userDoc.ref);
    await writer.delete(adminDb.collection("members").doc(userDoc.id));
  }

  await deleteDocuments(
    writer,
    rsvpDocs.filter((doc) => removedUserIds.has(String(doc.data()?.memberId ?? "")))
  );
  await deleteDocuments(
    writer,
    notificationsSnap.docs.filter((doc) =>
      removedUserIds.has(String(doc.data()?.recipientId ?? ""))
    )
  );
  await writer.set(
    adminDb.collection("groups").doc(groupId),
    {
      memberCount: FieldValue.increment(-removedUserIds.size),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  await writer.flush();

  return {
    usersDeleted: removedUserIds.size,
    rsvpsDeleted: rsvpDocs.filter((doc) =>
      removedUserIds.has(String(doc.data()?.memberId ?? ""))
    ).length,
  };
}

async function fullResetExceptMe({
  adminDb,
  adminAuth,
  groupId,
  callerUid,
}: {
  adminDb: ReturnType<typeof getFirebaseAdminDb>;
  adminAuth: ReturnType<typeof getFirebaseAdminAuth>;
  groupId: string;
  callerUid: string;
}) {
  const [groupSnap, callerSnap] = await Promise.all([
    adminDb.collection("groups").doc(groupId).get(),
    adminDb.collection("users").doc(callerUid).get(),
  ]);
  const currentSeason =
    typeof groupSnap.data()?.currentSeason === "number"
      ? groupSnap.data()?.currentSeason
      : new Date().getFullYear();
  const callerData = callerSnap.data() ?? {};
  const callerMemberSnap = await adminDb.collection("members").doc(callerUid).get();
  const callerMemberData = callerMemberSnap.data() ?? {};

  const writer = createBatchWriter(adminDb);
  const [
    roundsSnap,
    resultsSnap,
    scorecardsSnap,
    standingsSnap,
    handicapHistorySnap,
    notificationsSnap,
    postsSnap,
    invitesSnap,
    usersSnap,
  ] = await Promise.all([
    adminDb.collection("rounds").where("groupId", "==", groupId).get(),
    adminDb.collection("results").where("groupId", "==", groupId).get(),
    adminDb.collection("scorecards").where("groupId", "==", groupId).get(),
    adminDb
      .collection("seasonStandings")
      .where("groupId", "==", groupId)
      .get(),
    adminDb
      .collection("handicapHistory")
      .where("groupId", "==", groupId)
      .get(),
    adminDb.collection("notifications").where("groupId", "==", groupId).get(),
    adminDb.collection("posts").where("groupId", "==", groupId).get(),
    adminDb.collection("memberInvites").where("groupId", "==", groupId).get(),
    adminDb.collection("users").where("groupId", "==", groupId).get(),
  ]);

  const usersToDelete = usersSnap.docs.filter((doc) => doc.id !== callerUid);
  const [holeScoreSnaps, sideClaimDocs, rsvpDocs, commentDocs, reactionDocs] =
    await Promise.all([
      Promise.all(scorecardsSnap.docs.map((doc) => doc.ref.collection("holeScores").get())),
      getRoundSubcollectionDocs(roundsSnap.docs, "sideClaims"),
      getRoundSubcollectionDocs(roundsSnap.docs, "rsvps"),
      getPostSubcollectionDocs(postsSnap.docs, "comments"),
      getPostSubcollectionDocs(postsSnap.docs, "reactions"),
    ]);

  await deleteDocuments(writer, commentDocs);
  await deleteDocuments(writer, reactionDocs);
  await deleteDocuments(writer, sideClaimDocs);
  await deleteDocuments(writer, rsvpDocs);
  for (const holeScoresSnap of holeScoreSnaps) {
    await deleteDocuments(writer, holeScoresSnap.docs);
  }
  await deleteDocuments(writer, notificationsSnap.docs);
  await deleteDocuments(writer, postsSnap.docs);
  await deleteDocuments(writer, resultsSnap.docs);
  await deleteDocuments(writer, standingsSnap.docs);
  await deleteDocuments(writer, handicapHistorySnap.docs);
  await deleteDocuments(writer, invitesSnap.docs);
  await deleteDocuments(writer, scorecardsSnap.docs);
  await deleteDocuments(writer, roundsSnap.docs);

  for (const userDoc of usersToDelete) {
    try {
      await adminAuth.deleteUser(userDoc.id);
    } catch (error) {
      console.warn(`Unable to delete auth user ${userDoc.id}`, error);
    }
    await writer.delete(userDoc.ref);
    await writer.delete(adminDb.collection("members").doc(userDoc.id));
  }

  await writer.set(
    adminDb.collection("members").doc(callerUid),
    {
      userId: callerUid,
      groupId,
      displayName: callerData.displayName ?? callerMemberData.displayName ?? "Admin",
      avatarUrl: callerData.avatarUrl ?? callerMemberData.avatarUrl ?? null,
      currentHandicap: callerMemberData.currentHandicap ?? 0,
      seasonYear: currentSeason,
      seasonPoints: 0,
      seasonRank: null,
      roundsPlayed: 0,
      ntpWins: 0,
      ldWins: 0,
      t2Wins: 0,
      t3Wins: 0,
      avgStableford: null,
      bestStableford: null,
      bestRoundId: null,
      createdAt: callerMemberData.createdAt ?? FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  await writer.set(
    adminDb.collection("groups").doc(groupId),
    {
      memberCount: 1,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  await writer.flush();

  return {
    roundsDeleted: roundsSnap.size,
    resultsDeleted: resultsSnap.size,
    scorecardsDeleted: scorecardsSnap.size,
    holeScoresDeleted: holeScoreSnaps.reduce(
      (sum, snap) => sum + snap.size,
      0
    ),
    seasonStandingsDeleted: standingsSnap.size,
    handicapHistoryDeleted: handicapHistorySnap.size,
    notificationsDeleted: notificationsSnap.size,
    postsDeleted: postsSnap.size,
    commentsDeleted: commentDocs.length,
    reactionsDeleted: reactionDocs.length,
    usersDeleted: usersToDelete.length,
    invitesDeleted: invitesSnap.size,
  };
}

export async function POST(request: NextRequest) {
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Firebase Admin is not configured for reset tools." },
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

  const body = (await request.json().catch(() => null)) as ResetRequestBody | null;
  const action = body?.action;
  const userIds = body?.userIds ?? [];

  if (!action) {
    return NextResponse.json({ error: "Missing reset action." }, { status: 400 });
  }

  try {
    const adminAuth = getFirebaseAdminAuth();
    const adminDb = getFirebaseAdminDb();
    const decoded = await adminAuth.verifyIdToken(idToken);
    const callerSnap = await adminDb.collection("users").doc(decoded.uid).get();

    if (!callerSnap.exists) {
      return NextResponse.json({ error: "Caller not found." }, { status: 403 });
    }

    const caller = callerSnap.data() ?? {};
    if (
      caller.status !== "active" ||
      caller.role !== "admin" ||
      !caller.groupId
    ) {
      return NextResponse.json(
        { error: "Only active admins can use reset tools." },
        { status: 403 }
      );
    }

    let summary: Record<string, number> = {};
    let message = "";

    switch (action) {
      case "clear_feed":
        summary = await clearFeed({ adminDb, groupId: caller.groupId });
        message = "Feed cleared.";
        break;
      case "clear_notifications":
        summary = await clearNotifications({ adminDb, groupId: caller.groupId });
        message = "Notifications cleared.";
        break;
      case "remove_selected_members":
        summary = await removeSelectedMembers({
          adminDb,
          adminAuth,
          groupId: caller.groupId,
          callerUid: decoded.uid,
          userIds,
        });
        message = "Selected players were removed.";
        break;
      case "full_reset_except_me":
        summary = await fullResetExceptMe({
          adminDb,
          adminAuth,
          groupId: caller.groupId,
          callerUid: decoded.uid,
        });
        message = "Group data was reset and your account was preserved.";
        break;
      default:
        return NextResponse.json({ error: "Unknown reset action." }, { status: 400 });
    }

    return NextResponse.json({ ok: true, message, summary });
  } catch (error) {
    console.error("Admin reset failed", error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Reset failed. Please try again.";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
