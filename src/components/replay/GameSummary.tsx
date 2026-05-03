import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AdvantageGraph } from "./AdvantageGraph";
import { AccuracyBadge } from "./AccuracyBadge";
import { QualityBreakdown } from "./QualityBreakdown";
import { GameHistory } from "../../historyTypes";
import { MoveQualityInfo } from "../../utils/moveQuality";
import { QualityCounts } from "../../hooks/useGameReplay";
import { OpeningMatch } from "../../utils/openingExplorer";

export function GameSummary({
  game,
  accuracy,
  qualityCounts,
  moveQualities,
  cpSeries,
  opening,
  activePlayerSide,
  onBack,
}: {
  game: GameHistory;
  accuracy: { white: number | null; black: number | null };
  qualityCounts: { white: QualityCounts; black: QualityCounts };
  moveQualities: MoveQualityInfo[];
  cpSeries: Array<{ cp?: number; mate?: number } | undefined>;
  opening?: OpeningMatch | null;
  activePlayerSide?: "white" | "black" | null;
  onBack?: () => void;
}) {
  const { t } = useTranslation();
  const openingLabel = opening
    ? opening.variation
      ? `${opening.name}: ${opening.variation}`
      : opening.name
    : null;
  const whiteHighlight =
    activePlayerSide === "white"
      ? true
      : activePlayerSide === "black"
        ? false
        : accuracy.white !== null && accuracy.white >= (accuracy.black || 0);
  const blackHighlight =
    activePlayerSide === "black"
      ? true
      : activePlayerSide === "white"
        ? false
        : accuracy.black !== null && accuracy.black > (accuracy.white || 0);

  return (
    <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-3 shadow-sm space-y-3 h-full min-h-0 overflow-y-auto no-scrollbar">
      <div className="px-1">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
          {t("analysis.summary", "Summary")}
        </h3>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-white/10 bg-gradient-to-br from-white via-slate-50 to-slate-100 dark:from-[#0b1324] dark:via-[#0a1426] dark:to-[#090f1c] p-4 sm:p-5 shadow-[0_10px_30px_rgba(15,23,42,0.08)] dark:shadow-[0_16px_40px_rgba(2,6,23,0.5)]">
        <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-brand-300/20 dark:bg-brand-400/10 blur-2xl" />
        <div className="pointer-events-none absolute -left-10 -bottom-10 h-24 w-24 rounded-full bg-amber-300/20 dark:bg-amber-200/10 blur-2xl" />

        <div className="relative">
          {onBack && (
            <button
              onClick={onBack}
              className="absolute left-0 top-0 z-10 p-2 rounded-xl bg-white/70 dark:bg-slate-900/70 hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-lg transition-all duration-200"
              aria-label="Back"
            >
              <ArrowLeft className="w-4 h-4 text-slate-700 dark:text-slate-200" />
            </button>
          )}

          <div className="min-w-0 flex flex-col items-center text-center px-1 sm:px-6">
            <h2 className="text-lg sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 leading-tight break-words">
              <span>{game.white}</span>
              <span className="mx-2">vs</span>
              <span>{game.black}</span>
            </h2>

            {opening && openingLabel && (
              <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-slate-300/70 dark:border-white/10 bg-white/75 dark:bg-slate-900/65 px-3.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_8px_24px_rgba(15,23,42,0.12)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_10px_28px_rgba(2,6,23,0.45)] backdrop-blur-md mx-auto">
                <span className="inline-flex items-center rounded-full border border-brand-200 dark:border-brand-400/30 bg-brand-50 dark:bg-brand-400/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-700 dark:text-brand-200 shrink-0">
                  {t("analysis.opening", "Opening")}
                </span>
                <span className="h-1 w-1 rounded-full bg-amber-500/80 shrink-0" />
                <span className="truncate text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200">
                  {openingLabel}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <AdvantageGraph cps={cpSeries} />

      <div className="px-1">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
          {t("analysis.accuracy", "Accuracy")}
        </h4>
      </div>

      <div className="mx-auto grid w-full max-w-[420px] grid-cols-2 items-stretch gap-2">
        <AccuracyBadge
          name={game.white}
          accuracy={accuracy.white}
          highlight={whiteHighlight}
        />
        <AccuracyBadge
          name={game.black}
          accuracy={accuracy.black}
          highlight={blackHighlight}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <QualityBreakdown
          white={qualityCounts.white}
          black={qualityCounts.black}
        />
      </div>
    </div>
  );
}

