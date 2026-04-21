import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  writeBatch,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  onSnapshot,
  runTransaction,
  QueryDocumentSnapshot,
  DocumentSnapshot,
  DocumentData,
  WriteBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import type {
  AppUser,
  Member,
  MemberInvite,
  Round,
  Group,
  AppNotification,
  Scorecard,
  HoleScore,
  Results,
  SeasonStanding,
  Post,
  RoundRsvp,
  RoundRsvpStatus,
  SideClaim,
  SidePrizeType,
  GroupSettings,
  UserRole,
  UserStatus,
  PostReaction,
  PostReactionType,
  PostComment,
} from "@/types";
import {
  buildSeasonStandings,
  calculateNextHandicap,
  getAverageStableford,
  getBestStableford,
  getSeasonStandingId,
} from "./season";
import { withSeededCourseData } from "./courseData";
import { normaliseGroupSettings } from "./settings";

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
          guestNames: Array.isArray(teeTime.guestNames)
            ? teeTime.guestNames
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
    availableTeeSets: Array.isArray(data.availableTeeSets)
      ? data.availableTeeSets
      : [],
    playerTeeAssignments:
      data.playerTeeAssignments &&
      typeof data.playerTeeAssignments === "object"
        ? data.playerTeeAssignments
        : {},
    courseSource: data.courseSource ?? null,
    rsvpOpen: data.rsvpOpen ?? false,
    rsvpNotifiedAt: data.rsvpNotifiedAt
      ? toDate(data.rsvpNotifiedAt)
      : null,
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
    avatarUrl: data.avatarUrl ?? null,
    avatarPath: data.avatarPath ?? null,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  } as AppUser;
};

export const subscribeUser = (
  uid: string,
  onChange: (user: AppUser | null) => void,
  onError?: (error: Error) => void
) =>
  onSnapshot(
    doc(db, "users", uid),
    (snap) => {
      if (!snap.exists()) {
        onChange(null);
        return;
      }

      const data = snap.data();
      onChange({
        uid: snap.id,
        ...data,
        avatarUrl: data.avatarUrl ?? null,
        avatarPath: data.avatarPath ?? null,
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
      } as AppUser);
    },
    onError
  );

export const updateUser = async (uid: string, data: Partial<AppUser>) => {
  await updateDoc(doc(db, "users", uid), {
    ...data,
    updatedAt: serverTimestamp(),
  });

  if ("displayName" in data || "avatarUrl" in data) {
    const memberRef = doc(db, "members", uid);
    const memberSnap = await getDoc(memberRef);
    if (memberSnap.exists()) {
      await updateDoc(memberRef, {
        ...(data.displayName !== undefined
          ? { displayName: data.displayName }
          : {}),
        ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
        updatedAt: serverTimestamp(),
      });
    }
  }
};

// ─── Group ───────────────────────────────────────────────────────────────────

const FOURPLAY_GROUP_ID = "fourplay";

