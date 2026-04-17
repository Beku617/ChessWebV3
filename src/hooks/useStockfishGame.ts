import { useState, useEffect, useCallback, useRef } from "react";
import { Chess, Square } from "chess.js";
import { usePreMove } from "../chess/usePreMove";
import { GameSettings } from "../components/game";
import {
  API_URL,
  OptionSquares,
  defaultGameSettings,
} from "./useStockfishGameTypes";
import type { GameHistoryPayload } from "./useStockfishGameTypes";
import { useStockfishEngine } from "./useStockfishEngine";
import { useMoveOptions } from "./useMoveOptions";
import { useSaveGameHistory } from "./useSaveGameHistory";
import { useEngineMoves } from "./useEngineMoves";
import { useGameStateChecker } from "./useGameStateChecker";
import { useGameHistorySaver } from "./useGameHistorySaver";
import type { HistoryPersistenceStatus } from "./gameHistorySaver/historyPersistence";
import { useSquareClickHandler } from "./useSquareClickHandler";
import { useGameActions } from "./useGameActions";
import { useOpeningExplorer } from "./useOpeningExplorer";
import { playChessMoveSound } from "../utils/moveSounds";

export type { GameHistoryPayload };

export function useStockfishGame() {
  const [game, setGame] = useState(() => new Chess());
  const gameRef = useRef<Chess>(game);
  const [moveFrom, setMoveFrom] = useState<Square | null>(null);
  const [optionSquares, setOptionSquares] = useState<OptionSquares>({});
  const [moves, setMoves] = useState<string[]>([]);

  const [gameSettings, setGameSettings] =
    useState<GameSettings>(defaultGameSettings);

  const { preMove, preMoveSquares, setPreMove, clearPreMove, getPreMove } =
    usePreMove();

  const [gameStarted, setGameStarted] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(true);
  const [showGameOverModal, setShowGameOverModal] = useState(false);
  const [gameResult, setGameResult] = useState<string | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(
    null,
  );
  const [playerTime, setPlayerTime] = useState(300);
  const [opponentTime, setOpponentTime] = useState(300);
  const [savedGameId, setSavedGameId] = useState<string | null>(null);
  const [historyPersistenceStatus, setHistoryPersistenceStatus] =
    useState<HistoryPersistenceStatus>("idle");
  const [clockSessionId, setClockSessionId] = useState(0);

  const historySavedRef = useRef(false);
  const startTimeRef = useRef<number | null>(null);

  const playerColor = gameSettings.playAs === "white" ? "w" : "b";
  const isPlayerTurn = game.turn() === playerColor;

  // Initialize Stockfish engine with bot personality if selected
  const engineRef = useStockfishEngine(
    gameSettings.difficulty,
    gameSettings.selectedBot,
  );

  // Opening recognition (local book + optional Lichess explorer)
  const { opening, isLoading: openingLoading } = useOpeningExplorer(moves, {
    enableRemote: true,
  });

  // Get move options for a square
  const getMoveOptions = useMoveOptions(gameRef, setOptionSquares);

  // Save game history to backend
  const saveGameHistory = useSaveGameHistory();

  const fetchLatestSavedGameId = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/history?limit=1`, {
        credentials: "include",
      });
      if (!res.ok) return null;
      const data = await res.json();
      const latest = Array.isArray(data.games) ? data.games[0] : null;
      if (!latest?._id) return null;

      const startedAt = startTimeRef.current;
      if (startedAt && latest.createdAt) {
        const createdAtMs = Date.parse(latest.createdAt);
        if (!Number.isNaN(createdAtMs)) {
          const delta = Math.abs(createdAtMs - startedAt);
          // Only accept if it matches the current session (within 10 minutes)
          if (delta > 10 * 60 * 1000) return null;
        }
      }

      return latest._id as string;
    } catch {
      return null;
    }
  }, []);

  // Try to apply premove
  const tryApplyPreMove = useCallback(() => {
    const queued = getPreMove();
    if (!queued) return;

    const currentGame = gameRef.current;
    if (currentGame.turn() !== playerColor) return;

    try {
      const move = currentGame.move({
        from: queued.from as Square,
        to: queued.to as Square,
        promotion: (queued.promotion as any) || "q",
      });
      if (move) {
        gameRef.current = currentGame;
        setGame(new Chess(currentGame.fen()));
        setMoves(currentGame.history());
        playChessMoveSound(move);
        setLastMove({ from: queued.from as Square, to: queued.to as Square });
      }
    } catch {
      // invalid premove in new position; just drop it
    }
    clearPreMove();
  }, [clearPreMove, getPreMove, playerColor]);

  // Engine moves
  const { isEngineThinking, makeEngineMove, handleEngineMessage } =
    useEngineMoves(
      engineRef,
      gameRef,
      playerColor,
      gameSettings.difficulty,
      gameOver,
      setGame,
      setMoves,
      setLastMove,
      tryApplyPreMove,
    );

  // Single Stockfish listener
  useEffect(() => {
    if (!engineRef.current) return;
    engineRef.current.onMessage(handleEngineMessage);
  }, [engineRef, handleEngineMessage]);

  // Check game state and trigger engine
  useGameStateChecker(
    game,
    gameRef,
    gameStarted,
    playerColor,
    isEngineThinking,
    makeEngineMove,
    setGameResult,
    setGameOver,
    setShowGameOverModal,
  );

  // If playing as black, engine moves first
  useEffect(() => {
    if (
      gameStarted &&
      gameSettings.playAs === "black" &&
      game.history().length === 0
    ) {
      const timer = setTimeout(() => makeEngineMove(), 500);
      return () => clearTimeout(timer);
    }
  }, [gameStarted, gameSettings.playAs, game, makeEngineMove]);

  // Fallback trigger: if turn flips and a premove is queued, execute immediately.
  useEffect(() => {
    if (!gameStarted || gameOver || !isPlayerTurn || !preMove) return;
    const timer = setTimeout(() => {
      tryApplyPreMove();
    }, 0);
    return () => clearTimeout(timer);
  }, [gameStarted, gameOver, isPlayerTurn, preMove, tryApplyPreMove]);

  // Save history once when game ends
  useGameHistorySaver(
    gameOver,
    gameResult,
    gameSettings,
    gameRef,
    game,
    startTimeRef,
    historySavedRef,
    saveGameHistory,
    setSavedGameId,
    setHistoryPersistenceStatus,
    fetchLatestSavedGameId,
  );

  // Square click handler
  const {
    onSquareClick,
    onPieceDrop,
    onCancelSelection: baseOnCancelSelection,
    isDraggablePiece,
    promotionState,
    onPromotionPieceSelect,
  } = useSquareClickHandler(
    gameRef,
    gameStarted,
    gameOver,
    playerColor,
    moveFrom,
    setMoveFrom,
    setOptionSquares,
    setGame,
    setMoves,
    getMoveOptions,
    setPreMove,
    clearPreMove,
    setLastMove,
  );

  // Game actions
  const {
    handleStartGame: baseHandleStartGame,
    handleNewGame: baseHandleNewGame,
    handleResign: baseHandleResign,
    handleTimeOut: baseHandleTimeOut,
  } =
    useGameActions(
      gameRef,
      setGame,
      setMoves,
      setMoveFrom,
      setOptionSquares,
      setGameSettings,
      setShowSetupModal,
      setShowGameOverModal,
      setGameStarted,
      setGameOver,
      setGameResult,
      setPlayerTime,
      setOpponentTime,
      setSavedGameId,
      isEngineThinking,
      historySavedRef,
      startTimeRef,
      setLastMove,
    );

  const handleStartGame = useCallback(
    (settings: GameSettings) => {
      clearPreMove();
      setHistoryPersistenceStatus("idle");
      setClockSessionId((prev) => prev + 1);
      baseHandleStartGame(settings);
    },
    [
      baseHandleStartGame,
      clearPreMove,
      setClockSessionId,
      setHistoryPersistenceStatus,
    ],
  );

  const handleNewGame = useCallback(() => {
    clearPreMove();
    setHistoryPersistenceStatus("idle");
    baseHandleNewGame();
  }, [baseHandleNewGame, clearPreMove, setHistoryPersistenceStatus]);

  const handleResign = useCallback(() => {
    clearPreMove();
    baseHandleResign();
  }, [baseHandleResign, clearPreMove]);

  const handleTimeOut = useCallback(
    (isPlayer: boolean) => {
      clearPreMove();
      baseHandleTimeOut(isPlayer);
    },
    [baseHandleTimeOut, clearPreMove],
  );

  const onCancelSelection = useCallback(() => {
    if (moveFrom) {
      baseOnCancelSelection();
      return;
    }
    clearPreMove();
  }, [baseOnCancelSelection, clearPreMove, moveFrom]);

  return {
    // Game state
    game,
    moves,
    gameSettings,
    gameStarted,
    gameOver,
    gameResult,
    isPlayerTurn,
    playerColor,
    savedGameId,
    historyPersistenceStatus,
    lastMove,

    // UI state
    showSetupModal,
    showGameOverModal,
    clockSessionId,
    optionSquares,
    preMoveSquares,
    playerTime,
    opponentTime,
    setPlayerTime,
    setOpponentTime,
    opening,
    openingLoading,

    // Handlers
    onSquareClick,
    onPieceDrop,
    onCancelSelection,
    isDraggablePiece,
    promotionState,
    onPromotionPieceSelect,
    handleStartGame,
    handleNewGame,
    handleResign,
    handleTimeOut,
  };
}
