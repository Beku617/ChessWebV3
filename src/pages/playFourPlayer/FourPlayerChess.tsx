import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, Timer, Users } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { TIME_OPTIONS } from "../quickMatch/types";
import {
  ChessMoveList,
  MoveListTabs,
  type ChessMoveRow,
  type SidebarMessageItem,
} from "../../components/game";
import {
  applyMove,
  createInitialFourPlayerState,
  formatMoveText,
  FOUR_PLAYER_BOARD_SIZE,
  getLegalMoves,
  isPlayableSquare,
} from "./engine";
import { PieceIcon } from "./PieceIcon";
import { useOnlineFourPlayerMatch } from "./useOnlineFourPlayerMatch";
import {
  FourPlayerColor,
  FourPlayerPiece,
  FourPlayerPlayers,
  FourPlayerState,
} from "./types";
import { useGameplayPreferences } from "../../hooks/useGameplayPreferences";

interface TimeControl {
  initial: number;
  increment: number;
}

function getTimeControlFromState(state: unknown): TimeControl | null {
  if (!state || typeof state !== "object") return null;
  const maybeState = state as { initial?: unknown; increment?: unknown };
  if (
    typeof maybeState.initial === "number" &&
    typeof maybeState.increment === "number"
  ) {
    return {
      initial: maybeState.initial,
      increment: maybeState.increment,
    };
  }
  return null;
}

function getTimeControlFromSearch(search: string): TimeControl | null {
  const params = new URLSearchParams(search);
  const initial = Number(params.get("initial"));
  const increment = Number(params.get("increment"));
  if (Number.isFinite(initial) && Number.isFinite(increment)) {
    return { initial, increment };
  }
  return null;
}

function getAutoStartFromState(state: unknown): boolean {
  if (!state || typeof state !== "object") return false;
  return (state as { autoStart?: unknown }).autoStart === true;
}

function getAutoStartFromSearch(search: string): boolean {
  const value = new URLSearchParams(search).get("autostart");
  return value === "1" || value === "true";
}

function shouldHideStatusMessage(content: string | null | undefined): boolean {
  const normalized = String(content || "").trim().toLowerCase();
  return (
    normalized === "game state restored." ||
    normalized === "game restored after reconnect."
  );
}

const COLOR_LABEL_CLASS: Record<FourPlayerColor, string> = {
  red: "bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-500/30",
  blue: "bg-brand-500/10 text-brand-600 dark:text-brand-300 border-brand-500/30",
  yellow:
    "bg-amber-500/10 text-amber-700 dark:text-amber-200 border-amber-500/30",
  green:
    "bg-brand-500/10 text-brand-600 dark:text-brand-300 border-brand-500/30",
};

const COLOR_RING_CLASS: Record<FourPlayerColor, string> = {
  red: "ring-rose-400",
  blue: "ring-brand-400",
  yellow: "ring-amber-400",
  green: "ring-brand-400",
};

