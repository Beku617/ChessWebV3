import { useTranslation } from "react-i18next";

export function TournamentsSection() {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-gradient-to-br from-amber-50 dark:from-amber-900/15 to-orange-50 dark:to-olive-900/10 rounded-lg p-4 border border-amber-200 dark:border-amber-800/30">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
            {t("Weekend Arena")}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {t("Starting in 2h")}
          </span>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
          {t("5+3 Blitz • Prize Pool $500")}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {t("234/256 players")}
          </span>
          <button className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white text-xs rounded-md transition-colors">
            {t("Join")}
          </button>
        </div>
      </div>
      <div className="bg-gradient-to-br from-slate-50 dark:from-slate-900/25 to-blue-50 dark:to-blue-900/20 rounded-lg p-4 border border-slate-200 dark:border-slate-800/40">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
            {t("Daily Rapid")}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {t("Tomorrow 8PM")}
          </span>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
          {t("10+5 Rapid • Prize Pool $200")}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {t("Open registration")}
          </span>
          <button className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-md transition-colors">
            {t("Register")}
          </button>
        </div>
      </div>
    </div>
  );
}
