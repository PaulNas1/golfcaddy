import type { HoleScore, ScoringFormat } from "@/types";

// Basic Stableford + stroke-play helpers for now.
// Once full course data is wired in, we can swap the placeholders.

export function calculateStrokesReceived(
  handicap: number,
  strokeIndex: number
): number {
  if (handicap <= 0) return 0;
  const base = Math.floor(handicap / 18);
  const remainder = handicap % 18;
  let strokes = base;
  if (strokeIndex <= remainder) strokes += 1;
  return strokes;
}

export function calculateStablefordPoints(
  par: number,
  grossScore: number,
  strokesReceived: number
): number {
  const net = grossScore - strokesReceived;
  const diff = par - net;
  const points = 2 + diff;
  return Math.max(points, 0);
}

export function aggregateTotals(
  holes: HoleScore[],
  format: ScoringFormat
): { totalGross: number | null; totalStableford: number | null } {
  const gross = holes.reduce(
    (sum, h) => (h.grossScore != null ? sum + h.grossScore : sum),
    0
  );
  const stableford = holes.reduce(
    (sum, h) =>
      h.stablefordPoints != null ? sum + h.stablefordPoints : sum,
    0
  );

  const hasAnyGross = holes.some((h) => h.grossScore != null);
  const hasAnyStableford = holes.some(
    (h) => h.stablefordPoints != null
  );

  return {
    totalGross: hasAnyGross ? gross : null,
    totalStableford:
      format === "stableford" && hasAnyStableford ? stableford : null,
  };
}

