import { Stats } from "./types";

interface StatCardProps {
  label: string;
  value: number | null;
  isLoading: boolean;
}

export function StatCard({ label, value, isLoading }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {isLoading ? "..." : value === null ? "--" : value.toLocaleString()}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
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
  return (
    <>
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Users"
          value={stats?.totalUsers ?? null}
          isLoading={isLoading}
        />
        <StatCard
          label="Total Games"
          value={stats?.totalGames ?? null}
          isLoading={isLoading}
        />
        <StatCard
          label="New Users (7d)"
          value={stats?.newUsersThisWeek ?? null}
          isLoading={isLoading}
        />
        <StatCard
          label="Games (7d)"
          value={stats?.gamesThisWeek ?? null}
          isLoading={isLoading}
        />
      </div>
    </>
  );
}

