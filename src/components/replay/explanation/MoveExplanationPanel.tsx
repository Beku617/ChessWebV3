import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  generateMoveExplanation,
  getQualityBgColor,
} from "../../../utils/moveExplanations";
import { MoveExplanationPanelProps, EvalTrend } from "./types";
import { useBestMove } from "./useBestMove";
import { ExplanationHeader } from "./ExplanationHeader";
import { ExplanationContent } from "./ExplanationContent";
import { BestMoveDisplay } from "./BestMoveDisplay";
import { SuggestionTip } from "./SuggestionTip";
import { EmptyState } from "./EmptyState";
import { AI_EXPLAINABLE_TYPES } from "./constants";

export function MoveExplanationPanel({
  currentPly,
  currentMoveSan,
  moveQualities,
  analysisByPly,
  positions,
  sanMoves = [],
  aiExplanationsByPly,
  aiLoading,
  aiError,
  aiModel,
  aiEnabled,
  isAiConfigured,
}: MoveExplanationPanelProps) {
  const { t } = useTranslation();

  const bestMoveInfo = useBestMove({
    currentPly,
    currentMoveSan,
    analysisByPly,
    positions,
  });

  const aiExplanation = aiExplanationsByPly.get(currentPly) || null;

  const explanation = useMemo(() => {
    if (currentPly === 0) {
      return {
        title: t("analysis.startingPositionTitle", "Starting Position"),
        description: t(
          "analysis.startingPositionDescription",
          "The game begins from the standard starting position.",
        ),
        details: t(
          "analysis.startingPositionDetails",
          "Select a move to see its analysis and explanation.",
        ),
        evalChange: "—",
      };
    }

    const qualityInfo = moveQualities.find((q) => q.ply === currentPly);
    const before = analysisByPly.get(currentPly - 1);
    const after = analysisByPly.get(currentPly);

    return generateMoveExplanation(
      qualityInfo,
      currentMoveSan,
      before?.cp,
      after?.cp,
    );
  }, [analysisByPly, currentMoveSan, currentPly, moveQualities, t]);

  const qualityInfo = moveQualities.find((q) => q.ply === currentPly);
  const isAiEligibleMove = Boolean(
    qualityInfo && AI_EXPLAINABLE_TYPES.includes(qualityInfo.label),
  );

  const evalTrend: EvalTrend = useMemo(() => {
    if (!qualityInfo) return "neutral";
    if (qualityInfo.epGain > 0.05) return "up";
    if (qualityInfo.epLoss > 0.05) return "down";
    return "neutral";
  }, [qualityInfo]);

  if (currentPly === 0) {
    return <EmptyState />;
  }

  return (
    <div
      className={`rounded-lg border p-4 ${
        qualityInfo
          ? getQualityBgColor(qualityInfo.label)
          : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800"
      }`}
    >
      <ExplanationHeader
        currentMoveSan={currentMoveSan}
        qualityInfo={qualityInfo}
        evalTrend={evalTrend}
        evalChange={explanation.evalChange}
        showAiBadge={Boolean(aiExplanation)}
      />

      <ExplanationContent
        title={explanation.title}
        description={explanation.description}
        details={explanation.details}
        aiExplanation={aiExplanation}
        aiLoading={aiLoading && isAiEligibleMove && aiEnabled && isAiConfigured}
        aiError={isAiEligibleMove ? aiError : null}
        modelLabel={aiModel}
        showModel={aiEnabled && isAiConfigured && Boolean(aiModel)}
        suppressTemplate={isAiEligibleMove}
      />

      {bestMoveInfo && <BestMoveDisplay bestMoveInfo={bestMoveInfo} />}

      {explanation.suggestion && !isAiEligibleMove && (
        <SuggestionTip suggestion={explanation.suggestion} />
      )}
    </div>
  );
}
