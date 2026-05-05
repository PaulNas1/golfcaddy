"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { format } from "date-fns";
import { type TeeTimeDraftValue } from "@/components/TeeTimesEditor";
import {
  createNotificationsForUsers,
  getActiveMembers,
  getGroup,
  getRound,
  getRoundRsvps,
  getScorecardsForRound,
  getSideClaimsForRound,
  notifyRoundPlayers,
  setSideClaim,
  subscribeHoleScores,
  subscribeRoundRsvps,
  subscribeRoundsForGroup,
  subscribeScorecardsForRound,
  subscribeSideClaimsForRound,
  updateRound,
} from "@/lib/firestore";
import { buildPlayerRankings } from "@/lib/results";
import { useAuth } from "@/contexts/AuthContext";
import {
  type SeededCourse,
  getParThreeHoles,
} from "@/lib/courseData";
import { getRoundLabel } from "@/lib/roundDisplay";
import {
  getTeeTimeGroupLabel,
  normaliseTeeTimePlayerIds,
} from "@/lib/teeTimes";
import RoundDetailsForm, {
  type RoundFormSavePayload,
} from "@/components/admin/RoundDetailsForm";
import RoundStatusSection from "@/components/admin/RoundStatusSection";
import CloseOutSection from "@/components/admin/CloseOutSection";
import CourseCorrectionsSection from "@/components/admin/CourseCorrectionsSection";
import RoundInfoSection from "@/components/admin/RoundInfoSection";
import DangerZoneSection from "@/components/admin/DangerZoneSection";
import type {
  AppUser,
  CourseTeeSet,
  Group,
  HoleScore,
  Round,
  RoundRsvp,
  RoundStatus,
  Scorecard,
  SideClaim,
  SidePrizeType,
  TeeTime,
} from "@/types";

// ---------------------------------------------------------------------------
// Module-scope helpers
// ---------------------------------------------------------------------------

function getRoundAlertRecipientIds(
  round: Round,
  rsvps: RoundRsvp[],
  teeTimes: TeeTime[]
) {
  const ids = new Set<string>();
  rsvps
    .filter((r) => r.status === "accepted")
    .forEach((r) => ids.add(r.memberId));
  teeTimes.forEach((tt) => tt.playerIds.forEach((id) => ids.add(id)));
  if (ids.size === 0) {
    round.teeTimes.forEach((tt) => tt.playerIds.forEach((id) => ids.add(id)));
  }
  return Array.from(ids);
}

function getTeeTimeSignature(teeTimes: TeeTime[]) {
  return JSON.stringify(
    teeTimes.map((tt) => ({
      id: tt.id,
      time: tt.time,
      playerIds: [...tt.playerIds].sort(),
      guestNames: [...tt.guestNames].sort(),
      notes: tt.notes ?? null,
    }))
  );
}

