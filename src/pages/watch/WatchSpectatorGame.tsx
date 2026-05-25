import { Trans } from "react-i18next";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { QuickMatchGameView } from "../quickMatch/QuickMatchGameView";
import type { GameSettings } from "../../components/game";
import { useFriendChallengeStore } from "../../store/friendChallengeStore";

type WatchColor = "w" | "b";
type WatchOrientation = "white" | "black";
type WatchVariant =
  | "standard"
  | "chess960"
  | "threeCheck"
  | "kingOfHill"
  | "atomic";

interface WatchStatePayload {
  gameId: string;
  fen?: string;
  initialFen?: string;
  fenHistory?: string[];
  moves?: string[];
  variant?: string;
  boardOrientation?: string;
  timeControl?: { initial?: number; increment?: number };
  white?: { name?: string; rating?: number | null };
  black?: { name?: string; rating?: number | null };
  whiteTimeLeft?: number;
  blackTimeLeft?: number;
  activeColor?: WatchColor;
  viewers?: number;
}

interface WatchMovePayload {
  gameId?: string;
  fen?: string;
  move?: { from?: string; to?: string; san?: string };
  turn?: WatchColor;
  whiteTimeLeft?: number;
  blackTimeLeft?: number;
}

interface WatchClockPayload {
  gameId?: string;
  whiteTimeLeft?: number;
  blackTimeLeft?: number;
  activeColor?: WatchColor;
}

interface WatchViewerPayload {
  gameId?: string;
  viewers?: number;
}

interface WatchGameOverPayload {
  gameId?: string;
  reason?: string;
  winner?: WatchColor | null;
}

interface WatchSystemMessagePayload {
  gameId?: string;
  message?: string;
}

type MoveSquare = { from: string; to: string } | null;
interface WatchResultDetails {
  title: string;
  subtitle: string;
  message: string;
}

function createChessFromFen(fen?: string) {
  const normalizedFen = String(fen || "").trim();
  if (!normalizedFen || normalizedFen === "start") {
    return new Chess();
  }
  try {
    return new Chess(normalizedFen);
  } catch {
    return new Chess();
  }
}

function normalizeFenHistory(rawHistory: unknown): string[] {
  if (!Array.isArray(rawHistory)) return [];
  return rawHistory
    .map((fen) => String(fen || "").trim())
    .filter((fen) => fen.length > 0);
}

function buildMoveSquares(initialFen: string, moves: string[]): MoveSquare[] {
  const chess = createChessFromFen(initialFen);
  const squares: MoveSquare[] = [];

  for (const san of moves) {
    try {
      const applied = chess.move(san);
      if (!applied) {
        squares.push(null);
        continue;
      }
      squares.push({
        from: String(applied.from || ""),
        to: String(applied.to || ""),
      });
    } catch {
      squares.push(null);
    }
  }

  return squares;
}

function normalizeWatchVariant(value: unknown): WatchVariant {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "chess960") return "chess960";
  if (normalized === "threecheck" || normalized === "three-check") {
    return "threeCheck";
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
  if (normalized === "atomic") return "atomic";
  return "standard";
}

function normalizeWatchOrientation(value: unknown): WatchOrientation {
  return String(value || "").trim().toLowerCase() === "black"
    ? "black"
    : "white";
}

function normalizeResultReason(reason: string): string | null {
  const normalizedReason = String(reason || "").trim().toLowerCase();
  if (!normalizedReason) return null;

  if (normalizedReason === "checkmate") return "checkmate";
  if (normalizedReason === "resign") return "resignation";
  if (normalizedReason === "timeout") return "timeout";
  if (normalizedReason === "stalemate") return "stalemate";
  if (normalizedReason === "draw") return "draw agreement";
  if (normalizedReason === "opponent_left") return "opponent left";
  if (normalizedReason === "three_check") return "three-check";
  if (normalizedReason === "king_of_the_hill") return "King of the Hill";
  if (normalizedReason === "atomic_explosion") return "atomic explosion";

  return normalizedReason.replace(/_/g, " ");
}

