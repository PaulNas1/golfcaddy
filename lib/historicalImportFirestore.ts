import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  getGroup,
  getMembersForGroup,
  getRound,
  getResultsForSeason,
  getSeasonStandings,
} from "./firestore";
import {
  buildSeasonStandings,
  getAverageStableford,
  getBestStableford,
  getSeasonStandingId,
} from "./season";
import { normaliseGroupSettings } from "./settings";
import { normaliseLooseKey } from "./historicalImport";
import type { AppUser, Member, Results, Round } from "@/types";
import type {
  HistoricalImportRoundGroup,
  ParsedHistoricalImportFile,
} from "./historicalImport";

export type MemberMapping = Map<string, Member>;

export async function importHistoricalRoundsToFirestore({
  groupId,
  parsed,
  memberMapping,
  adminUser,
}: {
  groupId: string;
  parsed: ParsedHistoricalImportFile;
  memberMapping: MemberMapping;
  adminUser: AppUser;
}): Promise<{ imported: number }> {
  const now = new Date();
  const importedRounds: Round[] = [];
  const importedResults: Results[] = [];

  for (const group of parsed.rounds) {
    const roundId = await writeRound(group, groupId, adminUser, now);
    writeScorecardsForRound(group, roundId, groupId, memberMapping, adminUser);

    const rankings = buildRankings(group, memberMapping);
    const sideResults = buildSideResults(group, memberMapping);

    const resultsData: Omit<Results, "id" | "createdAt"> = {
      roundId,
      groupId,
      season: group.season,
      publishedAt: group.roundDate,
      rankings,
      sideResults,
    };

    await setDoc(doc(db, "results", roundId), {
      ...resultsData,
      createdAt: serverTimestamp(),
    });

    const roundDoc: Round = {
      id: roundId,
      groupId,
      courseId: "",
      courseName: group.courseName,
      roundName: group.roundName ?? null,
      teeSetId: null,
      teeSetName: null,
      coursePar: group.par ?? null,
      courseRating: group.cr ?? null,
      slopeRating: group.slope ?? null,
      courseHoles: [],
      availableTeeSets: [],
      playerTeeAssignments: {},
      courseSource: null,
      date: group.roundDate,
      season: group.season,
      roundNumber: group.roundNumber ?? 0,
      format: "stableford",
      status: "completed",
      notes: null,
      teeTimes: [],
      rsvpOpen: false,
      rsvpNotifiedAt: null,
      holeOverrides: [],
      specialHoles: { ntp: [], ld: null, t2: null, t3: null },
      scorecardsAvailable: true,
      resultsPublished: true,
      resultsPublishedAt: group.roundDate,
      createdBy: adminUser.uid,
      createdAt: now,
      updatedAt: now,
    };

    importedRounds.push(roundDoc);
    importedResults.push({ id: roundId, ...resultsData, createdAt: now });
  }

  await rebuildStandings({
    groupId,
    season: parsed.season,
    importedRounds,
    importedResults,
    now,
  });

  return { imported: parsed.rounds.length };
}

