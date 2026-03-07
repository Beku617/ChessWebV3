import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, History, Trophy } from "lucide-react";
import { GameHistory } from "../../historyTypes";
import { GameCard } from "../profile";
import { ShareGameModal } from "../ShareGameModal";
import { FilterType } from "./types";

const GAMES_PER_PAGE = 10;

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

interface GamesTabContentProps {
  filteredGames: GameHistory[];
  allGames?: GameHistory[];
  filter: FilterType;
  setFilter: (filter: FilterType) => void;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  analyzeBaseUrl?: string;
  showShareButton?: boolean;
}

export function GamesTabContent({
  filteredGames,
  allGames,
  filter,
  setFilter,
  expandedId,
  setExpandedId,
  analyzeBaseUrl,
  showShareButton = false,
}: GamesTabContentProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [shareGame, setShareGame] = useState<GameHistory | null>(null);

  // Build an id→index map from all games (1-based, matching profile history order)
  const gameIndexMap = useMemo(() => {
    const source = allGames || filteredGames;
    const map = new Map<string, number>();
    source.forEach((g, i) => map.set(g._id, i + 1));
    return map;
  }, [allGames, filteredGames]);

  // Reset to page 1 when filter changes
  const handleSetFilter = (f: FilterType) => {
    setFilter(f);
    setCurrentPage(1);
  };

  const totalPages = Math.max(
    1,
    Math.ceil(filteredGames.length / GAMES_PER_PAGE),
  );
  const safePage = Math.min(currentPage, totalPages);
  const paginatedGames = useMemo(() => {
    const start = (safePage - 1) * GAMES_PER_PAGE;
    return filteredGames.slice(start, start + GAMES_PER_PAGE);
  }, [filteredGames, safePage]);
  const pageNums = getPageNumbers(safePage, totalPages);
  const rangeStart =
    filteredGames.length === 0 ? 0 : (safePage - 1) * GAMES_PER_PAGE + 1;
  const rangeEnd = Math.min(safePage * GAMES_PER_PAGE, filteredGames.length);

  const btnBase =
    "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus:outline-none disabled:pointer-events-none disabled:opacity-40";
  const btnPage = (active: boolean) =>
    active
      ? `${btnBase} w-9 h-9 bg-teal-500 text-white shadow-md shadow-teal-500/25`
      : `${btnBase} w-9 h-9 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:border-teal-400 dark:hover:border-teal-600 hover:text-teal-600 dark:hover:text-teal-400`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <History size={24} className="text-teal-500" />
          All Games ({filteredGames.length})
        </h2>

        <div className="flex bg-white dark:bg-gray-900 p-1 rounded-xl border border-gray-200 dark:border-gray-800">
          {(["all", "wins", "losses", "draws"] as const).map((f) => (
            <button
              key={f}
              onClick={() => handleSetFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === f
                  ? "bg-teal-500 text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Range info */}
      {filteredGames.length > 0 && (
        <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {rangeStart}–{rangeEnd} of {filteredGames.length} games
        </div>
      )}

      <div className="space-y-3">
        {paginatedGames.length > 0 ? (
          paginatedGames.map((game) => (
            <GameCard
              key={game._id}
              game={game}
              isExpanded={expandedId === game._id}
              onToggle={() =>
                setExpandedId(expandedId === game._id ? null : game._id)
              }
              analyzeBaseUrl={analyzeBaseUrl}
              gameIndex={gameIndexMap.get(game._id)}
              onShare={showShareButton ? (g) => setShareGame(g) : undefined}
            />
          ))
        ) : (
          <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
            <Trophy
              size={48}
              className="mx-auto text-gray-300 dark:text-gray-600 mb-4"
            />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
              No games found
            </h3>
            <p className="text-gray-500 dark:text-gray-400">
              Try changing your filters or play a new game.
            </p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5 pt-6">
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
                onClick={() => setCurrentPage(p as number)}
                className={btnPage(p === safePage)}
              >
                {p}
              </button>
            ),
          )}
          <button
            disabled={safePage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className={`${btnBase} w-9 h-9 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:border-teal-400 dark:hover:border-teal-600 hover:text-teal-600 dark:hover:text-teal-400`}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {shareGame && (
        <ShareGameModal
          game={shareGame}
          onClose={() => setShareGame(null)}
        />
      )}
    </motion.div>
  );
}
