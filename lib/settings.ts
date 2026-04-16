import type { GroupSettings } from "@/types";

export const DEFAULT_POINTS_TABLE: Record<string, number> = {
  "1": 10,
  "2": 9,
  "3": 8,
  "4": 7,
  "5": 6,
  "6": 5,
  "7": 4,
  "8": 3,
  "9": 2,
  "10": 1,
};

export const DEFAULT_GROUP_SETTINGS: GroupSettings = {
  pointsTable: DEFAULT_POINTS_TABLE,
  handicapRoundsWindow: 3,
  minimumRoundsForPoints: 3,
  handicapMode: "local",
  bestXofY: {
    enabled: false,
    bestX: 8,
    ofY: 0,
  },
  defaultScoringFormat: "stableford",
  seasonStartMonth: 1,
  seasonEndMonth: 12,
};

export function normaliseGroupSettings(
  settings?: Partial<GroupSettings> | null
): GroupSettings {
  return {
    ...DEFAULT_GROUP_SETTINGS,
    ...settings,
    pointsTable: {
      ...DEFAULT_POINTS_TABLE,
      ...(settings?.pointsTable ?? {}),
    },
    handicapRoundsWindow:
      settings?.handicapRoundsWindow ?? DEFAULT_GROUP_SETTINGS.handicapRoundsWindow,
    minimumRoundsForPoints:
      settings?.minimumRoundsForPoints ??
      DEFAULT_GROUP_SETTINGS.minimumRoundsForPoints,
    handicapMode: settings?.handicapMode ?? DEFAULT_GROUP_SETTINGS.handicapMode,
    bestXofY: {
      ...DEFAULT_GROUP_SETTINGS.bestXofY,
      ...(settings?.bestXofY ?? {}),
    },
  };
}

export function getPointsForRank(
  rank: number,
  pointsTable: Record<string, number> = DEFAULT_POINTS_TABLE
) {
  return pointsTable[String(rank)] ?? 0;
}
