import { useTranslation } from "react-i18next";
import { Stats } from "./types";

interface StatCardProps {
  label: string;
  value: number | null;
  isLoading: boolean;
}

export function StatCard({ label, value, isLoading }: StatCardProps) {
  return (
    <div className="bg-theme-panel border border-theme-glass rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div>
          <div className="text-2xl font-bold text-theme-foreground ">
            {isLoading ? "..." : value === null ? "--" : value.toLocaleString()}
          </div>
          <div className="text-sm text-theme-muted">
            {label}
          </div>
        </div>
      </div>
    </div>
  );
}

interface DashboardStatsProps {
  stats: Stats | null;
  isLoading: boolean;
  error?: string | null;
}

export function DashboardStats({ stats, isLoading, error }: DashboardStatsProps) {
  const { t } = useTranslation();
  return (
    <>
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label={t("admin.dashboard.stats.totalUsers")}
          value={stats?.totalUsers ?? null}
          isLoading={isLoading}
        />
        <StatCard
          label={t("admin.dashboard.stats.totalGames")}
          value={stats?.totalGames ?? null}
          isLoading={isLoading}
        />
        <StatCard
          label={t("admin.dashboard.stats.newUsers7d")}
          value={stats?.newUsersThisWeek ?? null}
          isLoading={isLoading}
        />
        <StatCard
          label={t("admin.dashboard.stats.games7d")}
          value={stats?.gamesThisWeek ?? null}
          isLoading={isLoading}
        />
      </div>
    </>
  );
}

