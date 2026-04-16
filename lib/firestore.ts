import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  setDoc,
  updateDoc,
  addDoc,
  writeBatch,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  QueryDocumentSnapshot,
  DocumentSnapshot,
  DocumentData,
  WriteBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import type {
  AppUser,
  Member,
  Round,
  Group,
  AppNotification,
  Scorecard,
  HoleScore,
  Results,
  SeasonStanding,
  Post,
} from "@/types";
import {
  buildSeasonStandings,
  calculateNextHandicap,
  getAverageStableford,
  getBestStableford,
  getSeasonStandingId,
} from "./season";
import { withSeededCourseData } from "./courseData";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FIRESTORE_BATCH_LIMIT = 450;

function createBatchedWriter() {
  let batch = writeBatch(db);
  let operationCount = 0;

  const commitCurrent = async () => {
    if (operationCount === 0) return;
    await batch.commit();
    batch = writeBatch(db);
    operationCount = 0;
  };

  return {
    queue: async (write: (batch: WriteBatch) => void) => {
      write(batch);
      operationCount += 1;
      if (operationCount >= FIRESTORE_BATCH_LIMIT) {
        await commitCurrent();
      }
    },
    commit: commitCurrent,
  };
}

export const toDate = (val: Timestamp | Date | null | undefined): Date => {
  if (!val) return new Date();
  if (val instanceof Timestamp) return val.toDate();
  return val;
};

const mapRound = (
  d: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>
): Round => {
  const data = d.data() ?? {};
  return withSeededCourseData({
    id: d.id,
    ...data,
    teeTimes: Array.isArray(data.teeTimes)
      ? data.teeTimes.map((teeTime, index) => ({
          id: teeTime.id ?? `tee-${index + 1}`,
          time: teeTime.time ?? "",
          playerIds: Array.isArray(teeTime.playerIds)
            ? teeTime.playerIds
            : [],
          notes: teeTime.notes ?? null,
        }))
      : [],
    courseId: data.courseId ?? "",
    teeSetId: data.teeSetId ?? null,
    teeSetName: data.teeSetName ?? null,
    coursePar: data.coursePar ?? null,
    courseRating: data.courseRating ?? null,
    slopeRating: data.slopeRating ?? null,
    courseHoles: Array.isArray(data.courseHoles) ? data.courseHoles : [],
    courseSource: data.courseSource ?? null,
    specialHoles: data.specialHoles ?? {
      ntp: [],
      ld: null,
      t2: null,
      t3: null,
    },
    date: toDate(data.date),
    resultsPublishedAt: data.resultsPublishedAt
      ? toDate(data.resultsPublishedAt)
      : null,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  } as Round);
};

// ─── Users ───────────────────────────────────────────────────────────────────

