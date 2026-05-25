import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export function NoGamesPlaceholder() {
  const { t } = useTranslation();
  return (
    <div className="text-center py-16 bg-theme-panel rounded-2xl border border-theme-glass ">
      <h3 className="text-xl font-bold text-theme-foreground mb-2">
        {t("profilePage.noGamesTitle")}
      </h3>
      <p className="text-theme-muted mb-6">
        {t("profilePage.noGamesDescription")}
      </p>
      <Link
        to="/play/quick"
        className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-theme-on-accent px-6 py-3 rounded-xl font-bold transition-colors shadow-lg shadow-brand-500/25"
      >
        {t("profilePage.playNow")}
      </Link>
    </div>
  );
}

