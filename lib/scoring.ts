import type { HandicapMode, HoleScore, ScoringFormat, UserGender } from "@/types";

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

// Golf Australia WHS consistency factors: Daily HCP = raw × 0.93 × CF
const GA_FACTOR_MEN = 0.93 * 0.9986;
const GA_FACTOR_WOMEN = 0.93 * 1.0483;

export function calculatePlayingHandicap({
  handicap,
  mode,
  slopeRating,
  courseRating,
  coursePar,
  gender,
}: {
  handicap: number;
  mode: HandicapMode;
  slopeRating?: number | null;
  courseRating?: number | null;
  coursePar?: number | null;
  gender?: UserGender | null;
}) {
  if (!Number.isFinite(handicap)) return 0;
  if (mode !== "slope_adjusted") {
    return Math.max(0, Math.round(handicap));
  }

  // Golf Australia WHS formula:
  // Daily HCP = [HI × (Slope/113) + (CR − Par)] × 0.93 × ConsistencyFactor
  const effectiveSlope =
    typeof slopeRating === "number" && slopeRating > 0 ? slopeRating : 113;
  let adjusted = (handicap * effectiveSlope) / 113;

  if (typeof courseRating === "number" && typeof coursePar === "number") {
    adjusted += courseRating - coursePar;
  }

  const gaFactor = gender === "female" ? GA_FACTOR_WOMEN : GA_FACTOR_MEN;
  return Math.max(0, Math.round(adjusted * gaFactor));
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