export const createUser = async (
  uid: string,
  data: Omit<AppUser, "uid" | "createdAt" | "updatedAt">
) => {
  await setDoc(doc(db, "users", uid), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const getUser = async (uid: string): Promise<AppUser | null> => {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    uid: snap.id,
    ...data,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  } as AppUser;
};

export const updateUser = async (uid: string, data: Partial<AppUser>) => {
  await updateDoc(doc(db, "users", uid), {
    ...data,
    updatedAt: serverTimestamp(),
  });
};

// ─── Group ───────────────────────────────────────────────────────────────────

const FOURPLAY_GROUP_ID = "fourplay";

export const getGroup = async (): Promise<Group | null> => {
  const snap = await getDoc(doc(db, "groups", FOURPLAY_GROUP_ID));
  if (!snap.exists()) return null;
  const data = snap.data();
  return { id: snap.id, ...data } as Group;
};

// ─── Members ─────────────────────────────────────────────────────────────────

const mapMember = (
  d: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>
): Member => {
  const data = d.data() ?? {};
  return {
    id: d.id,
    ...data,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  } as Member;
};

export const getMember = async (userId: string): Promise<Member | null> => {
  const snap = await getDoc(doc(db, "members", userId));
  if (!snap.exists()) return null;
  return mapMember(snap);
};

export const getMembersForGroup = async (
  groupId: string
): Promise<Member[]> => {
  const q = query(collection(db, "members"), where("groupId", "==", groupId));
  const snap = await getDocs(q);
  return snap.docs.map(mapMember);
};

export const updateMemberStartingHandicap = async ({
  memberUser,
  handicap,
  season,
  changedBy,
}: {
  memberUser: AppUser;
  handicap: number;
  season: number;
  changedBy: AppUser | null;
}) => {
  const existingMember = await getMember(memberUser.uid);
  const previousHandicap = existingMember?.currentHandicap ?? 0;
  const batch = writeBatch(db);
  const memberRef = doc(db, "members", memberUser.uid);
  const historyRef = doc(collection(db, "handicapHistory"));

  batch.set(
    memberRef,
    {
      userId: memberUser.uid,
      groupId: memberUser.groupId,
      displayName: memberUser.displayName,
      avatarUrl: memberUser.avatarUrl,
      currentHandicap: handicap,
      seasonYear: existingMember?.seasonYear ?? season,
      seasonPoints: existingMember?.seasonPoints ?? 0,
      seasonRank: existingMember?.seasonRank ?? null,
      roundsPlayed: existingMember?.roundsPlayed ?? 0,
      ntpWins: existingMember?.ntpWins ?? 0,
      ldWins: existingMember?.ldWins ?? 0,
      t2Wins: existingMember?.t2Wins ?? 0,
      t3Wins: existingMember?.t3Wins ?? 0,
      avgStableford: existingMember?.avgStableford ?? null,
      bestStableford: existingMember?.bestStableford ?? null,
      bestRoundId: existingMember?.bestRoundId ?? null,
      updatedAt: serverTimestamp(),
      ...(existingMember ? {} : { createdAt: serverTimestamp() }),
    },
    { merge: true }
  );
  batch.set(historyRef, {
    groupId: memberUser.groupId,
    memberId: memberUser.uid,
    memberName: memberUser.displayName,
    roundId: null,
    season,
    previousHandicap,
    newHandicap: handicap,
    reason: "Admin-entered GolfCaddy starting handicap.",
    source: "manual_admin",
    changedBy: changedBy?.uid ?? null,
    changedByName: changedBy?.displayName ?? null,
    createdAt: serverTimestamp(),
  });

  await batch.commit();
};

export const getPendingMembers = async (): Promise<AppUser[]> => {
  const q = query(
    collection(db, "users"),
    where("status", "==", "pending"),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      uid: d.id,
      ...data,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
    } as AppUser;
  });
};

export const getActiveMembers = async (
  groupId = FOURPLAY_GROUP_ID
): Promise<AppUser[]> => {
  const q = query(
    collection(db, "users"),
    where("status", "==", "active"),
    where("groupId", "==", groupId)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        uid: d.id,
        ...data,
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
      } as AppUser;
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
};

export const approveMember = async (uid: string) => {
  await updateDoc(doc(db, "users", uid), {
    status: "active",
    updatedAt: serverTimestamp(),
  });
};

export const rejectMember = async (uid: string) => {
  await updateDoc(doc(db, "users", uid), {
    status: "suspended",
    updatedAt: serverTimestamp(),
  });
};

// ─── Rounds ──────────────────────────────────────────────────────────────────

export const getRounds = async (groupId: string): Promise<Round[]> => {
  const q = query(
    collection(db, "rounds"),
    where("groupId", "==", groupId),
    orderBy("date", "desc"),
    limit(20)
  );
  const snap = await getDocsFromServer(q);
  return snap.docs
    .map(mapRound)
    .sort((a, b) => {
      if (a.roundNumber !== b.roundNumber) {
        return b.roundNumber - a.roundNumber;
      }
      return b.date.getTime() - a.date.getTime();
    });
};

export const getRound = async (roundId: string): Promise<Round | null> => {
  const snap = await getDocFromServer(doc(db, "rounds", roundId));
  if (!snap.exists()) return null;
  return mapRound(snap);
};

