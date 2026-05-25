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
      className="bg-theme-panel rounded-2xl p-6 border border-theme-glass shadow-sm"
    >
      <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
        <Activity size={20} className="text-yellow-500" /> <Trans>Performance by Color</Trans> </h3>
      <div className="space-y-6">
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium text-theme-muted flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-theme-surface border border-theme-glass"></div> <Trans>Playing White</Trans> </span>
            <span className="text-sm font-bold">{stats.whiteWinRate}%</span>
          </div>
          <div className="h-3 bg-theme-surface rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${stats.whiteWinRate}%` }}
              transition={{ duration: 1 }}
              className="h-full bg-gradient-to-r from-theme-surface to-theme-panel rounded-full"
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium text-theme-muted flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-theme-surface border border-theme-border"></div> <Trans>Playing Black</Trans> </span>
            <span className="text-sm font-bold">{stats.blackWinRate}%</span>
          </div>
          <div className="h-3 bg-theme-surface rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${stats.blackWinRate}%` }}
              transition={{ duration: 1 }}
              className="h-full bg-gradient-to-r from-theme-panel to-theme-base rounded-full"
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
