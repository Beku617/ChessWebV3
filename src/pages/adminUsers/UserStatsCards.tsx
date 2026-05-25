import { useTranslation } from "react-i18next";
import { UserStats } from "./types";

interface UserStatsCardsProps {
  stats: UserStats;
}

export function UserStatsCards({ stats }: UserStatsCardsProps) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 mb-6">
      <div className="bg-theme-panel border border-theme-glass rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div>
            <div className="text-xl font-bold">{stats.totalUsers}</div>
            <div className="text-xs text-theme-muted">{t("admin.users.stats.totalUsers")}</div>
          </div>
        </div>
      </div>

      <div className="bg-theme-panel border border-theme-glass rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div>
            <div className="text-xl font-bold">{stats.newUsersThisWeek}</div>
            <div className="text-xs text-theme-muted">{t("admin.users.stats.newThisWeek")}</div>
          </div>
        </div>
      </div>

      <div className="bg-theme-panel border border-theme-glass rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div>
            <div className="text-xl font-bold">{stats.bannedUsers}</div>
            <div className="text-xs text-theme-muted">{t("admin.users.stats.bannedUsers")}</div>
          </div>
        </div>
      </div>

      <div className="bg-theme-panel border border-theme-glass rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div>
            <div className="text-xl font-bold">{stats.topRating}</div>
            <div className="text-xs text-theme-muted">{t("admin.users.stats.topRating")}</div>
          </div>
        </div>
      </div>

      <div className="bg-theme-panel border border-theme-glass rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div>
            <div className="text-xl font-bold">{stats.totalGames}</div>
            <div className="text-xs text-theme-muted">{t("admin.users.stats.totalGames")}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

