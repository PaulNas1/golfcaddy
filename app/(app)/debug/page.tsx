"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getLiveRound, getRound, getRounds } from "@/lib/firestore";
import { useAuth } from "@/contexts/AuthContext";
import type { Round } from "@/types";

interface DebugState {
  loadedAt: string;
  firebaseProjectId: string | undefined;
  firebaseAuthDomain: string | undefined;
  appUser: {
    uid: string;
    email: string;
    displayName: string;
    role: string;
    status: string;
    groupId: string;
  } | null;
  liveRound: Round | null;
  liveRoundDetail: Round | null;
  rounds: Round[];
  error: string | null;
}

export default function DebugPage() {
  const { appUser, canAccessAdmin } = useAuth();
  const [state, setState] = useState<DebugState | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setCopied(false);
      try {
        const rounds = await getRounds(appUser?.groupId ?? "fourplay");
        const liveRound = await getLiveRound(appUser?.groupId ?? "fourplay");
        const liveRoundDetail = liveRound ? await getRound(liveRound.id) : null;

        setState({
          loadedAt: new Date().toISOString(),
          firebaseProjectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          firebaseAuthDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          appUser: appUser
            ? {
                uid: appUser.uid,
                email: appUser.email,
                displayName: appUser.displayName,
                role: appUser.role,
                status: appUser.status,
                groupId: appUser.groupId,
              }
            : null,
          liveRound,
          liveRoundDetail,
          rounds,
          error: null,
        });
      } catch (error) {
        setState({
          loadedAt: new Date().toISOString(),
          firebaseProjectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          firebaseAuthDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          appUser: appUser
            ? {
                uid: appUser.uid,
                email: appUser.email,
                displayName: appUser.displayName,
                role: appUser.role,
                status: appUser.status,
                groupId: appUser.groupId,
              }
            : null,
          liveRound: null,
          liveRoundDetail: null,
          rounds: [],
          error:
            error instanceof Error && error.message
              ? error.message
              : "Unknown diagnostics error",
        });
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [appUser]);

  const summary = useMemo(() => {
    if (!state) return "";
    return JSON.stringify(
      {
        loadedAt: state.loadedAt,
        firebaseProjectId: state.firebaseProjectId,
        firebaseAuthDomain: state.firebaseAuthDomain,
        appUser: state.appUser,
        liveRound: state.liveRound
          ? compactRound(state.liveRound)
          : null,
        liveRoundDetail: state.liveRoundDetail
          ? compactRound(state.liveRoundDetail)
          : null,
        rounds: state.rounds.map(compactRound),
        error: state.error,
      },
      null,
      2
    );
  }, [state]);

  const copySummary = async () => {
    if (!summary) return;
    await navigator.clipboard.writeText(summary);
    setCopied(true);
  };

  if (!canAccessAdmin) {
    return (
      <div className="px-4 py-6 text-sm text-gray-500">
        Admin access is required for diagnostics.
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 py-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Diagnostics</h1>
        <p className="mt-1 text-sm text-gray-500">
          Live round and Firebase connection check.
        </p>
      </div>

      {loading && (
        <div className="rounded-xl border border-gray-100 bg-white p-4 text-sm text-gray-500">
          Loading diagnostics...
        </div>
      )}

      {state && (
        <>
          <div className="rounded-xl border border-gray-100 bg-white p-4 text-sm">
            <p className="font-semibold text-gray-800">Firebase</p>
            <p className="mt-2 text-gray-600">
              Project:{" "}
              <span className="font-mono text-xs">
                {state.firebaseProjectId ?? "missing"}
              </span>
            </p>
            <p className="mt-1 text-gray-600">
              Auth domain:{" "}
              <span className="font-mono text-xs">
                {state.firebaseAuthDomain ?? "missing"}
              </span>
            </p>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-4 text-sm">
            <p className="font-semibold text-gray-800">Live round</p>
            {state.liveRound ? (
              <div className="mt-2 space-y-1 text-gray-600">
                <p>
                  Query ID:{" "}
                  <span className="font-mono text-xs">{state.liveRound.id}</span>
                </p>
                <p>Round {state.liveRound.roundNumber}</p>
                <p>{state.liveRound.courseName}</p>
                <p>
                  Detail read:{" "}
                  <span
                    className={
                      state.liveRoundDetail
                        ? "font-semibold text-green-700"
                        : "font-semibold text-red-700"
                    }
                  >
                    {state.liveRoundDetail ? "found" : "missing"}
                  </span>
                </p>
                <Link
                  href={`/rounds/${state.liveRound.id}`}
                  className="mt-3 inline-block rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white"
                >
                  Open live round
                </Link>
              </div>
            ) : (
              <p className="mt-2 text-gray-500">No live round found.</p>
            )}
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-4 text-sm">
            <p className="font-semibold text-gray-800">Recent rounds</p>
            <div className="mt-2 space-y-2">
              {state.rounds.map((round) => (
                <div key={round.id} className="border-t border-gray-100 pt-2">
                  <p className="font-medium text-gray-800">
                    Round {round.roundNumber} · {round.status}
                  </p>
                  <p className="text-gray-600">{round.courseName}</p>
                  <p className="break-all font-mono text-xs text-gray-400">
                    {round.id}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {state.error && (
            <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
              {state.error}
            </div>
          )}

          <button
            onClick={copySummary}
            className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-semibold text-white"
          >
            {copied ? "Copied diagnostics" : "Copy diagnostics"}
          </button>

          <pre className="overflow-auto rounded-xl bg-gray-900 p-4 text-xs text-green-100">
            {summary}
          </pre>
        </>
      )}
    </div>
  );
}

function compactRound(round: Round) {
  return {
    id: round.id,
    roundNumber: round.roundNumber,
    season: round.season,
    courseName: round.courseName,
    status: round.status,
    groupId: round.groupId,
    date: round.date.toISOString(),
    resultsPublished: round.resultsPublished,
  };
}
