"use client";

/**
 * PostEngagement
 *
 * The one quiet action row under every post (and Round Result card):
 *   - Reaction summary: only the reactions people actually used + a total.
 *     Tapping it opens a small emoji picker.
 *   - Reply: opens the inline replies list + a one-line reply input.
 *
 * Replies subscribe to Firestore only while open, and the listener is torn
 * down on close/unmount (the old PostCard leaked one listener per toggle).
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import Avatar from "@/components/ui/Avatar";
import type {
  AppUser,
  Post,
  PostComment,
  PostReaction,
  PostReactionType,
} from "@/types";

/** Offered in the picker. */
export const REACTION_OPTIONS: { type: PostReactionType; emoji: string; label: string }[] = [
  { type: "like",  emoji: "👍", label: "Like" },
  { type: "love",  emoji: "❤️", label: "Love" },
  { type: "laugh", emoji: "😂", label: "Haha" },
  { type: "fire",  emoji: "🔥", label: "Fire" },
  { type: "golf",  emoji: "⛳", label: "Golf" },
];

/** Every emoji we may need to *display* (includes legacy 👎 counts). */
const REACTION_EMOJI: Record<string, string> = {
  like: "👍", love: "❤️", laugh: "😂", fire: "🔥", golf: "⛳", dislike: "👎",
};

export interface EngagementHandlers {
  onReaction: (post: Post, type: PostReactionType) => Promise<void>;
  onCreateComment: (post: Post, content: string) => Promise<void>;
  onDeleteComment: (post: Post, comment: PostComment) => Promise<void>;
  subscribeToComments: (
    postId: string,
    onComments: (comments: PostComment[]) => void
  ) => () => void;
}

interface PostEngagementProps extends EngagementHandlers {
  post: Post;
  appUser: AppUser | null;
  isAdmin: boolean;
  myReaction: PostReaction | null;
  /** Optional right-aligned action, e.g. "Full results ›" */
  trailing?: ReactNode;
}

export function shortAgo(date: Date) {
  const text = formatDistanceToNowStrict(date);
  return text
    .replace(/ seconds?/, "s").replace(/ minutes?/, "m").replace(/ hours?/, "h")
    .replace(/ days?/, "d").replace(/ months?/, "mo").replace(/ years?/, "y");
}

