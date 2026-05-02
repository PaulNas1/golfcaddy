"use client";

/**
 * FeedPage
 *
 * Responsibilities:
 *   - Subscribes to posts, the pinned announcement, and the current user's reactions
 *   - Owns the "new post" composer state (draft, type, linked round, images)
 *   - Delegates all per-post interaction state to <PostCard>
 *
 * By keeping per-post state inside PostCard, a comment draft or open
 * menu in one card no longer re-renders every other card.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useGroupData } from "@/contexts/GroupDataContext";
import Avatar from "@/components/ui/Avatar";
import PostCard from "@/components/feed/PostCard";
import {
  createFeedPost,
  createPostComment,
  deletePostComment,
  deleteFeedPost,
  setAnnouncementPinnedState,
  setPostReaction,
  subscribeFeedPosts,
  subscribePinnedAnnouncement,
  subscribePostComments,
  subscribeUserReactionsForGroup,
  updateFeedPost,
} from "@/lib/firestore";
import {
  deleteStoredImage,
  uploadFeedPostImages,
  validateImageFile,
} from "@/lib/storageUploads";
import type {
  Post,
  PostComment,
  PostReaction,
  PostReactionType,
} from "@/types";

const MAX_POST_IMAGES = 3;

export default function FeedPage() {
  const { appUser, isAdmin } = useAuth();
  const { rounds } = useGroupData();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ── Feed data ─────────────────────────────────────────────────────────
  const [posts, setPosts] = useState<Post[]>([]);
  const [pinnedAnnouncement, setPinnedAnnouncement] = useState<Post | null>(null);
  const [myReactionsByPostId, setMyReactionsByPostId] = useState<Record<string, PostReaction | null>>({});
  const [feedLoading, setFeedLoading] = useState(true);

  // ── Composer state ────────────────────────────────────────────────────
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [postType, setPostType] = useState<Post["type"]>("general");
  const [linkedRoundId, setLinkedRoundId] = useState("");
  const [postImages, setPostImages] = useState<File[]>([]);
  const [postImagePreviews, setPostImagePreviews] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");

  // ── Subscriptions ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!appUser?.groupId) return;
    return subscribeFeedPosts(
      appUser.groupId,
      (feedPosts) => { setPosts(feedPosts); setFeedLoading(false); },
      { limitCount: 30, onError: (err) => { console.warn("Feed subscription error", err); setFeedLoading(false); } }
    );
  }, [appUser?.groupId]);

  useEffect(() => {
    if (!appUser?.groupId) return;
    return subscribePinnedAnnouncement(
      appUser.groupId,
      setPinnedAnnouncement,
      (err) => console.warn("Pinned announcement subscription error", err)
    );
  }, [appUser?.groupId]);

  useEffect(() => {
    if (!appUser?.uid || !appUser?.groupId) return;
    return subscribeUserReactionsForGroup(
      appUser.groupId,
      appUser.uid,
      (reactionsByPostId) => setMyReactionsByPostId(reactionsByPostId),
      (err) => console.warn("Reactions subscription error", err)
    );
  }, [appUser?.groupId, appUser?.uid]);

  // ── Open composer when deep-linked from a round ───────────────────────
  const roundsById = useMemo(() => new Map(rounds.map((r) => [r.id, r])), [rounds]);

  useEffect(() => {
    const roundIdFromQuery = searchParams.get("roundId");
    if (!roundIdFromQuery || !roundsById.has(roundIdFromQuery)) return;
    setLinkedRoundId((current) => current || roundIdFromQuery);
    setComposerOpen(true);
  }, [roundsById, searchParams]);

  // ── Deduplicate visible posts (pinned + feed may overlap) ─────────────
  const visiblePosts = useMemo(() => {
    const merged = pinnedAnnouncement ? [pinnedAnnouncement, ...posts] : posts;
    return Array.from(new Map(merged.map((p) => [p.id, p])).values());
  }, [pinnedAnnouncement, posts]);

  // ── Image blob URL cleanup ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      postImagePreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [postImagePreviews]);

  // ── Composer helpers ──────────────────────────────────────────────────
  const replacePostImages = (files: File[]) => {
    postImagePreviews.forEach((url) => URL.revokeObjectURL(url));
    setPostImages(files);
    setPostImagePreviews(files.map((f) => URL.createObjectURL(f)));
  };

  const handlePostImagesChange = (files: FileList | null) => {
    const nextFiles = Array.from(files ?? []);
    if (nextFiles.length === 0) { if (fileInputRef.current) fileInputRef.current.value = ""; return; }
    if (nextFiles.length > MAX_POST_IMAGES) {
      setPostError(`Attach up to ${MAX_POST_IMAGES} images per post.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    for (const file of nextFiles) {
      const err = validateImageFile(file);
      if (err) { setPostError(err); if (fileInputRef.current) fileInputRef.current.value = ""; return; }
    }
    setPostError("");
    replacePostImages(nextFiles);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCreatePost = async () => {
    if (!appUser?.groupId || !appUser) return;
    setPosting(true);
    setPostError("");
    let uploadedImagePaths: string[] = [];
    try {
      const uploads = postImages.length > 0
        ? await uploadFeedPostImages(appUser.groupId, appUser.uid, postImages)
        : [];
      uploadedImagePaths = uploads.map((u) => u.path);
      await createFeedPost({
        groupId: appUser.groupId,
        author: appUser,
        content: draft,
        type: isAdmin && postType === "announcement" ? "announcement" : linkedRoundId ? "round_linked" : "general",
        roundId: linkedRoundId || null,
        photoUrls: uploads.map((u) => u.url),
        photoPaths: uploads.map((u) => u.path),
      });
      setDraft("");
      setPostType("general");
      setLinkedRoundId("");
      replacePostImages([]);
      setComposerOpen(false);
    } catch (error) {
      await Promise.all(uploadedImagePaths.map((p) => deleteStoredImage(p)));
      setPostError(error instanceof Error && error.message ? error.message : "Failed to publish post.");
    } finally {
      setPosting(false);
    }
  };

  // ── PostCard callbacks ────────────────────────────────────────────────

  const handleReaction = async (post: Post, type: PostReactionType) => {
    if (!appUser) return;
    const previous = myReactionsByPostId[post.id] ?? null;
    const current = previous?.reactionType ?? null;
    const next = current === type ? null : type;

    // Optimistic update
    setMyReactionsByPostId((prev) => ({
      ...prev,
      [post.id]: next ? {
        id: appUser.uid, postId: post.id, groupId: post.groupId,
        userId: appUser.uid, reactionType: next,
        createdAt: previous?.createdAt ?? new Date(), updatedAt: new Date(),
      } : null,
    }));
    try {
      await setPostReaction({ post, user: appUser, reactionType: next });
    } catch {
      // Roll back on failure
      setMyReactionsByPostId((prev) => ({ ...prev, [post.id]: previous }));
    }
  };

  const handleSaveEdit = async (post: Post, newContent: string) => {
    await updateFeedPost({ postId: post.id, content: newContent });
  };

  const handleDeletePost = async (post: Post) => {
    await deleteFeedPost(post.id);
    await Promise.all((post.photoPaths ?? []).map((p) => deleteStoredImage(p)));
  };

  const handleCreateComment = async (post: Post, content: string) => {
    if (!appUser) throw new Error("Not signed in.");
    await createPostComment({ post, author: appUser, content });
  };

  const handleDeleteComment = async (post: Post, comment: PostComment) => {
    await deletePostComment({ postId: post.id, commentId: comment.id });
  };

  const handleTogglePin = async (post: Post) => {
    if (!appUser?.groupId || !isAdmin || post.type !== "announcement") return;
    await setAnnouncementPinnedState({
      postId: post.id,
      groupId: appUser.groupId,
      pinned: pinnedAnnouncement?.id !== post.id,
    });
  };

  const subscribeToComments = (
    postId: string,
    onComments: (comments: PostComment[]) => void
  ) => {
    return subscribePostComments(postId, onComments, (err) =>
      console.warn("Comments subscription error", err)
    );
  };

  // ── Render ────────────────────────────────────────────────────────────
  const linkedRound = linkedRoundId ? roundsById.get(linkedRoundId) ?? null : null;

  return (
    <div className="px-4 py-6 pb-8">
      <h1 className="mb-5 text-2xl font-bold text-ink-title">Social Feed</h1>

      {/* ── Post composer ─────────────────────────────────────────── */}
      {!composerOpen ? (
        <button
          type="button"
          onClick={() => setComposerOpen(true)}
          className="mb-5 flex w-full items-center gap-3 rounded-2xl border border-surface-overlay bg-surface-card px-4 py-3 shadow-sm text-left"
        >
          <Avatar src={appUser?.avatarUrl} name={appUser?.displayName ?? "?"} size="sm" />
          <span className="flex-1 text-sm text-ink-hint">What&apos;s on your mind?</span>
          <span className="text-ink-hint text-lg">📷</span>
        </button>
      ) : (
        <div className="mb-5 rounded-2xl border border-surface-overlay bg-surface-card p-4 shadow-sm">
          {/* Composer header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Avatar src={appUser?.avatarUrl} name={appUser?.displayName ?? "?"} size="sm" />
              <span className="text-sm font-semibold text-ink-title">{appUser?.displayName}</span>
            </div>
            <button
              type="button"
              onClick={() => setComposerOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-muted text-ink-muted hover:bg-surface-overlay"
              aria-label="Close composer"
            >
              ✕
            </button>
          </div>

          {/* Admin post type selector */}
          {isAdmin && (
            <div className="mb-3 inline-flex rounded-xl border border-surface-overlay bg-surface-muted p-1">
              {([{ id: "general", label: "General post" }, { id: "announcement", label: "Announcement" }] as const).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPostType(opt.id)}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                    postType === opt.id
                      ? "bg-brand-600 text-white"
                      : "text-ink-muted hover:bg-surface-card"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Text area */}
          <textarea
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            placeholder={
              isAdmin && postType === "announcement"
                ? "Share an update members should not miss…"
                : linkedRound
                ? "Share an update from this round…"
                : "What's happening in the group?"
            }
            className="w-full rounded-xl border border-surface-overlay px-3 py-3 text-sm text-ink-body focus:outline-none focus:ring-2 focus:ring-brand-500"
          />

          {/* Image attachment */}
          <div className="mt-3 rounded-xl border border-surface-overlay bg-surface-muted px-3 py-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => handlePostImagesChange(e.target.files)}
              className="block w-full text-xs text-ink-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-brand-700"
            />
            <p className="mt-2 text-xs text-ink-hint">
              Attach up to {MAX_POST_IMAGES} images. JPG or PNG up to 5 MB each.
            </p>
            {postImagePreviews.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {postImagePreviews.map((url, index) => (
                  <div key={url} className="relative overflow-hidden rounded-xl bg-surface-card">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-24 w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => replacePostImages(postImages.filter((_, i) => i !== index))}
                      className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-1 text-xs font-semibold text-white"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Round link selector */}
          <div className="mt-3 rounded-xl border border-surface-overlay bg-surface-card px-3 py-3">
            <label className="block text-xs font-semibold text-ink-muted">Link to round</label>
            <p className="mt-1 text-xs text-ink-hint">
              Optional. Linked photos appear in the photo library under that round.
            </p>
            <select
              value={linkedRoundId}
              onChange={(e) => setLinkedRoundId(e.target.value)}
              className="mt-2 w-full rounded-xl border border-surface-overlay bg-surface-muted px-3 py-2.5 text-sm text-ink-body focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">No round linked</option>
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>{`Round ${r.roundNumber} - ${r.courseName}`}</option>
              ))}
            </select>
            {linkedRound && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-brand-50 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">Round update</p>
                  <p className="truncate text-sm font-medium text-brand-900">{`Round ${linkedRound.roundNumber} - ${linkedRound.courseName}`}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setLinkedRoundId("")}
                  className="shrink-0 rounded-full border border-brand-200 bg-surface-card px-2.5 py-1 text-xs font-semibold text-brand-700"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {postError && <p className="mt-2 text-xs font-medium text-red-600">{postError}</p>}

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={handleCreatePost}
              disabled={posting || (draft.trim().length === 0 && postImages.length === 0)}
              className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {posting
                ? "Posting…"
                : isAdmin && postType === "announcement"
                ? "Post announcement"
                : linkedRound
                ? "Post round update"
                : "Post"}
            </button>
          </div>
        </div>
      )}

      {/* ── Post list ─────────────────────────────────────────────── */}
      {feedLoading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-surface-card p-4" />
          ))}
        </div>
      ) : visiblePosts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-ink-hint">
          <div className="mb-4 text-5xl">💬</div>
          <p className="mb-1 font-medium text-ink-muted">No social posts yet</p>
          <p className="max-w-xs text-center text-sm">
            Banter, round photos, and general club chat will live here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visiblePosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              appUser={appUser}
              isAdmin={isAdmin}
              pinnedPostId={pinnedAnnouncement?.id ?? null}
              myReaction={myReactionsByPostId[post.id] ?? null}
              postRound={post.roundId ? roundsById.get(post.roundId) ?? null : null}
              onReaction={handleReaction}
              onSaveEdit={handleSaveEdit}
              onDeletePost={handleDeletePost}
              onCreateComment={handleCreateComment}
              onDeleteComment={handleDeleteComment}
              onTogglePin={handleTogglePin}
              subscribeToComments={subscribeToComments}
            />
          ))}
        </div>
      )}
    </div>
  );
}
