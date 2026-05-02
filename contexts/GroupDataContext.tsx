"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  subscribeMembersForGroup,
  subscribeActiveMembers,
  subscribeGroup,
  subscribeRoundsForGroup,
  subscribeSeasonStandings,
} from "@/lib/firestore";
import { useAuth } from "@/contexts/AuthContext";
import type { AppUser, Group, Member, Round, SeasonStanding } from "@/types";

interface GroupDataContextType {
  group: Group | null;
  rounds: Round[];
  activeMembers: AppUser[];
  groupMembers: Member[];
  currentSeason: number;
  /**
   * All seasons that have at least one round, sorted descending (newest first).
   * The current season is always included even if it has no rounds yet.
   */
  availableSeasons: number[];
  currentSeasonStandings: SeasonStanding[];
  loading: boolean;
}

const GroupDataContext = createContext<GroupDataContextType | undefined>(undefined);

export function GroupDataProvider({ children }: { children: React.ReactNode }) {
  const { appUser } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [activeMembers, setActiveMembers] = useState<AppUser[]>([]);
  const [groupMembers, setGroupMembers] = useState<Member[]>([]);
  const [currentSeason, setCurrentSeason] = useState(new Date().getFullYear());
  const [currentSeasonStandings, setCurrentSeasonStandings] = useState<SeasonStanding[]>([]);
  const [loading, setLoading] = useState(true);

  /** Derived: seasons that appear in rounds data + the active season, newest first */
  const availableSeasons = useMemo(() => {
    const seasonSet = new Set(rounds.map((r) => r.season));
    seasonSet.add(currentSeason);
    return Array.from(seasonSet).sort((a, b) => b - a);
  }, [rounds, currentSeason]);

  useEffect(() => {
    if (!appUser?.groupId) return;

    const groupId = appUser.groupId;
    let standingsUnsub: (() => void) | null = null;

    const groupUnsub = subscribeGroup(
      groupId,
      (nextGroup) => {
        setGroup(nextGroup);
        const season = nextGroup?.currentSeason ?? new Date().getFullYear();
        setCurrentSeason(season);
        standingsUnsub?.();
        standingsUnsub = subscribeSeasonStandings(
          groupId,
          season,
          setCurrentSeasonStandings,
          (err) => console.warn("GroupDataContext: standings error", err)
        );
      },
      (err) => console.warn("GroupDataContext: group error", err)
    );

    const roundsUnsub = subscribeRoundsForGroup(
      groupId,
      (nextRounds) => {
        setRounds(nextRounds);
        setLoading(false);
      },
      (err) => {
        console.warn("GroupDataContext: rounds error", err);
        setLoading(false);
      }
    );

    const activeMembersUnsub = subscribeActiveMembers(
      groupId,
      setActiveMembers,
      (err) => console.warn("GroupDataContext: active members error", err)
    );

    const groupMembersUnsub = subscribeMembersForGroup(
      groupId,
      setGroupMembers,
      (err) => console.warn("GroupDataContext: group members error", err)
    );

    return () => {
      groupUnsub();
      roundsUnsub();
      activeMembersUnsub();
      groupMembersUnsub();
      standingsUnsub?.();
    };
  }, [appUser?.groupId]);

  return (
    <GroupDataContext.Provider
      value={{
        group,
        rounds,
        activeMembers,
        groupMembers,
        currentSeason,
        availableSeasons,
        currentSeasonStandings,
        loading,
      }}
    >
      {children}
    </GroupDataContext.Provider>
  );
}

export function useGroupData() {
  const ctx = useContext(GroupDataContext);
  if (!ctx) throw new Error("useGroupData must be used within GroupDataProvider");
  return ctx;
}
