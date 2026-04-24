import i18n from "../i18n";
import { MoveQuality, MoveQualityInfo } from "./moveQuality";

export interface MoveExplanation {
  title: string;
  description: string;
  details: string;
  suggestion?: string;
  evalChange: string;
}

type ExplanationTemplate = {
  title: () => string;
  getDescription: (info: MoveQualityInfo, san: string) => string;
  getDetails: (info: MoveQualityInfo) => string;
  getSuggestion?: (info: MoveQualityInfo) => string;
};

const qualityKeyMap: Record<MoveQuality, string> = {
  Brilliant: "brilliant",
  Great: "great",
  Best: "best",
  Excellent: "excellent",
  Good: "good",
  Book: "book",
  Inaccuracy: "inaccuracy",
  Mistake: "mistake",
  Miss: "miss",
  Blunder: "blunder",
  Unknown: "unknown",
};

function tr(
  key: string,
  defaultValue: string,
  options?: Record<string, unknown>,
): string {
  return i18n.t(key, { defaultValue, ...(options ?? {}) });
}

function cpToString(cp: number): string {
  const sign = cp >= 0 ? "+" : "";
  return `${sign}${(cp / 100).toFixed(2)}`;
}

function epToPercent(ep: number): number {
  return Math.round(ep * 100);
}

function formatPercent(ep: number): string {
  return `${epToPercent(ep)}%`;
}

function colorName(mover: "w" | "b"): string {
  return mover === "w"
    ? tr("analysis.colors.white", "White")
    : tr("analysis.colors.black", "Black");
}

export function getQualityLabel(quality: MoveQuality): string {
  return tr(
    `analysis.qualityLabels.${quality}`,
    quality === "Unknown" ? "—" : quality,
  );
}

