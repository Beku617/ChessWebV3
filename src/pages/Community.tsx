/* ═══════════════════════════════════════════════════════
   Community — Premium Redesign
   ═══════════════════════════════════════════════════════ */
import { useEffect, useState, useMemo } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

const POSTS_PER_PAGE = 8;

function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) pages.push("...");
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < total - 1) pages.push("...");
  pages.push(total);
  return pages;
}
import Sidebar from "../components/Sidebar";
import { PostComposer } from "../components/community/PostComposer";
import { PostCard } from "../components/community/PostCard";
import {
  TrendingWidget,
  LiveGamesWidget,
  TopPlayersWidget,
  PuzzleLeaderboardWidget,
  WhoToFollowWidget,
  EventsWidget,
  DailyPuzzleWidget,
} from "../components/community/SidebarWidgets";
import {
  COMMUNITY_POSTS,
} from "../data/communityData";

export default function Community() {
  const { t } = useTranslation();
  const [searchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  /* ── Filter posts ── */
  const filteredPosts = useMemo(() => {
    let posts = COMMUNITY_POSTS;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      posts = posts.filter(
        (p) =>
          p.content.toLowerCase().includes(q) ||
          p.user.name.toLowerCase().includes(q) ||
          p.tags?.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return posts;
  }, [searchQuery]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredPosts.length / POSTS_PER_PAGE),
  );
  const safePage = Math.min(currentPage, totalPages);

  const paginatedPosts = useMemo(() => {
    const start = (safePage - 1) * POSTS_PER_PAGE;
    return filteredPosts.slice(start, start + POSTS_PER_PAGE);
  }, [filteredPosts, safePage]);

  const pageNums = getPageNumbers(safePage, totalPages);
  const rangeStart =
    filteredPosts.length === 0 ? 0 : (safePage - 1) * POSTS_PER_PAGE + 1;
  const rangeEnd = Math.min(safePage * POSTS_PER_PAGE, filteredPosts.length);

  const btnBase =
    "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus:outline-none disabled:pointer-events-none disabled:opacity-40";
  const btnPage = (active: boolean) =>
    active
      ? `${btnBase} w-9 h-9 bg-teal-500 text-white shadow-md shadow-teal-500/25`
      : `${btnBase} w-9 h-9 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:border-teal-400 dark:hover:border-teal-600 hover:text-teal-600 dark:hover:text-teal-400`;

  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 text-gray-900 dark:text-white flex transition-colors duration-300">
      <Sidebar />

      <main className="flex-1 ml-72 min-h-screen">
        {/* ── Content Grid ── */}
        <div className="max-w-[1440px] mx-auto flex justify-center gap-6 px-6 py-6">
          {/* Feed Column */}
          <div className="flex-1 min-w-0 max-w-2xl space-y-5">
            <PostComposer />

            {filteredPosts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-600">
                <Search className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm font-medium">{t("No posts found")}</p>
                <p className="text-xs mt-1">
                  {t("Try a different tab or search term")}
                </p>
              </div>
            ) : (
              <>
                {/* Range info */}
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {rangeStart}–{rangeEnd} {t("of")} {filteredPosts.length} {t("posts")}
                </div>

                <div className="space-y-4">
                  {paginatedPosts.map((post, i) => (
                    <PostCard key={post.id} post={post} index={i} />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-1.5 pt-2 pb-4">
                    <button
                      disabled={safePage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className={`${btnBase} w-9 h-9 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:border-teal-400 dark:hover:border-teal-600 hover:text-teal-600 dark:hover:text-teal-400`}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    {pageNums.map((p, i) =>
                      p === "..." ? (
                        <span
                          key={`dots-${i}`}
                          className="w-9 h-9 flex items-center justify-center text-gray-400 dark:text-gray-600 text-sm select-none"
                        >
                          …
                        </span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setCurrentPage(p)}
                          className={btnPage(p === safePage)}
                        >
                          {p}
                        </button>
                      ),
                    )}
                    <button
                      disabled={safePage >= totalPages}
                      onClick={() =>
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }
                      className={`${btnBase} w-9 h-9 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:border-teal-400 dark:hover:border-teal-600 hover:text-teal-600 dark:hover:text-teal-400`}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right Sidebar */}
          <aside className="hidden xl:block w-80 shrink-0 space-y-4 pb-10">
            <DailyPuzzleWidget />
            <TrendingWidget />
            <LiveGamesWidget />
            <TopPlayersWidget />
            <PuzzleLeaderboardWidget />
            <WhoToFollowWidget />
            <EventsWidget />

            {/* Footer */}
            <div className="px-3 pt-2">
              <p className="text-[10px] text-gray-400 dark:text-gray-600 leading-relaxed">
                {t("About")} · {t("Help")} · {t("Terms")} · {t("Privacy")} · {t("Ads")} · API ·{" "}
                <span className="font-semibold text-gray-500 dark:text-gray-500">
                  NeonGambit
                </span>{" "}
                © {new Date().getFullYear()}
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
