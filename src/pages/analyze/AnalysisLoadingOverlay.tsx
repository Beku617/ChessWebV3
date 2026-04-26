import { useTranslation } from "react-i18next";

interface AnalysisLoadingOverlayProps {
  progress: number;
}

export function AnalysisLoadingOverlay({
  progress,
}: AnalysisLoadingOverlayProps) {
  const { t } = useTranslation();

  return (
    <div className="h-screen bg-[#f5f5f7] dark:bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        {/* Title */}
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {t("analysis.loadingTitle")}
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-sm mx-auto">
          {t("analysis.loadingDescription")}
        </p>

        {/* Progress bar */}
        <div className="w-80 mx-auto mb-4">
          <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400 mb-2">
            <span>{t("analysis.progress")}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-500 to-brand-500 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Analysis steps */}
        <div className="flex items-center justify-center gap-6 text-sm text-gray-500 dark:text-gray-400">
          <div className={progress > 0 ? "text-brand-500" : ""}>
            <span>{t("analysis.evaluatingPositions")}</span>
          </div>
          <div className={progress > 50 ? "text-brand-500" : ""}>
            <span>{t("analysis.calculatingAccuracy")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

