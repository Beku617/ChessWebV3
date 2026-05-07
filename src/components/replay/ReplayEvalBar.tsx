import { useTranslation } from "react-i18next";

interface ReplayEvalBarProps {
  evalPercent: number; // 0 = black wins, 100 = white wins
  evalLabel: string;
  orientation?: "horizontal" | "vertical";
  boardOrientation?: "white" | "black";
}

export function ReplayEvalBar({
  evalPercent,
  evalLabel,
  orientation = "horizontal",
  boardOrientation = "white",
}: ReplayEvalBarProps) {
  const { t } = useTranslation();
  const safeEvalPercent = Number.isFinite(evalPercent)
    ? Math.max(0, Math.min(100, evalPercent))
    : 50;
  const whitePercent = safeEvalPercent;
  const blackPercent = 100 - safeEvalPercent;
  const isBlackAtBottom = boardOrientation === "black";
  const bottomPercent = isBlackAtBottom ? blackPercent : whitePercent;
  const topPercent = isBlackAtBottom ? whitePercent : blackPercent;
  const bottomFillClass = isBlackAtBottom ? "bg-gray-950" : "bg-white";
  const topFillClass = isBlackAtBottom ? "bg-white" : "bg-gray-950";
  const isWhiteAdvantage = safeEvalPercent > 50;
  const isEmptyEvalLabel =
    evalLabel === "\u2014" || evalLabel === "—" || evalLabel === "â€”";
  const displayLabel = isEmptyEvalLabel ? "0.00" : evalLabel;

  if (orientation === "vertical") {
    return (
      <div className="flex h-full min-w-0 flex-col items-center overflow-hidden">
        <span className="mb-1 w-full text-center text-[9px] uppercase tracking-wide text-gray-500 dark:text-gray-400 md:text-[10px]">
          <span className="hidden md:inline">
            {t("analysis.engineEvaluation", "Engine evaluation")}
          </span>
          <span className="md:hidden">{t("analysis.eval", "Eval")}</span>
        </span>
        <div
          className={`mb-1 w-full rounded px-1 py-1 text-center text-[10px] font-bold ${
            isWhiteAdvantage
              ? "border border-gray-300 bg-white text-black"
              : "bg-gray-900 text-white"
          }`}
        >
          {displayLabel}
        </div>
        <div className="relative w-4 md:w-5 flex-1 overflow-hidden rounded border border-gray-400 bg-slate-200 dark:border-gray-500 dark:bg-slate-700">
          <div
            className={`absolute bottom-0 left-0 right-0 ${bottomFillClass}`}
            style={{ height: `${bottomPercent}%` }}
          />
          <div
            className={`absolute left-0 right-0 top-0 ${topFillClass}`}
            style={{ height: `${topPercent}%` }}
          />
          <div className="absolute left-0 right-0 top-1/2 h-px bg-gray-400/70" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {t("analysis.engineEvaluation", "Engine evaluation")}
      </span>
      <div
        className={`min-w-[45px] rounded px-2 py-1 text-center text-xs font-bold ${
          isWhiteAdvantage
            ? "border border-gray-300 bg-white text-black"
            : "bg-gray-900 text-white"
        }`}
      >
        {displayLabel}
      </div>

      <div className="relative h-4 flex-1 overflow-hidden rounded border border-gray-300 dark:border-gray-600">
        <div
          className="absolute bottom-0 left-0 top-0 bg-gray-900 transition-all duration-300 ease-out"
          style={{ width: `${100 - safeEvalPercent}%` }}
        />
        <div
          className="absolute bottom-0 right-0 top-0 bg-white transition-all duration-300 ease-out"
          style={{ width: `${safeEvalPercent}%` }}
        />
        <div className="absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 bg-gray-400/70" />
      </div>
    </div>
  );
}
