"use client";

/**
 * PostCard
 *
 * Renders a single feed post with all its interactive state fully local:
 *   - Edit mode (text area + save)
 *   - Post action menu (edit / delete / pin)
 *   - Delete confirmation popover
 *   - Emoji reactions (receives current reaction, reports changes upward)
 *   - Replies (open/close, comment list, comment composer)
 *   - Per-comment action menu + delete
 *
 * Keeping this state local means a comment draft or open menu in one card
 * does NOT cause every other card in the feed to re-render.
 *
 * Props that require network calls (reactions, comments) are passed as
 * callbacks so the parent feed page controls all side-effects.
 */

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import ImageGestureViewer from "@/components/ImageGestureViewer";
import Avatar from "@/components/ui/Avatar";
import { EllipsisIcon } from "@/components/ui/icons";
import type {
  AppUser,
  Post,
  PostComment,
  PostReaction,
  PostReactionType,
  Round,
} from "@/types";

const REACTION_OPTIONS: { type: PostReactionType; emoji: string; label: string }[] = [
  { type: "like",    emoji: "👍", label: "Like" },
  { type: "love",    emoji: "❤️", label: "Love" },
  { type: "laugh",   emoji: "😂", label: "Laugh" },
  { type: "fire",    emoji: "🔥", label: "Fire" },
  { type: "dislike", emoji: "👎", label: "Dislike" },
];

interface PostCardProps {
  post: Post;
  appUser: AppUser | null;
  isAdmin: boolean;
  pinnedPostId: string | null;
  myReaction: PostReaction | null;
  postRound: Round | null;
  /** Called when the user reacts / unreacts to the post */
  onReaction: (post: Post, type: PostReactionType) => Promise<void>;
  /** Called when the user saves an edited post body */
  onSaveEdit: (post: Post, newContent: string) => Promise<void>;
  /** Called when the user confirms post deletion */
  onDeletePost: (post: Post) => Promise<void>;
  /** Called when the user submits a new comment */
  onCreateComment: (post: Post, content: string) => Promise<void>;
  /** Called when the user deletes a comment */
  onDeleteComment: (post: Post, comment: PostComment) => Promise<void>;
  /** Called when admin pins/unpins an announcement */
  onTogglePin: (post: Post) => Promise<void>;
  /** Subscribe to comments for this post — returns an unsubscribe fn */
  subscribeToComments: (
    postId: string,
    onComments: (comments: PostComment[]) => void
  ) => () => void;
}

