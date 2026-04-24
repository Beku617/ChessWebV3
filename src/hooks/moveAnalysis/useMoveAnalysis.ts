import { useMemo } from "react";
import { GameHistory } from "../../historyTypes";
import { AnalysisEntry, MoveRow } from "../useGameReplayTypes";
import { useStockfishAnalysis } from "./useStockfishAnalysis";
import { useQualityClassification } from "./useQualityClassification";
import {
  useMoveRowsWithQuality,
  useQualityCounts,
  useAccuracy,
} from "./useAccuracyCalculation";

export function useMoveAnalysis(
  game: GameHistory,
  positions: string[],
  moveRows: MoveRow[],
  totalPlies: number,
) {
  // Run Stockfish analysis
  const { analysis, isAnalyzing, analysisProgress, analysisDisabledReason } =
    useStockfishAnalysis(game, positions);

  // Build analysis lookup map
  const analysisByPly = useMemo(() => {
    const map = new Map<number, AnalysisEntry>();
    analysis.forEach((a) => map.set(a.ply, a));
    return map;
  }, [analysis]);

  // Build analysis series for charts
  const analysisSeries = useMemo(() => {
    const max = Math.max(totalPlies, positions.length - 1);
    const series: Array<{ cp?: number; mate?: number } | undefined> = [];
    for (let i = 0; i <= max; i++) {
      series.push(analysisByPly.get(i));
    }
    return series;
  }, [analysisByPly, positions.length, totalPlies]);

  // Classify move qualities
  const moveQualities = useQualityClassification(
    analysisByPly,
    positions,
    moveRows,
    totalPlies,
  );

  // Add quality labels to move rows
  const moveRowsWithQuality = useMoveRowsWithQuality(moveRows, moveQualities);

  // Count qualities per side
  const qualityCounts = useQualityCounts(moveQualities);

  // Calculate accuracy
  const accuracy = useAccuracy(moveQualities);

  return {
    analysis,
    analysisByPly,
    analysisSeries,
    moveQualities,
    moveRowsWithQuality,
    qualityCounts,
    accuracy,
    isAnalyzing,
    analysisProgress,
    analysisDisabledReason,
  };
}
