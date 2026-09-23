// "Around you" — the 3-row ladder strip on the Home page.
// Shows the rank above you, you, and the rank below (ties folded into one
// row), plus how many points separate you from the players either side.

export type AroundYouStanding = {
  memberId: string;
  memberName: string;
  totalPoints: number;
  roundsPlayed: number;
  displayCurrentRank: number;
};

export type AroundYouRow = {
  key: string;
  rankLabel: string; // "#8" or "#8=" for a tie
  label: string; // "You", a name, or "Leigh G, Simon C, Greg F"
  meta: string; // "9 rounds", "3 players tied", or the gap text for you
  points: number;
  isMe: boolean;
};

export type AroundYou =
  | { kind: "empty" } // no standings yet
  | { kind: "notOnLadder" } // probation / no standing
  | { kind: "ok"; rows: AroundYouRow[]; leader: string | null };

/** "Leigh Giampietro" → "Leigh G" */
export function shortName(full: string) {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}` : parts[0] ?? full;
}

function joinNames(names: string[], max = 3) {
  const short = names.map(shortName);
  if (short.length <= max) {
    return short.length === 2 ? short.join(" & ") : short.join(", ");
  }
  return `${short.slice(0, max - 1).join(", ")} + ${short.length - (max - 1)} others`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function buildAroundYou(
  standings: AroundYouStanding[],
  myId: string | null | undefined,
  opts: { onProbation?: boolean } = {}
): AroundYou {
  if (standings.length === 0) return { kind: "empty" };
  const me = myId ? standings.find((s) => s.memberId === myId) : undefined;
  if (!me || (opts.onProbation && me.totalPoints === 0)) return { kind: "notOnLadder" };

  // Group into rank tiers, best first.
  const sorted = [...standings].sort(
    (a, b) => a.displayCurrentRank - b.displayCurrentRank || a.memberName.localeCompare(b.memberName)
  );
  const tiers: AroundYouStanding[][] = [];
  for (const s of sorted) {
    const last = tiers[tiers.length - 1];
    if (last && last[0].displayCurrentRank === s.displayCurrentRank) last.push(s);
    else tiers.push([s]);
  }
  const myTierIndex = tiers.findIndex((t) => t.some((s) => s.memberId === me.memberId));
  const myTier = tiers[myTierIndex];
  const mates = myTier.filter((s) => s.memberId !== me.memberId);
  const above = tiers[myTierIndex - 1];
  const below = tiers[myTierIndex + 1];
  const tieMark = (t: AroundYouStanding[]) => (t.length > 1 ? "=" : "");

  // Gap text for your own row.
  const gapParts: string[] = [];
  if (myTierIndex === 0) {
    if (mates.length > 0) gapParts.push("Tied for the lead");
    else if (below) gapParts.push(`Leading by ${plural(me.totalPoints - below[0].totalPoints, "pt")}`);
    else gapParts.push("Leading");
  } else {
    if (mates.length > 0) gapParts.push(`Tied with ${joinNames(mates.map((m) => m.memberName), 2)}`);
    if (above) gapParts.push(`${plural(above[0].totalPoints - me.totalPoints, "pt")} off #${above[0].displayCurrentRank}`);
    if (below && mates.length === 0) {
      gapParts.push(`${me.totalPoints - below[0].totalPoints} ahead of #${below[0].displayCurrentRank}`);
    }
  }

  // Rows: every tier is one row, except yours splits into [you, tie-mates].
  const rows: AroundYouRow[] = [];
  tiers.forEach((tier, i) => {
    const rankLabel = `#${tier[0].displayCurrentRank}${tieMark(tier)}`;
    if (i === myTierIndex) {
      rows.push({ key: "me", rankLabel, label: "You", meta: gapParts.join(" · "), points: me.totalPoints, isMe: true });
      if (mates.length > 0) {
        rows.push({
          key: `tier-${i}-mates`,
          rankLabel,
          label: mates.length === 1 ? mates[0].memberName : joinNames(mates.map((m) => m.memberName)),
          meta: mates.length === 1 ? plural(mates[0].roundsPlayed, "round") : `${mates.length} players tied`,
          points: me.totalPoints,
          isMe: false,
        });
      }
      return;
    }
    rows.push({
      key: `tier-${i}`,
      rankLabel,
      label: tier.length === 1 ? tier[0].memberName : joinNames(tier.map((s) => s.memberName)),
      meta: tier.length === 1 ? plural(tier[0].roundsPlayed, "round") : `${tier.length} players tied`,
      points: tier[0].totalPoints,
      isMe: false,
    });
  });

  // A 3-row window around you: above / you / below; shifts at the ends.
  const meIndex = rows.findIndex((r) => r.isMe);
  const start = Math.max(0, Math.min(meIndex - 1, rows.length - 3));
  const window = rows.slice(start, start + 3);

  const leader =
    myTierIndex === 0 ? null : `${joinNames(tiers[0].map((s) => s.memberName), 2)} · ${tiers[0][0].totalPoints} pts`;

  return { kind: "ok", rows: window, leader };
}
