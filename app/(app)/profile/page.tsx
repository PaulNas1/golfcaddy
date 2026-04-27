"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { format } from "date-fns";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword as updateFirebasePassword,
  verifyBeforeUpdateEmail,
} from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { auth } from "@/lib/firebase";
import {
  getHandicapHistoryForMemberSeason,
  getSeasonStandingForMember,
  subscribeActiveMembers,
  subscribeGroup,
  subscribeMember,
  subscribeRoundsForGroup,
  subscribeSeasonStandings,
  updateUser,
} from "@/lib/firestore";
import {
  getVisibleSeasonStandings,
  type VisibleSeasonStanding,
} from "@/lib/standingsDisplay";
import {
  deleteStoredImage,
  uploadUserAvatarImage,
  validateImageFile,
} from "@/lib/storageUploads";
import type {
  AppUser,
  HandicapHistory,
  Member,
  Round,
  RoundResult,
  SeasonStanding,
  UserGender,
} from "@/types";

export default function ProfilePage() {
  const { appUser, firebaseUser, signOut } = useAuth();
  const router = useRouter();
  const [activeMembers, setActiveMembers] = useState<AppUser[]>([]);
  const [member, setMember] = useState<Member | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [seasonStandings, setSeasonStandings] = useState<SeasonStanding[]>([]);
  const [currentSeason, setCurrentSeason] = useState(new Date().getFullYear());
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [availableSeasons, setAvailableSeasons] = useState<number[]>([]);
  const [historyStandingsBySeason, setHistoryStandingsBySeason] = useState<
    Record<number, SeasonStanding | null>
  >({});
  const [seasonHandicapHistory, setSeasonHandicapHistory] = useState<
    HandicapHistory[]
  >([]);
  const [latestHandicapHistory, setLatestHandicapHistory] =
    useState<HandicapHistory | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [recentResultsOpen, setRecentResultsOpen] = useState(false);
  const [seasonArchiveOpen, setSeasonArchiveOpen] = useState(false);
  const [archiveSeasonOpen, setArchiveSeasonOpen] = useState<Record<number, boolean>>(
    {}
  );
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState("");
  const [profileError, setProfileError] = useState("");
  const [accountSuccess, setAccountSuccess] = useState("");
  const [accountError, setAccountError] = useState("");
  const [emailDraft, setEmailDraft] = useState(appUser?.email ?? "");
  const [emailPassword, setEmailPassword] = useState("");
  const [passwordCurrent, setPasswordCurrent] = useState("");
  const [passwordNext, setPasswordNext] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [accountSecurityOpen, setAccountSecurityOpen] = useState(false);
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
        setRounds(rounds);
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
    const activeMembersUnsubscribe = subscribeActiveMembers(
      appUser.groupId,
      setActiveMembers,
      (err) => console.warn("Unable to subscribe to active members", err)
    );

    return () => {
      groupUnsubscribe();
      roundsUnsubscribe();
      memberUnsubscribe();
      activeMembersUnsubscribe();
    };
  }, [appUser?.groupId, appUser?.uid]);

  useEffect(() => {
    if (!appUser?.uid || !appUser.groupId || selectedSeason == null) return;

    setLoadingStats(true);
    return subscribeSeasonStandings(
      appUser.groupId,
      selectedSeason,
      (nextStandings) => {
        setSeasonStandings(nextStandings);
        setLoadingStats(false);
      },
      (err) => {
        console.warn("Unable to subscribe to season standings", err);
        setLoadingStats(false);
      }
    );
  }, [appUser?.groupId, appUser?.uid, selectedSeason]);

  useEffect(() => {
    if (!appUser?.uid || !appUser.groupId || selectedSeason == null) {
      setLatestHandicapHistory(null);
      setSeasonHandicapHistory([]);
      return;
    }

    let cancelled = false;
    getHandicapHistoryForMemberSeason(appUser.groupId, appUser.uid, selectedSeason)
      .then((history) => {
        if (cancelled) return;
        setSeasonHandicapHistory(history);
        setLatestHandicapHistory(history[0] ?? null);
      })
      .catch((err) => {
        console.warn("Unable to load handicap history", err);
        if (!cancelled) {
          setLatestHandicapHistory(null);
          setSeasonHandicapHistory([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [appUser?.groupId, appUser?.uid, selectedSeason]);

  useEffect(() => {
    if (!appUser?.uid || !appUser.groupId) {
      setLoadingHistory(false);
      return;
    }

    let cancelled = false;
    const seasons = Array.from(
      new Set([
        ...(availableSeasons.length > 0 ? availableSeasons : [currentSeason]),
        currentSeason,
      ])
    ).sort((a, b) => b - a);

    setLoadingHistory(true);
    Promise.all(
      seasons.map(async (season) => [
        season,
        await getSeasonStandingForMember(appUser.groupId, season, appUser.uid),
      ] as const)
    )
      .then((entries) => {
        if (cancelled) return;
        setHistoryStandingsBySeason(Object.fromEntries(entries));
      })
      .catch((err) => {
        console.warn("Unable to load round history", err);
        if (!cancelled) setHistoryStandingsBySeason({});
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });

    return () => {
      cancelled = true;
    };
  }, [appUser?.groupId, appUser?.uid, availableSeasons, currentSeason]);

  useEffect(() => {
    if (selectedSeason == null || !appUser?.uid) return;

    setHistoryStandingsBySeason((current) => ({
      ...current,
      [selectedSeason]:
        seasonStandings.find((entry) => entry.memberId === appUser.uid) ?? null,
    }));
  }, [appUser?.uid, seasonStandings, selectedSeason]);

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
    setEmailDraft(appUser?.email ?? "");
  }, [appUser?.email]);

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
  const roundsById = useMemo(
    () => new Map(rounds.map((round) => [round.id, round])),
    [rounds]
  );
  const standing = useMemo(
    () =>
      getVisibleSeasonStandings(
        seasonStandings,
        new Set(activeMembers.map((member) => member.uid))
      ).find((entry) => entry.memberId === appUser?.uid) ?? null,
    [activeMembers, appUser?.uid, seasonStandings]
  );
  const statRounds = useMemo(
    () => standing?.roundResults ?? [],
    [standing]
  );
  const displayedHandicap =
    latestHandicapHistory?.newHandicap ?? member?.currentHandicap ?? "—";
  const rankTrend = getRankTrend(standing);
  const handicapTrend = getHandicapTrend(
    latestHandicapHistory,
    standing?.roundsPlayed ?? fallbackRoundsPlayed
  );
  const averageTrend = getAverageStablefordTrend(statRounds);
  const bestTrend = getBestStablefordTrend(statRounds);
  const seasonWins = useMemo(
    () => statRounds.filter((roundResult) => roundResult.finish === 1).length,
    [statRounds]
  );
  const seasonTopThreeFinishes = useMemo(
    () => statRounds.filter((roundResult) => roundResult.finish <= 3).length,
    [statRounds]
  );
  const activeSeasonResults = useMemo(
    () =>
      historyStandingsBySeason[currentSeason]?.roundResults
        ?.slice()
        .sort((a, b) => b.date.getTime() - a.date.getTime()) ?? [],
    [currentSeason, historyStandingsBySeason]
  );
  const archiveSeasons = useMemo(
    () =>
      seasonOptions.filter(
        (season) =>
          season !== currentSeason &&
          (historyStandingsBySeason[season]?.roundResults?.length ?? 0) > 0
      ),
    [currentSeason, historyStandingsBySeason, seasonOptions]
  );

  useEffect(() => {
    setArchiveSeasonOpen((current) => {
      const next = { ...current };
      archiveSeasons.forEach((season) => {
        if (next[season] == null) {
          next[season] = false;
        }
      });
      return next;
    });
  }, [archiveSeasons]);

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

  const handleUpdateEmail = async () => {
    const nextEmail = emailDraft.trim();

    if (!appUser || !firebaseUser || !auth.currentUser) return;
    if (!nextEmail) {
      setAccountError("Enter your email address.");
      return;
    }
    if (!emailPassword) {
      setAccountError("Enter your current password to change email.");
      return;
    }
    if (nextEmail.toLowerCase() === (appUser.email ?? "").toLowerCase()) {
      setAccountError("That email address is already on your account.");
      return;
    }

    setSavingEmail(true);
    setAccountError("");
    setAccountSuccess("");
    setAccountSecurityOpen(true);

    try {
      const credential = EmailAuthProvider.credential(
        firebaseUser.email ?? appUser.email,
        emailPassword
      );
      await reauthenticateWithCredential(auth.currentUser, credential);
      await verifyBeforeUpdateEmail(auth.currentUser, nextEmail);
      setEmailPassword("");
      setAccountSuccess(
        `Verification email sent to ${nextEmail}. Open it to finish changing your sign-in email.`
      );
      setTimeout(() => setAccountSuccess(""), 3000);
    } catch (error) {
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : "";
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (code === "auth/wrong-password" || code === "auth/invalid-credential" || message.includes("wrong-password") || message.includes("invalid-credential")) {
        setAccountError("Current password is incorrect.");
      } else if (code === "auth/email-already-in-use" || message.includes("email-already-in-use")) {
        setAccountError("That email is already in use.");
      } else if (code === "auth/invalid-email") {
        setAccountError("Enter a valid email address.");
      } else if (code === "auth/requires-recent-login") {
        setAccountError("Please sign in again before changing your email.");
      } else {
        setAccountError("Failed to send the email change verification. Please try again.");
      }
    } finally {
      setSavingEmail(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!appUser || !firebaseUser || !auth.currentUser) return;
    if (!passwordCurrent) {
      setAccountError("Enter your current password.");
      return;
    }
    if (passwordNext.length < 8) {
      setAccountError("New password must be at least 8 characters.");
      return;
    }
    if (passwordNext !== passwordConfirm) {
      setAccountError("New passwords do not match.");
      return;
    }

    setSavingPassword(true);
    setAccountError("");
    setAccountSuccess("");
    setAccountSecurityOpen(true);

    try {
      const credential = EmailAuthProvider.credential(
        firebaseUser.email ?? appUser.email,
        passwordCurrent
      );
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updateFirebasePassword(auth.currentUser, passwordNext);
      setPasswordCurrent("");
      setPasswordNext("");
      setPasswordConfirm("");
      setAccountSuccess("Password updated.");
      setTimeout(() => setAccountSuccess(""), 3000);
    } catch (error) {
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : "";
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (code === "auth/wrong-password" || code === "auth/invalid-credential" || message.includes("wrong-password") || message.includes("invalid-credential")) {
        setAccountError("Current password is incorrect.");
      } else if (code === "auth/weak-password") {
        setAccountError("Choose a stronger password.");
      } else if (code === "auth/requires-recent-login") {
        setAccountError("Please sign in again before changing your password.");
      } else {
        setAccountError("Failed to update password. Please try again.");
      }
    } finally {
      setSavingPassword(false);
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
                value={standing ? `#${standing.displayCurrentRank}` : "—"}
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

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-gray-800">
                    Handicap Trend
                  </h4>
                  <p className="text-[11px] text-gray-400">
                    {activeSeason === currentSeason
                      ? "Rolling handicap for the active season"
                      : `Archive history for Season ${activeSeason}`}
                  </p>
                </div>
              </div>
              <HandicapTrendChart history={seasonHandicapHistory} />
              {seasonHandicapHistory.length > 1 && (
                <div className="mt-3 grid gap-2">
                  {seasonHandicapHistory.slice(0, 4).map((history) => (
                    <div
                      key={history.id}
                      className="rounded-xl border border-gray-100 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">
                            {history.newHandicap}
                            <span className="ml-2 text-xs font-medium text-gray-400">
                              from {history.previousHandicap}
                            </span>
                          </p>
                          <p className="text-[11px] text-gray-400">
                            {history.roundDate
                              ? format(history.roundDate, "d MMM yyyy")
                              : "Manual update"}
                            {history.qualifyingRoundCount
                              ? ` · ${history.qualifyingRoundCount} qualifying rounds`
                              : ""}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                            isHistoryOfficial(history)
                              ? "bg-green-100 text-green-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {isHistoryOfficial(history) ? "Official" : "Provisional"}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-gray-500">
                        {history.reason}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold text-gray-800">
                Season Results
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  label="Wins"
                  value={String(seasonWins)}
                />
                <StatCard
                  label="Top 3 Finishes"
                  value={String(seasonTopThreeFinishes)}
                />
              </div>
            </div>

            {(activeSeasonResults.length > 0 || archiveSeasons.length > 0) && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold text-gray-800">
                    Full Round History
                  </h4>
                  <span className="text-[11px] text-gray-400">
                    {activeSeasonResults.length +
                      archiveSeasons.reduce(
                        (sum, season) =>
                          sum +
                          (historyStandingsBySeason[season]?.roundResults?.length ?? 0),
                        0
                      )}{" "}
                    rounds
                  </span>
                </div>
                <CollapsibleHistorySection
                  title="Recent Results"
                  subtitle={`Active season · ${activeSeasonResults.length} rounds`}
                  open={recentResultsOpen}
                  onToggle={() => setRecentResultsOpen((current) => !current)}
                >
                  {activeSeasonResults.length > 0 ? (
                    <div className="divide-y divide-gray-100 rounded-xl border border-gray-100">
                      {activeSeasonResults.map((roundResult) => (
                        <RoundHistoryRow
                          key={`active-${roundResult.roundId}`}
                          roundResult={roundResult}
                          round={roundsById.get(roundResult.roundId) ?? null}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-sm text-gray-500">
                      No active-season round results yet.
                    </p>
                  )}
                </CollapsibleHistorySection>

                <CollapsibleHistorySection
                  title="Season Archive"
                  subtitle={
                    archiveSeasons.length > 0
                      ? `${archiveSeasons.length} archived seasons`
                      : "No archived seasons yet"
                  }
                  open={seasonArchiveOpen}
                  onToggle={() => setSeasonArchiveOpen((current) => !current)}
                >
                  {archiveSeasons.length > 0 ? (
                    <div className="space-y-3">
                      {archiveSeasons.map((season) => {
                        const seasonResults =
                          historyStandingsBySeason[season]?.roundResults ?? [];
                        const seasonOpen = archiveSeasonOpen[season] ?? false;
                        return (
                          <div
                            key={season}
                            className="rounded-xl border border-gray-100"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setArchiveSeasonOpen((current) => ({
                                  ...current,
                                  [season]: !seasonOpen,
                                }))
                              }
                              className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
                            >
                              <div>
                                <p className="text-sm font-semibold text-gray-800">
                                  {season}
                                </p>
                                <p className="text-[11px] text-gray-400">
                                  {seasonResults.length} rounds
                                </p>
                              </div>
                              <span className="text-xs font-semibold text-gray-400">
                                {seasonOpen ? "Hide" : "Show"}
                              </span>
                            </button>
                            {seasonOpen && (
                              <div className="divide-y divide-gray-100 border-t border-gray-100">
                                {seasonResults.map((roundResult) => (
                                  <RoundHistoryRow
                                    key={`${season}-${roundResult.roundId}`}
                                    roundResult={roundResult}
                                    round={roundsById.get(roundResult.roundId) ?? null}
                                    archiveLabel="Archive"
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-sm text-gray-500">
                      No archived season results yet.
                    </p>
                  )}
                </CollapsibleHistorySection>

                {!loadingHistory && (
                  <p className="text-[11px] text-gray-400">
                    Each row links to the round and your archived scorecard.
                  </p>
                )}
              </div>
            )}

            {!standing &&
              !loadingStats &&
              activeSeasonResults.length === 0 &&
              archiveSeasons.length === 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-800 mb-2">
                  Recent Results
                </h4>
                <p className="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-sm text-gray-500">
                  No completed rounds in this season archive yet.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <button
          type="button"
          onClick={() => setAccountSecurityOpen((current) => !current)}
          className="flex w-full items-start justify-between gap-3 text-left"
          aria-expanded={accountSecurityOpen}
        >
          <div>
            <h3 className="font-semibold text-gray-800">Account Security</h3>
            <p className="text-xs text-gray-400">
              Change email or password when needed.
            </p>
          </div>
          <span className="rounded-full bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-500">
            {accountSecurityOpen ? "Hide" : "Manage"}
          </span>
        </button>

        {accountSecurityOpen && (
          <div className="mt-4 space-y-4">
            {accountSuccess && (
              <p className="rounded-xl bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
                {accountSuccess}
              </p>
            )}
            {accountError && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                {accountError}
              </p>
            )}

            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <h4 className="text-sm font-semibold text-gray-800">Email</h4>
              <p className="mt-1 text-xs text-gray-500">
                We’ll send a verification email before the address changes.
              </p>
              <div className="mt-3 space-y-3">
                <ProfileInput
                  label="Email address"
                  type="email"
                  inputMode="email"
                  value={emailDraft}
                  onChange={setEmailDraft}
                />
                <ProfileInput
                  label="Current password"
                  type="password"
                  value={emailPassword}
                  onChange={setEmailPassword}
                />
                <button
                  type="button"
                  onClick={handleUpdateEmail}
                  disabled={savingEmail}
                  className="w-full rounded-xl border border-green-200 py-2.5 text-sm font-semibold text-green-700 disabled:text-green-300"
                >
                  {savingEmail ? "Sending verification..." : "Verify new email"}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <h4 className="text-sm font-semibold text-gray-800">Password</h4>
              <p className="mt-1 text-xs text-gray-500">
                Choose a new password with at least 8 characters.
              </p>
              <div className="mt-3 space-y-3">
                <ProfileInput
                  label="Current password"
                  type="password"
                  value={passwordCurrent}
                  onChange={setPasswordCurrent}
                />
                <ProfileInput
                  label="New password"
                  type="password"
                  value={passwordNext}
                  onChange={setPasswordNext}
                />
                <ProfileInput
                  label="Confirm new password"
                  type="password"
                  value={passwordConfirm}
                  onChange={setPasswordConfirm}
                />
                <button
                  type="button"
                  onClick={handleUpdatePassword}
                  disabled={savingPassword}
                  className="w-full rounded-xl border border-green-200 py-2.5 text-sm font-semibold text-green-700 disabled:text-green-300"
                >
                  {savingPassword ? "Updating password..." : "Update password"}
                </button>
              </div>
            </div>
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
  inputMode?: "tel" | "email";
}) {
  const isDateInput = type === "date";
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
        className={`w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 ${
          isDateInput
            ? "text-left [&::-webkit-date-and-time-value]:block [&::-webkit-date-and-time-value]:text-left"
            : ""
        }`}
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

function HandicapTrendChart({ history }: { history: HandicapHistory[] }) {
  if (history.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 px-3 py-6 text-center text-sm text-gray-500">
        Handicap history will appear after published rounds land in this season.
      </div>
    );
  }

  if (history.length === 1) {
    const onlyEntry = history[0];
    return (
      <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-800">
              {onlyEntry.newHandicap}
              <span className="ml-2 text-xs font-medium text-gray-400">
                from {onlyEntry.previousHandicap}
              </span>
            </p>
            <p className="text-[11px] text-gray-400">
              {onlyEntry.roundDate
                ? format(onlyEntry.roundDate, "d MMM yyyy")
                : "Manual update"}
            </p>
          </div>
          <span
            className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
              isHistoryOfficial(onlyEntry)
                ? "bg-green-100 text-green-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {isHistoryOfficial(onlyEntry) ? "Official" : "Provisional"}
          </span>
        </div>
        <p className="mt-2 text-[11px] text-gray-500">
          We need more than one handicap update before a trend line is useful.
        </p>
      </div>
    );
  }

  const chronological = history
    .slice()
    .sort((a, b) =>
      (a.roundDate ?? a.createdAt).getTime() - (b.roundDate ?? b.createdAt).getTime()
    );
  const values = chronological.map((entry) => entry.newHandicap);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = 300;
  const height = 112;
  const padX = 18;
  const padY = 16;
  const usableWidth = width - padX * 2;
  const usableHeight = height - padY * 2;
  const yForValue = (value: number) => {
    if (max === min) return height / 2;
    return padY + ((max - value) / (max - min)) * usableHeight;
  };
  const points = chronological.map((entry, index) => {
    const x =
      chronological.length === 1
        ? width / 2
        : padX + (index / (chronological.length - 1)) * usableWidth;
    return `${x},${yForValue(entry.newHandicap)}`;
  });

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-28 w-full">
        <line
          x1={padX}
          x2={width - padX}
          y1={height - padY}
          y2={height - padY}
          stroke="#d1d5db"
          strokeWidth="1"
        />
        <polyline
          fill="none"
          stroke="#15803d"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points.join(" ")}
        />
        {chronological.map((entry, index) => {
          const x =
            chronological.length === 1
              ? width / 2
              : padX + (index / (chronological.length - 1)) * usableWidth;
          const y = yForValue(entry.newHandicap);
          return (
            <circle
              key={entry.id}
              cx={x}
              cy={y}
              r="4"
              fill={entry.officialAfterChange ? "#15803d" : "#f59e0b"}
            />
          );
        })}
      </svg>
      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400">
        <span>{format(chronological[0].roundDate ?? chronological[0].createdAt, "d MMM")}</span>
        <span>Lower is better</span>
        <span>
          {format(
            chronological[chronological.length - 1].roundDate ??
              chronological[chronological.length - 1].createdAt,
            "d MMM"
          )}
        </span>
      </div>
    </div>
  );
}

function CollapsibleHistorySection({
  title,
  subtitle,
  open,
  onToggle,
  children,
}: {
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-100">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
      >
        <div>
          <p className="text-sm font-semibold text-gray-800">{title}</p>
          <p className="text-[11px] text-gray-400">{subtitle}</p>
        </div>
        <span className="text-xs font-semibold text-gray-400">
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open && <div className="border-t border-gray-100 p-3">{children}</div>}
    </div>
  );
}

function RoundHistoryRow({
  roundResult,
  round,
  archiveLabel,
}: {
  roundResult: RoundResult;
  round: Round | null;
  archiveLabel?: string | null;
}) {
  return (
    <div className="px-3 py-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/rounds/${roundResult.roundId}`}
              className="truncate font-medium text-gray-800 underline-offset-2 hover:underline"
            >
              {roundResult.courseName}
            </Link>
            {archiveLabel && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                {archiveLabel}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400">
            {format(roundResult.date, "EEE d MMM yyyy")} · Finish #{roundResult.finish}
            {round?.roundNumber ? ` · Round ${round.roundNumber}` : ""}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {roundResult.pointsEligible === false
              ? roundResult.pointsIneligibleReason ??
                "Provisional - no ladder points yet"
              : `Result ${roundResult.pointsAwarded} pts`}
            {!roundResult.countsForSeason ? " · Not counted in best-of ladder" : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="font-semibold text-green-700">
            {roundResult.stableford > 0
              ? `${roundResult.stableford} stb`
              : `${roundResult.pointsAwarded} pts`}
          </p>
          <Link
            href={`/rounds/${roundResult.roundId}/my-card`}
            className="mt-1 inline-block text-[11px] font-semibold text-green-700 underline-offset-2 hover:underline"
          >
            My card
          </Link>
        </div>
      </div>
    </div>
  );
}

function isHistoryOfficial(history: HandicapHistory) {
  return (
    history.officialAfterChange ||
    history.source === "manual_admin" ||
    history.changeType === "manual_override" ||
    history.changeType === "initial_allocation"
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
  standing: VisibleSeasonStanding | null
): StatTrend | null {
  if (!standing) return { label: "Unranked", tone: "neutral" };
  if (standing.displayPreviousRank == null) return { label: "New", tone: "neutral" };
  const diff = standing.displayPreviousRank - standing.displayCurrentRank;
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
