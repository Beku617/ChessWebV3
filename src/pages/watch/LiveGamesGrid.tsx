import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Eye, ChevronRight, ChevronLeft, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { WatchLiveGame } from "./types";

const GAMES_PER_PAGE = 12;

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

interface LiveGameCardProps {
  game: WatchLiveGame;
}

export function LiveGameCard({ game }: LiveGameCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const label = game.category || game.type;
  return (
    <motion.button
      type="button"
      onClick={() => navigate(`/watch/${encodeURIComponent(game.id)}`)}
      whileHover={{ y: -4 }}
      className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 hover:border-gray-300 dark:hover:border-gray-700 transition-colors cursor-pointer group shadow-sm hover:shadow-md block text-left w-full"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center space-x-2 text-xs font-medium text-gray-500 dark:text-gray-400">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
          <span>
            {label} - {game.time}
          </span>
        </div>
        <div className="flex items-center space-x-1 text-xs text-gray-500">
          <Eye className="w-3 h-3" />
          <span>{game.viewers}</span>
        </div>
      </div>

      <div className="space-y-3 mb-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs"></div>
            <div className="flex items-center gap-1">
              {game.whiteTitle && (
                <span className="text-amber-500 text-xs font-bold">
                  {game.whiteTitle}
                </span>
              )}
              <span className="font-medium text-gray-900 dark:text-gray-200">
                {game.white}
              </span>
            </div>
          </div>
          <span className="text-xs font-mono text-gray-500">
            {game.whiteRating}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded bg-gray-100 dark:bg-gray-100 flex items-center justify-center text-xs text-black"></div>
            <div className="flex items-center gap-1">
              {game.blackTitle && (
                <span className="text-amber-500 text-xs font-bold">
                  {game.blackTitle}
                </span>
              )}
              <span className="font-medium text-gray-900 dark:text-gray-200">
                {game.black}
              </span>
            </div>
          </div>
          <span className="text-xs font-mono text-gray-500">
            {game.blackRating}
          </span>
        </div>
      </div>

      <div className="pt-4 border-t border-gray-200 dark:border-gray-800 flex justify-end items-center">
        <span className="text-brand-600 dark:text-brand-500 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
          {t("Watch")} <ChevronRight className="w-4 h-4 ml-1" />
        </span>
      </div>
    </motion.button>
  );
}

function GameCardSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 animate-pulse">
      <div className="flex justify-between items-start mb-4">
        <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
        <div className="h-4 w-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>
      <div className="space-y-3 mb-4">
        <div className="flex justify-between items-center">
          <div className="h-6 w-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="h-4 w-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
        <div className="flex justify-between items-center">
          <div className="h-6 w-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="h-4 w-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
      <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
        <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>
    </div>
  );
}

interface LiveGamesGridProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  games: WatchLiveGame[];
  loading?: boolean;
  onRefresh?: () => void;
}

export function LiveGamesGrid({
  activeTab,
  onTabChange,
  games,
  loading,
  onRefresh,
}: LiveGamesGridProps) {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState(1);

  const getCategory = (game: WatchLiveGame) => {
    if (game.category) return game.category;
    if (game.speed) {
      const speed = game.speed.toLowerCase();
      if (speed === "bullet" || speed === "ultrabullet") return "Blitz";
      if (speed === "blitz") return "Blitz";
      if (speed === "rapid") return "Rapid";
      if (speed === "classical" || speed === "correspondence")
        return "Classical";
    }
    const time = game.time || "";
    const match = time.match(/^([0-9.]+)\+(\d+)/);
    if (match) {
      const minutes = parseFloat(match[1]);
      if (minutes <= 8) return "Blitz";
      if (minutes <= 25) return "Rapid";
      return "Classical";
    }
    return game.type || "Blitz";
  };

  const filteredGames = games.filter((game) => {
    const category = getCategory(game);
    if (activeTab === "Top Rated") return true;
    if (activeTab === "Blitz") {
      return category === "Blitz";
    }
    if (activeTab === "Rapid") {
      return category === "Rapid";
    }
    if (activeTab === "Classical") {
      return category === "Classical";
    }
    return true;
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, games.length]);

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
      ? `${btnBase} w-9 h-9 bg-brand-500 text-white shadow-md shadow-brand-500/25`
      : `${btnBase} w-9 h-9 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:border-brand-400 dark:hover:border-brand-600 hover:text-brand-600 dark:hover:text-brand-400`;

  return (
    <section>
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 mb-6">
        <div className="flex space-x-6">
          {["Top Rated", "Blitz", "Rapid", "Classical"].map((tab) => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={`pb-4 text-sm font-medium transition-colors relative ${
                activeTab === tab
                  ? "text-gray-900 dark:text-white"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {t(tab)}
              {activeTab === tab && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500"
                />
              )}
            </button>
          ))}
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 pb-4"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {t("Refresh")}
          </button>
        )}
      </div>

      {!loading && filteredGames.length > 0 && (
        <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {rangeStart}-{rangeEnd} {t("of")} {filteredGames.length} {t("games")}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <GameCardSkeleton key={i} />
          ))}
        </div>
      ) : paginatedGames.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {paginatedGames.map((game, index) => (
            <LiveGameCard key={`${game.id}-${index}`} game={game} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p>{t("No live games in this category right now")}</p>
          <p className="text-sm mt-2">
            {t("Check back soon or try another category")}
          </p>
        </div>
      )}

      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5 pt-4">
          <button
            disabled={safePage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className={`${btnBase} w-9 h-9 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:border-brand-400 dark:hover:border-brand-600 hover:text-brand-600 dark:hover:text-brand-400`}
          >
            <ChevronLeft size={16} />
          </button>
          {pageNums.map((p, i) =>
            p === "..." ? (
              <span
                key={`dots-${i}`}
                className="w-9 h-9 flex items-center justify-center text-gray-400 dark:text-gray-600 text-sm select-none"
              >
                ...
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
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className={`${btnBase} w-9 h-9 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:border-brand-400 dark:hover:border-brand-600 hover:text-brand-600 dark:hover:text-brand-400`}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </section>
  );
}