const qualityExplanations: Record<MoveQuality, ExplanationTemplate> = {
  Brilliant: {
    title: () =>
      tr("analysis.moveExplanations.brilliant.title", "Brilliant Move!"),
    getDescription: (info, san) =>
      tr(
        "analysis.moveExplanations.brilliant.description",
        "{{san}} is a brilliant sacrifice! This move demonstrates deep calculation and turns the position decisively in {{mover}}'s favor.",
        { san, mover: colorName(info.mover) },
      ),
    getDetails: (info) =>
      tr(
        "analysis.moveExplanations.brilliant.details",
        "This move improved the position significantly ({{swing}} swing) through a tactical sacrifice that the opponent cannot easily refute.",
        { swing: formatPercent(info.epGain) },
      ),
    getSuggestion: () =>
      tr(
        "analysis.moveExplanations.brilliant.suggestion",
        "This is exactly the kind of move that separates strong players!",
      ),
  },
  Great: {
    title: () => tr("analysis.moveExplanations.great.title", "Great Move!"),
    getDescription: (info, san) =>
      tr(
        "analysis.moveExplanations.great.description",
        "{{san}} is a great move that significantly improved {{mover}}'s position.",
        { san, mover: colorName(info.mover) },
      ),
    getDetails: (info) =>
      tr(
        "analysis.moveExplanations.great.details",
        "Win probability shifted from {{before}} to {{after}} — a {{gain}} improvement.",
        {
          before: formatPercent(info.epBefore),
          after: formatPercent(info.epAfter),
          gain: formatPercent(info.epGain),
        },
      ),
    getSuggestion: () =>
      tr(
        "analysis.moveExplanations.great.suggestion",
        "This move found a critical resource in the position.",
      ),
  },
  Best: {
    title: () => tr("analysis.moveExplanations.best.title", "Best Move"),
    getDescription: (_, san) =>
      tr(
        "analysis.moveExplanations.best.description",
        "{{san}} is the best move in this position, maintaining or improving the evaluation.",
        { san },
      ),
    getDetails: (info) =>
      tr(
        "analysis.moveExplanations.best.details",
        "Position evaluation stayed strong at {{after}} win probability.",
        { after: formatPercent(info.epAfter) },
      ),
  },
  Excellent: {
    title: () =>
      tr("analysis.moveExplanations.excellent.title", "Excellent Move"),
    getDescription: (_, san) =>
      tr(
        "analysis.moveExplanations.excellent.description",
        "{{san}} is an excellent move, very close to the engine's top choice.",
        { san },
      ),
    getDetails: (info) =>
      tr(
        "analysis.moveExplanations.excellent.details",
        "Only a tiny {{loss}} loss compared to the absolute best move.",
        { loss: `${(info.epLoss * 100).toFixed(1)}%` },
      ),
  },
  Good: {
    title: () => tr("analysis.moveExplanations.good.title", "Good Move"),
    getDescription: (_, san) =>
      tr(
        "analysis.moveExplanations.good.description",
        "{{san}} is a good, solid move that keeps the position playable.",
        { san },
      ),
    getDetails: (info) =>
      tr(
        "analysis.moveExplanations.good.details",
        "About {{loss}} accuracy loss — not perfect but reasonable.",
        { loss: `${(info.epLoss * 100).toFixed(1)}%` },
      ),
  },
  Book: {
    title: () => tr("analysis.moveExplanations.book.title", "Book Move"),
    getDescription: (_, san) =>
      tr(
        "analysis.moveExplanations.book.description",
        "{{san}} is a standard opening move, following established theory.",
        { san },
      ),
    getDetails: () =>
      tr(
        "analysis.moveExplanations.book.details",
        "This move is part of well-known opening theory. Both sides are following established lines.",
      ),
  },
  Inaccuracy: {
    title: () => tr("analysis.moveExplanations.inaccuracy.title", "Inaccuracy"),
    getDescription: (_, san) =>
      tr(
        "analysis.moveExplanations.inaccuracy.description",
        "{{san}} is an inaccuracy — not the best choice in this position.",
        { san },
      ),
    getDetails: (info) =>
      tr(
        "analysis.moveExplanations.inaccuracy.details",
        "Win probability dropped from {{before}} to {{after}} ({{loss}} loss).",
        {
          before: formatPercent(info.epBefore),
          after: formatPercent(info.epAfter),
          loss: `${(info.epLoss * 100).toFixed(1)}%`,
        },
      ),
    getSuggestion: () =>
      tr(
        "analysis.moveExplanations.inaccuracy.suggestion",
        "Look for moves that maintain piece activity and do not give your opponent free tempos.",
      ),
  },
  Mistake: {
    title: () => tr("analysis.moveExplanations.mistake.title", "Mistake"),
    getDescription: (info, san) =>
      tr(
        "analysis.moveExplanations.mistake.description",
        "{{san}} is a mistake that significantly hurts {{mover}}'s position.",
        { san, mover: colorName(info.mover) },
      ),
    getDetails: (info) =>
      tr(
        "analysis.moveExplanations.mistake.details",
        "Win probability dropped from {{before}} to {{after}} — that is a {{loss}} swing!",
        {
          before: formatPercent(info.epBefore),
          after: formatPercent(info.epAfter),
          loss: `${(info.epLoss * 100).toFixed(1)}%`,
        },
      ),
    getSuggestion: () =>
      tr(
        "analysis.moveExplanations.mistake.suggestion",
        "Before moving, check for tactics: captures, checks, and threats. Ask yourself what your opponent wants to do.",
      ),
  },
  Miss: {
    title: () =>
      tr("analysis.moveExplanations.miss.title", "Missed Opportunity"),
    getDescription: (_, san) =>
      tr(
        "analysis.moveExplanations.miss.description",
        "{{san}} missed a chance to capitalize on the opponent's previous error.",
        { san },
      ),
    getDetails: () =>
      tr(
        "analysis.moveExplanations.miss.details",
        "Your opponent made a mistake, but this move did not punish it effectively. The advantage was not fully converted.",
      ),
    getSuggestion: () =>
      tr(
        "analysis.moveExplanations.miss.suggestion",
        "When your opponent blunders, slow down and look for the tactical punishment.",
      ),
  },
  Blunder: {
    title: () => tr("analysis.moveExplanations.blunder.title", "Blunder"),
    getDescription: (_, san) =>
      tr(
        "analysis.moveExplanations.blunder.description",
        "{{san}} is a serious blunder that dramatically changes the game.",
        { san },
      ),
    getDetails: (info) =>
      tr(
        "analysis.moveExplanations.blunder.details",
        "Win probability crashed from {{before}} to {{after}} — a devastating {{loss}} loss.",
        {
          before: formatPercent(info.epBefore),
          after: formatPercent(info.epAfter),
          loss: `${(info.epLoss * 100).toFixed(1)}%`,
        },
      ),
    getSuggestion: () =>
      tr(
        "analysis.moveExplanations.blunder.suggestion",
        "Always check for hanging pieces and tactical threats before finalizing your move. Ask: is my piece safe and what can my opponent attack?",
      ),
  },
  Unknown: {
    title: () => tr("analysis.moveExplanations.unknown.title", "Move"),
    getDescription: (_, san) =>
      tr("analysis.moveExplanations.unknown.description", "{{san}} was played.", {
        san,
      }),
    getDetails: () =>
      tr(
        "analysis.moveExplanations.unknown.details",
        "Analysis not available for this move.",
      ),
  },
};

