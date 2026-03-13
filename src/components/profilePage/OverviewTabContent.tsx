import { motion } from "framer-motion";
import { GameHistory } from "../../historyTypes";
import { ProfileStats, TabType } from "./types";
import { RecentGames } from "./RecentGames";
import { FormatStatsCard } from "./FormatStatsCard";
import { RatingTimelineCard } from "./RatingTimelineCard";
import { PoolLeaderboardCard } from "./PoolLeaderboardCard";
import type { RatingSnapshot } from "./FormatStatsCard";

interface OverviewTabContentProps {
  stats: ProfileStats;
  games: GameHistory[];
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  setActiveTab: (tab: TabType) => void;
  analyzeBaseUrl?: string;
  enableSelfRatingAnalytics?: boolean;
  ratingSnapshot?: RatingSnapshot | null;
  timelineUnavailableMessage?: string;
}

export function OverviewTabContent({
  stats,
  games,
  expandedId,
  setExpandedId,
  setActiveTab,
  analyzeBaseUrl,
  enableSelfRatingAnalytics = true,
  ratingSnapshot,
  timelineUnavailableMessage,
}: OverviewTabContentProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="min-w-0 lg:col-span-2">
          <FormatStatsCard
            ratingSnapshot={ratingSnapshot}
            enableTimeline={enableSelfRatingAnalytics}
          />
        </div>
        <div className="min-w-0">
          <RatingTimelineCard
            enabled={enableSelfRatingAnalytics}
            unavailableMessage={timelineUnavailableMessage}
          />
        </div>
        <div className="min-w-0">
          <PoolLeaderboardCard />
        </div>
      </div>

      <RecentGames
        games={games}
        expandedId={expandedId}
        setExpandedId={setExpandedId}
        setActiveTab={setActiveTab}
        analyzeBaseUrl={analyzeBaseUrl}
      />
    </motion.div>
  );
}
