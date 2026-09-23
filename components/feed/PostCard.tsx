"use client";

/**
 * PostCard
 *
 * One feed post: header (avatar · name · time · ⋯), full-width text,
 * edge-to-edge photos, optional round chip, then <PostEngagement>.
 *
 * All per-post UI state (menu, edit mode, replies, lightbox) stays local so
 * typing in one card never re-renders the rest of the feed. Network calls
 * are callbacks owned by the feed page.
 */

import { useState } from "react";
import Link from "next/link";
import ImageGestureViewer from "@/components/ImageGestureViewer";
import Avatar from "@/components/ui/Avatar";
import { EllipsisIcon } from "@/components/ui/icons";
import PostEngagement, { shortAgo, type EngagementHandlers } from "@/components/feed/PostEngagement";
import type { AppUser, Post, PostReaction, Round } from "@/types";

interface PostCardProps extends EngagementHandlers {
  post: Post;
  appUser: AppUser | null;
  isAdmin: boolean;
  /** Renders with the amber "Pinned" treatment at the top of the feed. */
  pinned?: boolean;
  myReaction: PostReaction | null;
  postRound: Round | null;
  onSaveEdit: (post: Post, newContent: string) => Promise<void>;
  onDeletePost: (post: Post) => Promise<void>;
  onTogglePin: (post: Post) => Promise<void>;
}

export default function PostCard({
  post,
  appUser,
  isAdmin,
  pinned = false,
  myReaction,
  postRound,
  onSaveEdit,
  onDeletePost,
  onTogglePin,
  ...engagement
}: PostCardProps) {
  const isAuthor = post.authorId === appUser?.uid;
  const canManagePost = isAuthor || isAdmin;

  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState(post.content);

  const [lightboxUrl, setLightboxUrl] = useState("");

  const run = async (fn: () => Promise<void>) => {
    setMenuOpen(false);
    setPendingDelete(false);
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const photos = post.photoUrls;

  return (
    <article
      className={`overflow-hidden rounded-2xl border px-4 pb-2 pt-3.5 ${
        pinned
          ? "border-announce-border bg-announce-bg"
          : "border-surface-overlay bg-surface-card"
      }`}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3">
        <Avatar src={post.authorAvatarUrl} name={post.authorName} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-ink-title">{post.authorName}</p>
          <p className="text-xs text-ink-hint">
            {pinned ? (
              <span className="font-semibold text-announce-label">📣 Pinned · </span>
            ) : post.type === "announcement" ? (
              <span className="text-announce-label">📣 Announcement · </span>
            ) : null}
            {shortAgo(post.createdAt)}
          </p>
        </div>

        {canManagePost && (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => { setMenuOpen((v) => !v); setPendingDelete(false); }}
              className="grid h-8 w-8 place-items-center rounded-full text-ink-hint hover:bg-surface-muted"
              aria-label="Post actions"
            >
              <EllipsisIcon className="h-5 w-5" />
            </button>

            {menuOpen && !pendingDelete && (
              <div className="absolute right-0 top-9 z-10 min-w-[160px] rounded-xl border border-surface-overlay bg-surface-card p-1.5 shadow-lg">
                {isAdmin && post.type === "announcement" && (
                  <button
                    type="button"
                    onClick={() => run(() => onTogglePin(post))}
                    disabled={busy}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-announce-label hover:bg-surface-muted disabled:opacity-40"
                  >
                    {pinned ? "Unpin" : "Pin to top"}
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
                  onClick={() => setPendingDelete(true)}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-500 hover:bg-surface-muted"
                >
                  Delete post
                </button>
              </div>
            )}

            {menuOpen && pendingDelete && (
              <div className="absolute right-0 top-9 z-10 w-52 rounded-xl border border-surface-overlay bg-surface-card p-3 shadow-lg">
                <p className="mb-2 text-sm font-medium text-ink-title">Delete this post?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setPendingDelete(false); setMenuOpen(false); }}
                    className="flex-1 rounded-lg border border-surface-overlay px-3 py-1.5 text-xs font-semibold text-ink-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => run(() => onDeletePost(post))}
                    disabled={busy}
                    className="flex-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {busy ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </header>

      {/* ── Body ───────────────────────────────────────────────────── */}
      {editMode ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={editDraft}
            onChange={(e) => setEditDraft(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-surface-overlay bg-surface-muted px-3 py-2.5 text-[15px] text-ink-body focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditMode(false)}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-ink-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => run(async () => { await onSaveEdit(post, editDraft); setEditMode(false); })}
              disabled={busy || !editDraft.trim()}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : post.content ? (
        <p className="mt-2.5 whitespace-pre-line break-words text-[15px] leading-relaxed text-ink-body">
          {post.content}
        </p>
      ) : null}

      {/* ── Photos: edge to edge ───────────────────────────────────── */}
      {photos.length > 0 && (
        <div className={`-mx-4 mt-3 grid gap-0.5 ${photos.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {photos.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setLightboxUrl(url)}
              className={`block bg-surface-muted ${photos.length === 3 && i === 0 ? "col-span-2" : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                loading="lazy"
                className={`w-full object-cover ${photos.length === 1 ? "max-h-[440px]" : "aspect-square"}`}
              />
            </button>
          ))}
        </div>
      )}

      {/* ── Linked round ───────────────────────────────────────────── */}
      {postRound && (
        <Link
          href={`/rounds/${postRound.id}`}
          className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full bg-brand-500/15 px-3 py-1 text-xs font-semibold text-brand-600"
        >
          <span>⛳</span>
          <span className="truncate">{`Round ${postRound.roundNumber} · ${postRound.courseName}`}</span>
          <span aria-hidden="true">›</span>
        </Link>
      )}

      <PostEngagement post={post} appUser={appUser} isAdmin={isAdmin} myReaction={myReaction} {...engagement} />

      {lightboxUrl && (
        <ImageGestureViewer
          src={lightboxUrl}
          alt={`${post.authorName} post`}
          onClose={() => setLightboxUrl("")}
        />
      )}
    </article>
  );
}