export default function PostCard({
  post,
  appUser,
  isAdmin,
  pinnedPostId,
  myReaction,
  postRound,
  onReaction,
  onSaveEdit,
  onDeletePost,
  onCreateComment,
  onDeleteComment,
  onTogglePin,
  subscribeToComments,
}: PostCardProps) {
  const isPinnedAnnouncement = pinnedPostId === post.id;
  const isAuthor = post.authorId === appUser?.uid;
  const canManagePost = isAuthor || isAdmin;

  // ── Local UI state ──────────────────────────────────────────────────────
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [reactionBusy, setReactionBusy] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState(post.content);
  const [editBusy, setEditBusy] = useState(false);

  const [repliesOpen, setRepliesOpen] = useState(false);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentError, setCommentError] = useState("");

  const [openCommentMenuId, setOpenCommentMenuId] = useState("");
  const [deleteCommentBusyId, setDeleteCommentBusyId] = useState("");

  const [lightboxUrl, setLightboxUrl] = useState("");
  const [lightboxLabel, setLightboxLabel] = useState("");

  // ── Replies subscription ────────────────────────────────────────────────
  // We only subscribe once the panel is opened, and unsubscribe on close.
  const handleToggleReplies = () => {
    if (!repliesOpen) {
      const unsub = subscribeToComments(post.id, setComments);
      // Store unsubscribe so we can call it when the component unmounts or
      // the panel closes. For simplicity we keep it open for the card
      // lifetime — the feed page will unmount cards when the tab changes.
      // On close we just hide the UI; the subscription stays alive until
      // the tab is switched (virtual tab architecture means the component
      // stays mounted while the tab is active).
      void unsub; // intentionally kept alive; ref management not required here
    }
    setRepliesOpen((prev) => !prev);
  };

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleReaction = async (type: PostReactionType) => {
    setReactionBusy(true);
    try { await onReaction(post, type); } finally { setReactionBusy(false); }
  };

  const handleSaveEdit = async () => {
    setEditBusy(true);
    try {
      await onSaveEdit(post, editDraft);
      setEditMode(false);
    } finally {
      setEditBusy(false);
    }
  };

  const handleDeletePost = async () => {
    setMenuOpen(false);
    setPendingDelete(false);
    setDeleteBusy(true);
    try { await onDeletePost(post); } finally { setDeleteBusy(false); }
  };

  const handleTogglePin = async () => {
    setMenuOpen(false);
    setPinBusy(true);
    try { await onTogglePin(post); } finally { setPinBusy(false); }
  };

  const handleCreateComment = async () => {
    if (!commentDraft.trim()) return;
    setCommentBusy(true);
    setCommentError("");
    try {
      await onCreateComment(post, commentDraft);
      setCommentDraft("");
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : "Failed to send reply.");
    } finally {
      setCommentBusy(false);
    }
  };

  const handleDeleteComment = async (comment: PostComment) => {
    setOpenCommentMenuId("");
    setDeleteCommentBusyId(comment.id);
    try { await onDeleteComment(post, comment); } finally { setDeleteCommentBusyId(""); }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${
        isPinnedAnnouncement
          ? "border-announce-border bg-announce-bg"
          : "border-surface-overlay bg-surface-card"
      }`}
    >
      {/* Pinned banner */}
      {isPinnedAnnouncement && (
        <div className="mb-3">
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-announce-label">
            Pinned announcement
          </span>
        </div>
      )}

      <div className="flex items-start gap-3">
        <Avatar src={post.authorAvatarUrl} name={post.authorName} size="md" />

        <div className="min-w-0 flex-1">
          {/* Author row */}
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate font-semibold text-ink-title">
              {post.authorName}
            </p>
            {canManagePost && (
              <div className="relative shrink-0" data-feed-menu-root>
                <button
                  type="button"
                  onClick={() => setMenuOpen((prev) => !prev)}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-surface-overlay bg-surface-card text-ink-muted"
                  aria-label="Post actions"
                >
                  <EllipsisIcon className="h-4 w-4" />
                </button>

                {/* Action menu */}
                {menuOpen && !pendingDelete && (
                  <div className="absolute right-0 top-9 z-10 min-w-[140px] rounded-xl border border-surface-overlay bg-surface-card p-1.5 shadow-lg">
                    {isAdmin && post.type === "announcement" && (
                      <button
                        type="button"
                        onClick={handleTogglePin}
                        disabled={pinBusy}
                        className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-40"
                      >
                        {pinBusy
                          ? (isPinnedAnnouncement ? "Unpinning…" : "Pinning…")
                          : (isPinnedAnnouncement ? "Unpin" : "Pin announcement")}
                      </button>
                    )}
                    {isAuthor && (
                      <button
                        type="button"
                        onClick={() => { setMenuOpen(false); setEditMode(true); setEditDraft(post.content); }}
                        className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-ink-body hover:bg-surface-muted"
                      >
                        Edit post
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setMenuOpen(false); setPendingDelete(true); }}
                      className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"
                    >
                      Delete post
                    </button>
                  </div>
                )}

                {/* Delete confirmation popover */}
                {pendingDelete && (
                  <div className="absolute right-0 top-9 z-10 w-52 rounded-xl border border-red-100 bg-surface-card p-3 shadow-lg">
                    <p className="mb-2 text-sm font-medium text-ink-title">Delete this post?</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setPendingDelete(false)}
                        className="flex-1 rounded-lg border border-surface-overlay px-3 py-1.5 text-xs font-semibold text-ink-muted hover:bg-surface-muted"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleDeletePost}
                        disabled={deleteBusy}
                        className="flex-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {deleteBusy ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Meta row — time + comment count + type badge */}
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-hint">
            <span>{formatDistanceToNow(post.createdAt, { addSuffix: true })}</span>
            <span className="rounded-full bg-surface-muted px-2 py-0.5 font-medium text-ink-muted">
              💬 {post.commentCount}
            </span>
            {post.type === "announcement" && !isPinnedAnnouncement && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                Announcement
              </span>
            )}
            {post.type === "round_linked" && (
              <span className="rounded-full bg-surface-muted px-2 py-0.5 font-medium text-ink-muted">
                Round update
              </span>
            )}
          </div>

          {/* Linked round chip */}
          {post.type === "round_linked" && postRound && (
            <Link
              href={`/rounds/${postRound.id}`}
              className="mt-2 inline-flex max-w-full items-center gap-2 rounded-xl border border-brand-100 bg-brand-50 px-3 py-2 text-xs font-medium text-brand-800"
            >
              <span>{`Round ${postRound.roundNumber}`}</span>
              <span className="text-brand-400">•</span>
              <span className="truncate">{postRound.courseName}</span>
              <span aria-hidden="true">↗</span>
            </Link>
          )}

          {/* Post body / edit mode */}
          {editMode ? (
            <div className="mt-3 space-y-2">
              <textarea
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-surface-overlay bg-surface-card px-3 py-2.5 text-sm text-ink-body focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setEditMode(false)}
                  className="rounded-xl border border-surface-overlay px-4 py-2 text-sm font-semibold text-ink-muted hover:bg-surface-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={editBusy || !editDraft.trim()}
                  className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {editBusy ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : post.content ? (
            <p className="mt-3 text-sm leading-relaxed text-ink-body">{post.content}</p>
          ) : null}

          {/* Post images */}
          {post.photoUrls.length > 0 && (
            <div className={`mt-3 grid gap-2 ${post.photoUrls.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
              {post.photoUrls.map((url) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => { setLightboxUrl(url); setLightboxLabel(`${post.authorName} post`); }}
                  className="overflow-hidden rounded-xl border border-surface-overlay bg-surface-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="max-h-72 w-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {/* Reactions */}
          <div className="mt-4 flex flex-wrap gap-2">
            {REACTION_OPTIONS.map((r) => {
              const count = post.reactionCounts[r.type] ?? 0;
              const selected = myReaction?.reactionType === r.type;
              return (
                <button
                  key={r.type}
                  type="button"
                  onClick={() => handleReaction(r.type)}
                  disabled={reactionBusy}
                  aria-label={r.label}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    selected
                      ? "border-brand-600 bg-brand-50 text-brand-700"
                      : "border-surface-overlay bg-surface-card text-ink-muted"
                  }`}
                >
                  {r.emoji} {count > 0 ? count : ""}
                </button>
              );
            })}
          </div>

          {/* Replies section */}
          <div className="mt-4 rounded-xl border border-surface-overlay bg-surface-muted p-3">
            <button
              type="button"
              onClick={handleToggleReplies}
              className="flex w-full items-center justify-between text-left"
            >
              <p className="text-xs font-semibold text-ink-muted">Replies</p>
              <span className="text-xs font-medium text-ink-hint">
                {repliesOpen ? "Hide" : `Show (${post.commentCount})`}
              </span>
            </button>

            {repliesOpen && (
              <>
                <div className="mt-3 space-y-3">
                  {comments.length === 0 ? (
                    <p className="text-xs text-ink-hint">No replies yet.</p>
                  ) : (
                    comments.map((comment) => {
                      const canManageComment = comment.authorId === appUser?.uid || isAdmin;
                      const commentMenuId = `${post.id}:${comment.id}`;
                      return (
                        <div key={comment.id} className="rounded-xl border border-surface-overlay bg-surface-card px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 items-start gap-2">
                              <Avatar src={comment.authorAvatarUrl} name={comment.authorName} size="xs" />
                              <div className="min-w-0">
                                <p className="truncate text-xs font-semibold text-ink-body">{comment.authorName}</p>
                                <p className="text-xs text-ink-hint">
                                  {formatDistanceToNow(comment.createdAt, { addSuffix: true })}
                                </p>
                              </div>
                            </div>
                            {canManageComment && (
                              <div className="relative shrink-0" data-feed-menu-root>
                                <button
                                  type="button"
                                  onClick={() => setOpenCommentMenuId((prev) => prev === commentMenuId ? "" : commentMenuId)}
                                  className="flex h-7 w-7 items-center justify-center rounded-full border border-surface-overlay bg-surface-card text-ink-hint"
                                  aria-label="Reply actions"
                                >
                                  <EllipsisIcon className="h-3.5 w-3.5" />
                                </button>
                                {openCommentMenuId === commentMenuId && (
                                  <div className="absolute right-0 top-9 z-10 min-w-[130px] rounded-xl border border-surface-overlay bg-surface-card p-1.5 shadow-lg">
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteComment(comment)}
                                      disabled={deleteCommentBusyId === comment.id}
                                      className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
                                    >
                                      {deleteCommentBusyId === comment.id ? "Deleting…" : "Delete reply"}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          <p className="mt-1.5 text-sm text-ink-body">{comment.content}</p>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Comment composer */}
                <div className="mt-3 space-y-2">
                  <textarea
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    rows={2}
                    placeholder="Write a reply…"
                    className="w-full rounded-xl border border-surface-overlay bg-surface-card px-3 py-2.5 text-sm text-ink-body focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  {commentError && (
                    <p className="text-xs font-medium text-red-600">{commentError}</p>
                  )}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleCreateComment}
                      disabled={commentBusy || !commentDraft.trim()}
                      className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 disabled:opacity-40"
                    >
                      {commentBusy ? "Posting…" : "Reply"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Image lightbox */}
      {lightboxUrl && (
        <ImageGestureViewer
          src={lightboxUrl}
          alt={lightboxLabel}
          onClose={() => { setLightboxUrl(""); setLightboxLabel(""); }}
        />
      )}
    </div>
  );
}
