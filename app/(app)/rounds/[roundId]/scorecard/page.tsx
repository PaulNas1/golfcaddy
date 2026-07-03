"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { waitForPendingWrites } from "firebase/firestore";
import {
  getRound,
  getLiveRound,
  getMember,
  getActiveMembers,
  getGroup,
  getRoundRsvps,
  getScorecardForPlayer,
  getScorecardForMarker,
  createScorecard,
  getHoleScores,
  setHoleScore,
  subscribeHoleScores,
  subscribeRound,
  subscribeRoundRsvps,
  subscribeScorecardForMarker,
  subscribeSideClaimsForRound,
  setSideClaim,
  updateScorecard,
} from "@/lib/firestore";
import {
  getEffectiveCourseHoles,
  getEffectiveSpecialHoles,
  getFallbackCourseHoles,
  getPlayerTeeSet,
} from "@/lib/courseData";
import { getEligibleScorecardMembers } from "@/lib/teeTimes";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import type { Round, Scorecard, HoleScore, AppUser, RoundRsvp, SideClaim, SidePrizeType } from "@/types";
import { calculatePlayingHandicap, calculateStrokesReceived, calculateStablefordPoints, aggregateTotals } from "@/lib/scoring";
import { normaliseGroupSettings } from "@/lib/settings";

interface CourseHoleLite {
  number: number;
  par: number;
  strokeIndex: number;
  distanceMeters?: number;
}

