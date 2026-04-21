"use client";

import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import Link from "next/link";
import {
  getGroup,
  updateGroupCurrentSeason,
  updateGroupProfile,
  updateGroupSettings,
} from "@/lib/firestore";
import { normaliseGroupSettings } from "@/lib/settings";
import { useAuth } from "@/contexts/AuthContext";
import type { Group, GroupSettings, HandicapMode } from "@/types";

export default function AdminSettingsPage() {
  const { appUser, isAdmin } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [groupName, setGroupName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [settings, setSettings] = useState<GroupSettings>(
    normaliseGroupSettings()
  );
  const [seasonDraft, setSeasonDraft] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingSeason, setUpdatingSeason] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    getGroup(appUser?.groupId)
      .then((groupRecord) => {
        setGroup(groupRecord);
        setGroupName(groupRecord?.name ?? "");
        setLogoUrl(groupRecord?.logoUrl ?? "");
        setSettings(normaliseGroupSettings(groupRecord?.settings));
        setSeasonDraft(
          groupRecord?.currentSeason ?? new Date().getFullYear()
        );
      })
      .catch(() => setError("Failed to load settings."))
      .finally(() => setLoading(false));
  }, [appUser?.groupId]);

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

  const handleSave = async () => {
    if (!group) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const nextName = groupName.trim();
      if (!nextName) {
        setError("Group name is required.");
        return;
      }
      const nextSettings = normaliseGroupSettings(settings);
      await Promise.all([
        updateGroupProfile({
          groupId: group.id,
          name: nextName,
          logoUrl: logoUrl.trim() || null,
        }),
        updateGroupSettings(group.id, nextSettings),
      ]);
      setGroup({
        ...group,
        name: nextName,
        logoUrl: logoUrl.trim() || null,
        settings: nextSettings,
      });
      setSettings(nextSettings);
      setSuccess("Settings saved.");
    } catch {
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
              Logo or emblem URL
            </span>
            <input
              type="url"
              value={logoUrl}
              onChange={(event) => setLogoUrl(event.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="https://example.com/group-logo.png"
            />
          </label>
          <div className="rounded-xl bg-gray-50 px-3 py-3">
            <p className="text-xs font-semibold text-gray-600">Preview</p>
            <div className="mt-2 flex items-center gap-3">
              {logoUrl.trim() ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl.trim()}
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

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-gray-800">Ladder Points</h2>
        <p className="mt-1 text-xs text-gray-500">
          Points are awarded by final placing after countback.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
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
      </section>

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
            <input
              type="number"
              min={2000}
              step={1}
              value={seasonDraft}
              onChange={(event) =>
                setSeasonDraft(Number(event.target.value) || new Date().getFullYear())
              }
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </label>
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

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-gray-800">Handicap Rules</h2>
        <p className="mt-1 text-xs text-gray-500">
          GolfCaddy handicap movement uses recent Stableford cards.
        </p>
        <div className="mt-4 space-y-3">
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
                  handicapRoundsWindow: Number(event.target.value) || 3,
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
              description="Store this preference now; tee-set slope adjustment will use it when that scoring pass lands."
              selected={settings.handicapMode === "slope_adjusted"}
              onClick={() => setHandicapMode("slope_adjusted", setSettings)}
            />
          </div>
        </div>
      </section>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving || !group}
        className="w-full rounded-xl bg-green-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:bg-green-300"
      >
        {saving ? "Saving..." : "Save Settings"}
      </button>
    </div>
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
