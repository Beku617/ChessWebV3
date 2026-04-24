import { QualityCounts } from "../../hooks/useGameReplay";
import { useTranslation } from "react-i18next";
import { MoveQualityPill } from "./MoveQualityPill";

const order: Array<keyof QualityCounts> = [
  "Brilliant",
  "Great",
  "Best",
  "Excellent",
  "Good",
  "Book",
  "Inaccuracy",
  "Mistake",
  "Miss",
  "Blunder",
];

export function QualityBreakdown({
  white,
  black,
}: {
  white: QualityCounts;
  black: QualityCounts;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3">
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">
          {t("analysis.qualityBreakdown.white", "White")}
        </div>
        <div className="space-y-1.5">
          {order.map((key) => (
            <div key={key} className="flex items-center justify-between gap-2">
              <MoveQualityPill quality={key} />
              <span className="text-gray-900 dark:text-gray-200 font-semibold">
                {white[key] ?? 0}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3">
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">
          {t("analysis.qualityBreakdown.black", "Black")}
        </div>
        <div className="space-y-1.5">
          {order.map((key) => (
            <div key={key} className="flex items-center justify-between gap-2">
              <MoveQualityPill quality={key} />
              <span className="text-gray-900 dark:text-gray-200 font-semibold">
                {black[key] ?? 0}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
