import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ProfileStats, formatDuration } from "./types";

interface QuickStatsCardProps {
  stats: ProfileStats;
}

export function QuickStatsCard({ stats }: QuickStatsCardProps) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-theme-panel rounded-2xl p-6 border border-theme-glass shadow-sm"
    >
      <h3 className="text-lg font-bold mb-6">
        {t("profileWidgets.quickStatsTitle", "Quick Stats")}
      </h3>
      <div className="space-y-3">
        <div className="flex justify-between items-center p-3 bg-theme-surface rounded-xl">
          <span className="text-sm text-theme-muted">
            {t("profileWidgets.favoriteOpening", "Favorite Opening")}
          </span>
          <span className="text-sm font-bold text-theme-foreground ">
            {stats.favOpening}
          </span>
        </div>
        <div className="flex justify-between items-center p-3 bg-theme-surface rounded-xl">
          <span className="text-sm text-theme-muted">
            {t("profileWidgets.averageGameDuration", "Avg. Game Duration")}
          </span>
          <span className="text-sm font-bold text-theme-foreground ">
            {formatDuration(stats.avgDuration)}
          </span>
        </div>
        <div className="flex justify-between items-center p-3 bg-theme-surface rounded-xl">
          <span className="text-sm text-theme-muted">
            {t("profileWidgets.bestWinStreak", "Best Win Streak")}
          </span>
          <span className="text-sm font-bold text-theme-foreground ">
            {t("profileGames.gamesCount", {
              count: stats.maxStreak,
              defaultValue: "{{count}} games",
            })}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
