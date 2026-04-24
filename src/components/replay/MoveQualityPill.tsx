import { useTranslation } from "react-i18next";
import { MoveQuality } from "../../hooks/useGameReplay";
import { getQualityLabel } from "../../utils/moveExplanations";

const colorMap: Record<MoveQuality, string> = {
  Best: "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200",
  Excellent:
    "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200",
  Good:
    "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200",
  Book:
    "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200",
  Inaccuracy:
    "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200",
  Mistake:
    "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-200",
  Blunder:
    "bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-200",
  Great:
    "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200",
  Brilliant:
    "bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-200",
  Miss:
    "bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-200",
  Unknown:
    "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-200",
};

export function MoveQualityPill({ quality }: { quality: MoveQuality }) {
  useTranslation();
  const label = getQualityLabel(quality);
  const styles = colorMap[quality] || colorMap.Unknown;

  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${styles}`}>
      {label}
    </span>
  );
}