export default function ScorecardPage() {
  const { roundId } = useParams<{ roundId: string }>();
  const router = useRouter();
  const { appUser, isActive } = useAuth();

  const [round, setRound] = useState<Round | null>(null);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [holes, setHoles] = useState<HoleScore[]>([]);
  const [members, setMembers] = useState<AppUser[]>([]);
  const [rsvps, setRsvps] = useState<RoundRsvp[]>([]);
  const [playerToMarkId, setPlayerToMarkId] = useState("");

  // Two-phase loading:
  //   roundLoading  — true while the initial getRound fetch is in-flight.
  //                   Blocks the whole page (brief — just one read).
  //   scorecardLoading — true while the second phase (scorecard + members +
  //                   rsvps) is in-flight. The hole grid is already visible;
  //                   only the scorecard card slot shows a spinner.
  const [roundLoading, setRoundLoading] = useState(true);
  const [scorecardLoading, setScorecardLoading] = useState(true);

  const [savingHole, setSavingHole] = useState<number | null>(null);
  const [signing, setSigning] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const [hasPendingSync, setHasPendingSync] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [sideClaims, setSideClaims] = useState<SideClaim[]>([]);
  const [savingClaim, setSavingClaim] = useState("");
  const pendingSyncRunRef = useRef(0);
  const syncTotalsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Live scoring hero: which hole is currently in front of the marker ────
  const [activeHole, setActiveHole] = useState(1);
  const initializedForScorecardRef = useRef<string | null>(null);

  // ── Manual Stableford points override (long-press the PTS pill) ──────────
  const [pointsOverrideHole, setPointsOverrideHole] = useState<number | null>(null);
  const [pointsOverrideDraft, setPointsOverrideDraft] = useState("");
  const pointsLongPressTimerRef = useRef<number | null>(null);

  const confirmPendingSync = (runId: number) => {
    void waitForPendingWrites(db)
      .then(() => {
        if (pendingSyncRunRef.current !== runId) return;
        setHasPendingSync(false);
        setLastSyncedAt(new Date());
      })
      .catch((syncError) => {
        console.warn("Unable to confirm score sync", syncError);
      });
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!hasPendingSync || !isOnline) return;
    confirmPendingSync(pendingSyncRunRef.current);
  }, [hasPendingSync, isOnline]);

  useEffect(() => {
    if (!scorecard?.updatedAt || hasPendingSync) return;
    setLastSyncedAt(scorecard.updatedAt);
  }, [hasPendingSync, scorecard?.updatedAt]);

  // Real-time round subscription (keeps the round fresh during play)
  useEffect(() => {
    if (!roundId || !appUser || !isActive) return;

    return subscribeRound(
      roundId,
      (nextRound) => {
        if (nextRound) {
          setRound(nextRound);
        }
      },
      (err) => console.warn("Unable to subscribe to round updates", err)
    );
  }, [appUser, isActive, roundId]);

  // ── Phase 1: load the round ───────────────────────────────────────────────
  // Fires first and alone so the hole grid can render as soon as possible.
  // Once it resolves the page frame is visible; phase 2 takes over the
  // scorecard card slot only.
  useEffect(() => {
    if (!roundId || !appUser || !isActive) return;

    const loadRound = async () => {
      setRoundLoading(true);
      try {
        const r = await getRound(roundId);

        if (!r) {
          // Try to redirect to the active live round for this group
          const live = await getLiveRound(appUser.groupId).catch(() => null);
          if (live && live.id !== roundId) {
            router.replace(`/rounds/${live.id}/scorecard`);
            return;
          }
          setError(`Round not found. Tried round ID: ${roundId}`);
          return;
        }

        setRound(r);
      } catch {
        setError("Failed to load round.");
      } finally {
        setRoundLoading(false);
      }
    };

    loadRound();
  }, [roundId, appUser, isActive, router]);

  // ── Phase 2: load scorecard, members & RSVPs in parallel ─────────────────
  // Runs after the round is available so it doesn't block the initial render.
  // getMember and getHoleScores (phase 3) are also parallelised here — they
  // were serial in the original implementation.
  useEffect(() => {
    if (!roundId || !appUser || !isActive || roundLoading || !round) return;

    const loadScorecardData = async () => {
      setScorecardLoading(true);
      try {
        const [existing, activeMembers, roundRsvps] = await Promise.all([
          getScorecardForMarker(roundId, appUser.uid, appUser.groupId),
          getActiveMembers(appUser.groupId),
          getRoundRsvps(roundId),
        ]);

        setMembers(
          activeMembers.some((m) => m.uid === appUser.uid)
            ? activeMembers
            : [appUser, ...activeMembers]
        );
        setRsvps(roundRsvps);

        if (!existing) {
          // No card yet — wait for the user to pick who they are marking
          setScorecard(null);
          setHoles([]);
          return;
        }

        setScorecard(existing);

        // Phase 3: getMember and getHoleScores are independent — run in parallel
        const [playerMember, existingHoles] = await Promise.all([
          getMember(existing.playerId),
          getHoleScores(existing.id),
        ]);

        setHoles(
          existingHoles.length > 0
            ? existingHoles
            : buildInitialHoles(
                round,
                playerMember?.currentHandicap ?? 0,
                existing.playerId
              )
        );
      } catch {
        setError("Failed to load scorecard.");
      } finally {
        setScorecardLoading(false);
      }
    };

    loadScorecardData();
    // round.id is the stable key — re-run only if the round itself changes
    // (not on every reactive re-render of the round object).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId, appUser, isActive, roundLoading, round?.id]);

  useEffect(() => {
    if (!roundId || !appUser || !isActive) return;

    return subscribeScorecardForMarker(
      roundId,
      appUser.uid,
      (nextScorecard) => {
        setScorecard(nextScorecard);
        if (!nextScorecard) {
          setHoles([]);
        }
      },
      {
        groupId: appUser.groupId,
        onError: (err) => console.warn("Unable to subscribe to scorecard", err),
      }
    );
  }, [appUser, isActive, roundId]);

  useEffect(() => {
    if (!roundId || !appUser || !isActive) return;

    return subscribeRoundRsvps(
      roundId,
      setRsvps,
      (err) => console.warn("Unable to subscribe to RSVP updates", err)
    );
  }, [appUser, isActive, roundId]);

  useEffect(() => {
    if (!roundId || !appUser || !isActive) return;

    return subscribeSideClaimsForRound(
      roundId,
      setSideClaims,
      (err) => console.warn("Unable to subscribe to side claims", err)
    );
  }, [roundId, appUser, isActive]);

  useEffect(() => {
    if (!scorecard?.id) return;

    return subscribeHoleScores(
      scorecard.id,
      (nextHoles) => {
        if (nextHoles.length > 0) {
          setHoles(nextHoles);
        }
      },
      (err) => console.warn("Unable to subscribe to hole scores", err)
    );
  }, [scorecard?.id]);

  const canEdit = useMemo(
    () =>
      scorecard &&
      round?.status === "live" &&
      scorecard.status === "in_progress" &&
      scorecard.markerId === appUser?.uid,
    [scorecard, round, appUser]
  );

  // Jump the hero to the first unscored hole once per scorecard, so a marker
  // resuming a card lands where they left off instead of always at hole 1.
  useEffect(() => {
    if (!scorecard || holes.length === 0) return;
    if (initializedForScorecardRef.current === scorecard.id) return;
    initializedForScorecardRef.current = scorecard.id;
    setActiveHole(getFirstUnscoredHole(holes));
  }, [scorecard, holes]);

  const clearPointsLongPress = () => {
    if (pointsLongPressTimerRef.current != null) {
      window.clearTimeout(pointsLongPressTimerRef.current);
      pointsLongPressTimerRef.current = null;
    }
  };

  const openPointsOverride = (holeNumber: number, currentPoints: number | null) => {
    clearPointsLongPress();
    setPointsOverrideDraft(currentPoints != null ? String(currentPoints) : "");
    setPointsOverrideHole(holeNumber);
  };

  const startPointsLongPress = (holeNumber: number, currentPoints: number | null) => {
    clearPointsLongPress();
    pointsLongPressTimerRef.current = window.setTimeout(() => {
      openPointsOverride(holeNumber, currentPoints);
    }, 500);
  };

  useEffect(() => clearPointsLongPress, []);

  const commitPointsOverride = () => {
    if (pointsOverrideHole == null) return;
    handleStablefordOverride(pointsOverrideHole, pointsOverrideDraft);
    setPointsOverrideHole(null);
  };

  const markSyncPending = () => {
    pendingSyncRunRef.current += 1;
    setHasPendingSync(true);
    if (typeof navigator === "undefined" || navigator.onLine) {
      confirmPendingSync(pendingSyncRunRef.current);
    }
  };

  const handleStartCard = async () => {
    if (!round || !appUser) return;
    if (round.status !== "live") {
      setError("Scoring is closed for this round.");
      return;
    }
    if (!playerToMarkId) {
      setError("Please select the player you are marking.");
      return;
    }
    const eligiblePlayers = getEligibleScorecardMembers(
      round,
      members,
      appUser.uid,
      getAcceptedMemberIds(round, rsvps)
    );
    if (!eligiblePlayers.some((member) => member.uid === playerToMarkId)) {
      setError("Please select a player from your tee-time group.");
      return;
    }
    setError("");
    setStarting(true);
    try {
      const existingPlayerCard = await getScorecardForPlayer(
        round.id,
        playerToMarkId,
        appUser.groupId
      );
      if (existingPlayerCard) {
        if (existingPlayerCard.markerId === appUser.uid) {
          setScorecard(existingPlayerCard);
          const existingHoles = await getHoleScores(existingPlayerCard.id);
          setHoles(
            existingHoles.length > 0
              ? existingHoles
              : buildInitialHoles(
                  round,
                  existingPlayerCard.handicapAtTime,
                  existingPlayerCard.playerId
                )
          );
          setStarting(false);
          return;
        }

        const markerName =
          members.find((member) => member.uid === existingPlayerCard.markerId)
            ?.displayName ?? "another marker";
        setError(`That player already has a card started by ${markerName}.`);
        setStarting(false);
        return;
      }

      const [playerMember, group] = await Promise.all([
        getMember(playerToMarkId),
        getGroup(appUser.groupId),
      ]);
      const groupSettings = normaliseGroupSettings(group?.settings);
      const baseHandicap = playerMember?.currentHandicap ?? 0;
      const playerTeeSet = getPlayerTeeSet(round, playerToMarkId);
      const playerCourseHoles = getEffectiveCourseHoles(round, playerToMarkId);
      const playerCoursePar =
        playerTeeSet?.par ??
        playerCourseHoles.reduce((total, hole) => total + hole.par, 0);
      const playingHandicap = calculatePlayingHandicap({
        handicap: baseHandicap,
        mode: groupSettings.handicapMode,
        slopeRating: playerTeeSet?.slopeRating ?? round.slopeRating,
        courseRating: playerTeeSet?.courseRating ?? round.courseRating,
        coursePar: playerCoursePar,
      });

      const id = await createScorecard({
        roundId: round.id,
        groupId: appUser.groupId,
        playerId: playerToMarkId,
        markerId: appUser.uid,
        handicapAtTime: playingHandicap,
        teeSetId: playerTeeSet?.id ?? round.teeSetId,
        teeSetName: playerTeeSet?.name ?? round.teeSetName,
        coursePar: playerCoursePar,
        courseRating: playerTeeSet?.courseRating ?? round.courseRating,
        slopeRating: playerTeeSet?.slopeRating ?? round.slopeRating,
        courseHoles: playerCourseHoles,
        status: "in_progress",
        submittedAt: null,
        signedOff: false,
        totalGross: null,
        totalStableford: null,
        adminEdited: false,
        adminEditedBy: null,
        adminEditedAt: null,
      });

      const card: Scorecard = {
        id,
        roundId: round.id,
        groupId: appUser.groupId,
        playerId: playerToMarkId,
        markerId: appUser.uid,
        handicapAtTime: playingHandicap,
        teeSetId: playerTeeSet?.id ?? round.teeSetId,
        teeSetName: playerTeeSet?.name ?? round.teeSetName,
        coursePar: playerCoursePar,
        courseRating: playerTeeSet?.courseRating ?? round.courseRating,
        slopeRating: playerTeeSet?.slopeRating ?? round.slopeRating,
        courseHoles: playerCourseHoles,
        status: "in_progress",
        submittedAt: null,
        signedOff: false,
        totalGross: null,
        totalStableford: null,
        adminEdited: false,
        adminEditedBy: null,
        adminEditedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setScorecard(card);
      setHoles(buildInitialHoles(round, playingHandicap, playerToMarkId));
      markSyncPending();
    } catch {
      setError("Failed to start scorecard. Please try again.");
    } finally {
      setStarting(false);
    }
  };

  const handleHoleChange = async (holeNumber: number, gross: string) => {
    if (!scorecard || !round || !canEdit) return;
    const grossScore = gross ? parseInt(gross, 10) : NaN;
    if (Number.isNaN(grossScore) || grossScore <= 0) {
      // allow clearing
      const updated = holes.map((h) =>
        h.holeNumber === holeNumber
          ? { ...h, grossScore: null, netScore: null, stablefordPoints: null }
          : h
      );
      setHoles(updated);
      await setHoleScore(scorecard.id, holeNumber, {
        ...updated.find((h) => h.holeNumber === holeNumber)!,
        grossScore: null,
        netScore: null,
        stablefordPoints: null,
      });
      debouncedSyncTotals(scorecard.id, updated, round.format);
      markSyncPending();
      return;
    }

    const courseHole = buildCourseLayout(round, scorecard)[holeNumber - 1];
    const strokesReceived = calculateStrokesReceived(
      scorecard.handicapAtTime,
      courseHole.strokeIndex
    );
    const netScore = grossScore - strokesReceived;
    const stablefordPoints = calculateStablefordPoints(
      courseHole.par,
      grossScore,
      strokesReceived
    );

    const updated = holes.map((h) =>
      h.holeNumber === holeNumber
        ? {
            ...h,
            par: courseHole.par,
            strokeIndex: courseHole.strokeIndex,
            distanceMeters: courseHole.distanceMeters,
            strokesReceived,
            grossScore,
            netScore,
            stablefordPoints,
          }
        : h
    );
    setHoles(updated);

    setSavingHole(holeNumber);
    try {
      const roundSpecialHoles = getEffectiveSpecialHoles(round);
      await setHoleScore(scorecard.id, holeNumber, {
        par: courseHole.par,
        strokeIndex: courseHole.strokeIndex,
        distanceMeters: courseHole.distanceMeters,
        strokesReceived,
        grossScore,
        netScore,
        stablefordPoints,
        isNTP: roundSpecialHoles.ntp.includes(holeNumber),
        isLD: roundSpecialHoles.ld === holeNumber,
        isT2: roundSpecialHoles.t2 === holeNumber,
        isT3: roundSpecialHoles.t3 === holeNumber,
      });
      debouncedSyncTotals(scorecard.id, updated, round.format);
      markSyncPending();
    } finally {
      setSavingHole(null);
    }
  };

  const handleStablefordOverride = async (
    holeNumber: number,
    points: string
  ) => {
    if (!scorecard || !round || !canEdit) return;
    const trimmed = points.trim();
    const value =
      trimmed === "" ? null : Number.isNaN(Number(trimmed)) ? null : parseInt(trimmed, 10);

    const updated = holes.map((h) =>
      h.holeNumber === holeNumber
        ? {
            ...h,
            stablefordPoints: value,
          }
        : h
    );
    setHoles(updated);

    const hole = updated.find((h) => h.holeNumber === holeNumber);
    if (!hole) return;

    await setHoleScore(scorecard.id, holeNumber, {
      par: hole.par,
      strokeIndex: hole.strokeIndex,
      distanceMeters: hole.distanceMeters,
      strokesReceived: hole.strokesReceived,
      grossScore: hole.grossScore,
      netScore: hole.netScore,
      stablefordPoints: hole.stablefordPoints,
      isNTP: hole.isNTP,
      isLD: hole.isLD,
      isT2: hole.isT2,
      isT3: hole.isT3,
    });
    debouncedSyncTotals(scorecard.id, updated, round.format);
    markSyncPending();
  };

  const syncTotals = async (
    scorecardId: string,
    localHoles: HoleScore[],
    format: Round["format"]
  ) => {
    const { totalGross, totalStableford } = aggregateTotals(localHoles, format);
    await updateScorecard(scorecardId, { totalGross, totalStableford });
    setScorecard((prev) =>
      prev ? { ...prev, totalGross, totalStableford } : prev
    );
  };

  // Debounced wrapper — waits 1.5 s after the last hole change before writing
  // totals, eliminating the double-write on every keystroke.
  const debouncedSyncTotals = (
    scorecardId: string,
    localHoles: HoleScore[],
    format: Round["format"]
  ) => {
    if (syncTotalsTimerRef.current) clearTimeout(syncTotalsTimerRef.current);
    syncTotalsTimerRef.current = setTimeout(() => {
      syncTotals(scorecardId, localHoles, format).catch((err) =>
        console.warn("Unable to sync totals", err)
      );
    }, 1500);
  };

  const handleSignOff = async () => {
    if (!scorecard || !round) return;
    if (round.status !== "live") {
      setError("Scoring is closed for this round.");
      return;
    }
    setSigning(true);
    setError("");
    try {
      await updateScorecard(scorecard.id, {
        status: "submitted",
        signedOff: true,
        submittedAt: new Date(),
      });
      setScorecard({
        ...scorecard,
        status: "submitted",
        signedOff: true,
        submittedAt: new Date(),
      });
      markSyncPending();
    } catch {
      setError("Failed to submit card. Please try again.");
    } finally {
      setSigning(false);
    }
  };

  const handleReopen = async () => {
    if (!scorecard || !round) return;
    if (round.status !== "live") {
      setError("Scoring is closed for this round.");
      return;
    }
    setReopening(true);
    setError("");
    try {
      await updateScorecard(scorecard.id, {
        status: "in_progress",
        signedOff: false,
        submittedAt: null,
      });
      setScorecard({
        ...scorecard,
        status: "in_progress",
        signedOff: false,
        submittedAt: null,
      });
      markSyncPending();
    } catch {
      setError("Failed to re-open card. Please try again.");
    } finally {
      setReopening(false);
    }
  };

  const getClaim = (prizeType: SidePrizeType, holeNumber: number) =>
    sideClaims.find(
      (claim) => claim.prizeType === prizeType && claim.holeNumber === holeNumber
    ) ?? null;

  const handleClaim = async (
    prizeType: SidePrizeType,
    holeNumber: number,
    winnerId: string
  ) => {
    if (!round || !appUser) return;
    const claimId = prizeType === "ntp" ? `ntp-${holeNumber}` : prizeType;
    setSavingClaim(claimId);
    try {
      await setSideClaim({
        round,
        prizeType,
        holeNumber,
        winnerId,
        updatedBy: appUser,
        members,
      });
    } finally {
      setSavingClaim("");
    }
  };

  // ── Guards ───────────────────────────────────────────────────────────────

  if (!isActive) {
    return (
      <div className="px-4 py-6 text-sm text-gray-500">
        You need an active membership to enter scores.
      </div>
    );
  }

  // Phase 1 loading: only while the round itself is in-flight.
  // Kept as a full-screen skeleton because without the round we have no
  // course name or hole data to show anything useful.
  if (roundLoading) {
    return (
      <div className="px-4 py-6 animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-2/3" />
        <div className="h-4 bg-gray-100 rounded w-1/2" />
        <div className="bg-white rounded-2xl p-4 h-32 bg-gray-100" />
      </div>
    );
  }

  if (!round) {
    return (
      <div className="px-4 py-6 text-sm text-gray-500">
        Round not found.
      </div>
    );
  }

  // ── Derived values (round is guaranteed from here down) ──────────────────

  const courseLayout = buildCourseLayout(round, scorecard);

  const playerName =
    scorecard &&
    members.find((m) => m.uid === scorecard.playerId)?.displayName;
  const markerName = appUser?.displayName;
  const eligibleMembers =
    round && appUser
      ? getEligibleScorecardMembers(
          round,
          members,
          appUser.uid,
          getAcceptedMemberIds(round, rsvps)
        )
      : members;
  const teeTimesWithPlayers = round.teeTimes.some(
    (teeTime) => teeTime.playerIds.length > 0
  );
  const syncStatus = hasPendingSync
    ? isOnline
      ? {
          tone: "border-blue-200 bg-blue-50 text-blue-800",
          title: "Syncing changes",
          body: "Scores are saved on this phone and uploading in the background.",
        }
      : {
          tone: "border-amber-200 bg-amber-50 text-amber-800",
          title: "Saved on this phone",
          body: "Signal dropped. Your latest scores will sync automatically when you reconnect.",
        }
    : !isOnline
    ? {
        tone: "border-gray-200 bg-gray-50 text-gray-700",
        title: "Offline",
        body: "You can keep entering scores. GolfCaddy will sync them when the connection is back.",
      }
    : lastSyncedAt
    ? {
        tone: "border-green-200 bg-green-50 text-green-800",
        title: "All changes synced",
        body: `Last synced ${lastSyncedAt.toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })}.`,
      }
    : {
        tone: "border-green-200 bg-green-50 text-green-800",
        title: "Ready to score",
        body: "Scores save on this phone first and sync automatically.",
      };

  return (
    <div className="px-4 py-6 space-y-4 pb-20">
      <button
        onClick={() => router.back()}
        className="text-sm text-ink-muted mb-1"
      >
        ← Back to round
      </button>

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-600">
            Round {round.roundNumber} · Live scoring
          </p>
          <h1 className="text-2xl font-extrabold text-ink-title">
            {round.courseName}
          </h1>
        </div>
        {round.status === "live" && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-live-bg px-2.5 py-1 text-xs font-bold text-live-text">
            ● LIVE
          </span>
        )}
      </div>

      <div className={`rounded-2xl border px-4 py-3 text-sm ${syncStatus.tone}`}>
        <p className="font-semibold">{syncStatus.title}</p>
        <p className="mt-1 text-xs opacity-90">{syncStatus.body}</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* ── Scorecard card slot ─────────────────────────────────────────────
          Phase 2 loading: show a compact inline spinner while scorecard,
          members, and RSVPs are still being fetched. The hole grid below is
          already rendered and visible during this wait.
      ─────────────────────────────────────────────────────────────────────── */}
      {scorecardLoading ? (
        <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-overlay p-4 flex items-center gap-3 text-sm text-ink-muted">
          <span className="h-4 w-4 rounded-full border-2 border-surface-overlay border-t-ink-muted animate-spin shrink-0" />
          <span>Loading scorecard…</span>
        </div>
      ) : (
        <>
          {!scorecard && (
            <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-overlay p-4 space-y-4">
              <h2 className="font-semibold text-ink-title">Who are you marking?</h2>
              <p className="text-sm text-ink-muted">
                Select an accepted player from your tee-time group. Guests are
                tee-group only and are not scored in GolfCaddy.
              </p>
              {eligibleMembers.length > 0 ? (
                <select
                  value={playerToMarkId}
                  onChange={(e) => setPlayerToMarkId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-surface-overlay text-ink-title text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Select player</option>
                  {eligibleMembers.map((m) => (
                    <option key={m.uid} value={m.uid}>
                      {m.uid === appUser?.uid
                        ? `${m.displayName} (my own card)`
                        : m.displayName}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  {teeTimesWithPlayers
                    ? "You are not assigned to a tee-time group with accepted players. Ask admin to update the groups."
                    : "No accepted players are available for scorecards yet."}
                </div>
              )}
              {eligibleMembers.length > 0 && teeTimesWithPlayers && (
                <p className="text-sm text-ink-hint">
                  Showing accepted members assigned to your tee-time group.
                </p>
              )}
              <button
                type="button"
                onClick={handleStartCard}
                disabled={starting || !playerToMarkId}
                className="w-full bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white text-sm font-semibold py-3 rounded-xl transition-colors"
              >
                {starting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Starting...
                  </span>
                ) : (
                  "Start scorecard"
                )}
              </button>
            </div>
          )}

          {scorecard && (
            <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-overlay p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-ink-muted mb-0.5">
                  Status
                </p>
                <p className="text-sm font-semibold text-ink-title">
                  {scorecard.status === "in_progress"
                    ? "In progress"
                    : scorecard.status === "submitted"
                    ? "Submitted"
                    : "Locked by admin"}
                </p>
                <p className="text-sm text-ink-muted mt-1">
                  Player:{" "}
                  <span className="font-semibold text-ink-title">
                    {playerName ?? "—"}
                  </span>
                  {markerName && round && (
                    <>
                      {" · "}
                      <button
                        type="button"
                        onClick={() =>
                          router.push(`/rounds/${round.id}/my-card`)
                        }
                        className="underline text-brand-700"
                      >
                        Marker: {markerName}
                      </button>
                    </>
                  )}
                </p>
                <p className="text-sm text-ink-muted mt-1">
                  Playing HCP:{" "}
                  <span className="font-semibold text-ink-title">
                    {scorecard.handicapAtTime}
                  </span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-ink-muted mb-0.5">Totals</p>
                <p className="text-lg font-bold text-ink-title">
                  {round.format === "stableford"
                    ? scorecard.totalStableford ?? "—"
                    : scorecard.totalGross ?? "—"}
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Live scoring hero ──────────────────────────────────────────────────
          Rendered as soon as the round is available (phase 1). Editing is
          disabled while scorecardLoading or while canEdit is false; par,
          stroke index, and distance are visible immediately from the round's
          course data, giving players something useful to look at while the
          scorecard data loads in the background.
      ─────────────────────────────────────────────────────────────────────── */}
      {(() => {
        const heroDisabled = !canEdit || scorecardLoading;
        const allHoles = holesForNine(holes, courseLayout, 1, 18, round);
        const frontNine = allHoles.slice(0, 9);
        const backNine = allHoles.slice(9, 18);
        const activeHoleData =
          allHoles.find((h) => h.holeNumber === activeHole) ?? allHoles[0];
        const displayScore = activeHoleData.grossScore ?? activeHoleData.par;
        const hasPoints = activeHoleData.stablefordPoints != null;

        const adjustScore = (delta: number) => {
          if (heroDisabled) return;
          const next = Math.max(1, displayScore + delta);
          handleHoleChange(activeHole, String(next));
        };

        const frontTotals = computeNineTotals(frontNine, activeHole);
        const backTotals = computeNineTotals(backNine, activeHole);

        return (
          <>
            <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-overlay p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm text-ink-muted">Hole</p>
                  <p className="text-4xl font-extrabold text-ink-title font-mono leading-none mt-1">
                    {activeHoleData.holeNumber}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-surface-muted px-3 py-2 text-center min-w-[3.25rem]">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-ink-hint">
                      Par
                    </p>
                    <p className="text-lg font-bold text-ink-title font-mono">
                      {activeHoleData.par}
                    </p>
                  </div>
                  <div className="rounded-lg bg-surface-muted px-3 py-2 text-center min-w-[3.25rem]">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-ink-hint">
                      S.I.
                    </p>
                    <p className="text-lg font-bold text-ink-title font-mono">
                      {activeHoleData.strokeIndex}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={heroDisabled}
                    aria-label={`Points for hole ${activeHoleData.holeNumber}. Press and hold to override.`}
                    onMouseDown={() =>
                      !heroDisabled &&
                      startPointsLongPress(
                        activeHoleData.holeNumber,
                        activeHoleData.stablefordPoints
                      )
                    }
                    onMouseUp={clearPointsLongPress}
                    onMouseLeave={clearPointsLongPress}
                    onTouchStart={() =>
                      !heroDisabled &&
                      startPointsLongPress(
                        activeHoleData.holeNumber,
                        activeHoleData.stablefordPoints
                      )
                    }
                    onTouchEnd={clearPointsLongPress}
                    onTouchCancel={clearPointsLongPress}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (!heroDisabled) {
                        openPointsOverride(
                          activeHoleData.holeNumber,
                          activeHoleData.stablefordPoints
                        );
                      }
                    }}
                    className="rounded-lg bg-brand-500 px-3 py-2 text-center min-w-[3.25rem] disabled:opacity-60"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wide text-white/80">
                      Pts
                    </p>
                    <p className="text-lg font-bold text-white font-mono">
                      {hasPoints ? activeHoleData.stablefordPoints : "–"}
                    </p>
                  </button>
                </div>
              </div>

              <div className="mt-6 text-center">
                <p className="text-sm text-ink-muted mb-3">
                  Your gross score
                  {savingHole === activeHoleData.holeNumber && (
                    <span className="ml-2 text-xs text-ink-hint">Saving…</span>
                  )}
                </p>
                <div className="flex items-center justify-center gap-4">
                  <button
                    type="button"
                    disabled={heroDisabled}
                    aria-label="Decrease gross score"
                    onClick={() => adjustScore(-1)}
                    className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-muted text-2xl font-bold text-ink-title disabled:opacity-50"
                  >
                    −
                  </button>
                  <span className="w-16 text-center text-5xl font-extrabold text-ink-title font-mono">
                    {displayScore}
                  </span>
                  <button
                    type="button"
                    disabled={heroDisabled}
                    aria-label="Increase gross score"
                    onClick={() => adjustScore(1)}
                    className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 text-2xl font-bold text-white disabled:opacity-50"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <HoleStrip
              label="Front Nine"
              holes={frontNine}
              activeHole={activeHole}
              totals={frontTotals}
              onSelect={setActiveHole}
            />
            <HoleStrip
              label="Back Nine"
              holes={backNine}
              activeHole={activeHole}
              totals={backTotals}
              onSelect={setActiveHole}
            />

            <button
              type="button"
              disabled={heroDisabled}
              onClick={() => setActiveHole((h) => Math.min(h + 1, 18))}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:bg-surface-muted disabled:text-ink-hint text-white font-semibold py-4 rounded-2xl text-base transition-colors"
            >
              {activeHole >= 18 ? "Save hole" : "Save & next hole"}
            </button>
          </>
        );
      })()}

      {/* Submit / reopen — only shown once scorecard is loaded */}
      {!scorecardLoading && scorecard && (
        <>
          {scorecard.status === "in_progress" && round.status === "live" && (
            <button
              type="button"
              onClick={handleSignOff}
              disabled={signing}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white font-semibold py-4 rounded-2xl text-base transition-colors"
            >
              {signing ? "Submitting card..." : "Sign & submit card"}
            </button>
          )}

          {scorecard.status === "in_progress" && round.status !== "live" && (
            <div className="bg-surface-muted border border-surface-overlay rounded-2xl p-4 text-sm text-ink-muted">
              Scoring is closed for this round.
            </div>
          )}

          {scorecard.status !== "in_progress" && (
            <div className="space-y-2">
              <div className="bg-brand-50 border border-brand-200 rounded-2xl p-4 text-sm text-brand-800">
                ✅ Card submitted.
              </div>
              {scorecard.status === "submitted" && round.status === "live" && (
                <button
                  type="button"
                  onClick={handleReopen}
                  disabled={reopening}
                  className="w-full bg-surface-card border border-brand-300 text-brand-700 text-sm font-semibold py-2.5 rounded-2xl"
                >
                  {reopening ? "Re-opening..." : "Re-open card to edit"}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* Side prizes — only shown once scorecard is loaded */}
      {!scorecardLoading && (() => {
        const specialHoles = getEffectiveSpecialHoles(round);
        const hasAny =
          specialHoles.ntp.length > 0 ||
          specialHoles.ld ||
          specialHoles.t2 ||
          specialHoles.t3;
        if (!hasAny) return null;
        return (
          <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-overlay p-4 space-y-3">
            <h2 className="font-semibold text-ink-title">Side Prizes</h2>
            <p className="text-sm text-ink-muted">
              Claim the winner for each side prize on this round.
            </p>
            {specialHoles.ntp.map((holeNumber) => (
              <SideClaimSelect
                key={`ntp-${holeNumber}`}
                label={`Nearest the Pin - Hole ${holeNumber}`}
                claim={getClaim("ntp", holeNumber)}
                members={members}
                disabled={round.status !== "live"}
                saving={savingClaim === `ntp-${holeNumber}`}
                onChange={(winnerId) => handleClaim("ntp", holeNumber, winnerId)}
              />
            ))}
            {specialHoles.ld && (
              <SideClaimSelect
                label={`Longest Drive - Hole ${specialHoles.ld}`}
                claim={getClaim("ld", specialHoles.ld)}
                members={members}
                disabled={round.status !== "live"}
                saving={savingClaim === "ld"}
                onChange={(winnerId) => handleClaim("ld", specialHoles.ld!, winnerId)}
              />
            )}
            {specialHoles.t2 && (
              <SideClaimSelect
                label={`T2 - Hole ${specialHoles.t2}`}
                claim={getClaim("t2", specialHoles.t2)}
                members={members}
                disabled={round.status !== "live"}
                saving={savingClaim === "t2"}
                onChange={(winnerId) => handleClaim("t2", specialHoles.t2!, winnerId)}
              />
            )}
            {specialHoles.t3 && (
              <SideClaimSelect
                label={`T3 - Hole ${specialHoles.t3}`}
                claim={getClaim("t3", specialHoles.t3)}
                members={members}
                disabled={round.status !== "live"}
                saving={savingClaim === "t3"}
                onChange={(winnerId) => handleClaim("t3", specialHoles.t3!, winnerId)}
              />
            )}
          </div>
        );
      })()}

      {pointsOverrideHole != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-surface-card p-5 shadow-xl">
            <h3 className="text-base font-semibold text-ink-title">
              Override points — Hole {pointsOverrideHole}
            </h3>
            <p className="mt-2 text-sm text-ink-body">
              Manually set the Stableford points for this hole. Leave blank to
              use the calculated value instead.
            </p>
            <input
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              type="number"
              inputMode="numeric"
              value={pointsOverrideDraft}
              onChange={(e) => setPointsOverrideDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitPointsOverride();
                if (e.key === "Escape") setPointsOverrideHole(null);
              }}
              placeholder="Points"
              className="mt-4 w-full rounded-xl border border-surface-overlay bg-surface-muted px-4 py-3 text-center text-2xl font-bold font-mono text-ink-title focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setPointsOverrideHole(null)}
                className="flex-1 rounded-xl border border-surface-overlay px-4 py-2.5 text-sm font-medium text-ink-body"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={commitPointsOverride}
                className="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white"
              >
                Save override
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildCourseLayout(
  round?: Round | null,
  scorecard?: Scorecard | null
): CourseHoleLite[] {
  const courseHoles =
    scorecard?.courseHoles && scorecard.courseHoles.length === 18
      ? scorecard.courseHoles
      : round
      ? getEffectiveCourseHoles(round, scorecard?.playerId)
      : getFallbackCourseHoles();

  return mapCourseHoles(courseHoles);
}

function mapCourseHoles(courseHoles: CourseHoleLite[]): CourseHoleLite[] {
  return courseHoles.map((hole) => ({
    number: hole.number,
    par: hole.par,
    strokeIndex: hole.strokeIndex,
    distanceMeters: hole.distanceMeters,
  }));
}

function getAcceptedMemberIds(round: Round, rsvps: RoundRsvp[]) {
  if (!round.rsvpOpen && rsvps.length === 0) return undefined;
  return rsvps
    .filter((rsvp) => rsvp.status === "accepted")
    .map((rsvp) => rsvp.memberId);
}

function buildInitialHoles(
  round: Round,
  handicap: number,
  playerId?: string
): HoleScore[] {
  const layout = mapCourseHoles(getEffectiveCourseHoles(round, playerId));
  const specialHoles = getEffectiveSpecialHoles(round);
  return layout.map((h) => ({
    holeNumber: h.number,
    par: h.par,
    strokeIndex: h.strokeIndex,
    distanceMeters: h.distanceMeters,
    strokesReceived: calculateStrokesReceived(handicap, h.strokeIndex),
    grossScore: null,
    netScore: null,
    stablefordPoints: null,
    isNTP: specialHoles.ntp.includes(h.number),
    isLD: specialHoles.ld === h.number,
    isT2: specialHoles.t2 === h.number,
    isT3: specialHoles.t3 === h.number,
    savedAt: null,
  }));
}

function holesForNine(
  holes: HoleScore[],
  layout: CourseHoleLite[],
  start: number,
  end: number,
  round: Round
): HoleScore[] {
  const byNumber: Record<number, HoleScore> = {};
  const specialHoles = getEffectiveSpecialHoles(round);
  holes.forEach((h) => {
    byNumber[h.holeNumber] = h;
  });
  const result: HoleScore[] = [];
  for (let n = start; n <= end; n++) {
    const base = byNumber[n];
    const course = layout[n - 1];
    result.push(
      base
        ? {
            ...base,
            par: course.par,
            strokeIndex: course.strokeIndex,
            distanceMeters: base.distanceMeters ?? course.distanceMeters,
            isNTP: specialHoles.ntp.includes(n),
            isLD: specialHoles.ld === n,
            isT2: specialHoles.t2 === n,
            isT3: specialHoles.t3 === n,
          }
        : ({
        holeNumber: n,
        par: course.par,
        strokeIndex: course.strokeIndex,
        distanceMeters: course.distanceMeters,
        strokesReceived: 0,
        grossScore: null,
        netScore: null,
        stablefordPoints: null,
        isNTP: specialHoles.ntp.includes(n),
        isLD: specialHoles.ld === n,
        isT2: specialHoles.t2 === n,
        isT3: specialHoles.t3 === n,
        savedAt: null,
      } as HoleScore)
    );
  }
  return result;
}

function getFirstUnscoredHole(holes: HoleScore[]): number {
  const byNumber: Record<number, HoleScore> = {};
  holes.forEach((h) => {
    byNumber[h.holeNumber] = h;
  });
  for (let n = 1; n <= 18; n++) {
    if (byNumber[n]?.grossScore == null) return n;
  }
  return 18;
}

// A hole only counts toward a nine's running total once the marker has
// moved past it — the active hole always shows as pending ("•") in the
// strip, matching the live-scoring hero above it.
function computeNineTotals(holesInNine: HoleScore[], activeHole: number) {
  const scored = holesInNine.filter(
    (h) => h.holeNumber !== activeHole && h.grossScore != null
  );
  const points = scored.reduce((sum, h) => sum + (h.stablefordPoints ?? 0), 0);
  return { points, thru: scored.length };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function HoleStrip({
  label,
  holes,
  activeHole,
  totals,
  onSelect,
}: {
  label: string;
  holes: HoleScore[];
  activeHole: number;
  totals: { points: number; thru: number };
  onSelect: (holeNumber: number) => void;
}) {
  return (
    <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-overlay p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wide text-ink-hint">
          {label}
        </h2>
        <p className="text-sm text-ink-muted">
          Total <span className="font-bold text-brand-600">{totals.points}</span>{" "}
          pts thru {totals.thru}
        </p>
      </div>
      <div className="grid grid-cols-9 gap-1.5">
        {holes.map((hole) => (
          <HoleStripCell
            key={hole.holeNumber}
            hole={hole}
            isActive={hole.holeNumber === activeHole}
            onSelect={() => onSelect(hole.holeNumber)}
          />
        ))}
      </div>
    </div>
  );
}

function HoleStripCell({
  hole,
  isActive,
  onSelect,
}: {
  hole: HoleScore;
  isActive: boolean;
  onSelect: () => void;
}) {
  const display = isActive
    ? "•"
    : hole.grossScore != null
    ? hole.stablefordPoints ?? "–"
    : "–";
  const sidePrizeTag = hole.isNTP
    ? "NTP"
    : hole.isLD
    ? "LD"
    : hole.isT2
    ? "T2"
    : hole.isT3
    ? "T3"
    : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Hole ${hole.holeNumber}${sidePrizeTag ? `, ${sidePrizeTag}` : ""}`}
      className={`relative rounded-lg py-1.5 text-center transition-colors ${
        isActive
          ? "bg-brand-500 text-white"
          : "bg-surface-muted text-ink-body hover:bg-surface-overlay"
      }`}
    >
      {sidePrizeTag && (
        <span className="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-amber-400" />
      )}
      <span className="block text-[11px] font-semibold opacity-80">
        {hole.holeNumber}
      </span>
      <span className="block text-sm font-bold font-mono">{display}</span>
    </button>
  );
}

function SideClaimSelect({
  label,
  claim,
  members,
  disabled,
  saving,
  onChange,
}: {
  label: string;
  claim: SideClaim | null;
  members: AppUser[];
  disabled: boolean;
  saving: boolean;
  onChange: (winnerId: string) => void;
}) {
  return (
    <label className="block rounded-xl bg-surface-muted px-3 py-2">
      <span className="block text-sm font-medium text-ink-title">{label}</span>
      <span className="block text-sm text-ink-muted mb-1">
        Current holder: {claim?.winnerName ?? "Not set"}
      </span>
      <select
        value={claim?.winnerId ?? ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled || saving}
        className="w-full rounded-lg border border-surface-overlay bg-surface-card px-3 py-2 text-sm text-ink-title disabled:bg-surface-muted disabled:text-ink-hint"
      >
        <option value="">No winner selected</option>
        {members.map((member) => (
          <option key={member.uid} value={member.uid}>
            {member.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}
