import { ProfileStats } from "./types";
import { StatCard } from "../profile";

interface StatsGridProps {
  stats: ProfileStats;
}

export function StatsGrid({ stats }: StatsGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <StatCard
        title="Total Games"
        value={stats.total}
      />
      <StatCard
        title="Win Rate"
        value={`${stats.winRate}%`}
        subtext={`${stats.wins}W - ${stats.losses}L - ${stats.draws}D`}
      />
      <StatCard
        title="Current Streak"
        value={stats.currentStreak}
        subtext={`Best: ${stats.maxStreak}`}
      />
      <StatCard
        title="Avg. Moves"
        value={stats.avgMoves}
      />
    </div>
  );
}
