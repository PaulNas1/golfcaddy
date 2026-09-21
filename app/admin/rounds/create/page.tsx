"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { createRound, getRounds, subscribeGroup } from "@/lib/firestore";
import CreateRoundForm, {
  type CreateRoundPayload,
} from "@/components/admin/CreateRoundForm";
import type { Round, ScoringFormat } from "@/types";

export default function CreateRoundPage() {
  const { appUser } = useAuth();
  const router = useRouter();

  const [activeSeason, setActiveSeason] = useState<number | null>(null);
  const [defaultFormat, setDefaultFormat] = useState<ScoringFormat>("stableford");
  const [initialRoundNumber, setInitialRoundNumber] = useState("1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!appUser?.groupId) return;

    return subscribeGroup(
      appUser.groupId,
      (group) => {
        const season = group?.currentSeason ?? new Date().getFullYear();
        setActiveSeason(season);
        if (group?.settings?.defaultScoringFormat) {
          setDefaultFormat(group.settings.defaultScoringFormat);
        }
        getRounds(appUser.groupId)
          .then((existingRounds) => {
            const seasonRounds = existingRounds.filter((r) => r.season === season);
            const maxNumber = seasonRounds.reduce(
              (max, r) => Math.max(max, r.roundNumber),
              0
            );
            setInitialRoundNumber(String(maxNumber + 1));
          })
          .catch(() => {});
      },
      () => {
        setActiveSeason(new Date().getFullYear());
      }
    );
  }, [appUser?.groupId]);

  const handleCreate = async (payload: CreateRoundPayload) => {
    if (!activeSeason) {
      setError("Season still loading.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      // Everything create no longer asks for starts empty and is set on the
      // round page: notes, tee times, and whether players get notified.
      const roundData: Omit<Round, "id" | "createdAt" | "updatedAt"> = {
        groupId: appUser!.groupId,
        ...payload,
        roundName: null,
        playerTeeAssignments: {},
        season: activeSeason,
        status: "upcoming",
        notes: null,
        teeTimes: [],
        rsvpOpen: false,
        rsvpNotifiedAt: null,
        holeOverrides: [],
        scorecardsAvailable: true,
        resultsPublished: false,
        resultsPublishedAt: null,
        createdBy: appUser!.uid,
      };

      const roundId = await createRound(roundData);
      router.push(`/admin/rounds/${roundId}`);
    } catch {
      setError("Failed to create round. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink-title">Create Round</h1>
        {activeSeason != null && (
          <span className="shrink-0 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-ink-muted">
            Season {activeSeason}
          </span>
        )}
      </div>

      <CreateRoundForm
        initialRoundNumber={initialRoundNumber}
        defaultFormat={defaultFormat}
        onCreate={handleCreate}
        saving={saving}
        error={error}
      />
    </div>
  );
}
