import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { MoveQualityInfo } from "../../../utils/moveQuality";
import { AnalysisEntry } from "../../../hooks/useGameReplayTypes";
import { useSettingsStore } from "../../../store/settingsStore";
import {
  getAiBatchExplanations,
  isGroqConfigured,
} from "../../../utils/groqApi";
import { AI_EXPLAINABLE_TYPES } from "./constants";
import { uciToSan } from "./utils";

interface UseAiExplanationsParams {
  moveQualities: MoveQualityInfo[];
  analysisByPly: Map<number, AnalysisEntry>;
  positions: string[];
  sanMoves: string[];
}

export function useAiExplanations({
  moveQualities,
  analysisByPly,
  positions,
  sanMoves,
}: UseAiExplanationsParams) {
  const { t } = useTranslation();
  const { enableAiExplanations } = useSettingsStore();
  const [explanationsByPly, setExplanationsByPly] = useState<
    Map<number, string>
  >(new Map());
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [hasRequestedBatch, setHasRequestedBatch] = useState(false);

  // Build SAN by ply map
  const sanByPly = useMemo(() => {
    const map = new Map<number, string>();
    sanMoves.forEach((san, idx) => {
      map.set(idx + 1, san);
    });
    return map;
  }, [sanMoves]);

  // Fetch AI batch once per analysis session (game)
  useEffect(() => {
    if (
      hasRequestedBatch ||
      !enableAiExplanations ||
      !isGroqConfigured() ||
      moveQualities.length === 0
    ) {
      return;
    }

    setAiLoading(true);
    setAiError(null);
    setHasRequestedBatch(true);

    const payload = moveQualities
      .filter((mq) => AI_EXPLAINABLE_TYPES.includes(mq.label))
      .map((mq) => {
        const fenBefore = positions[mq.ply - 1];
        const beforeAnalysis = analysisByPly.get(mq.ply - 1);
        let bestMoveSan: string | undefined;
        if (fenBefore && beforeAnalysis?.bestMove) {
          bestMoveSan = uciToSan(fenBefore, beforeAnalysis.bestMove);
        }
        return {
          ply: mq.ply,
          san: sanByPly.get(mq.ply) || `Move ${mq.ply}`,
          quality: mq.label,
          bestMove: bestMoveSan,
          epLoss: mq.epLoss,
        };
      });

    getAiBatchExplanations(payload)
      .then((result) => {
        setExplanationsByPly((prev) => {
          const next = new Map(prev);
          Object.entries(result).forEach(([ply, text]) => {
            const numericPly = Number(ply);
            const trimmed = text.slice(0, 120);
            next.set(numericPly, trimmed);
          });
          return next;
        });
      })
      .catch((err) => {
        setAiError(
          err.message ||
            t(
              "analysis.aiLoadFailed",
              "Failed to get AI explanations",
            ),
        );
      })
      .finally(() => {
        setAiLoading(false);
      });
  }, [
    enableAiExplanations,
    moveQualities,
    analysisByPly,
    positions,
    sanByPly,
    hasRequestedBatch,
    t,
  ]);

  return {
    explanationsByPly,
    aiLoading,
    aiError,
    enableAiExplanations,
    isAiConfigured: isGroqConfigured(),
  };
}
