import type { AppUser, Round, TeeTime } from "@/types";

export function formatShortMemberName(member: Pick<AppUser, "displayName">) {
  const parts = member.displayName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? member.displayName;
  const lastInitial = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return lastInitial ? `${firstName} ${lastInitial}` : firstName;
}

export function formatTeeTime(time: string) {
  const [hourValue, minuteValue] = time.split(":");
  const hour = parseInt(hourValue, 10);
  const minute = parseInt(minuteValue, 10);

  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return time;
  }

  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute.toString().padStart(2, "0")} ${suffix}`;
}

export function getFirstTeeTime(round: Pick<Round, "teeTimes">) {
  return (
    round.teeTimes
      .filter((teeTime) => teeTime.time)
      .sort((a, b) => a.time.localeCompare(b.time))[0] ?? null
  );
}

export function getFirstTeeTimeLabel(round: Pick<Round, "teeTimes">) {
  const firstTeeTime = getFirstTeeTime(round);
  return firstTeeTime ? `First tee ${formatTeeTime(firstTeeTime.time)}` : null;
}

export function getMemberNamesForIds(memberIds: string[], members: AppUser[]) {
  return memberIds
    .map((memberId) => members.find((member) => member.uid === memberId))
    .filter((member): member is AppUser => Boolean(member))
    .map((member) => member.displayName);
}

export function getShortMemberNamesForIds(
  memberIds: string[],
  members: AppUser[]
) {
  return memberIds
    .map((memberId) => members.find((member) => member.uid === memberId))
    .filter((member): member is AppUser => Boolean(member))
    .map(formatShortMemberName);
}

export function getTeeTimeGroupLabel(
  playerIds: string[],
  guestNames: string[],
  members: AppUser[]
) {
  return [
    ...getShortMemberNamesForIds(playerIds, members),
    ...guestNames.map((name) => name.trim()).filter(Boolean),
  ].join(", ");
}

export function resolveMemberIdsFromText(text: string, members: AppUser[]) {
  const usedIds = new Set<string>();

  text
    .split(/,|\/|&|\band\b|\n/i)
    .map((entry) => normalizeName(entry))
    .filter(Boolean)
    .forEach((entry) => {
      const exactMatch = members.find(
        (member) => normalizeName(member.displayName) === entry
      );
      if (exactMatch) {
        usedIds.add(exactMatch.uid);
        return;
      }

      const firstNameMatches = members.filter(
        (member) => normalizeName(member.displayName.split(" ")[0]) === entry
      );
      if (firstNameMatches.length === 1) {
        usedIds.add(firstNameMatches[0].uid);
      }
    });

  return Array.from(usedIds);
}

export function getEligibleScorecardMembers(
  round: Pick<Round, "teeTimes">,
  members: AppUser[],
  currentUserId: string
) {
  const teeTimesWithPlayers = round.teeTimes.filter(
    (teeTime) => teeTime.playerIds.length > 0
  );

  if (teeTimesWithPlayers.length === 0) return members;

  const currentUserTeeTime = teeTimesWithPlayers.find((teeTime) =>
    teeTime.playerIds.includes(currentUserId)
  );
  const eligibleIds = new Set(
    currentUserTeeTime
      ? currentUserTeeTime.playerIds
      : teeTimesWithPlayers.flatMap((teeTime) => teeTime.playerIds)
  );

  return members.filter((member) => eligibleIds.has(member.uid));
}

export function normaliseTeeTimePlayerIds(
  teeTime: Pick<TeeTime, "notes" | "playerIds">,
  members: AppUser[]
) {
  return teeTime.playerIds.length > 0
    ? teeTime.playerIds
    : resolveMemberIdsFromText(teeTime.notes ?? "", members);
}

export function randomiseMemberGroups(members: AppUser[], groupCount: number) {
  if (groupCount <= 0) return [];
  if (members.length > groupCount * 4) {
    throw new Error("Add more tee times before randomising these players.");
  }

  const shuffled = [...members].sort(() => Math.random() - 0.5);
  const populatedGroupCount = Math.min(
    groupCount,
    Math.max(1, Math.ceil(shuffled.length / 4))
  );
  const baseSize = Math.floor(shuffled.length / populatedGroupCount);
  const extraPlayers = shuffled.length % populatedGroupCount;
  const groups: AppUser[][] = [];
  let offset = 0;

  for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
    const size =
      groupIndex < populatedGroupCount
        ? baseSize + (groupIndex < extraPlayers ? 1 : 0)
        : 0;
    groups.push(shuffled.slice(offset, offset + size));
    offset += size;
  }

  return groups;
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
