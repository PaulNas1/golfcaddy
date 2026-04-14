import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  QueryDocumentSnapshot,
  DocumentData,
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
} from "@/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const toDate = (val: Timestamp | Date | null | undefined): Date => {
  if (!val) return new Date();
  if (val instanceof Timestamp) return val.toDate();
  return val;
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

export const getMember = async (userId: string): Promise<Member | null> => {
  const snap = await getDoc(doc(db, "members", userId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    id: snap.id,
    ...data,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  } as Member;
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

export const getActiveMembers = async (): Promise<AppUser[]> => {
  const q = query(
    collection(db, "users"),
    where("status", "==", "active"),
    orderBy("displayName", "asc")
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
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      date: toDate(data.date),
      resultsPublishedAt: data.resultsPublishedAt
        ? toDate(data.resultsPublishedAt)
        : null,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
    } as Round;
  });
};

export const getRound = async (roundId: string): Promise<Round | null> => {
  const snap = await getDoc(doc(db, "rounds", roundId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    id: snap.id,
    ...data,
    date: toDate(data.date),
    resultsPublishedAt: data.resultsPublishedAt
      ? toDate(data.resultsPublishedAt)
      : null,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  } as Round;
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

export const getNextRound = async (groupId: string): Promise<Round | null> => {
  const now = new Date();
  const q = query(
    collection(db, "rounds"),
    where("groupId", "==", groupId),
    where("date", ">=", now),
    orderBy("date", "asc"),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  const data = d.data();
  return {
    id: d.id,
    ...data,
    date: toDate(data.date),
    resultsPublishedAt: data.resultsPublishedAt
      ? toDate(data.resultsPublishedAt)
      : null,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  } as Round;
};

export const getLiveRound = async (groupId: string): Promise<Round | null> => {
  const q = query(
    collection(db, "rounds"),
    where("groupId", "==", groupId),
    where("status", "==", "live"),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  const data = d.data();
  return {
    id: d.id,
    ...data,
    date: toDate(data.date),
    resultsPublishedAt: data.resultsPublishedAt
      ? toDate(data.resultsPublishedAt)
      : null,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  } as Round;
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
  playerId: string
): Promise<Scorecard | null> => {
  const q = query(
    collection(db, "scorecards"),
    where("roundId", "==", roundId),
    where("playerId", "==", playerId),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return mapScorecard(d);
};

export const getScorecardForMarker = async (
  roundId: string,
  markerId: string
): Promise<Scorecard | null> => {
  const q = query(
    collection(db, "scorecards"),
    where("roundId", "==", roundId),
    where("markerId", "==", markerId),
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