export default function PostEngagement({
  post,
  appUser,
  isAdmin,
  myReaction,
  trailing,
  onReaction,
  onCreateComment,
  onDeleteComment,
  subscribeToComments,
}: PostEngagementProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reactionBusy, setReactionBusy] = useState(false);

  const [repliesOpen, setRepliesOpen] = useState(false);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const pickerRootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // ── Replies listener: only while open, always cleaned up ─────────────
  useEffect(() => {
    if (!repliesOpen) return;
    return subscribeToComments(post.id, setComments);
  }, [repliesOpen, post.id, subscribeToComments]);

  // ── Close the picker on outside tap ──────────────────────────────────
  useEffect(() => {
    if (!pickerOpen) return;
    const close = (e: PointerEvent) => {
      if (!pickerRootRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [pickerOpen]);

  // ── Reaction summary (only reactions actually used) ──────────────────
  const used = Object.entries(post.reactionCounts ?? {})
    .filter(([type, n]) => n > 0 && REACTION_EMOJI[type])
    .sort((a, b) => b[1] - a[1]);
  const total = used.reduce((sum, [, n]) => sum + n, 0);
  const mine = myReaction?.reactionType ?? null;

  const pick = async (type: PostReactionType) => {
    setPickerOpen(false);
    setReactionBusy(true);
    try { await onReaction(post, type); } finally { setReactionBusy(false); }
  };

  const openReplies = () => {
    setRepliesOpen(true);
    // Focus after the input mounts.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const send = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      await onCreateComment(post, draft);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reply.");
    } finally {
      setSending(false);
    }
  };

  const remove = async (comment: PostComment) => {
    setDeletingId(comment.id);
    try { await onDeleteComment(post, comment); } finally { setDeletingId(""); }
  };

  return (
    <div className="mt-3">
      {/* ── Action row ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-t border-surface-overlay pt-2">
        <div ref={pickerRootRef} className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            disabled={reactionBusy}
            aria-haspopup="true"
            aria-expanded={pickerOpen}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition-colors hover:bg-surface-muted ${
              mine ? "text-brand-600" : "text-ink-muted"
            }`}
          >
            {total > 0 ? (
              <>
                <span className="flex">
                  {used.slice(0, 3).map(([type], i) => (
                    <span
                      key={type}
                      className={`grid h-[22px] w-[22px] place-items-center rounded-full border-2 border-surface-card bg-surface-muted text-xs ${i > 0 ? "-ml-1.5" : ""}`}
                    >
                      {REACTION_EMOJI[type]}
                    </span>
                  ))}
                </span>
                <span>{total}</span>
              </>
            ) : (
              <>
                <span className="text-base leading-none">🙂</span>
                <span>React</span>
              </>
            )}
          </button>

          {pickerOpen && (
            <div
              role="menu"
              className="gc-pop absolute bottom-full left-0 z-20 mb-2 flex gap-0.5 rounded-full border border-surface-overlay bg-surface-card px-2 py-1.5 shadow-xl"
            >
              {REACTION_OPTIONS.map((r) => (
                <button
                  key={r.type}
                  type="button"
                  role="menuitem"
                  aria-label={r.label}
                  onClick={() => pick(r.type)}
                  className={`rounded-full px-1.5 py-1 text-[26px] leading-none transition-transform hover:-translate-y-1 hover:scale-125 ${
                    mine === r.type ? "bg-brand-500/20" : ""
                  }`}
                >
                  {r.emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => (repliesOpen ? inputRef.current?.focus() : openReplies())}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-ink-muted transition-colors hover:bg-surface-muted"
        >
          <span className="text-base leading-none">💬</span>
          <span>{post.commentCount > 0 ? post.commentCount : "Reply"}</span>
        </button>

        <span className="flex-1" />
        {trailing}
      </div>

      {/* ── Replies ────────────────────────────────────────────────── */}
      {!repliesOpen && post.commentCount > 0 && (
        <button
          type="button"
          onClick={openReplies}
          className="mt-1 px-1 text-[13px] font-semibold text-ink-muted"
        >
          View {post.commentCount === 1 ? "1 reply" : `all ${post.commentCount} replies`}
        </button>
      )}

      {repliesOpen && (
        <div className="mt-2 space-y-2">
          {comments.map((c) => {
            const canManage = c.authorId === appUser?.uid || isAdmin;
            return (
              <div key={c.id} className="flex gap-2">
                <Avatar src={c.authorAvatarUrl} name={c.authorName} size="xs" />
                <div className="min-w-0">
                  <div className="rounded-2xl bg-surface-muted px-3 py-2">
                    <p className="text-[13px] font-semibold text-ink-title">{c.authorName}</p>
                    <p className="whitespace-pre-line break-words text-sm text-ink-body">{c.content}</p>
                  </div>
                  <p className="mt-0.5 px-3 text-[11px] text-ink-hint">
                    {shortAgo(c.createdAt)}
                    {canManage && (
                      <>
                        {" · "}
                        <button
                          type="button"
                          onClick={() => remove(c)}
                          disabled={deletingId === c.id}
                          className="font-semibold hover:text-red-500 disabled:opacity-40"
                        >
                          {deletingId === c.id ? "Deleting…" : "Delete"}
                        </button>
                      </>
                    )}
                  </p>
                </div>
              </div>
            );
          })}

          <div className="flex items-center gap-2 pt-1">
            <Avatar src={appUser?.avatarUrl} name={appUser?.displayName ?? "?"} size="xs" />
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
              placeholder="Write a reply…"
              enterKeyHint="send"
              className="min-w-0 flex-1 rounded-full border border-transparent bg-surface-muted px-4 py-2 text-sm text-ink-title placeholder:text-ink-hint focus:border-brand-600 focus:outline-none"
            />
            {draft.trim() && (
              <button
                type="button"
                onClick={send}
                disabled={sending}
                className="rounded-full bg-brand-600 px-3.5 py-2 text-xs font-bold text-white disabled:opacity-40"
              >
                {sending ? "…" : "Send"}
              </button>
            )}
          </div>
          {error && <p className="text-xs font-medium text-red-500">{error}</p>}
          <button
            type="button"
            onClick={() => setRepliesOpen(false)}
            className="px-1 text-xs font-semibold text-ink-hint"
          >
            Hide replies
          </button>
        </div>
      )}
    </div>
  );
}
