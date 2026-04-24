import { UserStats } from "./types";

interface UserStatsCardsProps {
  stats: UserStats;
}

export function UserStatsCards({ stats }: UserStatsCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 mb-6">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div>
            <div className="text-xl font-bold">{stats.totalUsers}</div>
            <div className="text-xs text-gray-500">Total Users</div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div>
            <div className="text-xl font-bold">{stats.newUsersThisWeek}</div>
            <div className="text-xs text-gray-500">New This Week</div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div>
            <div className="text-xl font-bold">{stats.bannedUsers}</div>
            <div className="text-xs text-gray-500">Banned Users</div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div>
            <div className="text-xl font-bold">{stats.topRating}</div>
            <div className="text-xs text-gray-500">Top Rating</div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div>
            <div className="text-xl font-bold">{stats.totalGames}</div>
            <div className="text-xs text-gray-500">Total Games</div>
          </div>
        </div>
      </div>
    </div>
  );
}

