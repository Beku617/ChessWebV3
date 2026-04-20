import { useCallback, useEffect, useRef, useState } from "react";
import { Chess, Square } from "chess.js";
import type { GameSettings, PromotionState } from "../components/game";
import { defaultGameSettings, OptionSquares } from "./useStockfishGameTypes";
import { useMoveOptions } from "./useMoveOptions";
import { useSaveGameHistory } from "./useSaveGameHistory";
import { buildFullPgn, buildSanMoveText } from "./gameHistorySaver/buildPgn";
import {
  formatDate,
  formatTime,
  formatTimeControl,
} from "./gameHistorySaver/utils";
import {
  canPersistHistoryByMoveCount,
  HistoryPersistenceStatus,
} from "./gameHistorySaver/historyPersistence";
import { detectOpeningFromSan } from "../utils/openingExplorer";
import { useAuthStore } from "../store/authStore";
import { playChessMoveSound, playGameplaySound } from "../utils/moveSounds";
import {
  FriendGameStartedPayload,
  useFriendChallengeStore,
} from "../store/friendChallengeStore";
import { formatPerspectiveResult } from "./onlineGameShared";
import {
  getRatingPoolForMatch,
  getUserRatingForPool,
} from "../utils/ratingPool";

type PlayerColor = "w" | "b";
type MatchVariant = "standard" | "chess960" | "threeCheck" | "kingOfHill";
type GameOverReason =
  | "checkmate"
  | "draw"
  | "resign"
  | "timeout"
  | "opponent_left"
  | "aborted"
  | "three_check"
  | "king_of_the_hill";
const BOARD_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

function normalizeMatchVariant(value: unknown): MatchVariant {
  if (typeof value !== "string") return "standard";
  const normalized = value.trim().toLowerCase();
  if (normalized === "chess960") return "chess960";
  if (
    normalized === "kingofhill" ||
    normalized === "king-of-hill" ||
    normalized === "king_of_hill"
  ) {
    return "kingOfHill";
  }
  if (
    normalized === "threecheck" ||
    normalized === "three-check" ||
    normalized === "three_check"
  ) {
    return "threeCheck";
  }
  return "standard";
}

interface MoveAppliedPayload {
  gameId: string;
  move: { from: Square; to: Square; san: string };
  fen: string;
  turn: PlayerColor;
  isChess960Castle?: boolean;
  isCheckmate?: boolean;
  isDraw?: boolean;
  isStalemate?: boolean;
  whiteCheckCount?: number;
  blackCheckCount?: number;
  checkAwarded?: PlayerColor | null;
}

interface GameOverPayload {
  gameId: string;
  reason: GameOverReason;
  winner: PlayerColor | null;
  whiteCheckCount?: number;
  blackCheckCount?: number;
  elo?: {
    rated: boolean;
    applied: boolean;
    pool?:
      | "bullet"
      | "blitz"
      | "rapid"
      | "classical"
      | "chess960Bullet"
      | "chess960Blitz"
      | "chess960Rapid"
      | "chess960Classical";
    skippedReason?: string;
    white?: {
      userId: string;
      oldRating: number;
      newRating: number;
      delta: number;
      oldRd?: number;
      newRd?: number;
      oldVolatility?: number;
      newVolatility?: number;
      gamesPlayed: number;
      gamesWon: number;
      poolGamesPlayed?: number;
      isProvisional?: boolean;
      wasProvisional?: boolean;
    };
    black?: {
      userId: string;
      oldRating: number;
      newRating: number;
      delta: number;
      oldRd?: number;
      newRd?: number;
      oldVolatility?: number;
      newVolatility?: number;
      gamesPlayed: number;
      gamesWon: number;
      poolGamesPlayed?: number;
      isProvisional?: boolean;
      wasProvisional?: boolean;
    };
  };
}

interface GameSystemMessagePayload {
  gameId: string;
  message?: string;
  targetColor?: PlayerColor | null;
}

