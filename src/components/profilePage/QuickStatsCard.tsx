import { motion } from "framer-motion";
import { ProfileStats, formatDuration } from "./types";

interface QuickStatsCardProps {
  stats: ProfileStats;
}

export function QuickStatsCard({ stats }: QuickStatsCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm"
    >
      <h3 className="text-lg font-bold mb-6">
        Quick Stats
      </h3>
      <div className="space-y-3">
        <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Favorite Opening
          </span>
          <span className="text-sm font-bold text-gray-900 dark:text-white">
            {stats.favOpening}
          </span>
        </div>
        <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Avg. Game Duration
          </span>
          <span className="text-sm font-bold text-gray-900 dark:text-white">
            {formatDuration(stats.avgDuration)}
          </span>
        </div>
        <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Best Win Streak
          </span>
          <span className="text-sm font-bold text-gray-900 dark:text-white">
            {stats.maxStreak} games
          </span>
        </div>
      </div>
    </motion.div>
  );
}