export const createRound = async (
  data: Omit<Round, "id" | "createdAt" | "updatedAt">
): Promise<string> => {
  const ref = await addDoc(collection(db, "rounds"), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
};

export const updateRound = async (roundId: string, data: Partial<Round>) => {
  await updateDoc(doc(db, "rounds", roundId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
};

export const deleteRoundCascade = async (roundId: string) => {
  const round = await getRound(roundId);
  if (!round) {
    return {
      deleted: false,
      scorecardsDeleted: 0,
      holeScoresDeleted: 0,
      resultsDeleted: 0,
      feedPostsDeleted: 0,
      notificationsDeleted: 0,
      handicapHistoryDeleted: 0,
      standingsRebuilt: 0,
    };
  }

  const [
    scorecardsSnap,
    resultsSnap,
    postsSnap,
    notificationsSnap,
    handicapHistorySnap,
  ] = await Promise.all([
    getDocs(query(collection(db, "scorecards"), where("roundId", "==", round.id))),
    getDoc(doc(db, "results", round.id)),
    getDocs(query(collection(db, "posts"), where("roundId", "==", round.id))),
    getDocs(
      query(collection(db, "notifications"), where("roundId", "==", round.id))
    ),
    getDocs(
      query(collection(db, "handicapHistory"), where("roundId", "==", round.id))
    ),
  ]);
  const shouldRebuildSeason = resultsSnap.exists();
  const [seasonResults, previousStandings, groupMembers] = shouldRebuildSeason
    ? await Promise.all([
        getResultsForSeason(round.groupId, round.season),
        getSeasonStandings(round.groupId, round.season),
        getMembersForGroup(round.groupId),
      ])
    : [[], [], []];
  const remainingSeasonResults = seasonResults.filter(
    (result) => result.roundId !== round.id
  );
  const remainingRoundEntries = await Promise.all(
    remainingSeasonResults.map(async (result) => {
      const resultRound = await getRound(result.roundId);
      return [result.roundId, resultRound ?? round] as const;
    })
  );
  const standings = shouldRebuildSeason
    ? buildSeasonStandings({
        groupId: round.groupId,
        season: round.season,
        results: remainingSeasonResults,
        roundsById: new Map(remainingRoundEntries),
        previousStandings,
        updatedAt: new Date(),
      })
    : [];
  const standingsByMemberId = new Map(
    standings.map((standing) => [standing.memberId, standing])
  );
  const membersById = new Map(groupMembers.map((member) => [member.id, member]));
  const deletedRoundHandicapBase = new Map<string, number>();
  handicapHistorySnap.docs.forEach((historyDoc) => {
    const data = historyDoc.data();
    if (
      data.source === "published_round" &&
      typeof data.memberId === "string" &&
      typeof data.previousHandicap === "number"
    ) {
      deletedRoundHandicapBase.set(data.memberId, data.previousHandicap);
    }
  });

  const writer = createBatchedWriter();
  let holeScoresDeleted = 0;
  let feedPostsDeleted = 0;

  for (const scorecardDoc of scorecardsSnap.docs) {
    const holeScoresSnap = await getDocs(
      collection(db, "scorecards", scorecardDoc.id, "holeScores")
    );
    for (const holeScoreDoc of holeScoresSnap.docs) {
      await writer.queue((batch) => batch.delete(holeScoreDoc.ref));
      holeScoresDeleted += 1;
    }
    await writer.queue((batch) => batch.delete(scorecardDoc.ref));
  }

  if (resultsSnap.exists()) {
    await writer.queue((batch) => batch.delete(resultsSnap.ref));
  }

  for (const postDoc of postsSnap.docs) {
    const [commentsSnap, reactionsSnap] = await Promise.all([
      getDocs(collection(db, "posts", postDoc.id, "comments")),
      getDocs(collection(db, "posts", postDoc.id, "reactions")),
    ]);
    for (const commentDoc of commentsSnap.docs) {
      await writer.queue((batch) => batch.delete(commentDoc.ref));
    }
    for (const reactionDoc of reactionsSnap.docs) {
      await writer.queue((batch) => batch.delete(reactionDoc.ref));
    }
    await writer.queue((batch) => batch.delete(postDoc.ref));
    feedPostsDeleted += 1;
  }

  for (const notificationDoc of notificationsSnap.docs) {
    await writer.queue((batch) => batch.delete(notificationDoc.ref));
  }

  for (const historyDoc of handicapHistorySnap.docs) {
    await writer.queue((batch) => batch.delete(historyDoc.ref));
  }

  const existingStandingIds = new Set(
    shouldRebuildSeason ? previousStandings.map((standing) => standing.id) : []
  );
  const rebuiltStandingIds = new Set(standings.map((standing) => standing.id));
  const affectedMemberIds = new Set<string>(
    shouldRebuildSeason
      ? [
          ...previousStandings.map((standing) => standing.memberId),
          ...standings.map((standing) => standing.memberId),
        ]
      : []
  );

  for (const standing of standings) {
    const member = membersById.get(standing.memberId);
    const averageStableford = getAverageStableford(standing.roundResults);
    const { bestStableford, bestRoundId } = getBestStableford(
      standing.roundResults
    );
    const hadDeletedRoundHandicapMovement = deletedRoundHandicapBase.has(
      standing.memberId
    );
    const baseHandicap =
      deletedRoundHandicapBase.get(standing.memberId) ??
      member?.currentHandicap ??
      0;
    const { nextHandicap } = hadDeletedRoundHandicapMovement
      ? calculateNextHandicap(baseHandicap, standing.roundResults)
      : { nextHandicap: baseHandicap };

    await writer.queue((batch) =>
      batch.set(
        doc(db, "seasonStandings", standing.id),
        {
          ...standing,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    );
    await writer.queue((batch) =>
      batch.set(
        doc(db, "members", standing.memberId),
        {
          userId: standing.memberId,
          groupId: round.groupId,
          displayName: standing.memberName,
          avatarUrl: member?.avatarUrl ?? null,
          currentHandicap: nextHandicap,
          seasonYear: round.season,
          seasonPoints: standing.totalPoints,
          seasonRank: standing.currentRank,
          roundsPlayed: standing.roundsPlayed,
          ntpWins: standing.ntpWinsSeason,
          ldWins: standing.ldWinsSeason,
          t2Wins: standing.t2WinsSeason,
          t3Wins: standing.t3WinsSeason,
          avgStableford: averageStableford,
          bestStableford,
          bestRoundId,
          updatedAt: serverTimestamp(),
          ...(member ? {} : { createdAt: serverTimestamp() }),
        },
        { merge: true }
      )
    );
  }

  for (const standingId of Array.from(existingStandingIds)) {
    if (!rebuiltStandingIds.has(standingId)) {
      await writer.queue((batch) =>
        batch.delete(doc(db, "seasonStandings", standingId))
      );
    }
  }

  for (const memberId of Array.from(affectedMemberIds)) {
    if (standingsByMemberId.has(memberId)) continue;
    const member = membersById.get(memberId);
    const fallbackHandicap =
      deletedRoundHandicapBase.get(memberId) ?? member?.currentHandicap ?? 0;
    await writer.queue((batch) =>
      batch.set(
        doc(db, "members", memberId),
        {
          currentHandicap: fallbackHandicap,
          seasonYear: round.season,
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
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    );
  }

  await writer.queue((batch) => batch.delete(doc(db, "rounds", round.id)));
  await writer.commit();

  return {
    deleted: true,
    scorecardsDeleted: scorecardsSnap.size,
    holeScoresDeleted,
    resultsDeleted: resultsSnap.exists() ? 1 : 0,
    feedPostsDeleted,
    notificationsDeleted: notificationsSnap.size,
    handicapHistoryDeleted: handicapHistorySnap.size,
    standingsRebuilt: standings.length,
  };
};

export const getNextRound = async (groupId: string): Promise<Round | null> => {
  const now = new Date();
  const rounds = await getRounds(groupId);
  const upcomingRounds = rounds
    .filter((round) => round.status === "upcoming" && round.date >= now)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return upcomingRounds[0] ?? null;
};

export const getLiveRound = async (groupId: string): Promise<Round | null> => {
  const q = query(
    collection(db, "rounds"),
    where("groupId", "==", groupId),
    where("status", "==", "live")
  );
  const snap = await getDocsFromServer(q);
  if (snap.empty) return null;
  return snap.docs
    .map(mapRound)
    .sort((a, b) => {
      if (a.roundNumber !== b.roundNumber) {
        return b.roundNumber - a.roundNumber;
      }
      return b.date.getTime() - a.date.getTime();
    })[0];
};

// ─── Scorecards & Hole Scores ────────────────────────────────────────────────

export const createScorecard = async (
  data: Omit<Scorecard, "id" | "createdAt" | "updatedAt">
): Promise<string> => {
  const ref = await addDoc(collection(db, "scorecards"), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
};

const mapScorecard = (
  d: QueryDocumentSnapshot<DocumentData>
): Scorecard => {
  const data = d.data();
  return {
    id: d.id,
    ...data,
    submittedAt: data.submittedAt ? toDate(data.submittedAt) : null,
    adminEditedAt: data.adminEditedAt ? toDate(data.adminEditedAt) : null,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  } as Scorecard;
};

export const getScorecardForPlayer = async (
  roundId: string,
  playerId: string,
  groupId?: string
): Promise<Scorecard | null> => {
  const q = query(
    collection(db, "scorecards"),
    where("roundId", "==", roundId),
    where("playerId", "==", playerId),
    ...(groupId ? [where("groupId", "==", groupId)] : []),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return mapScorecard(d);
};

export const getScorecardForMarker = async (
  roundId: string,
  markerId: string,
  groupId?: string
): Promise<Scorecard | null> => {
  const q = query(
    collection(db, "scorecards"),
    where("roundId", "==", roundId),
    where("markerId", "==", markerId),
    ...(groupId ? [where("groupId", "==", groupId)] : []),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return mapScorecard(d);
};

export const getScorecardsForRound = async (
  roundId: string
): Promise<Scorecard[]> => {
  const q = query(collection(db, "scorecards"), where("roundId", "==", roundId));
  const snap = await getDocs(q);
  return snap.docs.map(mapScorecard);
};

export const updateScorecard = async (
  scorecardId: string,
  data: Partial<Scorecard>
) => {
  await updateDoc(doc(db, "scorecards", scorecardId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
};

export const getHoleScores = async (
  scorecardId: string
): Promise<HoleScore[]> => {
  const q = query(
    collection(db, "scorecards", scorecardId, "holeScores"),
    orderBy("holeNumber", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      holeNumber: data.holeNumber,
      par: data.par,
      strokeIndex: data.strokeIndex,
      distanceMeters:
        typeof data.distanceMeters === "number" ? data.distanceMeters : undefined,
      strokesReceived: data.strokesReceived,
      grossScore:
        typeof data.grossScore === "number" ? data.grossScore : null,
      netScore: typeof data.netScore === "number" ? data.netScore : null,
      stablefordPoints:
        typeof data.stablefordPoints === "number"
          ? data.stablefordPoints
          : null,
      isNTP: !!data.isNTP,
      isLD: !!data.isLD,
      isT2: !!data.isT2,
      isT3: !!data.isT3,
      savedAt: data.savedAt ? toDate(data.savedAt) : null,
    } as HoleScore;
  });
};

export const setHoleScore = async (
  scorecardId: string,
  holeNumber: number,
  data: Omit<HoleScore, "holeNumber" | "savedAt">
) => {
  await setDoc(
    doc(db, "scorecards", scorecardId, "holeScores", String(holeNumber)),
    {
      holeNumber,
      ...data,
      savedAt: serverTimestamp(),
    },
    { merge: true }
  );
};

// ─── Results ────────────────────────────────────────────────────────────────

const mapResults = (
  d: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>
): Results => {
  const data = d.data() ?? {};
  return {
    id: d.id,
    ...data,
    publishedAt: toDate(data.publishedAt),
    createdAt: toDate(data.createdAt),
  } as Results;
};

export const getResultsForRound = async (
  roundId: string
): Promise<Results | null> => {
  const snap = await getDoc(doc(db, "results", roundId));
  if (!snap.exists()) return null;
  return mapResults(snap);
};

export const getResultsForSeason = async (
  groupId: string,
  season: number
): Promise<Results[]> => {
  const q = query(
    collection(db, "results"),
    where("groupId", "==", groupId),
    where("season", "==", season)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(mapResults)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
};

export const publishRoundResults = async (
  roundId: string,
  data: Omit<Results, "id" | "createdAt">
) => {
  await setDoc(doc(db, "results", roundId), {
    ...data,
    createdAt: serverTimestamp(),
  });
};

export const publishRoundResultsWithStage3 = async ({
  round,
  results,
  scorecards,
  activeUsers,
  publishedBy,
}: {
  round: Round;
  results: Omit<Results, "id" | "createdAt">;
  scorecards: Scorecard[];
  activeUsers: AppUser[];
  publishedBy: AppUser | null;
}) => {
  const publishedAt = results.publishedAt;
  const [seasonResults, previousStandings, groupMembers] =
    await Promise.all([
      getResultsForSeason(round.groupId, round.season),
      getSeasonStandings(round.groupId, round.season),
      getMembersForGroup(round.groupId),
    ]);

  const officialResults: Results = {
    id: round.id,
    ...results,
    createdAt: publishedAt,
  };
  const allSeasonResults = [
    officialResults,
    ...seasonResults.filter((result) => result.roundId !== round.id),
  ];
  const roundEntries = await Promise.all(
    allSeasonResults.map(async (result) => {
      if (result.roundId === round.id) return [result.roundId, round] as const;
      const resultRound = await getRound(result.roundId);
      return [result.roundId, resultRound ?? round] as const;
    })
  );
  const roundsById = new Map(roundEntries);
  const standings = buildSeasonStandings({
    groupId: round.groupId,
    season: round.season,
    results: allSeasonResults,
    roundsById,
    previousStandings,
    updatedAt: publishedAt,
  });
  const usersById = new Map(activeUsers.map((user) => [user.uid, user]));
  const membersById = new Map(groupMembers.map((member) => [member.id, member]));
  const batch = writeBatch(db);
  const winner = officialResults.rankings[0];
  const author = publishedBy ?? activeUsers.find((user) => user.role === "admin");
  const resultsPostId = `${round.id}_results`;

  batch.set(doc(db, "results", round.id), {
    ...results,
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, "rounds", round.id), {
    resultsPublished: true,
    resultsPublishedAt: publishedAt,
    status: "completed",
    updatedAt: serverTimestamp(),
  });
  scorecards.forEach((card) => {
    batch.update(doc(db, "scorecards", card.id), {
      status: "admin_locked",
      signedOff: true,
      updatedAt: serverTimestamp(),
    });
  });
  batch.set(doc(db, "posts", resultsPostId), {
    groupId: round.groupId,
    authorId: author?.uid ?? "system",
    authorName: author?.displayName ?? "GolfCaddy",
    authorAvatarUrl: author?.avatarUrl ?? null,
    type: "round_linked",
    content: winner
      ? `Round ${round.roundNumber} results are official. ${winner.playerName} leads the table at ${round.courseName}.`
      : `Round ${round.roundNumber} results are official for ${round.courseName}.`,
    roundId: round.id,
    pinned: false,
    photoUrls: [],
    reactionCounts: {},
    commentCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  standings.forEach((standing) => {
    const member = membersById.get(standing.memberId);
    const user = usersById.get(standing.memberId);
    const averageStableford = getAverageStableford(standing.roundResults);
    const { bestStableford, bestRoundId } = getBestStableford(
      standing.roundResults
    );
    const currentHandicap =
      member?.currentHandicap ??
      officialResults.rankings.find(
        (ranking) => ranking.playerId === standing.memberId
      )?.handicap ??
      0;
    const { nextHandicap, reason } = calculateNextHandicap(
      currentHandicap,
      standing.roundResults
    );
    const memberRef = doc(db, "members", standing.memberId);
    const memberStats = {
      userId: standing.memberId,
      groupId: round.groupId,
      displayName: standing.memberName,
      avatarUrl: user?.avatarUrl ?? member?.avatarUrl ?? null,
      currentHandicap: nextHandicap,
      seasonYear: round.season,
      seasonPoints: standing.totalPoints,
      seasonRank: standing.currentRank,
      roundsPlayed: standing.roundsPlayed,
      ntpWins: standing.ntpWinsSeason,
      ldWins: standing.ldWinsSeason,
      t2Wins: standing.t2WinsSeason,
      t3Wins: standing.t3WinsSeason,
      avgStableford: averageStableford,
      bestStableford,
      bestRoundId,
      updatedAt: serverTimestamp(),
      ...(member ? {} : { createdAt: serverTimestamp() }),
    };

    batch.set(
      doc(db, "seasonStandings", standing.id),
      {
        ...standing,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    batch.set(
      memberRef,
      memberStats,
      { merge: true }
    );

    if (nextHandicap !== currentHandicap) {
      batch.set(doc(db, "handicapHistory", `${round.id}_${standing.memberId}`), {
        groupId: round.groupId,
        memberId: standing.memberId,
        memberName: standing.memberName,
        roundId: round.id,
        season: round.season,
        previousHandicap: currentHandicap,
        newHandicap: nextHandicap,
        reason,
        source: "published_round",
        changedBy: author?.uid ?? null,
        changedByName: author?.displayName ?? null,
        createdAt: serverTimestamp(),
      });
      batch.set(doc(db, "notifications", `${round.id}_handicap_${standing.memberId}`), {
        recipientId: standing.memberId,
        groupId: round.groupId,
        type: "handicap_updated",
        title: "Handicap updated",
        body: `Your handicap moved from ${currentHandicap} to ${nextHandicap}.`,
        deepLink: "/profile",
        read: false,
        roundId: round.id,
        postId: null,
        createdAt: serverTimestamp(),
      });
    }
  });

  activeUsers.forEach((user) => {
    batch.set(doc(db, "notifications", `${round.id}_results_${user.uid}`), {
      recipientId: user.uid,
      groupId: round.groupId,
      type: "results_published",
      title: "Results published",
      body: `Round ${round.roundNumber} results are official for ${round.courseName}.`,
      deepLink: `/rounds/${round.id}`,
      read: false,
      roundId: round.id,
      postId: resultsPostId,
      createdAt: serverTimestamp(),
    });
  });

  await batch.commit();

  return { officialResults, standings };
};

// ─── Season Standings ───────────────────────────────────────────────────────

const mapSeasonStanding = (
  d: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>
): SeasonStanding => {
  const data = d.data() ?? {};
  return {
    id: d.id,
    ...data,
    roundResults: (data.roundResults ?? []).map(
      (roundResult: DocumentData) => ({
        ...roundResult,
        date: toDate(roundResult.date),
      })
    ),
    updatedAt: toDate(data.updatedAt),
  } as SeasonStanding;
};

export const getSeasonStandings = async (
  groupId: string,
  season: number
): Promise<SeasonStanding[]> => {
  const q = query(
    collection(db, "seasonStandings"),
    where("groupId", "==", groupId),
    where("season", "==", season)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(mapSeasonStanding)
    .sort((a, b) => a.currentRank - b.currentRank);
};

export const getSeasonStandingForMember = async (
  groupId: string,
  season: number,
  memberId: string
): Promise<SeasonStanding | null> => {
  const snap = await getDoc(
    doc(db, "seasonStandings", getSeasonStandingId(groupId, season, memberId))
  );
  if (!snap.exists()) return null;
  return mapSeasonStanding(snap);
};

// ─── Posts & Feed ───────────────────────────────────────────────────────────

const mapPost = (
  d: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>
): Post => {
  const data = d.data() ?? {};
  return {
    id: d.id,
    ...data,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  } as Post;
};

export const getFeedPosts = async (
  groupId: string,
  limitCount = 20
): Promise<Post[]> => {
  const q = query(
    collection(db, "posts"),
    where("groupId", "==", groupId)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(mapPost)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limitCount);
};

// ─── Notifications ───────────────────────────────────────────────────────────

export const getNotifications = async (
  userId: string,
  limitCount = 20
): Promise<AppNotification[]> => {
  const q = query(
    collection(db, "notifications"),
    where("recipientId", "==", userId),
    orderBy("createdAt", "desc"),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      createdAt: toDate(data.createdAt),
    } as AppNotification;
  });
};

export const markNotificationRead = async (notificationId: string) => {
  await updateDoc(doc(db, "notifications", notificationId), { read: true });
};
