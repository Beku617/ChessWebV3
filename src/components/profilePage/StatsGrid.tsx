import { ProfileStats } from "./types";
import { useTranslation } from "react-i18next";
import { StatCard } from "../profile";

interface StatsGridProps {
  stats: ProfileStats;
}

export function StatsGrid({ stats }: StatsGridProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <StatCard
        title={t("profile.stats.totalGames")}
        value={stats.total}
      />
      <StatCard
        title={t("profile.stats.winRate")}
        value={`${stats.winRate}%`}
        subtext={`${stats.wins}W - ${stats.losses}L - ${stats.draws}D`}
      />
      <StatCard
        title={t("profile.stats.currentStreak")}
        value={stats.currentStreak}
        subtext={`Best: ${stats.maxStreak}`}
      />
      <StatCard
        title={t("profile.stats.averageMoves")}
        value={stats.avgMoves}
      />
    </div>
  );
}
