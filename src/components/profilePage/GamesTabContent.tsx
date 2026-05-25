import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GameHistory } from "../../historyTypes";
import { GameCard } from "../profile";
import { ShareGameModal } from "../ShareGameModal";
import { FilterType } from "./types";

const GAMES_PER_PAGE = 10;
const PROFILE_GAME_FILTERS = ["all", "wins", "losses", "draws"] as const;

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
  const { t } = useTranslation();
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
      ? `${btnBase} w-9 h-9 bg-brand-500 text-theme-on-accent shadow-md shadow-brand-500/25`
      : `${btnBase} w-9 h-9 bg-theme-panel border border-theme-glass text-theme-muted hover:border-brand-400 hover:text-brand-600`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <History size={24} className="text-brand-500" />
          {t("profileGames.allGames", { count: filteredGames.length })}
        </h2>

        <div className="flex bg-theme-panel p-1 rounded-xl border border-theme-glass ">
          {PROFILE_GAME_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => handleSetFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === f
                  ? "bg-brand-500 text-theme-on-accent shadow-sm"
                  : "text-theme-muted hover:text-theme-foreground"
              }`}
            >
              {t(`profileGames.filters.${f}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Range info */}
      {filteredGames.length > 0 && (
        <div className="text-sm text-theme-muted mb-4">
          {t("profileGames.range", {
            start: rangeStart,
            end: rangeEnd,
            total: filteredGames.length,
          })}
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
          <div className="text-center py-12 bg-theme-panel rounded-xl border border-theme-glass ">
            <h3 className="text-lg font-medium text-theme-foreground mb-1">
              {t("profileGames.noGamesFound")}
            </h3>
            <p className="text-theme-muted">
              {t("profileGames.noGamesFoundDescription")}
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
            className={`${btnBase} w-9 h-9 bg-theme-panel border border-theme-glass text-theme-muted hover:border-brand-400 hover:text-brand-600`}
          >
            <ChevronLeft size={16} />
          </button>
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
            className={`${btnBase} w-9 h-9 bg-theme-panel border border-theme-glass text-theme-muted hover:border-brand-400 hover:text-brand-600`}
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

