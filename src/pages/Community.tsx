import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import Sidebar from "../components/Sidebar";
import { PostComposer } from "../components/community/PostComposer";
import { PostCard } from "../components/community/PostCard";
import { FeedPagination } from "../components/community/FeedPagination";
import {
  TrendingWidget,
} from "../components/community/SidebarWidgets";
import {
  API_URL,
  CommunityFeedResponse,
  CommunityMineResponse,
  CommunityPost,
  CommunityPostingAccess,
} from "../components/community/types";
import { useAuthStore } from "../store/authStore";

const POSTS_PER_PAGE = 8;
type CommunityTab = "feed" | "my_posts";

export default function Community() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<CommunityTab>("feed");

  const [feedPosts, setFeedPosts] = useState<CommunityPost[]>([]);
  const [feedTotalPosts, setFeedTotalPosts] = useState(0);
  const [feedTotalPages, setFeedTotalPages] = useState(1);
  const [feedPage, setFeedPage] = useState(1);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState("");

  const [minePosts, setMinePosts] = useState<CommunityPost[]>([]);
  const [mineTotalPosts, setMineTotalPosts] = useState(0);
  const [mineTotalPages, setMineTotalPages] = useState(1);
  const [minePage, setMinePage] = useState(1);
  const [mineLoading, setMineLoading] = useState(true);
  const [mineError, setMineError] = useState("");

  const [summary, setSummary] = useState<CommunityMineResponse["summary"] | null>(
    null,
  );
  const [postingAccess, setPostingAccess] = useState<CommunityPostingAccess | null>(
    null,
  );

  const loadFeedPage = useCallback(async () => {
    setFeedLoading(true);
    setFeedError("");
    try {
      const feedRes = await fetch(
        `${API_URL}/api/community?page=${feedPage}&limit=${POSTS_PER_PAGE}`,
        { credentials: "include" },
      );
      const feedData: CommunityFeedResponse & { error?: string } =
        await feedRes.json();
      if (!feedRes.ok) {
        throw new Error(feedData.error || "Failed to load feed.");
      }

      setFeedPosts(feedData.posts || []);
      setFeedTotalPosts(feedData.total || 0);
      setFeedTotalPages(feedData.pagination?.pages || 1);
    } catch (err) {
      setFeedError(err instanceof Error ? err.message : "Failed to load feed.");
    } finally {
      setFeedLoading(false);
    }
  }, [feedPage]);

  const loadMinePage = useCallback(async () => {
    setMineLoading(true);
    setMineError("");
    try {
      const mineRes = await fetch(
        `${API_URL}/api/community/mine?page=${minePage}&limit=${POSTS_PER_PAGE}`,
        { credentials: "include" },
      );
      const mineData: CommunityMineResponse & { error?: string } =
        await mineRes.json();
      if (!mineRes.ok) {
        throw new Error(mineData.error || "Failed to load your posts.");
      }

      setMinePosts(mineData.posts || []);
      setMineTotalPosts(mineData.total || 0);
      setMineTotalPages(mineData.pagination?.pages || 1);
      setSummary(mineData.summary || null);
      setPostingAccess(mineData.postingAccess || null);
    } catch (err) {
      setMineError(
        err instanceof Error ? err.message : "Failed to load your posts.",
      );
    } finally {
      setMineLoading(false);
    }
  }, [minePage]);

  useEffect(() => {
    void loadFeedPage();
  }, [loadFeedPage]);

  useEffect(() => {
    void loadMinePage();
  }, [loadMinePage]);

  const handleRefreshAfterSubmit = async () => {
    if (minePage !== 1) {
      setMinePage(1);
      return;
    }
    await loadMinePage();
  };

  const handleDeleteOwnPost = async (postId: string) => {
    const res = await fetch(`${API_URL}/api/community/${postId}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Failed to delete post.");
    }

    if (minePosts.length === 1 && minePage > 1) {
      setMinePage((page) => Math.max(1, page - 1));
    } else {
      await loadMinePage();
    }

    if (feedPosts.length === 1 && feedPage > 1) {
      setFeedPage((page) => Math.max(1, page - 1));
    } else {
      await loadFeedPage();
    }
  };

  const feedRange = useMemo(() => {
    const start = feedTotalPosts === 0 ? 0 : (feedPage - 1) * POSTS_PER_PAGE + 1;
    const end = Math.min(feedPage * POSTS_PER_PAGE, feedTotalPosts);
    return { start, end };
  }, [feedPage, feedTotalPosts]);

  const mineRange = useMemo(() => {
    const start = mineTotalPosts === 0 ? 0 : (minePage - 1) * POSTS_PER_PAGE + 1;
    const end = Math.min(minePage * POSTS_PER_PAGE, mineTotalPosts);
    return { start, end };
  }, [minePage, mineTotalPosts]);

  return (
    <div className="min-h-screen bg-[#060f1d] text-white flex transition-colors duration-300">
      <Sidebar />

      <main className="relative flex-1 ml-72 min-h-screen overflow-x-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-24 bg-gradient-to-b from-[#060f1d] via-[#060f1d]/96 to-transparent" />

        <div className="relative z-10 max-w-[1500px] mx-auto flex justify-center gap-5 px-5 py-7">
          <section className="flex-1 min-w-0 max-w-[860px] space-y-5">
            <PostComposer
              summary={summary}
              postingAccess={postingAccess}
              onSubmitted={handleRefreshAfterSubmit}
            />

            <div className="flex items-center justify-between gap-3 rounded-xl bg-[#0c1728]/80 px-3 py-2.5 shadow-[0_14px_38px_rgba(0,0,0,0.2)]">
              <div className="inline-flex rounded-lg bg-white/[0.04] p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("feed")}
                  className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                    activeTab === "feed"
                      ? "bg-teal-500/25 text-teal-100"
                      : "text-gray-300 hover:bg-white/[0.06]"
                  }`}
                >
                  Feed
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("my_posts")}
                  className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                    activeTab === "my_posts"
                      ? "bg-teal-500/25 text-teal-100"
                      : "text-gray-300 hover:bg-white/[0.06]"
                  }`}
                >
                  My Posts
                </button>
              </div>

              <span className="text-xs text-gray-500">
                {activeTab === "feed"
                  ? `${feedTotalPosts} published`
                  : `${mineTotalPosts} submitted`}
              </span>
            </div>

            {activeTab === "feed" ? (
              feedLoading ? (
                <div className="rounded-2xl bg-[#0c1728]/82 py-24 flex items-center justify-center shadow-[0_22px_65px_rgba(0,0,0,0.22)]">
                  <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
                </div>
              ) : feedError ? (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-200">
                  {feedError}
                </div>
              ) : feedPosts.length === 0 ? (
                <div className="rounded-2xl bg-[#0c1728]/82 py-24 flex flex-col items-center justify-center text-center shadow-[0_22px_65px_rgba(0,0,0,0.22)]">
                  <Search className="w-10 h-10 mb-4 text-gray-500" />
                  <p className="text-base font-medium text-white">No approved posts yet</p>
                  <p className="mt-2 max-w-sm text-sm leading-7 text-gray-500">
                    Submit the first chess post. It will show up here after it
                    passes moderation.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {feedPosts.map((post, index) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        index={index}
                        canDelete={Boolean(user?.id && post.author?.id === user.id)}
                        onDelete={handleDeleteOwnPost}
                      />
                    ))}
                  </div>

                  {feedTotalPages > 1 && (
                    <div className="pt-2 pb-4 space-y-2.5">
                      <p className="text-center text-xs text-gray-500">
                        Showing {feedRange.start} - {feedRange.end} of {feedTotalPosts}
                      </p>
                      <FeedPagination
                        currentPage={feedPage}
                        totalPages={feedTotalPages}
                        onPageChange={setFeedPage}
                      />
                    </div>
                  )}
                </>
              )
            ) : mineLoading ? (
              <div className="rounded-2xl bg-[#0c1728]/82 py-24 flex items-center justify-center shadow-[0_22px_65px_rgba(0,0,0,0.22)]">
                <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
              </div>
            ) : mineError ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-200">
                {mineError}
              </div>
            ) : minePosts.length === 0 ? (
              <div className="rounded-2xl bg-[#0c1728]/82 py-24 flex flex-col items-center justify-center text-center shadow-[0_22px_65px_rgba(0,0,0,0.22)]">
                <Search className="w-10 h-10 mb-4 text-gray-500" />
                <p className="text-base font-medium text-white">No posts yet</p>
                <p className="mt-2 max-w-sm text-sm leading-7 text-gray-500">
                  Your submissions will appear here with their moderation status.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {minePosts.map((post, index) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      index={index}
                      canDelete={Boolean(user?.id && post.author?.id === user.id)}
                      onDelete={handleDeleteOwnPost}
                      showModerationStatus
                      preferCreatedTimestamp
                    />
                  ))}
                </div>

                {mineTotalPages > 1 && (
                  <div className="pt-2 pb-4 space-y-2.5">
                    <p className="text-center text-xs text-gray-500">
                      Showing {mineRange.start} - {mineRange.end} of {mineTotalPosts}
                    </p>
                    <FeedPagination
                      currentPage={minePage}
                      totalPages={mineTotalPages}
                      onPageChange={setMinePage}
                    />
                  </div>
                )}
              </>
            )}
          </section>

          <aside className="hidden xl:block w-80 shrink-0">
            <div className="sticky top-6 space-y-4">
              <TrendingWidget />
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
