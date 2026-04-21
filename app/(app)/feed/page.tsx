"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import {
  createFeedPost,
  createPostComment,
  deletePostComment,
  deleteFeedPost,
  setPostReaction,
  subscribeFeedPosts,
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
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
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
  const [openMenuPostId, setOpenMenuPostId] = useState("");

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
    if (!appUser?.uid) return;
    if (posts.length === 0) {
      setMyReactionsByPostId({});
      setCommentsByPostId({});
      return;
    }

    const reactionUnsubscribes = posts.map((post) =>
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

    const commentUnsubscribes = posts.map((post) =>
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
  }, [appUser?.uid, posts]);

  useEffect(() => {
    return () => {
      postImagePreviews.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
    };
  }, [postImagePreviews]);

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
        photoUrls: uploads.map((upload) => upload.url),
        photoPaths: uploads.map((upload) => upload.path),
      });
      setDraft("");
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

  const handleDeleteComment = async (post: Post, comment: PostComment) => {
    const confirmed = window.confirm("Delete this reply?");
    if (!confirmed) return;

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

  return (
    <div className="px-4 py-6 pb-8">
      <h1 className="mb-5 text-2xl font-bold text-gray-800">Social Feed</h1>

      <div className="mb-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800">Write a post</h2>
        <p className="mt-1 text-xs text-gray-500">
          Banter, wrap-up notes, photos from the day, or general club chat.
        </p>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={4}
          placeholder="What’s happening in the group?"
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
            Attach up to {MAX_POST_IMAGES} images. JPG, PNG, or WebP up to 5 MB each.
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
            {posting ? "Posting..." : "Post"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-white p-4" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <div className="mb-4 text-5xl">💬</div>
          <p className="mb-1 font-medium text-gray-500">No social posts yet</p>
          <p className="max-w-xs text-center text-sm">
            Banter, round photos, and general club chat will live here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => {
            const comments = commentsByPostId[post.id] ?? [];
            const isAuthor = post.authorId === appUser?.uid;
            const canDeletePost = isAuthor || isAdmin;
            const isEditing = editingPostId === post.id;
            const isMenuOpen = openMenuPostId === post.id;
            return (
              <div
                key={post.id}
                className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
              >
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
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate font-semibold text-gray-800">
                          {post.authorName}
                        </p>
                        <span className="rounded-full bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                          💬 {post.commentCount}
                        </span>
                      </div>
                      <div className="relative flex items-center gap-2">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">
                          {POST_LABELS[post.type]}
                        </span>
                        {canDeletePost && (
                          <div className="relative">
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
                    </div>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {formatDistanceToNow(post.createdAt, { addSuffix: true })}
                    </p>
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
                          <div
                            key={photoUrl}
                            className="overflow-hidden rounded-xl border border-gray-100 bg-gray-50"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={photoUrl}
                              alt=""
                              className="max-h-72 w-full object-cover"
                            />
                          </div>
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
                          comments.map((comment) => (
                            <div
                              key={comment.id}
                              className="rounded-xl border border-gray-100 bg-white px-3 py-2"
                            >
                              <div className="flex items-center justify-between gap-2">
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
                                {(comment.authorId === appUser?.uid || isAdmin) && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteComment(post, comment)}
                                    disabled={deleteCommentBusyId === comment.id}
                                    className="shrink-0 text-[11px] font-medium text-red-600 disabled:text-red-300"
                                  >
                                    {deleteCommentBusyId === comment.id
                                      ? "Deleting..."
                                      : "Delete"}
                                  </button>
                                )}
                              </div>
                              <p className="mt-1 text-sm text-gray-700">
                                {comment.content}
                              </p>
                            </div>
                          ))
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
    </div>
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
