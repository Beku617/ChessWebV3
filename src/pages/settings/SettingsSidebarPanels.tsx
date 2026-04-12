import {
  AlertTriangle,
  Download,
  FileText,
  LogOut,
  Trash2,
  Zap,
} from "lucide-react";
import type { TFunction } from "i18next";
import { SettingsCard } from "../../components/settings";
import type { User } from "../../store/authStore";

interface SettingsSidebarPanelsProps {
  user: User | null;
  t: TFunction;
  onOpenDeleteModal: () => void;
}

export function SettingsSidebarPanels({
  user,
  t,
  onOpenDeleteModal,
}: SettingsSidebarPanelsProps) {
  return (
    <div className="w-full shrink-0 space-y-6 lg:w-80">
      <div className="overflow-hidden rounded-2xl border border-gray-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-gray-800/80 dark:bg-gray-900/60">
        <div className="relative p-6 text-center">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-500/5 to-transparent" />
          <div className="relative">
            <div className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 shadow-lg shadow-brand-900/20 ring-4 ring-white dark:ring-gray-900">
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.fullName || t("common.user", "User")}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-2xl font-bold text-white">
                  {user?.fullName?.substring(0, 2).toUpperCase() || t("common.userInitial", "U")}
                </span>
              )}
            </div>
            <h3 className="mt-4 text-lg font-bold">
              {user?.fullName || t("common.user", "User")}
            </h3>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {user?.email || ""}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                { label: t("settings.stats.bullet", "Bullet"), value: user?.bulletRating ?? 1500, icon: "⚡" },
                { label: t("settings.stats.blitz", "Blitz"), value: user?.blitzRating ?? 1500, icon: "🔥" },
                { label: t("settings.stats.rapid", "Rapid"), value: user?.rapidRating ?? 1500, icon: "🚀" },
                { label: t("settings.stats.classical", "Classical"), value: user?.classicalRating ?? 1500, icon: "🏛️" },
              ].map((rating) => (
                <div
                  key={rating.label}
                  className="rounded-xl bg-gray-50 px-3 py-2 text-center dark:bg-gray-800/60"
                >
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {rating.icon} {rating.label}
                  </span>
                  <div className="mt-0.5 text-sm font-bold">{rating.value}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 border-t border-gray-100 pt-4 text-xs text-gray-500 dark:border-gray-800/60 dark:text-gray-400">
              <div className="flex justify-between">
                <span>{t("settings.stats.gamesPlayed", "Games Played")}</span>
                <span className="font-semibold text-gray-700 dark:text-gray-300">
                  {user?.gamesPlayed ?? 0}
                </span>
              </div>
              <div className="mt-1.5 flex justify-between">
                <span>{t("settings.stats.gamesWon", "Games Won")}</span>
                <span className="font-semibold text-gray-700 dark:text-gray-300">
                  {user?.gamesWon ?? 0}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <SettingsCard
        icon={<Zap className="h-5 w-5 text-amber-500" />}
        title={t("settings.quickActions.title", "Quick Actions")}
      >
        <div className="space-y-2 py-1">
          <button className="flex w-full items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-gray-100 dark:bg-gray-800/60 dark:hover:bg-gray-700/60">
            <FileText className="h-4 w-4 text-gray-500" />
            <span>{t("settings.quickActions.exportPgn", "Export Games (PGN)")}</span>
          </button>
          <button className="flex w-full items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-gray-100 dark:bg-gray-800/60 dark:hover:bg-gray-700/60">
            <Download className="h-4 w-4 text-gray-500" />
            <span>{t("settings.quickActions.downloadData", "Download Account Data")}</span>
          </button>
        </div>
      </SettingsCard>

      <div className="overflow-hidden rounded-2xl border border-red-200/40 bg-white/70 shadow-sm backdrop-blur-xl dark:border-red-900/30 dark:bg-gray-900/60">
        <div className="flex items-center gap-3 border-b border-red-100/60 px-6 pb-4 pt-5 dark:border-red-900/20">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          <div>
            <h3 className="text-base font-bold leading-tight text-red-600 dark:text-red-400">
              {t("settings.danger.title", "Danger Zone")}
            </h3>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {t("settings.danger.subtitle", "Irreversible actions")}
            </p>
          </div>
        </div>
        <div className="space-y-2.5 px-6 py-4">
          <button className="flex w-full items-center gap-3 rounded-xl bg-red-50/60 px-3 py-2.5 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-100 dark:bg-red-900/10 dark:text-red-400 dark:hover:bg-red-900/20">
            <LogOut className="h-4 w-4" />
            <span>{t("settings.danger.signOutAll", "Sign Out All Devices")}</span>
          </button>
          <button
            onClick={onOpenDeleteModal}
            className="flex w-full items-center gap-3 rounded-xl bg-red-50/60 px-3 py-2.5 text-left text-sm font-bold text-red-600 transition-colors hover:bg-red-100 dark:bg-red-900/10 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            <Trash2 className="h-4 w-4" />
            <span>{t("settings.danger.deleteAccount", "Delete Account")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

