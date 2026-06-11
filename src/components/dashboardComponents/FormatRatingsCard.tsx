import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { timeFormats } from "../../data/mockData";
import type { GameHistory } from "../../historyTypes";

const API_URL = import.meta.env.VITE_API_URL;

interface GameStats {
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  streak: string;
}

function calculateStats(games: GameHistory[]): GameStats {
  const totalGames = games.length;
  let wins = 0;
  let losses = 0;
  let draws = 0;

  games.forEach((game) => {
    const isWhite = game.playAs === "white";
    if (game.result === "1-0") {
      if (isWhite) wins++;
      else losses++;
    } else if (game.result === "0-1") {
      if (isWhite) losses++;
      else wins++;
    } else {
      draws++;
    }
  });

  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;

  // Calculate current streak from most recent games
  let streak = "";
  if (games.length > 0) {
    const sortedGames = [...games].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    let streakCount = 0;
    let streakType: "W" | "L" | "D" | null = null;

    for (const game of sortedGames) {
      const isWhite = game.playAs === "white";
      let result: "W" | "L" | "D";

      if (game.result === "1-0") {
        result = isWhite ? "W" : "L";
      } else if (game.result === "0-1") {
        result = isWhite ? "L" : "W";
      } else {
        result = "D";
      }

      if (streakType === null) {
        streakType = result;
        streakCount = 1;
      } else if (result === streakType) {
        streakCount++;
      } else {
        break;
      }
    }

    streak = streakType ? `${streakType}${streakCount}` : "-";
  }

  return { totalGames, wins, losses, draws, winRate, streak };
}

export function FormatRatingsCard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<GameStats>({
    totalGames: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    winRate: 0,
    streak: "-",
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchGameStats() {
      try {
        const res = await fetch(`${API_URL}/api/history?limit=100`, {
          credentials: "include",
        });
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const data = await res.json();
        const calculatedStats = calculateStats(data.games || []);
        setStats(calculatedStats);
      } catch {
        // Keep default stats on error
      } finally {
        setLoading(false);
      }
    }
    fetchGameStats();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-gradient-to-br from-brand-50 to-cyan-50 rounded-xl border border-brand-200 p-6 shadow-sm"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl md:text-2xl font-semibold text-theme-foreground ">
          {t("Format Ratings")}
        </h3>
      </div>
      <div className="space-y-3">
        {timeFormats.map((format) => (
          <div
            key={format.id}
            className="flex items-center justify-between p-3 rounded-lg bg-theme-panel border border-theme-glass "
          >
            <div className="flex items-center space-x-3">
              <div>
                <div className="font-medium text-theme-foreground ">
                  {t(format.name)}
                </div>
                <div className="text-xs text-theme-muted">
                  {format.displayTime}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-theme-foreground ">
                {format.rating}
              </div>
              <div className="text-xs text-theme-muted">
                {format.rating > 1850
                  ? t("Hot")
                  : format.rating > 1750
                    ? t("Rising")
                    : t("Stable")}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-theme-glass ">
        {loading ? (
          <div className="flex items-center justify-center py-2">
            <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-theme-panel rounded-lg p-2">
              <div className="text-xs text-theme-muted">
                {t("Win Rate")}
              </div>
              <div className="text-sm font-medium text-theme-foreground ">
                {stats.winRate}%
              </div>
            </div>
            <div className="bg-theme-panel rounded-lg p-2">
              <div className="text-xs text-theme-muted">
                {t("Games")}
              </div>
              <div className="text-sm font-medium text-theme-foreground ">
                {stats.totalGames}
              </div>
            </div>
            <div className="bg-theme-panel rounded-lg p-2">
              <div className="text-xs text-theme-muted">
                {t("Streak")}
              </div>
              <div className="text-sm font-medium text-theme-foreground ">
                {stats.streak}
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

