"use client";

/**
 * PlayerProfileForm
 *
 * Handles the editable player profile section: avatar, display name,
 * nickname, contact details, tee preferences, and distance unit.
 *
 * Self-contained: owns all form draft state. Reports save/cancel
 * via the onSave / onCancel callbacks so the parent stays thin.
 */

import { useEffect, useState } from "react";
import Avatar from "@/components/ui/Avatar";
import ToggleSwitch from "@/components/ui/ToggleSwitch";
import {
  updateUser,
  deleteStoredImage,
  uploadUserAvatarImage,
  validateImageFile,
} from "@/lib/profileActions";
import type { AppUser, DistanceUnit, UserGender } from "@/types";

interface PlayerProfileFormProps {
  appUser: AppUser;
  /** Called after a successful save with the latest avatar URL */
  onSaved: () => void;
}

export default function PlayerProfileForm({ appUser, onSaved }: PlayerProfileFormProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // ── Draft state ───────────────────────────────────────────────────────
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(appUser.avatarUrl ?? "");
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>(appUser.distanceUnit ?? "meters");
  const [draft, setDraft] = useState({
    displayName:   appUser.displayName ?? "",
    nickname:      appUser.nickname ?? "",
    address:       appUser.address ?? "",
    mobileNumber:  appUser.mobileNumber ?? "",
    dateOfBirth:   appUser.dateOfBirth ?? "",
    gender:        appUser.gender ?? "",
    usesSeniorTees:  appUser.usesSeniorTees ?? false,
    usesProBackTees: appUser.usesProBackTees ?? false,
  });

  // Re-sync when appUser changes externally (e.g. after a successful save)
  useEffect(() => {
    setDraft({
      displayName:   appUser.displayName ?? "",
      nickname:      appUser.nickname ?? "",
      address:       appUser.address ?? "",
      mobileNumber:  appUser.mobileNumber ?? "",
      dateOfBirth:   appUser.dateOfBirth ?? "",
      gender:        appUser.gender ?? "",
      usesSeniorTees:  appUser.usesSeniorTees ?? false,
      usesProBackTees: appUser.usesProBackTees ?? false,
    });
    setDistanceUnit(appUser.distanceUnit ?? "meters");
    setAvatarPreviewUrl(appUser.avatarUrl ?? "");
    setAvatarFile(null);
    setAvatarRemoved(false);
  }, [appUser]);

  // Revoke object URLs when preview changes or component unmounts
  useEffect(() => {
    return () => {
      if (avatarPreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  const resetForm = () => {
    setDraft({
      displayName:   appUser.displayName ?? "",
      nickname:      appUser.nickname ?? "",
      address:       appUser.address ?? "",
      mobileNumber:  appUser.mobileNumber ?? "",
      dateOfBirth:   appUser.dateOfBirth ?? "",
      gender:        appUser.gender ?? "",
      usesSeniorTees:  appUser.usesSeniorTees ?? false,
      usesProBackTees: appUser.usesProBackTees ?? false,
    });
    setDistanceUnit(appUser.distanceUnit ?? "meters");
    setAvatarPreviewUrl(appUser.avatarUrl ?? "");
    setAvatarFile(null);
    setAvatarRemoved(false);
    setErrorMsg("");
  };

  const handleAvatarChange = (file: File | null) => {
    if (!file) return;
    const validationError = validateImageFile(file);
    if (validationError) { setErrorMsg(validationError); return; }
    setErrorMsg("");
    const url = URL.createObjectURL(file);
    setAvatarPreviewUrl((prev) => { if (prev.startsWith("blob:")) URL.revokeObjectURL(prev); return url; });
    setAvatarFile(file);
    setAvatarRemoved(false);
  };

  const handleRemoveAvatar = () => {
    setAvatarPreviewUrl((prev) => { if (prev.startsWith("blob:")) URL.revokeObjectURL(prev); return ""; });
    setAvatarFile(null);
    setAvatarRemoved(true);
    setErrorMsg("");
  };

  const handleSave = async () => {
    setSaving(true);
    setSuccessMsg("");
    setErrorMsg("");
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
        displayName: draft.displayName.trim() || appUser.displayName,
        nickname: draft.nickname.trim() || null,
        avatarUrl: nextAvatarUrl,
        avatarPath: nextAvatarPath,
        address: draft.address.trim() || null,
        mobileNumber: draft.mobileNumber.trim() || null,
        dateOfBirth: draft.dateOfBirth || null,
        gender: draft.gender ? (draft.gender as UserGender) : null,
        usesSeniorTees: draft.usesSeniorTees,
        usesProBackTees: draft.usesProBackTees,
        distanceUnit,
      });

      if (previousAvatarPathToDelete && previousAvatarPathToDelete !== nextAvatarPath) {
        await deleteStoredImage(previousAvatarPathToDelete);
      }

      setAvatarPreviewUrl(nextAvatarUrl ?? "");
      setAvatarFile(null);
      setAvatarRemoved(false);
      setEditing(false);
      setSuccessMsg("Profile updated");
      setTimeout(() => setSuccessMsg(""), 3000);
      onSaved();
    } catch {
      if (uploadedAvatarPath) await deleteStoredImage(uploadedAvatarPath);
      setErrorMsg("Failed to update profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-overlay p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-ink-title">Player Profile</h3>
          <p className="text-xs text-ink-hint">These details help admins review tee assignments.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (editing) { resetForm(); setEditing(false); return; }
            setEditing(true);
          }}
          className="rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-semibold text-brand-700"
        >
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>

      {successMsg && <p className="mb-3 rounded-xl bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700">{successMsg}</p>}
      {errorMsg   && <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{errorMsg}</p>}

      {editing ? (
        <div className="space-y-3">
          {/* Avatar picker */}
          <div className="rounded-xl border border-surface-overlay bg-surface-muted p-3">
            <p className="text-xs font-medium text-ink-muted">Profile photo</p>
            <div className="mt-3 flex items-center gap-3">
              <Avatar src={avatarPreviewUrl} name={draft.displayName} size="lg" />
              <div className="min-w-0 flex-1">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleAvatarChange(e.target.files?.[0] ?? null)}
                  className="block w-full text-xs text-ink-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-brand-700"
                />
                <p className="mt-1 text-[11px] text-ink-hint">JPG, PNG, or WebP up to 5 MB.</p>
              </div>
            </div>
            {(avatarPreviewUrl || appUser.avatarUrl) && (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                className="mt-3 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600"
              >
                Remove photo
              </button>
            )}
          </div>

          <ProfileInput label="Name"          value={draft.displayName}  onChange={(v) => setDraft((d) => ({ ...d, displayName: v }))} />
          <ProfileInput label="Nickname"      value={draft.nickname}     onChange={(v) => setDraft((d) => ({ ...d, nickname: v }))} />
          <ProfileInput label="Address"       value={draft.address}      onChange={(v) => setDraft((d) => ({ ...d, address: v }))} />
          <ProfileInput label="Mobile number" value={draft.mobileNumber} inputMode="tel" onChange={(v) => setDraft((d) => ({ ...d, mobileNumber: v }))} />
          <ProfileInput label="Date of birth" type="date" value={draft.dateOfBirth} onChange={(v) => setDraft((d) => ({ ...d, dateOfBirth: v }))} />

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-muted">Gender</span>
            <select
              value={draft.gender}
              onChange={(e) => setDraft((d) => ({ ...d, gender: e.target.value }))}
              className="w-full rounded-xl border border-surface-overlay px-3 py-2.5 text-sm text-ink-body focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Not set</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </label>

          <ToggleSwitch
            label="Do you regard yourself as a senior tee player?"
            checked={draft.usesSeniorTees}
            onChange={(v) => setDraft((d) => ({ ...d, usesSeniorTees: v }))}
          />
          <ToggleSwitch
            label="Do you usually play pro/back tees?"
            checked={draft.usesProBackTees}
            onChange={(v) => setDraft((d) => ({ ...d, usesProBackTees: v }))}
          />

          <div>
            <p className="mb-2 text-xs font-medium text-ink-muted">Distance display</p>
            <div className="inline-flex rounded-xl border border-surface-overlay bg-surface-muted p-1">
              {(["meters", "yards"] as DistanceUnit[]).map((unit) => (
                <button
                  key={unit}
                  type="button"
                  onClick={() => setDistanceUnit(unit)}
                  className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
                    distanceUnit === unit
                      ? "bg-brand-600 text-white shadow-sm"
                      : "text-ink-muted hover:text-ink-body"
                  }`}
                >
                  {unit === "meters" ? "Metres" : "Yards"}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save profile"}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <ProfileFact label="Nickname"     value={draft.nickname} />
          <ProfileFact label="Mobile"       value={draft.mobileNumber} />
          <ProfileFact label="Date of birth" value={draft.dateOfBirth} />
          <ProfileFact label="Gender"       value={draft.gender ? draft.gender.charAt(0).toUpperCase() + draft.gender.slice(1) : null} />
          <ProfileFact label="Senior tees"  value={draft.usesSeniorTees ? "Yes" : "No"} />
          <ProfileFact label="Pro/back tees" value={draft.usesProBackTees ? "Yes" : "No"} />
          <ProfileFact label="Distance unit" value={distanceUnit === "yards" ? "Yards" : "Metres"} />
        </div>
      )}
    </div>
  );
}

// ── Local primitives ─────────────────────────────────────────────────────────

function ProfileInput({
  label, value, onChange, type = "text", inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  inputMode?: "tel" | "email";
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-muted">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-xl border border-surface-overlay px-3 py-2.5 text-sm text-ink-body focus:outline-none focus:ring-2 focus:ring-brand-500 ${
          type === "date"
            ? "[&::-webkit-date-and-time-value]:block [&::-webkit-date-and-time-value]:text-left"
            : ""
        }`}
      />
    </label>
  );
}

function ProfileFact({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-xl bg-surface-muted px-3 py-2">
      <p className="text-[11px] text-ink-hint">{label}</p>
      <p className="mt-0.5 truncate font-semibold text-ink-body">{value || "Not set"}</p>
    </div>
  );
}