function FourPlayerBoard({
  state,
  selected,
  legalMoveSet,
  lastMoveFrom,
  lastMoveTo,
  onSquareClick,
  onPieceDrop,
  onCancelSelection,
  canDragFrom,
  boardWidth,
  interactive,
  allowClick = true,
  allowDrag = false,
}: {
  state: FourPlayerState;
  selected: string | null;
  legalMoveSet: Set<string>;
  lastMoveFrom: string | null;
  lastMoveTo: string | null;
  onSquareClick: (row: number, col: number) => void;
  onPieceDrop: (
    fromRow: number,
    fromCol: number,
    toRow: number,
    toCol: number,
  ) => boolean;
  onCancelSelection: () => void;
  canDragFrom: (row: number, col: number) => boolean;
  boardWidth: number;
  interactive: boolean;
  allowClick?: boolean;
  allowDrag?: boolean;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const suppressClickRef = useRef(false);
  const dragPointerIdRef = useRef<number | null>(null);
  const dragSelectionSyncedRef = useRef(false);
  const [dragging, setDragging] = useState<{
    fromRow: number;
    fromCol: number;
    piece: FourPlayerPiece;
    x: number;
    y: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);

  // Compute cell size from board width (grid has 4px margin = m-1)
  const cellSize = useMemo(
    () => (boardWidth - 8) / FOUR_PLAYER_BOARD_SIZE,
    [boardWidth],
  );

  const getClampedBoardPoint = useCallback(
    (clientX: number, clientY: number) => {
      const board = boardRef.current;
      const grid = gridRef.current;
      if (!board || !grid) return null;

      const boardRect = board.getBoundingClientRect();
      const gridRect = grid.getBoundingClientRect();
      const currentCellSize = gridRect.width / FOUR_PLAYER_BOARD_SIZE;
      const halfCell = currentCellSize / 2;
      const minX = gridRect.left - boardRect.left + halfCell;
      const minY = gridRect.top - boardRect.top + halfCell;
      const maxX = gridRect.right - boardRect.left - halfCell;
      const maxY = gridRect.bottom - boardRect.top - halfCell;

      return {
        x: Math.max(minX, Math.min(clientX - boardRect.left, maxX)),
        y: Math.max(minY, Math.min(clientY - boardRect.top, maxY)),
      };
    },
    [],
  );

  // Compute drag-time legal highlights
  const dragLegalSet = useMemo(() => {
    if (!dragging) return null;
    const from = { row: dragging.fromRow, col: dragging.fromCol };
    const piece = state.board[from.row]?.[from.col];
    if (!piece || piece.color !== state.turn) return null;
    const moves = getLegalMoves(state, from);
    return new Set(moves.map((sq) => `${sq.row},${sq.col}`));
  }, [dragging, state]);

  const activeLegalSet = dragging?.moved
    ? (dragLegalSet ?? legalMoveSet)
    : legalMoveSet;

  const squareFromClient = useCallback((clientX: number, clientY: number) => {
    const grid = gridRef.current;
    if (!grid) return null;

    const rect = grid.getBoundingClientRect();
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return null;
    }

    const cs = rect.width / FOUR_PLAYER_BOARD_SIZE;
    const col = Math.floor((clientX - rect.left) / cs);
    const row = Math.floor((clientY - rect.top) / cs);
    if (
      row < 0 ||
      col < 0 ||
      row >= FOUR_PLAYER_BOARD_SIZE ||
      col >= FOUR_PLAYER_BOARD_SIZE
    ) {
      return null;
    }
    if (!isPlayableSquare(row, col)) return null;
    return { row, col };
  }, []);

  const squareFromPoint = useCallback(
    (clientX: number, clientY: number) => {
      const target = document.elementFromPoint(clientX, clientY);
      const cell = target?.closest("[data-four-cell]");
      if (cell && cell instanceof HTMLElement) {
        const rowAttr = cell.dataset.row;
        const colAttr = cell.dataset.col;
        const row = Number(rowAttr);
        const col = Number(colAttr);
        if (
          Number.isInteger(row) &&
          Number.isInteger(col) &&
          isPlayableSquare(row, col)
        ) {
          return { row, col };
        }
      }
      return squareFromClient(clientX, clientY);
    },
    [squareFromClient],
  );

  const finalizeDrag = useCallback(
    (clientX: number, clientY: number) => {
      dragPointerIdRef.current = null;
      dragSelectionSyncedRef.current = false;
      setDragging((current) => {
        if (!current) return null;
        if (!current.moved) return null;

        const destination = squareFromPoint(clientX, clientY);
        if (destination) {
          suppressClickRef.current = true;
          const moved = onPieceDrop(
            current.fromRow,
            current.fromCol,
            destination.row,
            destination.col,
          );
          if (!moved) {
            onCancelSelection();
          }
        } else {
          // Snap back - clear selection.
          onCancelSelection();
        }
        return null;
      });
    },
    [onPieceDrop, onCancelSelection, squareFromPoint],
  );

  useEffect(() => {
    if (!dragging) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (
        dragPointerIdRef.current !== null &&
        event.pointerId !== dragPointerIdRef.current
      )
        return;
      event.preventDefault();

      const currentDrag = dragging;
      if (
        currentDrag &&
        !currentDrag.moved &&
        !dragSelectionSyncedRef.current
      ) {
        const crossedDragThreshold =
          Math.abs(event.clientX - currentDrag.startX) > 4 ||
          Math.abs(event.clientY - currentDrag.startY) > 4;
        if (crossedDragThreshold) {
          dragSelectionSyncedRef.current = true;
          if (
            selected !== `${currentDrag.fromRow},${currentDrag.fromCol}`
          ) {
            onSquareClick(currentDrag.fromRow, currentDrag.fromCol);
          }
        }
      }

      setDragging((current) => {
        if (!current) return null;
        const moved =
          current.moved ||
          Math.abs(event.clientX - current.startX) > 4 ||
          Math.abs(event.clientY - current.startY) > 4;

        const nextPoint = getClampedBoardPoint(event.clientX, event.clientY);

        return {
          ...current,
          x: nextPoint?.x ?? current.x,
          y: nextPoint?.y ?? current.y,
          moved,
        };
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (
        dragPointerIdRef.current !== null &&
        event.pointerId !== dragPointerIdRef.current
      )
        return;
      finalizeDrag(event.clientX, event.clientY);
    };

    const handlePointerCancel = () => {
      dragPointerIdRef.current = null;
      dragSelectionSyncedRef.current = false;
      setDragging(null);
    };

    // Use capture phase for reliable mobile drag
    window.addEventListener("pointermove", handlePointerMove, {
      passive: false,
    });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [dragging, finalizeDrag, getClampedBoardPoint, onSquareClick, selected]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      dragPointerIdRef.current = null;
      dragSelectionSyncedRef.current = false;
      setDragging(null);
      onCancelSelection();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancelSelection]);

  return (
    <div
      ref={boardRef}
      onContextMenu={(event) => {
        event.preventDefault();
        dragPointerIdRef.current = null;
        dragSelectionSyncedRef.current = false;
        setDragging(null);
        onCancelSelection();
      }}
      className="relative rounded-2xl overflow-hidden border border-gray-200/70 dark:border-white/10 shadow-xl bg-gray-200/20 dark:bg-black/20"
      style={{ width: boardWidth, height: boardWidth }}
    >
      <div
        ref={gridRef}
        className="m-1 rounded-xl overflow-hidden"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${FOUR_PLAYER_BOARD_SIZE}, minmax(0, 1fr))`,
          touchAction: "none",
        }}
      >
        {Array.from({ length: FOUR_PLAYER_BOARD_SIZE }).map((_, row) =>
          Array.from({ length: FOUR_PLAYER_BOARD_SIZE }).map((_, col) => {
            const key = `${row},${col}`;
            const playable = isPlayableSquare(row, col);
            const piece = playable ? state.board[row][col] : null;
            const isSelected = selected === key;
            const isLegal = activeLegalSet.has(key);
            const isLastFrom = lastMoveFrom === key;
            const isLastTo = lastMoveTo === key;
            const isDark = (row + col) % 2 === 1;

            if (!playable) {
              return (
                <div
                  key={key}
                  className="bg-transparent pointer-events-none aspect-square"
                />
              );
            }

            return (
              <button
                type="button"
                key={key}
                onClick={() => {
                  if (!interactive || !allowClick) return;
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    return;
                  }
                  onSquareClick(row, col);
                }}
                onPointerDown={(event) => {
                  if (!interactive || !allowDrag || event.button !== 0) return;
                  if (!canDragFrom(row, col)) return;
                  if (!piece) return;

                  // Capture pointer for reliable mobile/touch drag
                  try {
                    (event.target as Element).setPointerCapture(
                      event.pointerId,
                    );
                  } catch {
                    /* ignore if capture fails */
                  }
                  dragPointerIdRef.current = event.pointerId;
                  dragSelectionSyncedRef.current = false;
                  const point = getClampedBoardPoint(
                    event.clientX,
                    event.clientY,
                  );

                  setDragging({
                    fromRow: row,
                    fromCol: col,
                    piece,
                    x: point?.x ?? cellSize / 2,
                    y: point?.y ?? cellSize / 2,
                    startX: event.clientX,
                    startY: event.clientY,
                    moved: false,
                  });
                }}
                disabled={!interactive}
                data-four-cell
                data-row={row}
                data-col={col}
                className={`relative aspect-square flex items-center justify-center transition-colors touch-none ${
                  isDark ? "bg-[#a6a7ab]" : "bg-[#d6d7d9]"
                } ${
                  isLastFrom || isLastTo
                    ? "ring-2 ring-yellow-300/80 ring-inset"
                    : ""
                } ${isSelected ? "ring-2 ring-cyan-400 ring-inset" : ""}`}
              >
                {isLegal && (
                  <span
                    className={`absolute ${
                      piece
                        ? "w-[40%] h-[40%] border-2 border-cyan-300/85 rounded-full"
                        : "w-[23%] h-[23%] rounded-full bg-cyan-400/75"
                    }`}
                  />
                )}
                {piece && (
                  <PieceIcon
                    type={piece.type}
                    color={piece.color}
                    className={`w-[95%] h-[95%] drop-shadow-[0_2px_2px_rgba(0,0,0,0.35)] ${
                      dragging?.moved &&
                      dragging.fromRow === row &&
                      dragging.fromCol === col
                        ? "opacity-0"
                        : ""
                    }`}
                  />
                )}
              </button>
            );
          }),
        )}
      </div>

      {dragging?.moved && (
        <div
          className="pointer-events-none absolute z-40"
          style={{
            width: cellSize,
            height: cellSize,
            left: dragging.x - cellSize / 2,
            top: dragging.y - cellSize / 2,
          }}
        >
          <PieceIcon
            type={dragging.piece.type}
            color={dragging.piece.color}
            className="w-full h-full drop-shadow-[0_6px_10px_rgba(0,0,0,0.45)]"
          />
        </div>
      )}
    </div>
  );
}

function PlayersGrid({
  players,
  turn,
  eliminated,
  you,
}: {
  players: FourPlayerPlayers;
  turn: FourPlayerColor;
  eliminated: FourPlayerColor[];
  you: FourPlayerColor;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(["red", "blue", "yellow", "green"] as FourPlayerColor[]).map(
        (color) => {
          const isOut = eliminated.includes(color);
          const isTurn = turn === color;
          const isYou = you === color;
          return (
            <div
              key={color}
              className={`rounded-xl border px-3 py-2 ${COLOR_LABEL_CLASS[color]} ${
                isTurn ? `ring-2 ${COLOR_RING_CLASS[color]}` : ""
              } ${isOut ? "opacity-45 line-through" : ""}`}
            >
              <div className="text-[11px] font-bold uppercase tracking-wide">
                {color}
                {isYou ? " (You)" : ""}
              </div>
              <div className="text-xs mt-0.5 truncate">
                {players[color]?.name || color}
              </div>
            </div>
          );
        },
      )}
    </div>
  );
}

export default function FourPlayerChess() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const { allowClickInput, allowDragInput, showLegalMoves } =
    useGameplayPreferences();
  const {
    gameState,
    gameStarted,
    playerColor,
    players,
    isSearching,
    isConnected,
    queueStatus,
    selected,
    legalMoveSet,
    systemMessage,
    gameOverReason,
    startMatch,
    cancelMatch,
    leaveGame,
    onSquareClick,
    onPieceDrop,
    onCancelSelection,
    canDragFrom,
    rematch,
    resetLocalState,
  } = useOnlineFourPlayerMatch();

  const [timeControl, setTimeControl] = useState<TimeControl>(() => {
    return (
      getTimeControlFromState(location.state) ||
      getTimeControlFromSearch(location.search) || {
        initial: 300,
        increment: 0,
      }
    );
  });

  useEffect(() => {
    const next =
      getTimeControlFromState(location.state) ||
      getTimeControlFromSearch(location.search);
    if (next) setTimeControl(next);
  }, [location.search, location.state]);

  const [searchElapsedSeconds, setSearchElapsedSeconds] = useState(0);
  useEffect(() => {
    if (!isSearching) {
      setSearchElapsedSeconds(0);
      return;
    }

    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      setSearchElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isSearching]);

  const autoStartRequested =
    getAutoStartFromState(location.state) ||
    getAutoStartFromSearch(location.search);
  const autoStartHandledRef = useRef(false);
  const [pendingAutoStart, setPendingAutoStart] = useState(autoStartRequested);

  useEffect(() => {
    autoStartHandledRef.current = false;
    setPendingAutoStart(autoStartRequested);
  }, [autoStartRequested, location.key]);

  useEffect(() => {
    if (!pendingAutoStart || autoStartHandledRef.current) return;
    if (gameStarted || isSearching) {
      autoStartHandledRef.current = true;
      setPendingAutoStart(false);
      return;
    }
    if (!isConnected) return;

    autoStartHandledRef.current = true;
    startMatch(timeControl, user?.fullName || "Player");
  }, [
    gameStarted,
    isConnected,
    isSearching,
    pendingAutoStart,
    startMatch,
    timeControl,
    user?.fullName,
  ]);

  const [boardWidth, setBoardWidth] = useState(760);
  const [selectedPly, setSelectedPly] = useState<number | null>(null);
  const setupBoardAreaRef = useRef<HTMLDivElement>(null);
  const gameBoardAreaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = gameStarted
      ? gameBoardAreaRef.current
      : setupBoardAreaRef.current;
    if (!container) return;

    const update = () => {
      const rect = container.getBoundingClientRect();
      const styles = window.getComputedStyle(container);
      const paddingLeft = parseFloat(styles.paddingLeft || "0") || 0;
      const paddingRight = parseFloat(styles.paddingRight || "0") || 0;
      const paddingTop = parseFloat(styles.paddingTop || "0") || 0;
      const paddingBottom = parseFloat(styles.paddingBottom || "0") || 0;
      const availableWidth = rect.width - (paddingLeft + paddingRight) - 8;
      const availableHeight = rect.height - (paddingTop + paddingBottom) - 8;
      const size = Math.floor(Math.min(availableWidth, availableHeight));
      setBoardWidth(Math.max(220, Math.min(size, 1120)));
    };
    update();
    const observer = new ResizeObserver(() => update());
    observer.observe(container);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [gameStarted]);

  const previewState = useMemo(() => createInitialFourPlayerState(), []);
  const latestPly = gameState.moves.length;
  const isReviewingPastMove =
    selectedPly !== null && selectedPly >= 0 && selectedPly < latestPly;
  const displayedState = useMemo(() => {
    if (!isReviewingPastMove || selectedPly === null) {
      return gameState;
    }

    let replayState = createInitialFourPlayerState();
    for (let index = 0; index < selectedPly; index += 1) {
      const move = gameState.moves[index];
      if (!move) break;
      replayState = applyMove(replayState, move.from, move.to);
    }

    return replayState;
  }, [gameState, isReviewingPastMove, selectedPly]);
  const selectedKey =
    !isReviewingPastMove && selected
      ? `${selected.row},${selected.col}`
      : null;
  const displayedLastMove =
    displayedState.moves.length > 0
      ? displayedState.moves[displayedState.moves.length - 1]
      : null;
  const lastMoveFrom = displayedLastMove
    ? `${displayedLastMove.from.row},${displayedLastMove.from.col}`
    : null;
  const lastMoveTo = displayedLastMove
    ? `${displayedLastMove.to.row},${displayedLastMove.to.col}`
    : null;
  const visibleLegalMoveSet = useMemo(
    () =>
      isReviewingPastMove || !showLegalMoves
        ? new Set<string>()
        : legalMoveSet,
    [isReviewingPastMove, legalMoveSet, showLegalMoves],
  );
  const activePly = selectedPly ?? (latestPly > 0 ? latestPly : null);
  const moveRows = useMemo<ChessMoveRow[]>(
    () =>
      gameState.moves.map((move, index) => ({
        key: `${move.from.row}-${move.from.col}-${move.to.row}-${move.to.col}-${index}`,
        moveNumber: index + 1,
        white: formatMoveText(move),
        whitePly: index + 1,
      })),
    [gameState.moves],
  );
  const sidebarMessages = useMemo<SidebarMessageItem[]>(() => {
    const messages: SidebarMessageItem[] = [];

    if (systemMessage && !shouldHideStatusMessage(systemMessage)) {
      messages.push({
        id: "system-message",
        sender: "System",
        content: systemMessage,
      });
    }

    if (
      queueStatus &&
      queueStatus !== systemMessage &&
      !shouldHideStatusMessage(queueStatus)
    ) {
      messages.push({
        id: "queue-status",
        sender: "Matchmaking",
        content: queueStatus,
      });
    }

    return messages;
  }, [queueStatus, systemMessage]);

  const selectedTimeOption = TIME_OPTIONS.find(
    (opt) =>
      opt.initial === timeControl.initial &&
      opt.increment === timeControl.increment,
  );

  const handleStartMatch = () => {
    const params = new URLSearchParams({
      initial: String(timeControl.initial),
      increment: String(timeControl.increment),
    });
    navigate(`/play/four-player?${params.toString()}`, {
      replace: true,
      state: { ...timeControl },
    });
    setPendingAutoStart(false);
    startMatch(timeControl, user?.fullName || "Player");
  };

  const handleCancelSearch = () => {
    setPendingAutoStart(false);
    cancelMatch();
  };

  const handlePlayAgain = () => {
    if (!gameState.winner) {
      leaveGame();
    }
    rematch();
  };

  const handleNewSearch = () => {
    leaveGame();
    resetLocalState();
  };

  useEffect(() => {
    if (!gameStarted || latestPly === 0) {
      setSelectedPly(null);
      return;
    }

    if (selectedPly !== null && selectedPly > latestPly) {
      setSelectedPly(null);
    }
  }, [gameStarted, latestPly, selectedPly]);

  if (!gameStarted) {
    return (
      <div className="relative h-full min-h-0 w-full bg-slate-100 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 overflow-hidden">
        <div className="h-full grid grid-cols-1 xl:grid-cols-[minmax(0,1.38fr)_minmax(320px,0.62fr)] gap-2 p-2">
          <div
            ref={setupBoardAreaRef}
            className="min-w-0 min-h-0 flex items-center justify-center p-1"
          >
            <FourPlayerBoard
              state={previewState}
              selected={null}
              legalMoveSet={new Set()}
              lastMoveFrom={null}
              lastMoveTo={null}
              onSquareClick={() => {}}
              onPieceDrop={() => false}
              onCancelSelection={() => {}}
              canDragFrom={() => false}
              boardWidth={boardWidth}
              interactive={false}
              allowDrag={false}
            />
          </div>

          <div className="min-w-0 rounded-3xl border border-gray-200/70 dark:border-white/10 bg-white/85 dark:bg-slate-900/85 shadow-2xl backdrop-blur-lg flex flex-col min-h-0 overflow-hidden">
            {isSearching ? (
              <div className="flex-1 flex items-center justify-center p-6">
                <div className="w-full max-w-[320px] rounded-2xl border border-gray-200/70 dark:border-white/10 bg-white/90 dark:bg-slate-900/90 p-7 text-center shadow-lg">
                  <Timer className="w-10 h-10 mx-auto text-gray-700 dark:text-gray-200" />
                  <p className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">
                    {searchElapsedSeconds}s
                  </p>
                  <p className="mt-2 text-base text-gray-600 dark:text-gray-300">
                    {queueStatus || "Searching 4-player match..."}
                  </p>
                  <button
                    type="button"
                    onClick={handleCancelSearch}
                    className="mt-7 text-base font-medium text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="p-4 border-b border-gray-200/60 dark:border-white/10">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-brand-500" />
                      <h2 className="font-bold text-base text-gray-900 dark:text-white">
                        4-Player Online
                      </h2>
                    </div>
                    <span className="text-[11px] rounded-full bg-brand-500/15 text-brand-600 dark:text-brand-300 px-2 py-0.5 font-semibold">
                      {selectedTimeOption?.label || "5+0"}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                    Queue with 3 more players and start instantly.
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  <div className="rounded-2xl border border-gray-200/70 dark:border-white/10 bg-white/60 dark:bg-slate-900/60 p-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                      <Clock className="w-4 h-4 text-brand-500" />
                      <span>Time Control</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {TIME_OPTIONS.map((opt) => {
                        const isSelected =
                          timeControl.initial === opt.initial &&
                          timeControl.increment === opt.increment;
                        return (
                          <button
                            key={opt.label}
                            type="button"
                            onClick={() =>
                              setTimeControl({
                                initial: opt.initial,
                                increment: opt.increment,
                              })
                            }
                            className={`py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
                              isSelected
                                ? "bg-brand-500 text-white ring-2 ring-brand-500"
                                : "bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 ring-1 ring-gray-200 dark:ring-slate-700 hover:ring-gray-300 dark:hover:ring-slate-600"
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {queueStatus && !shouldHideStatusMessage(queueStatus) && (
                    <p className="text-xs text-gray-600 dark:text-gray-300 px-1">
                      {queueStatus}
                    </p>
                  )}
                </div>

                <div className="p-4 border-t border-gray-200/60 dark:border-white/10">
                  <button
                    type="button"
                    onClick={handleStartMatch}
                    disabled={!isConnected}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-brand-500 to-brand-500 hover:from-brand-600 hover:to-brand-600 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold text-base transition-all shadow-lg hover:shadow-xl disabled:cursor-not-allowed"
                  >
                    {isConnected ? "Search Match" : "Server Offline"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const isPlayerEliminated = gameState.eliminated.includes(playerColor);
  const hasTerminalResult =
    !!gameState.winner || !!gameOverReason || isPlayerEliminated;
  const isMyTurn = displayedState.turn === playerColor && !hasTerminalResult;
  const youWin = gameState.winner === playerColor;
  const gameOverTitle = youWin
    ? "You Win"
    : gameState.winner
      ? `${gameState.winner.toUpperCase()} Wins`
      : isPlayerEliminated
        ? "You Were Eliminated"
        : "Match Over";
  const gameOverDescription =
    gameOverReason
      ? `Reason: ${gameOverReason}`
      : isPlayerEliminated
        ? "Your run has ended in this match."
        : "Match finished.";

  return (
    <div className="relative h-full min-h-0 w-full bg-slate-100 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 overflow-hidden">
      {hasTerminalResult && (
        <div className="fixed inset-0 z-[60] bg-black/45 backdrop-blur-[2px] flex items-center justify-center p-4 pointer-events-none">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-slate-900/95 text-white p-6 shadow-2xl text-center pointer-events-auto">
            <h3 className="text-xl font-bold">{gameOverTitle}</h3>
            <p className="mt-1 text-sm text-slate-300">{gameOverDescription}</p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={handlePlayAgain}
                className="flex-1 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 font-semibold"
              >
                Play Again
              </button>
              <button
                type="button"
                onClick={handleNewSearch}
                className="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 font-semibold"
              >
                New Search
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="h-full grid grid-cols-1 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)] gap-2 p-2">
        <div className="min-w-0 rounded-3xl border border-gray-200/70 dark:border-white/10 bg-white/70 dark:bg-slate-900/70 shadow-xl backdrop-blur-lg p-2 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => {
                leaveGame();
                navigate("/play/variants");
              }}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700"
            >
              <ArrowLeft className="w-4 h-4" />
              Variants
            </button>
            <div className="text-center">
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">
                4-Player Chess Online
              </h1>
            </div>
            <div
              className={`px-3 py-2 rounded-lg text-xs font-semibold ${
                isReviewingPastMove
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  : isMyTurn
                  ? "bg-brand-500/15 text-brand-700 dark:text-brand-300"
                  : "bg-slate-500/15 text-slate-700 dark:text-slate-300"
              }`}
            >
              {isReviewingPastMove
                ? `Review: ${displayedState.turn.toUpperCase()} to move`
                : isMyTurn
                  ? "Your Turn"
                  : `${displayedState.turn.toUpperCase()} to move`}
            </div>
          </div>

          <div
            ref={gameBoardAreaRef}
            className="flex-1 min-h-0 flex items-center justify-center px-1 pb-1"
          >
            <FourPlayerBoard
              state={displayedState}
              selected={selectedKey}
              legalMoveSet={visibleLegalMoveSet}
              lastMoveFrom={lastMoveFrom}
              lastMoveTo={lastMoveTo}
              onSquareClick={isReviewingPastMove ? () => {} : onSquareClick}
              onPieceDrop={isReviewingPastMove ? () => false : onPieceDrop}
              onCancelSelection={
                isReviewingPastMove ? () => {} : onCancelSelection
              }
              canDragFrom={isReviewingPastMove ? () => false : canDragFrom}
              boardWidth={boardWidth}
              interactive={!isReviewingPastMove && !hasTerminalResult}
              allowClick={allowClickInput}
              allowDrag={allowDragInput}
            />
          </div>
        </div>

        <div className="min-w-0 rounded-3xl border border-gray-200/70 dark:border-white/10 bg-white/80 dark:bg-slate-900/80 shadow-xl backdrop-blur-lg p-4 flex flex-col min-h-0">
          <div className="mb-3">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              Match Info
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Playing as {players[playerColor]?.name || user?.fullName || "You"}
              {isReviewingPastMove
                ? `. Reviewing move ${selectedPly} of ${latestPly}.`
                : "."}
            </p>
          </div>

          <PlayersGrid
            players={players}
            turn={displayedState.turn}
            eliminated={displayedState.eliminated}
            you={playerColor}
          />

          {((systemMessage && !shouldHideStatusMessage(systemMessage)) ||
            (queueStatus && !shouldHideStatusMessage(queueStatus))) && (
            <div className="mt-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/60 px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
              {systemMessage && !shouldHideStatusMessage(systemMessage)
                ? systemMessage
                : queueStatus}
            </div>
          )}

          <div className="flex-1 min-h-0 mt-3 rounded-2xl border border-gray-200 dark:border-slate-700 bg-white/70 dark:bg-slate-950/60 overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-200 dark:border-slate-700 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Move Log
            </div>
            <MoveListTabs
              className="h-full max-h-[48vh]"
              messages={sidebarMessages}
              movesContent={
                <ChessMoveList
                  rows={moveRows}
                  emptyMessage="No moves yet"
                  activePly={activePly}
                  onSelectPly={(ply) => {
                    if (!Number.isFinite(ply)) return;
                    const boundedPly = Math.max(
                      1,
                      Math.min(Math.floor(ply), latestPly),
                    );
                    if (boundedPly >= latestPly) {
                      setSelectedPly(null);
                      return;
                    }
                    setSelectedPly(boundedPly);
                  }}
                  rowClassName="rounded-lg bg-gray-100 dark:bg-slate-800/70 py-1"
                  moveNumberClassName="w-10 px-2 text-gray-500 dark:text-gray-400"
                  moveCellClassName="rounded px-2 py-1 text-sm font-mono transition-colors"
                  activeMoveClassName="bg-[#00e5a0]/20 text-[#00e5a0] font-semibold"
                  inactiveMoveClassName="text-gray-700 dark:text-gray-200"
                />
              }
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handlePlayAgain}
              className="py-2.5 rounded-xl bg-brand-500/10 hover:bg-brand-500/20 text-brand-700 dark:text-brand-300 font-semibold"
            >
              Play Again
            </button>
            <button
              type="button"
              onClick={() => {
                leaveGame();
                navigate("/play/variants");
              }}
              className="py-2.5 rounded-xl bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-800 dark:text-gray-200 font-semibold"
            >
              Leave
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

