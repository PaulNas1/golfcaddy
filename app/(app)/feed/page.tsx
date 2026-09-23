"use client";

/**
 * FeedPage (Social)
 *
 * Responsibilities:
 *   - Subscribes to posts, the pinned announcement, the user's reactions and
 *     Round Result companion posts; loads this season's published results
 *   - Merges posts + auto Round Result cards into one timeline
 *   - Owns all network side-effects; cards only hold local UI state
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useGroupData } from "@/contexts/GroupDataContext";
import Avatar from "@/components/ui/Avatar";
import PostCard from "@/components/feed/PostCard";
import RoundResultCard from "@/components/feed/RoundResultCard";
import PostComposerSheet from "@/components/feed/PostComposerSheet";
import PhotosPage from "@/app/(app)/photos/page";
import {
  createPostComment,
  deleteFeedPost,
  deletePostComment,
  getResultsForSeason,
  makeVirtualRoundResultPost,
  setAnnouncementPinnedState,
  setPostReaction,
  subscribeFeedPosts,
  subscribePinnedAnnouncement,
  subscribePostComments,
  subscribeRoundResultPosts,
  subscribeUserReactionsForGroup,
  updateFeedPost,
} from "@/lib/firestore";
import { deleteStoredImage } from "@/lib/storageUploads";
import type {
  Post,
  PostComment,
  PostReaction,
  PostReactionType,
  Results,
  Round,
} from "@/types";

/** How many recent published rounds get a result card. */
const MAX_RESULT_CARDS = 10;

type FeedItem =
  | { kind: "post"; key: string; date: Date; post: Post }
  | { kind: "result"; key: string; date: Date; post: Post; round: Round; results: Results };