function buildSideWinnerMap(claims: SideClaim[]) {
  return claims.reduce<Record<string, string>>((map, claim) => {
    const key =
      claim.prizeType === "ntp"
        ? `ntp-${claim.holeNumber}`
        : claim.prizeType;
    if (claim.winnerId) map[key] = claim.winnerId;
    return map;
  }, {});
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminRoundDetailPage() {
  const { roundId } = useParams<{ roundId: string }>();
  const { appUser } = useAuth();

  // Shared data
  const [round, setRound] = useState<Round | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [detailsError, setDetailsError] = useState("");

  // Scorecards & scoring
  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
  const [holeScoresByCardId, setHoleScoresByCardId] = useState<
    Record<string, HoleScore[]>
  >({});

  // Side winners
  const [sideWinnerIds, setSideWinnerIds] = useState<Record<string, string>>(
    {}
  );

  // Group context
  const [group, setGroup] = useState<Group | null>(null);
  const [groupRounds, setGroupRounds] = useState<Round[]>([]);

  // Members & RSVPs
  const [members, setMembers] = useState<AppUser[]>([]);
  const [rsvps, setRsvps] = useState<RoundRsvp[]>([]);
  const [rsvpsReady, setRsvpsReady] = useState(false);

  // Tee-time editor (controlled by page so RSVP sync effect can run)
  const [playerTeeAssignments, setPlayerTeeAssignments] = useState<
    Record<string, string>
  >({});
  const [teeTimes, setTeeTimes] = useState<TeeTimeDraftValue[]>([
    { time: "", notes: "", playerIds: [], guestNames: [] },
  ]);

  // -------------------------------------------------------------------------
  // Derived
  // -------------------------------------------------------------------------

  const acceptedMemberIds = useMemo(
    () =>
      rsvps
        .filter((r) => r.status === "accepted")
        .map((r) => r.memberId),
    [rsvps]
  );

  const acceptedMembers = useMemo(() => {
    const ids = new Set(acceptedMemberIds);
    return members.filter((m) => ids.has(m.uid));
  }, [acceptedMemberIds, members]);

  const rankings = useMemo(
    () =>
      round
        ? buildPlayerRankings({
            round,
            scorecards,
            holeScoresByCardId,
            members,
            settings: group?.settings,
          })
        : [],
    [round, scorecards, holeScoresByCardId, members, group?.settings]
  );

  const playerOptions = useMemo(() => {
    const playingIds = new Set<string>();
    rsvps
      .filter((r) => r.status === "accepted")
      .forEach((r) => playingIds.add(r.memberId));
    (round?.teeTimes ?? []).forEach((tt) =>
      tt.playerIds.forEach((id) => playingIds.add(id))
    );
    return members
      .filter((m) => playingIds.has(m.uid))
      .map((m) => ({ id: m.uid, name: m.displayName }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [members, rsvps, round?.teeTimes]);

  // -------------------------------------------------------------------------
  // Effects — initial load
  // -------------------------------------------------------------------------

  const loadScorecards = async (r: Round) => {
    const cards = await getScorecardsForRound(r.id);
    setScorecards(cards);
  };

  useEffect(() => {
    if (!roundId) return;

    Promise.all([
      getRound(roundId),
      getActiveMembers(appUser?.groupId ?? "fourplay"),
      getRoundRsvps(roundId),
      getGroup(appUser?.groupId),
      getSideClaimsForRound(roundId),
    ]).then(
      ([r, activeMembers, roundRsvps, groupRecord, claims]) => {
        setMembers(activeMembers);
        setRsvps(roundRsvps);
        setRsvpsReady(true);
        setGroup(groupRecord);
        setSideWinnerIds(buildSideWinnerMap(claims));
        setRound(r);
        setLoading(false);
        if (r) {
          setPlayerTeeAssignments(r.playerTeeAssignments ?? {});
          setTeeTimes(
            r.teeTimes && r.teeTimes.length > 0
              ? r.teeTimes.map((t) => ({
                  time: t.time,
                  notes: t.notes ?? "",
                  playerIds: normaliseTeeTimePlayerIds(t, activeMembers),
                  guestNames: t.guestNames ?? [],
                }))
              : [{ time: "", notes: "", playerIds: [], guestNames: [] }]
          );
          loadScorecards(r);
        }
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appUser?.groupId, roundId]);

  // -------------------------------------------------------------------------
  // Effects — real-time subscriptions
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!roundId) return;
    return subscribeRoundRsvps(
      roundId,
      (next) => {
        setRsvps(next);
        setRsvpsReady(true);
      },
      (err) => console.warn("Unable to subscribe to RSVP updates", err)
    );
  }, [roundId]);

  useEffect(() => {
    if (!roundId) return;
    return subscribeScorecardsForRound(
      roundId,
      setScorecards,
      (err) => console.warn("Unable to subscribe to scorecards", err)
    );
  }, [roundId]);

  useEffect(() => {
    if (scorecards.length === 0) {
      setHoleScoresByCardId({});
      return;
    }
    const activeIds = new Set(scorecards.map((c) => c.id));
    setHoleScoresByCardId((cur) =>
      Object.fromEntries(
        Object.entries(cur).filter(([id]) => activeIds.has(id))
      )
    );
    const unsubs = scorecards.map((card) =>
      subscribeHoleScores(
        card.id,
        (scores) =>
          setHoleScoresByCardId((cur) => ({ ...cur, [card.id]: scores })),
        (err) =>
          console.warn(`Unable to subscribe to hole scores for ${card.id}`, err)
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [scorecards]);

  useEffect(() => {
    if (!roundId) return;
    return subscribeSideClaimsForRound(
      roundId,
      (claims) => setSideWinnerIds(buildSideWinnerMap(claims)),
      (err) => console.warn("Unable to subscribe to side claims", err)
    );
  }, [roundId]);

  useEffect(() => {
    if (!appUser?.groupId) return;
    return subscribeRoundsForGroup(
      appUser.groupId,
      setGroupRounds,
      (err) => console.warn("Unable to subscribe to group rounds", err)
    );
  }, [appUser?.groupId]);

  // -------------------------------------------------------------------------
  // Effect — RSVP sync: remove departed players from tee times
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!rsvpsReady) return;
    const acceptedIds = new Set(acceptedMemberIds);

    setTeeTimes((current) => {
      let changed = false;
      const next = current.map((tt) => {
        const playerIds = tt.playerIds.filter((id) => acceptedIds.has(id));
        if (playerIds.length === tt.playerIds.length) return tt;
        changed = true;
        return {
          ...tt,
          playerIds,
          notes: getTeeTimeGroupLabel(playerIds, tt.guestNames, members),
        };
      });
      return changed ? next : current;
    });

    setPlayerTeeAssignments((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([uid]) => acceptedIds.has(uid))
      );
      return Object.keys(next).length === Object.keys(current).length
        ? current
        : next;
    });
  }, [acceptedMemberIds, members, rsvpsReady]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const setStatus = async (status: RoundStatus) => {
    if (!round) return;
    setSaving(true);
    try {
      await updateRound(round.id, { status });
      setRound({ ...round, status });

      if (status === "live") {
        const activeUsers = await getActiveMembers(round.groupId);
        await createNotificationsForUsers({
          recipientUserIds: activeUsers.map((u) => u.uid),
          groupId: round.groupId,
          type: "round_live",
          title: "Round is live",
          body: `Scoring is now open for Round ${round.roundNumber} at ${round.courseName}.`,
          deepLink: `/rounds/${round.id}/scorecard`,
          roundId: round.id,
        });
      }

      setSuccess(`Round marked as ${status}`);
      setTimeout(() => setSuccess(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDetails = async (
    payload: RoundFormSavePayload,
    notifyPlayers: boolean
  ) => {
    if (!round) return;
    setSaving(true);
    setDetailsError("");
    try {
      const validTeeSetIds = new Set(
        payload.availableTeeSets.map((ts) => ts.id)
      );
      const savedPlayerTeeAssignments = Object.fromEntries(
        Object.entries(playerTeeAssignments).filter(
          ([, teeId]) =>
            teeId && teeId !== payload.teeSetId && validTeeSetIds.has(teeId)
        )
      );

      const updatedRound: Round = {
        ...round,
        ...payload,
        playerTeeAssignments: savedPlayerTeeAssignments,
        rsvpOpen: notifyPlayers ? true : round.rsvpOpen,
        rsvpNotifiedAt: notifyPlayers ? new Date() : round.rsvpNotifiedAt,
      };

      const teeTimesChanged =
        getTeeTimeSignature(round.teeTimes) !==
        getTeeTimeSignature(payload.teeTimes);
      const courseChanged =
        round.courseName !== payload.courseName ||
        round.courseId !== payload.courseId ||
        round.teeSetId !== payload.teeSetId ||
        round.date.getTime() !== payload.date.getTime();
      const alertRecipientIds = getRoundAlertRecipientIds(
        round,
        rsvps,
        payload.teeTimes
      );

      await updateRound(round.id, {
        ...payload,
        playerTeeAssignments: savedPlayerTeeAssignments,
        rsvpOpen: notifyPlayers ? true : round.rsvpOpen,
        rsvpNotifiedAt: notifyPlayers ? new Date() : round.rsvpNotifiedAt,
      });

      if (notifyPlayers) {
        await notifyRoundPlayers({
          round: updatedRound,
          activeUsers: members,
          mode: round.rsvpOpen ? "updated" : "created",
        });
      }

      if (alertRecipientIds.length > 0 && teeTimesChanged) {
        await createNotificationsForUsers({
          recipientUserIds: alertRecipientIds,
          groupId: round.groupId,
          type: "change_alert",
          title: "Tee times updated",
          body: `Round ${payload.roundNumber} tee times or groups have changed. Check your latest slot in GolfCaddy.`,
          deepLink: `/rounds/${round.id}`,
          roundId: round.id,
        });
      }

      if (alertRecipientIds.length > 0 && courseChanged) {
        await createNotificationsForUsers({
          recipientUserIds: alertRecipientIds,
          groupId: round.groupId,
          type: "change_alert",
          title: "Round details changed",
          body: `Round ${payload.roundNumber} is now set for ${
            payload.courseName
          } on ${format(payload.date, "EEE d MMM yyyy")}.`,
          deepLink: `/rounds/${round.id}`,
          roundId: round.id,
        });
      }

      setRound(updatedRound);
      setPlayerTeeAssignments(savedPlayerTeeAssignments);
      setSuccess(
        notifyPlayers
          ? "Round details saved and players notified"
          : "Round details updated"
      );
      setTimeout(() => setSuccess(""), 3000);
    } catch {
      setDetailsError("Failed to save round details. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleSendScoreReminder = async () => {
    if (!round) return;
    const recipientIds = Array.from(
      new Set(
        [
          ...rsvps
            .filter((r) => r.status === "accepted")
            .map((r) => r.memberId),
          ...scorecards.map((c) => c.markerId),
        ].filter(Boolean)
      )
    );
    if (recipientIds.length === 0) {
      setDetailsError("No accepted players are available to notify yet.");
      setTimeout(() => setDetailsError(""), 3000);
      return;
    }
    setSaving(true);
    try {
      await createNotificationsForUsers({
        recipientUserIds: recipientIds,
        groupId: round.groupId,
        type: "score_reminder",
        title: "Score reminder",
        body: `Round ${round.roundNumber} is live. Keep your scorecard up to date in GolfCaddy.`,
        deepLink: `/rounds/${round.id}/scorecard`,
        roundId: round.id,
      });
      setSuccess("Score reminder sent.");
      setTimeout(() => setSuccess(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshCourseData = async (
    selectedCourse: SeededCourse,
    refreshableTeeSet: CourseTeeSet
  ) => {
    if (!round) return;
    setSaving(true);
    const refreshedSpecialHoles = {
      ...round.specialHoles,
      ntp: getParThreeHoles(refreshableTeeSet),
    };
    const refreshedCourseDetails = {
      courseId: selectedCourse.id,
      courseName: selectedCourse.name,
      teeSetId: refreshableTeeSet.id,
      teeSetName: refreshableTeeSet.name,
      coursePar: refreshableTeeSet.par,
      courseRating: refreshableTeeSet.courseRating,
      slopeRating: refreshableTeeSet.slopeRating,
      courseHoles: refreshableTeeSet.holes,
      availableTeeSets: selectedCourse.teeSets,
      playerTeeAssignments: {},
      courseSource: refreshableTeeSet.source,
      specialHoles: refreshedSpecialHoles,
    };
    await updateRound(round.id, refreshedCourseDetails);
    setRound({ ...round, ...refreshedCourseDetails });
    setPlayerTeeAssignments({});
    setSuccess("Course data refreshed from GolfCourseAPI");
    setSaving(false);
    setTimeout(() => setSuccess(""), 3000);
  };

  const updateSideWinner = async (
    key: string,
    prizeType: SidePrizeType,
    holeNumber: number,
    winnerId: string
  ) => {
    if (!round || !appUser) return;
    setSideWinnerIds((prev) => ({ ...prev, [key]: winnerId }));
    await setSideClaim({ round, prizeType, holeNumber, winnerId, updatedBy: appUser, members });
  };

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-2/3" />
        <div className="bg-white rounded-2xl p-4 h-32 bg-gray-100" />
      </div>
    );
  }

  if (!round) {
    return <p className="text-gray-400 text-sm">Round not found.</p>;
  }

  return (
    <div className="space-y-4 pb-8">
      {/* Page header */}
      <div>
        <div className="text-xs text-gray-500 mb-1">
          {getRoundLabel(round)} · {round.season}
        </div>
        <h1 className="text-xl font-bold text-gray-800">{round.courseName}</h1>
        <p className="text-gray-500 text-sm">
          {format(round.date, "EEE d MMM yyyy")}
        </p>
      </div>

      {/* Global banners */}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-700 text-sm">
          ✅ {success}
        </div>
      )}
      {detailsError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
          {detailsError}
        </div>
      )}

      {/* Edit round details */}
      <RoundDetailsForm
        existingRound={round}
        members={members}
        assignableMembers={acceptedMembers}
        playersSummary={`Showing accepted players only: ${acceptedMembers.length}`}
        emptyPlayersMessage={
          round.rsvpOpen
            ? "No accepted players yet. Tee-time groups can be filled after players RSVP."
            : "No RSVP'd players yet. Use Save & Notify Players first, then assign tee times after members respond."
        }
        teeTimes={teeTimes}
        onTeeTimes={setTeeTimes}
        playerTeeAssignments={playerTeeAssignments}
        onPlayerTeeAssignmentsChange={setPlayerTeeAssignments}
        onRefreshCourseData={handleRefreshCourseData}
        refreshing={saving}
        onSave={handleSaveDetails}
        saving={saving}
        error={detailsError}
      />

      {/* Round status */}
      <RoundStatusSection
        round={round}
        saving={saving}
        onSetStatus={setStatus}
        onSendScoreReminder={handleSendScoreReminder}
      />

      {/* Close-out: standings, side winners, publish, rebook */}
      {round.status !== "upcoming" && (
        <CloseOutSection
          round={round}
          rankings={rankings}
          scorecards={scorecards}
          sideWinnerIds={sideWinnerIds}
          playerOptions={playerOptions}
          group={group}
          groupRounds={groupRounds}
          appUser={appUser}
          members={members}
          onRoundChange={setRound}
          onScorecardsChange={setScorecards}
          onUpdateSideWinner={updateSideWinner}
        />
      )}

      {/* Course corrections: par fixes, rating/slope, stroke indexes */}
      <CourseCorrectionsSection
        round={round}
        group={group}
        appUser={appUser}
        onRoundChange={setRound}
        onSuccess={showSuccess}
      />

      {/* Quick info read-out */}
      <RoundInfoSection round={round} group={group} />

      {/* Danger zone */}
      <DangerZoneSection round={round} saving={saving} />
    </div>
  );
}
