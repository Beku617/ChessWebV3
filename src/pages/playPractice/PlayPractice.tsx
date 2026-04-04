import { AnimatePresence, motion } from "framer-motion";
import { Chess, Square } from "chess.js";
import { Target } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Chessboard } from "react-chessboard";
import { useLocation, useNavigate } from "react-router-dom";
import { useBoardTheme } from "../../hooks/useBoardTheme";
import {
  playChessMoveSound,
  playGameplaySound,
} from "../../utils/moveSounds";
import { BOARD_FRAME } from "../quickMatch/types";

type PracticeModeId =
  | "free-move"
  | "position-builder"
  | "engine-sparring"
  | "endgame-drills"
  | "pattern-recognition";

interface PracticeMode {
  id: PracticeModeId;
  title: string;
  description: string;
  icon: string;
}

const PIECE_VALUES: Record<string, number> = {
  p: 1,
  n: 3.1,
  b: 3.3,
  r: 5.1,
  q: 9,
  k: 0,
};

const SELECTED_SQUARE_STYLE: CSSProperties = {
  backgroundColor: "rgba(13, 148, 136, 0.35)",
  borderRadius: "0",
};

const LEGAL_TARGET_STYLE: CSSProperties = {
  background:
    "radial-gradient(circle, rgba(15, 118, 110, 0.65) 24%, rgba(0,0,0,0) 26%)",
  borderRadius: "0",
};

const LEGAL_CAPTURE_STYLE: CSSProperties = {
  backgroundColor: "rgba(220, 38, 38, 0.35)",
  borderRadius: "0",
};

const PRACTICE_MODES: PracticeMode[] = [
  {
    id: "free-move",
    title: "Free Move",
    description: "Move pieces freely for both sides, alternating turns.",
    icon: "♟️",
  },
  {
    id: "position-builder",
    title: "Position Builder",
    description: "Drag and drop pieces to set up any custom position.",
    icon: "🧱",
  },
  {
    id: "engine-sparring",
    title: "Engine Sparring",
    description: "Play against the built-in engine from any position.",
    icon: "🤖",
  },
  {
    id: "endgame-drills",
    title: "Endgame Drills",
    description: "Practice common endgame patterns.",
    icon: "🏁",
  },
  {
    id: "pattern-recognition",
    title: "Pattern Recognition",
    description: "Solve positions by identifying the key theme.",
    icon: "🧠",
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function evaluateGame(game: Chess) {
  let score = 0;
  const board = game.board();

  for (const rank of board) {
    for (const piece of rank) {
      if (!piece) continue;
      const value = PIECE_VALUES[piece.type] ?? 0;
      score += piece.color === "w" ? value : -value;
    }
  }

  const roundedScore = Number(score.toFixed(1));
  const absScore = Math.abs(roundedScore).toFixed(1);
  const label =
    Math.abs(roundedScore) < 0.05
      ? "0.0 Even"
      : `+${absScore} ${roundedScore > 0 ? "White" : "Black"}`;
  const percent = clamp(50 + Math.tanh(score / 4) * 45, 0, 100);

  return { score: roundedScore, label, percent };
}

function buildMoveRows(moves: string[]) {
  const rows: Array<{ moveNumber: number; white?: string; black?: string }> = [];

  for (let index = 0; index < moves.length; index += 2) {
    rows.push({
      moveNumber: Math.floor(index / 2) + 1,
      white: moves[index],
      black: moves[index + 1],
    });
  }

  return rows;
}

function cloneGameWithHistory(current: Chess) {
  const clone = new Chess();
  const verboseMoves = current.history({ verbose: true });

  if (verboseMoves.length > 0) {
    for (const move of verboseMoves) {
      clone.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion ?? undefined,
      });
    }
    return clone;
  }

  clone.load(current.fen());
  return clone;
}

