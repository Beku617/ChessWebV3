import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Clock, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { GameHistory } from "../../historyTypes";
import { openAnalyzeWindow } from "../../utils/analyzeNavigation";

const API_URL = import.meta.env.VITE_API_URL;

interface RecentMatch {
  id: string;
  opponent: string;
  result: "win" | "loss" | "draw";
  timeControl: string;
  date: string;
  ratingChange: number;
  analyzePath: string;
}

function formatTimeAgo(dateString: string, t: (key: string) => string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t("Just now");
  if (diffMins < 60) return `${diffMins} ${t("min ago")}`;
  if (diffHours < 24) {
    return `${diffHours} ${diffHours > 1 ? t("hours ago") : t("hour ago")}`;
  }
  if (diffDays < 7) return `${diffDays} ${diffDays > 1 ? t("days ago") : t("day ago")}`;
  return date.toLocaleDateString();
}

function transformGameHistory(
  game: GameHistory,
  t: (key: string) => string,
): RecentMatch {
  const isWhite = game.playAs === "white";
  const result =
    game.result === "1-0"
      ? isWhite
        ? "win"
        : "loss"
      : game.result === "0-1"
        ? isWhite
          ? "loss"
          : "win"
        : "draw";

  const isUnratedVariant =
    game.variant === "chess960" ||
    game.variant === "threeCheck" ||
    game.variant === "kingOfHill" ||
    game.variant === "atomic" ||
    /960|chess960/i.test(String(game.event || "")) ||
    /three[\s_-]?check|3[\s_-]?check|king[\s_-]?of[\s_-]?hill/i.test(
      String(game.event || ""),
    );
  const ratingChange = isUnratedVariant
    ? 0
    : result === "win"
      ? 12
      : result === "loss"
        ? -8
        : 0;

  return {
    id: game._id,
    opponent: game.opponent || "Stockfish",
    result,
    timeControl: game.timeControl || "10+0",
    date: formatTimeAgo(game.createdAt, t),
    ratingChange,
    analyzePath:
      game.variant === "chess960" ||
      /960|chess960/i.test(String(game.event || ""))
      ? `/analyze960/${game._id}`
      : `/analyze/${game._id}`,
  };
}

export function RecentMatchesCard() {
  const { t } = useTranslation();
  const [matches, setMatches] = useState<RecentMatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRecentGames() {
      try {
        const res = await fetch(`${API_URL}/api/history?limit=5`, {
          credentials: "include",
        });
        if (!res.ok) {
          setMatches([]);
          return;
        }
        const data = await res.json();
        const transformed = (data.games || []).map((game: GameHistory) =>
          transformGameHistory(game, t),
        );
        setMatches(transformed);
      } catch {
        setMatches([]);
      } finally {
        setLoading(false);
      }
    }
    fetchRecentGames();
  }, [t]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-white">
          {t("Recent Matches")}
        </h3>
        <Clock className="w-5 h-5 text-gray-400" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
        </div>
      ) : matches.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <p className="text-sm">{t("No games played yet")}</p>
          <p className="text-xs mt-1">{t("Start a game to see your history here")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {matches.map((match, index) => (
            <motion.div
              key={match.id}
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: index * 0.1 }}
              onClick={() => openAnalyzeWindow(match.analyzePath)}
              className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/30 border border-gray-200 dark:border-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-3">
                <div
                  className={`w-2 h-2 rounded-full ${
                    match.result === "win"
                      ? "bg-green-500"
                      : match.result === "loss"
                        ? "bg-red-500"
                        : "bg-gray-500"
                  }`}
                ></div>
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {match.opponent}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {match.date} • {match.timeControl}
                  </div>
                </div>
              </div>
              <div
                className={`text-sm font-bold ${
                  match.ratingChange > 0
                    ? "text-green-500 dark:text-green-400"
                    : match.ratingChange < 0
                      ? "text-red-500 dark:text-red-400"
                      : "text-gray-500 dark:text-gray-400"
                }`}
              >
                {match.ratingChange > 0 ? "+" : ""}
                {match.ratingChange}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

