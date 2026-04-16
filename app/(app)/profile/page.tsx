"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  getGroup,
  getMember,
  getSeasonStandingForMember,
  updateUser,
} from "@/lib/firestore";
import type { Member, SeasonStanding, UserGender } from "@/types";

export default function ProfilePage() {
  const { appUser, signOut } = useAuth();
  const router = useRouter();
  const [member, setMember] = useState<Member | null>(null);
  const [standing, setStanding] = useState<SeasonStanding | null>(null);
  const [season, setSeason] = useState(new Date().getFullYear());
  const [loadingStats, setLoadingStats] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileDraft, setProfileDraft] = useState({
    displayName: appUser?.displayName ?? "",
    nickname: appUser?.nickname ?? "",
    avatarUrl: appUser?.avatarUrl ?? "",
    address: appUser?.address ?? "",
    mobileNumber: appUser?.mobileNumber ?? "",
    dateOfBirth: appUser?.dateOfBirth ?? "",
    gender: appUser?.gender ?? "",
    usesSeniorTees: appUser?.usesSeniorTees ?? false,
    usesProBackTees: appUser?.usesProBackTees ?? false,
  });

  useEffect(() => {
    const load = async () => {
      if (!appUser?.uid || !appUser.groupId) return;
      try {
        const group = await getGroup();
        const currentSeason = group?.currentSeason ?? new Date().getFullYear();
        const [memberRecord, seasonStanding] = await Promise.all([
          getMember(appUser.uid),
          getSeasonStandingForMember(
            appUser.groupId,
            currentSeason,
            appUser.uid
          ),
        ]);
        setSeason(currentSeason);
        setMember(memberRecord);
        setStanding(seasonStanding);
      } finally {
        setLoadingStats(false);
      }
    };
    load();
  }, [appUser?.groupId, appUser?.uid]);

  useEffect(() => {
    setProfileDraft({
      displayName: appUser?.displayName ?? "",
      nickname: appUser?.nickname ?? "",
      avatarUrl: appUser?.avatarUrl ?? "",
      address: appUser?.address ?? "",
      mobileNumber: appUser?.mobileNumber ?? "",
      dateOfBirth: appUser?.dateOfBirth ?? "",
      gender: appUser?.gender ?? "",
      usesSeniorTees: appUser?.usesSeniorTees ?? false,
      usesProBackTees: appUser?.usesProBackTees ?? false,
    });
  }, [appUser]);

  const handleSignOut = async () => {
    await signOut();
    router.replace("/signin");
  };

  const handleSaveProfile = async () => {
    if (!appUser) return;
    setSavingProfile(true);
    setProfileSuccess("");
    setProfileError("");
    try {
      await updateUser(appUser.uid, {
        displayName: profileDraft.displayName.trim() || appUser.displayName,
        nickname: profileDraft.nickname.trim() || null,
        avatarUrl: profileDraft.avatarUrl.trim() || null,
        address: profileDraft.address.trim() || null,
        mobileNumber: profileDraft.mobileNumber.trim() || null,
        dateOfBirth: profileDraft.dateOfBirth || null,
        gender: profileDraft.gender
          ? (profileDraft.gender as UserGender)
          : null,
        usesSeniorTees: profileDraft.usesSeniorTees,
        usesProBackTees: profileDraft.usesProBackTees,
      });
      setEditingProfile(false);
      setProfileSuccess("Profile updated");
      setTimeout(() => setProfileSuccess(""), 3000);
    } catch {
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
          {profileDraft.avatarUrl ? (
            <div
              className="h-16 w-16 rounded-full bg-cover bg-center"
              style={{ backgroundImage: `url(${profileDraft.avatarUrl})` }}
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
            onClick={() => setEditingProfile((value) => !value)}
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
            <ProfileInput
              label="Photo URL"
              value={profileDraft.avatarUrl}
              onChange={(value) =>
                setProfileDraft((current) => ({ ...current, avatarUrl: value }))
              }
            />
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
          <h3 className="font-semibold text-gray-800">Season {season}</h3>
          <Link href="/leaderboard" className="text-green-600 text-sm">
            Ladder
          </Link>
        </div>

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
              />
              <StatCard
                label="Points"
                value={String(standing?.totalPoints ?? member?.seasonPoints ?? 0)}
              />
              <StatCard
                label="Handicap"
                value={String(member?.currentHandicap ?? "—")}
              />
              <StatCard
                label="Rounds"
                value={String(standing?.roundsPlayed ?? member?.roundsPlayed ?? 0)}
              />
              <StatCard
                label="Avg Stableford"
                value={String(member?.avgStableford ?? "—")}
              />
              <StatCard
                label="Best Stableford"
                value={String(member?.bestStableford ?? "—")}
              />
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-800 mb-2">
                Side Prizes
              </h4>
              <div className="flex flex-wrap gap-2">
                <SidePrizePill
                  label="NTP"
                  value={standing?.ntpWinsSeason ?? member?.ntpWins ?? 0}
                />
                <SidePrizePill
                  label="LD"
                  value={standing?.ldWinsSeason ?? member?.ldWins ?? 0}
                />
                <SidePrizePill
                  label="T2"
                  value={standing?.t2WinsSeason ?? member?.t2Wins ?? 0}
                />
                <SidePrizePill
                  label="T3"
                  value={standing?.t3WinsSeason ?? member?.t3Wins ?? 0}
                />
              </div>
            </div>

            {standing && standing.roundResults.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-800 mb-2">
                  Recent Results
                </h4>
                <div className="divide-y divide-gray-100 rounded-xl border border-gray-100">
                  {standing.roundResults.slice(0, 5).map((roundResult) => (
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
                          {roundResult.pointsAwarded} pts
                        </p>
                        {!roundResult.countsForSeason && (
                          <p className="text-xs text-gray-400">
                            not counted
                          </p>
                        )}
                        {roundResult.stableford > 0 && (
                          <p className="text-xs text-gray-400">
                            {roundResult.stableford} stb
                          </p>
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

function SidePrizePill({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
      {label} {value}
    </span>
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-gray-800">{value}</p>
    </div>
  );
}
