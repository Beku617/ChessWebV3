import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import {
  applyMove,
  createInitialFourPlayerState,
  getLegalMoves,
  isColorInCheck,
  isPlayableSquare,
} from "./engine";
import {
  FourPlayerColor,
  FourPlayerMove,
  FourPlayerPlayers,
  FourPlayerState,
  Square,
} from "./types";
import { playChessMoveSound, playGameplaySound } from "../../utils/moveSounds";

const socketBaseUrl =
  import.meta.env.VITE_SOCKET_URL ||
  import.meta.env.VITE_API_URL ||
  "http://localhost:3001";
const SOCKET_URL = socketBaseUrl.replace(/\/api\/?$/, "");
const ACTIVE_FOUR_PLAYER_GAME_STORAGE_KEY =
  "neongambit:activeFourPlayerGameId";

const DEFAULT_PLAYERS: FourPlayerPlayers = {
  red: { name: "Red" },
  blue: { name: "Blue" },
  yellow: { name: "Yellow" },
  green: { name: "Green" },
};

interface TimeControl {
  initial: number;
  increment: number;
}

interface MatchFoundPayload {
  gameId: string;
  color: FourPlayerColor;
  state: FourPlayerState;
  players: FourPlayerPlayers;
  timeControl: TimeControl;
  restored?: boolean;
}

interface StatePayload {
  gameId: string;
  state: FourPlayerState;
  players?: FourPlayerPlayers;
  timeControl?: TimeControl;
  lastMove?: FourPlayerMove;
  systemMessage?: string;
}

function storeActiveFourPlayerGameId(gameId: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (!gameId) {
      window.localStorage.removeItem(ACTIVE_FOUR_PLAYER_GAME_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      ACTIVE_FOUR_PLAYER_GAME_STORAGE_KEY,
      String(gameId),
    );
  } catch {
    // ignore storage failures
  }
}

function readActiveFourPlayerGameId() {
  if (typeof window === "undefined") return "";
  try {
    return String(
      window.localStorage.getItem(ACTIVE_FOUR_PLAYER_GAME_STORAGE_KEY) || "",
    ).trim();
  } catch {
    return "";
  }
}

