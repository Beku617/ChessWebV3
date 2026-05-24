import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../hooks/useTheme";

interface ThemeOptionsGridProps {
  onThemeSelect?: () => void;
  className?: string;
}

export function ThemeOptionsGrid({
  onThemeSelect,
  className = "",
}: ThemeOptionsGridProps) {
  const { t } = useTranslation();
  const { themeName, setTheme: setAppTheme, themes: appThemes } = useTheme();

  return (
    <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${className}`.trim()}>
      {appThemes.map((themeOption) => {
        const isActive = themeName === themeOption.name;
        const swatches =
          themeOption.swatches ??
          [themeOption.bgPrimary, themeOption.bgSecondary, themeOption.accent];

        return (
          <button
            key={themeOption.name}
            type="button"
            onClick={() => {
              setAppTheme(themeOption.name);
              onThemeSelect?.();
            }}
            aria-pressed={isActive}
            className={`rounded-xl border px-4 py-3 text-left transition-all duration-200 ${
              isActive
                ? "bg-slate-950/90"
                : "bg-slate-950/72 hover:bg-slate-950/88"
            }`}
            style={{
              borderColor: isActive ? "var(--accent)" : "rgba(255, 255, 255, 0.12)",
              boxShadow: isActive
                ? "0 18px 40px rgba(2, 6, 23, 0.28)"
                : "0 10px 24px rgba(2, 6, 23, 0.2)",
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="block text-sm font-semibold text-white">
                  {t(
                    `settings.appearance.themeNames.${themeOption.name}`,
                    themeOption.label,
                  )}
                </span>
              </div>
              {isActive ? (
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)] text-white">
                  <Check className="h-4 w-4" />
                </span>
              ) : (
                <span className="h-6 w-6 rounded-full border border-white/15 bg-white/5" />
              )}
            </div>
            <div className="mt-3 flex items-center gap-2">
              {swatches.map((color) => (
                <span
                  key={`${themeOption.name}-${color}`}
                  className="h-4 w-4 rounded-full border border-black/10 dark:border-white/10"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}