export const getGroup = async (
  groupId = FOURPLAY_GROUP_ID
): Promise<Group | null> => {
  const snap = await getDoc(doc(db, "groups", groupId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    id: snap.id,
    ...data,
    logoUrl: data.logoUrl ?? null,
    logoPath: data.logoPath ?? null,
    settings: normaliseGroupSettings(data.settings),
  } as Group;
};

export const subscribeGroup = (
  groupId: string,
  onChange: (group: Group | null) => void,
  onError?: (error: Error) => void
) =>
  onSnapshot(
    doc(db, "groups", groupId),
    (snap) => onChange(snap.exists() ? ({
      id: snap.id,
      ...snap.data(),
      logoUrl: snap.data()?.logoUrl ?? null,
      logoPath: snap.data()?.logoPath ?? null,
      settings: normaliseGroupSettings(snap.data()?.settings),
    } as Group) : null),
    onError
  );

export const updateGroupProfile = async ({
  groupId,
  name,
  logoUrl,
  logoPath,
}: {
  groupId: string;
  name: string;
  logoUrl: string | null;
  logoPath: string | null;
}) => {
  await setDoc(
    doc(db, "groups", groupId),
    {
      name,
      logoUrl,
      logoPath,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
};

export const updateGroupSettings = async (
  groupId: string,
  settings: GroupSettings
) => {
  await setDoc(
    doc(db, "groups", groupId),
    {
      settings: normaliseGroupSettings(settings),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
};

export const updateGroupCurrentSeason = async (
  groupId: string,
  currentSeason: number
) => {
  await setDoc(
    doc(db, "groups", groupId),
    {
      currentSeason,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
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

export const subscribeMember = (
  userId: string,
  onChange: (member: Member | null) => void,
  onError?: (error: Error) => void
) =>
  onSnapshot(
    doc(db, "members", userId),
    (snap) => onChange(snap.exists() ? mapMember(snap) : null),
    onError
  );

export const getMembersForGroup = async (
  groupId: string
): Promise<Member[]> => {
  const q = query(collection(db, "members"), where("groupId", "==", groupId));
  const snap = await getDocs(q);
  return snap.docs.map(mapMember);
};

export const subscribeMembersForGroup = (
  groupId: string,
  onChange: (members: Member[]) => void,
  onError?: (error: Error) => void
) => {
  const q = query(collection(db, "members"), where("groupId", "==", groupId));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map(mapMember)),
    onError
  );
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

export const getPendingMembers = async (
  groupId = FOURPLAY_GROUP_ID
): Promise<AppUser[]> => {
  return getUsersByStatus(groupId, "pending", "createdAt");
};

const mapMemberInvite = (
  d: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>
): MemberInvite => {
  const data = d.data() ?? {};
  return {
    id: d.id,
    ...data,
    contact: data.contact ?? null,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  } as MemberInvite;
};

export const createMemberInvite = async ({
  group,
  inviteeName,
  contact,
  createdBy,
}: {
  group: Group;
  inviteeName: string;
  contact: string | null;
  createdBy: AppUser;
}) => {
  const token =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const inviteRef = await addDoc(collection(db, "memberInvites"), {
    groupId: group.id,
    groupName: group.name,
    inviteeName,
    contact,
    token,
    status: "created",
    createdBy: createdBy.uid,
    createdByName: createdBy.displayName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    id: inviteRef.id,
    groupId: group.id,
    groupName: group.name,
    inviteeName,
    contact,
    token,
    status: "created",
    createdBy: createdBy.uid,
    createdByName: createdBy.displayName,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as MemberInvite;
};

export const getMemberInvitesForGroup = async (
  groupId: string
): Promise<MemberInvite[]> => {
  const q = query(
    collection(db, "memberInvites"),
    where("groupId", "==", groupId)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(mapMemberInvite)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
};

export const getActiveMembers = async (
  groupId = FOURPLAY_GROUP_ID
): Promise<AppUser[]> => {
  return getUsersByStatus(groupId, "active", "displayName");
};

export const getRetiredMembers = async (
  groupId = FOURPLAY_GROUP_ID
): Promise<AppUser[]> => {
  return getUsersByStatus(groupId, "retired", "displayName");
};

export const getSuspendedMembers = async (
  groupId = FOURPLAY_GROUP_ID
): Promise<AppUser[]> => {
  return getUsersByStatus(groupId, "suspended", "displayName");
};

function mapUser(
  d: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>
) {
  const data = d.data() ?? {};
  return {
    uid: d.id,
    ...data,
    avatarUrl: data.avatarUrl ?? null,
    avatarPath: data.avatarPath ?? null,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  } as AppUser;
}

async function getUsersByStatus(
  groupId: string,
  status: UserStatus,
  sortBy: "createdAt" | "displayName" = "displayName"
) {
  const q = query(
    collection(db, "users"),
    where("status", "==", status),
    where("groupId", "==", groupId)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(mapUser)
    .sort((a, b) =>
      sortBy === "createdAt"
        ? b.createdAt.getTime() - a.createdAt.getTime()
        : a.displayName.localeCompare(b.displayName)
    );
}

export const subscribeActiveMembers = (
  groupId: string,
  onChange: (members: AppUser[]) => void,
  onError?: (error: Error) => void
) => {
  const q = query(
    collection(db, "users"),
    where("status", "==", "active"),
    where("groupId", "==", groupId)
  );
  return onSnapshot(
    q,
    (snap) =>
      onChange(
        snap.docs
          .map(mapUser)
          .sort((a, b) => a.displayName.localeCompare(b.displayName))
      ),
    onError
  );
};

export const approveMember = async (uid: string, role: UserRole = "member") => {
  await updateDoc(doc(db, "users", uid), {
    role,
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

export const subscribeRoundsForGroup = (
  groupId: string,
  onChange: (rounds: Round[]) => void,
  onError?: (error: Error) => void
) => {
  const q = query(collection(db, "rounds"), where("groupId", "==", groupId));
  return onSnapshot(
    q,
    (snap) =>
      onChange(
        snap.docs
          .map(mapRound)
          .sort((a, b) => {
            if (a.roundNumber !== b.roundNumber) {
              return b.roundNumber - a.roundNumber;
            }
            return b.date.getTime() - a.date.getTime();
          })
      ),
    onError
  );
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

const mapRoundRsvp = (
  d: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>
): RoundRsvp => {
  const data = d.data() ?? {};
  return {
    id: d.id,
    ...data,
    respondedAt: data.respondedAt ? toDate(data.respondedAt) : null,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  } as RoundRsvp;
};

export const getRoundRsvps = async (roundId: string): Promise<RoundRsvp[]> => {
  const snap = await getDocs(collection(db, "rounds", roundId, "rsvps"));
  return snap.docs.map(mapRoundRsvp);
};

export const subscribeRoundRsvps = (
  roundId: string,
  onChange: (rsvps: RoundRsvp[]) => void,
  onError?: (error: Error) => void
) =>
  onSnapshot(
    collection(db, "rounds", roundId, "rsvps"),
    (snap) => onChange(snap.docs.map(mapRoundRsvp)),
    onError
  );

export const getRoundRsvp = async (
  roundId: string,
  memberId: string
): Promise<RoundRsvp | null> => {
  const snap = await getDoc(doc(db, "rounds", roundId, "rsvps", memberId));
  if (!snap.exists()) return null;
  return mapRoundRsvp(snap);
};

export const subscribeRoundRsvp = (
  roundId: string,
  memberId: string,
  onChange: (rsvp: RoundRsvp | null) => void,
  onError?: (error: Error) => void
) =>
  onSnapshot(
    doc(db, "rounds", roundId, "rsvps", memberId),
    (snap) => onChange(snap.exists() ? mapRoundRsvp(snap) : null),
    onError
  );

export const setRoundRsvp = async ({
  round,
  member,
  status,
}: {
  round: Round;
  member: AppUser;
  status: Exclude<RoundRsvpStatus, "pending">;
}) => {
  const ref = doc(db, "rounds", round.id, "rsvps", member.uid);
  const existing = await getDoc(ref);
  await setDoc(
    ref,
    {
      roundId: round.id,
      groupId: round.groupId,
      memberId: member.uid,
      memberName: member.displayName,
      status,
      respondedAt: serverTimestamp(),
      createdAt: existing.exists()
        ? existing.data().createdAt ?? serverTimestamp()
        : serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
};

export const notifyRoundPlayers = async ({
  round,
  activeUsers,
  mode,
}: {
  round: Round;
  activeUsers: AppUser[];
  mode: "created" | "updated";
}) => {
  const existingRsvps = await getRoundRsvps(round.id);
  const existingRsvpIds = new Set(existingRsvps.map((rsvp) => rsvp.memberId));
  const batch = writeBatch(db);
  const notificationBaseId = `${round.id}_${mode}_${Date.now()}`;
  const title =
    mode === "created" ? "New round available" : "Round details updated";
  const body =
    mode === "created"
      ? `Round ${round.roundNumber} is now available at ${round.courseName}. RSVP now.`
      : `Round ${round.roundNumber} details have been updated. Please check tee times and groups.`;

  batch.update(doc(db, "rounds", round.id), {
    rsvpOpen: true,
    rsvpNotifiedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  activeUsers.forEach((user) => {
    if (!existingRsvpIds.has(user.uid)) {
      batch.set(doc(db, "rounds", round.id, "rsvps", user.uid), {
        roundId: round.id,
        groupId: round.groupId,
        memberId: user.uid,
        memberName: user.displayName,
        status: "pending",
        respondedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    batch.set(doc(db, "notifications", `${notificationBaseId}_${user.uid}`), {
      recipientId: user.uid,
      groupId: round.groupId,
      type: mode === "created" ? "round_announced" : "tee_times_published",
      title,
      body,
      deepLink: `/rounds/${round.id}`,
      read: false,
      roundId: round.id,
      postId: null,
      createdAt: serverTimestamp(),
    });
  });

  await batch.commit();
};

const mapSideClaim = (
  d: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>
): SideClaim => {
  const data = d.data() ?? {};
  return {
    id: d.id,
    ...data,
    updatedAt: toDate(data.updatedAt),
    createdAt: toDate(data.createdAt),
  } as SideClaim;
};

export const getSideClaimsForRound = async (
  roundId: string
): Promise<SideClaim[]> => {
  const snap = await getDocs(collection(db, "rounds", roundId, "sideClaims"));
  return snap.docs.map(mapSideClaim);
};

export const subscribeSideClaimsForRound = (
  roundId: string,
  onChange: (claims: SideClaim[]) => void,
  onError?: (error: Error) => void
) =>
  onSnapshot(
    collection(db, "rounds", roundId, "sideClaims"),
    (snap) => onChange(snap.docs.map(mapSideClaim)),
    onError
  );

export const setSideClaim = async ({
  round,
  prizeType,
  holeNumber,
  winnerId,
  updatedBy,
  members,
}: {
  round: Round;
  prizeType: SidePrizeType;
  holeNumber: number;
  winnerId: string;
  updatedBy: AppUser;
  members: AppUser[];
}) => {
  if (round.resultsPublished) {
    throw new Error("Side prize claims are locked after results are published.");
  }

  const claimId = prizeType === "ntp" ? `ntp-${holeNumber}` : prizeType;
  const ref = doc(db, "rounds", round.id, "sideClaims", claimId);
  const existing = await getDoc(ref);
  const winner = members.find((member) => member.uid === winnerId) ?? null;

  await setDoc(
    ref,
    {
      roundId: round.id,
      groupId: round.groupId,
      prizeType,
      holeNumber,
      winnerId: winner?.uid ?? null,
      winnerName: winner?.displayName ?? null,
      updatedBy: updatedBy.uid,
      updatedByName: updatedBy.displayName,
      updatedAt: serverTimestamp(),
      createdAt: existing.exists()
        ? existing.data().createdAt ?? serverTimestamp()
        : serverTimestamp(),
    },
    { merge: true }
  );
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
      rsvpsDeleted: 0,
      sideClaimsDeleted: 0,
      handicapHistoryDeleted: 0,
      standingsRebuilt: 0,
    };
  }

  const [
    scorecardsSnap,
    resultsSnap,
    postsSnap,
    notificationsSnap,
    rsvpsSnap,
    sideClaimsSnap,
    handicapHistorySnap,
  ] = await Promise.all([
    getDocs(query(collection(db, "scorecards"), where("roundId", "==", round.id))),
    getDoc(doc(db, "results", round.id)),
    getDocs(query(collection(db, "posts"), where("roundId", "==", round.id))),
    getDocs(
      query(collection(db, "notifications"), where("roundId", "==", round.id))
    ),
    getDocs(collection(db, "rounds", round.id, "rsvps")),
    getDocs(collection(db, "rounds", round.id, "sideClaims")),
    getDocs(
      query(collection(db, "handicapHistory"), where("roundId", "==", round.id))
    ),
  ]);
  const shouldRebuildSeason = resultsSnap.exists();
  const [seasonResults, previousStandings, groupMembers, group] = shouldRebuildSeason
    ? await Promise.all([
        getResultsForSeason(round.groupId, round.season),
        getSeasonStandings(round.groupId, round.season),
        getMembersForGroup(round.groupId),
        getGroup(round.groupId),
      ])
    : [[], [], [], null];
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
        settings: group?.settings,
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

  for (const rsvpDoc of rsvpsSnap.docs) {
    await writer.queue((batch) => batch.delete(rsvpDoc.ref));
  }

  for (const sideClaimDoc of sideClaimsSnap.docs) {
    await writer.queue((batch) => batch.delete(sideClaimDoc.ref));
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
    rsvpsDeleted: rsvpsSnap.size,
    sideClaimsDeleted: sideClaimsSnap.size,
    handicapHistoryDeleted: handicapHistorySnap.size,
    standingsRebuilt: standings.length,
  };
};

export const getNextRound = async (groupId: string): Promise<Round | null> => {
  const rounds = await getRounds(groupId);
  const upcomingRounds = rounds
    .filter((round) => round.status === "upcoming")
    .sort((a, b) => {
      if (a.roundNumber !== b.roundNumber) {
        return a.roundNumber - b.roundNumber;
      }
      return a.date.getTime() - b.date.getTime();
    });

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
  d: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>
): Scorecard => {
  const data = d.data() ?? {};
  return {
    id: d.id,
    ...data,
    teeSetId: data.teeSetId ?? null,
    teeSetName: data.teeSetName ?? null,
    coursePar: data.coursePar ?? null,
    courseRating: data.courseRating ?? null,
    slopeRating: data.slopeRating ?? null,
    courseHoles: Array.isArray(data.courseHoles) ? data.courseHoles : [],
    submittedAt: data.submittedAt ? toDate(data.submittedAt) : null,
    adminEditedAt: data.adminEditedAt ? toDate(data.adminEditedAt) : null,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  } as Scorecard;
};

const mapHoleScore = (
  d: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>
): HoleScore => {
  const data = d.data() ?? {};
  return {
    holeNumber: data.holeNumber,
    par: data.par,
    strokeIndex: data.strokeIndex,
    distanceMeters:
      typeof data.distanceMeters === "number" ? data.distanceMeters : undefined,
    strokesReceived: data.strokesReceived,
    grossScore: typeof data.grossScore === "number" ? data.grossScore : null,
    netScore: typeof data.netScore === "number" ? data.netScore : null,
    stablefordPoints:
      typeof data.stablefordPoints === "number" ? data.stablefordPoints : null,
    isNTP: !!data.isNTP,
    isLD: !!data.isLD,
    isT2: !!data.isT2,
    isT3: !!data.isT3,
    savedAt: data.savedAt ? toDate(data.savedAt) : null,
  } as HoleScore;
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

export const subscribeRound = (
  roundId: string,
  onChange: (round: Round | null) => void,
  onError?: (error: Error) => void
) =>
  onSnapshot(
    doc(db, "rounds", roundId),
    (snap) => onChange(snap.exists() ? mapRound(snap) : null),
    onError
  );

export const subscribeScorecardForMarker = (
  roundId: string,
  markerId: string,
  onChange: (scorecard: Scorecard | null) => void,
  options?: { groupId?: string; onError?: (error: Error) => void }
) => {
  const q = query(
    collection(db, "scorecards"),
    where("roundId", "==", roundId),
    where("markerId", "==", markerId),
    ...(options?.groupId ? [where("groupId", "==", options.groupId)] : []),
    limit(1)
  );

  return onSnapshot(
    q,
    (snap) => onChange(snap.empty ? null : mapScorecard(snap.docs[0])),
    options?.onError
  );
};

export const getScorecardsForRound = async (
  roundId: string
): Promise<Scorecard[]> => {
  const q = query(collection(db, "scorecards"), where("roundId", "==", roundId));
  const snap = await getDocs(q);
  return snap.docs.map(mapScorecard);
};

export const subscribeScorecardsForRound = (
  roundId: string,
  onChange: (scorecards: Scorecard[]) => void,
  onError?: (error: Error) => void
) => {
  const q = query(collection(db, "scorecards"), where("roundId", "==", roundId));
  return onSnapshot(q, (snap) => onChange(snap.docs.map(mapScorecard)), onError);
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
  return snap.docs.map(mapHoleScore);
};

export const subscribeHoleScores = (
  scorecardId: string,
  onChange: (scores: HoleScore[]) => void,
  onError?: (error: Error) => void
) => {
  const q = query(
    collection(db, "scorecards", scorecardId, "holeScores"),
    orderBy("holeNumber", "asc")
  );
  return onSnapshot(q, (snap) => onChange(snap.docs.map(mapHoleScore)), onError);
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

export const subscribeResultsForRound = (
  roundId: string,
  onChange: (results: Results | null) => void,
  onError?: (error: Error) => void
) =>
  onSnapshot(
    doc(db, "results", roundId),
    (snap) => onChange(snap.exists() ? mapResults(snap) : null),
    onError
  );

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
  const [seasonResults, previousStandings, groupMembers, group] =
    await Promise.all([
      getResultsForSeason(round.groupId, round.season),
      getSeasonStandings(round.groupId, round.season),
      getMembersForGroup(round.groupId),
      getGroup(round.groupId),
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
    settings: group?.settings,
  });
  const usersById = new Map(activeUsers.map((user) => [user.uid, user]));
  const membersById = new Map(groupMembers.map((member) => [member.id, member]));
  const batch = writeBatch(db);
  const author = publishedBy ?? activeUsers.find((user) => user.role === "admin");
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
      standing.roundResults,
      group?.settings.handicapRoundsWindow ?? 3
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
      postId: null,
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
    grossSeasonPoints:
      typeof data.grossSeasonPoints === "number"
        ? data.grossSeasonPoints
        : data.totalPoints ?? 0,
    roundResults: (data.roundResults ?? []).map(
      (roundResult: DocumentData) => ({
        ...roundResult,
        date: toDate(roundResult.date),
        countsForSeason: roundResult.countsForSeason ?? true,
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

export const subscribeSeasonStandings = (
  groupId: string,
  season: number,
  onChange: (standings: SeasonStanding[]) => void,
  onError?: (error: Error) => void
) => {
  const q = query(
    collection(db, "seasonStandings"),
    where("groupId", "==", groupId),
    where("season", "==", season)
  );
  return onSnapshot(
    q,
    (snap) =>
      onChange(
        snap.docs.map(mapSeasonStanding).sort((a, b) => a.currentRank - b.currentRank)
      ),
    onError
  );
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

export const subscribeSeasonStandingForMember = (
  groupId: string,
  season: number,
  memberId: string,
  onChange: (standing: SeasonStanding | null) => void,
  onError?: (error: Error) => void
) =>
  onSnapshot(
    doc(db, "seasonStandings", getSeasonStandingId(groupId, season, memberId)),
    (snap) => onChange(snap.exists() ? mapSeasonStanding(snap) : null),
    onError
  );

// ─── Posts & Feed ───────────────────────────────────────────────────────────

const mapPost = (
  d: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>
): Post => {
  const data = d.data() ?? {};
  return {
    id: d.id,
    ...data,
    photoUrls: Array.isArray(data.photoUrls) ? data.photoUrls : [],
    photoPaths: Array.isArray(data.photoPaths) ? data.photoPaths : [],
    reactionCounts:
      data.reactionCounts && typeof data.reactionCounts === "object"
        ? data.reactionCounts
        : {},
    commentCount: typeof data.commentCount === "number" ? data.commentCount : 0,
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
    .filter((post) => post.type !== "round_linked")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limitCount);
};

export const subscribeFeedPosts = (
  groupId: string,
  onChange: (posts: Post[]) => void,
  options?: { limitCount?: number; onError?: (error: Error) => void }
) => {
  const q = query(collection(db, "posts"), where("groupId", "==", groupId));
  return onSnapshot(
    q,
    (snap) =>
      onChange(
        snap.docs
          .map(mapPost)
          .filter((post) => post.type !== "round_linked")
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, options?.limitCount ?? 20)
      ),
    options?.onError
  );
};

const mapPostReaction = (
  d: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>
): PostReaction => {
  const data = d.data() ?? {};
  return {
    id: d.id,
    ...data,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  } as PostReaction;
};

export const createFeedPost = async ({
  groupId,
  author,
  content,
  photoUrls = [],
  photoPaths = [],
}: {
  groupId: string;
  author: AppUser;
  content: string;
  photoUrls?: string[];
  photoPaths?: string[];
}) => {
  const trimmed = content.trim();
  if (!trimmed && photoUrls.length === 0) {
    throw new Error("Write something or attach at least one image.");
  }

  await addDoc(collection(db, "posts"), {
    groupId,
    authorId: author.uid,
    authorName: author.displayName,
    authorAvatarUrl: author.avatarUrl ?? null,
    type: "general",
    content: trimmed,
    roundId: null,
    pinned: false,
    photoUrls,
    photoPaths,
    reactionCounts: {},
    commentCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const updateFeedPost = async ({
  postId,
  content,
}: {
  postId: string;
  content: string;
}) => {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("Post content is required.");
  }

  await updateDoc(doc(db, "posts", postId), {
    content: trimmed,
    updatedAt: serverTimestamp(),
  });
};

export const deleteFeedPost = async (postId: string) => {
  await deleteDoc(doc(db, "posts", postId));
};

const mapPostComment = (
  d: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>
): PostComment => {
  const data = d.data() ?? {};
  return {
    id: d.id,
    ...data,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  } as PostComment;
};

export const subscribePostComments = (
  postId: string,
  onChange: (comments: PostComment[]) => void,
  onError?: (error: Error) => void
) =>
  onSnapshot(
    collection(db, "posts", postId, "comments"),
    (snap) =>
      onChange(
        snap.docs
          .map(mapPostComment)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      ),
    onError
  );

export const createPostComment = async ({
  post,
  author,
  content,
}: {
  post: Post;
  author: AppUser;
  content: string;
}) => {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("Reply cannot be empty.");
  }

  const postRef = doc(db, "posts", post.id);
  const commentRef = doc(collection(db, "posts", post.id, "comments"));
  const notificationRef =
    post.authorId !== author.uid
      ? doc(db, "notifications", `${post.id}_comment_${commentRef.id}`)
      : null;

  await runTransaction(db, async (transaction) => {
    const postSnap = await transaction.get(postRef);
    if (!postSnap.exists()) {
      throw new Error("Post not found.");
    }

    const currentPost = mapPost(postSnap);
    transaction.set(commentRef, {
      postId: post.id,
      groupId: post.groupId,
      authorId: author.uid,
      authorName: author.displayName,
      authorAvatarUrl: author.avatarUrl ?? null,
      content: trimmed,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    transaction.update(postRef, {
      commentCount: currentPost.commentCount + 1,
      updatedAt: serverTimestamp(),
    });

    if (notificationRef) {
      transaction.set(notificationRef, {
        recipientId: post.authorId,
        groupId: post.groupId,
        type: "new_comment",
        title: "New reply on your post",
        body: `${author.displayName} replied to your post.`,
        deepLink: "/feed",
        read: false,
        roundId: post.roundId,
        postId: post.id,
        createdAt: serverTimestamp(),
      });
    }
  });
};

function getReactionSummary(reactionType: PostReactionType) {
  switch (reactionType) {
    case "like":
      return "👍 liked";
    case "love":
      return "❤️ loved";
    case "laugh":
      return "😂 reacted";
    case "fire":
      return "🔥 reacted";
    case "dislike":
      return "👎 disliked";
    default:
      return "reacted to";
  }
}

export const subscribePostReaction = (
  postId: string,
  userId: string,
  onChange: (reaction: PostReaction | null) => void,
  onError?: (error: Error) => void
) =>
  onSnapshot(
    doc(db, "posts", postId, "reactions", userId),
    (snap) => onChange(snap.exists() ? mapPostReaction(snap) : null),
    onError
  );

export const setPostReaction = async ({
  post,
  user,
  reactionType,
}: {
  post: Post;
  user: AppUser;
  reactionType: PostReactionType | null;
}) => {
  const postRef = doc(db, "posts", post.id);
  const reactionRef = doc(db, "posts", post.id, "reactions", user.uid);
  const notificationRef =
    reactionType && post.authorId !== user.uid
      ? doc(collection(db, "notifications"))
      : null;

  await runTransaction(db, async (transaction) => {
    const [postSnap, reactionSnap] = await Promise.all([
      transaction.get(postRef),
      transaction.get(reactionRef),
    ]);

    if (!postSnap.exists()) {
      throw new Error("Post not found.");
    }

    const currentPost = mapPost(postSnap);
    const currentCounts = { ...(currentPost.reactionCounts ?? {}) };
    const previousReaction = reactionSnap.exists()
      ? mapPostReaction(reactionSnap).reactionType
      : null;

    if (previousReaction) {
      currentCounts[previousReaction] = Math.max(
        (currentCounts[previousReaction] ?? 1) - 1,
        0
      );
      if (currentCounts[previousReaction] === 0) {
        delete currentCounts[previousReaction];
      }
    }

    if (reactionType) {
      currentCounts[reactionType] = (currentCounts[reactionType] ?? 0) + 1;
      transaction.set(
        reactionRef,
        {
          postId: post.id,
          groupId: post.groupId,
          userId: user.uid,
          reactionType,
          createdAt: reactionSnap.exists()
            ? reactionSnap.data()?.createdAt ?? serverTimestamp()
            : serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      if (notificationRef) {
        transaction.set(notificationRef, {
          recipientId: post.authorId,
          groupId: post.groupId,
          type: "new_reaction",
          title: "New reaction on your post",
          body: `${user.displayName} ${getReactionSummary(reactionType)} your post.`,
          deepLink: "/feed",
          read: false,
          roundId: post.roundId,
          postId: post.id,
          createdAt: serverTimestamp(),
        });
      }
    } else if (reactionSnap.exists()) {
      transaction.delete(reactionRef);
    }

    transaction.update(postRef, {
      reactionCounts: currentCounts,
      updatedAt: serverTimestamp(),
    });
  });
};

// ─── Notifications ───────────────────────────────────────────────────────────

const mapNotification = (
  d: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>
): AppNotification => {
  const data = d.data() ?? {};
  return {
    id: d.id,
    ...data,
    createdAt: toDate(data.createdAt),
  } as AppNotification;
};

export const getNotifications = async (
  userId: string,
  limitCount = 20
): Promise<AppNotification[]> => {
  const q = query(
    collection(db, "notifications"),
    where("recipientId", "==", userId)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(mapNotification)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limitCount);
};

export const subscribeNotifications = (
  userId: string,
  onChange: (notifications: AppNotification[]) => void,
  options?: { limitCount?: number; onError?: (error: Error) => void }
) => {
  const q = query(
    collection(db, "notifications"),
    where("recipientId", "==", userId)
  );
  return onSnapshot(
    q,
    (snap) =>
      onChange(
        snap.docs
          .map(mapNotification)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, options?.limitCount ?? 20)
      ),
    options?.onError
  );
};

export const markNotificationRead = async (notificationId: string) => {
  await updateDoc(doc(db, "notifications", notificationId), { read: true });
};
