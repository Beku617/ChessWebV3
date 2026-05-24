import { Trans } from "react-i18next";
import { motion } from "framer-motion";
import { Activity } from "lucide-react";
import { ProfileStats } from "./types";

interface PerformanceByColorCardProps {
  stats: ProfileStats;
}

export function PerformanceByColorCard({ stats }: PerformanceByColorCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm"
    >
      <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
        <Activity size={20} className="text-yellow-500" /> <Trans>Performance by Color</Trans> </h3>
      <div className="space-y-6">
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-gray-200 border border-gray-300"></div> <Trans>Playing White</Trans> </span>
            <span className="text-sm font-bold">{stats.whiteWinRate}%</span>
          </div>
          <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${stats.whiteWinRate}%` }}
              transition={{ duration: 1 }}
              className="h-full bg-gradient-to-r from-gray-400 to-gray-500 rounded-full"
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-gray-800 border border-gray-600"></div> <Trans>Playing Black</Trans> </span>
            <span className="text-sm font-bold">{stats.blackWinRate}%</span>
          </div>
          <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${stats.blackWinRate}%` }}
              transition={{ duration: 1 }}
              className="h-full bg-gradient-to-r from-gray-700 to-gray-800 rounded-full"
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
