"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getPendingMembers,
  getActiveMembers,
  getMembersForGroup,
  getGroup,
  createMemberInvite,
  getMemberInvitesForGroup,
  approveMember,
  rejectMember,
  updateMemberStartingHandicap,
} from "@/lib/firestore";
import { useAuth } from "@/contexts/AuthContext";
import type { AppUser, Group, Member, MemberInvite } from "@/types";

export default function AdminMembersPage() {
  const { appUser } = useAuth();
  const [pending, setPending] = useState<AppUser[]>([]);
  const [active, setActive] = useState<AppUser[]>([]);
  const [members, setMembers] = useState<Record<string, Member>>({});
  const [group, setGroup] = useState<Group | null>(null);
  const [invites, setInvites] = useState<MemberInvite[]>([]);
  const [season, setSeason] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [editingHandicapFor, setEditingHandicapFor] = useState<string | null>(null);
  const [handicapInput, setHandicapInput] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteContact, setInviteContact] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    const groupId = appUser?.groupId ?? "fourplay";
    setLoading(true);
    try {
      const [p, a, groupRecord, memberRecords] = await Promise.all([
        getPendingMembers(groupId),
        getActiveMembers(groupId),
        getGroup(groupId),
        getMembersForGroup(groupId),
      ]);
      setPending(p);
      setActive(a);
      setGroup(groupRecord);
      setSeason(groupRecord?.currentSeason ?? new Date().getFullYear());
      setMembers(
        Object.fromEntries(memberRecords.map((member) => [member.userId, member]))
      );

      getMemberInvitesForGroup(groupId)
        .then(setInvites)
        .catch((err) => {
          console.warn("Unable to load member invites", err);
          setInvites([]);
        });
    } catch (err) {
      console.error("Unable to load members", err);
      setError("Failed to load members. Please refresh and try again.");
    } finally {
      setLoading(false);
    }
  }, [appUser?.groupId]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (uid: string) => {
    setActioning(uid);
    await approveMember(uid);
    await load();
    setActioning(null);
  };

  const startHandicapEdit = (user: AppUser) => {
    setError("");
    setEditingHandicapFor(user.uid);
    setHandicapInput(String(members[user.uid]?.currentHandicap ?? 0));
  };

  const cancelHandicapEdit = () => {
    setEditingHandicapFor(null);
    setHandicapInput("");
    setError("");
  };

  const saveHandicap = async (user: AppUser) => {
    const handicap = Number(handicapInput);
    if (!Number.isFinite(handicap) || handicap < 0 || handicap > 54) {
      setError("Handicap must be a number between 0 and 54.");
      return;
    }

    setActioning(user.uid);
    setError("");
    await updateMemberStartingHandicap({
      memberUser: user,
      handicap: Number(handicap.toFixed(1)),
      season,
      changedBy: appUser,
    });
    await load();
    cancelHandicapEdit();
    setActioning(null);
  };

  const handleReject = async (uid: string) => {
    if (!confirm("Reject this member request?")) return;
    setActioning(uid);
    await rejectMember(uid);
    await load();
    setActioning(null);
  };

  const handleCreateInvite = async () => {
    if (!appUser || !group) return;
    const trimmedName = inviteName.trim();
    if (!trimmedName) {
      setError("Enter the player's name before creating an invite.");
      return;
    }

    setActioning("invite");
    setError("");
    setSuccess("");
    try {
      const invite = await createMemberInvite({
        group,
        inviteeName: trimmedName,
        contact: inviteContact.trim() || null,
        createdBy: appUser,
      });
      const link = buildInviteLink(invite);
      setInviteLink(link);
      setInviteName("");
      setInviteContact("");
      await navigator.clipboard?.writeText(link).catch(() => {});
      setSuccess("Invite link created. Share it with the player to sign up.");
      await load();
    } catch {
      setError("Could not create invite. Please try again.");
    } finally {
      setActioning(null);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Members</h1>

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
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-800">Invite New Player</h2>
            <p className="mt-1 text-xs text-gray-500">
              Create a signup link. The player owns their account and still
              needs admin approval.
            </p>
          </div>
          <span className="rounded-lg bg-green-50 p-2 text-green-700">
            <InviteIcon className="h-5 w-5" />
          </span>
        </div>
        <div className="mt-4 space-y-3">
          <input
            type="text"
            value={inviteName}
            onChange={(event) => setInviteName(event.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="Player name"
          />
          <input
            type="text"
            value={inviteContact}
            onChange={(event) => setInviteContact(event.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="Mobile or email optional"
          />
          <button
            type="button"
            onClick={handleCreateInvite}
            disabled={actioning === "invite"}
            className="w-full rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white disabled:bg-green-300"
          >
            {actioning === "invite" ? "Creating..." : "Create Invite Link"}
          </button>
          {inviteLink && (
            <div className="rounded-xl bg-gray-50 px-3 py-3">
              <p className="text-xs font-semibold text-gray-600">
                Latest invite link
              </p>
              <p className="mt-1 break-all text-xs text-gray-500">
                {inviteLink}
              </p>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(inviteLink)}
                className="mt-2 text-xs font-semibold text-green-700 underline"
              >
                Copy link
              </button>
            </div>
          )}
          {invites.length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-600">
                Recent invites
              </p>
              <div className="mt-2 space-y-1">
                {invites.slice(0, 3).map((invite) => (
                  <div
                    key={invite.id}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="truncate text-gray-600">
                      {invite.inviteeName}
                    </span>
                    <span className="capitalize text-gray-400">
                      {invite.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Pending approvals */}
      <div>
        <h2 className="font-semibold text-gray-700 mb-3">
          Pending Approval
          {pending.length > 0 && (
            <span className="ml-2 bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">
              {pending.length}
            </span>
          )}
        </h2>

        {loading ? (
          <div className="animate-pulse bg-gray-100 rounded-2xl h-20" />
        ) : pending.length === 0 ? (
          <div className="bg-gray-50 rounded-2xl p-6 text-center text-gray-400 text-sm">
            No pending approvals
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((user) => (
              <div
                key={user.uid}
                className="bg-white rounded-2xl shadow-sm border border-amber-100 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-lg font-bold text-gray-500">
                      {user.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">{user.displayName}</p>
                      <p className="text-gray-500 text-xs">{user.email}</p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleApprove(user.uid)}
                    disabled={actioning === user.uid}
                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-semibold py-2 rounded-xl transition-colors"
                  >
                    {actioning === user.uid ? "Approving..." : "✓ Approve"}
                  </button>
                  <button
                    onClick={() => handleReject(user.uid)}
                    disabled={actioning === user.uid}
                    className="flex-1 border border-red-200 text-red-600 hover:bg-red-50 text-sm font-semibold py-2 rounded-xl transition-colors"
                  >
                    ✕ Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active members */}
      <div>
        <h2 className="font-semibold text-gray-700 mb-3">
          Active Members ({active.length})
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          Set each player&apos;s GolfCaddy starting handicap here. Published
          rounds will move it from this baseline.
        </p>
        {loading ? (
          <div className="animate-pulse space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-gray-100 rounded-xl h-14" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {active.map((user) => (
              <div
                key={user.uid}
                className="bg-white rounded-2xl border border-gray-100 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center text-base font-bold text-green-700">
                    {user.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 text-sm">{user.displayName}</p>
                    <p className="text-gray-400 text-xs truncate">{user.email}</p>
                  </div>
                  <span className="text-xs text-gray-400 capitalize">{user.role}</span>
                </div>

                <div className="mt-3 rounded-xl bg-gray-50 px-3 py-3">
                  {editingHandicapFor === user.uid ? (
                    <div className="space-y-2">
                      <label className="block">
                        <span className="block text-xs font-medium text-gray-600 mb-1">
                          Starting handicap
                        </span>
                        <input
                          type="number"
                          min="0"
                          max="54"
                          step="0.1"
                          value={handicapInput}
                          onChange={(e) => setHandicapInput(e.target.value)}
                          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => saveHandicap(user)}
                          disabled={actioning === user.uid}
                          className="flex-1 rounded-xl bg-green-600 py-2 text-sm font-semibold text-white disabled:bg-green-300"
                        >
                          {actioning === user.uid ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={cancelHandicapEdit}
                          disabled={actioning === user.uid}
                          className="flex-1 rounded-xl border border-gray-200 py-2 text-sm font-semibold text-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-baseline gap-2">
                        <p className="text-xs font-medium text-gray-500">
                          GolfCaddy HCP
                        </p>
                        <p className="text-lg font-bold text-gray-800">
                          {members[user.uid]?.currentHandicap ?? "Not set"}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Edit handicap for ${user.displayName}`}
                        onClick={() => startHandicapEdit(user)}
                        className="rounded-lg bg-white p-2 text-green-700 border border-green-100"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function buildInviteLink(invite: MemberInvite) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  const params = new URLSearchParams({
    invite: invite.id,
    token: invite.token,
    groupId: invite.groupId,
    groupName: invite.groupName,
    name: invite.inviteeName,
  });
  if (invite.contact) params.set("contact", invite.contact);
  return `${origin}/signup?${params.toString()}`;
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.862 4.487l1.688-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 7.125L16.875 4.5M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
      />
    </svg>
  );
}

function InviteIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M18 14v4m2-2h-4M15 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 20a7 7 0 0 1 10-6.32"
      />
    </svg>
  );
}