async function writeRound(
  group: HistoricalImportRoundGroup,
  groupId: string,
  adminUser: AppUser,
  now: Date
): Promise<string> {
  const ref = await addDoc(collection(db, "rounds"), {
    groupId,
    courseId: "",
    courseName: group.courseName,
    roundName: group.roundName ?? null,
    teeSetId: null,
    teeSetName: null,
    coursePar: group.par ?? null,
    courseRating: group.cr ?? null,
    slopeRating: group.slope ?? null,
    courseHoles: [],
    availableTeeSets: [],
    playerTeeAssignments: {},
    courseSource: null,
    date: group.roundDate,
    season: group.season,
    roundNumber: group.roundNumber ?? 0,
    format: "stableford",
    status: "completed",
    notes: null,
    teeTimes: [],
    rsvpOpen: false,
    rsvpNotifiedAt: null,
    holeOverrides: [],
    specialHoles: { ntp: [], ld: null, t2: null, t3: null },
    scorecardsAvailable: true,
    resultsPublished: true,
    resultsPublishedAt: group.roundDate,
    createdBy: adminUser.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

function writeScorecardsForRound(
  group: HistoricalImportRoundGroup,
  roundId: string,
  groupId: string,
  memberMapping: MemberMapping,
  adminUser: AppUser
) {
  for (const row of group.rows) {
    const member = memberMapping.get(normaliseLooseKey(row.playerName));
    if (!member) continue;

    addDoc(collection(db, "scorecards"), {
      roundId,
      groupId,
      playerId: member.id,
      markerId: adminUser.uid,
      handicapAtTime: row.playerHandicap,
      teeSetId: null,
      teeSetName: null,
      coursePar: group.par ?? null,
      courseRating: group.cr ?? null,
      slopeRating: group.slope ?? null,
      courseHoles: [],
      status: "admin_locked",
      submittedAt: group.roundDate,
      signedOff: true,
      totalGross: null,
      totalStableford: row.stablefordPoints,
      adminEdited: false,
      adminEditedBy: null,
      adminEditedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

function buildRankings(
  group: HistoricalImportRoundGroup,
  memberMapping: MemberMapping
): Results["rankings"] {
  const sorted = [...group.rows].sort((a, b) => {
    if (b.stablefordPoints !== a.stablefordPoints) {
      return b.stablefordPoints - a.stablefordPoints;
    }
    return a.playerName.localeCompare(b.playerName);
  });

  let currentRank = 1;
  let previousStableford: number | null = null;

  return sorted.map((row, index) => {
    const member = memberMapping.get(normaliseLooseKey(row.playerName))!;

    if (previousStableford !== null && row.stablefordPoints < previousStableford) {
      currentRank = index + 1;
    }
    previousStableford = row.stablefordPoints;

    return {
      rank: currentRank,
      playerId: member.id,
      playerName: member.displayName,
      grossTotal: 0,
      stablefordTotal: row.stablefordPoints,
      handicap: row.playerHandicap,
      pointsAwarded: row.ladderPoints,
      pointsEligible: true,
      pointsIneligibleReason: null,
      countbackDetail: null,
    };
  });
}

function buildSideResults(
  group: HistoricalImportRoundGroup,
  memberMapping: MemberMapping
): Results["sideResults"] {
  const toWinner = (row: (typeof group.rows)[0] | undefined) => {
    if (!row) return { holeNumber: 0, winnerId: null, winnerName: null };
    const member = memberMapping.get(normaliseLooseKey(row.playerName));
    return {
      holeNumber: 0,
      winnerId: member?.id ?? null,
      winnerName: member?.displayName ?? row.playerName,
    };
  };

  return {
    ntp: group.rows
      .filter((r) => r.ntp)
      .map((r) => toWinner(r)),
    ld: toWinner(group.rows.find((r) => r.ld)),
    t2: toWinner(group.rows.find((r) => r.t2)),
    t3: toWinner(group.rows.find((r) => r.t3)),
  };
}

async function rebuildStandings({
  groupId,
  season,
  importedRounds,
  importedResults,
  now,
}: {
  groupId: string;
  season: number;
  importedRounds: Round[];
  importedResults: Results[];
  now: Date;
}) {
  const importedRoundIds = new Set(importedRounds.map((r) => r.id));

  const [existingResults, existingStandings, group] = await Promise.all([
    getResultsForSeason(groupId, season),
    getSeasonStandings(groupId, season),
    getGroup(groupId),
  ]);

  const allResults = [
    ...existingResults.filter((r) => !importedRoundIds.has(r.id)),
    ...importedResults,
  ];

  const roundsById = new Map<string, Round>(importedRounds.map((r) => [r.id, r]));
  await Promise.all(
    existingResults
      .filter((r) => !importedRoundIds.has(r.id))
      .map(async (r) => {
        const round = await getRound(r.roundId);
        if (round) roundsById.set(r.roundId, round);
      })
  );

  const groupSettings = normaliseGroupSettings(group?.settings);
  const standings = buildSeasonStandings({
    groupId,
    season,
    results: allResults,
    roundsById,
    previousStandings: existingStandings,
    updatedAt: now,
    settings: groupSettings,
  });

  const members = await getMembersForGroup(groupId);
  const membersById = new Map(members.map((m) => [m.id, m]));

  const batch = writeBatch(db);

  standings.forEach((standing) => {
    const member = membersById.get(standing.memberId);
    const avgStableford = getAverageStableford(standing.roundResults);
    const { bestStableford, bestRoundId } = getBestStableford(standing.roundResults);

    batch.set(
      doc(db, "seasonStandings", standing.id),
      { ...standing, updatedAt: serverTimestamp() },
      { merge: true }
    );

    batch.set(
      doc(db, "members", standing.memberId),
      {
        avgStableford,
        bestStableford,
        bestRoundId,
        roundsPlayed: standing.roundsPlayed,
        seasonPoints: standing.totalPoints,
        seasonRank: standing.currentRank,
        seasonYear: season,
        updatedAt: serverTimestamp(),
        ...(member ? {} : { createdAt: serverTimestamp() }),
      },
      { merge: true }
    );
  });

  await batch.commit();
}