export function generateMoveExplanation(
  qualityInfo: MoveQualityInfo | undefined,
  san: string,
  cpBefore?: number,
  cpAfter?: number,
): MoveExplanation {
  if (!qualityInfo) {
    return {
      title: tr("analysis.moveAnalysisTitle", "Move Analysis"),
      description: tr("analysis.movePlayed", "{{san}} was played.", { san }),
      details: tr(
        "analysis.moveAnalysisUnavailable",
        "No analysis data available for this move.",
      ),
      evalChange: "—",
    };
  }

  const template = qualityExplanations[qualityInfo.label];

  let evalChange = "";
  if (cpBefore !== undefined && cpAfter !== undefined) {
    evalChange = `${cpToString(cpBefore)} → ${cpToString(cpAfter)}`;
  } else {
    evalChange = `${formatPercent(qualityInfo.epBefore)} → ${formatPercent(
      qualityInfo.epAfter,
    )}`;
  }

  return {
    title: template.title(),
    description: template.getDescription(qualityInfo, san),
    details: template.getDetails(qualityInfo),
    suggestion: template.getSuggestion?.(qualityInfo),
    evalChange,
  };
}

export function getQualityColor(quality: MoveQuality): string {
  const colors: Record<MoveQuality, string> = {
    Brilliant: "text-cyan-400",
    Great: "text-blue-400",
    Best: "text-green-500",
    Excellent: "text-green-400",
    Good: "text-green-300",
    Book: "text-gray-400",
    Inaccuracy: "text-yellow-500",
    Mistake: "text-orange-500",
    Miss: "text-orange-400",
    Blunder: "text-red-500",
    Unknown: "text-gray-400",
  };
  return colors[quality] || "text-gray-400";
}

export function getQualityBgColor(quality: MoveQuality): string {
  const colors: Record<MoveQuality, string> = {
    Brilliant: "bg-cyan-500/20 border-cyan-500/50",
    Great: "bg-blue-500/20 border-blue-500/50",
    Best: "bg-green-500/20 border-green-500/50",
    Excellent: "bg-green-500/15 border-green-500/40",
    Good: "bg-green-500/10 border-green-500/30",
    Book: "bg-gray-500/10 border-gray-500/30",
    Inaccuracy: "bg-yellow-500/20 border-yellow-500/50",
    Mistake: "bg-orange-500/20 border-orange-500/50",
    Miss: "bg-orange-500/15 border-orange-500/40",
    Blunder: "bg-red-500/20 border-red-500/50",
    Unknown: "bg-gray-500/10 border-gray-500/30",
  };
  return colors[quality] || "bg-gray-500/10 border-gray-500/30";
}

export function getQualityKey(quality: MoveQuality): string {
  return qualityKeyMap[quality];
}
