import { Users, Gamepad2, TrendingUp } from "lucide-react";
import { Stats } from "./types";

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: "teal" | "blue" | "green" | "purple";
}

export function StatCard({ icon, label, value, color }: StatCardProps) {
  const colors = {
    teal: "from-brand-500 to-brand-600",
    blue: "from-blue-500 to-cyan-600",
    green: "from-green-500 to-brand-600",
    purple: "from-purple-500 to-pink-600",
  };

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div
          className={`w-12 h-12 rounded-lg bg-gradient-to-br ${colors[color]} flex items-center justify-center`}
        >
          {icon}
        </div>
        <div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {value.toLocaleString()}
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
}

export function DashboardStats({ stats }: DashboardStatsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <StatCard
        icon={<Users className="w-6 h-6" />}
        label="Total Users"
        value={stats?.totalUsers ?? 0}
        color="teal"
      />
      <StatCard
        icon={<Gamepad2 className="w-6 h-6" />}
        label="Total Games"
        value={stats?.totalGames ?? 0}
        color="blue"
      />
      <StatCard
        icon={<TrendingUp className="w-6 h-6" />}
        label="New Users (7d)"
        value={stats?.newUsersThisWeek ?? 0}
        color="green"
      />
      <StatCard
        icon={<Gamepad2 className="w-6 h-6" />}
        label="Games (7d)"
        value={stats?.gamesThisWeek ?? 0}
        color="purple"
      />
    </div>
  );
}