export default function PlayPractice() {
  const navigate = useNavigate();
  const location = useLocation();
  const { colors } = useBoardTheme();

  const [expandedModeId, setExpandedModeId] = useState<PracticeModeId | null>(
    null,
  );
  const [game, setGame] = useState(() => new Chess());
  const [moveFrom, setMoveFrom] = useState<Square | null>(null);
  const [optionSquares, setOptionSquares] = useState<
    Record<string, CSSProperties>
  >({});
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(
    null,
  );
  const showEvalBar = true;
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">(
    "white",
  );
  const [panelNotice, setPanelNotice] = useState<string | null>(null);
  const [exportFallback, setExportFallback] = useState("");
  const [redoStack, setRedoStack] = useState<
    Array<{ from: Square; to: Square; promotion?: string }>
  >([]);
  const [boardWidth, setBoardWidth] = useState(620);

  const leftRef = useRef<HTMLDivElement>(null);
  const movesEndRef = useRef<HTMLDivElement>(null);
  const wasFreeMoveRef = useRef(false);
  const gameRef = useRef(game);

  const normalizedPath = location.pathname.replace(/\/+$/, "").toLowerCase();
  const isFreeMoveActive = normalizedPath === "/play/practice/freemove";

  const evalState = useMemo(() => evaluateGame(game), [game]);
  const sanMoves = useMemo(() => game.history(), [game]);
  const moveRows = useMemo(() => buildMoveRows(sanMoves), [sanMoves]);
  const lastMoveSquares = useMemo<Record<string, CSSProperties>>(() => {
    if (!lastMove) return {};
    return {
      [lastMove.from]: { backgroundColor: "rgba(250, 204, 21, 0.5)" },
      [lastMove.to]: { backgroundColor: "rgba(74, 222, 128, 0.55)" },
    };
  }, [lastMove]);
  const boardSquareStyles = useMemo(
    () => ({ ...lastMoveSquares, ...optionSquares }),
    [lastMoveSquares, optionSquares],
  );

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    if (isFreeMoveActive && !wasFreeMoveRef.current) {
      const freshGame = new Chess();
      setGame(freshGame);
      gameRef.current = freshGame;
      setMoveFrom(null);
      setOptionSquares({});
      setLastMove(null);
      setBoardOrientation("white");
      setPanelNotice(null);
      setExportFallback("");
      setRedoStack([]);
      playGameplaySound("gameStart");
    }
    wasFreeMoveRef.current = isFreeMoveActive;
  }, [isFreeMoveActive]);

  useEffect(() => {
    const container = leftRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const padding = 12;
      const availableWidth = rect.width - padding - BOARD_FRAME;
      const availableHeight = Math.min(rect.height, window.innerHeight) - padding;
      const size = Math.floor(Math.min(availableWidth, availableHeight));
      setBoardWidth(Math.max(300, Math.min(size, 700)));
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    window.addEventListener("resize", updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  useEffect(() => {
    if (!isFreeMoveActive || !movesEndRef.current) return;
    movesEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [isFreeMoveActive, sanMoves.length]);

  useEffect(() => {
    if (!panelNotice) return;
    const timer = window.setTimeout(() => setPanelNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [panelNotice]);

  const handleModeClick = (mode: PracticeMode) => {
    if (mode.id === "free-move") {
      navigate("/play/practice/freeMove");
      return;
    }
    setExpandedModeId((current) => (current === mode.id ? null : mode.id));
  };

  const clearSelection = () => {
    setMoveFrom(null);
    setOptionSquares({});
  };

  const getMoveOptionsForSquare = (square: Square) => {
    const currentGame = gameRef.current;
    const legalMoves = currentGame.moves({ square, verbose: true });
    if (!legalMoves.length) {
      setOptionSquares({});
      return false;
    }

    const squares: Record<string, CSSProperties> = {
      [square]: SELECTED_SQUARE_STYLE,
    };
    legalMoves.forEach((move) => {
      const isCapture = Boolean(currentGame.get(move.to as Square));
      squares[move.to] = isCapture ? LEGAL_CAPTURE_STYLE : LEGAL_TARGET_STYLE;
    });

    setOptionSquares(squares);
    return true;
  };

  const commitMove = (sourceSquare: Square, targetSquare: Square) => {
    const currentGame = gameRef.current;
    const currentPiece = currentGame.get(sourceSquare);
    if (!currentPiece || currentPiece.color !== currentGame.turn()) {
      playGameplaySound("illegal");
      return false;
    }

    try {
      const next = cloneGameWithHistory(currentGame);
      const move = next.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q",
      });

      if (!move) {
        playGameplaySound("illegal");
        return false;
      }

      setGame(next);
      gameRef.current = next;
      setLastMove({ from: sourceSquare, to: targetSquare });
      clearSelection();
      setPanelNotice(null);
      setExportFallback("");
      setRedoStack([]);
      playChessMoveSound(move, { isOpponentMove: move.color === "b" });
      if (next.isGameOver() && !next.isCheckmate()) {
        playGameplaySound("gameEnd");
      }
      return true;
    } catch {
      playGameplaySound("illegal");
      return false;
    }
  };

  const handleSquareClick = (squareName: string) => {
    if (!isFreeMoveActive) return;

    const currentGame = gameRef.current;
    const square = squareName as Square;
    if (!moveFrom) {
      const clickedPiece = currentGame.get(square);
      if (!clickedPiece || clickedPiece.color !== currentGame.turn()) {
        return;
      }
      getMoveOptionsForSquare(square);
      setMoveFrom(square);
      return;
    }

    if (moveFrom === square) {
      clearSelection();
      return;
    }

    const clickedPiece = currentGame.get(square);
    if (clickedPiece && clickedPiece.color === currentGame.turn()) {
      getMoveOptionsForSquare(square);
      setMoveFrom(square);
      return;
    }

    const isLegalTarget = currentGame
      .moves({ square: moveFrom, verbose: true })
      .some((move) => move.to === square);

    if (!isLegalTarget) {
      playGameplaySound("illegal");
      setPanelNotice("Choose one of the highlighted legal moves.");
      return;
    }

    commitMove(moveFrom, square);
  };

  const handlePieceDrop = (sourceSquare: string, targetSquare: string) => {
    if (!isFreeMoveActive || sourceSquare === targetSquare) return false;
    return commitMove(sourceSquare as Square, targetSquare as Square);
  };

  const handleUndo = () => {
    const currentGame = gameRef.current;
    const next = cloneGameWithHistory(currentGame);
    const undone = next.undo();
    if (!undone) {
      setPanelNotice("No moves to undo.");
      return;
    }

    setRedoStack((current) => [
      ...current,
      {
        from: undone.from as Square,
        to: undone.to as Square,
        promotion: undone.promotion ?? undefined,
      },
    ]);
    setGame(next);
    gameRef.current = next;
    setLastMove(null);
    clearSelection();
    setPanelNotice("Last move undone.");
    setExportFallback("");
  };

  const handleRedo = () => {
    if (!redoStack.length) {
      setPanelNotice("No moves to redo.");
      return;
    }

    const redoMove = redoStack[redoStack.length - 1];
    const currentGame = gameRef.current;
    const next = cloneGameWithHistory(currentGame);
    const move = next.move({
      from: redoMove.from,
      to: redoMove.to,
      promotion: redoMove.promotion as "q" | "r" | "b" | "n" | undefined,
    });

    if (!move) {
      setPanelNotice("Cannot redo from current position.");
      setRedoStack([]);
      return;
    }

    setRedoStack((current) => current.slice(0, -1));
    setGame(next);
    gameRef.current = next;
    setLastMove({ from: redoMove.from, to: redoMove.to });
    clearSelection();
    setPanelNotice("Move restored.");
    setExportFallback("");
    playChessMoveSound(move, { isOpponentMove: move.color === "b" });
  };

  const handleReset = () => {
    const freshGame = new Chess();
    setGame(freshGame);
    gameRef.current = freshGame;
    setLastMove(null);
    clearSelection();
    setPanelNotice("Position reset to start.");
    setExportFallback("");
    setRedoStack([]);
    playGameplaySound("gameStart");
  };

  const handleFlipBoard = () => {
    setBoardOrientation((current) => (current === "white" ? "black" : "white"));
  };

  const handleExportPgn = async () => {
    const pgn = game.pgn();
    if (!pgn) {
      setPanelNotice("No moves to export yet.");
      return;
    }

    if (!navigator.clipboard?.writeText) {
      setExportFallback(pgn);
      setPanelNotice("Clipboard unavailable. PGN displayed below.");
      return;
    }

    try {
      await navigator.clipboard.writeText(pgn);
      setPanelNotice("PGN copied to clipboard.");
      setExportFallback("");
    } catch {
      setExportFallback(pgn);
      setPanelNotice("Clipboard blocked. PGN displayed below.");
    }
  };

  return (
    <div className="relative h-screen w-full bg-slate-100 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 overflow-hidden">
      <div
        className={`h-full grid ${
          isFreeMoveActive && showEvalBar
            ? "grid-cols-[minmax(0,1.02fr)_34px_minmax(0,0.98fr)]"
            : "grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]"
        }`}
      >
        <div
          ref={leftRef}
          className="min-w-0 flex items-center justify-center p-2 h-full"
        >
          <div
            className="rounded-2xl overflow-hidden shadow-2xl border border-gray-200/60 dark:border-white/10"
            style={{ width: boardWidth, height: boardWidth }}
          >
            <Chessboard
              id="PracticeFreeMoveBoard"
              boardWidth={boardWidth}
              position={game.fen()}
              boardOrientation={boardOrientation}
              arePiecesDraggable={isFreeMoveActive}
              onSquareClick={(squareName) => handleSquareClick(squareName)}
              onSquareRightClick={() => clearSelection()}
              onPieceDrop={(sourceSquare, targetSquare) =>
                handlePieceDrop(sourceSquare, targetSquare)
              }
              isDraggablePiece={({ sourceSquare }) => {
                if (!isFreeMoveActive) return false;
                const currentGame = gameRef.current;
                const piece = currentGame.get(sourceSquare as Square);
                return !!piece && piece.color === currentGame.turn();
              }}
              customSquareStyles={boardSquareStyles}
              customDarkSquareStyle={{
                backgroundColor: colors.dark,
                transition: "background-color 160ms ease",
              }}
              customLightSquareStyle={{
                backgroundColor: colors.light,
                transition: "background-color 160ms ease",
              }}
              customBoardStyle={{
                borderRadius: "8px",
                boxShadow: "0 8px 24px rgba(2, 6, 23, 0.45)",
              }}
            />
          </div>
        </div>

        {isFreeMoveActive && showEvalBar && (
          <div className="h-full flex items-center justify-center py-3">
            <div className="h-full w-full flex flex-col items-center px-1">
              <div className="mb-1 px-1.5 py-1 rounded bg-slate-900 text-white text-[10px] font-semibold text-center leading-none">
                {evalState.label}
              </div>
              <div className="relative flex-1 w-4 rounded overflow-hidden border border-gray-400/70 dark:border-slate-600 bg-slate-200 dark:bg-slate-800">
                <div
                  className="absolute left-0 right-0 bottom-0 bg-white transition-all duration-300 ease-out"
                  style={{ height: `${evalState.percent}%` }}
                />
                <div
                  className="absolute left-0 right-0 top-0 bg-slate-950 transition-all duration-300 ease-out"
                  style={{ height: `${100 - evalState.percent}%` }}
                />
                <div className="absolute left-0 right-0 top-1/2 h-px bg-slate-400/60" />
              </div>
            </div>
          </div>
        )}

        <div
          className={`min-w-0 w-full bg-white/90 dark:bg-slate-900/95 border-l border-gray-200/60 dark:border-white/10 overflow-hidden ${
            isFreeMoveActive ? "h-full" : "h-full flex items-center"
          }`}
        >
          <AnimatePresence mode="wait" initial={false}>
            {isFreeMoveActive ? (
              <motion.section
                key="free-move-session"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="h-full flex flex-col min-h-0"
              >
                <div className="p-3 border-b border-gray-200/60 dark:border-white/10 flex-shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-teal-500" />
                      <h2 className="font-bold text-[15px] text-gray-900 dark:text-white">
                        Free Move
                      </h2>
                    </div>
                    <button
                      onClick={() => navigate("/play/practice")}
                      className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-200 dark:hover:bg-slate-700"
                    >
                      Back
                    </button>
                  </div>
                </div>

                <div className="flex-1 min-h-0 px-3 py-3 flex flex-col gap-3 overflow-hidden">
                  <section className="rounded-2xl border border-gray-200/70 dark:border-white/10 bg-white/75 dark:bg-slate-900/60 p-0 overflow-hidden flex flex-col flex-1 min-h-0">
                    <div className="px-3 py-2 border-b border-gray-200/60 dark:border-white/10 text-[12px] font-semibold text-gray-900 dark:text-white">
                      Move History
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 pr-2 font-mono">
                      {moveRows.length === 0 ? (
                        <div className="text-xs text-gray-500 dark:text-gray-400 py-4 text-center">
                          Make a legal move to start your PGN list.
                        </div>
                      ) : (
                        <div className="space-y-1.5 text-sm">
                          {moveRows.map((row) => (
                            <div
                              key={row.moveNumber}
                              className="grid grid-cols-[36px_minmax(0,1fr)_minmax(0,1fr)] gap-2"
                            >
                              <span className="text-gray-500 dark:text-gray-400">
                                {row.moveNumber}.
                              </span>
                              <span className="text-gray-900 dark:text-gray-100 truncate">
                                {row.white ?? ""}
                              </span>
                              <span className="text-gray-900 dark:text-gray-100 truncate">
                                {row.black ?? ""}
                              </span>
                            </div>
                          ))}
                          <div ref={movesEndRef} />
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-gray-200/70 dark:border-white/10 bg-white/75 dark:bg-slate-900/60 p-3 flex-shrink-0">
                    <div className="text-[12px] font-semibold text-gray-900 dark:text-white mb-2">
                      Controls
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={handleUndo}
                        disabled={sanMoves.length === 0}
                        className="rounded-xl py-2.5 text-sm font-semibold bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                      >
                        {"<-"}
                      </button>
                      <button
                        onClick={handleRedo}
                        disabled={redoStack.length === 0}
                        className="rounded-xl py-2.5 text-sm font-semibold bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                      >
                        {"->"}
                      </button>
                      <button
                        onClick={handleReset}
                        className="rounded-xl py-2.5 text-sm font-semibold bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                      >
                        Reset to Start
                      </button>
                      <button
                        onClick={handleExportPgn}
                        className="rounded-xl py-2.5 text-sm font-semibold bg-teal-500/15 border border-teal-500/35 text-teal-700 dark:text-teal-300 hover:bg-teal-500/20 transition-colors"
                      >
                        Export PGN
                      </button>
                      <button
                        onClick={handleFlipBoard}
                        className="col-span-2 rounded-xl py-2.5 text-sm font-semibold bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                      >
                        Flip Board
                      </button>
                    </div>
                    {panelNotice && (
                      <div className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-300">
                        {panelNotice}
                      </div>
                    )}
                    {exportFallback && (
                      <textarea
                        readOnly
                        value={exportFallback}
                        className="mt-2 w-full h-28 rounded-lg border border-gray-300 dark:border-slate-700 bg-white/80 dark:bg-slate-950/60 text-xs font-mono p-2 text-gray-700 dark:text-gray-200"
                      />
                    )}
                  </section>
                </div>
              </motion.section>
            ) : (
              <motion.section
                key="mode-picker"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="w-full flex flex-col min-h-0"
                style={{ height: boardWidth }}
              >
                <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
                  {PRACTICE_MODES.map((mode) => {
                    const isExpanded = expandedModeId === mode.id;
                    return (
                      <button
                        key={mode.id}
                        onClick={() => handleModeClick(mode)}
                        className="w-full text-left rounded-2xl border border-gray-200/70 dark:border-white/10 bg-white/75 dark:bg-slate-900/60 p-3 transition-all duration-200 hover:border-teal-500/50 hover:bg-teal-500/5 dark:hover:bg-teal-500/10"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-slate-800 flex items-center justify-center text-lg flex-shrink-0">
                            {mode.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-gray-900 dark:text-white text-[13px]">
                              {mode.title}
                            </div>
                            <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                              {mode.description}
                            </div>
                          </div>
                        </div>
                        {mode.id !== "free-move" && isExpanded && (
                          <div className="mt-2 rounded-lg border border-dashed border-gray-300 dark:border-slate-700 px-2.5 py-2 text-[11px] text-gray-500 dark:text-gray-400">
                            This mode is planned next. Free Move is fully active now.
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
