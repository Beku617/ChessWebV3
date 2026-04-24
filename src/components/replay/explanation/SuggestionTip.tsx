import { Lightbulb } from "lucide-react";
import { useTranslation } from "react-i18next";

interface SuggestionTipProps {
  suggestion: string;
}

export function SuggestionTip({ suggestion }: SuggestionTipProps) {
  const { t } = useTranslation();
  return (
    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700/50">
      <div className="flex items-start gap-2">
        <Lightbulb className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-gray-600 dark:text-gray-400">
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {t("analysis.tip", "Tip:")}{" "}
          </span>
          {suggestion}
        </p>
      </div>
    </div>
  );
}
