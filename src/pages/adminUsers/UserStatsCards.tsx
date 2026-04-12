import { Users, UserPlus, ShieldAlert, Trophy, Gamepad2 } from "lucide-react";
import { User } from "./types";

interface UserStatsCardsProps {
  users: User[];
  totalUsers: number;
}

export function UserStatsCards({ users, totalUsers }: UserStatsCardsProps) {
  const newThisWeek = users.filter((u) => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return new Date(u.createdAt) > weekAgo;
  }).length;

  const bannedCount = users.filter((u) => u.banned).length;
  const topRating =
    users.length > 0 ? Math.max(...users.map((u) => u.rating)) : 0;
  const totalGames = users.reduce((sum, u) => sum + u.gamesPlayed, 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 mb-6">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand-500/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-brand-500" />
          </div>
          <div>
            <div className="text-xl font-bold">{totalUsers}</div>
            <div className="text-xs text-gray-500">Total Users</div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
            <UserPlus className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <div className="text-xl font-bold">{newThisWeek}</div>
            <div className="text-xs text-gray-500">New This Week</div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <div className="text-xl font-bold">{bannedCount}</div>
            <div className="text-xs text-gray-500">Banned Users</div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <Trophy className="w-5 h-5 text-purple-500" />
          </div>
          <div>
            <div className="text-xl font-bold">{topRating}</div>
            <div className="text-xs text-gray-500">Top Rating</div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Gamepad2 className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <div className="text-xl font-bold">{totalGames}</div>
            <div className="text-xs text-gray-500">Total Games</div>
          </div>
        </div>
      </div>
    </div>
  );
}

