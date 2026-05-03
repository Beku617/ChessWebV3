import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ExplanationContentProps {
  title: string;
  description: string;
  details: string;
  aiExplanation: string | null;
  aiLoading: boolean;
  aiError: string | null;
  modelLabel: string | null;
  showModel: boolean;
  suppressTemplate: boolean;
}

export function ExplanationContent({
  title,
  description,
  details,
  aiExplanation,
  aiLoading,
  aiError,
  modelLabel,
  showModel,
  suppressTemplate,
}: ExplanationContentProps) {
  const { t } = useTranslation();
  return (
    <>
      {/* Title */}
      <h4 className="font-semibold text-gray-900 dark:text-white mb-2">{title}</h4>

      {showModel && modelLabel && (
        <div className="mb-2 inline-flex max-w-full items-center gap-1.5 rounded-full border border-gray-300/80 px-2 py-0.5 text-[11px] text-gray-500 dark:border-gray-600/80 dark:text-gray-400">
          <span>{t("analysis.analyzedBy", "Analyzed by")}</span>
          <span className="truncate font-medium text-gray-600 dark:text-gray-300">
            {modelLabel}
          </span>
        </div>
      )}

      {/* AI Explanation or Template Description */}
      {aiLoading ? (
        <div className="mb-2 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{t("analysis.aiLoading", "Getting AI explanation...")}</span>
        </div>
      ) : aiExplanation ? (
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-2 leading-relaxed">
          {aiExplanation}
        </p>
      ) : suppressTemplate ? null : (
        <>
          {/* Description */}
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
            {description}
          </p>

          {/* Details */}
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            {details}
          </p>
        </>
      )}

      {/* AI Error */}
      {aiError && (
        <p className="text-xs text-red-500 dark:text-red-400 mb-2">{aiError}</p>
      )}
    </>
  );
}