function toFiniteRating(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function normalizeThreeCheckCounts(payload?: {
  whiteCheckCount?: unknown;
  blackCheckCount?: unknown;
}) {
  const whiteCheckCount = Number(payload?.whiteCheckCount);
  const blackCheckCount = Number(payload?.blackCheckCount);
  return {
    whiteCheckCount:
      Number.isFinite(whiteCheckCount) && whiteCheckCount >= 0
        ? Math.floor(whiteCheckCount)
        : 0,
    blackCheckCount:
      Number.isFinite(blackCheckCount) && blackCheckCount >= 0
        ? Math.floor(blackCheckCount)
        : 0,
  };
}

interface PreMove {
  from: Square;
  to: Square;
  promotion?: string;
}

const PREMOVE_SOURCE_STYLE = {};

function buildPreMoveSquares(preMove: PreMove | null): OptionSquares {
  if (!preMove) return {};
  return {
    [preMove.from]: { backgroundColor: "rgba(249, 115, 22, 0.4)" },
    [preMove.to]: { backgroundColor: "rgba(244, 63, 94, 0.36)" },
  };
}

function isPromotionTargetSquare(color: PlayerColor, targetSquare: Square) {
  return (
    (color === "w" && targetSquare[1] === "8") ||
    (color === "b" && targetSquare[1] === "1")
  );
}

function isChess960CastlingDropForColor(
  currentGame: Chess,
  sourceSquare: Square,
  targetSquare: Square,
  color: PlayerColor,
  variant: MatchVariant,
) {
  if (variant !== "chess960") return false;

  const kingPiece = currentGame.get(sourceSquare);
  if (!kingPiece || kingPiece.color !== color || kingPiece.type !== "k") {
    return false;
  }

  if (sourceSquare[1] !== targetSquare[1]) return false;

  const targetPiece = currentGame.get(targetSquare);
  return (
    !!targetPiece && targetPiece.color === color && targetPiece.type === "r"
  );
}

export function useFriendOnlineGame() {
  const { user, setUser } = useAuthStore();
  const userRef = useRef(user);
  const socket = useFriendChallengeStore((state) => state.socket);
  const activeGame = useFriendChallengeStore((state) => state.activeGame);
  const clearActiveGame = useFriendChallengeStore(
    (state) => state.clearActiveGame,
  );
  const isConnected = useFriendChallengeStore((state) => state.isConnected);

  const [game, setGame] = useState(() => new Chess());
  const gameRef = useRef(game);
  const [moves, setMoves] = useState<string[]>([]);
  const movesRef = useRef<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(
    null,
  );
  const [gameSettings, setGameSettings] =
    useState<GameSettings>(defaultGameSettings);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [gameResult, setGameResult] = useState<string | null>(null);
  const [showGameOverModal, setShowGameOverModal] = useState(false);
  const [savedGameId, setSavedGameId] = useState<string | null>(null);
  const [historyPersistenceStatus, setHistoryPersistenceStatus] =
    useState<HistoryPersistenceStatus>("idle");
  const [playerColor, setPlayerColor] = useState<PlayerColor>("w");
  const [currentTurn, setCurrentTurn] = useState<PlayerColor>("w");
  const [gameId, setGameId] = useState<string | null>(null);
  const [opponentName, setOpponentName] = useState("Friend");
  const [opponentUserId, setOpponentUserId] = useState<string | null>(null);
  const [playerRating, setPlayerRating] = useState<number | null>(null);
  const [opponentRating, setOpponentRating] = useState<number | null>(null);
  const [gameType, setGameType] = useState("standard");
  const [matchVariant, setMatchVariant] = useState<MatchVariant>("standard");
  const [isRated, setIsRated] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [moveFrom, setMoveFrom] = useState<Square | null>(null);
  const [optionSquares, setOptionSquares] = useState<OptionSquares>({});
  const [pendingPreMove, setPendingPreMove] = useState<PreMove | null>(null);
  const [playerTime, setPlayerTime] = useState(
    defaultGameSettings.timeControl.initial,
  );
  const [opponentTime, setOpponentTime] = useState(
    defaultGameSettings.timeControl.initial,
  );
  const [threeCheckState, setThreeCheckState] = useState(() =>
    normalizeThreeCheckCounts(),
  );

  const gameIdRef = useRef<string | null>(null);
  const playerColorRef = useRef<PlayerColor>("w");
  const currentTurnRef = useRef<PlayerColor>("w");
  const matchVariantRef = useRef<MatchVariant>("standard");
  const pendingPreMoveRef = useRef<PreMove | null>(null);
  const playerNameRef = useRef<string>("Player");
  const startTimeRef = useRef<number | null>(null);
  const startingFenRef = useRef<string>("");
  const historySavedRef = useRef(false);
  const [lastGameOver, setLastGameOver] = useState<GameOverPayload | null>(
    null,
  );
  const saveGameHistory = useSaveGameHistory();

  const getMoveOptions = useMoveOptions(gameRef, setOptionSquares);
  const isPlayerTurn = currentTurn === playerColor;
  const preMoveSquares = buildPreMoveSquares(pendingPreMove);

  const resetStoredMoves = useCallback(() => {
    movesRef.current = [];
    setMoves([]);
  }, []);

  const appendStoredMove = useCallback((san?: string) => {
    const normalized = typeof san === "string" ? san.trim() : "";
    if (!normalized) return;
    const nextMoves = [...movesRef.current, normalized];
    movesRef.current = nextMoves;
    setMoves(nextMoves);
  }, []);

  const clearPreMove = useCallback(() => {
    pendingPreMoveRef.current = null;
    setPendingPreMove(null);
  }, []);

  const queuePreMove = useCallback((preMove: PreMove) => {
    pendingPreMoveRef.current = preMove;
    setPendingPreMove(preMove);
    setMoveFrom(null);
    setOptionSquares({});
    playGameplaySound("premove");
  }, []);

  const selectPreMoveSource = useCallback((sourceSquare: Square) => {
    setMoveFrom(sourceSquare);
    setOptionSquares({
      [sourceSquare]: PREMOVE_SOURCE_STYLE,
    });
  }, []);

  const trySubmitQueuedPreMove = useCallback(() => {
    const queuedPreMove = pendingPreMoveRef.current;
    if (!queuedPreMove) return false;
    if (!socket || !gameIdRef.current) return false;

    const currentGame = gameRef.current;
    if (currentTurnRef.current !== playerColorRef.current) return false;

    const validationGame = new Chess(currentGame.fen());
    const isChess960Castle = isChess960CastlingDropForColor(
      validationGame,
      queuedPreMove.from,
      queuedPreMove.to,
      playerColorRef.current,
      matchVariantRef.current,
    );
    const preview =
      !isChess960Castle &&
      validationGame.move({
        from: queuedPreMove.from,
        to: queuedPreMove.to,
        promotion: queuedPreMove.promotion || "q",
      });

    pendingPreMoveRef.current = null;
    setPendingPreMove(null);

    if (!isChess960Castle && !preview) return false;

    socket.emit("makeMove", {
      gameId: gameIdRef.current,
      from: queuedPreMove.from,
      to: queuedPreMove.to,
      promotion: queuedPreMove.promotion || "q",
    });
    return true;
  }, [socket]);

  useEffect(() => {
    playerNameRef.current = user?.fullName || "Player";
  }, [user?.fullName]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    matchVariantRef.current = matchVariant;
  }, [matchVariant]);

  useEffect(() => {
    pendingPreMoveRef.current = pendingPreMove;
  }, [pendingPreMove]);

  const formatResult = (payload: GameOverPayload) => {
    return formatPerspectiveResult(
      payload,
      playerColorRef.current,
      gameRef.current,
    );
  };

  const resetGameState = useCallback(() => {
    const nextGame = new Chess();
    gameRef.current = nextGame;
    setGame(nextGame);
    resetStoredMoves();
    setLastMove(null);
    setGameStarted(false);
    setGameOver(false);
    setGameResult(null);
    setShowGameOverModal(false);
    setMoveFrom(null);
    setOptionSquares({});
    setShowPromotionDialog(false);
    setPromotionToSquare(null);
    setPendingPromoFrom(null);
    setPendingPreMove(null);
    pendingPreMoveRef.current = null;
    setCurrentTurn("w");
    currentTurnRef.current = "w";
    setGameId(null);
    setSavedGameId(null);
    setHistoryPersistenceStatus("idle");
    gameIdRef.current = null;
    setOpponentName("Friend");
    setOpponentUserId(null);
    setPlayerRating(null);
    setOpponentRating(null);
    setGameType("standard");
    setMatchVariant("standard");
    matchVariantRef.current = "standard";
    setIsRated(false);
    setPlayerColor("w");
    playerColorRef.current = "w";
    setStatusMessage(null);
    startTimeRef.current = null;
    startingFenRef.current = "";
    historySavedRef.current = false;
    setLastGameOver(null);
    setThreeCheckState(normalizeThreeCheckCounts());
  }, [resetStoredMoves]);

  const applyFriendGameStart = useCallback(
    (payload: FriendGameStartedPayload) => {
      if (payload.gameId === gameIdRef.current && gameStarted) return;

      const nextGame = new Chess(payload.fen);
      gameRef.current = nextGame;
      setGame(nextGame);
      const startingTurn = nextGame.turn() as PlayerColor;
      currentTurnRef.current = startingTurn;
      setCurrentTurn(startingTurn);
      startingFenRef.current = payload.fen || nextGame.fen();
      resetStoredMoves();
      setLastMove(null);
      setMoveFrom(null);
      setOptionSquares({});
      setShowPromotionDialog(false);
      setPromotionToSquare(null);
      setPendingPromoFrom(null);
      setGameId(payload.gameId);
      gameIdRef.current = payload.gameId;
      setPendingPreMove(null);
      pendingPreMoveRef.current = null;
      setPlayerColor(payload.color);
      playerColorRef.current = payload.color;
      setOpponentUserId(
        payload.opponentUserId ? String(payload.opponentUserId) : null,
      );
      setOpponentName(payload.opponentName || "Friend");
      const normalizedVariant = normalizeMatchVariant(
        payload.variant ?? payload.gameType,
      );
      const timeControl =
        payload.timeControl || defaultGameSettings.timeControl;
      const ratingPool = getRatingPoolForMatch(timeControl, normalizedVariant);
      const canShowRatedInfo = payload.rated === true && ratingPool !== null;
      const fallbackPlayerRating = getUserRatingForPool(
        userRef.current,
        ratingPool,
      );
      setPlayerRating(
        canShowRatedInfo
          ? toFiniteRating(payload.playerRating) ?? fallbackPlayerRating
          : null,
      );
      setOpponentRating(
        canShowRatedInfo ? toFiniteRating(payload.opponentRating) : null,
      );
      setMatchVariant(normalizedVariant);
      matchVariantRef.current = normalizedVariant;
      setGameType(normalizedVariant);
      setIsRated(payload.rated === true);
      setGameStarted(true);
      setGameOver(false);
      setGameResult(null);
      setShowGameOverModal(false);
      setStatusMessage(null);
      setSavedGameId(null);
      setHistoryPersistenceStatus("idle");
      historySavedRef.current = false;
      startTimeRef.current = Date.now();
      setLastGameOver(null);
      setThreeCheckState(normalizeThreeCheckCounts(payload));
      playGameplaySound("gameStart");

      setGameSettings({
        ...defaultGameSettings,
        playAs: payload.color === "w" ? "white" : "black",
        difficulty: 0,
        timeControl,
      });
      setPlayerTime(timeControl.initial);
      setOpponentTime(timeControl.initial);
    },
    [gameStarted, resetStoredMoves],
  );

  useEffect(() => {
    if (!activeGame) return;
    applyFriendGameStart(activeGame);
    clearActiveGame();
  }, [activeGame, applyFriendGameStart, clearActiveGame]);

  useEffect(() => {
    if (!socket) return;

    const handleFriendGameStarted = (payload: FriendGameStartedPayload) => {
      applyFriendGameStart(payload);
      clearActiveGame();
    };

    const handleMoveApplied = (payload: MoveAppliedPayload) => {
      if (payload.gameId !== gameIdRef.current) return;
      const isOpponentMove = payload.turn === playerColorRef.current;

      if (payload.isChess960Castle) {
        const nextGame = new Chess(payload.fen);
        gameRef.current = nextGame;
        setGame(nextGame);
        appendStoredMove(payload.move.san);
        if (isOpponentMove) {
          playChessMoveSound(
            { ...payload.move, castlingSide: "k" },
            { isOpponentMove: true },
          );
        }
      } else {
        const currentGame = gameRef.current;
        const applied = currentGame.move({
          from: payload.move.from,
          to: payload.move.to,
          promotion: (payload.move as { promotion?: string }).promotion || "q",
        });

        if (applied) {
          gameRef.current = currentGame;
          setGame(new Chess(currentGame.fen()));
          appendStoredMove(payload.move.san || applied.san);
          if (isOpponentMove) {
            playChessMoveSound(applied, { isOpponentMove: true });
          }
        } else {
          const nextGame = new Chess(payload.fen);
          gameRef.current = nextGame;
          setGame(nextGame);
          appendStoredMove(payload.move.san);
          if (isOpponentMove) {
            playChessMoveSound(payload.move, { isOpponentMove: true });
          }
        }
      }

      if (matchVariantRef.current === "threeCheck") {
        setThreeCheckState((previous) => {
          const hasExplicitCounts =
            payload.whiteCheckCount !== undefined &&
            payload.blackCheckCount !== undefined;

          if (hasExplicitCounts) {
            return normalizeThreeCheckCounts(payload);
          }
          if (payload.checkAwarded === "w") {
            return {
              ...previous,
              whiteCheckCount: previous.whiteCheckCount + 1,
            };
          }
          if (payload.checkAwarded === "b") {
            return {
              ...previous,
              blackCheckCount: previous.blackCheckCount + 1,
            };
          }
          return previous;
        });
      }

      setLastMove({ from: payload.move.from, to: payload.move.to });
      currentTurnRef.current = payload.turn;
      setCurrentTurn(payload.turn);
      setMoveFrom(null);
      setOptionSquares({});
      setShowPromotionDialog(false);
      setPromotionToSquare(null);
      setPendingPromoFrom(null);

      // Opponent just moved and it may now be our turn.
      trySubmitQueuedPreMove();
    };

    const handleMoveRejected = (payload: { reason?: string }) => {
      setStatusMessage(payload?.reason || "Move rejected.");
      playGameplaySound("illegal");
      const turn = gameRef.current.turn() as PlayerColor;
      currentTurnRef.current = turn;
      setCurrentTurn(turn);
    };

    const handleGameOver = (payload: GameOverPayload) => {
      if (payload.gameId !== gameIdRef.current) return;
      setGameOver(true);
      setShowGameOverModal(true);
      setGameResult(formatResult(payload));
      setLastGameOver(payload);
      setShowPromotionDialog(false);
      setPromotionToSquare(null);
      setPendingPromoFrom(null);
      setPendingPreMove(null);
      pendingPreMoveRef.current = null;
      if (
        matchVariantRef.current === "threeCheck" &&
        (payload.whiteCheckCount !== undefined ||
          payload.blackCheckCount !== undefined)
      ) {
        setThreeCheckState(normalizeThreeCheckCounts(payload));
      }
      playGameplaySound("gameEnd");

      const currentUser = userRef.current;
      if (!currentUser?.id || !payload.elo?.applied) return;

      const currentUserId = String(currentUser.id);
      const sideUpdate =
        payload.elo.white?.userId === currentUserId
          ? payload.elo.white
          : payload.elo.black?.userId === currentUserId
            ? payload.elo.black
            : playerColorRef.current === "w"
              ? payload.elo.white
              : payload.elo.black;

      if (!sideUpdate) return;
      const pool = payload.elo.pool;
      const isStandardPool =
        pool === "bullet" ||
        pool === "blitz" ||
        pool === "rapid" ||
        pool === "classical";
      const nextUser = {
        ...currentUser,
        gamesPlayed: sideUpdate.gamesPlayed,
        gamesWon: sideUpdate.gamesWon,
      };
      if (isStandardPool) {
        nextUser.rating = sideUpdate.newRating;
      }
      if (pool === "bullet")
        nextUser.bulletRating = sideUpdate.newRating;
      if (pool === "bullet") {
        nextUser.bulletGames = sideUpdate.poolGamesPlayed;
        nextUser.bulletRd = sideUpdate.newRd;
        nextUser.bulletVolatility = sideUpdate.newVolatility;
      }
      if (pool === "blitz")
        nextUser.blitzRating = sideUpdate.newRating;
      if (pool === "blitz") {
        nextUser.blitzGames = sideUpdate.poolGamesPlayed;
        nextUser.blitzRd = sideUpdate.newRd;
        nextUser.blitzVolatility = sideUpdate.newVolatility;
      }
      if (pool === "rapid")
        nextUser.rapidRating = sideUpdate.newRating;
      if (pool === "rapid") {
        nextUser.rapidGames = sideUpdate.poolGamesPlayed;
        nextUser.rapidRd = sideUpdate.newRd;
        nextUser.rapidVolatility = sideUpdate.newVolatility;
      }
      if (pool === "classical") {
        nextUser.classicalRating = sideUpdate.newRating;
        nextUser.classicalGames = sideUpdate.poolGamesPlayed;
        nextUser.classicalRd = sideUpdate.newRd;
        nextUser.classicalVolatility = sideUpdate.newVolatility;
      }
      if (pool === "chess960Bullet") {
        nextUser.chess960BulletRating = sideUpdate.newRating;
        nextUser.chess960BulletGames = sideUpdate.poolGamesPlayed;
        nextUser.chess960BulletRd = sideUpdate.newRd;
        nextUser.chess960BulletVolatility = sideUpdate.newVolatility;
      }
      if (pool === "chess960Blitz") {
        nextUser.chess960BlitzRating = sideUpdate.newRating;
        nextUser.chess960BlitzGames = sideUpdate.poolGamesPlayed;
        nextUser.chess960BlitzRd = sideUpdate.newRd;
        nextUser.chess960BlitzVolatility = sideUpdate.newVolatility;
      }
      if (pool === "chess960Rapid") {
        nextUser.chess960RapidRating = sideUpdate.newRating;
        nextUser.chess960RapidGames = sideUpdate.poolGamesPlayed;
        nextUser.chess960RapidRd = sideUpdate.newRd;
        nextUser.chess960RapidVolatility = sideUpdate.newVolatility;
      }
      if (pool === "chess960Classical") {
        nextUser.chess960ClassicalRating = sideUpdate.newRating;
        nextUser.chess960ClassicalGames = sideUpdate.poolGamesPlayed;
        nextUser.chess960ClassicalRd = sideUpdate.newRd;
        nextUser.chess960ClassicalVolatility = sideUpdate.newVolatility;
      }
      setUser(nextUser);
    };

    const handleGameSystemMessage = (payload: GameSystemMessagePayload) => {
      if (payload.gameId !== gameIdRef.current) return;
      if (
        payload.targetColor &&
        payload.targetColor !== playerColorRef.current
      ) {
        return;
      }
      if (payload.message) {
        setStatusMessage(payload.message);
      }
    };

    socket.on("friendGameStarted", handleFriendGameStarted);
    socket.on("moveApplied", handleMoveApplied);
    socket.on("moveRejected", handleMoveRejected);
    socket.on("gameOver", handleGameOver);
    socket.on("gameSystemMessage", handleGameSystemMessage);

    return () => {
      socket.off("friendGameStarted", handleFriendGameStarted);
      socket.off("moveApplied", handleMoveApplied);
      socket.off("moveRejected", handleMoveRejected);
      socket.off("gameOver", handleGameOver);
      socket.off("gameSystemMessage", handleGameSystemMessage);
    };
  }, [
    socket,
    applyFriendGameStart,
    appendStoredMove,
    clearActiveGame,
    setUser,
    trySubmitQueuedPreMove,
  ]);

  // Fallback for tight timing races: submit queued premove as soon as our turn starts.
  useEffect(() => {
    if (!gameStarted || gameOver || !isPlayerTurn || !pendingPreMove) return;
    trySubmitQueuedPreMove();
  }, [
    game,
    gameOver,
    gameStarted,
    isPlayerTurn,
    pendingPreMove,
    trySubmitQueuedPreMove,
  ]);

  useEffect(() => {
    if (!gameOver || !lastGameOver || historySavedRef.current) return;
    historySavedRef.current = true;

    const currentGame = gameRef.current;
    const now = new Date();
    const startDate = startTimeRef.current
      ? new Date(startTimeRef.current)
      : now;
    const durationMs = startTimeRef.current
      ? Date.now() - startTimeRef.current
      : undefined;
    const persistedMoves =
      movesRef.current.length > 0
        ? [...movesRef.current]
        : currentGame.history();
    const shouldPersistHistory = canPersistHistoryByMoveCount(
      persistedMoves.length,
    );

    if (!shouldPersistHistory) {
      setHistoryPersistenceStatus("skipped_short_game");
      return;
    }

    setHistoryPersistenceStatus("saving");

    const opening = detectOpeningFromSan(persistedMoves);
    const ecoCode = opening?.eco || "";
    const openingName = opening
      ? opening.variation
        ? `${opening.name}: ${opening.variation}`
        : opening.name
      : "";
    const openingSlug = openingName
      ? openingName.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "")
      : ecoCode
        ? `eco_${ecoCode}`
        : "";
    const ecoUrl =
      openingSlug.length > 0
        ? `https://lichess.org/opening/${openingSlug}`
        : "";

    const reasonMap: Record<GameOverReason, string> = {
      checkmate: "checkmate",
      resign: "resignation",
      timeout: "time forfeit",
      opponent_left: "opponent left",
      aborted: "aborted",
      three_check: "three checks",
      king_of_the_hill: "reaching the center",
      draw: "draw",
    };

    const isDraw =
      lastGameOver.reason === "draw" ||
      (!lastGameOver.winner && lastGameOver.reason !== "aborted");
    const pgnResult = isDraw
      ? "1/2-1/2"
      : lastGameOver.winner === "w"
        ? "1-0"
        : "0-1";
    const whiteThreeChecks = Math.max(
      0,
      Math.floor(Number(lastGameOver.whiteCheckCount || 0)),
    );
    const blackThreeChecks = Math.max(
      0,
      Math.floor(Number(lastGameOver.blackCheckCount || 0)),
    );
    const terminationText = isDraw
      ? `Game drawn by ${reasonMap[lastGameOver.reason] || "draw"}`
      : lastGameOver.reason === "three_check"
        ? `${lastGameOver.winner === "w" ? "White" : "Black"} wins by 3-check (White ${whiteThreeChecks}/3, Black ${blackThreeChecks}/3)`
        : lastGameOver.reason === "king_of_the_hill"
          ? `${lastGameOver.winner === "w" ? "White" : "Black"} wins by reaching the center`
        : `${lastGameOver.winner === "w" ? "White" : "Black"} won by ${
            reasonMap[lastGameOver.reason] || "checkmate"
          }`;

    const playerName = playerNameRef.current || user?.fullName || "Player";
    const opponent = opponentName || "Friend";
    const whitePreRating = Number(lastGameOver.elo?.white?.oldRating);
    const blackPreRating = Number(lastGameOver.elo?.black?.oldRating);
    const fallbackPlayerElo = user?.rating ?? 1200;
    const playerPreRating =
      playerColorRef.current === "w" ? whitePreRating : blackPreRating;
    const opponentPreRating =
      playerColorRef.current === "w" ? blackPreRating : whitePreRating;
    const whitePostRating = Number(lastGameOver.elo?.white?.newRating);
    const blackPostRating = Number(lastGameOver.elo?.black?.newRating);
    const playerPostRating =
      playerColorRef.current === "w" ? whitePostRating : blackPostRating;
    const opponentPostRating =
      playerColorRef.current === "w" ? blackPostRating : whitePostRating;
    const whitePreRd = Number(lastGameOver.elo?.white?.oldRd);
    const blackPreRd = Number(lastGameOver.elo?.black?.oldRd);
    const playerPreRd =
      playerColorRef.current === "w" ? whitePreRd : blackPreRd;
    const opponentPreRd =
      playerColorRef.current === "w" ? blackPreRd : whitePreRd;
    const whitePostRd = Number(lastGameOver.elo?.white?.newRd);
    const blackPostRd = Number(lastGameOver.elo?.black?.newRd);
    const playerPostRd =
      playerColorRef.current === "w" ? whitePostRd : blackPostRd;
    const opponentPostRd =
      playerColorRef.current === "w" ? blackPostRd : whitePostRd;
    const whitePreVolatility = Number(lastGameOver.elo?.white?.oldVolatility);
    const blackPreVolatility = Number(lastGameOver.elo?.black?.oldVolatility);
    const playerPreVolatility =
      playerColorRef.current === "w" ? whitePreVolatility : blackPreVolatility;
    const opponentPreVolatility =
      playerColorRef.current === "w" ? blackPreVolatility : whitePreVolatility;
    const whitePostVolatility = Number(lastGameOver.elo?.white?.newVolatility);
    const blackPostVolatility = Number(lastGameOver.elo?.black?.newVolatility);
    const playerPostVolatility =
      playerColorRef.current === "w"
        ? whitePostVolatility
        : blackPostVolatility;
    const opponentPostVolatility =
      playerColorRef.current === "w"
        ? blackPostVolatility
        : whitePostVolatility;
    const whiteDelta = Number(lastGameOver.elo?.white?.delta);
    const blackDelta = Number(lastGameOver.elo?.black?.delta);
    const whiteIsProvisional = lastGameOver.elo?.white?.isProvisional === true;
    const blackIsProvisional = lastGameOver.elo?.black?.isProvisional === true;
    const playerIsProvisional =
      playerColorRef.current === "w" ? whiteIsProvisional : blackIsProvisional;
    const opponentIsProvisional =
      playerColorRef.current === "w" ? blackIsProvisional : whiteIsProvisional;
    const playerDelta =
      playerColorRef.current === "w" ? whiteDelta : blackDelta;
    const opponentDelta =
      playerColorRef.current === "w" ? blackDelta : whiteDelta;
    const playerElo = Number.isFinite(playerPreRating)
      ? playerPreRating
      : fallbackPlayerElo;
    const opponentElo = Number.isFinite(opponentPreRating)
      ? opponentPreRating
      : 1200;
    const whiteName = playerColorRef.current === "w" ? playerName : opponent;
    const blackName = playerColorRef.current === "b" ? playerName : opponent;
    const whiteElo = playerColorRef.current === "w" ? playerElo : opponentElo;
    const blackElo = playerColorRef.current === "b" ? playerElo : opponentElo;
    const timeControlStr = formatTimeControl(gameSettings.timeControl);

    const fullPgn = buildFullPgn(currentGame, {
      startDate,
      endDate: now,
      whiteName,
      blackName,
      whiteElo,
      blackElo,
      pgnResult,
      terminationText,
      timeControlStr,
      ecoCode,
      ecoUrl,
      currentFen: currentGame.fen(),
      moves: persistedMoves,
    });

    saveGameHistory({
      event:
        matchVariant === "chess960"
          ? "Friend Challenge Chess960"
          : matchVariant === "threeCheck"
            ? "Friend Challenge Three-Check"
            : matchVariant === "kingOfHill"
              ? "Friend Challenge King of the Hill"
              : "Friend Challenge",
      variant: matchVariant,
      site: "NeonGambit",
      date: formatDate(startDate),
      round: "-",
      white: whiteName,
      black: blackName,
      result: pgnResult,
      currentPosition: currentGame.fen(),
      startingFen: startingFenRef.current || undefined,
      timeControl: timeControlStr,
      utcDate: formatDate(startDate),
      utcTime: formatTime(startDate),
      startTime: formatTime(startDate),
      endDate: formatDate(now),
      endTime: formatTime(now),
      whiteElo,
      blackElo,
      rated: isRated,
      ratingBefore: Number.isFinite(playerPreRating)
        ? playerPreRating
        : undefined,
      ratingAfter: Number.isFinite(playerPostRating)
        ? playerPostRating
        : undefined,
      ratingDelta: Number.isFinite(playerDelta) ? playerDelta : undefined,
      ratingDeviationBefore: Number.isFinite(playerPreRd)
        ? playerPreRd
        : undefined,
      ratingDeviationAfter: Number.isFinite(playerPostRd)
        ? playerPostRd
        : undefined,
      ratingDeviationDelta:
        Number.isFinite(playerPreRd) && Number.isFinite(playerPostRd)
          ? playerPostRd - playerPreRd
          : undefined,
      volatilityBefore: Number.isFinite(playerPreVolatility)
        ? playerPreVolatility
        : undefined,
      volatilityAfter: Number.isFinite(playerPostVolatility)
        ? playerPostVolatility
        : undefined,
      volatilityDelta:
        Number.isFinite(playerPreVolatility) &&
        Number.isFinite(playerPostVolatility)
          ? playerPostVolatility - playerPreVolatility
          : undefined,
      isProvisional: playerIsProvisional,
      opponentRatingBefore: Number.isFinite(opponentPreRating)
        ? opponentPreRating
        : undefined,
      opponentRatingAfter: Number.isFinite(opponentPostRating)
        ? opponentPostRating
        : undefined,
      opponentRatingDelta: Number.isFinite(opponentDelta)
        ? opponentDelta
        : undefined,
      opponentRatingDeviationBefore: Number.isFinite(opponentPreRd)
        ? opponentPreRd
        : undefined,
      opponentRatingDeviationAfter: Number.isFinite(opponentPostRd)
        ? opponentPostRd
        : undefined,
      opponentRatingDeviationDelta:
        Number.isFinite(opponentPreRd) && Number.isFinite(opponentPostRd)
          ? opponentPostRd - opponentPreRd
          : undefined,
      opponentVolatilityBefore: Number.isFinite(opponentPreVolatility)
        ? opponentPreVolatility
        : undefined,
      opponentVolatilityAfter: Number.isFinite(opponentPostVolatility)
        ? opponentPostVolatility
        : undefined,
      opponentVolatilityDelta:
        Number.isFinite(opponentPreVolatility) &&
        Number.isFinite(opponentPostVolatility)
          ? opponentPostVolatility - opponentPreVolatility
          : undefined,
      opponentIsProvisional,
      ratingPool: lastGameOver.elo?.pool,
      timezone: "UTC",
      eco: ecoCode,
      ecoUrl,
      termination: terminationText,
      moves: persistedMoves,
      moveText: buildSanMoveText(persistedMoves, pgnResult),
      pgn: fullPgn,
      playAs: gameSettings.playAs,
      opponent,
      durationMs,
      whiteCheckCount:
        matchVariant === "threeCheck" ? whiteThreeChecks : undefined,
      blackCheckCount:
        matchVariant === "threeCheck" ? blackThreeChecks : undefined,
    }).then((id) => {
      if (id) {
        setSavedGameId(id);
        setHistoryPersistenceStatus("saved");
        return;
      }
      setHistoryPersistenceStatus("failed");
    });
  }, [
    gameOver,
    lastGameOver,
    gameSettings.timeControl,
    gameSettings.playAs,
    opponentName,
    saveGameHistory,
    setHistoryPersistenceStatus,
    user?.fullName,
    user?.rating,
    isRated,
    matchVariant,
  ]);

  const clearSelection = useCallback(() => {
    setMoveFrom(null);
    setOptionSquares({});
  }, []);

  const addChess960CastlingTargets = useCallback(
    (currentGame: Chess, kingSquare: Square) => {
      if (matchVariant !== "chess960") return;

      const kingPiece = currentGame.get(kingSquare);
      if (
        !kingPiece ||
        kingPiece.color !== playerColor ||
        kingPiece.type !== "k"
      ) {
        return;
      }

      const rank = kingSquare[1];
      const extraSquares: OptionSquares = {};

      BOARD_FILES.forEach((file) => {
        const candidateSquare = `${file}${rank}` as Square;
        if (candidateSquare === kingSquare) return;
        const candidatePiece = currentGame.get(candidateSquare);
        if (
          candidatePiece &&
          candidatePiece.color === playerColor &&
          candidatePiece.type === "r"
        ) {
          extraSquares[candidateSquare] = {};
        }
      });

      if (Object.keys(extraSquares).length === 0) return;
      setOptionSquares((prev) => ({ ...prev, ...extraSquares }));
    },
    [matchVariant, playerColor],
  );

  const isChess960CastlingDrop = useCallback(
    (currentGame: Chess, sourceSquare: Square, targetSquare: Square) => {
      if (matchVariant !== "chess960") return false;

      const kingPiece = currentGame.get(sourceSquare);
      if (
        !kingPiece ||
        kingPiece.color !== playerColor ||
        kingPiece.type !== "k"
      ) {
        return false;
      }

      if (sourceSquare[1] !== targetSquare[1]) return false;

      const targetPiece = currentGame.get(targetSquare);
      return (
        !!targetPiece &&
        targetPiece.color === playerColor &&
        targetPiece.type === "r"
      );
    },
    [matchVariant, playerColor],
  );

  // ---------- promotion dialog state (click-to-move) ----------
  const [promotionToSquare, setPromotionToSquare] = useState<Square | null>(
    null,
  );
  const [showPromotionDialog, setShowPromotionDialog] = useState(false);
  const [pendingPromoFrom, setPendingPromoFrom] = useState<Square | null>(null);

  /** Extract promotion char from react-chessboard piece string ("wQ" → "q") */
  const extractPromo = (piece?: string): string => {
    if (!piece) return "q";
    const ch =
      piece.length === 2 ? piece[1].toLowerCase() : piece[0].toLowerCase();
    return ch === "q" || ch === "r" || ch === "b" || ch === "n" ? ch : "q";
  };

  const playLocalMoveSound = useCallback(
    (from: Square, to: Square, promotion?: string) => {
      const currentGame = gameRef.current;
      const legalMoves = currentGame.moves({ square: from, verbose: true });

      const exactMove =
        legalMoves.find((move) => {
          if (move.to !== to) return false;
          const movePromotion = (move as { promotion?: string }).promotion;
          return promotion ? movePromotion === promotion : true;
        }) || legalMoves.find((move) => move.to === to);

      if (exactMove) {
        playChessMoveSound(exactMove);
        return;
      }

      if (isChess960CastlingDrop(currentGame, from, to)) {
        playChessMoveSound({
          from,
          to,
          castlingSide: to[0] > from[0] ? "k" : "q",
        });
        return;
      }

      playChessMoveSound({ from, to });
    },
    [isChess960CastlingDrop],
  );

  const onPromotionPieceSelect = useCallback(
    (piece?: string, _fromSquare?: Square, _toSquare?: Square) => {
      const from = pendingPromoFrom;
      const to = promotionToSquare;

      setShowPromotionDialog(false);
      setPromotionToSquare(null);
      setPendingPromoFrom(null);

      if (!piece || !from || !to) return false;
      const promotion = extractPromo(piece);

      if (!isPlayerTurn) {
        queuePreMove({ from, to, promotion });
        clearSelection();
        return true;
      }

      if (!socket || !gameIdRef.current) return false;
      playLocalMoveSound(from, to, promotion);

      socket.emit("makeMove", {
        gameId: gameIdRef.current,
        from,
        to,
        promotion,
      });
      const nextTurn = playerColor === "w" ? "b" : "w";
      currentTurnRef.current = nextTurn;
      setCurrentTurn(nextTurn);
      clearSelection();
      return true;
    },
    [
      clearSelection,
      pendingPromoFrom,
      playLocalMoveSound,
      promotionToSquare,
      isPlayerTurn,
      queuePreMove,
      socket,
    ],
  );

  const onSquareClick = useCallback(
    (square: Square) => {
      if (!socket) return;
      if (!gameStarted || gameOver) return;
      if (!gameIdRef.current) return;

      const currentGame = gameRef.current;

      if (!isPlayerTurn) {
        if (!moveFrom) {
          const piece = currentGame.get(square);
          if (!piece || piece.color !== playerColor) return;
          selectPreMoveSource(square);
          return;
        }

        if (square === moveFrom) {
          clearSelection();
          return;
        }

        const sourcePiece = currentGame.get(moveFrom);
        if (!sourcePiece || sourcePiece.color !== playerColor) {
          clearSelection();
          return;
        }

        const isChess960Castle = isChess960CastlingDrop(
          currentGame,
          moveFrom,
          square,
        );
        const targetPiece = currentGame.get(square);
        if (
          targetPiece &&
          targetPiece.color === playerColor &&
          !isChess960Castle
        ) {
          selectPreMoveSource(square);
          return;
        }

        const isPromo =
          sourcePiece.type === "p" &&
          isPromotionTargetSquare(sourcePiece.color as PlayerColor, square);

        if (isPromo) {
          setPendingPromoFrom(moveFrom);
          setPromotionToSquare(square);
          setShowPromotionDialog(true);
          clearSelection();
          return;
        }

        queuePreMove({ from: moveFrom, to: square });
        return;
      }

      if (!moveFrom) {
        const piece = currentGame.get(square);
        if (!piece || piece.color !== playerColor) return;
        setMoveFrom(square);
        getMoveOptions(square);
        addChess960CastlingTargets(currentGame, square);
        return;
      }

      if (square === moveFrom) {
        clearSelection();
        return;
      }

      if (optionSquares[square]) {
        // Check for promotion
        const srcPiece = currentGame.get(moveFrom);
        const isPromo =
          srcPiece?.type === "p" &&
          ((srcPiece.color === "w" && square[1] === "8") ||
            (srcPiece.color === "b" && square[1] === "1"));

        if (isPromo) {
          setPendingPromoFrom(moveFrom);
          setPromotionToSquare(square);
          setShowPromotionDialog(true);
          clearSelection();
          return;
        }

        playLocalMoveSound(moveFrom, square, "q");
        socket.emit("makeMove", {
          gameId: gameIdRef.current,
          from: moveFrom,
          to: square,
          promotion: "q",
        });
        const nextTurn = playerColor === "w" ? "b" : "w";
        currentTurnRef.current = nextTurn;
        setCurrentTurn(nextTurn);
        clearSelection();
        return;
      }

      const piece = currentGame.get(square);
      if (piece && piece.color === playerColor) {
        setMoveFrom(square);
        getMoveOptions(square);
        addChess960CastlingTargets(currentGame, square);
        return;
      }

      playGameplaySound("illegal");
      clearSelection();
    },
    [
      clearSelection,
      socket,
      gameStarted,
      gameOver,
      isPlayerTurn,
      moveFrom,
      optionSquares,
      playerColor,
      playLocalMoveSound,
      getMoveOptions,
      addChess960CastlingTargets,
      isChess960CastlingDrop,
      queuePreMove,
      selectPreMoveSource,
    ],
  );

  const onPieceDrop = useCallback(
    (sourceSquare: Square, targetSquare: Square, piece?: string) => {
      if (!socket) return false;
      if (!gameStarted || gameOver) return false;
      if (!gameIdRef.current) return false;

      const currentGame = gameRef.current;
      const sourcePiece = currentGame.get(sourceSquare);
      if (!sourcePiece || sourcePiece.color !== playerColor) {
        playGameplaySound("illegal");
        return false;
      }

      if (!isPlayerTurn) {
        const isChess960Castle = isChess960CastlingDrop(
          currentGame,
          sourceSquare,
          targetSquare,
        );
        const targetPiece = currentGame.get(targetSquare);
        if (
          targetPiece &&
          targetPiece.color === playerColor &&
          !isChess960Castle
        ) {
          selectPreMoveSource(sourceSquare);
          return false;
        }

        const isPromo =
          sourcePiece.type === "p" &&
          isPromotionTargetSquare(
            sourcePiece.color as PlayerColor,
            targetSquare,
          );
        if (isPromo) {
          setPendingPromoFrom(sourceSquare);
          setPromotionToSquare(targetSquare);
          setShowPromotionDialog(true);
          clearSelection();
          return false;
        }

        queuePreMove({
          from: sourceSquare,
          to: targetSquare,
        });
        return false;
      }

      const isLegalMove = currentGame
        .moves({ square: sourceSquare, verbose: true })
        .some((move) => move.to === targetSquare);
      const isLegalChess960Castle = isChess960CastlingDrop(
        currentGame,
        sourceSquare,
        targetSquare,
      );

      if (!isLegalMove && !isLegalChess960Castle) {
        playGameplaySound("illegal");
        if (getMoveOptions(sourceSquare)) {
          setMoveFrom(sourceSquare);
          addChess960CastlingTargets(currentGame, sourceSquare);
        } else {
          clearSelection();
        }
        return false;
      }

      const isPromo =
        sourcePiece.type === "p" &&
        isPromotionTargetSquare(sourcePiece.color as PlayerColor, targetSquare);
      if (isPromo) {
        setPendingPromoFrom(sourceSquare);
        setPromotionToSquare(targetSquare);
        setShowPromotionDialog(true);
        clearSelection();
        return false;
      }

      const promotion = extractPromo(piece);
      socket.emit("makeMove", {
        gameId: gameIdRef.current,
        from: sourceSquare,
        to: targetSquare,
        promotion,
      });
      const nextTurn = playerColor === "w" ? "b" : "w";
      currentTurnRef.current = nextTurn;
      setCurrentTurn(nextTurn);
      playLocalMoveSound(sourceSquare, targetSquare, promotion);
      clearSelection();
      return true;
    },
    [
      clearSelection,
      gameOver,
      gameStarted,
      getMoveOptions,
      isChess960CastlingDrop,
      addChess960CastlingTargets,
      isPlayerTurn,
      playLocalMoveSound,
      playerColor,
      queuePreMove,
      selectPreMoveSource,
      socket,
    ],
  );

  const isDraggablePiece = useCallback(
    (sourceSquare: Square) => {
      if (!gameStarted || gameOver) return false;
      const piece = gameRef.current.get(sourceSquare);
      return !!piece && piece.color === playerColor;
    },
    [gameOver, gameStarted, playerColor],
  );

  const promotionState: PromotionState = {
    isOpen: showPromotionDialog,
    from: pendingPromoFrom,
    to: promotionToSquare,
    color:
      (pendingPromoFrom
        ? (gameRef.current.get(pendingPromoFrom)?.color ?? null)
        : null) ??
      (promotionToSquare ? (promotionToSquare[1] === "8" ? "w" : "b") : null),
  };

  const cancelSelectionOrPreMove = useCallback(() => {
    if (moveFrom) {
      clearSelection();
      return;
    }
    clearPreMove();
  }, [clearPreMove, clearSelection, moveFrom]);

  const resign = useCallback(() => {
    if (!socket || !gameIdRef.current) return;
    socket.emit("resign", { gameId: gameIdRef.current });
  }, [socket]);

  const timeOut = useCallback(
    (isPlayer: boolean) => {
      if (!socket || !gameIdRef.current || !isPlayer) return;
      socket.emit("timeout", { gameId: gameIdRef.current });
    },
    [socket],
  );

  const leaveGame = useCallback(() => {
    if (socket && gameIdRef.current) {
      socket.emit("leaveGame", { gameId: gameIdRef.current });
    }
    resetGameState();
  }, [socket, resetGameState]);

  const resetToSetup = useCallback(() => {
    resetGameState();
  }, [resetGameState]);

  return {
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
    opponentName,
    opponentUserId,
    playerRating,
    opponentRating,
    gameType,
    matchVariant,
    isRated,
    lastGameOver,
    statusMessage,
    showGameOverModal,
    optionSquares,
    preMoveSquares,
    threeCheckState,
    playerTime,
    opponentTime,
    setPlayerTime,
    setOpponentTime,
    isConnected,
    onSquareClick,
    onPieceDrop,
    onCancelSelection: cancelSelectionOrPreMove,
    isDraggablePiece,
    promotionState,
    onPromotionPieceSelect,
    resign,
    timeOut,
    leaveGame,
    resetToSetup,
  };
}
