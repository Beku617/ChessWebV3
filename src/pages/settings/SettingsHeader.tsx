import { RotateCcw, Save } from "lucide-react";
import type { TFunction } from "i18next";

interface SettingsHeaderProps {
  dirty: boolean;
  onReset: () => void;
  onSave: () => void;
  t: TFunction;
}

export function SettingsHeader({
  dirty,
  onReset,
  onSave,
  t,
}: SettingsHeaderProps) {
  return (
    <div className="sticky top-0 z-30 border-b border-gray-200/50 bg-[#f5f5f7]/80 backdrop-blur-xl dark:border-gray-800/50 dark:bg-gray-950/80">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("settings.header.title", "Settings")}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            {t("settings.header.subtitle", "Manage your account & preferences")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onReset}
            disabled={!dirty}
            className="flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 transition-all hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("settings.actions.reset", "Reset")}
          </button>
          <button
            onClick={onSave}
            disabled={!dirty}
            className={`flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-bold transition-all shadow-lg ${
              dirty
                ? "bg-teal-600 text-white shadow-teal-900/25 hover:bg-teal-500"
                : "cursor-not-allowed bg-gray-300 text-gray-500 shadow-none dark:bg-gray-800"
            }`}
          >
            <Save className="h-4 w-4" />
            {t("settings.actions.saveChanges", "Save Changes")}
          </button>
        </div>
      </div>
    </div>
  );
}
