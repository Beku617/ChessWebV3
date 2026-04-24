import { Lightbulb } from "lucide-react";
import { useTranslation } from "react-i18next";

export function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb className="w-5 h-5 text-brand-500" />
        <h3 className="font-semibold text-gray-900 dark:text-white">
          {t("analysis.moveExplanation", "Move Explanation")}
        </h3>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {t(
          "analysis.moveExplanationHint",
          "Click on any move in the move list to see why it's good or bad.",
        )}
      </p>
    </div>
  );
}

