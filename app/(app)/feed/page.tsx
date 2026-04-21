"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import {
  createFeedPost,
  setPostReaction,
  subscribeFeedPosts,
  subscribePostReaction,
} from "@/lib/firestore";
import type { Post, PostReaction, PostReactionType } from "@/types";

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

export default function FeedPage() {
  const { appUser } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");
  const [reactingPostId, setReactingPostId] = useState("");
  const [myReactionsByPostId, setMyReactionsByPostId] = useState<
    Record<string, PostReaction | null>
  >({});

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
      return;
    }

    const unsubscribes = posts.map((post) =>
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

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [appUser?.uid, posts]);

  const handleCreatePost = async () => {
    if (!appUser?.groupId || !appUser) return;
    setPosting(true);
    setPostError("");
    try {
      await createFeedPost({
        groupId: appUser.groupId,
        author: appUser,
        content: draft,
      });
      setDraft("");
    } catch (error) {
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

    const currentReaction = myReactionsByPostId[post.id]?.reactionType ?? null;
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
            createdAt: new Date(),
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
    } finally {
      setReactingPostId("");
    }
  };

  return (
    <div className="px-4 py-6 pb-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-5">Social Feed</h1>

      <div className="mb-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800">Write a post</h2>
        <p className="mt-1 text-xs text-gray-500">
          Banter, wrap-up notes, photos from the day later, or general club chat.
        </p>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={4}
          placeholder="What’s happening in the group?"
          className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        {postError && (
          <p className="mt-2 text-xs font-medium text-red-600">{postError}</p>
        )}
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={handleCreatePost}
            disabled={posting || draft.trim().length === 0}
            className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-green-300"
          >
            {posting ? "Posting..." : "Post"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-4 h-28" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <div className="text-5xl mb-4">💬</div>
          <p className="font-medium text-gray-500 mb-1">No social posts yet</p>
          <p className="text-sm text-center max-w-xs">
            Banter, round photos, and general club chat will live here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => {
            const card = (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-sm font-bold text-green-700">
                    {post.authorName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-gray-800 truncate">
                        {post.authorName}
                      </p>
                      <span className="text-[11px] rounded-full bg-gray-100 px-2 py-0.5 text-gray-500">
                        {POST_LABELS[post.type]}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatDistanceToNow(post.createdAt, { addSuffix: true })}
                    </p>
                    <p className="text-sm text-gray-700 mt-3 leading-relaxed">
                      {post.content}
                    </p>
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
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              handleReaction(post, reaction.type);
                            }}
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
                    {post.roundId && (
                      <p className="text-sm font-medium text-green-700 mt-3">
                        View round →
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );

            return post.roundId ? (
              <Link key={post.id} href={`/rounds/${post.roundId}`} className="block">
                {card}
              </Link>
            ) : (
              <div key={post.id}>{card}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
