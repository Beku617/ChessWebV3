import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export function NoGamesPlaceholder() {
  const { t } = useTranslation();
  return (
    <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
        {t("profilePage.noGamesTitle")}
      </h3>
      <p className="text-gray-500 dark:text-gray-400 mb-6">
        {t("profilePage.noGamesDescription")}
      </p>
      <Link
        to="/play/quick"
        className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white px-6 py-3 rounded-xl font-bold transition-colors shadow-lg shadow-brand-500/25"
      >
        {t("profilePage.playNow")}
      </Link>
    </div>
  );
}

