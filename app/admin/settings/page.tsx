"use client";

import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import {
  getActiveMembers,
  getGroup,
  getPendingMembers,
  previewSeasonHandicapRebuild,
  rebuildSeasonHandicaps,
  getRetiredMembers,
  getSuspendedMembers,
  updateGroupCurrentSeason,
  updateGroupProfile,
  updateGroupSettings,
} from "@/lib/firestore";
import { normaliseGroupSettings } from "@/lib/settings";
import {
  deleteStoredImage,
  uploadGroupLogoImage,
  validateImageFile,
} from "@/lib/storageUploads";
import { useAuth } from "@/contexts/AuthContext";
import type { AppUser, Group, GroupSettings, HandicapMode } from "@/types";

type ResetAction =
  | "clear_feed"
  | "clear_notifications"
  | "remove_selected_members"
  | "full_reset_except_me";

export default function AdminSettingsPage() {
  const { appUser, isAdmin } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [groupName, setGroupName] = useState("");
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [settings, setSettings] = useState<GroupSettings>(
    normaliseGroupSettings()
  );
  const [seasonDraft, setSeasonDraft] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingSeason, setUpdatingSeason] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [resettingAction, setResettingAction] = useState<ResetAction | "">("");
  const [removablePlayers, setRemovablePlayers] = useState<AppUser[]>([]);
  const [showRemovePlayersModal, setShowRemovePlayersModal] = useState(false);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [expandedSections, setExpandedSections] = useState({
    ladderPoints: false,
    handicapRules: false,
    handicapRebuild: false,
  });
  const [handicapRebuildSeason, setHandicapRebuildSeason] = useState(
    new Date().getFullYear()
  );
  const [handicapRebuildBusy, setHandicapRebuildBusy] = useState(false);
  const [handicapPreview, setHandicapPreview] = useState<{
    season: number;
    standings: number;
    membersChanged: number;
    historyRows: number;
    existingHistoryRows: number;
    handicapWindow: number;
  } | null>(null);

  const loadRemovablePlayers = async (groupId?: string, currentUserId?: string) => {
    if (!groupId) return;

    try {
      const [active, pending, retired, suspended] = await Promise.all([
        getActiveMembers(groupId),
        getPendingMembers(groupId),
        getRetiredMembers(groupId),
        getSuspendedMembers(groupId),
      ]);

      const combined = [...active, ...pending, ...retired, ...suspended];
      const uniqueByUid = new Map<string, AppUser>();
      combined.forEach((user) => {
        if (user.uid === currentUserId) return;
        if (user.role === "admin") return;
        uniqueByUid.set(user.uid, user);
      });

      setRemovablePlayers(
        Array.from(uniqueByUid.values()).sort((a, b) =>
          a.displayName.localeCompare(b.displayName)
        )
      );
    } catch {
      setError("Failed to load players for removal.");
    }
  };

  useEffect(() => {
    getGroup(appUser?.groupId)
      .then((groupRecord) => {
        setGroup(groupRecord);
        setGroupName(groupRecord?.name ?? "");
        setLogoPreviewUrl(groupRecord?.logoUrl ?? "");
        setLogoFile(null);
        setLogoRemoved(false);
        setSettings(normaliseGroupSettings(groupRecord?.settings));
        setSeasonDraft(
          groupRecord?.currentSeason ?? new Date().getFullYear()
        );
        setHandicapRebuildSeason(
          groupRecord?.currentSeason ?? new Date().getFullYear()
        );
      })
      .catch(() => setError("Failed to load settings."))
      .finally(() => setLoading(false));
    loadRemovablePlayers(appUser?.groupId, appUser?.uid);
  }, [appUser?.groupId, appUser?.uid]);

  useEffect(() => {
    return () => {
      if (logoPreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(logoPreviewUrl);
      }
    };
  }, [logoPreviewUrl]);

  const updatePoints = (position: number, value: string) => {
    const points = Number(value);
    setSettings((current) => ({
      ...current,
      pointsTable: {
        ...current.pointsTable,
        [String(position)]: Number.isFinite(points) ? points : 0,
      },
    }));
  };

  const handleLogoFileChange = (file: File | null) => {
    if (!file) return;

    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      setSuccess("");
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setLogoPreviewUrl((current) => {
      if (current.startsWith("blob:")) {
        URL.revokeObjectURL(current);
      }
      return previewUrl;
    });
    setLogoFile(file);
    setLogoRemoved(false);
    setError("");
  };

  const handleRemoveLogo = () => {
    setLogoPreviewUrl((current) => {
      if (current.startsWith("blob:")) {
        URL.revokeObjectURL(current);
      }
      return "";
    });
    setLogoFile(null);
    setLogoRemoved(true);
    setError("");
    setSuccess("");
  };

  const handleSave = async () => {
    if (!group) return;
    setSaving(true);
    setError("");
    setSuccess("");
    let uploadedLogoPath: string | null = null;
    try {
      const nextName = groupName.trim();
      if (!nextName) {
        setError("Group name is required.");
        return;
      }
      let nextLogoUrl = logoRemoved ? null : group.logoUrl ?? null;
      let nextLogoPath = logoRemoved ? null : group.logoPath ?? null;
      let previousLogoPathToDelete: string | null = null;

      if (logoFile) {
        const uploaded = await uploadGroupLogoImage(group.id, logoFile);
        uploadedLogoPath = uploaded.path;
        nextLogoUrl = uploaded.url;
        nextLogoPath = uploaded.path;
        previousLogoPathToDelete = group.logoPath ?? null;
      } else if (logoRemoved) {
        previousLogoPathToDelete = group.logoPath ?? null;
      }

      const nextSettings = normaliseGroupSettings(settings);
      await Promise.all([
        updateGroupProfile({
          groupId: group.id,
          name: nextName,
          logoUrl: nextLogoUrl,
          logoPath: nextLogoPath,
        }),
        updateGroupSettings(group.id, nextSettings),
      ]);
      if (previousLogoPathToDelete && previousLogoPathToDelete !== nextLogoPath) {
        await deleteStoredImage(previousLogoPathToDelete);
      }
      setGroup({
        ...group,
        name: nextName,
        logoUrl: nextLogoUrl,
        logoPath: nextLogoPath,
        settings: nextSettings,
      });
      setLogoPreviewUrl(nextLogoUrl ?? "");
      setLogoFile(null);
      setLogoRemoved(false);
      setSettings(nextSettings);
      setSuccess("Settings saved.");
    } catch {
      if (uploadedLogoPath) {
        await deleteStoredImage(uploadedLogoPath);
      }
      setError("Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleSeasonUpdate = async () => {
    if (!group) return;

    if (!Number.isInteger(seasonDraft) || seasonDraft < 2000) {
      setError("Enter a valid season year.");
      setSuccess("");
      return;
    }

    if (seasonDraft === group.currentSeason) {
      setSuccess(`Season ${seasonDraft} is already active.`);
      setError("");
      return;
    }

    const confirmed = confirm(
      seasonDraft > group.currentSeason
        ? `Finalise season ${group.currentSeason} and start season ${seasonDraft}? New rounds and ladder updates will go into ${seasonDraft}.`
        : `Change the active season from ${group.currentSeason} to ${seasonDraft}? New rounds and ladder updates will go into ${seasonDraft}.`
    );
    if (!confirmed) return;

    setUpdatingSeason(true);
    setError("");
    setSuccess("");

    try {
      await updateGroupCurrentSeason(group.id, seasonDraft);
      setGroup((current) =>
        current
          ? {
              ...current,
              currentSeason: seasonDraft,
            }
          : current
      );
      setSuccess(
        seasonDraft > group.currentSeason
          ? `Season ${group.currentSeason} finalised. Season ${seasonDraft} is now active.`
          : `Active season changed to ${seasonDraft}.`
      );
    } catch {
      setError("Failed to update the active season. Please try again.");
    } finally {
      setUpdatingSeason(false);
    }
  };

  const handleDangerAction = async ({
    action,
    label,
    confirmation,
    confirmationWord,
    userIds = [],
  }: {
    action: ResetAction;
    label: string;
    confirmation: string;
    confirmationWord: "CLEAR" | "REMOVE" | "RESET";
    userIds?: string[];
  }) => {
    const typed = window.prompt(
      `${confirmation}\n\nType ${confirmationWord} to continue.`
    );
    if (typed == null) return false;
    if (typed.trim().toUpperCase() !== confirmationWord) {
      setError(`You must type "${confirmationWord}" to continue.`);
      setSuccess("");
      return false;
    }

    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) {
      setError("You need to be signed in again before using this tool.");
      setSuccess("");
      return false;
    }

    setResettingAction(action);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/admin/reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ action, userIds }),
      });

      const result = (await response.json().catch(() => null)) as
        | { message?: string; error?: string; summary?: Record<string, number> }
        | null;

      if (!response.ok) {
        throw new Error(result?.error ?? "Reset failed.");
      }

      const summaryText = Object.entries(result?.summary ?? {})
        .filter(([, value]) => typeof value === "number" && value > 0)
        .map(([key, value]) => `${value} ${formatResetSummaryKey(key)}`)
        .join(" · ");

      setSuccess(
        [result?.message ?? `${label} complete.`, summaryText].filter(Boolean).join(" ")
      );
      await loadRemovablePlayers(appUser?.groupId, appUser?.uid);
      return true;
    } catch (resetError) {
      setError(
        resetError instanceof Error ? resetError.message : "Reset failed."
      );
      setSuccess("");
      return false;
    } finally {
      setResettingAction("");
    }
  };

  const handleOpenRemovePlayers = () => {
    setSelectedPlayerIds([]);
    setShowRemovePlayersModal(true);
  };

  const handleTogglePlayerSelection = (userId: string) => {
    setSelectedPlayerIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId]
    );
  };

  const handleRemoveSelectedPlayers = async () => {
    if (selectedPlayerIds.length === 0) {
      setError("Choose at least one player to remove.");
      setSuccess("");
      return;
    }

    const selectedNames = removablePlayers
      .filter((player) => selectedPlayerIds.includes(player.uid))
      .map((player) => player.displayName)
      .join(", ");

    const completed = await handleDangerAction({
      action: "remove_selected_members",
      label: "Remove selected players",
      confirmation: `Remove ${selectedPlayerIds.length} player${
        selectedPlayerIds.length === 1 ? "" : "s"
      } from this group?\n\n${selectedNames}`,
      confirmationWord: "REMOVE",
      userIds: selectedPlayerIds,
    });

    if (completed) {
      setShowRemovePlayersModal(false);
      setSelectedPlayerIds([]);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-1/2 rounded bg-gray-200 animate-pulse" />
        <div className="h-40 rounded-2xl bg-gray-100 animate-pulse" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-gray-800">Settings</h1>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          Only admins can change group settings, ladder rules, and season management.
        </div>
        <Link
          href="/admin"
          className="inline-block rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700"
        >
          Back to admin
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Settings</h1>
        <p className="text-sm text-gray-500">
          Set the competition rules used when round results are published.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      )}

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-gray-800">Group Identity</h2>
        <p className="mt-1 text-xs text-gray-500">
          This is the name and emblem used for this social group.
        </p>
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">
              Group name
            </span>
            <input
              type="text"
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Your Social Golf Group"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">
              Group logo
            </span>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
              <input
                type="file"
                accept="image/*"
                onChange={(event) =>
                  handleLogoFileChange(event.target.files?.[0] ?? null)
                }
                className="block w-full text-xs text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-green-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-green-700"
              />
              <p className="mt-2 text-[11px] text-gray-400">
                Upload a square logo if possible. JPG, PNG, or WebP up to 5 MB.
              </p>
              <button
                type="button"
                onClick={handleRemoveLogo}
                className="mt-3 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600"
              >
                Remove logo
              </button>
            </div>
          </label>
          <div className="rounded-xl bg-gray-50 px-3 py-3">
            <p className="text-xs font-semibold text-gray-600">Preview</p>
            <div className="mt-2 flex items-center gap-3">
              {logoPreviewUrl.trim() ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoPreviewUrl.trim()}
                  alt=""
                  className="h-10 w-10 rounded-lg object-cover"
                />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-lg">
                  ⛳
                </span>
              )}
              <span className="text-sm font-semibold text-gray-800">
                {groupName.trim() || "Your group name"}
              </span>
            </div>
          </div>
        </div>
      </section>

      <CollapsibleSettingsSection
        title="Ladder Points"
        description="Points are awarded by final placing after countback."
        summary={getPointsSummary(settings.pointsTable)}
        expanded={expandedSections.ladderPoints}
        onToggle={() =>
          setExpandedSections((current) => ({
            ...current,
            ladderPoints: !current.ladderPoints,
          }))
        }
      >
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 10 }, (_, index) => index + 1).map(
            (position) => (
              <label key={position} className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">
                  Place {position}
                </span>
                <input
                  type="number"
                  min={0}
                  value={settings.pointsTable[String(position)] ?? 0}
                  onChange={(event) =>
                    updatePoints(position, event.target.value)
                  }
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </label>
            )
          )}
        </div>
      </CollapsibleSettingsSection>

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-gray-800">Season Total</h2>
        <p className="mt-1 text-xs text-gray-500">
          Count every round, or only a player&apos;s best rounds for the season.
        </p>
        <div className="mt-4 space-y-3">
          <ToggleRow
            label="Use best-X rounds"
            description="When enabled, weaker rounds remain in history but do not count toward total ladder points."
            checked={settings.bestXofY.enabled}
            onChange={(checked) =>
              setSettings((current) => ({
                ...current,
                bestXofY: { ...current.bestXofY, enabled: checked },
              }))
            }
          />
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">
              Best rounds to count
            </span>
            <input
              type="number"
              min={1}
              value={settings.bestXofY.bestX}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  bestXofY: {
                    ...current.bestXofY,
                    bestX: Number(event.target.value) || 1,
                  },
                }))
              }
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-gray-800">Season Management</h2>
        <p className="mt-1 text-xs text-gray-500">
          Choose which season new rounds and ladder updates belong to. Past
          season results stay in history, and handicaps continue from each
          player&apos;s latest card.
        </p>
        <div className="mt-4 space-y-3">
          <div className="rounded-xl bg-gray-50 px-3 py-3">
            <p className="text-xs font-medium text-gray-500">Active season</p>
            <p className="mt-1 text-2xl font-bold text-gray-800">
              {group?.currentSeason ?? seasonDraft}
            </p>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">
              Change active season
            </span>
            <select
              value={seasonDraft}
              onChange={(event) =>
                setSeasonDraft(Number(event.target.value) || new Date().getFullYear())
              }
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {getSeasonOptions(group?.currentSeason ?? seasonDraft).map(
                (seasonOption) => (
                  <option key={seasonOption} value={seasonOption}>
                    {seasonOption}
                  </option>
                )
              )}
            </select>
          </label>
          <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-3">
            <p className="text-xs text-amber-800">
              Changing the active season only affects where new rounds and
              ladder updates go. Historical season results stay in place.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSeasonUpdate}
            disabled={updatingSeason || !group}
            className="w-full rounded-xl border border-green-200 bg-green-50 py-3 text-sm font-semibold text-green-700 transition-colors hover:bg-green-100 disabled:border-green-100 disabled:bg-green-50 disabled:text-green-400"
          >
            {updatingSeason
              ? "Updating season..."
              : getSeasonActionLabel(group?.currentSeason, seasonDraft)}
          </button>
        </div>
      </section>

      <CollapsibleSettingsSection
        title="Handicap Rules"
        description="GolfCaddy handicap uses the rolling average of recent Stableford cards."
        summary={getHandicapSummary(settings)}
        expanded={expandedSections.handicapRules}
        onToggle={() =>
          setExpandedSections((current) => ({
            ...current,
            handicapRules: !current.handicapRules,
          }))
        }
      >
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">
              Cards used for handicap movement
            </span>
            <input
              type="number"
              min={3}
              max={12}
              value={settings.handicapRoundsWindow}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  handicapRoundsWindow: Number(event.target.value) || 6,
                }))
              }
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </label>

          <div className="grid grid-cols-1 gap-2">
            <ModeButton
              label="Local GolfCaddy handicap"
              description="Use the group handicap exactly as stored against the player."
              selected={settings.handicapMode === "local"}
              onClick={() => setHandicapMode("local", setSettings)}
            />
            <ModeButton
              label="Slope-adjusted handicap"
              description="Convert each player handicap into a playing handicap using the selected tee-set slope and rating for that round."
              selected={settings.handicapMode === "slope_adjusted"}
              onClick={() => setHandicapMode("slope_adjusted", setSettings)}
            />
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-3 text-xs text-blue-900">
            <p className="font-medium">How this setting works</p>
            <p className="mt-1">
              `Local` and `slope-adjusted` change the playing handicap frozen on
              new scorecards after you save settings.
            </p>
            <p className="mt-1">
              Switching modes does not retroactively rescore old rounds or
              recalculate published results.
            </p>
          </div>
        </div>
      </CollapsibleSettingsSection>

      <CollapsibleSettingsSection
        title="Recalculate Season Handicaps"
        description="Use this after changing handicap rules or importing old rounds."
        summary={
          handicapPreview
            ? `${handicapPreview.membersChanged} members changed, ${handicapPreview.historyRows} handicap rows`
            : `Season ${handicapRebuildSeason}`
        }
        expanded={expandedSections.handicapRebuild}
        onToggle={() =>
          setExpandedSections((current) => ({
            ...current,
            handicapRebuild: !current.handicapRebuild,
          }))
        }
      >
        <div className="space-y-3">
          <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-3 text-xs text-amber-900">
            <p className="font-medium">What this tool does</p>
            <p className="mt-1">
              Rebuilds the season handicap history from published rounds using
              the current saved handicap rules.
            </p>
            <p className="mt-1">
              It does not rescore old rounds, recalculate side games, or convert
              historic rounds between `local` and `slope-adjusted` mode.
            </p>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">
              Season to recalculate
            </span>
            <select
              value={handicapRebuildSeason}
              onChange={(event) =>
                setHandicapRebuildSeason(Number(event.target.value))
              }
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {getSeasonOptions(group?.currentSeason ?? seasonDraft).map((season) => (
                <option key={season} value={season}>
                  {season}
                </option>
              ))}
            </select>
          </label>

          {handicapPreview && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 text-xs text-gray-600">
              <p>
                Preview for Season {handicapPreview.season}:{" "}
                <span className="font-semibold text-gray-800">
                  {handicapPreview.standings} standings
                </span>
              </p>
              <p className="mt-1">
                {handicapPreview.membersChanged} member records would change.{" "}
                {handicapPreview.historyRows} history rows would be rebuilt from{" "}
                {handicapPreview.existingHistoryRows} existing rows using a{" "}
                {handicapPreview.handicapWindow}-card window.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={async () => {
                if (!group) return;
                setHandicapRebuildBusy(true);
                setError("");
                setSuccess("");
                try {
                  const preview = await previewSeasonHandicapRebuild(
                    group.id,
                    handicapRebuildSeason
                  );
                  setHandicapPreview(preview);
                } catch {
                  setError("Failed to preview the season handicap recalculation.");
                } finally {
                  setHandicapRebuildBusy(false);
                }
              }}
              disabled={handicapRebuildBusy || !group}
              className="rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 disabled:text-gray-300"
            >
              {handicapRebuildBusy ? "Working..." : "Preview recalculation"}
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!group) return;
                const confirmed = confirm(
                  `Recalculate handicaps for Season ${handicapRebuildSeason}? This will overwrite published-round handicap history for that season.`
                );
                if (!confirmed) return;
                setHandicapRebuildBusy(true);
                setError("");
                setSuccess("");
                try {
                  const summary = await rebuildSeasonHandicaps({
                    groupId: group.id,
                    season: handicapRebuildSeason,
                  });
                  setSuccess(
                    `Recalculated ${summary.historyRows} handicap history rows for Season ${summary.season}.`
                  );
                  setHandicapPreview(null);
                } catch {
                  setError("Failed to recalculate season handicaps.");
                } finally {
                  setHandicapRebuildBusy(false);
                }
              }}
              disabled={handicapRebuildBusy || !group}
              className="rounded-xl border border-green-200 bg-green-50 py-2.5 text-sm font-semibold text-green-700 disabled:text-green-300"
            >
              Apply recalculation
            </button>
          </div>
        </div>
      </CollapsibleSettingsSection>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving || !group}
        className="w-full rounded-xl bg-green-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:bg-green-300"
      >
        {saving ? "Saving..." : "Save Settings"}
      </button>

      <section className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-red-700">Danger Zone</h2>
        <p className="mt-1 text-xs text-gray-500">
          These tools are admin-only and destructive. Each action will ask for a confirmation word before it runs.
        </p>
        <div className="mt-4 space-y-3">
          <DangerActionCard
            title="Clear feed"
            description="Deletes all feed posts, comments, reactions, and feed-related alerts."
            buttonLabel="Clear"
            busy={resettingAction === "clear_feed"}
            onClick={() =>
              handleDangerAction({
                action: "clear_feed",
                label: "Clear feed",
                confirmation:
                  "Delete every post, comment, reaction, and feed announcement for this group?",
                confirmationWord: "CLEAR",
              })
            }
          />

          <DangerActionCard
            title="Clear notifications"
            description="Deletes every notification in this group for every member."
            buttonLabel="Clear"
            busy={resettingAction === "clear_notifications"}
            onClick={() =>
              handleDangerAction({
                action: "clear_notifications",
                label: "Clear notifications",
                confirmation:
                  "Delete every notification for this group?",
                confirmationWord: "CLEAR",
              })
            }
          />

          <DangerActionCard
            title="Remove players"
            description="Choose one or more players to remove from Firebase Auth and Firestore."
            buttonLabel="Manage"
            busy={false}
            onClick={handleOpenRemovePlayers}
          />

          <DangerActionCard
            title="Factory reset"
            description="Clears members, rounds, scorecards, results, ladder history, feed, notifications, and invites while preserving your admin account and access."
            buttonLabel="Reset"
            busy={resettingAction === "full_reset_except_me"}
            onClick={() =>
              handleDangerAction({
                action: "full_reset_except_me",
                label: "Factory reset",
                confirmation:
                  "Fully reset this group and keep only your admin account? This deletes rounds, results, feed, notifications, invites, and all other members.",
                confirmationWord: "RESET",
              })
            }
          />
        </div>
      </section>

      {showRemovePlayersModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[85vh] w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="border-b border-gray-100 px-4 py-4">
              <h3 className="text-lg font-semibold text-gray-800">Remove Players</h3>
              <p className="mt-1 text-sm text-gray-500">
                Select one or more players to remove from this group.
              </p>
            </div>

            <div className="max-h-[50vh] overflow-y-auto px-4 py-3">
              {removablePlayers.length === 0 ? (
                <p className="text-sm text-gray-500">No removable players found.</p>
              ) : (
                <div className="space-y-2">
                  {removablePlayers.map((player) => (
                    <label
                      key={player.uid}
                      className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-3"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPlayerIds.includes(player.uid)}
                        onChange={() => handleTogglePlayerSelection(player.uid)}
                        className="mt-1 h-4 w-4 accent-red-600"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-gray-800">
                          {player.displayName}
                        </span>
                        <span className="block text-xs text-gray-500">
                          {formatPlayerStatus(player)}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 border-t border-gray-100 px-4 py-4">
              <button
                type="button"
                onClick={() => {
                  setShowRemovePlayersModal(false);
                  setSelectedPlayerIds([]);
                }}
                className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRemoveSelectedPlayers}
                disabled={
                  resettingAction === "remove_selected_members" ||
                  selectedPlayerIds.length === 0
                }
                className="flex-1 rounded-xl border border-red-200 bg-red-50 py-2.5 text-sm font-semibold text-red-700 disabled:border-red-100 disabled:text-red-300"
              >
                {resettingAction === "remove_selected_members"
                  ? "Removing..."
                  : "Remove selected"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CollapsibleSettingsSection({
  title,
  description,
  summary,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  summary: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 text-left"
        aria-expanded={expanded}
      >
        <span>
          <span className="block font-semibold text-gray-800">{title}</span>
          <span className="mt-1 block text-xs text-gray-500">{description}</span>
          <span className="mt-2 block text-xs font-medium text-green-700">
            {summary}
          </span>
        </span>
        <span
          className={`mt-0.5 rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-500 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        >
          ˅
        </span>
      </button>
      {expanded && <div className="mt-4">{children}</div>}
    </section>
  );
}

function setHandicapMode(
  handicapMode: HandicapMode,
  setSettings: Dispatch<SetStateAction<GroupSettings>>
) {
  setSettings((current) => ({
    ...current,
    handicapMode,
  }));
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-3">
      <span>
        <span className="block text-sm font-semibold text-gray-800">
          {label}
        </span>
        <span className="block text-xs text-gray-500">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-5 w-5 accent-green-600"
      />
    </label>
  );
}

function ModeButton({
  label,
  description,
  selected,
  onClick,
}: {
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-3 text-left transition-colors ${
        selected
          ? "border-green-500 bg-green-50"
          : "border-gray-100 bg-gray-50"
      }`}
    >
      <span className="block text-sm font-semibold text-gray-800">
        {label}
      </span>
      <span className="block text-xs text-gray-500">{description}</span>
    </button>
  );
}

function DangerActionCard({
  title,
  description,
  buttonLabel,
  busy,
  onClick,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <div className="rounded-xl border border-red-100 bg-red-50/40 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-800">{title}</p>
          <p className="mt-1 text-xs text-gray-500">{description}</p>
        </div>
        <button
          type="button"
          onClick={onClick}
          disabled={busy}
          className="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:text-red-300"
        >
          {busy ? "Working..." : buttonLabel}
        </button>
      </div>
    </div>
  );
}

function formatResetSummaryKey(key: string) {
  switch (key) {
    case "postsDeleted":
      return "posts removed";
    case "commentsDeleted":
      return "comments removed";
    case "reactionsDeleted":
      return "reactions removed";
    case "notificationsDeleted":
      return "notifications removed";
    case "usersDeleted":
      return "users removed";
    case "roundsDeleted":
      return "rounds removed";
    case "resultsDeleted":
      return "results removed";
    case "scorecardsDeleted":
      return "scorecards removed";
    case "holeScoresDeleted":
      return "hole scores removed";
    case "seasonStandingsDeleted":
      return "ladder records removed";
    case "handicapHistoryDeleted":
      return "handicap entries removed";
    case "invitesDeleted":
      return "invites removed";
    case "rsvpsDeleted":
      return "RSVPs removed";
    default:
      return key;
  }
}

function formatPlayerStatus(player: AppUser) {
  const roleLabel =
    player.role === "moderator"
      ? "Moderator"
      : player.role === "admin"
      ? "Admin"
      : "Member";
  const statusLabel =
    player.status.charAt(0).toUpperCase() + player.status.slice(1);

  return `${roleLabel} · ${statusLabel}`;
}

function getSeasonActionLabel(
  currentSeason: number | undefined,
  nextSeason: number
) {
  if (!currentSeason) return `Set active season to ${nextSeason}`;
  if (nextSeason > currentSeason) {
    return `Finalise ${currentSeason} and start ${nextSeason}`;
  }
  return `Set active season to ${nextSeason}`;
}

function getSeasonOptions(activeSeason: number) {
  return Array.from({ length: 5 }, (_, index) => activeSeason - 1 + index);
}

function getPointsSummary(pointsTable: GroupSettings["pointsTable"]) {
  return Array.from({ length: 4 }, (_, index) => pointsTable[String(index + 1)] ?? 0)
    .join(", ")
    .concat(" ...");
}

function getHandicapSummary(settings: GroupSettings) {
  const handicapModeLabel =
    settings.handicapMode === "slope_adjusted"
      ? "Slope-adjusted mode"
      : "Local handicap mode";
  return `${settings.handicapRoundsWindow} cards, ${handicapModeLabel}`;
}
