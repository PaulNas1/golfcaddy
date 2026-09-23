// Season rules lock.
// A season's competition rules (ladder points, season total, handicap rules)
// lock automatically once its first round result is published — FourPlay's
// policy is that rules are set before the season and changes wait for the
// next one. An admin can still unlock for one edit session, behind a warning.

export type SeasonLockRound = {
  season: number;
  resultsPublished: boolean;
  roundNumber?: number | null;
};

export type SeasonLock = {
  locked: boolean;
  publishedCount: number;
  firstPublishedRound: number | null;
};

export function getSeasonLock(rounds: SeasonLockRound[], season: number): SeasonLock {
  const published = rounds.filter((r) => r.season === season && r.resultsPublished);
  const numbers = published
    .map((r) => r.roundNumber)
    .filter((n): n is number => typeof n === "number");
  return {
    locked: published.length > 0,
    publishedCount: published.length,
    firstPublishedRound: numbers.length > 0 ? Math.min(...numbers) : null,
  };
}

/** Which of the Settings page's dirty fields are locked season rules. */
export const SEASON_RULE_FIELDS = ["ladder points", "season total", "handicap rules"] as const;

export function touchesSeasonRules(dirtyFields: string[]) {
  return dirtyFields.some((f) => (SEASON_RULE_FIELDS as readonly string[]).includes(f));
}
