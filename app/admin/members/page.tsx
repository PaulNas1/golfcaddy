"use client";

import { useEffect, useState } from "react";
import {
  getPendingMembers,
  getActiveMembers,
  approveMember,
  rejectMember,
} from "@/lib/firestore";
import type { AppUser } from "@/types";

export default function AdminMembersPage() {
  const [pending, setPending] = useState<AppUser[]>([]);
  const [active, setActive] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);

  const load = async () => {
    const [p, a] = await Promise.all([getPendingMembers(), getActiveMembers()]);
    setPending(p);
    setActive(a);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleApprove = async (uid: string) => {
    setActioning(uid);
    await approveMember(uid);
    await load();
    setActioning(null);
  };

  const handleReject = async (uid: string) => {
    if (!confirm("Reject this member request?")) return;
    setActioning(uid);
    await rejectMember(uid);
    await load();
    setActioning(null);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Members</h1>

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
                className="bg-white rounded-2xl border border-gray-100 px-4 py-3 flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center text-base font-bold text-green-700">
                  {user.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 text-sm">{user.displayName}</p>
                  <p className="text-gray-400 text-xs truncate">{user.email}</p>
                </div>
                <span className="text-xs text-gray-400 capitalize">{user.role}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
