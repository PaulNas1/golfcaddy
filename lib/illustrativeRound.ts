import type { AppUser, CourseHole, HoleScore, PlayerRanking, Round, Scorecard } from "../types/index.ts";
import { calculateStablefordPoints, calculateStrokesReceived } from "./scoring.ts";
import { buildPlayerRankings } from "./results.ts";

const COURSE_PARS = [4, 5, 3, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4];

type IllustrativePlayer = {
  id: string;
  name: string;
  handicap: number;
  skill: number;
};

const ROSTER: IllustrativePlayer[] = [
  { id: "p1", name: "Sarah K.", handicap: 20, skill: 0.34 },
  { id: "p2", name: "Dave M.", handicap: 14, skill: 0.16 },
  { id: "p3", name: "Priya N.", handicap: 24, skill: 0.22 },
  { id: "p4", name: "Brad G.", handicap: 18, skill: 0.1 },
  { id: "p5", name: "Tom R.", handicap: 9, skill: -0.08 },
];

function mulberry32(seed: number) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type IllustrativeCourseHole = { holeNumber: number; par: number; strokeIndex: number };

function buildIllustrativeCourse(): IllustrativeCourseHole[] {
  return COURSE_PARS.map((par, i) => ({
    holeNumber: i + 1,
    par,
    strokeIndex: ((i * 7) % 18) + 1,
  }));
}

type IllustrativeHoleResult = {
  holeNumber: number;
  strokeIndex: number;
  grossScore: number;
  strokesReceived: number;
  stablefordPoints: number;
};

function simulatePlayerRound(
  player: IllustrativePlayer,
  course: IllustrativeCourseHole[],
  seed: number
): IllustrativeHoleResult[] {
  const random = mulberry32(seed);
  return course.map((hole) => {
    const strokesReceived = calculateStrokesReceived(player.handicap, hole.strokeIndex);
    const roll = random() + player.skill;
    const delta = roll > 0.9 ? -2 : roll > 0.7 ? -1 : roll > 0.36 ? 0 : roll > 0.16 ? 1 : 2;
    const grossScore = Math.max(hole.par + strokesReceived + delta, Math.max(1, hole.par - 2));
    const stablefordPoints = calculateStablefordPoints(hole.par, grossScore, strokesReceived);
    return {
      holeNumber: hole.holeNumber,
      strokeIndex: hole.strokeIndex,
      grossScore,
      strokesReceived,
      stablefordPoints,
    };
  });
}

export type IllustrativeRound = {
  course: IllustrativeCourseHole[];
  playerHoles: Record<string, IllustrativeHoleResult[]>;
};

export function getIllustrativeRoster(): { id: string; name: string; handicap: number }[] {
  return ROSTER.map(({ id, name, handicap }) => ({ id, name, handicap }));
}

export function buildIllustrativeRound(): IllustrativeRound {
  const course = buildIllustrativeCourse();
  const playerHoles: Record<string, IllustrativeHoleResult[]> = {};
  ROSTER.forEach((player, index) => {
    playerHoles[player.id] = simulatePlayerRound(player, course, 4211 + index * 911);
  });
  return { course, playerHoles };
}

const ILLUSTRATIVE_DATE = new Date(2026, 0, 1);

function buildFakeAppUser(player: IllustrativePlayer): AppUser {
  return {
    uid: player.id,
    email: `${player.id}@example.com`,
    displayName: player.name,
    role: "member",
    status: "active",
    groupId: "illustrative-group",
    avatarUrl: null,
    fcmToken: null,
    createdAt: ILLUSTRATIVE_DATE,
    updatedAt: ILLUSTRATIVE_DATE,
  };
}

function holeType(par: number): CourseHole["type"] {
  if (par === 3) return "par3";
  if (par === 5) return "par5";
  return "par4";
}

export function computeIllustrativeStandings(
  round: IllustrativeRound,
  playedHoles: number
): {
  rankings: PlayerRanking[];
  lastHoleByPlayerId: Record<string, IllustrativeHoleResult | undefined>;
} {
  const members: AppUser[] = ROSTER.map(buildFakeAppUser);
  const courseHoles: CourseHole[] = round.course.map((h) => ({
    number: h.holeNumber,
    par: h.par,
    strokeIndex: h.strokeIndex,
    type: holeType(h.par),
  }));
  const coursePar = round.course.reduce((sum, h) => sum + h.par, 0);

  const scorecards: Scorecard[] = ROSTER.map((player) => {
    const holes = round.playerHoles[player.id].slice(0, playedHoles);
    const totalStableford = holes.reduce((sum, h) => sum + h.stablefordPoints, 0);
    return {
      id: player.id,
      roundId: "illustrative-round",
      groupId: "illustrative-group",
      playerId: player.id,
      markerId: "illustrative-marker",
      handicapAtTime: player.handicap,
      teeSetId: null,
      teeSetName: null,
      coursePar,
      courseRating: null,
      slopeRating: null,
      courseHoles,
      status: "in_progress",
      submittedAt: null,
      signedOff: false,
      totalGross: null,
      totalStableford,
      adminEdited: false,
      adminEditedBy: null,
      adminEditedAt: null,
      createdAt: ILLUSTRATIVE_DATE,
      updatedAt: ILLUSTRATIVE_DATE,
    };
  });

  const holeScoresByCardId: Record<string, HoleScore[]> = {};
  ROSTER.forEach((player) => {
    const holes = round.playerHoles[player.id].slice(0, playedHoles);
    holeScoresByCardId[player.id] = holes.map((h) => ({
      holeNumber: h.holeNumber,
      par: round.course[h.holeNumber - 1].par,
      strokeIndex: h.strokeIndex,
      strokesReceived: h.strokesReceived,
      grossScore: h.grossScore,
      netScore: h.grossScore - h.strokesReceived,
      stablefordPoints: h.stablefordPoints,
      isNTP: false,
      isLD: false,
      isT2: false,
      isT3: false,
      savedAt: null,
    }));
  });

  const rankings = buildPlayerRankings({
    round: { format: "stableford" } as Round,
    scorecards,
    holeScoresByCardId,
    members,
  });

  const lastHoleByPlayerId: Record<string, IllustrativeHoleResult | undefined> = {};
  ROSTER.forEach((player) => {
    const holes = round.playerHoles[player.id].slice(0, playedHoles);
    lastHoleByPlayerId[player.id] = holes[holes.length - 1];
  });

  return { rankings, lastHoleByPlayerId };
}
