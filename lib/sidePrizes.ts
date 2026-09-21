import type { SidePrizeType } from "@/types";

// ─── Side prize names (Brief 3 §4) ──────────────────────────────────────────
//
// T2 and T3 were bare letters with a star emoji and no expansion anywhere in
// the app or in Help. They are:
//
//   T2 — on the green in two, nominated on a longer par 4
//   T3 — on the green in three, nominated on a par 5
//
// One definition, used by every label, so the four prizes can never end up
// named differently on the admin form, the scorecard and the results.

export interface SidePrizeName {
  /** Spelled out. Use wherever there is room. */
  full: string;
  /** For badges and narrow table columns only. */
  short: string;
  emoji: string;
}

export const SIDE_PRIZE_NAMES: Record<SidePrizeType, SidePrizeName> = {
  ntp: { full: "Nearest the Pin", short: "NTP", emoji: "🎯" },
  ld: { full: "Longest Drive", short: "LD", emoji: "💪" },
  t2: { full: "Green in Two", short: "T2", emoji: "⛳" },
  t3: { full: "Green in Three", short: "T3", emoji: "⛳" },
};

/** "Green in Two · Hole 5" */
export function sidePrizeLabel(
  prize: SidePrizeType,
  holeNumber: number | null | undefined
): string {
  const name = SIDE_PRIZE_NAMES[prize].full;
  return holeNumber != null ? `${name} · Hole ${holeNumber}` : name;
}

/** "⛳ Green in Two (T2)" — for a form label, where the old code is still the
 *  quickest way for an admin to recognise which control they are looking at. */
export function sidePrizeFieldLabel(prize: SidePrizeType): string {
  const { emoji, full, short } = SIDE_PRIZE_NAMES[prize];
  return `${emoji} ${full} (${short})`;
}
