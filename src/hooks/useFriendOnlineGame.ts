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
import {
  formatPerspectiveResult,
  isAtomicKingCaptureAttempt,
  isAtomicVerboseMoveAllowed,
  isUnratedVariant,
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
import i18n from "../i18n";

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
const BOARD_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const ACTIVE_FRIEND_GAME_STORAGE_KEY = "neongambit:activeFriendGameId";

function storeActiveFriendGameId(gameId: string | null) {
  if (!gameId) {
    clearActiveOnlineGame();
  } else {
    const existing = readActiveOnlineGame();
    storeActiveOnlineGame({
      ...existing,
      gameId,
      kind: "classic",
      mode: "friend",
    });
  }
  if (typeof window === "undefined") return;
  try {
    if (!gameId) {
      window.localStorage.removeItem(ACTIVE_FRIEND_GAME_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(ACTIVE_FRIEND_GAME_STORAGE_KEY, String(gameId));
  } catch {
    // ignore storage errors
  }
}

function readActiveFriendGameId() {
  const existing = readActiveOnlineGame();
  if (
    existing?.kind === "classic" &&
    existing.mode === "friend" &&
    existing.gameId
  ) {
    return existing.gameId;
  }
  if (typeof window === "undefined") return "";
  try {
    return String(
      window.localStorage.getItem(ACTIVE_FRIEND_GAME_STORAGE_KEY) || "",
    ).trim();
  } catch {
    return "";
  }
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
    normalized === "kingofthehill" ||
    normalized === "king-of-hill" ||
    normalized === "king_of_hill" ||
    normalized === "king-of-the-hill" ||
    normalized === "king_of_the_hill"
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

function readFriendRouteVariantFromLocation(): MatchVariant | null {
  if (typeof window === "undefined") return null;
  try {
    const rawVariant = new URLSearchParams(window.location.search).get("variant");
    if (!rawVariant) return null;
    return normalizeMatchVariant(rawVariant);
  } catch {
    return null;
  }
}

function resolveFriendHistoryVariant(fallbackVariant: MatchVariant): MatchVariant {
  const routeVariant = readFriendRouteVariantFromLocation();
  if (routeVariant) return routeVariant;

  const activeGame = readActiveOnlineGame();
  const activeVariant = String(activeGame?.variant || "").trim();
  if (activeVariant) {
    return normalizeMatchVariant(activeVariant);
  }

  return fallbackVariant;
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

interface MatchFoundPayload {
  gameId: string;
  color: PlayerColor;
  fen: string;
  initialFen?: string;
  opponentName?: string;
  opponentUserId?: string | null;
  rated?: boolean;
  playerRating?: number;
  opponentRating?: number;
  timeControl?: { initial: number; increment: number };
  variant?: MatchVariant | string;
  whiteCheckCount?: number;
  blackCheckCount?: number;
  restored?: boolean;
  moves?: string[];
  whiteTimeLeft?: number;
  blackTimeLeft?: number;
  playerClock?: number;
  opponentClock?: number;
  clockPaused?: boolean;
  chatMessages?: ChatMessagePayload[];
}

interface GameStateRestoredPayload {
  gameId: string;
  color?: PlayerColor;
  fen?: string;
  initialFen?: string;
  moves?: string[];
  whiteTimeLeft?: number;
  blackTimeLeft?: number;
  playerClock?: number;
  opponentClock?: number;
  clockPaused?: boolean;
  chatMessages?: ChatMessagePayload[];
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

interface RejoinGameResponse {
  success?: boolean;
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
  matched?: boolean;
  reason?: string;
  gameId?: string;
  expiresAt?: number;
  delivered?: boolean;
}

interface GameSystemMessagePayload {
  gameId: string;
  message?: string;
  targetColor?: PlayerColor | null;
}

interface ChatMessagePayload {
  matchId?: string;
  senderId?: string;
  senderUsername?: string;
  message?: string;
  timestamp?: string;
}

interface FriendMatchChatMessage {
  id: string;
  senderId: string;
  senderUsername: string;
  content: string;
  createdAt: string;
  isSystem?: boolean;
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

function createChatMessageId() {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const idleDrawOfferState: DrawOfferState = {
  status: "idle",
  offeredBy: null,
  expiresAt: null,
};

export function useFriendOnlineGame() {
  const { user, setUser } = useAuthStore();
  const { autoQueen, premoves, showLegalMoves } = useGameplayPreferences();
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
  const [gameId, setGameId] = useState<string | null>(() => {
    const stored = readActiveFriendGameId();
    return stored || null;
  });
  const [opponentName, setOpponentName] = useState("Friend");
  const [opponentUserId, setOpponentUserId] = useState<string | null>(null);
  const [playerRating, setPlayerRating] = useState<number | null>(null);
  const [opponentRating, setOpponentRating] = useState<number | null>(null);
  const [gameType, setGameType] = useState("standard");
  const [matchVariant, setMatchVariant] = useState<MatchVariant>("standard");
  const [isRated, setIsRated] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<FriendMatchChatMessage[]>([]);
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

  const gameIdRef = useRef<string | null>(readActiveFriendGameId() || null);
  const playerColorRef = useRef<PlayerColor>("w");
  const currentTurnRef = useRef<PlayerColor>("w");
  const matchVariantRef = useRef<MatchVariant>("standard");
  const pendingPreMoveRef = useRef<PreMove | null>(null);
  const playerNameRef = useRef<string>("Player");
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

  const appendSystemMessage = useCallback((message: string | null | undefined) => {
    const normalizedMessage = String(message || "").trim();
    if (!normalizedMessage) return;
    if (normalizedMessage.toLowerCase() === "game state restored.") return;
    setChatMessages((previous) => {
      const lastMessage = previous[previous.length - 1];
      if (
        lastMessage?.isSystem === true &&
        String(lastMessage.content || "").trim() === normalizedMessage
      ) {
        return previous;
      }
      return [
        ...previous,
        {
          id: createChatMessageId(),
          senderId: "system",
          senderUsername: "System",
          content: normalizedMessage,
          createdAt: new Date().toISOString(),
          isSystem: true,
        },
      ];
    });
  }, []);

  const appendChatMessage = useCallback((payload: ChatMessagePayload) => {
    const senderId = String(payload.senderId || "").trim();
    const senderUsername = String(payload.senderUsername || "").trim();
    const message = String(payload.message || "").trim();
    const matchId = String(payload.matchId || "").trim();
    if (!senderId || !senderUsername || !message || !matchId) return;

    const createdAt = String(payload.timestamp || new Date().toISOString());
    const messageKey = `${senderId}|${createdAt}|${message}`;

    setChatMessages((previous) => {
      const hasDuplicate = previous.some(
        (entry) =>
          `${entry.senderId}|${String(entry.createdAt || "").trim()}|${entry.content}` ===
          messageKey,
      );
      if (hasDuplicate) return previous;

      return [
        ...previous,
        {
          id: createChatMessageId(),
          senderId,
          senderUsername,
          content: message,
          createdAt,
        },
      ];
    });
  }, []);

  const replaceChatMessages = useCallback((messages?: ChatMessagePayload[]) => {
    if (!Array.isArray(messages)) return;
    const seenMessageKeys = new Set<string>();
    const normalized = messages
      .map((entry) => {
        const senderId = String(entry?.senderId || "").trim();
        const senderUsername = String(entry?.senderUsername || "").trim();
        const content = String(entry?.message || "").trim();
        const matchId = String(entry?.matchId || "").trim();
        if (!senderId || !senderUsername || !content || !matchId) return null;
        const createdAt = String(entry?.timestamp || new Date().toISOString());
        const messageKey = `${senderId}|${createdAt}|${content}`;
        if (seenMessageKeys.has(messageKey)) return null;
        seenMessageKeys.add(messageKey);
        return {
          id: createChatMessageId(),
          senderId,
          senderUsername,
          content,
          createdAt,
        };
      })
      .filter((entry): entry is FriendMatchChatMessage => entry !== null);
    setChatMessages(normalized);
  }, []);

  const isMoveAllowedForVariant = useCallback((move: any) => {
    if (matchVariantRef.current !== "atomic") return true;
    return isAtomicVerboseMoveAllowed(move);
  }, []);
  const getMoveOptions = useMoveOptions(
    gameRef,
    setOptionSquares,
    isMoveAllowedForVariant,
  );
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

  useEffect(() => {
    const notice = consumeActiveGameRedirectNotice();
    if (notice) {
      setStatusMessage(notice);
    }
  }, []);

  useEffect(() => {
    if (!statusMessage) return;
    if (!gameStarted && !gameIdRef.current) return;
    appendSystemMessage(statusMessage);
  }, [appendSystemMessage, gameStarted, statusMessage]);

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
    storeActiveFriendGameId(null);
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
    setChatMessages([]);
    setPlayerTime(defaultGameSettings.timeControl.initial);
    setOpponentTime(defaultGameSettings.timeControl.initial);
    setPlayerClockSeed(defaultGameSettings.timeControl.initial);
    setOpponentClockSeed(defaultGameSettings.timeControl.initial);
    setClockResetToken((value) => value + 1);
    setIsClockPaused(false);
    startTimeRef.current = null;
    startingFenRef.current = "";
    historySavedRef.current = false;
    setLastGameOver(null);
    setDrawOfferState(idleDrawOfferState);
    setThreeCheckState(normalizeThreeCheckCounts());
  }, [resetStoredMoves]);

  const applyFriendGameStart = useCallback(
    (
      payload: FriendGameStartedPayload,
      options: { resetChat?: boolean } = {},
    ) => {
      const nextGame = new Chess(payload.fen);
      gameRef.current = nextGame;
      setGame(nextGame);
      const startingTurn = nextGame.turn() as PlayerColor;
      currentTurnRef.current = startingTurn;
      setCurrentTurn(startingTurn);
      const normalizedInitialFen = String(payload.initialFen || "").trim();
      startingFenRef.current = normalizedInitialFen || payload.fen || nextGame.fen();
      resetStoredMoves();
      setLastMove(null);
      setMoveFrom(null);
      setOptionSquares({});
      setShowPromotionDialog(false);
      setPromotionToSquare(null);
      setPendingPromoFrom(null);
      setGameId(payload.gameId);
      gameIdRef.current = payload.gameId;
      storeActiveFriendGameId(payload.gameId);
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
      storeActiveOnlineGame({
        gameId: payload.gameId,
        kind: "classic",
        mode: "friend",
        variant: normalizedVariant,
        opponentName: payload.opponentName || "Friend",
        timeControl,
      });
      const ratingPool = getRatingPoolForMatch(timeControl, normalizedVariant);
      const canShowRatedInfo =
        payload.rated === true &&
        ratingPool !== null &&
        !isUnratedVariant(normalizedVariant);
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
      setIsRated(canShowRatedInfo);
      setGameStarted(true);
      setGameOver(false);
      setGameResult(null);
      setShowGameOverModal(false);
      setStatusMessage(null);
      if (options.resetChat !== false) {
        setChatMessages([]);
      }
      setSavedGameId(null);
      setHistoryPersistenceStatus("idle");
      historySavedRef.current = false;
      startTimeRef.current = Date.now();
      setLastGameOver(null);
      setDrawOfferState(idleDrawOfferState);
      setThreeCheckState(normalizeThreeCheckCounts(payload));
      playGameplaySound("gameStart", { onceKey: payload.gameId });

      setGameSettings({
        ...defaultGameSettings,
        playAs: payload.color === "w" ? "white" : "black",
        difficulty: 0,
        timeControl,
      });
      const whiteClock = Number(payload.whiteTimeLeft);
      const blackClock = Number(payload.blackTimeLeft);
      const playerClockRaw = Number(payload.playerClock);
      const opponentClockRaw = Number(payload.opponentClock);
      const playerClock =
        Number.isFinite(playerClockRaw)
          ? Math.max(0, playerClockRaw)
          : Number.isFinite(whiteClock) && Number.isFinite(blackClock)
            ? payload.color === "w"
              ? Math.max(0, whiteClock)
              : Math.max(0, blackClock)
            : timeControl.initial;
      const opponentClock =
        Number.isFinite(opponentClockRaw)
          ? Math.max(0, opponentClockRaw)
          : Number.isFinite(whiteClock) && Number.isFinite(blackClock)
            ? payload.color === "w"
              ? Math.max(0, blackClock)
              : Math.max(0, whiteClock)
            : timeControl.initial;
      setPlayerTime(playerClock);
      setOpponentTime(opponentClock);
      setPlayerClockSeed(playerClock);
      setOpponentClockSeed(opponentClock);
      setClockResetToken((value) => value + 1);
      setIsClockPaused(false);
    },
    [resetStoredMoves],
  );

  const requestClockResync = useCallback(
    (
      targetGameId?: string | null,
      options: { allowEmpty?: boolean } = {},
    ) => {
      if (!socket || !socket.connected) return;

      const explicitGameId = String(
        targetGameId || gameIdRef.current || readActiveFriendGameId() || "",
      ).trim();
      if (!explicitGameId && options.allowEmpty !== true) return;

      const payload = explicitGameId ? { gameId: explicitGameId } : {};
      socket.emit(
        "rejoinGame",
        payload,
        (response?: RejoinGameResponse) => {
          if (response?.success === true) {
            const restoredGameId = String(
              response.gameId || explicitGameId || "",
            ).trim();
            if (restoredGameId) {
              storeActiveFriendGameId(restoredGameId);
              setStatusMessage("Game restored after reconnect.");
            }
            return;
          }

          if (response?.error) {
            const normalizedError = String(response.error).toLowerCase();
            if (
              normalizedError.includes("not found") ||
              normalizedError.includes("no active game") ||
              normalizedError.includes("not a participant")
            ) {
              storeActiveFriendGameId(null);
            }
          }
        },
      );
    },
    [socket],
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

    const handleConnect = () => {
      if (!gameIdRef.current && !readActiveFriendGameId()) {
        setIsClockPaused(false);
      }
      requestClockResync(null, { allowEmpty: true });
    };

    const handleDisconnect = () => {
      if (gameIdRef.current || readActiveFriendGameId()) {
        setIsClockPaused(false);
        setStatusMessage("Connection lost. Reconnecting. Clock continues server-side...");
      }
    };

    const handleConnectError = () => {
      if (gameIdRef.current || readActiveFriendGameId()) {
        setIsClockPaused(false);
        setStatusMessage("Reconnecting to realtime server. Clock continues server-side...");
      }
    };

    const handleMatchFound = (payload: MatchFoundPayload) => {
      const normalizedGameId = String(payload?.gameId || "").trim();
      if (!normalizedGameId) return;
      const currentGameId = String(gameIdRef.current || "").trim();
      const isRestoreForSameGame =
        payload.restored === true &&
        currentGameId.length > 0 &&
        currentGameId === normalizedGameId;

      const normalizedVariant = normalizeMatchVariant(payload.variant);
      applyFriendGameStart({
        challengeId: "",
        gameId: normalizedGameId,
        color: payload.color === "b" ? "b" : "w",
        fen: payload.fen || gameRef.current.fen(),
        initialFen: payload.initialFen,
        opponentUserId: payload.opponentUserId
          ? String(payload.opponentUserId)
          : undefined,
        opponentName: payload.opponentName || "Friend",
        playerRating: payload.playerRating,
        opponentRating: payload.opponentRating,
        timeControl: payload.timeControl || defaultGameSettings.timeControl,
        gameType: normalizedVariant,
        variant: normalizedVariant,
        whiteCheckCount: payload.whiteCheckCount,
        blackCheckCount: payload.blackCheckCount,
        rated: payload.rated === true,
      }, { resetChat: !isRestoreForSameGame });

      if (Array.isArray(payload.moves)) {
        const restoredMoves = payload.moves.filter(
          (move) => typeof move === "string" && move.trim().length > 0,
        );
        movesRef.current = restoredMoves;
        setMoves(restoredMoves);
      }
      if (Array.isArray(payload.chatMessages)) {
        replaceChatMessages(payload.chatMessages);
      }

      const whiteClock = Number(payload.whiteTimeLeft);
      const blackClock = Number(payload.blackTimeLeft);
      if (Number.isFinite(whiteClock) && Number.isFinite(blackClock)) {
        const side = payload.color === "b" ? "b" : "w";
        const ownClock = side === "w" ? whiteClock : blackClock;
        const oppClock = side === "w" ? blackClock : whiteClock;
        const normalizedOwnClock = Math.max(0, ownClock);
        const normalizedOpponentClock = Math.max(0, oppClock);
        setPlayerTime(normalizedOwnClock);
        setOpponentTime(normalizedOpponentClock);
        setPlayerClockSeed(normalizedOwnClock);
        setOpponentClockSeed(normalizedOpponentClock);
        setClockResetToken((value) => value + 1);
      }
      setIsClockPaused(false);

      if (payload.restored === true) {
        setStatusMessage("Game restored after reconnect.");
      }
    };

    const handleGameStateRestored = (payload: GameStateRestoredPayload) => {
      const normalizedGameId = String(payload?.gameId || "").trim();
      if (!normalizedGameId) return;

      setGameId(normalizedGameId);
      gameIdRef.current = normalizedGameId;
      storeActiveFriendGameId(normalizedGameId);
      const existingActiveGame = readActiveOnlineGame();
      storeActiveOnlineGame({
        ...existingActiveGame,
        gameId: normalizedGameId,
        kind: "classic",
        mode: "friend",
        variant: existingActiveGame?.variant || matchVariantRef.current,
        opponentName: existingActiveGame?.opponentName || opponentName,
        timeControl: existingActiveGame?.timeControl || gameSettings.timeControl,
      });
      setGameStarted(true);
      setGameOver(false);
      setShowGameOverModal(false);
      setGameResult(null);

      const playerSide =
        (payload.color || playerColorRef.current || "w") === "b" ? "b" : "w";
      setPlayerColor(playerSide);
      playerColorRef.current = playerSide;

      const restoredFen = String(payload.fen || "").trim();
      if (restoredFen) {
        try {
          const restoredGame = new Chess(restoredFen);
          gameRef.current = restoredGame;
          setGame(restoredGame);
          const turn = restoredGame.turn() as PlayerColor;
          currentTurnRef.current = turn;
          setCurrentTurn(turn);
        } catch {
          // ignore malformed restore payloads
        }
      }
      const restoredInitialFen = String(payload.initialFen || "").trim();
      if (restoredInitialFen) {
        startingFenRef.current = restoredInitialFen;
      } else if (!startingFenRef.current) {
        startingFenRef.current = restoredFen || gameRef.current.fen();
      }

      if (Array.isArray(payload.moves)) {
        const restoredMoves = payload.moves.filter(
          (move) => typeof move === "string" && move.trim().length > 0,
        );
        movesRef.current = restoredMoves;
        setMoves(restoredMoves);
      }
      if (Array.isArray(payload.chatMessages)) {
        replaceChatMessages(payload.chatMessages);
      }

      const whiteClock = Number(payload.whiteTimeLeft);
      const blackClock = Number(payload.blackTimeLeft);
      const playerClockRaw = Number(payload.playerClock);
      const opponentClockRaw = Number(payload.opponentClock);
      if (
        Number.isFinite(whiteClock) &&
        Number.isFinite(blackClock)
      ) {
        const playerClock = Number.isFinite(playerClockRaw)
          ? Math.max(0, playerClockRaw)
          : playerSide === "w"
            ? Math.max(0, whiteClock)
            : Math.max(0, blackClock);
        const opponentClock = Number.isFinite(opponentClockRaw)
          ? Math.max(0, opponentClockRaw)
          : playerSide === "w"
            ? Math.max(0, blackClock)
            : Math.max(0, whiteClock);
        setPlayerTime(playerClock);
        setOpponentTime(opponentClock);
        setPlayerClockSeed(playerClock);
        setOpponentClockSeed(opponentClock);
        setClockResetToken((value) => value + 1);
      }

      setIsClockPaused(false);
      setStatusMessage("Game restored after reconnect.");
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
      } else if (matchVariantRef.current === "atomic") {
        const previewGame = new Chess(gameRef.current.fen());
        const applied = previewGame.move({
          from: payload.move.from,
          to: payload.move.to,
          promotion: (payload.move as { promotion?: string }).promotion || "q",
        });
        const nextGame = new Chess(payload.fen);
        gameRef.current = nextGame;
        setGame(nextGame);
        appendStoredMove(payload.move.san || applied?.san);
        if (isOpponentMove) {
          playChessMoveSound(applied || payload.move, { isOpponentMove: true });
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
      storeActiveFriendGameId(null);
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
      if (
        matchVariantRef.current === "threeCheck" &&
        (payload.whiteCheckCount !== undefined ||
          payload.blackCheckCount !== undefined)
      ) {
        setThreeCheckState(normalizeThreeCheckCounts(payload));
      }
      playGameplaySound("gameEnd");

      const currentUser = userRef.current;
      if (
        !currentUser?.id ||
        !payload.elo?.applied ||
        isUnratedVariant(matchVariantRef.current)
      ) {
        return;
      }

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

    const handleChatMessage = (payload: ChatMessagePayload) => {
      const normalizedMatchId = String(payload.matchId || "").trim();
      const currentMatchId = String(gameIdRef.current || "").trim();
      if (!normalizedMatchId || !currentMatchId) return;
      if (normalizedMatchId !== currentMatchId) return;
      appendChatMessage(payload);
    };

    const handleDrawOfferPending = (payload: DrawOfferPayload) => {
      if (payload.gameId !== gameIdRef.current) return;
      setDrawOfferState({
        status: "sent",
        offeredBy: payload.offeredBy || playerColorRef.current,
        expiresAt: Number(payload.expiresAt || 0) || null,
      });
      setStatusMessage(i18n.t("quickMatch.draw.offerSent", "Draw offer sent."));
    };

    const handleDrawOfferReceived = (payload: DrawOfferPayload) => {
      if (payload.gameId !== gameIdRef.current) return;
      if (payload.offeredBy && payload.offeredBy === playerColorRef.current) {
        setDrawOfferState({
          status: "sent",
          offeredBy: payload.offeredBy,
          expiresAt: Number(payload.expiresAt || 0) || null,
        });
        return;
      }
      setDrawOfferState({
        status: "received",
        offeredBy: payload.offeredBy || null,
        expiresAt: Number(payload.expiresAt || 0) || null,
      });
      setStatusMessage(
        i18n.t(
          "quickMatch.draw.opponentOffered",
          "Your opponent offered a draw.",
        ),
      );
    };

    const handleDrawOfferAccepted = (payload: DrawOfferPayload) => {
      if (payload.gameId !== gameIdRef.current) return;
      setDrawOfferState(idleDrawOfferState);
      setStatusMessage(
        i18n.t("quickMatch.draw.offerAccepted", "Draw offer accepted."),
      );
    };

    const handleDrawOfferDeclined = (payload: DrawOfferPayload) => {
      if (payload.gameId !== gameIdRef.current) return;
      setDrawOfferState(idleDrawOfferState);
      setStatusMessage(
        payload.reason === "move"
          ? i18n.t(
              "quickMatch.draw.offerDeclinedByMove",
              "Draw offer declined by move.",
            )
          : i18n.t("quickMatch.draw.offerDeclined", "Draw offer declined."),
      );
    };

    const handleDrawOfferExpired = (payload: DrawOfferPayload) => {
      if (payload.gameId !== gameIdRef.current) return;
      setDrawOfferState(idleDrawOfferState);
      setStatusMessage(i18n.t("quickMatch.draw.offerExpired", "Draw offer expired."));
    };

    const handleOpponentDisconnected = (payload?: {
      gameId?: string;
      graceMs?: number;
      opponentColor?: PlayerColor;
    }) => {
      if (payload?.gameId && payload.gameId !== gameIdRef.current) return;
      if (payload?.opponentColor === playerColorRef.current) return;
      setIsClockPaused(false);
      setStatusMessage("Opponent disconnected. Their clock is still running.");
    };

    const handleOpponentReconnected = (payload?: {
      gameId?: string;
      color?: PlayerColor;
    }) => {
      if (payload?.gameId && payload.gameId !== gameIdRef.current) return;
      if (payload?.color === playerColorRef.current) return;
      setIsClockPaused(false);
      setStatusMessage("Opponent reconnected.");
    };

    const handleOpponentAbandoned = (payload?: { gameId?: string }) => {
      if (payload?.gameId && payload.gameId !== gameIdRef.current) return;
      setIsClockPaused(false);
      setStatusMessage("Opponent abandoned the game.");
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("matchFound", handleMatchFound);
    socket.on("game_state_restored", handleGameStateRestored);
    socket.on("friendGameStarted", handleFriendGameStarted);
    socket.on("moveApplied", handleMoveApplied);
    socket.on("moveRejected", handleMoveRejected);
    socket.on("gameOver", handleGameOver);
    socket.on("gameSystemMessage", handleGameSystemMessage);
    socket.on("chatMessage", handleChatMessage);
    socket.on("drawOfferPending", handleDrawOfferPending);
    socket.on("drawOfferReceived", handleDrawOfferReceived);
    socket.on("drawOfferAccepted", handleDrawOfferAccepted);
    socket.on("drawOfferDeclined", handleDrawOfferDeclined);
    socket.on("drawOfferExpired", handleDrawOfferExpired);
    socket.on("opponent_disconnected", handleOpponentDisconnected);
    socket.on("opponent_reconnected", handleOpponentReconnected);
    socket.on("opponent_abandoned", handleOpponentAbandoned);

    if (socket.connected) {
      requestClockResync(readActiveFriendGameId() || gameIdRef.current, {
        allowEmpty: true,
      });
    } else if (readActiveFriendGameId()) {
      setIsClockPaused(false);
      setStatusMessage("Reconnecting to realtime server. Clock continues server-side...");
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("matchFound", handleMatchFound);
      socket.off("game_state_restored", handleGameStateRestored);
      socket.off("friendGameStarted", handleFriendGameStarted);
      socket.off("moveApplied", handleMoveApplied);
      socket.off("moveRejected", handleMoveRejected);
      socket.off("gameOver", handleGameOver);
      socket.off("gameSystemMessage", handleGameSystemMessage);
      socket.off("chatMessage", handleChatMessage);
      socket.off("drawOfferPending", handleDrawOfferPending);
      socket.off("drawOfferReceived", handleDrawOfferReceived);
      socket.off("drawOfferAccepted", handleDrawOfferAccepted);
      socket.off("drawOfferDeclined", handleDrawOfferDeclined);
      socket.off("drawOfferExpired", handleDrawOfferExpired);
      socket.off("opponent_disconnected", handleOpponentDisconnected);
      socket.off("opponent_reconnected", handleOpponentReconnected);
      socket.off("opponent_abandoned", handleOpponentAbandoned);
    };
  }, [
    socket,
    applyFriendGameStart,
    appendChatMessage,
    replaceChatMessages,
    appendStoredMove,
    clearActiveGame,
    requestClockResync,
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

    const persistedVariant = resolveFriendHistoryVariant(matchVariantRef.current);
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
      atomic_explosion: "king explosion",
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
        : lastGameOver.reason === "atomic_explosion"
          ? `${lastGameOver.winner === "w" ? "White" : "Black"} wins by atomic king explosion`
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

    const includeRatingMetadata =
      !isUnratedVariant(persistedVariant) &&
      isRated &&
      lastGameOver.elo?.rated === true;

    saveGameHistory({
      event:
        persistedVariant === "chess960"
          ? "Friend Challenge Chess960"
          : persistedVariant === "threeCheck"
            ? "Friend Challenge Three-Check"
            : persistedVariant === "kingOfHill"
              ? "Friend Challenge King of the Hill"
              : persistedVariant === "atomic"
                ? "Friend Challenge Atomic Chess"
              : "Friend Challenge",
      variant: persistedVariant,
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
        includeRatingMetadata && Number.isFinite(playerDelta) ? playerDelta : undefined,
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
      volatilityBefore: includeRatingMetadata && Number.isFinite(playerPreVolatility)
        ? playerPreVolatility
        : undefined,
      volatilityAfter: includeRatingMetadata && Number.isFinite(playerPostVolatility)
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
        Number.isFinite(opponentPreRd) && Number.isFinite(opponentPostRd)
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
      opponentIsProvisional: includeRatingMetadata ? opponentIsProvisional : undefined,
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
      whiteCheckCount:
        persistedVariant === "threeCheck" ? whiteThreeChecks : undefined,
      blackCheckCount:
        persistedVariant === "threeCheck" ? blackThreeChecks : undefined,
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
      premoves,
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

      const isLegalMove = currentGame
        .moves({ square: moveFrom, verbose: true })
        .some((move) => move.to === square && isMoveAllowedForVariant(move));
      const isLegalChess960Castle = isChess960CastlingDrop(
        currentGame,
        moveFrom,
        square,
      );

      if (isLegalMove || isLegalChess960Castle) {
        // Check for promotion
        const srcPiece = currentGame.get(moveFrom);
        const isPromo =
          srcPiece?.type === "p" &&
          ((srcPiece.color === "w" && square[1] === "8") ||
            (srcPiece.color === "b" && square[1] === "1"));

        if (isPromo) {
          if (autoQueen) {
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
      autoQueen,
      clearSelection,
      socket,
      gameStarted,
      gameOver,
      isPlayerTurn,
      isMoveAllowedForVariant,
      moveFrom,
      playerColor,
      playLocalMoveSound,
      getMoveOptions,
      addChess960CastlingTargets,
      isChess960CastlingDrop,
      premoves,
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

      const isLegalMove = currentGame
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
        if (autoQueen) {
          socket.emit("makeMove", {
            gameId: gameIdRef.current,
            from: sourceSquare,
            to: targetSquare,
            promotion: "q",
          });
          const nextTurn = playerColor === "w" ? "b" : "w";
          currentTurnRef.current = nextTurn;
          setCurrentTurn(nextTurn);
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
      autoQueen,
      clearSelection,
      gameOver,
      gameStarted,
      getMoveOptions,
      isChess960CastlingDrop,
      addChess960CastlingTargets,
      isPlayerTurn,
      isMoveAllowedForVariant,
      playLocalMoveSound,
      playerColor,
      premoves,
      queuePreMove,
      selectPreMoveSource,
      socket,
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

  const resign = useCallback(() => {
    if (!socket || !gameIdRef.current) return;
    socket.emit("resign", { gameId: gameIdRef.current });
  }, [socket]);

  const offerDraw = useCallback(() => {
    if (!socket || !gameIdRef.current || gameOver) return;
    socket.emit("offerDraw", { gameId: gameIdRef.current }, (response?: SocketAckResponse) => {
      if (response?.success === false) {
        setStatusMessage(
          response.error ||
            i18n.t("quickMatch.draw.unableToOffer", "Unable to offer draw."),
        );
        return;
      }
      setDrawOfferState({
        status: "sent",
        offeredBy: playerColorRef.current,
        expiresAt: Number(response?.expiresAt || 0) || null,
      });
      if (response?.delivered === false) {
        setStatusMessage(
          i18n.t(
            "quickMatch.draw.offerSentWaitingReconnect",
            "Draw offer sent. Waiting for opponent to reconnect.",
          ),
        );
      }
    });
  }, [gameOver, socket]);

  const respondDrawOffer = useCallback(
    (accept: boolean) => {
      if (!socket || !gameIdRef.current || gameOver) return;
      socket.emit(
        "respondDrawOffer",
        { gameId: gameIdRef.current, accept },
        (response?: SocketAckResponse) => {
          if (response?.success === false) {
            setStatusMessage(
              response.error ||
                i18n.t(
                  "quickMatch.draw.unableToRespond",
                  "Unable to respond to draw offer.",
                ),
            );
            return;
          }
          if (!accept) {
            setDrawOfferState(idleDrawOfferState);
          }
        },
      );
    },
    [gameOver, socket],
  );

  const timeOut = useCallback(
    (isPlayer: boolean) => {
      if (!socket || !gameIdRef.current || !isPlayer) return;
      socket.emit("timeout", { gameId: gameIdRef.current });
    },
    [socket],
  );

  const sendChatMessage = useCallback(
    (message: string) => {
      const trimmedMessage = String(message || "").trim();
      if (!socket || !trimmedMessage || gameOver) return;

      const matchId = String(gameIdRef.current || "").trim();
      const senderId = String(userRef.current?.id || "").trim();
      const senderUsername = String(userRef.current?.fullName || "Player").trim();
      if (!matchId || !senderId || !senderUsername) return;

      socket.emit("chatMessage", {
        matchId,
        senderId,
        senderUsername,
        message: trimmedMessage,
        timestamp: new Date().toISOString(),
      });
    },
    [gameOver, socket],
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
    gameId,
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
    drawOfferState,
    playerTime,
    opponentTime,
    playerClockSeed,
    opponentClockSeed,
    clockResetToken,
    isClockPaused,
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
    offerDraw,
    respondDrawOffer,
    timeOut,
    leaveGame,
    resetToSetup,
    sendChatMessage,
    chatMessages,
  };
}
