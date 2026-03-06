import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Play, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PuzzleItem, getDifficultyColor } from "./types";

const ITEMS_PER_PAGE = 12;

interface PuzzleCardProps {
  puzzle: PuzzleItem;
  index: number;
}

export function PuzzleCard({ puzzle, index }: PuzzleCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={() => navigate(`/puzzles/train/${puzzle._id}`)}
      className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 hover:border-teal-300 dark:hover:border-teal-700 transition-all group hover:shadow-lg shadow-sm cursor-pointer"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
          {puzzle.icon}
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 rounded-md text-xs font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
            {puzzle.rating}
          </span>
          <span
            className={`px-2.5 py-1 rounded-md text-xs font-medium border ${getDifficultyColor(puzzle.difficulty)}`}
          >
            {t(puzzle.difficulty)}
          </span>
        </div>
      </div>

      <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-4 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
        {puzzle.title}
      </h4>

      <div className="flex flex-wrap gap-2 mb-4">
        {puzzle.themes.map((theme) => (
          <span
            key={theme}
            className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700"
          >
            {theme}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 flex items-center gap-1">
          {puzzle.isWhiteToMove ? (
            <>
              <div className="w-3 h-3 rounded-full bg-white border border-gray-300" />
              {t("White to move")}
            </>
          ) : (
            <>
              <div className="w-3 h-3 rounded-full bg-gray-800 border border-gray-600" />
              {t("Black to move")}
            </>
          )}
        </span>
        <button className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg transition-all text-sm font-medium flex items-center gap-1 group-hover:shadow-lg group-hover:shadow-teal-500/20">
          <Play size={14} /> {t("Solve")}
        </button>
      </div>
    </motion.div>
  );
}

interface PuzzlesGridProps {
  puzzles: PuzzleItem[];
  loading: boolean;
  totalCount?: number;
  activeLabel?: string;
}

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

export function PuzzlesGrid({
  puzzles,
  loading,
  totalCount,
  activeLabel,
}: PuzzlesGridProps) {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState(1);

  // Reset to page 1 whenever the filtered list changes
  useEffect(() => {
    setCurrentPage(1);
  }, [puzzles.length, activeLabel]);

  const selectedCount = puzzles.length;
  const allCount = totalCount ?? selectedCount;
  const totalPages = Math.max(1, Math.ceil(selectedCount / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedPuzzles = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return puzzles.slice(start, start + ITEMS_PER_PAGE);
  }, [puzzles, safePage]);

  const pageNums = getPageNumbers(safePage, totalPages);

  const rangeStart = (safePage - 1) * ITEMS_PER_PAGE + 1;
  const rangeEnd = Math.min(safePage * ITEMS_PER_PAGE, selectedCount);

  const btnBase =
    "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus:outline-none disabled:pointer-events-none disabled:opacity-40";
  const btnPage = (active: boolean) =>
    active
      ? `${btnBase} w-9 h-9 bg-teal-500 text-white shadow-md shadow-teal-500/25`
      : `${btnBase} w-9 h-9 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:border-teal-400 dark:hover:border-teal-600 hover:text-teal-600 dark:hover:text-teal-400`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
          {t("Puzzle Library")}
        </h3>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {selectedCount === 0
            ? `0/${allCount} ${t("shown")}`
            : `${rangeStart}–${rangeEnd} ${t("of")} ${selectedCount}`}
          {activeLabel ? ` • ${activeLabel}` : ""}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
          </div>
        ) : puzzles.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-500 dark:text-gray-400">
            {t("No puzzles available")}
          </div>
        ) : (
          paginatedPuzzles.map((puzzle, idx) => (
            <PuzzleCard key={puzzle._id} puzzle={puzzle} index={idx} />
          ))
        )}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5 pt-2">
          {/* Previous */}
          <button
            disabled={safePage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className={`${btnBase} w-9 h-9 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:border-teal-400 dark:hover:border-teal-600 hover:text-teal-600 dark:hover:text-teal-400`}
          >
            <ChevronLeft size={16} />
          </button>

          {/* Page numbers */}
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

          {/* Next */}
          <button
            disabled={safePage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className={`${btnBase} w-9 h-9 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:border-teal-400 dark:hover:border-teal-600 hover:text-teal-600 dark:hover:text-teal-400`}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