function buildResultDetails(
  reason: string,
  winner: WatchColor | null | undefined,
  whiteName: string,
  blackName: string,
): WatchResultDetails {
  const reasonLabel = normalizeResultReason(reason);
  const winnerColor = winner === "w" ? "White" : winner === "b" ? "Black" : null;
  const winnerName = winner === "w" ? whiteName : winner === "b" ? blackName : "";

  if (!winnerColor) {
    return {
      title: "Draw",
      subtitle:
        reasonLabel && reasonLabel !== "draw agreement"
          ? `Draw by ${reasonLabel}.`
          : "The game ended in a draw.",
      message: "Draw.",
    };
  }

  const reasonSegment = reasonLabel ? ` by ${reasonLabel}` : "";

  return {
    title: `${winnerColor} won`,
    subtitle: `${winnerName} won${reasonSegment}.`,
    message: `${winnerName} wins${reasonSegment}.`,
  };
}

function toSafeTimeControl(raw?: { initial?: number; increment?: number }) {
  const initial = Number(raw?.initial);
  const increment = Number(raw?.increment);
  return {
    initial: Number.isFinite(initial) && initial > 0 ? initial : 0,
    increment: Number.isFinite(increment) && increment > 0 ? increment : 0,
  };
}

interface WatchSpectatorGameProps {
  gameId: string;
}

