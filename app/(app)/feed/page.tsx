"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
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
  subscribePostReaction,
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

const POST_LABELS: Record<Post["type"], string> = {
  announcement: "Announcement",
  general: "Post",
  round_linked: "Round update",
};

const REACTION_OPTIONS: {
  type: PostReactionType;
  emoji: string;
  label: string;
}[] = [
  { type: "like", emoji: "👍", label: "Like" },
  { type: "love", emoji: "❤️", label: "Love" },
  { type: "laugh", emoji: "😂", label: "Laugh" },
  { type: "fire", emoji: "🔥", label: "Fire" },
  { type: "dislike", emoji: "👎", label: "Dislike" },
];

const MAX_POST_IMAGES = 3;

export default function FeedPage() {
  const { appUser, isAdmin } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [pinnedAnnouncement, setPinnedAnnouncement] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [postType, setPostType] = useState<Post["type"]>("general");
  const [postImages, setPostImages] = useState<File[]>([]);
  const [postImagePreviews, setPostImagePreviews] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");
  const [reactingPostId, setReactingPostId] = useState("");
  const [postingCommentPostId, setPostingCommentPostId] = useState("");
  const [myReactionsByPostId, setMyReactionsByPostId] = useState<
    Record<string, PostReaction | null>
  >({});
  const [commentsByPostId, setCommentsByPostId] = useState<
    Record<string, PostComment[]>
  >({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentErrors, setCommentErrors] = useState<Record<string, string>>({});
  const [editingPostId, setEditingPostId] = useState("");
  const [editDrafts, setEditDrafts] = useState<Record<string, string>>({});
  const [editingBusyPostId, setEditingBusyPostId] = useState("");
  const [deleteBusyPostId, setDeleteBusyPostId] = useState("");
  const [deleteCommentBusyId, setDeleteCommentBusyId] = useState("");
  const [pinningPostId, setPinningPostId] = useState("");
  const [openMenuPostId, setOpenMenuPostId] = useState("");
  const [openCommentMenuId, setOpenCommentMenuId] = useState("");
  const [selectedImageUrl, setSelectedImageUrl] = useState("");
  const [selectedImageLabel, setSelectedImageLabel] = useState("");

  useEffect(() => {
    if (!appUser?.groupId) return;
    return subscribeFeedPosts(
      appUser.groupId,
      (feedPosts) => {
        setPosts(feedPosts);
        setLoading(false);
      },
      {
        onError: (err) => {
          console.warn("Unable to subscribe to feed posts", err);
          setLoading(false);
        },
      }
    );
  }, [appUser?.groupId]);

  useEffect(() => {
    if (!appUser?.groupId) return;
    return subscribePinnedAnnouncement(
      appUser.groupId,
      setPinnedAnnouncement,
      (err) => console.warn("Unable to subscribe to pinned announcement", err)
    );
  }, [appUser?.groupId]);

  const visiblePosts = useMemo(() => {
    const nextPosts = pinnedAnnouncement ? [pinnedAnnouncement, ...posts] : posts;
    return Array.from(new Map(nextPosts.map((post) => [post.id, post])).values());
  }, [pinnedAnnouncement, posts]);

  useEffect(() => {
    if (!appUser?.uid) return;
    if (visiblePosts.length === 0) {
      setMyReactionsByPostId({});
      setCommentsByPostId({});
      return;
    }

    const reactionUnsubscribes = visiblePosts.map((post) =>
      subscribePostReaction(
        post.id,
        appUser.uid,
        (reaction) => {
          setMyReactionsByPostId((current) => ({
            ...current,
            [post.id]: reaction,
          }));
        },
        (err) => console.warn("Unable to subscribe to post reaction", err)
      )
    );

    const commentUnsubscribes = visiblePosts.map((post) =>
      subscribePostComments(
        post.id,
        (comments) => {
          setCommentsByPostId((current) => ({
            ...current,
            [post.id]: comments,
          }));
        },
        (err) => console.warn("Unable to subscribe to post comments", err)
      )
    );

    return () => {
      reactionUnsubscribes.forEach((unsubscribe) => unsubscribe());
      commentUnsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [appUser?.uid, visiblePosts]);

  useEffect(() => {
    return () => {
      postImagePreviews.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
    };
  }, [postImagePreviews]);

  useEffect(() => {
    if (!openMenuPostId && !openCommentMenuId && !selectedImageUrl) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      if (!target.closest("[data-feed-menu-root]")) {
        setOpenMenuPostId("");
        setOpenCommentMenuId("");
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenMenuPostId("");
      setOpenCommentMenuId("");
      setSelectedImageUrl("");
      setSelectedImageLabel("");
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openCommentMenuId, openMenuPostId, selectedImageUrl]);

  const replacePostImages = (files: File[]) => {
    postImagePreviews.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
    setPostImages(files);
    setPostImagePreviews(files.map((file) => URL.createObjectURL(file)));
  };

  const handlePostImagesChange = (files: FileList | null) => {
    const nextFiles = Array.from(files ?? []);
    if (nextFiles.length === 0) return;
    if (nextFiles.length > MAX_POST_IMAGES) {
      setPostError(`Attach up to ${MAX_POST_IMAGES} images per post.`);
      return;
    }

    for (const file of nextFiles) {
      const validationError = validateImageFile(file);
      if (validationError) {
        setPostError(validationError);
        return;
      }
    }

    setPostError("");
    replacePostImages(nextFiles);
  };

  const handleRemoveComposerImage = (index: number) => {
    const nextFiles = postImages.filter((_, fileIndex) => fileIndex !== index);
    replacePostImages(nextFiles);
  };

  const handleCreatePost = async () => {
    if (!appUser?.groupId || !appUser) return;
    setPosting(true);
    setPostError("");
    let uploadedImagePaths: string[] = [];

    try {
      const uploads =
        postImages.length > 0
          ? await uploadFeedPostImages(
              appUser.groupId,
              appUser.uid,
              postImages
            )
          : [];
      uploadedImagePaths = uploads.map((upload) => upload.path);
      await createFeedPost({
        groupId: appUser.groupId,
        author: appUser,
        content: draft,
        type: isAdmin && postType === "announcement" ? "announcement" : "general",
        photoUrls: uploads.map((upload) => upload.url),
        photoPaths: uploads.map((upload) => upload.path),
      });
      setDraft("");
      setPostType("general");
      replacePostImages([]);
    } catch (error) {
      await Promise.all(uploadedImagePaths.map((path) => deleteStoredImage(path)));
      setPostError(
        error instanceof Error && error.message
          ? error.message
          : "Failed to publish post."
      );
    } finally {
      setPosting(false);
    }
  };

  const handleReaction = async (
    post: Post,
    reactionType: PostReactionType
  ) => {
    if (!appUser) return;

    const previousReaction = myReactionsByPostId[post.id] ?? null;
    const currentReaction = previousReaction?.reactionType ?? null;
    const nextReaction = currentReaction === reactionType ? null : reactionType;
    setReactingPostId(post.id);
    setMyReactionsByPostId((current) => ({
      ...current,
      [post.id]: nextReaction
        ? {
            id: appUser.uid,
            postId: post.id,
            groupId: post.groupId,
            userId: appUser.uid,
            reactionType: nextReaction,
            createdAt: previousReaction?.createdAt ?? new Date(),
            updatedAt: new Date(),
          }
        : null,
    }));
    try {
      await setPostReaction({
        post,
        user: appUser,
        reactionType: nextReaction,
      });
    } catch (error) {
      console.error("Failed to update reaction", error);
      setMyReactionsByPostId((current) => ({
        ...current,
        [post.id]: previousReaction,
      }));
    } finally {
      setReactingPostId("");
    }
  };

  const handleCreateComment = async (post: Post) => {
    if (!appUser) return;
    setPostingCommentPostId(post.id);
    setCommentErrors((current) => ({ ...current, [post.id]: "" }));
    try {
      await createPostComment({
        post,
        author: appUser,
        content: commentDrafts[post.id] ?? "",
      });
      setCommentDrafts((current) => ({ ...current, [post.id]: "" }));
    } catch (error) {
      setCommentErrors((current) => ({
        ...current,
        [post.id]:
          error instanceof Error && error.message
            ? error.message
            : "Failed to send reply.",
      }));
    } finally {
      setPostingCommentPostId("");
    }
  };

  const handleStartEdit = (post: Post) => {
    setOpenMenuPostId("");
    setEditingPostId(post.id);
    setEditDrafts((current) => ({
      ...current,
      [post.id]: post.content,
    }));
  };

  const handleSaveEdit = async (post: Post) => {
    setEditingBusyPostId(post.id);
    try {
      await updateFeedPost({
        postId: post.id,
        content: editDrafts[post.id] ?? "",
      });
      setEditingPostId("");
    } catch (error) {
      console.error("Failed to update post", error);
    } finally {
      setEditingBusyPostId("");
    }
  };

  const handleDeletePost = async (post: Post) => {
    const confirmed = window.confirm("Delete this post?");
    if (!confirmed) return;

    setOpenMenuPostId("");
    setDeleteBusyPostId(post.id);
    try {
      await deleteFeedPost(post.id);
      await Promise.all(
        (post.photoPaths ?? []).map((path) => deleteStoredImage(path))
      );
    } catch (error) {
      console.error("Failed to delete post", error);
    } finally {
      setDeleteBusyPostId("");
    }
  };

  const handleToggleAnnouncementPin = async (post: Post) => {
    if (!appUser?.groupId || !isAdmin || post.type !== "announcement") return;

    setOpenMenuPostId("");
    setPinningPostId(post.id);
    try {
      await setAnnouncementPinnedState({
        postId: post.id,
        groupId: appUser.groupId,
        pinned: pinnedAnnouncement?.id !== post.id,
      });
    } catch (error) {
      console.error("Failed to update announcement pin state", error);
    } finally {
      setPinningPostId("");
    }
  };

  const handleDeleteComment = async (post: Post, comment: PostComment) => {
    const confirmed = window.confirm("Delete this reply?");
    if (!confirmed) return;

    setOpenCommentMenuId("");
    setDeleteCommentBusyId(comment.id);
    try {
      await deletePostComment({
        postId: post.id,
        commentId: comment.id,
      });
    } catch (error) {
      console.error("Failed to delete reply", error);
    } finally {
      setDeleteCommentBusyId("");
    }
  };

  const openImageViewer = (imageUrl: string, label: string) => {
    setSelectedImageUrl(imageUrl);
    setSelectedImageLabel(label);
  };

  return (
    <div className="px-4 py-6 pb-8">
      <h1 className="mb-5 text-2xl font-bold text-gray-800">Social Feed</h1>

      <div className="mb-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800">Write a post</h2>
        <p className="mt-1 text-xs text-gray-500">
          {isAdmin && postType === "announcement"
            ? "Announcements notify members and stay clearly labeled in the feed."
            : "Banter, wrap-up notes, photos from the day, or general club chat."}
        </p>
        {isAdmin && (
          <div className="mt-3 inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
            {([
              { id: "general", label: "General post" },
              { id: "announcement", label: "Announcement" },
            ] as const).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setPostType(option.id)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  postType === option.id
                    ? "bg-green-600 text-white"
                    : "text-gray-600 hover:bg-white"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={4}
          placeholder={
            isAdmin && postType === "announcement"
              ? "Share an update members should not miss..."
              : "What’s happening in the group?"
          }
          className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => handlePostImagesChange(event.target.files)}
            className="block w-full text-xs text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-green-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-green-700"
          />
          <p className="mt-2 text-[11px] text-gray-400">
            Attach up to {MAX_POST_IMAGES} images. JPG or PNG up to 5 MB each.
          </p>
          {postImagePreviews.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {postImagePreviews.map((previewUrl, index) => (
                <div key={previewUrl} className="relative overflow-hidden rounded-xl bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt=""
                    className="h-24 w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveComposerImage(index)}
                    className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-1 text-[11px] font-semibold text-white"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        {postError && (
          <p className="mt-2 text-xs font-medium text-red-600">{postError}</p>
        )}
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={handleCreatePost}
            disabled={posting || (draft.trim().length === 0 && postImages.length === 0)}
            className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-green-300"
          >
            {posting
              ? "Posting..."
              : isAdmin && postType === "announcement"
              ? "Post announcement"
              : "Post"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-white p-4" />
          ))}
        </div>
      ) : visiblePosts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <div className="mb-4 text-5xl">💬</div>
          <p className="mb-1 font-medium text-gray-500">No social posts yet</p>
          <p className="max-w-xs text-center text-sm">
            Banter, round photos, and general club chat will live here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visiblePosts.map((post) => {
            const comments = commentsByPostId[post.id] ?? [];
            const isAuthor = post.authorId === appUser?.uid;
            const canDeletePost = isAuthor || isAdmin;
            const isEditing = editingPostId === post.id;
            const isMenuOpen = openMenuPostId === post.id;
            const isPinnedAnnouncement = pinnedAnnouncement?.id === post.id;
            return (
              <div
                key={post.id}
                className={`rounded-2xl border p-4 shadow-sm ${
                  isPinnedAnnouncement
                    ? "border-amber-200 bg-amber-50/70"
                    : "border-gray-100 bg-white"
                }`}
              >
                {isPinnedAnnouncement && (
                  <div className="mb-3 flex items-center gap-2">
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">
                      Pinned announcement
                    </span>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  {post.authorAvatarUrl ? (
                    <div
                      className="h-10 w-10 rounded-full bg-cover bg-center"
                      style={{ backgroundImage: `url(${post.authorAvatarUrl})` }}
                      role="img"
                      aria-label={post.authorName}
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-700">
                      {post.authorName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate font-semibold text-gray-800">
                        {post.authorName}
                      </p>
                      {canDeletePost && (
                        <div className="relative shrink-0" data-feed-menu-root>
                          <button
                            type="button"
                            onClick={() =>
                              setOpenMenuPostId((current) =>
                                current === post.id ? "" : post.id
                              )
                            }
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500"
                            aria-label="Post actions"
                          >
                            <EllipsisIcon className="h-4 w-4" />
                          </button>
                          {isMenuOpen && (
                            <div className="absolute right-0 top-9 z-10 min-w-[128px] rounded-xl border border-gray-100 bg-white p-1.5 shadow-lg">
                              {isAdmin && post.type === "announcement" && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleAnnouncementPin(post)}
                                  disabled={pinningPostId === post.id}
                                  className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:text-amber-300"
                                >
                                  {pinningPostId === post.id
                                    ? isPinnedAnnouncement
                                      ? "Unpinning..."
                                      : "Pinning..."
                                    : isPinnedAnnouncement
                                    ? "Unpin announcement"
                                    : "Pin announcement"}
                                </button>
                              )}
                              {isAuthor && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    isEditing
                                      ? setEditingPostId("")
                                      : handleStartEdit(post)
                                  }
                                  className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                {isEditing ? "Cancel edit" : "Edit post"}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeletePost(post)}
                                disabled={deleteBusyPostId === post.id}
                                className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50 disabled:text-red-300"
                              >
                                {deleteBusyPostId === post.id
                                  ? "Deleting..."
                                  : "Delete post"}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                      <span>
                        {formatDistanceToNow(post.createdAt, { addSuffix: true })}
                      </span>
                      <span className="rounded-full bg-gray-50 px-2 py-0.5 font-medium text-gray-500">
                        💬 {post.commentCount}
                      </span>
                      {post.type === "announcement" && !isPinnedAnnouncement && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                          Announcement
                        </span>
                      )}
                      {post.type === "round_linked" && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">
                          {POST_LABELS[post.type]}
                        </span>
                      )}
                    </div>
                    {isEditing ? (
                      <div className="mt-3 space-y-2">
                        <textarea
                          value={editDrafts[post.id] ?? ""}
                          onChange={(event) =>
                            setEditDrafts((current) => ({
                              ...current,
                              [post.id]: event.target.value,
                            }))
                          }
                          rows={3}
                          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(post)}
                            disabled={
                              editingBusyPostId === post.id ||
                              (editDrafts[post.id] ?? "").trim().length === 0
                            }
                            className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 disabled:border-gray-100 disabled:bg-gray-100 disabled:text-gray-400"
                          >
                            {editingBusyPostId === post.id ? "Saving..." : "Save"}
                          </button>
                        </div>
                      </div>
                    ) : post.content ? (
                      <p className="mt-3 text-sm leading-relaxed text-gray-700">
                        {post.content}
                      </p>
                    ) : null}
                    {post.photoUrls.length > 0 && (
                      <div
                        className={`mt-3 grid gap-2 ${
                          post.photoUrls.length === 1 ? "grid-cols-1" : "grid-cols-2"
                        }`}
                      >
                        {post.photoUrls.map((photoUrl) => (
                          <button
                            key={photoUrl}
                            type="button"
                            onClick={() =>
                              openImageViewer(photoUrl, `${post.authorName} post image`)
                            }
                            className="overflow-hidden rounded-xl border border-gray-100 bg-gray-50"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={photoUrl}
                              alt=""
                              className="max-h-72 w-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {REACTION_OPTIONS.map((reaction) => {
                        const count = post.reactionCounts[reaction.type] ?? 0;
                        const selected =
                          myReactionsByPostId[post.id]?.reactionType ===
                          reaction.type;
                        return (
                          <button
                            key={reaction.type}
                            type="button"
                            onClick={() => handleReaction(post, reaction.type)}
                            disabled={reactingPostId === post.id}
                            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                              selected
                                ? "border-green-600 bg-green-50 text-green-700"
                                : "border-gray-200 bg-white text-gray-600"
                            }`}
                            aria-label={reaction.label}
                          >
                            {reaction.emoji} {count > 0 ? count : ""}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-3">
                      <p className="text-xs font-semibold text-gray-700">
                        Replies
                      </p>
                      <div className="mt-3 space-y-3">
                        {comments.length === 0 ? (
                          <p className="text-[11px] text-gray-400">
                            No replies yet.
                          </p>
                        ) : (
                          comments.map((comment) => {
                            const canManageComment =
                              comment.authorId === appUser?.uid || isAdmin;
                            const commentMenuId = `${post.id}:${comment.id}`;
                            const isCommentMenuOpen =
                              openCommentMenuId === commentMenuId;

                            return (
                              <div
                                key={comment.id}
                                className="rounded-xl border border-gray-100 bg-white px-3 py-2"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex min-w-0 items-start gap-2">
                                    {comment.authorAvatarUrl ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={comment.authorAvatarUrl}
                                        alt=""
                                        className="h-7 w-7 shrink-0 rounded-full object-cover"
                                      />
                                    ) : (
                                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 text-[11px] font-bold text-green-700">
                                        {comment.authorName.charAt(0).toUpperCase()}
                                      </div>
                                    )}
                                    <div className="min-w-0">
                                      <p className="truncate text-xs font-semibold text-gray-700">
                                        {comment.authorName}
                                      </p>
                                      <p className="text-[11px] text-gray-400">
                                        {formatDistanceToNow(comment.createdAt, {
                                          addSuffix: true,
                                        })}
                                      </p>
                                    </div>
                                  </div>
                                  {canManageComment && (
                                    <div className="relative shrink-0" data-feed-menu-root>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setOpenCommentMenuId((current) =>
                                            current === commentMenuId ? "" : commentMenuId
                                          )
                                        }
                                        className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500"
                                        aria-label="Reply actions"
                                      >
                                        <EllipsisIcon className="h-4 w-4" />
                                      </button>
                                      {isCommentMenuOpen && (
                                        <div className="absolute right-0 top-9 z-10 min-w-[124px] rounded-xl border border-gray-100 bg-white p-1.5 shadow-lg">
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteComment(post, comment)}
                                            disabled={deleteCommentBusyId === comment.id}
                                            className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50 disabled:text-red-300"
                                          >
                                            {deleteCommentBusyId === comment.id
                                              ? "Deleting..."
                                              : "Delete reply"}
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <p className="mt-1 text-sm text-gray-700">
                                  {comment.content}
                                </p>
                              </div>
                            );
                          })
                        )}
                      </div>
                      <div className="mt-3 space-y-2">
                        <textarea
                          value={commentDrafts[post.id] ?? ""}
                          onChange={(event) =>
                            setCommentDrafts((current) => ({
                              ...current,
                              [post.id]: event.target.value,
                            }))
                          }
                          rows={2}
                          placeholder="Write a reply..."
                          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                        {commentErrors[post.id] && (
                          <p className="text-xs font-medium text-red-600">
                            {commentErrors[post.id]}
                          </p>
                        )}
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleCreateComment(post)}
                            disabled={
                              postingCommentPostId === post.id ||
                              (commentDrafts[post.id] ?? "").trim().length === 0
                            }
                            className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 disabled:border-gray-100 disabled:bg-gray-100 disabled:text-gray-400"
                          >
                            {postingCommentPostId === post.id
                              ? "Posting..."
                              : "Reply"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedImageUrl && (
        <FeedImageViewer
          imageUrl={selectedImageUrl}
          imageLabel={selectedImageLabel}
          onClose={() => {
            setSelectedImageUrl("");
            setSelectedImageLabel("");
          }}
        />
      )}
    </div>
  );
}

function FeedImageViewer({
  imageUrl,
  imageLabel,
  onClose,
}: {
  imageUrl: string;
  imageLabel: string;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const pinchRef = useRef<{
    startDistance: number;
    startScale: number;
  } | null>(null);
  const scaleRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const skipTouchEndResetRef = useRef(false);
  const panRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const lastTapRef = useRef(0);

  useEffect(() => {
    setMounted(true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  const closeViewer = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    onClose();
  };

  const toggleZoom = () => {
    if (scaleRef.current > 1) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
      scaleRef.current = 1;
      offsetRef.current = { x: 0, y: 0 };
      return;
    }

    setScale(2.5);
    setOffset({ x: 0, y: 0 });
    scaleRef.current = 2.5;
    offsetRef.current = { x: 0, y: 0 };
  };

  const getTouchDistance = (
    touches: ArrayLike<{ clientX: number; clientY: number }>
  ) => {
    const [first, second] = [touches[0], touches[1]];
    return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2) {
      pinchRef.current = {
        startDistance: getTouchDistance(event.touches),
        startScale: scale,
      };
      panRef.current = null;
      setDragging(true);
      return;
    }

    if (event.touches.length !== 1) return;

    const now = Date.now();
    if (now - lastTapRef.current < 260) {
      event.preventDefault();
      skipTouchEndResetRef.current = true;
      toggleZoom();
      lastTapRef.current = 0;
      panRef.current = null;
      return;
    }

    lastTapRef.current = now;
    const touch = event.touches[0];
    panRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      originX: offset.x,
      originY: offset.y,
      moved: false,
    };
    setDragging(true);
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2 && pinchRef.current) {
      event.preventDefault();
      const nextScale = Math.min(
        4,
        Math.max(
          1,
          pinchRef.current.startScale *
            (getTouchDistance(event.touches) / pinchRef.current.startDistance)
        )
      );
      setScale(nextScale);
      if (nextScale <= 1.05) {
        setOffset({ x: 0, y: 0 });
      }
      return;
    }

    if (event.touches.length !== 1 || !panRef.current) return;

    const touch = event.touches[0];
    const deltaX = touch.clientX - panRef.current.startX;
    const deltaY = touch.clientY - panRef.current.startY;

    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
      panRef.current.moved = true;
    }

    if (scale > 1) {
      event.preventDefault();
      setOffset({
        x: panRef.current.originX + deltaX,
        y: panRef.current.originY + deltaY,
      });
      return;
    }

    if (deltaY > 0) {
      event.preventDefault();
      setOffset({
        x: 0,
        y: deltaY,
      });
    }
  };

  const handleTouchEnd = () => {
    if (skipTouchEndResetRef.current) {
      skipTouchEndResetRef.current = false;
      pinchRef.current = null;
      panRef.current = null;
      setDragging(false);
      return;
    }

    const draggedOffsetY = offsetRef.current.y;
    pinchRef.current = null;
    panRef.current = null;
    setDragging(false);

    if (scaleRef.current <= 1.05) {
      if (draggedOffsetY > 120) {
        closeViewer();
        return;
      }
      setScale(1);
      setOffset({ x: 0, y: 0 });
      scaleRef.current = 1;
      offsetRef.current = { x: 0, y: 0 };
    }
  };

  const overlayOpacity =
    scale > 1 ? 0.96 : Math.max(0.45, 0.96 - Math.abs(offset.y) / 320);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: `rgba(0, 0, 0, ${overlayOpacity})` }}
      onClick={closeViewer}
    >
      <button
        type="button"
        onClick={closeViewer}
        className="absolute right-4 top-4 z-10 rounded-full bg-white/10 px-3 py-2 text-sm font-semibold text-white backdrop-blur"
      >
        Close
      </button>
      <div
        className="relative flex h-full w-full items-center justify-center overflow-hidden px-4 py-16"
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={toggleZoom}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: "none" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={imageLabel}
          draggable={false}
          className="max-h-full max-w-full select-none object-contain"
          style={{
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
            transition: dragging ? "none" : "transform 180ms ease",
            transformOrigin: "center center",
          }}
        />
      </div>
      <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white backdrop-blur">
        Double tap or pinch to zoom. Swipe down to close.
      </p>
    </div>,
    document.body
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
