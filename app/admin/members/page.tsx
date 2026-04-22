"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getPendingMembers,
  getActiveMembers,
  getRetiredMembers,
  getSuspendedMembers,
  getMembersForGroup,
  getGroup,
  createMemberInvite,
  getMemberInvitesForGroup,
  approveMember,
  rejectMember,
  updateMemberStartingHandicap,
  updateUser,
} from "@/lib/firestore";
import { useAuth } from "@/contexts/AuthContext";
import type { AppUser, Group, Member, MemberInvite, UserRole, UserStatus } from "@/types";

export default function AdminMembersPage() {
  const { appUser } = useAuth();
  const activeMenuRef = useRef<HTMLDivElement | null>(null);
  const [pending, setPending] = useState<AppUser[]>([]);
  const [active, setActive] = useState<AppUser[]>([]);
  const [retired, setRetired] = useState<AppUser[]>([]);
  const [suspended, setSuspended] = useState<AppUser[]>([]);
  const [members, setMembers] = useState<Record<string, Member>>({});
  const [group, setGroup] = useState<Group | null>(null);
  const [invites, setInvites] = useState<MemberInvite[]>([]);
  const [season, setSeason] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [editingHandicapFor, setEditingHandicapFor] = useState<string | null>(null);
  const [handicapInput, setHandicapInput] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteCountryCode, setInviteCountryCode] = useState("+61");
  const [inviteContact, setInviteContact] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [pendingRoleDrafts, setPendingRoleDrafts] = useState<Record<string, UserRole>>({});
  const [activeMenuUserId, setActiveMenuUserId] = useState<string | null>(null);
  const [activeSearch, setActiveSearch] = useState("");
  const [selectedActiveUser, setSelectedActiveUser] = useState<AppUser | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    const groupId = appUser?.groupId ?? "fourplay";
    setLoading(true);
    try {
      const [p, a, r, s, groupRecord, memberRecords] = await Promise.all([
        getPendingMembers(groupId),
        getActiveMembers(groupId),
        getRetiredMembers(groupId),
        getSuspendedMembers(groupId),
        getGroup(groupId),
        getMembersForGroup(groupId),
      ]);
      setPending(p);
      setActive(a);
      setRetired(r);
      setSuspended(s);
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

  useEffect(() => {
    if (!activeMenuUserId) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (activeMenuRef.current?.contains(target)) return;
      setActiveMenuUserId(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveMenuUserId(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeMenuUserId]);

  const handleApprove = async (uid: string) => {
    const role = pendingRoleDrafts[uid] ?? "member";
    setActioning(uid);
    await approveMember(uid, role);
    await load();
    setActioning(null);
  };

  const handleRoleChange = async (user: AppUser, role: UserRole) => {
    if (!canManageUser(appUser, user)) return;
    setActioning(user.uid);
    setActiveMenuUserId(null);
    setError("");
    setSuccess("");
    try {
      await updateUser(user.uid, { role });
      setSuccess(`${user.displayName} is now ${formatRoleLabel(role)}.`);
      await load();
    } catch {
      setError("Failed to update the role. Please try again.");
    } finally {
      setActioning(null);
    }
  };

  const handleStatusChange = async (user: AppUser, status: UserStatus) => {
    if (!canManageUser(appUser, user)) return;
    setActioning(user.uid);
    setActiveMenuUserId(null);
    setError("");
    setSuccess("");
    try {
      await updateUser(user.uid, { status });
      setSuccess(`${user.displayName} marked as ${formatStatusLabel(status)}.`);
      await load();
    } catch {
      setError("Failed to update the member status. Please try again.");
    } finally {
      setActioning(null);
    }
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
    if (!appUser || !group) {
      setError("Group details are still loading. Please try again.");
      return;
    }
    const trimmedName = inviteName.trim();
    const trimmedContact = normaliseInviteContact(
      inviteContact,
      inviteCountryCode
    );
    if (!trimmedName) {
      setError("Enter the player's name before creating an invite.");
      return;
    }

    setActioning("invite");
    setError("");
    setSuccess("");
    try {
      const inviteMethod = getInviteContactMethod(trimmedContact);
      let link = buildInviteLink({
        groupId: group.id,
        groupName: group.name,
        inviteeName: trimmedName,
        contact: trimmedContact || null,
      });
      let savedInvite = false;

      try {
        const invite = await createMemberInvite({
          group,
          inviteeName: trimmedName,
          contact: trimmedContact || null,
          createdBy: appUser,
        });
        link = buildInviteLink(invite);
        savedInvite = true;
      } catch (error) {
        console.error("Could not persist member invite", error);
      }

      setInviteLink(link);
      setInviteName("");
      setInviteContact("");
      const copied = await copyToClipboard(link);
      const openedShareTarget =
        trimmedContact && inviteMethod
          ? openInviteShare({
              inviteeName: trimmedName,
              groupName: group.name,
              contact: trimmedContact,
              link,
              method: inviteMethod,
            })
          : false;
      setSuccess(
        savedInvite
          ? openedShareTarget
            ? inviteMethod === "email"
              ? copied
                ? "Invite email is ready and the link was copied as a fallback."
                : "Invite email is ready. If it does not open, copy the link below and share it manually."
              : copied
                ? "Invite text is ready and the link was copied as a fallback."
                : "Invite text is ready. If it does not open, copy the link below and share it manually."
            : copied
              ? "Invite link created and copied. Share it with the player to sign up."
              : "Invite link created. Copy it below and share it with the player to sign up."
          : copied
            ? "Invite link created and copied, but it could not be saved to Recent invites. The signup link will still work."
            : "Invite link created, but it could not be saved to Recent invites. Copy it below. The signup link will still work."
      );

      if (savedInvite) {
        await load().catch((error) => {
          console.warn("Invite was created but members refresh failed", error);
        });
      }
    } catch (error) {
      console.error("Could not create invite link", error);
      setError("Could not create invite. Please try again.");
    } finally {
      setActioning(null);
    }
  };

  const approvalRoleOptions = getAssignableRoles(appUser?.role);
  const activeSectionDescription =
    "Set each player's GolfCaddy starting handicap here. Published rounds will move it from this baseline.";
  const activeMembers = [...active]
    .sort(compareUsersByFirstName)
    .filter((user) => matchesMemberSearch(user, activeSearch));

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
              Create a signup link. Add an email or mobile to open your mail or
              messages app with the invite ready to send.
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
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-600">
              Email or mobile to send to
            </label>
            <div className="flex gap-2">
              <select
                value={inviteCountryCode}
                onChange={(event) => setInviteCountryCode(event.target.value)}
                className="w-28 rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                aria-label="Country code"
              >
                {COUNTRY_CODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={inviteContact}
                onChange={(event) => setInviteContact(event.target.value)}
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Optional email or mobile"
                autoComplete="email tel"
              />
            </div>
            <p className="text-xs text-gray-500">
              Emails open your email app. Mobile numbers open a text message
              draft and use the selected country code unless you type a full
              international number.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreateInvite}
            disabled={actioning === "invite"}
            className="w-full rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white disabled:bg-green-300"
          >
            {actioning === "invite"
              ? "Creating..."
              : getInviteActionLabel(inviteContact)}
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
                onClick={async () => {
                  const copied = await copyToClipboard(inviteLink);
                  setSuccess(
                    copied
                      ? "Invite link copied."
                      : "Copy is not available in this browser. You can still select and share the link below."
                  );
                }}
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
                <div className="mt-3 space-y-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-gray-600">
                      Approve as
                    </span>
                    <select
                      value={pendingRoleDrafts[user.uid] ?? "member"}
                      onChange={(event) =>
                        setPendingRoleDrafts((current) => ({
                          ...current,
                          [user.uid]: event.target.value as UserRole,
                        }))
                      }
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      {approvalRoleOptions.map((role) => (
                        <option key={role} value={role}>
                          {formatRoleLabel(role)}
                        </option>
                      ))}
                    </select>
                  </label>
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
          {activeSectionDescription}
        </p>
        <input
          type="search"
          value={activeSearch}
          onChange={(event) => setActiveSearch(event.target.value)}
          placeholder="Search players"
          className="mb-3 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        {loading ? (
          <div className="animate-pulse space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-gray-100 rounded-xl h-14" />
            ))}
          </div>
        ) : activeMembers.length === 0 ? (
          <div className="bg-gray-50 rounded-2xl p-6 text-center text-gray-400 text-sm">
            {activeSearch.trim() ? "No players matched your search" : "No active members"}
          </div>
        ) : (
          <div className="space-y-2">
            {activeMembers.map((user) => (
              <div
                key={user.uid}
                className="cursor-pointer rounded-xl border border-gray-100 bg-white px-4 py-3 transition-colors hover:bg-gray-50"
                onClick={() => setSelectedActiveUser(user)}
              >
                <div className="grid grid-cols-[auto,minmax(0,1fr),72px,36px,36px] items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 text-base font-bold text-green-700">
                    {user.displayName.charAt(0).toUpperCase()}
                  </div>
                  <MemberListName name={user.displayName} />

                  {editingHandicapFor !== user.uid ? (
                    <span className="w-[72px] whitespace-nowrap rounded-lg bg-gray-50 px-2.5 py-1 text-center text-xs font-semibold text-gray-700">
                      HCP {members[user.uid]?.currentHandicap ?? "—"}
                    </span>
                  ) : (
                    <span className="w-[72px] text-center text-xs font-medium text-green-700">
                      Editing
                    </span>
                  )}

                  {editingHandicapFor !== user.uid && (
                    <button
                      type="button"
                      aria-label={`Edit handicap for ${user.displayName}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        startHandicapEdit(user);
                      }}
                      className="rounded-lg border border-green-100 bg-white p-2 text-green-700"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                  )}

                  {canManageUser(appUser, user) ? (
                    <div
                      ref={activeMenuUserId === user.uid ? activeMenuRef : null}
                      className="relative"
                    >
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setActiveMenuUserId((current) =>
                            current === user.uid ? null : user.uid
                          );
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500"
                        aria-label={`Manage ${user.displayName}`}
                        aria-expanded={activeMenuUserId === user.uid}
                      >
                        <EllipsisIcon className="h-4 w-4" />
                      </button>
                      {activeMenuUserId === user.uid && (
                        <div className="absolute right-0 top-full z-20 mt-2 w-56 space-y-3 rounded-xl border border-gray-100 bg-white p-3 shadow-lg">
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-gray-600">
                              Promote
                            </span>
                            <select
                              value={user.role}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                handleRoleChange(
                                  user,
                                  event.target.value as UserRole
                                )
                              }
                              disabled={actioning === user.uid}
                              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                            >
                              {getAssignableRoles(appUser?.role).map((role) => (
                                <option key={role} value={role}>
                                  {formatRoleLabel(role)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleStatusChange(user, "retired");
                              }}
                              disabled={actioning === user.uid}
                              className="rounded-xl border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-700 disabled:text-amber-300"
                            >
                              Retire
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleStatusChange(user, "suspended");
                              }}
                              disabled={actioning === user.uid}
                              className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 disabled:text-red-300"
                            >
                              Suspend
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-9 w-9" aria-hidden="true" />
                  )}
                </div>

                {editingHandicapFor === user.uid && (
                  <div className="mt-3 rounded-xl bg-gray-50 px-3 py-3">
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
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <MemberStatusSection
        title={`Retired Members (${retired.length})`}
        users={retired}
        loading={loading}
        emptyMessage="No retired members"
        tone="amber"
        actioning={actioning}
        appUser={appUser}
        onPrimaryAction={(user) => handleStatusChange(user, "active")}
        primaryActionLabel="Reactivate"
        onSecondaryAction={(user) => handleStatusChange(user, "suspended")}
        secondaryActionLabel="Suspend"
      />

      <MemberStatusSection
        title={`Suspended Members (${suspended.length})`}
        users={suspended}
        loading={loading}
        emptyMessage="No suspended members"
        tone="red"
        actioning={actioning}
        appUser={appUser}
        onPrimaryAction={(user) => handleStatusChange(user, "active")}
        primaryActionLabel="Reactivate"
        onSecondaryAction={(user) => handleStatusChange(user, "retired")}
        secondaryActionLabel="Retire"
      />

      {selectedActiveUser && (
        <MemberDetailModal
          user={selectedActiveUser}
          handicap={members[selectedActiveUser.uid]?.currentHandicap ?? null}
          onClose={() => setSelectedActiveUser(null)}
        />
      )}
    </div>
  );
}

const COUNTRY_CODE_OPTIONS = [
  { value: "+61", label: "AU +61" },
  { value: "+64", label: "NZ +64" },
  { value: "+44", label: "UK +44" },
  { value: "+1", label: "US +1" },
  { value: "+1", label: "CA +1" },
];

function formatRoleLabel(role: AppUser["role"]) {
  if (role === "admin") return "Admin";
  if (role === "moderator") return "Moderator";
  return "Member";
}

function formatStatusLabel(status: UserStatus) {
  if (status === "active") return "Active";
  if (status === "retired") return "Retired";
  if (status === "suspended") return "Suspended";
  return "Pending";
}

function getAssignableRoles(currentUserRole: UserRole | undefined) {
  return currentUserRole === "admin"
    ? (["member", "moderator", "admin"] as UserRole[])
    : (["member", "moderator"] as UserRole[]);
}

function canManageUser(currentUser: AppUser | null, targetUser: AppUser) {
  if (!currentUser || currentUser.uid === targetUser.uid) return false;
  if (currentUser.role === "admin") return true;
  if (currentUser.role === "moderator") {
    return targetUser.role !== "admin";
  }
  return false;
}

function compareUsersByFirstName(a: AppUser, b: AppUser) {
  const aFirst = getFirstName(a.displayName);
  const bFirst = getFirstName(b.displayName);

  if (aFirst !== bFirst) return aFirst.localeCompare(bFirst);
  return a.displayName.localeCompare(b.displayName);
}

function getFirstName(name: string) {
  return name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

function matchesMemberSearch(user: AppUser, term: string) {
  const query = term.trim().toLowerCase();
  if (!query) return true;
  return (
    user.displayName.toLowerCase().includes(query) ||
    user.email.toLowerCase().includes(query)
  );
}

function formatGenderLabel(gender: AppUser["gender"]) {
  if (gender === "male") return "Male";
  if (gender === "female") return "Female";
  return "Not set";
}

function MemberDetailModal({
  user,
  handicap,
  onClose,
}: {
  user: AppUser;
  handicap: number | null;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">{user.displayName}</h3>
            <p className="text-xs text-gray-400">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-500"
          >
            Close
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <MemberDetailFact label="Role" value={formatRoleLabel(user.role)} />
          <MemberDetailFact label="Status" value={formatStatusLabel(user.status)} />
          <MemberDetailFact
            label="Handicap"
            value={handicap == null ? "Not set" : String(handicap)}
          />
          <MemberDetailFact label="Nickname" value={user.nickname || "Not set"} />
          <MemberDetailFact label="Mobile" value={user.mobileNumber || "Not set"} />
          <MemberDetailFact
            label="Date of birth"
            value={user.dateOfBirth || "Not set"}
          />
          <MemberDetailFact
            label="Gender"
            value={formatGenderLabel(user.gender)}
          />
          <MemberDetailFact
            label="Senior tees"
            value={user.usesSeniorTees ? "Yes" : "No"}
          />
          <MemberDetailFact
            label="Pro/back tees"
            value={user.usesProBackTees ? "Yes" : "No"}
          />
          <MemberDetailFact label="Address" value={user.address || "Not set"} wide />
        </div>
      </div>
    </div>
  );
}

function MemberDetailFact({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={`${wide ? "col-span-2" : ""} rounded-xl bg-gray-50 px-3 py-2`}>
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className="mt-0.5 break-words font-semibold text-gray-700">{value}</p>
    </div>
  );
}

function MemberListName({ name }: { name: string }) {
  const [firstLine, secondLine] = splitDisplayName(name);

  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium leading-tight text-gray-800">
        {firstLine}
      </p>
      <p className="truncate text-sm font-medium leading-tight text-gray-800">
        {secondLine}
      </p>
    </div>
  );
}

function splitDisplayName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return [parts[0] ?? name, "\u00A0"];
  }

  return [parts[0], parts.slice(1).join(" ")];
}

function MemberStatusSection({
  title,
  users,
  loading,
  emptyMessage,
  tone,
  actioning,
  appUser,
  onPrimaryAction,
  primaryActionLabel,
  onSecondaryAction,
  secondaryActionLabel,
}: {
  title: string;
  users: AppUser[];
  loading: boolean;
  emptyMessage: string;
  tone: "amber" | "red";
  actioning: string | null;
  appUser: AppUser | null;
  onPrimaryAction: (user: AppUser) => void;
  primaryActionLabel: string;
  onSecondaryAction: (user: AppUser) => void;
  secondaryActionLabel: string;
}) {
  const toneClasses =
    tone === "amber"
      ? "border-amber-100 bg-amber-50 text-amber-700"
      : "border-red-100 bg-red-50 text-red-600";

  return (
    <div>
      <h2 className="font-semibold text-gray-700 mb-3">{title}</h2>
      {loading ? (
        <div className="animate-pulse bg-gray-100 rounded-2xl h-20" />
      ) : users.length === 0 ? (
        <div className="bg-gray-50 rounded-2xl p-6 text-center text-gray-400 text-sm">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((user) => (
            <div
              key={user.uid}
              className="bg-white rounded-xl border border-gray-100 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-base font-bold text-gray-500">
                  {user.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 text-sm">{user.displayName}</p>
                  <p className="text-gray-400 text-xs truncate">{user.email}</p>
                </div>
                <span className="whitespace-nowrap text-xs text-gray-400">
                  {formatRoleLabel(user.role)}
                </span>
              </div>

              {canManageUser(appUser, user) && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                  <button
                    type="button"
                    onClick={() => onPrimaryAction(user)}
                    disabled={actioning === user.uid}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${toneClasses}`}
                  >
                    {primaryActionLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => onSecondaryAction(user)}
                    disabled={actioning === user.uid}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 disabled:text-gray-300"
                  >
                    {secondaryActionLabel}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

async function copyToClipboard(text: string) {
  if (
    typeof navigator === "undefined" ||
    !navigator.clipboard ||
    typeof navigator.clipboard.writeText !== "function"
  ) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function normaliseInviteContact(value: string, countryCode: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  if (trimmedValue.includes("@")) {
    return trimmedValue;
  }

  if (trimmedValue.startsWith("+")) {
    return trimmedValue.replace(/\s+/g, "");
  }

  const digitsOnly = trimmedValue.replace(/[^\d]/g, "");
  if (!digitsOnly) {
    return trimmedValue;
  }

  return `${countryCode}${digitsOnly.replace(/^0+/, "")}`;
}

function getInviteContactMethod(contact: string | null) {
  if (!contact) return null;
  return contact.includes("@") ? "email" : "sms";
}

function getInviteActionLabel(rawContact: string) {
  const trimmedContact = rawContact.trim();
  if (!trimmedContact) return "Create Invite Link";
  return trimmedContact.includes("@")
    ? "Create and Open Email"
    : "Create and Open Text";
}

function openInviteShare({
  inviteeName,
  groupName,
  contact,
  link,
  method,
}: {
  inviteeName: string;
  groupName: string;
  contact: string;
  link: string;
  method: "email" | "sms";
}) {
  if (typeof window === "undefined") return false;

  const message = `Hi ${inviteeName}, join ${groupName} on GolfCaddy using this signup link: ${link}`;
  const encodedMessage = encodeURIComponent(message);

  try {
    if (method === "email") {
      const subject = encodeURIComponent(`Join ${groupName} on GolfCaddy`);
      window.location.href = `mailto:${encodeURIComponent(contact)}?subject=${subject}&body=${encodedMessage}`;
      return true;
    }

    const bodySeparator =
      typeof navigator !== "undefined" &&
      /iPhone|iPad|iPod/i.test(navigator.userAgent)
        ? "&"
        : "?";
    window.location.href = `sms:${contact}${bodySeparator}body=${encodedMessage}`;
    return true;
  } catch {
    return false;
  }
}

function buildInviteLink({
  id,
  token,
  groupId,
  groupName,
  inviteeName,
  contact,
}: {
  id?: string;
  token?: string;
  groupId: string;
  groupName: string;
  inviteeName: string;
  contact: string | null;
}) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  const params = new URLSearchParams({
    groupId,
    groupName,
    name: inviteeName,
  });
  if (id) params.set("invite", id);
  if (token) params.set("token", token);
  if (contact) params.set("contact", contact);
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

function EllipsisIcon({ className }: { className?: string }) {
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
        d="M6 12h.01M12 12h.01M18 12h.01"
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