export function WatchSpectatorGame({ gameId }: WatchSpectatorGameProps) {
  const navigate = useNavigate();
  const socket = useFriendChallengeStore((state) => state.socket);
  const isConnected = useFriendChallengeStore((state) => state.isConnected);

  const [timeControl, setTimeControl] = useState({ initial: 0, increment: 0 });
  const [whitePlayerName, setWhitePlayerName] = useState("White");
  const [blackPlayerName, setBlackPlayerName] = useState("Black");
  const [whitePlayerRating, setWhitePlayerRating] = useState<number | null>(
    null,
  );
  const [blackPlayerRating, setBlackPlayerRating] = useState<number | null>(
    null,
  );
  const [viewers, setViewers] = useState(0);
  const [variant, setVariant] = useState<WatchVariant>("standard");
  const [orientation, setOrientation] = useState<WatchOrientation>("white");

  const [moves, setMoves] = useState<string[]>([]);
  const [fens, setFens] = useState<string[]>(["start"]);
  const [moveSquares, setMoveSquares] = useState<MoveSquare[]>([]);
  const [viewIndex, setViewIndex] = useState(0);

  const [whiteTimeLeft, setWhiteTimeLeft] = useState(0);
  const [blackTimeLeft, setBlackTimeLeft] = useState(0);
  const [activeColor, setActiveColor] = useState<WatchColor>("w");

  const [statusMessage, setStatusMessage] = useState<string | null>(
    "Connecting to live game...",
  );
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [resultDetails, setResultDetails] = useState<WatchResultDetails | null>(
    null,
  );
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);
  const [isJoining, setIsJoining] = useState(true);
  const [isGameOver, setIsGameOver] = useState(false);

  const fensRef = useRef(fens);
  const viewIndexRef = useRef(viewIndex);
  const whitePlayerNameRef = useRef(whitePlayerName);
  const blackPlayerNameRef = useRef(blackPlayerName);

  useEffect(() => {
    fensRef.current = fens;
  }, [fens]);

  useEffect(() => {
    viewIndexRef.current = viewIndex;
  }, [viewIndex]);

  useEffect(() => {
    whitePlayerNameRef.current = whitePlayerName;
  }, [whitePlayerName]);

  useEffect(() => {
    blackPlayerNameRef.current = blackPlayerName;
  }, [blackPlayerName]);

  useEffect(() => {
    setMoves([]);
    setFens(["start"]);
    setMoveSquares([]);
    setViewIndex(0);
    setWhiteTimeLeft(0);
    setBlackTimeLeft(0);
    setActiveColor("w");
    setViewers(0);
    setVariant("standard");
    setOrientation("white");
    setStatusMessage("Connecting to live game...");
    setResultMessage(null);
    setResultDetails(null);
    setIsResultModalOpen(false);
    setIsJoining(true);
    setIsGameOver(false);
  }, [gameId]);

  useEffect(() => {
    if (!socket || !isConnected) {
      setStatusMessage("Realtime connection is offline. Reconnecting...");
      return;
    }

    const applyWatchState = (state: WatchStatePayload) => {
      if (String(state?.gameId || "") !== gameId) return;

      const safeMoves = Array.isArray(state.moves)
        ? state.moves.map((move) => String(move || "").trim()).filter(Boolean)
        : [];
      const initialFen = String(state.initialFen || "start").trim() || "start";
      const stateFen = String(state.fen || "").trim();
      const providedHistory = normalizeFenHistory(state.fenHistory);
      const fallbackHistory = [initialFen];
      if (stateFen && stateFen !== initialFen) {
        fallbackHistory.push(stateFen);
      }
      const nextFens =
        providedHistory.length > 0 ? providedHistory : fallbackHistory;
      const nextMoveSquares = buildMoveSquares(initialFen, safeMoves);
      while (nextMoveSquares.length < Math.max(0, nextFens.length - 1)) {
        nextMoveSquares.push(null);
      }

      setMoves(safeMoves);
      setFens(nextFens);
      setMoveSquares(nextMoveSquares);
      setViewIndex(Math.max(0, nextFens.length - 1));

      setVariant(normalizeWatchVariant(state.variant));
      setOrientation(normalizeWatchOrientation(state.boardOrientation));
      setTimeControl(toSafeTimeControl(state.timeControl));
      setWhitePlayerName(String(state.white?.name || "White"));
      setBlackPlayerName(String(state.black?.name || "Black"));
      setWhitePlayerRating(
        Number.isFinite(Number(state.white?.rating))
          ? Number(state.white?.rating)
          : null,
      );
      setBlackPlayerRating(
        Number.isFinite(Number(state.black?.rating))
          ? Number(state.black?.rating)
          : null,
      );
      setWhiteTimeLeft(Math.max(0, Number(state.whiteTimeLeft || 0)));
      setBlackTimeLeft(Math.max(0, Number(state.blackTimeLeft || 0)));
      setActiveColor(state.activeColor === "b" ? "b" : "w");
      setViewers(Math.max(0, Number(state.viewers || 0)));
      setStatusMessage(null);
      setIsJoining(false);
      setIsGameOver(false);
    };

    const handleMoveApplied = (payload: WatchMovePayload) => {
      if (String(payload?.gameId || "") !== gameId) return;

      const san = String(payload?.move?.san || "").trim();
      const nextFen = String(payload?.fen || "").trim();
      const nextSquare =
        payload?.move?.from && payload?.move?.to
          ? { from: String(payload.move.from), to: String(payload.move.to) }
          : null;

      const previousFens = fensRef.current;
      const wasAtLatest = viewIndexRef.current >= previousFens.length - 1;

      const nextFens = [...previousFens];
      if (nextFen && nextFen !== nextFens[nextFens.length - 1]) {
        nextFens.push(nextFen);
      }
      setFens(nextFens);

      if (san) {
        setMoves((prev) => [...prev, san]);
      }
      setMoveSquares((prev) => {
        const next = [...prev];
        if (nextFens.length > previousFens.length) {
          next.push(nextSquare);
        } else if (san && next.length < nextFens.length - 1) {
          next.push(nextSquare);
        }
        return next;
      });

      if (wasAtLatest) {
        setViewIndex(Math.max(0, nextFens.length - 1));
      }

      setWhiteTimeLeft(Math.max(0, Number(payload.whiteTimeLeft || 0)));
      setBlackTimeLeft(Math.max(0, Number(payload.blackTimeLeft || 0)));
      setActiveColor(payload.turn === "b" ? "b" : "w");
    };

    const handleClockTick = (payload: WatchClockPayload) => {
      if (String(payload?.gameId || "") !== gameId) return;
      setWhiteTimeLeft(Math.max(0, Number(payload.whiteTimeLeft || 0)));
      setBlackTimeLeft(Math.max(0, Number(payload.blackTimeLeft || 0)));
      setActiveColor(payload.activeColor === "b" ? "b" : "w");
    };

    const handleViewerCount = (payload: WatchViewerPayload) => {
      if (String(payload?.gameId || "") !== gameId) return;
      setViewers(Math.max(0, Number(payload.viewers || 0)));
    };

    const handleSystemMessage = (payload: WatchSystemMessagePayload) => {
      if (String(payload?.gameId || "") !== gameId) return;
      const message = String(payload?.message || "").trim();
      if (message) {
        setStatusMessage(message);
      }
    };

    const handleGameOver = (payload: WatchGameOverPayload) => {
      if (String(payload?.gameId || "") !== gameId) return;
      const nextResult = buildResultDetails(
        String(payload?.reason || ""),
        payload?.winner ?? null,
        whitePlayerNameRef.current,
        blackPlayerNameRef.current,
      );
      setResultMessage(nextResult.message);
      setResultDetails(nextResult);
      setIsResultModalOpen(true);
      setStatusMessage("Game finished.");
      setIsGameOver(true);
    };

    socket.on("watchState", applyWatchState);
    socket.on("moveApplied", handleMoveApplied);
    socket.on("watchClock", handleClockTick);
    socket.on("watchViewerCount", handleViewerCount);
    socket.on("gameSystemMessage", handleSystemMessage);
    socket.on("gameOver", handleGameOver);

    socket.emit(
      "watchGame",
      { gameId },
      (response?: {
        success?: boolean;
        error?: string;
        state?: WatchStatePayload;
      }) => {
        if (response?.success === false) {
          setStatusMessage(response.error || "Unable to watch this game.");
          setIsJoining(false);
          return;
        }
        if (response?.state) {
          applyWatchState(response.state);
        }
      },
    );

    return () => {
      socket.off("watchState", applyWatchState);
      socket.off("moveApplied", handleMoveApplied);
      socket.off("watchClock", handleClockTick);
      socket.off("watchViewerCount", handleViewerCount);
      socket.off("gameSystemMessage", handleSystemMessage);
      socket.off("gameOver", handleGameOver);
      socket.emit("unwatchGame", { gameId });
    };
  }, [gameId, isConnected, socket]);

  const safeViewIndex = Math.min(
    Math.max(viewIndex, 0),
    Math.max(0, fens.length - 1),
  );
  const displayedFen = fens[safeViewIndex] || "start";
  const latestMoveIndex = Math.max(0, fens.length - 1);
  const canStepBackward = safeViewIndex > 0;
  const canStepForward = safeViewIndex < latestMoveIndex;
  const highlightedMove =
    safeViewIndex > 0 ? moveSquares[safeViewIndex - 1] : null;

  const bottomColor: WatchColor = orientation === "black" ? "b" : "w";
  const topColor: WatchColor = bottomColor === "w" ? "b" : "w";
  const topPlayerName = topColor === "w" ? whitePlayerName : blackPlayerName;
  const bottomPlayerName =
    bottomColor === "w" ? whitePlayerName : blackPlayerName;
  const topPlayerRating =
    topColor === "w" ? whitePlayerRating : blackPlayerRating;
  const bottomPlayerRating =
    bottomColor === "w" ? whitePlayerRating : blackPlayerRating;
  const isBottomTurn = activeColor === bottomColor;
  const topClock = topColor === "w" ? whiteTimeLeft : blackTimeLeft;
  const bottomClock = bottomColor === "w" ? whiteTimeLeft : blackTimeLeft;
  const liveTimeControlLabel =
    timeControl.initial > 0
      ? `${timeControl.initial / 60}+${timeControl.increment}`
      : "-";
  const liveStatusMessage = isJoining
    ? "Joining live game..."
    : `${statusMessage ? `${statusMessage} | ` : ""}Time control: ${liveTimeControlLabel} | Turn: ${
        activeColor === "w" ? "White" : "Black"
      }`;

  const spectatorSettings: GameSettings = useMemo(
    () => ({
      timeControl: {
        initial: timeControl.initial,
        increment: timeControl.increment,
      },
      playAs: orientation,
      difficulty: 0,
    }),
    [orientation, timeControl.increment, timeControl.initial],
  );

  const spectatorGame = useMemo(
    () => ({
      fen: () => displayedFen,
    }),
    [displayedFen],
  );
  const closeResultModal = () => {
    setIsResultModalOpen(false);
  };

  return (
    <>
      <QuickMatchGameView
        game={spectatorGame}
        lastMove={highlightedMove}
        moves={moves}
        gameSettings={spectatorSettings}
        gameStarted={!isJoining}
        gameOver={isGameOver}
        gameResult={resultMessage}
        isPlayerTurn={isBottomTurn}
        playerColor={bottomColor}
        savedGameId={null}
        historyPersistenceStatus="idle"
        showGameOverModal={false}
        optionSquares={{}}
        preMoveSquares={{}}
        playerRating={null}
        opponentRating={null}
        statusMessage={liveStatusMessage}
        onSquareClick={() => {}}
        onPieceDrop={() => false}
        onCancelSelection={() => {}}
        isDraggablePiece={() => false}
        setOpponentTime={() => {}}
        setPlayerTime={() => {}}
        playerClockSeed={bottomClock}
        opponentClockSeed={topClock}
        isClockPaused={isGameOver}
        onTimeOut={() => {}}
        onResign={() => {}}
        onRematch={() => {}}
        onNewGame={() => {}}
        variant={variant}
        boardFenOverride={displayedFen}
        boardOrientationOverride={orientation}
        topPlayerNameOverride={topPlayerName}
        topPlayerRatingOverride={topPlayerRating}
        bottomPlayerNameOverride={bottomPlayerName}
        bottomPlayerRatingOverride={bottomPlayerRating}
        sidebarTitleOverride="Spectating"
        sidebarHeaderRightOverride={`${viewers} watching`}
        activeMovePly={safeViewIndex}
        moveLogFooterMessage={null}
        customActionsOverride={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewIndex((prev) => Math.max(0, prev - 1))}
              disabled={!canStepBackward}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-theme-panel/10 hover:bg-theme-panel/15 text-theme-foreground font-medium transition-colors disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" /> <Trans>Previous</Trans> </button>
            <button
              type="button"
              onClick={() =>
                setViewIndex((prev) => Math.min(latestMoveIndex, prev + 1))
              }
              disabled={!canStepForward}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-theme-panel/10 hover:bg-theme-panel/15 text-theme-foreground font-medium transition-colors disabled:opacity-50"
            > <Trans>Next</Trans> <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        }
      />

      {isResultModalOpen && resultDetails ? (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-theme-panel/55 p-4 backdrop-blur-[2px]">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Game result"
            className="relative w-full max-w-[500px] overflow-hidden rounded-[22px] border border-theme-glass/80 bg-theme-panel/95 shadow-[0_24px_70px_rgba(2,6,23,0.75)]"
          >
            <button
              type="button"
              onClick={closeResultModal}
              aria-label="Close result modal"
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-theme-border/50 bg-theme-panel/70 text-theme-foreground transition-colors hover:bg-theme-surface"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="bg-gradient-to-br from-theme-panel via-theme-surface to-theme-base px-6 pb-6 pt-12 text-center">
              <h2 className="text-4xl font-semibold leading-tight text-rose-100">
                {resultDetails.title}
              </h2>
              <p className="mt-3 text-sm text-theme-muted">{resultDetails.subtitle}</p>

              <div className="mt-8 space-y-3">
                <button
                  type="button"
                  onClick={closeResultModal}
                  className="w-full rounded-xl bg-sky-600 px-5 py-3 font-semibold text-theme-on-accent transition-colors hover:bg-sky-500"
                > <Trans>Continue Watching Moves</Trans> </button>
                <button
                  type="button"
                  onClick={() => navigate("/watch")}
                  className="w-full rounded-xl border border-theme-border bg-theme-surface/70 px-5 py-3 font-semibold text-theme-foreground transition-colors hover:bg-theme-surface"
                > <Trans>Back to Watch</Trans> </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
