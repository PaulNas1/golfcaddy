// Admin dashboard: "Next up" checklist + "Needs attention".
// Turns the next round's state into a short to-do list, each item linked to
// the exact place in the round admin that finishes it.

import type { AppUser, Round, RoundRsvp } from "@/types";
import { getRoundTeeSets, getViewerHoles } from "./courseData.ts";

export type ChecklistAction =
  | { kind: "link"; label: string; href: string }
  | { kind: "nudge"; label: string };

export type ChecklistItem = {
  key: "course" | "rsvps" | "groups" | "prizeHoles" | "tees";
  done: boolean;
  label: string;
  detail: string;
  action?: ChecklistAction;
};

export type NextUp =
  | { mode: "none" }
  | { mode: "prep"; round: Round; items: ChecklistItem[]; doneCount: number; daysAway: number }
  | { mode: "live"; round: Round }
  | { mode: "closeOut"; round: Round };

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** The round the admin should be working on now. */
export function pickNextRound(rounds: Round[], season: number): Round | null {
  const live = rounds.find((r) => r.status === "live");
  if (live) return live;
  const open = rounds
    .filter((r) => r.season === season && !r.resultsPublished && r.status !== "completed")
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  // A played-but-unpublished round comes first (it's overdue), else the next upcoming.
  return open[0] ?? null;
}

export function buildNextUp({
  rounds,
  season,
  rsvps,
  activeMembers,
  now,
}: {
  rounds: Round[];
  season: number;
  rsvps: RoundRsvp[];
  activeMembers: AppUser[];
  now: Date;
}): NextUp {
  const round = pickNextRound(rounds, season);
  if (!round) return { mode: "none" };
  if (round.status === "live") return { mode: "live", round };
  if (startOfDay(round.date) < startOfDay(now)) return { mode: "closeOut", round };

  const href = (hash: string) => `/admin/rounds/${round.id}${hash}`;
  const activeIds = new Set(activeMembers.map((m) => m.uid));
  const byMember = new Map(rsvps.filter((r) => activeIds.has(r.memberId)).map((r) => [r.memberId, r]));
  const going = activeMembers.filter((m) => byMember.get(m.uid)?.status === "accepted");
  const out = activeMembers.filter((m) => byMember.get(m.uid)?.status === "declined").length;
  const noReply = activeMembers.length - going.length - out;

  // 1. Course & tees
  const tees = getRoundTeeSets(round);
  const courseDone = tees.length > 0 && tees.some((t) => t.holes.length === 18);
  // 2. RSVPs
  // 3. Tee groups: every "going" player placed in a tee time
  const placed = new Set(round.teeTimes.flatMap((t) => t.playerIds ?? []));
  const goingPlaced = going.filter((m) => placed.has(m.uid)).length;
  const groupsDone = going.length > 0 && goingPlaced === going.length;
  // 4. LD / T2 / T3
  const sh = round.specialHoles ?? { ntp: [], ld: null, t2: null, t3: null };
  const missingPrizes = [!sh.ld && "LD", !sh.t2 && "T2", !sh.t3 && "T3"].filter(Boolean) as string[];
  // 5. Tees for players who may not belong on the default (same rule as the round page)
  const needTee = going.filter((m) => getViewerHoles(round, m).note !== null);

  const items: ChecklistItem[] = [
    {
      key: "course",
      done: courseDone,
      label: courseDone ? "Course & tees set" : "Course not set",
      detail: courseDone ? tees.map((t) => t.name).join(" / ") : "Pick the course and tee",
      action: courseDone ? undefined : { kind: "link", label: "Set", href: href("") },
    },
    {
      key: "rsvps",
      done: noReply === 0,
      label: "RSVPs",
      detail: `${going.length} going · ${out} out · ${noReply} no reply`,
      action: noReply > 0 ? { kind: "nudge", label: "Nudge" } : undefined,
    },
    {
      key: "groups",
      done: groupsDone,
      label: groupsDone ? "Tee groups built" : "Tee groups",
      detail:
        going.length === 0
          ? "Waiting on RSVPs"
          : `${goingPlaced} of ${going.length} going players placed`,
      action: groupsDone || going.length === 0 ? undefined : { kind: "link", label: "Build", href: href("#tee-times") },
    },
    {
      key: "prizeHoles",
      done: missingPrizes.length === 0,
      label: missingPrizes.length === 0 ? "LD · T2 · T3 picked" : `${missingPrizes.join(" · ")} not picked`,
      detail:
        missingPrizes.length === 0
          ? `LD ${sh.ld} · T2 ${sh.t2} · T3 ${sh.t3}`
          : `NTP ${sh.ntp.join(" · ") || "—"} set automatically`,
      action: missingPrizes.length ? { kind: "link", label: "Pick", href: href("#prize-holes") } : undefined,
    },
    {
      key: "tees",
      done: needTee.length === 0,
      label:
        needTee.length === 0
          ? "Everyone's on the right tee"
          : `${needTee.length} player${needTee.length === 1 ? "" : "s"} need${needTee.length === 1 ? "s" : ""} a tee`,
      detail:
        needTee.length === 0
          ? "Women get the ladies' tee automatically"
          : needTee.map((m) => m.displayName.split(" ")[0]).join(", "),
      action: needTee.length ? { kind: "link", label: "Assign", href: href("#tee-assignments") } : undefined,
    },
  ];

  return {
    mode: "prep",
    round,
    items,
    doneCount: items.filter((i) => i.done).length,
    daysAway: Math.round((startOfDay(round.date) - startOfDay(now)) / DAY),
  };
}

export type AttentionItem = { key: string; text: string; href: string; action: string };

export function buildNeedsAttention({
  rounds,
  season,
  pendingCount,
  now,
  nextUpRoundId,
}: {
  rounds: Round[];
  season: number;
  pendingCount: number;
  now: Date;
  nextUpRoundId: string | null;
}): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (pendingCount > 0) {
    items.push({
      key: "pending",
      text: `${pendingCount} player${pendingCount === 1 ? "" : "s"} waiting for approval`,
      href: "/admin/members",
      action: "Review",
    });
  }
  // Other played-but-unpublished rounds (the next-up card already covers its own).
  rounds
    .filter(
      (r) =>
        r.season === season &&
        !r.resultsPublished &&
        r.status !== "live" &&
        r.id !== nextUpRoundId &&
        startOfDay(r.date) < startOfDay(now)
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .forEach((r) =>
      items.push({
        key: `unpublished-${r.id}`,
        text: `Round ${r.roundNumber} played but not published`,
        href: `/admin/rounds/${r.id}`,
        action: "Close out",
      })
    );
  // Nothing scheduled after the next-up round.
  const upcoming = rounds.filter(
    (r) => r.season === season && !r.resultsPublished && startOfDay(r.date) >= startOfDay(now)
  );
  if (upcoming.length === 0) {
    items.push({ key: "none-scheduled", text: "No upcoming round scheduled", href: "/admin/rounds/create", action: "New round" });
  }
  return items;
}
