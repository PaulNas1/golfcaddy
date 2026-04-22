"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  getLatestHandicapHistoryForMemberSeason,
  subscribeGroup,
  subscribeMember,
  subscribeRoundsForGroup,
  subscribeSeasonStandingForMember,
  updateUser,
} from "@/lib/firestore";
import {
  deleteStoredImage,
  uploadUserAvatarImage,
  validateImageFile,
} from "@/lib/storageUploads";
import type {
  HandicapHistory,
  Member,
  SeasonStanding,
  UserGender,
} from "@/types";

export default function ProfilePage() {
  const { appUser, signOut } = useAuth();
  const router = useRouter();
  const [member, setMember] = useState<Member | null>(null);
  const [standing, setStanding] = useState<SeasonStanding | null>(null);
  const [currentSeason, setCurrentSeason] = useState(new Date().getFullYear());
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [availableSeasons, setAvailableSeasons] = useState<number[]>([]);
  const [latestHandicapHistory, setLatestHandicapHistory] =
    useState<HandicapHistory | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState("");
  const [profileError, setProfileError] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(
    appUser?.avatarUrl ?? ""
  );
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [profileDraft, setProfileDraft] = useState({
    displayName: appUser?.displayName ?? "",
    nickname: appUser?.nickname ?? "",
    address: appUser?.address ?? "",
    mobileNumber: appUser?.mobileNumber ?? "",
    dateOfBirth: appUser?.dateOfBirth ?? "",
    gender: appUser?.gender ?? "",
    usesSeniorTees: appUser?.usesSeniorTees ?? false,
    usesProBackTees: appUser?.usesProBackTees ?? false,
  });

  useEffect(() => {
    if (!appUser?.uid || !appUser.groupId) return;

    const groupUnsubscribe = subscribeGroup(
      appUser.groupId,
      (group) => {
        const nextCurrentSeason = group?.currentSeason ?? new Date().getFullYear();
        setCurrentSeason(nextCurrentSeason);
        setSelectedSeason((current) => current ?? nextCurrentSeason);
      },
      (err) => {
        console.warn("Unable to subscribe to group", err);
        setLoadingStats(false);
      }
    );

    const roundsUnsubscribe = subscribeRoundsForGroup(
      appUser.groupId,
      (rounds) => {
        const seasons = Array.from(
          new Set(rounds.map((round) => round.season))
        ).sort((a, b) => b - a);
        setAvailableSeasons(seasons);
      },
      (err) => console.warn("Unable to subscribe to rounds", err)
    );

    const memberUnsubscribe = subscribeMember(
      appUser.uid,
      setMember,
      (err) => console.warn("Unable to subscribe to member stats", err)
    );

    return () => {
      groupUnsubscribe();
      roundsUnsubscribe();
      memberUnsubscribe();
    };
  }, [appUser?.groupId, appUser?.uid]);

  useEffect(() => {
    if (!appUser?.uid || !appUser.groupId || selectedSeason == null) return;

    setLoadingStats(true);
    return subscribeSeasonStandingForMember(
      appUser.groupId,
      selectedSeason,
      appUser.uid,
      (seasonStanding) => {
        setStanding(seasonStanding);
        setLoadingStats(false);
      },
      (err) => {
        console.warn("Unable to subscribe to season standing", err);
        setLoadingStats(false);
      }
    );
  }, [appUser?.groupId, appUser?.uid, selectedSeason]);

  useEffect(() => {
    if (!appUser?.uid || !appUser.groupId || selectedSeason == null) {
      setLatestHandicapHistory(null);
      return;
    }

    let cancelled = false;
    getLatestHandicapHistoryForMemberSeason(
      appUser.groupId,
      appUser.uid,
      selectedSeason
    )
      .then((history) => {
        if (!cancelled) setLatestHandicapHistory(history);
      })
      .catch((err) => {
        console.warn("Unable to load handicap history", err);
        if (!cancelled) setLatestHandicapHistory(null);
      });

    return () => {
      cancelled = true;
    };
  }, [appUser?.groupId, appUser?.uid, selectedSeason]);

  useEffect(() => {
    setProfileDraft({
      displayName: appUser?.displayName ?? "",
      nickname: appUser?.nickname ?? "",
      address: appUser?.address ?? "",
      mobileNumber: appUser?.mobileNumber ?? "",
      dateOfBirth: appUser?.dateOfBirth ?? "",
      gender: appUser?.gender ?? "",
      usesSeniorTees: appUser?.usesSeniorTees ?? false,
      usesProBackTees: appUser?.usesProBackTees ?? false,
    });
    setAvatarPreviewUrl(appUser?.avatarUrl ?? "");
    setAvatarFile(null);
    setAvatarRemoved(false);
  }, [appUser]);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  const memberSeasonMatches = member?.seasonYear === selectedSeason;
  const fallbackSeasonPoints = memberSeasonMatches ? member?.seasonPoints ?? 0 : 0;
  const fallbackRoundsPlayed = memberSeasonMatches ? member?.roundsPlayed ?? 0 : 0;
  const fallbackAverageStableford = memberSeasonMatches
    ? member?.avgStableford ?? "—"
    : "—";
  const fallbackBestStableford = memberSeasonMatches
    ? member?.bestStableford ?? "—"
    : "—";
  const fallbackNtpWins = memberSeasonMatches ? member?.ntpWins ?? 0 : 0;
  const fallbackLdWins = memberSeasonMatches ? member?.ldWins ?? 0 : 0;
  const fallbackT2Wins = memberSeasonMatches ? member?.t2Wins ?? 0 : 0;
  const fallbackT3Wins = memberSeasonMatches ? member?.t3Wins ?? 0 : 0;
  const seasonOptions = Array.from(
    new Set([
      ...(availableSeasons.length > 0 ? availableSeasons : [currentSeason]),
      currentSeason,
    ])
  ).sort((a, b) => b - a);
  const activeSeason = selectedSeason ?? currentSeason;
  const statRounds = standing?.roundResults ?? [];
  const displayedHandicap =
    latestHandicapHistory?.newHandicap ?? member?.currentHandicap ?? "—";
  const rankTrend = getRankTrend(standing);
  const handicapTrend = getHandicapTrend(
    latestHandicapHistory,
    standing?.roundsPlayed ?? fallbackRoundsPlayed
  );
  const averageTrend = getAverageStablefordTrend(statRounds);
  const bestTrend = getBestStablefordTrend(statRounds);

  const handleSignOut = async () => {
    await signOut();
    router.replace("/signin");
  };

  const resetProfileForm = () => {
    setProfileDraft({
      displayName: appUser?.displayName ?? "",
      nickname: appUser?.nickname ?? "",
      address: appUser?.address ?? "",
      mobileNumber: appUser?.mobileNumber ?? "",
      dateOfBirth: appUser?.dateOfBirth ?? "",
      gender: appUser?.gender ?? "",
      usesSeniorTees: appUser?.usesSeniorTees ?? false,
      usesProBackTees: appUser?.usesProBackTees ?? false,
    });
    setAvatarPreviewUrl(appUser?.avatarUrl ?? "");
    setAvatarFile(null);
    setAvatarRemoved(false);
    setProfileError("");
  };

  const handleAvatarFileChange = (file: File | null) => {
    if (!file) return;

    const validationError = validateImageFile(file);
    if (validationError) {
      setProfileError(validationError);
      return;
    }

    setProfileError("");
    const previewUrl = URL.createObjectURL(file);
    setAvatarPreviewUrl((current) => {
      if (current.startsWith("blob:")) {
        URL.revokeObjectURL(current);
      }
      return previewUrl;
    });
    setAvatarFile(file);
    setAvatarRemoved(false);
  };

  const handleRemoveAvatar = () => {
    setAvatarPreviewUrl((current) => {
      if (current.startsWith("blob:")) {
        URL.revokeObjectURL(current);
      }
      return "";
    });
    setAvatarFile(null);
    setAvatarRemoved(true);
    setProfileError("");
  };

  const handleSaveProfile = async () => {
    if (!appUser) return;
    setSavingProfile(true);
    setProfileSuccess("");
    setProfileError("");
    let uploadedAvatarPath: string | null = null;
    try {
      let nextAvatarUrl = avatarRemoved ? null : appUser.avatarUrl ?? null;
      let nextAvatarPath = avatarRemoved ? null : appUser.avatarPath ?? null;
      let previousAvatarPathToDelete: string | null = null;

      if (avatarFile) {
        const uploaded = await uploadUserAvatarImage(appUser.uid, avatarFile);
        uploadedAvatarPath = uploaded.path;
        nextAvatarUrl = uploaded.url;
        nextAvatarPath = uploaded.path;
        previousAvatarPathToDelete = appUser.avatarPath ?? null;
      } else if (avatarRemoved) {
        previousAvatarPathToDelete = appUser.avatarPath ?? null;
      }

      await updateUser(appUser.uid, {
        displayName: profileDraft.displayName.trim() || appUser.displayName,
        nickname: profileDraft.nickname.trim() || null,
        avatarUrl: nextAvatarUrl,
        avatarPath: nextAvatarPath,
        address: profileDraft.address.trim() || null,
        mobileNumber: profileDraft.mobileNumber.trim() || null,
        dateOfBirth: profileDraft.dateOfBirth || null,
        gender: profileDraft.gender
          ? (profileDraft.gender as UserGender)
          : null,
        usesSeniorTees: profileDraft.usesSeniorTees,
        usesProBackTees: profileDraft.usesProBackTees,
      });
      if (
        previousAvatarPathToDelete &&
        previousAvatarPathToDelete !== nextAvatarPath
      ) {
        await deleteStoredImage(previousAvatarPathToDelete);
      }
      setAvatarPreviewUrl(nextAvatarUrl ?? "");
      setAvatarFile(null);
      setAvatarRemoved(false);
      setEditingProfile(false);
      setProfileSuccess("Profile updated");
      setTimeout(() => setProfileSuccess(""), 3000);
    } catch {
      if (uploadedAvatarPath) {
        await deleteStoredImage(uploadedAvatarPath);
      }
      setProfileError("Failed to update profile. Please try again.");
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="px-4 py-6 space-y-4 pb-8">
      <h1 className="text-2xl font-bold text-gray-800">Profile</h1>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center gap-4">
          {avatarPreviewUrl ? (
            <div
              className="h-16 w-16 rounded-full bg-cover bg-center"
              style={{ backgroundImage: `url(${avatarPreviewUrl})` }}
              role="img"
              aria-label="Profile photo"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-2xl font-bold text-green-700">
              {profileDraft.displayName.charAt(0).toUpperCase() || "?"}
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-800 truncate">
              {profileDraft.displayName || appUser?.displayName}
            </h2>
            <p className="text-gray-500 text-sm truncate">{appUser?.email}</p>
            <span className="mt-1 inline-block text-xs font-medium px-2 py-0.5 bg-green-100 text-green-700 rounded-full capitalize">
              {appUser?.role}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-800">Player Profile</h3>
            <p className="text-xs text-gray-400">
              These details help admins review tee assignments.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (editingProfile) {
                resetProfileForm();
                setEditingProfile(false);
                return;
              }
              setEditingProfile(true);
            }}
            className="rounded-lg border border-green-200 px-3 py-1.5 text-xs font-semibold text-green-700"
          >
            {editingProfile ? "Cancel" : "Edit"}
          </button>
        </div>

        {profileSuccess && (
          <p className="mb-3 rounded-xl bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
            {profileSuccess}
          </p>
        )}
        {profileError && (
          <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {profileError}
          </p>
        )}

        {editingProfile ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <p className="text-xs font-medium text-gray-600">Profile photo</p>
              <div className="mt-3 flex items-center gap-3">
                {avatarPreviewUrl ? (
                  <div
                    className="h-14 w-14 rounded-full bg-cover bg-center"
                    style={{ backgroundImage: `url(${avatarPreviewUrl})` }}
                    role="img"
                    aria-label="Profile photo preview"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-lg font-bold text-green-700">
                    {profileDraft.displayName.charAt(0).toUpperCase() || "?"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) =>
                      handleAvatarFileChange(event.target.files?.[0] ?? null)
                    }
                    className="block w-full text-xs text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-green-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-green-700"
                  />
                  <p className="mt-1 text-[11px] text-gray-400">
                    JPG, PNG, or WebP up to 5 MB.
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600"
                >
                  Remove photo
                </button>
              </div>
            </div>
            <ProfileInput
              label="Name"
              value={profileDraft.displayName}
              onChange={(value) =>
                setProfileDraft((current) => ({ ...current, displayName: value }))
              }
            />
            <ProfileInput
              label="Nickname"
              value={profileDraft.nickname}
              onChange={(value) =>
                setProfileDraft((current) => ({ ...current, nickname: value }))
              }
            />
            <ProfileInput
              label="Address"
              value={profileDraft.address}
              onChange={(value) =>
                setProfileDraft((current) => ({ ...current, address: value }))
              }
            />
            <ProfileInput
              label="Mobile number"
              value={profileDraft.mobileNumber}
              inputMode="tel"
              onChange={(value) =>
                setProfileDraft((current) => ({
                  ...current,
                  mobileNumber: value,
                }))
              }
            />
            <ProfileInput
              label="Date of birth"
              type="date"
              value={profileDraft.dateOfBirth}
              onChange={(value) =>
                setProfileDraft((current) => ({
                  ...current,
                  dateOfBirth: value,
                }))
              }
            />
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">
                Gender
              </span>
              <select
                value={profileDraft.gender}
                onChange={(event) =>
                  setProfileDraft((current) => ({
                    ...current,
                    gender: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">Not set</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </label>
            <ToggleRow
              label="Do you regard yourself as a senior tee player?"
              checked={profileDraft.usesSeniorTees}
              onChange={(checked) =>
                setProfileDraft((current) => ({
                  ...current,
                  usesSeniorTees: checked,
                }))
              }
            />
            <ToggleRow
              label="Do you usually play pro/back tees?"
              checked={profileDraft.usesProBackTees}
              onChange={(checked) =>
                setProfileDraft((current) => ({
                  ...current,
                  usesProBackTees: checked,
                }))
              }
            />
            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="w-full rounded-xl bg-green-600 py-3 text-sm font-semibold text-white disabled:bg-green-300"
            >
              {savingProfile ? "Saving..." : "Save profile"}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <ProfileFact label="Nickname" value={profileDraft.nickname} />
            <ProfileFact label="Mobile" value={profileDraft.mobileNumber} />
            <ProfileFact label="Date of birth" value={profileDraft.dateOfBirth} />
            <ProfileFact
              label="Gender"
              value={
                profileDraft.gender
                  ? profileDraft.gender.charAt(0).toUpperCase() +
                    profileDraft.gender.slice(1)
                  : null
              }
            />
            <ProfileFact
              label="Senior tees"
              value={profileDraft.usesSeniorTees ? "Yes" : "No"}
            />
            <ProfileFact
              label="Pro/back tees"
              value={profileDraft.usesProBackTees ? "Yes" : "No"}
            />
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-gray-800">Season {activeSeason}</h3>
            <p className="text-xs text-gray-400">
              {activeSeason === currentSeason ? "Active season" : "Archived season"}
            </p>
          </div>
          <Link href="/leaderboard" className="text-green-600 text-sm">
            Ladder
          </Link>
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
            Season
          </span>
          <select
            value={activeSeason}
            onChange={(event) => setSelectedSeason(Number(event.target.value))}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {seasonOptions.map((season) => (
              <option key={season} value={season}>
                {season}
                {season === currentSeason ? " (Active)" : ""}
              </option>
            ))}
          </select>
        </label>

        {loadingStats ? (
          <div className="grid grid-cols-2 gap-3 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-gray-100" />
            ))}
          </div>
        ) : !standing && !member ? (
          <div className="flex flex-col items-center py-8 text-gray-400">
            <div className="text-4xl mb-2">📊</div>
            <p className="text-sm">Stats available after your first result</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Rank"
                value={standing ? `#${standing.currentRank}` : "—"}
                trend={rankTrend}
              />
              <StatCard
                label="Points"
                value={`${standing?.totalPoints ?? fallbackSeasonPoints} pts`}
              />
              <StatCard
                label="Handicap"
                value={String(displayedHandicap)}
                trend={handicapTrend}
              />
              <StatCard
                label="Rounds"
                value={String(standing?.roundsPlayed ?? fallbackRoundsPlayed)}
              />
              <StatCard
                label="Avg Stableford"
                value={String(fallbackAverageStableford)}
                trend={averageTrend}
              />
              <StatCard
                label="Best Stableford"
                value={String(fallbackBestStableford)}
                trend={bestTrend}
              />
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-800 mb-2">
                Side Prizes
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <SidePrizeTile
                  label="NTP"
                  value={standing?.ntpWinsSeason ?? fallbackNtpWins}
                />
                <SidePrizeTile
                  label="LD"
                  value={standing?.ldWinsSeason ?? fallbackLdWins}
                />
                <SidePrizeTile
                  label="T2"
                  value={standing?.t2WinsSeason ?? fallbackT2Wins}
                />
                <SidePrizeTile
                  label="T3"
                  value={standing?.t3WinsSeason ?? fallbackT3Wins}
                />
              </div>
            </div>

            {standing && standing.roundResults.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-800 mb-2">
                  Recent Results
                </h4>
                <div className="divide-y divide-gray-100 rounded-xl border border-gray-100">
                  {standing.roundResults.slice(0, 3).map((roundResult) => (
                    <Link
                      key={roundResult.roundId}
                      href={`/rounds/${roundResult.roundId}`}
                      className="flex items-center justify-between px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 truncate">
                          {roundResult.courseName}
                        </p>
                        <p className="text-xs text-gray-400">
                          Finish #{roundResult.finish}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-green-700">
                          {roundResult.stableford > 0
                            ? `${roundResult.stableford} stb`
                            : `${roundResult.pointsAwarded} pts`}
                        </p>
                        <p className="text-xs text-gray-400">
                          Finish #{roundResult.finish} · Result {roundResult.pointsAwarded} pts
                        </p>
                        {!roundResult.countsForSeason && (
                          <p className="text-xs text-gray-400">Not counted</p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <button
        onClick={handleSignOut}
        className="w-full py-3 border border-gray-200 rounded-2xl text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
      >
        Sign out
      </button>
    </div>
  );
}

function SidePrizeTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-green-50 px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-green-700">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-green-800">{value}</p>
    </div>
  );
}

function ProfileInput({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: "tel";
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600">
        {label}
      </span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
      />
    </label>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2">
      <span className="text-xs font-medium text-gray-700">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 rounded border-gray-300 text-green-600"
      />
    </label>
  );
}

function ProfileFact({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2">
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className="mt-0.5 truncate font-semibold text-gray-700">
        {value || "Not set"}
      </p>
    </div>
  );
}

type StatTrendTone = "positive" | "negative" | "neutral";

type StatTrend = {
  label: string;
  tone: StatTrendTone;
};

function StatCard({
  label,
  value,
  trend,
}: {
  label: string;
  value: string;
  trend?: StatTrend | null;
}) {
  const trendClass =
    trend?.tone === "positive"
      ? "text-green-700"
      : trend?.tone === "negative"
        ? "text-red-600"
        : "text-gray-400";

  return (
    <div className="rounded-xl bg-gray-50 px-3 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-gray-800">{value}</p>
      {trend && (
        <p className={`mt-1 text-[11px] font-medium ${trendClass}`}>
          {trend.label}
        </p>
      )}
    </div>
  );
}

function getRankTrend(
  standing: SeasonStanding | null
): StatTrend | null {
  if (!standing) return { label: "Unranked", tone: "neutral" };
  if (standing.previousRank == null) return { label: "New", tone: "neutral" };
  const diff = standing.previousRank - standing.currentRank;
  if (diff > 0) {
    return {
      label: `Up ${diff} ${diff === 1 ? "place" : "places"}`,
      tone: "positive",
    };
  }
  if (diff < 0) {
    return {
      label: `Down ${Math.abs(diff)} ${Math.abs(diff) === 1 ? "place" : "places"}`,
      tone: "negative",
    };
  }
  return { label: "Same rank", tone: "neutral" };
}

function getHandicapTrend(
  history: HandicapHistory | null,
  roundsPlayed: number
): StatTrend | null {
  if (!history || roundsPlayed < 2) {
    return { label: "—", tone: "neutral" };
  }
  const change = Number(
    Math.abs(history.newHandicap - history.previousHandicap).toFixed(1)
  );
  if (change === 0) return { label: "No change", tone: "neutral" };
  if (history.newHandicap < history.previousHandicap) {
    return { label: `↓ ${change}`, tone: "positive" };
  }
  return { label: `↑ ${change}`, tone: "negative" };
}

function getAverageStablefordTrend(roundResults: SeasonStanding["roundResults"]): StatTrend | null {
  const played = roundResults.filter((roundResult) => roundResult.stableford > 0);
  if (played.length < 2) return null;

  const currentAverage = Number(
    (
      played.reduce((sum, roundResult) => sum + roundResult.stableford, 0) /
      played.length
    ).toFixed(1)
  );
  const previousAverage = Number(
    (
      played
        .slice(1)
        .reduce((sum, roundResult) => sum + roundResult.stableford, 0) /
      (played.length - 1)
    ).toFixed(1)
  );

  if (currentAverage > previousAverage) {
    return {
      label: `↑ ${Number((currentAverage - previousAverage).toFixed(1))} vs last`,
      tone: "positive",
    };
  }
  if (currentAverage < previousAverage) {
    return {
      label: `↓ ${Number((previousAverage - currentAverage).toFixed(1))} vs last`,
      tone: "negative",
    };
  }
  return { label: "No change", tone: "neutral" };
}

function getBestStablefordTrend(roundResults: SeasonStanding["roundResults"]): StatTrend | null {
  const played = roundResults.filter((roundResult) => roundResult.stableford > 0);
  if (played.length < 2) return null;

  const currentBest = Math.max(...played.map((roundResult) => roundResult.stableford));
  const previousBest = Math.max(
    ...played.slice(1).map((roundResult) => roundResult.stableford)
  );

  if (currentBest > previousBest) {
    return {
      label: `↑ ${currentBest - previousBest} vs last`,
      tone: "positive",
    };
  }
  if (currentBest < previousBest) {
    return {
      label: `↓ ${previousBest - currentBest} vs last`,
      tone: "negative",
    };
  }
  return { label: "Matched best", tone: "neutral" };
}
