"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { getFeedPosts } from "@/lib/firestore";
import type { Post } from "@/types";

const POST_LABELS: Record<Post["type"], string> = {
  announcement: "Announcement",
  general: "Post",
  round_linked: "Round update",
};

export default function FeedPage() {
  const { appUser } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!appUser?.groupId) return;
      try {
        const feedPosts = await getFeedPosts(appUser.groupId);
        setPosts(feedPosts);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [appUser?.groupId]);

  return (
    <div className="px-4 py-6 pb-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-5">Group Feed</h1>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-4 h-28" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <div className="text-5xl mb-4">💬</div>
          <p className="font-medium text-gray-500 mb-1">No feed posts yet</p>
          <p className="text-sm text-center max-w-xs">
            Round updates and announcements will appear here.
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
