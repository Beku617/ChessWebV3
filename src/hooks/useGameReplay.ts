import { useMemo } from "react";
import { GameHistory } from "../historyTypes";
import {
  MoveQuality,
  MoveRow,
  QualityCounts,
  AnalysisEntry,
  PlyState,
  CaptureTimeline,
} from "./useGameReplayTypes";
import { usePositionParser } from "./usePositionParser";
import { useCaptureTimeline } from "./useCaptureTimeline";
import { useMoveAnalysis } from "./useMoveAnalysis";
import { usePlaybackControls } from "./usePlaybackControls";
import { useKeyboardControls } from "./useKeyboardControls";
import { useEvaluation } from "./useEvaluation";
import { useDownloadPgn } from "./useDownloadPgn";
import { useOpeningExplorer } from "./useOpeningExplorer";
import { findOpeningByEco } from "../utils/openingExplorer";
import { useReplayMoveSounds } from "./useReplayMoveSounds";

export type {
  MoveQuality,
  MoveRow,
  QualityCounts,
  AnalysisEntry,
  PlyState,
  CaptureTimeline,
};

export function useGameReplay(game: GameHistory) {
  // Parse moves and build positions
  const { positions, plies, moveRows, totalPlies } = usePositionParser(game);

  const sanMoves = useMemo(() => {
    if (game.moves && game.moves.length > 0) return game.moves;
    const fromRows: string[] = [];
    moveRows.forEach((row) => {
      if (row.white) fromRows.push(row.white);
      if (row.black) fromRows.push(row.black);
    });
    return fromRows;
  }, [game.moves, moveRows]);

  const { opening } = useOpeningExplorer(sanMoves, { enableRemote: true });

  // Fallback to stored ECO only if explorer fails
  const openingResolved = useMemo(() => {
    if (opening) return opening;
    if (game.eco) {
      const byEco = findOpeningByEco(game.eco);
      if (byEco) return byEco;
    }
    return null;
  }, [opening, game.eco]);

  // Track captured pieces
  const captureTimeline = useCaptureTimeline(plies);

  // Analysis and move quality
  const {
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
  } = useMoveAnalysis(game, positions, moveRows, totalPlies);

  // Playback controls
  const {
    ply,
    isPlaying,
    speed,
    orientation,
    atEnd,
    jumpTo,
    togglePlay,
    setSpeed,
    flipBoard,
  } = usePlaybackControls(game, totalPlies);

  // Keyboard controls
  useKeyboardControls(ply, totalPlies, jumpTo, togglePlay, flipBoard);
  useReplayMoveSounds(ply, plies, game.playAs);

  // Evaluation
  const { evalPercent, evalLabel } = useEvaluation(analysis, ply);

  // Download PGN action
  const downloadPgn = useDownloadPgn(game);

  // Computed values
  const current = plies[ply - 1];
  const currentFen = positions[ply] || positions[0];
  const lastMove =
    current?.from && current?.to
      ? { from: current.from, to: current.to }
      : null;
  const currentMoveSan = current?.moveSAN || "Start";
  const isCheck = current?.isCheck || false;
  const isCheckmate = current?.isCheckmate || false;
  const isStalemate = current?.isStalemate || false;
  const captureIndex = Math.min(ply, captureTimeline.white.length - 1);
  const capturedByWhite = captureTimeline.white[captureIndex] || [];
  const capturedByBlack = captureTimeline.black[captureIndex] || [];

  return {
    // State
    ply,
    totalPlies,
    isPlaying,
    speed,
    orientation,
    atEnd,

    // Position data
    currentFen,
    positions, // All FEN positions for UCI to SAN conversion
    lastMove,
    currentMoveSan,
    isCheck,
    isCheckmate,
    isStalemate,

    // Captured pieces
    capturedByWhite,
    capturedByBlack,

    // Move list
    moveRows: moveRowsWithQuality,
    moveRowsWithQuality,
    moveQualities,
    qualityCounts,
    accuracy,
    sanMoves,
    analysisSeries,
    analysisByPly,
    opening: openingResolved,

    // Analysis state
    isAnalyzing,
    analysisProgress,
    analysisDisabledReason,

    // Evaluation
    evalPercent,
    evalLabel,

    // Actions
    jumpTo,
    togglePlay,
    setSpeed,
    flipBoard,
    downloadPgn,
  };
}
