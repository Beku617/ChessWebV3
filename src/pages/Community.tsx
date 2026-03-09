import { useCallback, useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import Sidebar from "../components/Sidebar";
import { PostComposer } from "../components/community/PostComposer";
import { PostCard } from "../components/community/PostCard";
import { FeedPagination } from "../components/community/FeedPagination";
import {
  CommunityGuidelinesWidget,
  TrendingWidget,
} from "../components/community/SidebarWidgets";
import {
  API_URL,
  CommunityFeedResponse,
  CommunityMineResponse,
  CommunityPost,
} from "../components/community/types";
import { useAuthStore } from "../store/authStore";

const POSTS_PER_PAGE = 8;

export default function Community() {
  const { user } = useAuthStore();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [totalPosts, setTotalPosts] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<CommunityMineResponse["summary"] | null>(
    null,
  );

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [feedRes, mineRes] = await Promise.all([
        fetch(
          `${API_URL}/api/community?page=${currentPage}&limit=${POSTS_PER_PAGE}`,
          { credentials: "include" },
        ),
        fetch(`${API_URL}/api/community/mine?limit=5`, {
          credentials: "include",
        }),
      ]);

      const feedData: CommunityFeedResponse = await feedRes.json();
      if (!feedRes.ok) {
        throw new Error((feedData as { error?: string }).error || "Failed to load feed.");
      }

      let mineData: CommunityMineResponse | null = null;
      if (mineRes.ok) {
        mineData = await mineRes.json();
      }

      setPosts(feedData.posts || []);
      setTotalPosts(feedData.total || 0);
      setTotalPages(feedData.pagination?.pages || 1);
      setSummary(mineData?.summary || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load community.");
    } finally {
      setLoading(false);
    }
  }, [currentPage]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const handleRefreshAfterSubmit = async () => {
    try {
      const mineRes = await fetch(`${API_URL}/api/community/mine?limit=5`, {
        credentials: "include",
      });
      if (mineRes.ok) {
        const mineData: CommunityMineResponse = await mineRes.json();
        setSummary(mineData.summary || null);
      }
    } catch {
      // ignore summary refresh errors
    }
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

    await handleRefreshAfterSubmit();
    if (posts.length === 1 && currentPage > 1) {
      setCurrentPage((page) => Math.max(1, page - 1));
      return;
    }
    await loadPage();
  };

  const rangeStart = totalPosts === 0 ? 0 : (currentPage - 1) * POSTS_PER_PAGE + 1;
  const rangeEnd = Math.min(currentPage * POSTS_PER_PAGE, totalPosts);

  return (
    <div className="min-h-screen bg-[#060f1d] text-white flex transition-colors duration-300">
      <Sidebar />

      <main className="flex-1 ml-72 min-h-screen">
        <div className="max-w-[1440px] mx-auto flex justify-center gap-6 px-6 py-7">
          <section className="flex-1 min-w-0 max-w-[760px] space-y-5">
            <PostComposer summary={summary} onSubmitted={handleRefreshAfterSubmit} />

            {loading ? (
              <div className="rounded-2xl bg-[#0c1728]/82 py-24 flex items-center justify-center shadow-[0_22px_65px_rgba(0,0,0,0.22)]">
                <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-200">
                {error}
              </div>
            ) : posts.length === 0 ? (
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
                  {posts.map((post, index) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      index={index}
                      canDelete={Boolean(user?.id && post.author?.id === user.id)}
                      onDelete={handleDeleteOwnPost}
                    />
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="pt-2 pb-4 space-y-2.5">
                    <p className="text-center text-xs text-gray-500">
                      Showing {rangeStart} - {rangeEnd} of {totalPosts}
                    </p>
                    <FeedPagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={setCurrentPage}
                    />
                  </div>
                )}
              </>
            )}
          </section>

          <aside className="hidden xl:block w-80 shrink-0">
            <div className="sticky top-6 space-y-4">
              <TrendingWidget />
              <CommunityGuidelinesWidget />
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
