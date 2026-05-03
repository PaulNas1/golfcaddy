"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  createRound,
  getActiveMembers,
  getRounds,
  notifyRoundPlayers,
  subscribeGroup,
} from "@/lib/firestore";
import RoundDetailsForm, {
  type RoundFormSavePayload,
} from "@/components/admin/RoundDetailsForm";
import type { AppUser, Round } from "@/types";

export default function CreateRoundPage() {
  const { appUser } = useAuth();
  const router = useRouter();

  const [members, setMembers] = useState<AppUser[]>([]);
  const [activeSeason, setActiveSeason] = useState<number | null>(null);
  const [initialRoundNumber, setInitialRoundNumber] = useState("1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getActiveMembers(appUser?.groupId ?? "fourplay")
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [appUser?.groupId]);

  useEffect(() => {
    if (!appUser?.groupId) return;

    return subscribeGroup(
      appUser.groupId,
      (group) => {
        const season = group?.currentSeason ?? new Date().getFullYear();
        setActiveSeason(season);
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

  const handleCreate = async (payload: RoundFormSavePayload, notifyPlayers: boolean) => {
    if (!activeSeason) {
      setError("Season still loading.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const roundData: Omit<Round, "id" | "createdAt" | "updatedAt"> = {
        groupId: appUser!.groupId,
        ...payload,
        roundName: null,
        playerTeeAssignments: {},
        season: activeSeason,
        status: "upcoming",
        rsvpOpen: notifyPlayers,
        rsvpNotifiedAt: null,
        holeOverrides: [],
        scorecardsAvailable: true,
        resultsPublished: false,
        resultsPublishedAt: null,
        createdBy: appUser!.uid,
      };
      const roundId = await createRound(roundData);
      if (notifyPlayers) {
        await notifyRoundPlayers({
          round: { id: roundId, ...roundData, createdAt: new Date(), updatedAt: new Date() },
          activeUsers: members,
          mode: "created",
        });
      }
      router.push("/admin/rounds");
    } catch {
      setError("Failed to create round. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 pb-8">
      <h1 className="text-2xl font-bold text-gray-800">Create Round</h1>
      <RoundDetailsForm
        activeSeason={activeSeason}
        initialRoundNumber={initialRoundNumber}
        members={members}
        assignableMembers={[]}
        emptyPlayersMessage="Players appear here after the round is created, invites are sent, and members RSVP."
        playersSummary="Players can be assigned after the round is created and members RSVP."
        onSave={handleCreate}
        saving={saving}
        error={error}
      />
    </div>
  );
}