export function useOnlineFourPlayerMatch() {
  const [gameState, setGameState] = useState<FourPlayerState>(() =>
    createInitialFourPlayerState(),
  );
  const [gameId, setGameId] = useState<string | null>(() => {
    const stored = readActiveFourPlayerGameId();
    return stored || null;
  });
  const [playerColor, setPlayerColor] = useState<FourPlayerColor>("red");
  const [players, setPlayers] = useState<FourPlayerPlayers>(DEFAULT_PLAYERS);
  const [timeControl, setTimeControl] = useState<TimeControl>({
    initial: 300,
    increment: 0,
  });
  const [gameStarted, setGameStarted] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [queueStatus, setQueueStatus] = useState<string | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [lastMove, setLastMove] = useState<FourPlayerMove | null>(null);
  const [systemMessage, setSystemMessage] = useState<string | null>(null);
  const [gameOverReason, setGameOverReason] = useState<string | null>(null);
  const [forfeitedColor, setForfeitedColor] = useState<FourPlayerColor | null>(
    null,
  );

  const socketRef = useRef<Socket | null>(null);
  const gameIdRef = useRef<string | null>(readActiveFourPlayerGameId() || null);
  const playerNameRef = useRef("Player");
  const lastSoundMoveKeyRef = useRef<string>("");
  const lastResyncAtRef = useRef(0);
  const moveInFlightRef = useRef(false);

  const requestResync = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    if (!gameIdRef.current) return;
    const now = Date.now();
    if (now - lastResyncAtRef.current < 500) return; // throttle spam
    lastResyncAtRef.current = now;
    socket.emit("fourPlayerResync", { gameId: gameIdRef.current });
  }, []);

  const legalMoves = useMemo(() => {
    if (!selected) return [];
    return getLegalMoves(gameState, selected);
  }, [gameState, selected]);

  const legalMoveSet = useMemo(
    () => new Set(legalMoves.map((sq) => `${sq.row},${sq.col}`)),
    [legalMoves],
  );

  const resetLocalState = useCallback(() => {
    setGameState(createInitialFourPlayerState());
    setGameId(null);
    gameIdRef.current = null;
    storeActiveFourPlayerGameId(null);
    setPlayerColor("red");
    setPlayers(DEFAULT_PLAYERS);
    setGameStarted(false);
    setSelected(null);
    setLastMove(null);
    setSystemMessage(null);
    setGameOverReason(null);
    setForfeitedColor(null);
    lastSoundMoveKeyRef.current = "";
    moveInFlightRef.current = false;
  }, []);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });
    socketRef.current = socket;

    const attemptRestore = (targetGameId?: string | null) => {
      if (!socket.connected) return;
      const explicitGameId = String(
        targetGameId || gameIdRef.current || readActiveFourPlayerGameId() || "",
      ).trim();
      const payload = explicitGameId ? { gameId: explicitGameId } : {};
      socket.emit(
        "rejoinFourPlayerGame",
        payload,
        (response?: { success?: boolean; error?: string; gameId?: string }) => {
          if (response?.success === true) {
            const restoredGameId = String(
              response.gameId || explicitGameId || "",
            ).trim();
            if (restoredGameId) {
              gameIdRef.current = restoredGameId;
              setGameId(restoredGameId);
              storeActiveFourPlayerGameId(restoredGameId);
              setQueueStatus("Game restored after reconnect.");
              setIsSearching(false);
            }
            return;
          }
          if (response?.error) {
            const normalizedError = String(response.error).toLowerCase();
            if (
              normalizedError.includes("not found") ||
              normalizedError.includes("no active game") ||
              normalizedError.includes("not a participant") ||
              normalizedError.includes("eliminated")
            ) {
              resetLocalState();
            }
          }
        },
      );
    };

    socket.on("connect", () => {
      setIsConnected(true);
      setQueueStatus(null);
      attemptRestore();
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
      if (gameIdRef.current || readActiveFourPlayerGameId()) {
        setQueueStatus("Connection lost. Reconnecting...");
        return;
      }
      setIsSearching(false);
      setQueueStatus("Disconnected from server.");
    });

    socket.on("connect_error", () => {
      setIsConnected(false);
      if (gameIdRef.current || readActiveFourPlayerGameId()) {
        setQueueStatus("Reconnecting to matchmaking server...");
        return;
      }
      setIsSearching(false);
      setQueueStatus("Unable to connect to matchmaking server.");
    });

    socket.io.on("reconnect_attempt", () => {
      if (gameIdRef.current || readActiveFourPlayerGameId()) {
        setQueueStatus("Reconnecting to matchmaking server...");
      }
    });

    socket.on("fourPlayerQueued", (payload: { waitingCount?: number }) => {
      const count = Number(payload?.waitingCount || 1);
      setIsSearching(true);
      setQueueStatus(`Searching players... ${Math.min(count, 4)}/4`);
    });

    socket.on("fourPlayerQueueCancelled", () => {
      setIsSearching(false);
      setQueueStatus("Search cancelled.");
    });

    socket.on("fourPlayerMatchFound", (payload: MatchFoundPayload) => {
      setIsSearching(false);
      setQueueStatus(null);
      setGameId(payload.gameId);
      gameIdRef.current = payload.gameId;
      storeActiveFourPlayerGameId(payload.gameId);
      setPlayerColor(payload.color);
      setGameState(payload.state);
      setPlayers(payload.players || DEFAULT_PLAYERS);
      setTimeControl(payload.timeControl || { initial: 300, increment: 0 });
      setSelected(null);
      setLastMove(null);
      setSystemMessage(null);
      setGameOverReason(null);
      setForfeitedColor(null);
      lastSoundMoveKeyRef.current = "";
      setGameStarted(true);
      playGameplaySound("gameStart");
    });

    socket.on("fourPlayerState", (payload: StatePayload) => {
      if (!payload?.gameId || payload.gameId !== gameIdRef.current) return;
      moveInFlightRef.current = false;
      setGameState(payload.state);
      if (payload.players) {
        setPlayers(payload.players);
      }
      if (payload.timeControl) {
        setTimeControl(payload.timeControl);
      }
      if (payload.lastMove) {
        setLastMove(payload.lastMove);
        const moveCount = payload.state?.moves?.length ?? 0;
        const moveKey = `${payload.gameId}:${moveCount}:${payload.lastMove.from.row},${payload.lastMove.from.col}->${payload.lastMove.to.row},${payload.lastMove.to.col}`;
        if (moveKey !== lastSoundMoveKeyRef.current) {
          lastSoundMoveKeyRef.current = moveKey;
          const nextPlayerInCheck = payload.state
            ? isColorInCheck(payload.state, payload.state.turn)
            : false;
          playChessMoveSound({
            ...payload.lastMove,
            check: nextPlayerInCheck,
          });
        }
      }
      if (payload.systemMessage) {
        setSystemMessage(payload.systemMessage);
      }
      setSelected(null);
    });

    socket.on("fourPlayerMoveRejected", (payload: { reason?: string }) => {
      moveInFlightRef.current = false;
      setQueueStatus(payload?.reason || "Move rejected.");
      setSelected(null);
      playGameplaySound("illegal");
      requestResync();
    });

    socket.on(
      "fourPlayerGameOver",
      (payload: {
        gameId: string;
        reason?: string;
        state?: FourPlayerState;
        forfeitedColor?: FourPlayerColor;
      }) => {
        if (!payload?.gameId || payload.gameId !== gameIdRef.current) return;
        moveInFlightRef.current = false;
        if (payload.state) {
          setGameState(payload.state);
        }
        setGameOverReason(payload.reason || "game_over");
        if (payload.forfeitedColor) {
          setForfeitedColor(payload.forfeitedColor);
        }
        storeActiveFourPlayerGameId(null);
        playGameplaySound("gameEnd");
      },
    );

    const initialStoredGameId = readActiveFourPlayerGameId();
    if (socket.connected) {
      attemptRestore(initialStoredGameId || gameIdRef.current);
    } else if (initialStoredGameId) {
      setQueueStatus("Reconnecting to matchmaking server...");
    }

    return () => {
      socket.io.off("reconnect_attempt");
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [requestResync, resetLocalState]);

  const startMatch = useCallback(
    (nextTimeControl: TimeControl, name?: string) => {
      const socket = socketRef.current;
      if (!socket) return;

      // Clear stale board/modal state before any new search attempt.
      resetLocalState();

      if (!socket.connected) {
        setQueueStatus("Matchmaking server is offline.");
        setIsSearching(false);
        return;
      }

      playerNameRef.current = name || "Player";
      setTimeControl(nextTimeControl);
      setIsSearching(true);
      setQueueStatus("Searching players... 1/4");
      socket.emit("findFourPlayerMatch", {
        name: playerNameRef.current,
        timeControl: nextTimeControl,
      });
    },
    [resetLocalState],
  );

  const cancelMatch = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit("cancelFourPlayerFind");
    setIsSearching(false);
  }, []);

  const leaveGame = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit("fourPlayerLeaveGame", { gameId: gameIdRef.current });
    resetLocalState();
  }, [resetLocalState]);

  const canDragFrom = useCallback(
    (row: number, col: number) => {
      if (!gameStarted || gameState.winner) return false;
      if (!isPlayableSquare(row, col)) return false;
      if (gameState.turn !== playerColor) return false;
      const piece = gameState.board[row][col];
      return !!piece && piece.color === playerColor;
    },
    [gameStarted, gameState, playerColor],
  );

  const tryMove = useCallback(
    (from: Square, to: Square) => {
      if (moveInFlightRef.current) return false;
      if (!gameStarted || gameState.winner) return false;
      if (!isPlayableSquare(from.row, from.col) || !isPlayableSquare(to.row, to.col)) {
        return false;
      }
      if (gameState.turn !== playerColor) return false;

      const piece = gameState.board[from.row][from.col];
      if (!piece || piece.color !== playerColor) return false;

      const legalTargets = getLegalMoves(gameState, from);
      const isLegal = legalTargets.some(
        (target) => target.row === to.row && target.col === to.col,
      );
      if (!isLegal) return false;

      const localResult = applyMove(gameState, from, to);
      const nextMove = localResult.moves[localResult.moves.length - 1] || null;
      if (nextMove) {
        setLastMove(nextMove);
      }

      socketRef.current?.emit("fourPlayerMove", {
        gameId: gameIdRef.current,
        from,
        to,
      });
      moveInFlightRef.current = true;
      setSelected(null);
      return true;
    },
    [gameStarted, gameState, playerColor],
  );

  const onSquareClick = useCallback(
    (row: number, col: number) => {
      if (!gameStarted || gameState.winner) return;
      if (!isPlayableSquare(row, col)) return;
      if (gameState.turn !== playerColor) return;

      const piece = gameState.board[row][col];
      if (selected) {
        if (selected.row === row && selected.col === col) {
          setSelected(null);
          return;
        }

        if (tryMove(selected, { row, col })) {
          return;
        }
      }

      if (piece && piece.color === playerColor) {
        setSelected({ row, col });
        return;
      }

      if (selected) {
        playGameplaySound("illegal");
      }
      setSelected(null);
    },
    [gameStarted, gameState, playerColor, selected, tryMove],
  );

  const onPieceDrop = useCallback(
    (fromRow: number, fromCol: number, toRow: number, toCol: number) => {
      if (!canDragFrom(fromRow, fromCol)) return false;

      const from = { row: fromRow, col: fromCol };
      const to = { row: toRow, col: toCol };
      const moved = tryMove(from, to);
      if (!moved) {
        playGameplaySound("illegal");
        setSelected(from);
      }
      return moved;
    },
    [canDragFrom, tryMove],
  );

  const onCancelSelection = useCallback(() => {
    setSelected(null);
  }, []);

  const rematch = useCallback(() => {
    startMatch(timeControl, playerNameRef.current);
  }, [startMatch, timeControl]);

  return {
    gameState,
    gameId,
    gameStarted,
    playerColor,
    players,
    timeControl,
    isSearching,
    isConnected,
    queueStatus,
    selected,
    legalMoveSet,
    lastMove,
    systemMessage,
    gameOverReason,
    forfeitedColor,

    startMatch,
    cancelMatch,
    leaveGame,
    onSquareClick,
    onPieceDrop,
    onCancelSelection,
    canDragFrom,
    rematch,
    resetLocalState,
  };
}
