import { useCallback, useEffect, useRef, useState } from "react";
import { Chess, Square } from "chess.js";
import { io, Socket } from "socket.io-client";
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
import { formatPerspectiveResult } from "./onlineGameShared";

const socketBaseUrl =
  import.meta.env.VITE_SOCKET_URL ||
  import.meta.env.VITE_API_URL ||
  "http://localhost:3001";
const SOCKET_URL = socketBaseUrl.replace(/\/api\/?$/, "");
const BOARD_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

type PlayerColor = "w" | "b";
type MatchVariant = "standard" | "chess960";
type GameOverReason =
  | "checkmate"
  | "draw"
  | "resign"
  | "timeout"
  | "opponent_left";

interface MatchFoundPayload {
  gameId: string;
  color: PlayerColor;
  fen: string;
  opponentName?: string;
  timeControl?: { initial: number; increment: number };
  variant?: MatchVariant;
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
}

interface GameOverPayload {
  gameId: string;
  reason: GameOverReason;
  winner: PlayerColor | null;
  elo?: {
    rated: boolean;
    applied: boolean;
    pool?: "bullet" | "blitz" | "rapid" | "classical";
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

function normalizeMatchVariant(value: unknown): MatchVariant {
  if (typeof value !== "string") return "standard";
  return value.trim().toLowerCase() === "chess960" ? "chess960" : "standard";
}

export function useOnlineQuickMatch() {
  const { user, setUser } = useAuthStore();
  const userRef = useRef(user);
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
  const [gameId, setGameId] = useState<string | null>(null);
  const [opponentName, setOpponentName] = useState("Opponent");
  const [isSearching, setIsSearching] = useState(false);
  const [queueStatus, setQueueStatus] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [matchVariant, setMatchVariant] = useState<MatchVariant>("standard");
  const [moveFrom, setMoveFrom] = useState<Square | null>(null);
  const [optionSquares, setOptionSquares] = useState<OptionSquares>({});
  const [pendingPreMove, setPendingPreMove] = useState<PreMove | null>(null);
  const [playerTime, setPlayerTime] = useState(
    defaultGameSettings.timeControl.initial,
  );
  const [opponentTime, setOpponentTime] = useState(
    defaultGameSettings.timeControl.initial,
  );

  const socketRef = useRef<Socket | null>(null);
  const playerNameRef = useRef<string>("Player");
  const gameIdRef = useRef<string | null>(null);
  const playerColorRef = useRef<PlayerColor>("w");
  const matchVariantRef = useRef<MatchVariant>("standard");
  const pendingPreMoveRef = useRef<PreMove | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const startingFenRef = useRef<string>("");
  const historySavedRef = useRef(false);
  const [lastGameOver, setLastGameOver] = useState<GameOverPayload | null>(
    null,
  );
  const saveGameHistory = useSaveGameHistory();

  const getMoveOptions = useMoveOptions(gameRef, setOptionSquares);
  const isPlayerTurn = game.turn() === playerColor;
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

    const currentGame = gameRef.current;
    if (currentGame.turn() !== playerColorRef.current) return false;

    const socket = socketRef.current;
    const activeGameId = gameIdRef.current;
    if (!socket || !activeGameId) return false;

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
      gameId: activeGameId,
      from: queuedPreMove.from,
      to: queuedPreMove.to,
      promotion: queuedPreMove.promotion || "q",
    });
    return true;
  }, []);

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
    setGameId(null);
    setSavedGameId(null);
    setHistoryPersistenceStatus("idle");
    gameIdRef.current = null;
    setOpponentName("Opponent");
    setPlayerColor("w");
    playerColorRef.current = "w";
    setMatchVariant("standard");
    matchVariantRef.current = "standard";
    startTimeRef.current = null;
    startingFenRef.current = "";
    historySavedRef.current = false;
    setLastGameOver(null);
  }, [resetStoredMoves]);

  const formatResult = (payload: GameOverPayload) => {
    return formatPerspectiveResult(
      payload,
      playerColorRef.current,
      gameRef.current,
    );
  };

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    matchVariantRef.current = matchVariant;
  }, [matchVariant]);

  useEffect(() => {
    pendingPreMoveRef.current = pendingPreMove;
  }, [pendingPreMove]);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      withCredentials: true,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      setQueueStatus(null);
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
      setIsSearching(false);
      setQueueStatus("Disconnected from server.");
    });

    socket.on("connect_error", () => {
      setIsConnected(false);
      setIsSearching(false);
      setQueueStatus("Unable to connect to matchmaking server.");
    });

    socket.on(
      "queued",
      (payload?: {
        ratingRange?: number;
        pool?: string;
        playerRating?: number;
      }) => {
        setIsSearching(true);
        const range = Number(payload?.ratingRange);
        if (Number.isFinite(range) && range > 0) {
          setQueueStatus(`Searching for opponent (±${Math.round(range)})...`);
        } else {
          setQueueStatus("Searching for opponent...");
        }
      },
    );

    socket.on("queueCancelled", () => {
      setIsSearching(false);
      setQueueStatus("Search cancelled.");
    });

    socket.on("matchFound", (payload: MatchFoundPayload) => {
      const nextGame = new Chess(payload.fen);
      gameRef.current = nextGame;
      setGame(nextGame);
      const normalizedVariant = normalizeMatchVariant(payload.variant);
      setMatchVariant(normalizedVariant);
      matchVariantRef.current = normalizedVariant;
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
      setOpponentName(payload.opponentName || "Opponent");
      setGameStarted(true);
      setGameOver(false);
      setGameResult(null);
      setShowGameOverModal(false);
      setIsSearching(false);
      setQueueStatus(null);
      setSavedGameId(null);
      setHistoryPersistenceStatus("idle");
      historySavedRef.current = false;
      startTimeRef.current = Date.now();
      setLastGameOver(null);
      playGameplaySound("gameStart");

      const timeControl =
        payload.timeControl || defaultGameSettings.timeControl;
      setGameSettings({
        ...defaultGameSettings,
        playAs: payload.color === "w" ? "white" : "black",
        difficulty: 0,
        timeControl,
      });
      setPlayerTime(timeControl.initial);
      setOpponentTime(timeControl.initial);
    });

    socket.on("moveApplied", (payload: MoveAppliedPayload) => {
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
          promotion: (payload.move as any).promotion || "q",
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

      setLastMove({ from: payload.move.from, to: payload.move.to });
      setMoveFrom(null);
      setOptionSquares({});
      setShowPromotionDialog(false);
      setPromotionToSquare(null);
      setPendingPromoFrom(null);

      // Opponent just moved and it may now be our turn.
      trySubmitQueuedPreMove();
    });

    socket.on("moveRejected", (payload: { reason?: string }) => {
      setQueueStatus(payload?.reason || "Move rejected.");
      playGameplaySound("illegal");
    });

    socket.on("gameOver", (payload: GameOverPayload) => {
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
      const nextUser = {
        ...currentUser,
        rating: sideUpdate.newRating,
        gamesPlayed: sideUpdate.gamesPlayed,
        gamesWon: sideUpdate.gamesWon,
      };
      if (payload.elo.pool === "bullet")
        nextUser.bulletRating = sideUpdate.newRating;
      if (payload.elo.pool === "bullet") {
        nextUser.bulletGames = sideUpdate.poolGamesPlayed;
        nextUser.bulletRd = sideUpdate.newRd;
        nextUser.bulletVolatility = sideUpdate.newVolatility;
      }
      if (payload.elo.pool === "blitz")
        nextUser.blitzRating = sideUpdate.newRating;
      if (payload.elo.pool === "blitz") {
        nextUser.blitzGames = sideUpdate.poolGamesPlayed;
        nextUser.blitzRd = sideUpdate.newRd;
        nextUser.blitzVolatility = sideUpdate.newVolatility;
      }
      if (payload.elo.pool === "rapid")
        nextUser.rapidRating = sideUpdate.newRating;
      if (payload.elo.pool === "rapid") {
        nextUser.rapidGames = sideUpdate.poolGamesPlayed;
        nextUser.rapidRd = sideUpdate.newRd;
        nextUser.rapidVolatility = sideUpdate.newVolatility;
      }
      if (payload.elo.pool === "classical") {
        nextUser.classicalRating = sideUpdate.newRating;
        nextUser.classicalGames = sideUpdate.poolGamesPlayed;
        nextUser.classicalRd = sideUpdate.newRd;
        nextUser.classicalVolatility = sideUpdate.newVolatility;
      }
      setUser(nextUser);
    });

    socket.on("opponentLeft", () => {
      setGameOver(true);
      setShowGameOverModal(true);
      setGameResult("Opponent left. You win.");
      setHistoryPersistenceStatus("failed");
      playGameplaySound("gameEnd");
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [appendStoredMove, resetStoredMoves, setUser, trySubmitQueuedPreMove]);

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
      draw: "draw",
    };

    const isDraw = lastGameOver.reason === "draw" || !lastGameOver.winner;
    const pgnResult = isDraw
      ? "1/2-1/2"
      : lastGameOver.winner === "w"
        ? "1-0"
        : "0-1";
    const terminationText = isDraw
      ? `Game drawn by ${reasonMap[lastGameOver.reason] || "draw"}`
      : `${lastGameOver.winner === "w" ? "White" : "Black"} won by ${
          reasonMap[lastGameOver.reason] || "checkmate"
        }`;

    const playerName = playerNameRef.current || "Player";
    const opponent = opponentName || "Opponent";
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
      event: matchVariant === "chess960" ? "Live Chess960" : "Live Chess",
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
      rated: true,
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
    user?.rating,
    matchVariant,
  ]);

  const startMatch = useCallback(
    (
      timeControl: { initial: number; increment: number },
      name?: string,
      variant: MatchVariant = "standard",
    ) => {
      if (!socketRef.current) return;
      if (!socketRef.current.connected) {
        setIsSearching(false);
        setQueueStatus("Matchmaking server is offline.");
        return;
      }
      const normalizedVariant = normalizeMatchVariant(variant);
      playerNameRef.current = name || "Player";
      resetGameState();
      setMatchVariant(normalizedVariant);
      matchVariantRef.current = normalizedVariant;
      setIsSearching(true);
      setQueueStatus("Searching for opponent...");
      setGameSettings({
        ...defaultGameSettings,
        playAs: "white",
        difficulty: 0,
        timeControl,
      });
      setPlayerTime(timeControl.initial);
      setOpponentTime(timeControl.initial);
      socketRef.current.emit("findMatch", {
        name: playerNameRef.current,
        timeControl,
        variant: normalizedVariant,
      });
    },
    [resetGameState],
  );

  const joinTournamentGame = useCallback(
    (targetGameId: string, name?: string) => {
      if (!socketRef.current) return;
      if (!socketRef.current.connected) {
        setIsSearching(false);
        setQueueStatus("Matchmaking server is offline.");
        return;
      }

      const normalizedGameId = String(targetGameId || "").trim();
      if (!normalizedGameId) {
        setIsSearching(false);
        setQueueStatus("Tournament game id is missing.");
        return;
      }

      playerNameRef.current = name || playerNameRef.current || "Player";
      if (gameIdRef.current !== normalizedGameId) {
        resetGameState();
      }
      setIsSearching(true);
      setQueueStatus("Joining tournament game...");

      socketRef.current.emit(
        "joinTournamentGame",
        {
          gameId: normalizedGameId,
          name: playerNameRef.current,
        },
        (response?: { success?: boolean; status?: string; error?: string }) => {
          if (response?.success !== true) {
            setIsSearching(false);
            setQueueStatus(response?.error || "Failed to join tournament game.");
            return;
          }
          if (response.status === "waiting") {
            setIsSearching(true);
            setQueueStatus("Waiting for your tournament opponent...");
            return;
          }
          if (response.status === "started" && !gameIdRef.current) {
            setQueueStatus("Starting game...");
          }
        },
      );
    },
    [resetGameState],
  );

  const leaveTournamentJoin = useCallback(() => {
    setIsSearching(false);
    setQueueStatus(null);
  }, []);

  const cancelMatch = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.emit("cancelFind");
    setIsSearching(false);
  }, []);

  const resign = useCallback(() => {
    if (!socketRef.current || !gameId) return;
    socketRef.current.emit("resign", { gameId });
  }, [gameId]);

  const timeOut = useCallback(
    (isPlayer: boolean) => {
      if (!socketRef.current || !gameId) return;
      if (!isPlayer) return;
      socketRef.current.emit("timeout", { gameId });
    },
    [gameId],
  );

  const leaveGame = useCallback(() => {
    if (!socketRef.current || !gameId) return;
    socketRef.current.emit("leaveGame", { gameId });
    resetGameState();
  }, [gameId, resetGameState]);

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

  const clearSelection = useCallback(() => {
    setMoveFrom(null);
    setOptionSquares({});
  }, []);

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
      if (!gameIdRef.current) return false;

      playLocalMoveSound(from, to, promotion);

      socketRef.current?.emit("makeMove", {
        gameId: gameIdRef.current,
        from,
        to,
        promotion,
      });
      clearSelection();
      return true;
    },
    [
      clearSelection,
      isPlayerTurn,
      pendingPromoFrom,
      playLocalMoveSound,
      promotionToSquare,
      queuePreMove,
    ],
  );

  const onSquareClick = useCallback(
    (square: Square) => {
      if (!gameStarted || gameOver) return;
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
        socketRef.current?.emit("makeMove", {
          gameId,
          from: moveFrom,
          to: square,
          promotion: "q",
        });
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
      isChess960CastlingDrop,
      clearSelection,
      gameId,
      gameOver,
      gameStarted,
      addChess960CastlingTargets,
      getMoveOptions,
      isPlayerTurn,
      moveFrom,
      optionSquares,
      playLocalMoveSound,
      playerColor,
      queuePreMove,
      selectPreMoveSource,
    ],
  );

  const onPieceDrop = useCallback(
    (sourceSquare: Square, targetSquare: Square, piece?: string) => {
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

      const isLegalStandardMove = currentGame
        .moves({ square: sourceSquare, verbose: true })
        .some((move) => move.to === targetSquare);
      const isLegalChess960Castle = isChess960CastlingDrop(
        currentGame,
        sourceSquare,
        targetSquare,
      );

      if (!isLegalStandardMove && !isLegalChess960Castle) {
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
      socketRef.current?.emit("makeMove", {
        gameId: gameIdRef.current,
        from: sourceSquare,
        to: targetSquare,
        promotion,
      });
      playLocalMoveSound(sourceSquare, targetSquare, promotion);
      clearSelection();
      return true;
    },
    [
      addChess960CastlingTargets,
      clearSelection,
      gameOver,
      gameStarted,
      getMoveOptions,
      isChess960CastlingDrop,
      isPlayerTurn,
      playLocalMoveSound,
      playerColor,
      queuePreMove,
      selectPreMoveSource,
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

  const rematch = useCallback(() => {
    startMatch(gameSettings.timeControl, playerNameRef.current, matchVariant);
  }, [gameSettings.timeControl, matchVariant, startMatch]);

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
    opponentName,

    // UI state
    showGameOverModal,
    optionSquares,
    preMoveSquares,
    playerTime,
    opponentTime,
    setPlayerTime,
    setOpponentTime,
    isSearching,
    queueStatus,
    isConnected,
    matchVariant,

    // Handlers
    onSquareClick,
    onPieceDrop,
    onCancelSelection: cancelSelectionOrPreMove,
    isDraggablePiece,
    promotionState,
    onPromotionPieceSelect,
    startMatch,
    joinTournamentGame,
    leaveTournamentJoin,
    cancelMatch,
    resign,
    timeOut,
    rematch,
    leaveGame,
  };
}
