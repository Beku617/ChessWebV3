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
      className="bg-theme-panel rounded-xl border border-theme-glass p-5 hover:border-brand-300 transition-all group hover:shadow-lg shadow-sm cursor-pointer"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="w-12 h-12 rounded-lg bg-theme-surface flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
          {puzzle.icon}
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 rounded-md text-xs font-bold bg-theme-surface text-theme-muted">
            {puzzle.rating}
          </span>
          <span
            className={`px-2.5 py-1 rounded-md text-xs font-medium border ${getDifficultyColor(puzzle.difficulty)}`}
          >
            {t(puzzle.difficulty)}
          </span>
        </div>
      </div>

      <h4 className="text-lg font-bold text-theme-foreground mb-4 group-hover:text-brand-600 transition-colors">
        {puzzle.title}
      </h4>

      <div className="flex flex-wrap gap-2 mb-4">
        {puzzle.themes.map((theme) => (
          <span
            key={theme}
            className="text-xs px-2 py-1 rounded bg-theme-surface text-theme-muted border border-theme-glass "
          >
            {theme}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-theme-muted flex items-center gap-1">
          {puzzle.isWhiteToMove ? (
            <>
              <div className="w-3 h-3 rounded-full bg-theme-panel border border-theme-glass" />
              {t("White to move")}
            </>
          ) : (
            <>
              <div className="w-3 h-3 rounded-full bg-theme-surface border border-theme-border" />
              {t("Black to move")}
            </>
          )}
        </span>
        <button className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-theme-on-accent rounded-lg transition-all text-sm font-medium flex items-center gap-1 group-hover:shadow-lg group-hover:shadow-brand-500/20">
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
      ? `${btnBase} w-9 h-9 bg-brand-500 text-theme-on-accent shadow-md shadow-brand-500/25`
      : `${btnBase} w-9 h-9 bg-theme-panel border border-theme-glass text-theme-muted hover:border-brand-400 hover:text-brand-600`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-theme-foreground ">
          {t("Puzzle Library")}
        </h3>
        <div className="text-sm text-theme-muted">
          {selectedCount === 0
            ? `0/${allCount} ${t("shown")}`
            : `${rangeStart}–${rangeEnd} ${t("of")} ${selectedCount}`}
          {activeLabel ? ` • ${activeLabel}` : ""}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
          </div>
        ) : puzzles.length === 0 ? (
          <div className="col-span-full text-center py-12 text-theme-muted">
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
            className={`${btnBase} w-9 h-9 bg-theme-panel border border-theme-glass text-theme-muted hover:border-brand-400 hover:text-brand-600`}
          >
            <ChevronLeft size={16} />
          </button>

          {/* Page numbers */}
          {pageNums.map((p, i) =>
            p === "..." ? (
              <span
                key={`dots-${i}`}
                className="w-9 h-9 flex items-center justify-center text-theme-muted text-sm select-none"
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
            className={`${btnBase} w-9 h-9 bg-theme-panel border border-theme-glass text-theme-muted hover:border-brand-400 hover:text-brand-600`}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