export default function FeedPage() {
  const { appUser, isAdmin } = useAuth();
  const { rounds, currentSeason } = useGroupData();
  const searchParams = useSearchParams();
  const groupId = appUser?.groupId ?? null;

  // ── Feed data ─────────────────────────────────────────────────────────
  const [posts, setPosts] = useState<Post[]>([]);
  const [pinnedAnnouncement, setPinnedAnnouncement] = useState<Post | null>(null);
  const [resultPostsByRoundId, setResultPostsByRoundId] = useState<Record<string, Post>>({});
  const [seasonResults, setSeasonResults] = useState<Results[]>([]);
  const [myReactionsByPostId, setMyReactionsByPostId] = useState<Record<string, PostReaction | null>>({});
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState("");

  const [subTab, setSubTab] = useState<"posts" | "photos">("posts");
  const [composer, setComposer] = useState<{ open: boolean; roundId: string }>({ open: false, roundId: "" });

  // ── Subscriptions ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!groupId) return;
    setFeedError("");
    return subscribeFeedPosts(
      groupId,
      (feedPosts) => { setPosts(feedPosts); setFeedLoading(false); setFeedError(""); },
      {
        limitCount: 30,
        onError: (err) => {
          console.error("Feed subscription error", err);
          setFeedLoading(false);
          setFeedError("Feed failed to load. Please refresh the page.");
        },
      }
    );
  }, [groupId]);

  useEffect(() => {
    if (!groupId) return;
    return subscribePinnedAnnouncement(groupId, setPinnedAnnouncement, (err) =>
      console.warn("Pinned announcement subscription error", err)
    );
  }, [groupId]);

  useEffect(() => {
    if (!groupId) return;
    return subscribeRoundResultPosts(groupId, setResultPostsByRoundId, (err) =>
      console.warn("Round result posts subscription error", err)
    );
  }, [groupId]);

  useEffect(() => {
    if (!appUser?.uid || !groupId) return;
    return subscribeUserReactionsForGroup(groupId, appUser.uid, setMyReactionsByPostId, (err) =>
      console.warn("Reactions subscription error", err)
    );
  }, [groupId, appUser?.uid]);

  // Published results change rarely — load once per season, and again
  // whenever a round flips to published (so a new card appears).
  const publishedRoundKey = useMemo(
    () => rounds.filter((r) => r.resultsPublished).map((r) => r.id).sort().join(","),
    [rounds]
  );
  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    getResultsForSeason(groupId, currentSeason)
      .then((res) => { if (!cancelled) setSeasonResults(res); })
      .catch((err) => console.warn("Results load error", err));
    return () => { cancelled = true; };
  }, [groupId, currentSeason, publishedRoundKey]);

  // ── Deep link from a round → open composer with it linked ─────────────
  const roundsById = useMemo(() => new Map(rounds.map((r) => [r.id, r])), [rounds]);
  useEffect(() => {
    const roundId = searchParams.get("roundId");
    if (roundId && roundsById.has(roundId)) setComposer({ open: true, roundId });
  }, [roundsById, searchParams]);

  // ── One timeline: posts + round result cards, newest first ────────────
  const feedItems = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = posts
      .filter((p) => p.type !== "round_result" && p.id !== pinnedAnnouncement?.id)
      .map((p) => ({ kind: "post", key: p.id, date: p.createdAt, post: p }));

    if (groupId) {
      seasonResults.slice(0, MAX_RESULT_CARDS).forEach((results) => {
        const round = roundsById.get(results.roundId);
        if (!round || !round.resultsPublished || results.rankings.length === 0) return;
        items.push({
          kind: "result",
          key: `result_${round.id}`,
          date: results.publishedAt,
          post: resultPostsByRoundId[round.id] ?? makeVirtualRoundResultPost(groupId, round.id),
          round,
          results,
        });
      });
    }
    return items.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [posts, pinnedAnnouncement?.id, seasonResults, roundsById, resultPostsByRoundId, groupId]);

  // ── Callbacks (stable, so cards don't re-subscribe on every render) ───
  const handleReaction = useCallback(async (post: Post, type: PostReactionType) => {
    if (!appUser) return;
    const previous = myReactionsByPostId[post.id] ?? null;
    const next = previous?.reactionType === type ? null : type;

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
    } catch (err) {
      console.warn("Reaction failed", err);
      setMyReactionsByPostId((prev) => ({ ...prev, [post.id]: previous }));
    }
  }, [appUser, myReactionsByPostId]);

  const handleSaveEdit = useCallback(async (post: Post, content: string) => {
    await updateFeedPost({ postId: post.id, content });
  }, []);

  const handleDeletePost = useCallback(async (post: Post) => {
    await deleteFeedPost(post.id);
    await Promise.all((post.photoPaths ?? []).map((p) => deleteStoredImage(p)));
  }, []);

  const handleCreateComment = useCallback(async (post: Post, content: string) => {
    if (!appUser) throw new Error("Not signed in.");
    await createPostComment({ post, author: appUser, content });
  }, [appUser]);

  const handleDeleteComment = useCallback(async (post: Post, comment: PostComment) => {
    await deletePostComment({ postId: post.id, commentId: comment.id });
  }, []);

  const handleTogglePin = useCallback(async (post: Post) => {
    if (!groupId || !isAdmin || post.type !== "announcement") return;
    await setAnnouncementPinnedState({
      postId: post.id,
      groupId,
      pinned: pinnedAnnouncement?.id !== post.id,
    });
  }, [groupId, isAdmin, pinnedAnnouncement?.id]);

  const subscribeToComments = useCallback(
    (postId: string, onComments: (comments: PostComment[]) => void) =>
      subscribePostComments(postId, onComments, (err) =>
        console.warn("Comments subscription error", err)
      ),
    []
  );

  const closeComposer = useCallback(() => setComposer({ open: false, roundId: "" }), []);

  const engagement = {
    appUser,
    isAdmin,
    onReaction: handleReaction,
    onCreateComment: handleCreateComment,
    onDeleteComment: handleDeleteComment,
    subscribeToComments,
  };
  const postActions = {
    onSaveEdit: handleSaveEdit,
    onDeletePost: handleDeletePost,
    onTogglePin: handleTogglePin,
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="px-4 py-6 pb-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-ink-title">Social</h1>
        <div className="inline-flex rounded-xl border border-surface-overlay bg-surface-muted p-1">
          {(["posts", "photos"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setSubTab(tab)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                subTab === tab ? "bg-brand-600 text-white shadow-sm" : "text-ink-muted"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {subTab === "photos" && <div className="-mx-4"><PhotosPage /></div>}

      {subTab === "posts" && (
        <>
          {/* Composer trigger */}
          <button
            type="button"
            onClick={() => setComposer({ open: true, roundId: "" })}
            className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-surface-overlay bg-surface-card px-3 py-2.5 text-left"
          >
            <Avatar src={appUser?.avatarUrl} name={appUser?.displayName ?? "?"} size="sm" />
            <span className="flex-1 text-[15px] text-ink-hint">Share something with the group…</span>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-surface-muted text-base">📷</span>
          </button>

          {feedError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-5 text-center">
              <p className="text-sm font-medium text-red-700">{feedError}</p>
            </div>
          ) : feedLoading ? (
            <div className="animate-pulse space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-2xl bg-surface-card" />)}
            </div>
          ) : (
            <div className="space-y-3">
              {pinnedAnnouncement && (
                <PostCard
                  key={`pinned_${pinnedAnnouncement.id}`}
                  post={pinnedAnnouncement}
                  pinned
                  myReaction={myReactionsByPostId[pinnedAnnouncement.id] ?? null}
                  postRound={null}
                  {...engagement}
                  {...postActions}
                />
              )}

              {feedItems.length === 0 && !pinnedAnnouncement ? (
                <div className="flex flex-col items-center justify-center py-16 text-ink-hint">
                  <div className="mb-4 text-5xl">⛳</div>
                  <p className="mb-1 font-medium text-ink-muted">Nothing here yet</p>
                  <p className="max-w-xs text-center text-sm">
                    Banter, round photos and results will show up here.
                  </p>
                </div>
              ) : (
                feedItems.map((item) =>
                  item.kind === "result" ? (
                    <RoundResultCard
                      key={item.key}
                      round={item.round}
                      results={item.results}
                      post={item.post}
                      myReaction={myReactionsByPostId[item.post.id] ?? null}
                      {...engagement}
                    />
                  ) : (
                    <PostCard
                      key={item.key}
                      post={item.post}
                      myReaction={myReactionsByPostId[item.post.id] ?? null}
                      postRound={
                        item.post.type === "round_linked" && item.post.roundId
                          ? roundsById.get(item.post.roundId) ?? null
                          : null
                      }
                      {...engagement}
                      {...postActions}
                    />
                  )
                )
              )}
            </div>
          )}
        </>
      )}

      {composer.open && appUser && (
        <PostComposerSheet
          appUser={appUser}
          isAdmin={isAdmin}
          rounds={rounds}
          initialRoundId={composer.roundId}
          onClose={closeComposer}
        />
      )}
    </div>
  );
}
