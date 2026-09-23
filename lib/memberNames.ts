/**
 * Display-name safety for round results and member snapshots.
 *
 * When a round is published the app derives each ranking's `playerName` from
 * the loaded member list. If that list is empty or still loading, every lookup
 * misses and the name falls back to a generated placeholder ("Player xGQb7w").
 * The season rebuild then seeds `standing.memberName` from that ranking and
 * writes it back onto the member doc — permanently replacing real names.
 *
 * That is exactly what happened to round 9 (Ringwood, 20 Sep 2026): 14 members
 * lost their names in a single publish. These helpers make the placeholder
 * recognisable so it can never be persisted, and let the publish path refuse
 * outright rather than write names it could not resolve.
 */

const PLACEHOLDER_PATTERN = /^Player [A-Za-z0-9]{6}$/;

/** The name the UI falls back to when a playerId isn't in the member list. */
export function placeholderPlayerName(playerId: string): string {
  return `Player ${playerId.slice(0, 6)}`;
}

/**
 * True when `name` is a generated placeholder rather than a real display name.
 * Pass `playerId` when you have it for an exact match instead of the pattern.
 */
export function isPlaceholderPlayerName(
  name: string | null | undefined,
  playerId?: string
): boolean {
  if (!name) return false;
  if (playerId) return name === placeholderPlayerName(playerId);
  return PLACEHOLDER_PATTERN.test(name);
}

/**
 * Best real display name to persist on a member doc, or `undefined` when only
 * a placeholder is available — in which case the caller must leave the stored
 * `displayName` untouched rather than overwrite it.
 */
export function resolveMemberSnapshotName({
  standingName,
  userName,
  memberName,
  memberId,
}: {
  standingName?: string | null;
  userName?: string | null;
  memberName?: string | null;
  memberId?: string;
}): string | undefined {
  for (const candidate of [userName, memberName, standingName]) {
    if (candidate && !isPlaceholderPlayerName(candidate, memberId)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Throw if any ranking still carries a placeholder name. Called before a
 * publish writes results, so a half-loaded member list fails loudly instead of
 * silently renaming people.
 */
export function assertRankingsHaveRealNames(
  rankings: { playerId: string; playerName?: string | null }[]
): void {
  const unresolved = rankings.filter((ranking) =>
    isPlaceholderPlayerName(ranking.playerName, ranking.playerId)
  );
  if (unresolved.length === 0) return;

  const detail = unresolved
    .map((ranking) => `${ranking.playerName} (${ranking.playerId})`)
    .join(", ");
  throw new Error(
    `Refusing to publish: ${unresolved.length} player name${
      unresolved.length === 1 ? "" : "s"
    } could not be resolved — ${detail}. The member list was empty or still ` +
      `loading. Reload the page and publish again.`
  );
}
