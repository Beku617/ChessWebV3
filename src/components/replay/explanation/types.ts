import { MoveQualityInfo } from "../../../utils/moveQuality";
import { AnalysisEntry } from "../../../hooks/useGameReplayTypes";

export interface MoveExplanationPanelProps {
  currentPly: number;
  currentMoveSan: string;
  moveQualities: MoveQualityInfo[];
  analysisByPly: Map<number, AnalysisEntry>;
  positions: string[]; // FEN positions to convert UCI to SAN
  sanMoves: string[];
  gameId?: string;
  aiExplanationsByPly: Map<number, string>;
  aiLoading: boolean;
  aiError: string | null;
  aiModel: string | null;
  aiEnabled: boolean;
  isAiConfigured: boolean;
}

export interface BestMoveInfo {
  san: string;
  wasPlayed: boolean;
}

export type EvalTrend = "up" | "down" | "neutral";
