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
import {
  formatPerspectiveResult,
  isAtomicKingCaptureAttempt,
  isAtomicVerboseMoveAllowed,
} from "./onlineGameShared";
import {
  clearActiveOnlineGame,
  consumeActiveGameRedirectNotice,
  readActiveOnlineGame,
  storeActiveOnlineGame,
} from "../utils/activeOnlineGame";
import {
  getRatingPoolForMatch,
  getUserRatingForPool,
} from "../utils/ratingPool";
import { useGameplayPreferences } from "./useGameplayPreferences";
import { SOCKET_URL } from "../config/network";
const ACTIVE_GAME_STORAGE_KEY = "neongambit:activeGameId";
const BOARD_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

type PlayerColor = "w" | "b";
type MatchVariant =
  | "standard"
  | "chess960"
  | "threeCheck"
  | "kingOfHill"
  | "atomic";
type GameOverReason =
  | "checkmate"
  | "draw"
  | "resign"
  | "timeout"
  | "opponent_left"
  | "aborted"
  | "three_check"
  | "king_of_the_hill"
  | "atomic_explosion";

interface MatchFoundPayload {
  gameId: string;
  color: PlayerColor;
  fen: string;
  opponentName?: string;
  rated?: boolean;
  playerRating?: number;
  opponentRating?: number;
  timeControl?: { initial: number; increment: number };
  variant?: MatchVariant;
  whiteCheckCount?: number;
  blackCheckCount?: number;
  restored?: boolean;
  moves?: string[];
  whiteTimeLeft?: number;
  blackTimeLeft?: number;
  playerClock?: number;
  opponentClock?: number;
  clockPaused?: boolean;
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
  whiteTimeLeft?: number;
  blackTimeLeft?: number;
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
  const normalized = value.trim().toLowerCase();
  if (normalized === "chess960") return "chess960";
  if (
    normalized === "atomic" ||
    normalized === "atomicchess" ||
    normalized === "atomic-chess" ||
    normalized === "atomic_chess"
  ) {
    return "atomic";
  }
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

function isUnratedMatchVariant(variant: MatchVariant): boolean {
  return (
    variant === "threeCheck" ||
    variant === "kingOfHill" ||
    variant === "atomic"
  );
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

interface GameSystemMessagePayload {
  gameId: string;
  message?: string;
  targetColor?: PlayerColor | null;
}

interface GameStateRestoredPayload {
  gameId: string;
  color?: PlayerColor;
  fen?: string;
  moves?: string[];
  whiteTimeLeft?: number;
  blackTimeLeft?: number;
  playerClock?: number;
  opponentClock?: number;
  clockPaused?: boolean;
}

interface RejoinGameResponse {
  success?: boolean;
  status?: string;
  gameId?: string;
  error?: string;
}

type DrawOfferStatus = "idle" | "sent" | "received";

interface DrawOfferState {
  status: DrawOfferStatus;
  offeredBy: PlayerColor | null;
  expiresAt: number | null;
}

interface DrawOfferPayload {
  gameId?: string;
  offeredBy?: PlayerColor;
  acceptedBy?: PlayerColor;
  declinedBy?: PlayerColor;
  expiresAt?: number;
  reason?: string;
}

interface SocketAckResponse {
  success?: boolean;
  status?: string;
  error?: string;
  expiresAt?: number;
}

const idleDrawOfferState: DrawOfferState = {
  status: "idle",
  offeredBy: null,
  expiresAt: null,
};

function storeActiveGameId(gameId: string | null) {
  if (!gameId) {
    clearActiveOnlineGame();
    return;
  }
  const existing = readActiveOnlineGame();
  storeActiveOnlineGame({
    ...existing,
    gameId,
    kind: "classic",
    mode:
      existing?.mode === "friend" || existing?.mode === "tournament"
        ? existing.mode
        : "quick",
  });
}

function readActiveGameId() {
  const existing = readActiveOnlineGame();
  if (
    existing?.kind === "classic" &&
    existing.mode !== "friend" &&
    existing.gameId
  ) {
    return existing.gameId;
  }
  if (typeof window === "undefined") return "";
  try {
    return String(window.localStorage.getItem(ACTIVE_GAME_STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

function toFiniteRating(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

export function useOnlineQuickMatch() {
  const { user, setUser } = useAuthStore();
  const { autoQueen, premoves, showLegalMoves } = useGameplayPreferences();
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
  const [gameId, setGameId] = useState<string | null>(() => {
    const stored = readActiveGameId();
    return stored || null;
  });
  const [opponentName, setOpponentName] = useState("Opponent");
  const [playerRating, setPlayerRating] = useState<number | null>(null);
  const [opponentRating, setOpponentRating] = useState<number | null>(null);
  const [isRatedMatch, setIsRatedMatch] = useState(false);
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
  const [playerClockSeed, setPlayerClockSeed] = useState(
    defaultGameSettings.timeControl.initial,
  );
  const [opponentClockSeed, setOpponentClockSeed] = useState(
    defaultGameSettings.timeControl.initial,
  );
  const [clockResetToken, setClockResetToken] = useState(0);
  const [isClockPaused, setIsClockPaused] = useState(false);
  const [threeCheckState, setThreeCheckState] = useState(() =>
    normalizeThreeCheckCounts(),
  );

  const socketRef = useRef<Socket | null>(null);
  const tournamentJoinRetryTimerRef = useRef<number | null>(null);
  const tournamentJoinAttemptsRef = useRef(0);
  const activeTournamentJoinGameIdRef = useRef<string>("");
  const playerNameRef = useRef<string>("Player");
  const gameIdRef = useRef<string | null>(readActiveGameId() || null);
  const playerColorRef = useRef<PlayerColor>("w");
  const matchVariantRef = useRef<MatchVariant>("standard");
  const pendingPreMoveRef = useRef<PreMove | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const startingFenRef = useRef<string>("");
  const clockDisplayIntervalRef = useRef<number | null>(null);
  const lastClockTickAtRef = useRef<number>(Date.now());
  const historySavedRef = useRef(false);
  const [lastGameOver, setLastGameOver] = useState<GameOverPayload | null>(
    null,
  );
  const [drawOfferState, setDrawOfferState] =
    useState<DrawOfferState>(idleDrawOfferState);
  const saveGameHistory = useSaveGameHistory();

  const isMoveAllowedForVariant = useCallback((move: any) => {
    if (matchVariantRef.current !== "atomic") return true;
    return isAtomicVerboseMoveAllowed(move);
  }, []);
  const getMoveOptions = useMoveOptions(
    gameRef,
    setOptionSquares,
    isMoveAllowedForVariant,
  );
  const isPlayerTurn = game.turn() === playerColor;
  const preMoveSquares = buildPreMoveSquares(pendingPreMove);

  const clearTournamentJoinRetry = useCallback(() => {
    if (tournamentJoinRetryTimerRef.current !== null) {
      window.clearTimeout(tournamentJoinRetryTimerRef.current);
      tournamentJoinRetryTimerRef.current = null;
    }
    tournamentJoinAttemptsRef.current = 0;
    activeTournamentJoinGameIdRef.current = "";
  }, []);

  const resetStoredMoves = useCallback(() => {
    movesRef.current = [];
    setMoves([]);
  }, []);

  const setStoredMoves = useCallback((nextMoves: string[]) => {
    const normalized = Array.isArray(nextMoves)
      ? nextMoves
          .map((move) => String(move || "").trim())
          .filter((move) => move.length > 0)
      : [];
    movesRef.current = normalized;
    setMoves(normalized);
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
    if (!premoves) return;
    pendingPreMoveRef.current = preMove;
    setPendingPreMove(preMove);
    setMoveFrom(null);
    setOptionSquares({});
    playGameplaySound("premove");
  }, [premoves]);

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
    const engineState = socket?.io?.engine?.readyState;
    if (
      !socket ||
      !activeGameId ||
      !socket.connected ||
      (engineState && engineState !== "open")
    ) {
      return false;
    }

    const validationGame = new Chess(currentGame.fen());
    const isChess960Castle = isChess960CastlingDropForColor(
      validationGame,
      queuedPreMove.from,
      queuedPreMove.to,
      playerColorRef.current,
      matchVariantRef.current,
    );
    if (
      matchVariantRef.current === "atomic" &&
      isAtomicKingCaptureAttempt(
        validationGame,
        queuedPreMove.from,
        queuedPreMove.to,
        playerColorRef.current,
      )
    ) {
      pendingPreMoveRef.current = null;
      setPendingPreMove(null);
      playGameplaySound("illegal");
      return false;
    }
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
    storeActiveGameId(null);
    setSavedGameId(null);
    setHistoryPersistenceStatus("idle");
    gameIdRef.current = null;
    setOpponentName("Opponent");
    setPlayerRating(null);
    setOpponentRating(null);
    setIsRatedMatch(false);
    setPlayerColor("w");
    playerColorRef.current = "w";
    setMatchVariant("standard");
    matchVariantRef.current = "standard";
    setThreeCheckState(normalizeThreeCheckCounts());
    setPlayerTime(defaultGameSettings.timeControl.initial);
    setOpponentTime(defaultGameSettings.timeControl.initial);
    setPlayerClockSeed(defaultGameSettings.timeControl.initial);
    setOpponentClockSeed(defaultGameSettings.timeControl.initial);
    setClockResetToken((value) => value + 1);
    setIsClockPaused(false);
    setQueueStatus(null);
    startTimeRef.current = null;
    startingFenRef.current = "";
    historySavedRef.current = false;
    setLastGameOver(null);
    setDrawOfferState(idleDrawOfferState);
    clearTournamentJoinRetry();
  }, [clearTournamentJoinRetry, resetStoredMoves]);

  const emitIfConnected = useCallback(
    (
      eventName: string,
      payload?: Record<string, unknown>,
      ack?: (...args: unknown[]) => void,
    ) => {
      const socket = socketRef.current;
      const engineState = socket?.io?.engine?.readyState;
      if (!socket || !socket.connected || (engineState && engineState !== "open")) {
        setQueueStatus("Reconnecting to server...");
        return false;
      }
      if (ack) {
        socket.emit(eventName, payload, ack);
      } else {
        socket.emit(eventName, payload);
      }
      return true;
    },
    [],
  );

  const requestClockResync = useCallback(
    (
      targetGameId?: string | null,
      options: { allowEmpty?: boolean } = {},
    ) => {
      const socket = socketRef.current;
      if (!socket || !socket.connected) return;

      const explicitGameId = String(
        targetGameId || gameIdRef.current || readActiveGameId() || "",
      ).trim();
      if (!explicitGameId && options.allowEmpty !== true) return;

      const payload = explicitGameId ? { gameId: explicitGameId } : {};
      socket.emit(
        "rejoinGame",
        payload,
        (response?: RejoinGameResponse) => {
          if (response?.success === true) {
            if (response.gameId) {
              storeActiveGameId(String(response.gameId));
            } else if (explicitGameId) {
              storeActiveGameId(explicitGameId);
            }
            setQueueStatus("Game state restored.");
            setIsSearching(false);
            return;
          }

          if (response?.error) {
            const normalizedError = String(response.error).toLowerCase();
            if (
              normalizedError.includes("not found") ||
              normalizedError.includes("no active game") ||
              normalizedError.includes("not a participant")
            ) {
              storeActiveGameId(null);
            }
          }
        },
      );
    },
    [],
  );

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
    const notice = consumeActiveGameRedirectNotice();
    if (notice) {
      setQueueStatus(notice);
    }
  }, []);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      autoConnect: false,
    });
    let connectProbeTimer: number | null = null;
    const clearConnectProbeTimer = () => {
      if (connectProbeTimer !== null) {
        window.clearTimeout(connectProbeTimer);
        connectProbeTimer = null;
      }
    };
    const scheduleConnectProbe = () => {
      clearConnectProbeTimer();
      connectProbeTimer = window.setTimeout(async () => {
        connectProbeTimer = null;
        if (socket.connected) return;
        try {
          const response = await fetch(`${SOCKET_URL}/healthz`, {
            credentials: "include",
          });
          if (!response.ok) throw new Error("Server unavailable");
          if (!socket.connected) {
            socket.connect();
          }
        } catch {
          setIsConnected(false);
          if (activeTournamentJoinGameIdRef.current) {
            setIsSearching(true);
            setQueueStatus("Reconnecting to matchmaking server...");
          } else if (gameIdRef.current || readActiveGameId()) {
            setIsSearching(false);
            setQueueStatus("Connection lost. Reconnecting to your game...");
          } else {
            setIsSearching(false);
            setQueueStatus("Unable to connect to matchmaking server. Reconnecting...");
          }
          scheduleConnectProbe();
        }
      }, 1500);
    };
    socketRef.current = socket;

    socket.on("connect", () => {
      clearConnectProbeTimer();
      setIsConnected(true);
      if (!gameIdRef.current && !readActiveGameId()) {
        setIsClockPaused(false);
      }
      setQueueStatus(null);
      requestClockResync(null, { allowEmpty: true });
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
      if (activeTournamentJoinGameIdRef.current) {
        setIsSearching(true);
        setQueueStatus("Connection lost. Reconnecting...");
      } else if (gameIdRef.current || readActiveGameId()) {
        setIsSearching(false);
        setIsClockPaused(false);
        setQueueStatus("Connection lost. Reconnecting to your game. Clock continues server-side...");
      } else {
        setIsSearching(false);
        setQueueStatus("Disconnected from server.");
      }
      scheduleConnectProbe();
    });

    socket.on("connect_error", () => {
      setIsConnected(false);
      if (activeTournamentJoinGameIdRef.current) {
        setIsSearching(true);
        setQueueStatus("Reconnecting to matchmaking server...");
      } else if (gameIdRef.current || readActiveGameId()) {
        setIsSearching(false);
        setIsClockPaused(false);
        setQueueStatus("Reconnecting to your game. Clock continues server-side...");
      } else {
        setIsSearching(false);
        setQueueStatus("Unable to connect to matchmaking server. Reconnecting...");
      }
      scheduleConnectProbe();
    });

    socket.io.on("reconnect_attempt", () => {
      setQueueStatus("Reconnecting to matchmaking server...");
    });

    socket.io.on("reconnect_failed", () => {
      if (!activeTournamentJoinGameIdRef.current) {
        setIsSearching(false);
      }
      setQueueStatus("Unable to reconnect to matchmaking server.");
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
      setThreeCheckState(
        normalizedVariant === "threeCheck"
          ? normalizeThreeCheckCounts(payload)
          : normalizeThreeCheckCounts(),
      );
      startingFenRef.current = payload.fen || nextGame.fen();
      if (Array.isArray(payload.moves)) {
        setStoredMoves(payload.moves);
      } else {
        resetStoredMoves();
      }
      setLastMove(null);
      setMoveFrom(null);
      setOptionSquares({});
      setShowPromotionDialog(false);
      setPromotionToSquare(null);
      setPendingPromoFrom(null);
      setGameId(payload.gameId);
      storeActiveGameId(payload.gameId);
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
      clearTournamentJoinRetry();
      setSavedGameId(null);
      setHistoryPersistenceStatus("idle");
      historySavedRef.current = false;
      startTimeRef.current = Date.now();
      setLastGameOver(null);
      setDrawOfferState(idleDrawOfferState);
      playGameplaySound("gameStart", { onceKey: payload.gameId });

      const timeControl =
        payload.timeControl || defaultGameSettings.timeControl;
      storeActiveOnlineGame({
        gameId: payload.gameId,
        kind: "classic",
        mode: activeTournamentJoinGameIdRef.current ? "tournament" : "quick",
        variant: normalizedVariant,
        opponentName: payload.opponentName || "Opponent",
        timeControl,
      });
      const ratingPool = getRatingPoolForMatch(timeControl, normalizedVariant);
      const canShowRatedInfo = payload.rated === true && ratingPool !== null;
      const fallbackPlayerRating = getUserRatingForPool(
        userRef.current,
        ratingPool,
      );
      setIsRatedMatch(canShowRatedInfo);
      setPlayerRating(
        canShowRatedInfo
          ? toFiniteRating(payload.playerRating) ?? fallbackPlayerRating
          : null,
      );
      setOpponentRating(
        canShowRatedInfo ? toFiniteRating(payload.opponentRating) : null,
      );
      setGameSettings({
        ...defaultGameSettings,
        playAs: payload.color === "w" ? "white" : "black",
        difficulty: 0,
        timeControl,
      });
      const playerClock =
        Number.isFinite(Number(payload.playerClock))
          ? Number(payload.playerClock)
          : payload.color === "w"
            ? Number(payload.whiteTimeLeft)
            : Number(payload.blackTimeLeft);
      const opponentClock =
        Number.isFinite(Number(payload.opponentClock))
          ? Number(payload.opponentClock)
          : payload.color === "w"
            ? Number(payload.blackTimeLeft)
            : Number(payload.whiteTimeLeft);
      const normalizedPlayerClock = Number.isFinite(playerClock)
        ? Math.max(0, playerClock)
        : timeControl.initial;
      const normalizedOpponentClock = Number.isFinite(opponentClock)
        ? Math.max(0, opponentClock)
        : timeControl.initial;
      setPlayerTime(normalizedPlayerClock);
      setOpponentTime(normalizedOpponentClock);
      setPlayerClockSeed(normalizedPlayerClock);
      setOpponentClockSeed(normalizedOpponentClock);
      setClockResetToken((value) => value + 1);
      setIsClockPaused(false);
    });

    socket.on("moveApplied", (payload: MoveAppliedPayload) => {
      if (payload.gameId !== gameIdRef.current) return;
      const isOpponentMove = payload.turn === playerColorRef.current;
      const shouldAnnotateThreeCheck =
        matchVariantRef.current === "threeCheck" && !!payload.checkAwarded;

      if (payload.isChess960Castle) {
        const nextGame = new Chess(payload.fen);
        gameRef.current = nextGame;
        setGame(nextGame);
        const castlingSan = payload.move.san || "";
        appendStoredMove(
          shouldAnnotateThreeCheck
            ? `${castlingSan} (+1 check)`
            : castlingSan,
        );
        if (isOpponentMove) {
          playChessMoveSound(
            { ...payload.move, castlingSide: "k" },
            { isOpponentMove: true },
          );
        }
      } else if (matchVariantRef.current === "atomic") {
        const previewGame = new Chess(gameRef.current.fen());
        const applied = previewGame.move({
          from: payload.move.from,
          to: payload.move.to,
          promotion: (payload.move as any).promotion || "q",
        });
        const nextGame = new Chess(payload.fen);
        gameRef.current = nextGame;
        setGame(nextGame);
        appendStoredMove(payload.move.san || applied?.san || "");
        if (isOpponentMove) {
          playChessMoveSound(applied || payload.move, { isOpponentMove: true });
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
          appendStoredMove(
            shouldAnnotateThreeCheck
              ? `${payload.move.san || applied.san} (+1 check)`
              : payload.move.san || applied.san,
          );
          if (isOpponentMove) {
            playChessMoveSound(applied, { isOpponentMove: true });
          }
        } else {
          const nextGame = new Chess(payload.fen);
          gameRef.current = nextGame;
          setGame(nextGame);
          const fallbackSan = payload.move.san || "";
          appendStoredMove(
            shouldAnnotateThreeCheck
              ? `${fallbackSan} (+1 check)`
              : fallbackSan,
          );
          if (isOpponentMove) {
            playChessMoveSound(payload.move, { isOpponentMove: true });
          }
        }
      }

      if (matchVariantRef.current === "threeCheck") {
        setThreeCheckState((previous) => {
          const normalized = normalizeThreeCheckCounts(payload);
          const hasPayloadCounts =
            payload.whiteCheckCount !== undefined &&
            payload.blackCheckCount !== undefined;
          if (hasPayloadCounts) {
            return normalized;
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
      setMoveFrom(null);
      setOptionSquares({});
      setShowPromotionDialog(false);
      setPromotionToSquare(null);
      setPendingPromoFrom(null);
      const whiteClock = Number(payload.whiteTimeLeft);
      const blackClock = Number(payload.blackTimeLeft);
      if (Number.isFinite(whiteClock) && Number.isFinite(blackClock)) {
        const ownClock =
          playerColorRef.current === "w" ? whiteClock : blackClock;
        const oppClock =
          playerColorRef.current === "w" ? blackClock : whiteClock;
        const normalizedOwnClock = Math.max(0, ownClock);
        const normalizedOpponentClock = Math.max(0, oppClock);
        setPlayerTime(normalizedOwnClock);
        setOpponentTime(normalizedOpponentClock);
        setPlayerClockSeed(normalizedOwnClock);
        setOpponentClockSeed(normalizedOpponentClock);
        setClockResetToken((value) => value + 1);
      }
      setIsClockPaused(false);

      // Opponent just moved and it may now be our turn.
      trySubmitQueuedPreMove();
    });

    socket.on("game_state_restored", (payload: GameStateRestoredPayload) => {
      if (!payload?.gameId) return;
      const normalizedGameId = String(payload.gameId).trim();
      if (!normalizedGameId) return;
      setGameId(normalizedGameId);
      gameIdRef.current = normalizedGameId;
      storeActiveGameId(normalizedGameId);
      const existingActiveGame = readActiveOnlineGame();
      storeActiveOnlineGame({
        ...existingActiveGame,
        gameId: normalizedGameId,
        kind: "classic",
        mode:
          activeTournamentJoinGameIdRef.current ||
          existingActiveGame?.mode === "tournament"
            ? "tournament"
            : "quick",
        variant: existingActiveGame?.variant || matchVariantRef.current,
        opponentName: existingActiveGame?.opponentName || opponentName,
        timeControl: existingActiveGame?.timeControl || gameSettings.timeControl,
      });
      setGameStarted(true);
      setGameOver(false);
      setShowGameOverModal(false);
      setGameResult(null);
      const playerSide = (payload.color || playerColorRef.current || "w") === "b" ? "b" : "w";
      setPlayerColor(playerSide);
      playerColorRef.current = playerSide;
      const restoredFen = String(payload.fen || "").trim();
      if (restoredFen) {
        try {
          const restored = new Chess(restoredFen);
          gameRef.current = restored;
          setGame(restored);
          startingFenRef.current = restored.fen();
        } catch {
          // keep existing state if payload fen is invalid
        }
      }
      if (Array.isArray(payload.moves)) {
        setStoredMoves(payload.moves);
      }
      const whiteClock = Number(payload.whiteTimeLeft);
      const blackClock = Number(payload.blackTimeLeft);
      const playerClockRaw =
        Number.isFinite(Number(payload.playerClock))
          ? Number(payload.playerClock)
          : playerSide === "w"
            ? whiteClock
            : blackClock;
      const opponentClockRaw =
        Number.isFinite(Number(payload.opponentClock))
          ? Number(payload.opponentClock)
          : playerSide === "w"
            ? blackClock
            : whiteClock;
      const playerClock = Number.isFinite(playerClockRaw)
        ? Math.max(0, playerClockRaw)
        : gameSettings.timeControl.initial;
      const opponentClock = Number.isFinite(opponentClockRaw)
        ? Math.max(0, opponentClockRaw)
        : gameSettings.timeControl.initial;
      setPlayerTime(playerClock);
      setOpponentTime(opponentClock);
      setPlayerClockSeed(playerClock);
      setOpponentClockSeed(opponentClock);
      setClockResetToken((value) => value + 1);
      setIsClockPaused(false);
      setQueueStatus("Game restored after reconnect.");
      setIsSearching(false);
      clearTournamentJoinRetry();
    });

    socket.on(
      "opponent_disconnected",
      (payload?: {
        gameId?: string;
        graceMs?: number;
        opponentColor?: PlayerColor;
      }) => {
        if (payload?.gameId && payload.gameId !== gameIdRef.current) return;
        if (payload?.opponentColor === playerColorRef.current) return;
        setIsClockPaused(false);
        setQueueStatus("Opponent disconnected. Their clock is still running.");
      },
    );

    socket.on(
      "opponent_reconnected",
      (payload?: { gameId?: string; color?: PlayerColor }) => {
        if (payload?.gameId && payload.gameId !== gameIdRef.current) return;
        if (payload?.color === playerColorRef.current) return;
        setIsClockPaused(false);
        setQueueStatus("Opponent reconnected.");
      },
    );

    socket.on(
      "opponent_abandoned",
      (payload?: { gameId?: string }) => {
        if (payload?.gameId && payload.gameId !== gameIdRef.current) return;
        setIsClockPaused(false);
        setQueueStatus("Opponent abandoned the game.");
      },
    );

    socket.on("moveRejected", (payload: { reason?: string }) => {
      setQueueStatus(payload?.reason || "Move rejected.");
      playGameplaySound("illegal");
    });

    socket.on("gameSystemMessage", (payload: GameSystemMessagePayload) => {
      if (payload.gameId !== gameIdRef.current) return;
      if (
        payload.targetColor &&
        payload.targetColor !== playerColorRef.current
      ) {
        return;
      }
      if (payload.message) {
        setQueueStatus(payload.message);
      }
    });

    socket.on("drawOfferPending", (payload: DrawOfferPayload) => {
      if (payload.gameId !== gameIdRef.current) return;
      setDrawOfferState({
        status: "sent",
        offeredBy: payload.offeredBy || playerColorRef.current,
        expiresAt: Number(payload.expiresAt || 0) || null,
      });
      setQueueStatus("Draw offer sent.");
    });

    socket.on("drawOfferReceived", (payload: DrawOfferPayload) => {
      if (payload.gameId !== gameIdRef.current) return;
      setDrawOfferState({
        status: "received",
        offeredBy: payload.offeredBy || null,
        expiresAt: Number(payload.expiresAt || 0) || null,
      });
      setQueueStatus("Opponent offered a draw.");
    });

    socket.on("drawOfferAccepted", (payload: DrawOfferPayload) => {
      if (payload.gameId !== gameIdRef.current) return;
      setDrawOfferState(idleDrawOfferState);
      setQueueStatus("Draw offer accepted.");
    });

    socket.on("drawOfferDeclined", (payload: DrawOfferPayload) => {
      if (payload.gameId !== gameIdRef.current) return;
      setDrawOfferState(idleDrawOfferState);
      setQueueStatus(
        payload.reason === "move"
          ? "Draw offer declined by move."
          : "Draw offer declined.",
      );
    });

    socket.on("drawOfferExpired", (payload: DrawOfferPayload) => {
      if (payload.gameId !== gameIdRef.current) return;
      setDrawOfferState(idleDrawOfferState);
      setQueueStatus("Draw offer expired.");
    });

    socket.on("gameOver", (payload: GameOverPayload) => {
      if (payload.gameId !== gameIdRef.current) return;
      storeActiveGameId(null);
      setIsClockPaused(false);
      setGameOver(true);
      setShowGameOverModal(true);
      setGameResult(formatResult(payload));
      setLastGameOver(payload);
      setShowPromotionDialog(false);
      setPromotionToSquare(null);
      setPendingPromoFrom(null);
      setPendingPreMove(null);
      pendingPreMoveRef.current = null;
      setDrawOfferState(idleDrawOfferState);
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
    });

    socket.on("opponentLeft", () => {
      storeActiveGameId(null);
      setGameOver(true);
      setShowGameOverModal(true);
      setGameResult("Opponent left. You win.");
      setHistoryPersistenceStatus("failed");
      setDrawOfferState(idleDrawOfferState);
      playGameplaySound("gameEnd");
    });

    scheduleConnectProbe();

    return () => {
      clearTournamentJoinRetry();
      clearConnectProbeTimer();
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [
    appendStoredMove,
    clearTournamentJoinRetry,
    requestClockResync,
    resetStoredMoves,
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
      three_check: "3-check",
      king_of_the_hill: "reaching the center",
      atomic_explosion: "king explosion",
      draw: "draw",
      aborted: "aborted",
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
      Math.floor(
        Number(
          lastGameOver.whiteCheckCount ??
            (matchVariant === "threeCheck"
              ? threeCheckState.whiteCheckCount
              : 0),
        ) || 0,
      ),
    );
    const blackThreeChecks = Math.max(
      0,
      Math.floor(
        Number(
          lastGameOver.blackCheckCount ??
            (matchVariant === "threeCheck"
              ? threeCheckState.blackCheckCount
              : 0),
        ) || 0,
      ),
    );
    const terminationText = isDraw
      ? `Game drawn by ${reasonMap[lastGameOver.reason] || "draw"}`
      : lastGameOver.reason === "three_check"
        ? `${lastGameOver.winner === "w" ? "White" : "Black"} wins by 3-check (White ${whiteThreeChecks}/3, Black ${blackThreeChecks}/3)`
        : lastGameOver.reason === "king_of_the_hill"
          ? `${lastGameOver.winner === "w" ? "White" : "Black"} wins by reaching the center`
        : lastGameOver.reason === "atomic_explosion"
          ? `${lastGameOver.winner === "w" ? "White" : "Black"} wins by atomic king explosion`
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
    const includeRatingMetadata =
      !isUnratedMatchVariant(matchVariant) && lastGameOver.elo?.rated === true;

    saveGameHistory({
      event:
        matchVariant === "chess960"
          ? "Live Chess960"
          : matchVariant === "threeCheck"
            ? "Live Three-Check"
            : matchVariant === "kingOfHill"
              ? "Live King of the Hill"
              : matchVariant === "atomic"
                ? "Live Atomic Chess"
              : "Live Chess",
      variant: matchVariant,
      site: "NeonGambit",
      link: gameIdRef.current || undefined,
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
      rated: includeRatingMetadata,
      ratingBefore: includeRatingMetadata && Number.isFinite(playerPreRating)
        ? playerPreRating
        : undefined,
      ratingAfter: includeRatingMetadata && Number.isFinite(playerPostRating)
        ? playerPostRating
        : undefined,
      ratingDelta:
        includeRatingMetadata && Number.isFinite(playerDelta)
          ? playerDelta
          : undefined,
      ratingDeviationBefore: includeRatingMetadata && Number.isFinite(playerPreRd)
        ? playerPreRd
        : undefined,
      ratingDeviationAfter: includeRatingMetadata && Number.isFinite(playerPostRd)
        ? playerPostRd
        : undefined,
      ratingDeviationDelta:
        includeRatingMetadata &&
        Number.isFinite(playerPreRd) &&
        Number.isFinite(playerPostRd)
          ? playerPostRd - playerPreRd
          : undefined,
      volatilityBefore:
        includeRatingMetadata && Number.isFinite(playerPreVolatility)
        ? playerPreVolatility
        : undefined,
      volatilityAfter:
        includeRatingMetadata && Number.isFinite(playerPostVolatility)
        ? playerPostVolatility
        : undefined,
      volatilityDelta:
        includeRatingMetadata &&
        Number.isFinite(playerPreVolatility) &&
        Number.isFinite(playerPostVolatility)
          ? playerPostVolatility - playerPreVolatility
          : undefined,
      isProvisional: includeRatingMetadata ? playerIsProvisional : undefined,
      opponentRatingBefore:
        includeRatingMetadata && Number.isFinite(opponentPreRating)
        ? opponentPreRating
        : undefined,
      opponentRatingAfter:
        includeRatingMetadata && Number.isFinite(opponentPostRating)
        ? opponentPostRating
        : undefined,
      opponentRatingDelta:
        includeRatingMetadata && Number.isFinite(opponentDelta)
          ? opponentDelta
          : undefined,
      opponentRatingDeviationBefore:
        includeRatingMetadata && Number.isFinite(opponentPreRd)
        ? opponentPreRd
        : undefined,
      opponentRatingDeviationAfter:
        includeRatingMetadata && Number.isFinite(opponentPostRd)
        ? opponentPostRd
        : undefined,
      opponentRatingDeviationDelta:
        includeRatingMetadata &&
        Number.isFinite(opponentPreRd) &&
        Number.isFinite(opponentPostRd)
          ? opponentPostRd - opponentPreRd
          : undefined,
      opponentVolatilityBefore:
        includeRatingMetadata && Number.isFinite(opponentPreVolatility)
        ? opponentPreVolatility
        : undefined,
      opponentVolatilityAfter:
        includeRatingMetadata && Number.isFinite(opponentPostVolatility)
        ? opponentPostVolatility
        : undefined,
      opponentVolatilityDelta:
        includeRatingMetadata &&
        Number.isFinite(opponentPreVolatility) &&
        Number.isFinite(opponentPostVolatility)
          ? opponentPostVolatility - opponentPreVolatility
          : undefined,
      opponentIsProvisional: includeRatingMetadata
        ? opponentIsProvisional
        : undefined,
      ratingPool: includeRatingMetadata ? lastGameOver.elo?.pool : undefined,
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
      whiteCheckCount: matchVariant === "threeCheck" ? whiteThreeChecks : undefined,
      blackCheckCount: matchVariant === "threeCheck" ? blackThreeChecks : undefined,
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
    threeCheckState.whiteCheckCount,
    threeCheckState.blackCheckCount,
  ]);

  const startMatch = useCallback(
    (
      timeControl: { initial: number; increment: number },
      name?: string,
      variant: MatchVariant = "standard",
    ) => {
      const existing = readActiveOnlineGame();
      if (existing?.gameId) {
        setQueueStatus("You already have an active game in progress.");
        setIsSearching(false);
        if (existing.kind === "classic") {
          requestClockResync(existing.gameId);
        }
        return;
      }
      playerNameRef.current = name || "Player";
      // Always clear previous game/modal state before a rematch/start attempt.
      resetGameState();

      if (!socketRef.current) return;
      if (!socketRef.current.connected) {
        setIsSearching(false);
        setQueueStatus("Matchmaking server is offline. Reconnecting...");
        return;
      }
      const normalizedVariant = normalizeMatchVariant(variant);
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
      emitIfConnected("findMatch", {
        name: playerNameRef.current,
        timeControl,
        variant: normalizedVariant,
      });
    },
    [emitIfConnected, requestClockResync, resetGameState],
  );

  const joinTournamentGame = useCallback(
    (targetGameId: string, name?: string) => {
      const socket = socketRef.current;
      if (!socket) return;

      const normalizedGameId = String(targetGameId || "").trim();
      if (!normalizedGameId) {
        setIsSearching(false);
        setQueueStatus("Tournament game id is missing.");
        return;
      }

      if (activeTournamentJoinGameIdRef.current !== normalizedGameId) {
        if (tournamentJoinRetryTimerRef.current !== null) {
          window.clearTimeout(tournamentJoinRetryTimerRef.current);
          tournamentJoinRetryTimerRef.current = null;
        }
        tournamentJoinAttemptsRef.current = 0;
        activeTournamentJoinGameIdRef.current = normalizedGameId;
      }

      playerNameRef.current = name || playerNameRef.current || "Player";
      if (gameIdRef.current !== normalizedGameId) {
        resetGameState();
        activeTournamentJoinGameIdRef.current = normalizedGameId;
      }
      setIsSearching(true);
      tournamentJoinAttemptsRef.current += 1;
      const attempt = tournamentJoinAttemptsRef.current;
      setQueueStatus(
        attempt > 1
          ? `Reconnecting to your tournament board... (attempt ${attempt}/5)`
          : "Joining tournament game...",
      );

      if (!socket.connected) {
        if (attempt >= 5) {
          setIsSearching(false);
          setQueueStatus("Unable to reconnect to your tournament board.");
          return;
        }
        if (tournamentJoinRetryTimerRef.current !== null) {
          window.clearTimeout(tournamentJoinRetryTimerRef.current);
        }
        tournamentJoinRetryTimerRef.current = window.setTimeout(() => {
          tournamentJoinRetryTimerRef.current = null;
          joinTournamentGame(normalizedGameId, playerNameRef.current);
        }, 5000);
        return;
      }

      const emitted = emitIfConnected(
        "joinTournamentGame",
        {
          gameId: normalizedGameId,
          name: playerNameRef.current,
        },
        (response?: { success?: boolean; status?: string; error?: string }) => {
          if (response?.success !== true) {
            const errorText = String(response?.error || "").toLowerCase();
            const retryable =
              errorText.includes("offline") ||
              errorText.includes("failed") ||
              errorText.includes("unable") ||
              errorText.includes("not running") ||
              errorText.includes("leave your current game") ||
              errorText.includes("another active game") ||
              errorText.includes("rejoining") ||
              errorText.includes("waiting");
            if (retryable && tournamentJoinAttemptsRef.current < 5) {
              setIsSearching(true);
              setQueueStatus("Waiting for your tournament opponent...");
              if (tournamentJoinRetryTimerRef.current !== null) {
                window.clearTimeout(tournamentJoinRetryTimerRef.current);
              }
              tournamentJoinRetryTimerRef.current = window.setTimeout(() => {
                tournamentJoinRetryTimerRef.current = null;
                joinTournamentGame(normalizedGameId, playerNameRef.current);
              }, 5000);
              return;
            }
            setIsSearching(false);
            setQueueStatus(
              response?.error || "Failed to join tournament game after retries.",
            );
            return;
          }
          if (response.status === "waiting") {
            setIsSearching(true);
            setQueueStatus("Waiting for your tournament opponent...");
            if (tournamentJoinAttemptsRef.current < 5) {
              if (tournamentJoinRetryTimerRef.current !== null) {
                window.clearTimeout(tournamentJoinRetryTimerRef.current);
              }
              tournamentJoinRetryTimerRef.current = window.setTimeout(() => {
                tournamentJoinRetryTimerRef.current = null;
                joinTournamentGame(normalizedGameId, playerNameRef.current);
              }, 5000);
            } else {
              setIsSearching(false);
              setQueueStatus("Unable to connect to opponent. Please retry.");
            }
            return;
          }
          if (response.status === "started" && !gameIdRef.current) {
            setQueueStatus("Starting game...");
          }
          clearTournamentJoinRetry();
        },
      );
      if (!emitted) {
        if (attempt >= 5) {
          setIsSearching(false);
          setQueueStatus("Unable to reconnect to your tournament board.");
          return;
        }
        if (tournamentJoinRetryTimerRef.current !== null) {
          window.clearTimeout(tournamentJoinRetryTimerRef.current);
        }
        tournamentJoinRetryTimerRef.current = window.setTimeout(() => {
          tournamentJoinRetryTimerRef.current = null;
          joinTournamentGame(normalizedGameId, playerNameRef.current);
        }, 5000);
      }
    },
    [clearTournamentJoinRetry, emitIfConnected, resetGameState],
  );

  const leaveTournamentJoin = useCallback(() => {
    clearTournamentJoinRetry();
    setIsSearching(false);
    setQueueStatus(null);
  }, [clearTournamentJoinRetry]);

  const cancelMatch = useCallback(() => {
    clearTournamentJoinRetry();
    emitIfConnected("cancelFind");
    setIsSearching(false);
  }, [clearTournamentJoinRetry, emitIfConnected]);

  const resign = useCallback(() => {
    if (!gameId) return;
    emitIfConnected("resign", { gameId });
  }, [emitIfConnected, gameId]);

  const offerDraw = useCallback(() => {
    if (!gameId || gameOver) return;
    emitIfConnected("offerDraw", { gameId }, (response) => {
      const ack = response as SocketAckResponse | undefined;
      if (ack?.success === false) {
        setQueueStatus(ack.error || "Unable to offer draw.");
        return;
      }
      setDrawOfferState({
        status: "sent",
        offeredBy: playerColorRef.current,
        expiresAt: Number(ack?.expiresAt || 0) || null,
      });
    });
  }, [emitIfConnected, gameId, gameOver]);

  const respondDrawOffer = useCallback(
    (accept: boolean) => {
      if (!gameId || gameOver) return;
      emitIfConnected(
        "respondDrawOffer",
        { gameId, accept },
        (response) => {
          const ack = response as SocketAckResponse | undefined;
          if (ack?.success === false) {
            setQueueStatus(ack.error || "Unable to respond to draw offer.");
            return;
          }
          if (!accept) {
            setDrawOfferState(idleDrawOfferState);
          }
        },
      );
    },
    [emitIfConnected, gameId, gameOver],
  );

  const timeOut = useCallback(
    (isPlayer: boolean) => {
      if (!gameId) return;
      if (!isPlayer) return;
      emitIfConnected("timeout", { gameId });
    },
    [emitIfConnected, gameId],
  );

  const leaveGame = useCallback(() => {
    if (!gameId) return;
    emitIfConnected("leaveGame", { gameId });
    resetGameState();
  }, [emitIfConnected, gameId, resetGameState]);

  const addChess960CastlingTargets = useCallback(
    (currentGame: Chess, kingSquare: Square) => {
      if (matchVariant !== "chess960" || !showLegalMoves) return;

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
    [matchVariant, playerColor, showLegalMoves],
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
        if (!premoves) return false;
        queuePreMove({ from, to, promotion });
        clearSelection();
        return true;
      }
      const activeGameId = gameIdRef.current || gameId;
      if (!activeGameId) return false;

      playLocalMoveSound(from, to, promotion);

      emitIfConnected("makeMove", {
        gameId: activeGameId,
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
      premoves,
      pendingPromoFrom,
      playLocalMoveSound,
      promotionToSquare,
      queuePreMove,
      gameId,
      emitIfConnected,
    ],
  );

  const onSquareClick = useCallback(
    (square: Square) => {
      if (!gameStarted || gameOver) return;
      const currentGame = gameRef.current;

      if (!isPlayerTurn) {
        if (!premoves) {
          clearSelection();
          return;
        }

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
        if (
          matchVariantRef.current === "atomic" &&
          isAtomicKingCaptureAttempt(currentGame, moveFrom, square, playerColor)
        ) {
          playGameplaySound("illegal");
          clearSelection();
          return;
        }

        const isPromo =
          sourcePiece.type === "p" &&
          isPromotionTargetSquare(sourcePiece.color as PlayerColor, square);

        if (isPromo) {
          if (autoQueen) {
            queuePreMove({ from: moveFrom, to: square, promotion: "q" });
            clearSelection();
            return;
          }
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

      const isLegalStandardMove = currentGame
        .moves({ square: moveFrom, verbose: true })
        .some((move) => move.to === square && isMoveAllowedForVariant(move));
      const isLegalChess960Castle = isChess960CastlingDrop(
        currentGame,
        moveFrom,
        square,
      );

      if (isLegalStandardMove || isLegalChess960Castle) {
        const activeGameId = gameIdRef.current || gameId;
        if (!activeGameId) {
          playGameplaySound("illegal");
          clearSelection();
          return;
        }

        // Check for promotion
        const srcPiece = currentGame.get(moveFrom);
        const isPromo =
          srcPiece?.type === "p" &&
          ((srcPiece.color === "w" && square[1] === "8") ||
            (srcPiece.color === "b" && square[1] === "1"));

        if (isPromo) {
          if (autoQueen) {
            playLocalMoveSound(moveFrom, square, "q");
            emitIfConnected("makeMove", {
              gameId: activeGameId,
              from: moveFrom,
              to: square,
              promotion: "q",
            });
            clearSelection();
            return;
          }
          setPendingPromoFrom(moveFrom);
          setPromotionToSquare(square);
          setShowPromotionDialog(true);
          clearSelection();
          return;
        }

        playLocalMoveSound(moveFrom, square, "q");
        emitIfConnected("makeMove", {
          gameId: activeGameId,
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
      autoQueen,
      isChess960CastlingDrop,
      clearSelection,
      gameId,
      gameOver,
      gameStarted,
      addChess960CastlingTargets,
      getMoveOptions,
      isMoveAllowedForVariant,
      isPlayerTurn,
      moveFrom,
      playLocalMoveSound,
      playerColor,
      premoves,
      queuePreMove,
      selectPreMoveSource,
      emitIfConnected,
    ],
  );

  const onPieceDrop = useCallback(
    (sourceSquare: Square, targetSquare: Square, piece?: string) => {
      if (!gameStarted || gameOver) return false;
      const activeGameId = gameIdRef.current || gameId;
      if (!activeGameId) return false;

      const currentGame = gameRef.current;
      const sourcePiece = currentGame.get(sourceSquare);
      if (!sourcePiece || sourcePiece.color !== playerColor) {
        playGameplaySound("illegal");
        return false;
      }

      if (!isPlayerTurn) {
        if (!premoves) {
          clearSelection();
          return false;
        }

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
        if (
          matchVariantRef.current === "atomic" &&
          isAtomicKingCaptureAttempt(
            currentGame,
            sourceSquare,
            targetSquare,
            playerColor,
          )
        ) {
          playGameplaySound("illegal");
          clearSelection();
          return false;
        }

        const isPromo =
          sourcePiece.type === "p" &&
          isPromotionTargetSquare(
            sourcePiece.color as PlayerColor,
            targetSquare,
          );
        if (isPromo) {
          if (autoQueen) {
            queuePreMove({
              from: sourceSquare,
              to: targetSquare,
              promotion: "q",
            });
            clearSelection();
            return false;
          }
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
        .some(
          (move) =>
            move.to === targetSquare && isMoveAllowedForVariant(move),
        );
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
        if (autoQueen) {
          emitIfConnected("makeMove", {
            gameId: activeGameId,
            from: sourceSquare,
            to: targetSquare,
            promotion: "q",
          });
          playLocalMoveSound(sourceSquare, targetSquare, "q");
          clearSelection();
          return true;
        }
        setPendingPromoFrom(sourceSquare);
        setPromotionToSquare(targetSquare);
        setShowPromotionDialog(true);
        clearSelection();
        return false;
      }

      const promotion = extractPromo(piece);
      emitIfConnected("makeMove", {
        gameId: activeGameId,
        from: sourceSquare,
        to: targetSquare,
        promotion,
      });
      playLocalMoveSound(sourceSquare, targetSquare, promotion);
      clearSelection();
      return true;
    },
    [
      autoQueen,
      addChess960CastlingTargets,
      clearSelection,
      gameOver,
      gameStarted,
      gameId,
      getMoveOptions,
      isChess960CastlingDrop,
      isMoveAllowedForVariant,
      isPlayerTurn,
      playLocalMoveSound,
      playerColor,
      premoves,
      queuePreMove,
      selectPreMoveSource,
      emitIfConnected,
    ],
  );

  const isDraggablePiece = useCallback(
    (sourceSquare: Square) => {
      if (!gameStarted || gameOver) return false;
      if (!isPlayerTurn && !premoves) return false;
      const piece = gameRef.current.get(sourceSquare);
      return !!piece && piece.color === playerColor;
    },
    [gameOver, gameStarted, isPlayerTurn, playerColor, premoves],
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

  useEffect(() => {
    if (premoves) return;
    clearPreMove();
    if (!isPlayerTurn) {
      clearSelection();
    }
  }, [clearPreMove, clearSelection, isPlayerTurn, premoves]);

  useEffect(() => {
    if (clockDisplayIntervalRef.current !== null) {
      window.clearInterval(clockDisplayIntervalRef.current);
      clockDisplayIntervalRef.current = null;
    }

    const hasTimeControl = Number(gameSettings.timeControl.initial) > 0;
    if (!gameStarted || gameOver || isClockPaused || !hasTimeControl) {
      return undefined;
    }

    lastClockTickAtRef.current = Date.now();
    clockDisplayIntervalRef.current = window.setInterval(() => {
      const now = Date.now();
      const elapsedMs = Math.max(0, now - lastClockTickAtRef.current);
      lastClockTickAtRef.current = now;
      const elapsedSeconds = Math.max(
        0.1,
        Math.round((elapsedMs / 1000) * 10) / 10,
      );

      // JS can be paused by browser dialogs/sleep; force a server resync after long gaps.
      if (elapsedMs > 1500) {
        requestClockResync();
      }

      if (isPlayerTurn) {
        setPlayerTime((previous) => {
          const next = Math.max(
            0,
            Math.round((previous - elapsedSeconds) * 10) / 10,
          );
          setPlayerClockSeed(next);
          return next;
        });
        return;
      }

      setOpponentTime((previous) => {
        const next = Math.max(
          0,
          Math.round((previous - elapsedSeconds) * 10) / 10,
        );
        setOpponentClockSeed(next);
        return next;
      });
    }, 100);

    return () => {
      if (clockDisplayIntervalRef.current !== null) {
        window.clearInterval(clockDisplayIntervalRef.current);
        clockDisplayIntervalRef.current = null;
      }
    };
  }, [
    gameOver,
    gameSettings.timeControl.initial,
    gameStarted,
    isClockPaused,
    isPlayerTurn,
    requestClockResync,
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return undefined;
    }

    const handleClockResync = () => {
      requestClockResync();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      handleClockResync();
    };

    window.addEventListener("focus", handleClockResync);
    window.addEventListener("pageshow", handleClockResync);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", handleClockResync);
      window.removeEventListener("pageshow", handleClockResync);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [requestClockResync]);

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
    activeGameId: gameId,
    savedGameId,
    historyPersistenceStatus,
    lastMove,
    opponentName,
    playerRating,
    opponentRating,
    isRatedMatch,
    lastGameOver,

    // UI state
    showGameOverModal,
    optionSquares,
    preMoveSquares,
    playerTime,
    opponentTime,
    playerClockSeed,
    opponentClockSeed,
    clockResetToken,
    isClockPaused,
    setPlayerTime,
    setOpponentTime,
    isSearching,
    queueStatus,
    isConnected,
    matchVariant,
    threeCheckState,
    drawOfferState,

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
    offerDraw,
    respondDrawOffer,
    timeOut,
    rematch,
    leaveGame,
  };
}
