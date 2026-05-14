import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supportedLanguages } from "../i18n";
import { useState, useRef, useEffect } from "react";
import { useLanguageAvailabilityStore } from "../store/languageAvailabilityStore";

type LanguageSwitcherProps = {
  compact?: boolean;
  className?: string;
};

export function LanguageSwitcher({
  compact = false,
  className = "",
}: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation();
  const learnMnUnavailable = useLanguageAvailabilityStore(
    (state) => state.learnMnUnavailable,
  );
  const eventsMnUnavailable = useLanguageAvailabilityStore(
    (state) => state.eventsMnUnavailable,
  );
  const clearMnUnavailable = useLanguageAvailabilityStore(
    (state) => state.clearMnUnavailable,
  );
  const current =
    i18n.resolvedLanguage || i18n.language || supportedLanguages[0].code;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const currentLang = supportedLanguages.find((l) => l.code === current);
  const showMnUnavailableBadge =
    current === "mn" && (learnMnUnavailable || eventsMnUnavailable);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`group relative inline-flex items-center gap-2.5 rounded-xl border border-gray-200/80 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/95 px-3.5 py-2 shadow-sm transition-all duration-200 hover:border-brand-300/70 dark:hover:border-brand-700/70 focus:outline-none focus:border-brand-400 dark:focus:border-brand-600 focus:ring-2 focus:ring-brand-500/15`}
        aria-label={t("language.label", "Language")}
        aria-expanded={open}
      >
        <span className="min-w-0 pr-2 text-left">
          {!compact && (
            <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
              {t("language.label", "Language")}
            </span>
          )}
          <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-gray-100">
            <span>{currentLang?.name ?? current}</span>
            {showMnUnavailableBadge && (
              <span
                className="rounded-full border border-amber-300/35 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium leading-none tracking-wide text-amber-700 dark:border-amber-700/45 dark:text-amber-300"
                title={t(
                  "settingsLang.mnUnavailableTooltip",
                  "Mongolian translation is unavailable for some content.",
                )}
              >
                {t("settingsLang.mnUnavailable", "MN unavailable")}
              </span>
            )}
          </span>
        </span>

        <ChevronDown
          className={`pointer-events-none h-4 w-4 text-gray-400 transition-transform duration-200 group-hover:text-gray-500 dark:text-gray-500 dark:group-hover:text-gray-300 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <ul className="absolute left-0 z-50 mt-2 min-w-[154px] overflow-hidden rounded-xl border border-gray-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900 shadow-lg py-1">
          {supportedLanguages.map((lang) => (
            <li key={lang.code}>
              <button
                type="button"
                onClick={() => {
                  i18n.changeLanguage(lang.code);
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem("ng_lang", lang.code);
                  }
                  if (lang.code === "en") {
                    clearMnUnavailable();
                  }
                  setOpen(false);
                }}
                className={`flex w-full items-center px-3.5 py-2 text-sm transition-colors ${
                  lang.code === current
                    ? "bg-gray-100 text-gray-900 dark:bg-slate-800 dark:text-white font-semibold"
                    : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800"
                }`}
              >
                <span>{lang.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default LanguageSwitcher;

