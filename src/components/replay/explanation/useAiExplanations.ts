import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MoveQualityInfo } from "../../../utils/moveQuality";
import { AnalysisEntry } from "../../../hooks/useGameReplayTypes";
import { useSettingsStore } from "../../../store/settingsStore";
import {
  getAiBatchExplanations,
  type AiLocalizedExplanation,
} from "../../../utils/groqApi";
import { AI_EXPLAINABLE_TYPES } from "./constants";
import { uciToSan } from "./utils";

interface UseAiExplanationsParams {
  moveQualities: MoveQualityInfo[];
  analysisByPly: Map<number, AnalysisEntry>;
  positions: string[];
  sanMoves: string[];
  gameId?: string;
  analysisReady?: boolean;
}

const AI_EXPLAINABLE_KEYS = new Set(
  AI_EXPLAINABLE_TYPES.map((quality) => quality.toLowerCase()),
);

const AI_EXPLANATION_TIMEOUT_MS = 25000;

function isAiExplainableQuality(quality: string): boolean {
  const normalized = quality.toLowerCase();
  return AI_EXPLAINABLE_KEYS.has(normalized) || normalized === "brillient";
}

function normalizeLanguage(language: string): "en" | "mn" {
  return language.toLowerCase().startsWith("mn") ? "mn" : "en";
}

function normalizeModelLabel(model: string | null): string | null {
  if (!model) return null;
  const lower = model.toLowerCase();
  if (lower.includes("claude-haiku")) return "Claude Haiku 4.5";
  if (lower.includes("llama-3.3-70b")) return "Groq Llama 3.3 70B";
  return model
    .replace(/^global\./, "")
    .replace(/^anthropic\./, "")
    .replace(/-v\d+:\d+$/, "")
    .trim();
}

export function useAiExplanations({
  moveQualities,
  analysisByPly,
  positions,
  sanMoves,
  gameId,
  analysisReady = true,
}: UseAiExplanationsParams) {
  const { t, i18n } = useTranslation();
  const settings = useSettingsStore((state) => state.settings);
  const enableAiExplanations = settings.enableAiExplanations;
  const selectedAiModelId = settings.analysisAiModelId;
  const [localizedRawByPly, setLocalizedRawByPly] = useState<
    Map<number, AiLocalizedExplanation>
  >(new Map());
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const lastRequestedKeyRef = useRef<string | null>(null);

  const sessionKey = useMemo(() => {
    const id = gameId || "unknown-game";
    return `${id}:${sanMoves.join("|")}`;
  }, [gameId, sanMoves]);

  useEffect(() => {
    setLocalizedRawByPly(new Map());
    setAiLoading(false);
    setAiError(null);
    setModelUsed(null);
    lastRequestedKeyRef.current = null;
  }, [selectedAiModelId, sessionKey]);

  const sanByPly = useMemo(() => {
    const map = new Map<number, string>();
    sanMoves.forEach((san, idx) => {
      map.set(idx + 1, san);
    });
    return map;
  }, [sanMoves]);

  const payload = useMemo(
    () =>
      moveQualities
        .filter((mq) => isAiExplainableQuality(mq.label))
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
        }),
    [analysisByPly, moveQualities, positions, sanByPly],
  );

  const payloadSignature = useMemo(
    () =>
      payload
        .map((move) =>
          [
            move.ply,
            move.quality,
            move.bestMove || "",
            move.epLoss?.toFixed(3) || "",
          ].join(":"),
        )
        .join("|"),
    [payload],
  );

  const requestKey = useMemo(
    () =>
      `${sessionKey}:${selectedAiModelId || "default"}:${payloadSignature}`,
    [payloadSignature, sessionKey, selectedAiModelId],
  );

  useEffect(() => {
    if (!analysisReady || !enableAiExplanations || moveQualities.length === 0) {
      setAiLoading(false);
      return;
    }

    if (lastRequestedKeyRef.current === requestKey) {
      return;
    }

    if (payload.length === 0) {
      setAiLoading(false);
      setAiError(null);
      return;
    }

    setAiLoading(true);
    setAiError(null);
    lastRequestedKeyRef.current = requestKey;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new Error(
            t(
              "analysis.aiLoadTimedOut",
              "AI explanation timed out. Try this move again after the backend responds.",
            ),
          ),
        );
      }, AI_EXPLANATION_TIMEOUT_MS);
    });

    Promise.race([getAiBatchExplanations(payload, selectedAiModelId), timeout])
      .then((result) => {
        if (cancelled) return;
        setModelUsed(normalizeModelLabel(result.model));

        const next = new Map<number, AiLocalizedExplanation>();
        Object.entries(result.explanationsByPly).forEach(
          ([plyRaw, explanation]) => {
            const numericPly = Number(plyRaw);
            if (Number.isNaN(numericPly)) return;
            if (!explanation?.en && !explanation?.mn) return;

            next.set(numericPly, {
              en: String(explanation.en || explanation.mn || "").slice(0, 220),
              mn: String(explanation.mn || explanation.en || "").slice(0, 220),
            });
          },
        );
        if (next.size === 0) {
          setAiError(
            t(
              "analysis.aiNoExplanationsReturned",
              "AI model returned no structured explanations for this game. Try another model.",
            ),
          );
        }
        setLocalizedRawByPly(next);
      })
      .catch((err) => {
        if (cancelled) return;
        setAiError(
          err.message ||
            t("analysis.aiLoadFailed", "Failed to get AI explanations"),
        );
      })
      .finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
        if (cancelled) return;
        setAiLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    enableAiExplanations,
    analysisReady,
    selectedAiModelId,
    moveQualities,
    payload,
    requestKey,
    t,
  ]);

  const selectedLanguage = normalizeLanguage(
    i18n.resolvedLanguage || i18n.language || "en",
  );

  const explanationsByPly = useMemo(() => {
    const next = new Map<number, string>();
    localizedRawByPly.forEach((value, ply) => {
      const text =
        selectedLanguage === "mn"
          ? value.mn || value.en
          : value.en || value.mn;

      if (text) {
        next.set(ply, text);
      }
    });
    return next;
  }, [localizedRawByPly, selectedLanguage]);

  return {
    explanationsByPly,
    aiLoading,
    aiError,
    enableAiExplanations,
    isAiConfigured: true,
    modelUsed,
  };
}
