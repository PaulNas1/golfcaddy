// ─── User & Auth ────────────────────────────────────────────────────────────

export type UserRole = "member" | "moderator" | "admin";
export type UserStatus = "pending" | "active" | "retired" | "suspended";
export type UserGender = "male" | "female";
export type HandicapMode = "local" | "slope_adjusted";
export type HandicapStatus = "provisional" | "official";

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  nickname?: string | null;
  address?: string | null;
  mobileNumber?: string | null;
  dateOfBirth?: string | null;
  gender?: UserGender | null;
  usesSeniorTees?: boolean;
  usesProBackTees?: boolean;
  role: UserRole;
  status: UserStatus;
  groupId: string;
  inviteId?: string | null;
  avatarUrl: string | null;
  avatarPath?: string | null;
  fcmToken: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemberInvite {
  id: string;
  groupId: string;
  groupName: string;
  inviteeName: string;
  contact: string | null;
  token: string;
  status: "created" | "used" | "cancelled";
  createdBy: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Group ───────────────────────────────────────────────────────────────────

export interface GroupSettings {
  pointsTable: Record<string, number>; // "1" → 10, "2" → 9, etc.
  handicapRoundsWindow: number;         // default 6
  minimumRoundsForPoints: number;       // default 3
  handicapMode: HandicapMode;
  bestXofY: {
    enabled: boolean;
    bestX: number;
    ofY: number;
  };
  defaultScoringFormat: ScoringFormat;
  seasonStartMonth: number;
  seasonEndMonth: number;
}

export interface Group {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  logoPath?: string | null;
  adminIds: string[];
  memberCount: number;
  currentSeason: number;
  settings: GroupSettings;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Member ──────────────────────────────────────────────────────────────────

export interface Member {
  id: string;
  userId: string;
  groupId: string;
  displayName: string;
  avatarUrl: string | null;
  currentHandicap: number;
  handicapStatus?: HandicapStatus;
  officialHandicapAssignedAt?: Date | null;
  seasonYear: number;
  seasonPoints: number;
  seasonRank: number | null;
  roundsPlayed: number;
  ntpWins: number;
  ldWins: number;
  t2Wins: number;
  t3Wins: number;
  avgStableford: number | null;
  bestStableford: number | null;
  bestRoundId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Course ──────────────────────────────────────────────────────────────────

export type HoleType = "par3" | "par4" | "par5";

export interface CourseHole {
  number: number;        // 1–18
  par: number;           // 3, 4, or 5
  strokeIndex: number;   // 1–18
  type: HoleType;
  distanceMeters?: number;
}

export interface Course {
  id: string;
  name: string;
  address: string;
  mapsUrl: string;
  phone: string | null;
  website: string | null;
  apiId: string | null;
  holes: CourseHole[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CourseDataSource {
  provider: string;
  url: string;
  lastVerified: string;
  confidence: "seeded" | "provider" | "admin_verified";
}

export interface CourseTeeSet {
  id: string;
  name: string;
  gender: "men" | "women" | "mixed";
  par: number;
  distanceMeters: number;
  courseRating: number | null;
  slopeRating: number | null;
  holes: CourseHole[];
  source: CourseDataSource;
}

// ─── Round ───────────────────────────────────────────────────────────────────

export type RoundStatus = "upcoming" | "live" | "completed";
export type ScoringFormat = "stableford" | "stroke";

export interface HoleOverride {
  holeNumber: number;
  originalPar: number;
  overridePar: number;
  reason: string;
  overriddenAt: Date;
}

export interface SpecialHoles {
  ntp: number[];          // all par 3 hole numbers
  ld: number | null;
  t2: number | null;
  t3: number | null;
}

export interface TeeTime {
  id: string;
  time: string;           // "08:12"
  playerIds: string[];
  guestNames: string[];
  notes: string | null;
}

export interface Round {
  id: string;
  groupId: string;
  courseId: string;
  courseName: string;
  roundName?: string | null;
  teeSetId: string | null;
  teeSetName: string | null;
  coursePar: number | null;
  courseRating: number | null;
  slopeRating: number | null;
  courseHoles: CourseHole[];
  availableTeeSets: CourseTeeSet[];
  playerTeeAssignments: Record<string, string>;
  courseSource: CourseDataSource | null;
  date: Date;
  season: number;
  roundNumber: number;
  format: ScoringFormat;
  status: RoundStatus;
  notes: string | null;
  teeTimes: TeeTime[];
  rsvpOpen: boolean;
  rsvpNotifiedAt: Date | null;
  holeOverrides: HoleOverride[];
  specialHoles: SpecialHoles;
  scorecardsAvailable: boolean;
  resultsPublished: boolean;
  resultsPublishedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export type RoundRsvpStatus = "pending" | "accepted" | "declined";

export interface RoundRsvp {
  id: string;
  roundId: string;
  groupId: string;
  memberId: string;
  memberName: string;
  status: RoundRsvpStatus;
  respondedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Scorecard & Hole Scores ─────────────────────────────────────────────────

export type ScorecardStatus = "in_progress" | "submitted" | "admin_locked";

export interface Scorecard {
  id: string;
  roundId: string;
  groupId: string;
  playerId: string;
  markerId: string;
  handicapAtTime: number;
  teeSetId: string | null;
  teeSetName: string | null;
  coursePar: number | null;
  courseRating: number | null;
  slopeRating: number | null;
  courseHoles: CourseHole[];
  status: ScorecardStatus;
  submittedAt: Date | null;
  signedOff: boolean;
  totalGross: number | null;
  totalStableford: number | null;
  adminEdited: boolean;
  adminEditedBy: string | null;
  adminEditedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface HoleScore {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  distanceMeters?: number;
  strokesReceived: number;
  grossScore: number | null;
  netScore: number | null;
  stablefordPoints: number | null;
  isNTP: boolean;
  isLD: boolean;
  isT2: boolean;
  isT3: boolean;
  savedAt: Date | null;
}

// ─── Results ─────────────────────────────────────────────────────────────────

export interface PlayerRanking {
  rank: number;
  playerId: string;
  playerName: string;
  grossTotal: number;
  stablefordTotal: number;
  handicap: number;
  pointsAwarded: number;
  pointsEligible?: boolean;
  pointsIneligibleReason?: string | null;
  countbackDetail: string | null;
}

export interface SideResult {
  holeNumber: number;
  winnerId: string | null;
  winnerName: string | null;
}

export type SidePrizeType = "ntp" | "ld" | "t2" | "t3";

export interface SideClaim {
  id: string;
  roundId: string;
  groupId: string;
  prizeType: SidePrizeType;
  holeNumber: number;
  winnerId: string | null;
  winnerName: string | null;
  updatedBy: string;
  updatedByName: string;
  updatedAt: Date;
  createdAt: Date;
}

export interface Results {
  id: string;
  roundId: string;
  groupId: string;
  season: number;
  publishedAt: Date;
  rankings: PlayerRanking[];
  sideResults: {
    ntp: SideResult[];
    ld: SideResult;
    t2: SideResult;
    t3: SideResult;
  };
  createdAt: Date;
}

// ─── Season Standings ────────────────────────────────────────────────────────

export interface RoundResult {
  roundId: string;
  courseName: string;
  date: Date;
  finish: number;
  stableford: number;
  pointsAwarded: number;
  pointsEligible?: boolean;
  pointsIneligibleReason?: string | null;
  countsForSeason: boolean;
}

export interface SeasonStanding {
  id: string;
  season: number;
  groupId: string;
  memberId: string;
  memberName: string;
  totalPoints: number;
  grossSeasonPoints: number;
  roundsPlayed: number;
  currentRank: number;
  previousRank: number | null;
  roundResults: RoundResult[];
  ntpWinsSeason: number;
  ldWinsSeason: number;
  t2WinsSeason: number;
  t3WinsSeason: number;
  updatedAt: Date;
}

// ─── Handicap History ────────────────────────────────────────────────────────

export interface HandicapHistory {
  id: string;
  groupId: string;
  memberId: string;
  memberName: string;
  roundId: string | null;
  roundDate?: Date | null;
  season: number;
  previousHandicap: number;
  newHandicap: number;
  reason: string;
  source: "manual_admin" | "published_round";
  changeType?:
    | "movement"
    | "initial_allocation"
    | "provisional_update"
    | "manual_override";
  calculationWindow?: number | null;
  qualifyingRoundCount?: number;
  calculationRoundIds?: string[];
  officialAfterChange?: boolean;
  changedBy: string | null;
  changedByName: string | null;
  createdAt: Date;
}

// ─── Posts & Feed ────────────────────────────────────────────────────────────

export type PostType = "announcement" | "general" | "round_linked";
export type PostReactionType =
  | "like"
  | "love"
  | "laugh"
  | "fire"
  | "dislike";

export interface Post {
  id: string;
  groupId: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  type: PostType;
  content: string;
  roundId: string | null;
  pinned: boolean;
  photoUrls: string[];
  photoPaths?: string[];
  reactionCounts: Record<string, number>;
  commentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Photo {
  id: string;
  groupId: string;
  postId: string;
  uploaderId: string;
  uploaderName: string;
  photoUrl: string;
  photoPath: string | null;
  roundId: string | null;
  roundNumber: number | null;
  courseId: string | null;
  courseName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PostReaction {
  id: string;
  postId: string;
  groupId: string;
  userId: string;
  reactionType: PostReactionType;
  createdAt: Date;
  updatedAt: Date;
}

export interface PostComment {
  id: string;
  postId: string;
  groupId: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Notifications ───────────────────────────────────────────────────────────

export type NotificationType =
  | "round_announced"
  | "tee_times_published"
  | "round_live"
  | "score_reminder"
  | "results_published"
  | "handicap_updated"
  | "announcement"
  | "change_alert"
  | "member_approved"
  | "new_comment"
  | "new_reaction";

export interface AppNotification {
  id: string;
  recipientId: string;
  groupId: string;
  type: NotificationType;
  title: string;
  body: string;
  deepLink: string;
  read: boolean;
  roundId: string | null;
  postId: string | null;
  createdAt: Date;
}
