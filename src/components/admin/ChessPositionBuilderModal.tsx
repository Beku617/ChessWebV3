import { useEffect, useMemo, useState } from "react";
import { Chessboard } from "react-chessboard";
import type {
  BoardPosition,
  Piece,
  Square,
} from "react-chessboard/dist/chessboard/types";
import { Chess, type Square as ChessSquare } from "chess.js";
import { Copy, Eraser, RotateCcw, X } from "lucide-react";
import bishopIcon from "../../assets/pieces/cburnett/bishop.svg";
import kingIcon from "../../assets/pieces/cburnett/king.svg";
import knightIcon from "../../assets/pieces/cburnett/knight.svg";
import pawnIcon from "../../assets/pieces/cburnett/pawn.svg";
import queenIcon from "../../assets/pieces/cburnett/queen.svg";
import rookIcon from "../../assets/pieces/cburnett/rook.svg";
import {
  detectFenSideToMove,
  type SideToMove,
  validateLegalChessPosition,
  withFenSideToMove,
} from "../../utils/chessPositionValidation";

type SelectedTool = Piece | "eraser" | null;

type PositionBuilderModalApplyPayload = {
  fen: string;
  sideToMove: SideToMove;
};

type ChessPositionBuilderModalProps = {
  open: boolean;
  title: string;
  applyLabel: string;
  initialFen: string;
  initialSideToMove: SideToMove;
  onClose: () => void;
  onApply: (payload: PositionBuilderModalApplyPayload) => void;
};

const EMPTY_BOARD_FEN = "8/8/8/8/8/8/8/8";
const STARTING_BOARD_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";

const PIECE_ICONS: Record<Piece, string> = {
  wK: kingIcon,
  wQ: queenIcon,
  wR: rookIcon,
  wB: bishopIcon,
  wN: knightIcon,
  wP: pawnIcon,
  bK: kingIcon,
  bQ: queenIcon,
  bR: rookIcon,
  bB: bishopIcon,
  bN: knightIcon,
  bP: pawnIcon,
};

const PIECE_LABELS: Record<Piece, string> = {
  wK: "White king",
  wQ: "White queen",
  wR: "White rook",
  wB: "White bishop",
  wN: "White knight",
  wP: "White pawn",
  bK: "Black king",
  bQ: "Black queen",
  bR: "Black rook",
  bB: "Black bishop",
  bN: "Black knight",
  bP: "Black pawn",
};

const WHITE_PIECES: Piece[] = ["wK", "wQ", "wR", "wB", "wN", "wP"];
const BLACK_PIECES: Piece[] = ["bK", "bQ", "bR", "bB", "bN", "bP"];

function PiecePaletteIcon({ piece }: { piece: Piece }) {
  const isBlackPiece = piece.startsWith("b");

  return (
    <img
      src={PIECE_ICONS[piece]}
      alt=""
      aria-hidden="true"
      draggable={false}
      className="h-7 w-7 select-none object-contain"
      style={{
        filter: isBlackPiece
          ? "invert(1) drop-shadow(0 0 1px rgba(255,255,255,0.9))"
          : "drop-shadow(0 0 1px rgba(0,0,0,0.85))",
      }}
    />
  );
}

function fenToPosition(fen: string): BoardPosition {
  const boardPart = String(fen || "")
    .trim()
    .split(/\s+/)[0];

  if (!boardPart) {
    throw new Error("Invalid FEN string");
  }

  const rows = boardPart.split("/");
  if (rows.length !== 8) {
    throw new Error("Invalid FEN board");
  }

  const position: BoardPosition = {};

  rows.forEach((row, rowIndex) => {
    const rank = 8 - rowIndex;
    let fileIndex = 0;

    for (const char of row) {
      if (/\d/.test(char)) {
        fileIndex += parseInt(char, 10);
        continue;
      }

      if (!/[prnbqkPRNBQK]/.test(char)) {
        throw new Error("Invalid FEN piece");
      }

      if (fileIndex > 7) {
        throw new Error("Invalid FEN row width");
      }

      const file = "abcdefgh"[fileIndex];
      const color = char === char.toUpperCase() ? "w" : "b";
      const piece = char.toUpperCase();
      position[`${file}${rank}`] = `${color}${piece}`;
      fileIndex += 1;
    }

    if (fileIndex !== 8) {
      throw new Error("Invalid FEN row width");
    }
  });

  return position;
}

function positionToFen(position: BoardPosition, sideToMove: SideToMove): string {
  const rows: string[] = [];

  for (let rank = 8; rank >= 1; rank -= 1) {
    let row = "";
    let emptyCount = 0;

    for (const file of "abcdefgh") {
      const square = `${file}${rank}`;
      const piece = position[square];

      if (piece) {
        if (emptyCount > 0) {
          row += emptyCount;
          emptyCount = 0;
        }

        row += piece[0] === "w" ? piece[1].toUpperCase() : piece[1].toLowerCase();
      } else {
        emptyCount += 1;
      }
    }

    if (emptyCount > 0) {
      row += emptyCount;
    }

    rows.push(row);
  }

  return `${rows.join("/")} ${sideToMove} - - 0 1`;
}

export default function ChessPositionBuilderModal({
  open,
  title,
  applyLabel,
  initialFen,
  initialSideToMove,
  onClose,
  onApply,
}: ChessPositionBuilderModalProps) {
  const [selectedPiece, setSelectedPiece] = useState<SelectedTool>("wK");
  const [boardPosition, setBoardPosition] = useState<BoardPosition>({});
  const [sideToMove, setSideToMove] = useState<SideToMove>("w");
  const [fenInput, setFenInput] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [fenCopyFallback, setFenCopyFallback] = useState("");

  useEffect(() => {
    if (!open) return;

    const detectedSide = detectFenSideToMove(initialFen, initialSideToMove);
    const nextFen = withFenSideToMove(initialFen, detectedSide);

    try {
      setBoardPosition(fenToPosition(nextFen));
    } catch {
      const fallbackFen = `${EMPTY_BOARD_FEN} ${detectedSide} - - 0 1`;
      setBoardPosition(fenToPosition(fallbackFen));
    }

    setSideToMove(detectedSide);
    setFenInput(nextFen);
    setSelectedPiece("wK");
    setErrorMessage("");
    setFenCopyFallback("");
  }, [initialFen, initialSideToMove, open]);

  const boardFen = useMemo(
    () => positionToFen(boardPosition, sideToMove),
    [boardPosition, sideToMove],
  );

  const applyBoardPosition = (
    nextPosition: BoardPosition,
    nextSideToMove = sideToMove,
  ) => {
    const nextFen = positionToFen(nextPosition, nextSideToMove);
    setBoardPosition(nextPosition);
    setFenInput(nextFen);
    setErrorMessage("");
    setFenCopyFallback("");
  };

  const handleSquareClick = (square: Square) => {
    if (!selectedPiece) return;

    const nextPosition: BoardPosition = { ...boardPosition };

    if (selectedPiece === "eraser") {
      delete nextPosition[square];
    } else {
      nextPosition[square] = selectedPiece;
    }

    applyBoardPosition(nextPosition);
  };

  const handlePieceDrop = (sourceSquare: Square, targetSquare: Square) => {
    if (sourceSquare === targetSquare) return false;

    const movingPiece = boardPosition[sourceSquare];
    if (!movingPiece) return false;
    const nextGame = new Chess();
    const loaded = nextGame.load(positionToFen(boardPosition, sideToMove));
    if (!loaded) {
      setErrorMessage(
        "Load a legal position first (with both kings) before moving pieces.",
      );
      return false;
    }

    const move = nextGame.move({
      from: sourceSquare as ChessSquare,
      to: targetSquare as ChessSquare,
      promotion: "q",
    });

    if (!move) {
      setErrorMessage("Illegal move for this position.");
      return false;
    }

    applyBoardPosition(fenToPosition(nextGame.fen()), nextGame.turn() === "b" ? "b" : "w");
    return true;
  };

  const handleLoadFen = () => {
    const rawFen = fenInput.trim();
    if (!rawFen) {
      setErrorMessage("Enter a FEN string first.");
      return;
    }

    const detectedSide = detectFenSideToMove(rawFen, sideToMove);
    const nextFen = withFenSideToMove(rawFen, detectedSide);

    try {
      const nextPosition = fenToPosition(nextFen);
      setSideToMove(detectedSide);
      applyBoardPosition(nextPosition, detectedSide);
      setFenInput(nextFen);
    } catch {
      setErrorMessage("Invalid FEN string.");
    }
  };

  const handleCopyFen = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setFenCopyFallback(boardFen);
      setErrorMessage("Clipboard unavailable. FEN shown below.");
      return;
    }

    try {
      await navigator.clipboard.writeText(boardFen);
      setFenCopyFallback("");
      setErrorMessage("");
    } catch {
      setFenCopyFallback(boardFen);
      setErrorMessage("Clipboard blocked. FEN shown below.");
    }
  };

  const handleSideChange = (nextSide: SideToMove) => {
    setSideToMove(nextSide);
    const nextFen = positionToFen(boardPosition, nextSide);
    setFenInput(nextFen);
    setErrorMessage("");
  };

  const handleStartPosition = () => {
    const nextFen = `${STARTING_BOARD_FEN} w KQkq - 0 1`;
    setSideToMove("w");
    applyBoardPosition(fenToPosition(nextFen), "w");
  };

  const handleClearBoard = () => {
    applyBoardPosition({});
  };

  const handleApply = () => {
    const validation = validateLegalChessPosition(boardFen, sideToMove);

    if (!validation.valid) {
      setErrorMessage(validation.message);
      return;
    }

    onApply({
      fen: validation.normalizedFen,
      sideToMove,
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-2xl border border-theme-glass bg-theme-panel shadow-[0_24px_70px_rgba(2,6,23,0.65)]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-theme-glass bg-theme-panel px-5 py-4">
          <h3 className="text-lg font-semibold text-theme-foreground">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-theme-glass p-2 text-theme-muted transition-colors hover:bg-theme-hover hover:text-theme-foreground"
            aria-label="Close position builder"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="mx-auto aspect-square max-w-[420px] overflow-hidden rounded-xl border border-theme-glass bg-theme-surface">
              <Chessboard
                id="admin-position-builder-board"
                allowDragOutsideBoard={false}
                position={boardFen}
                onSquareClick={handleSquareClick}
                onPieceDrop={handlePieceDrop}
                boardOrientation={sideToMove === "w" ? "white" : "black"}
                arePiecesDraggable={true}
                boardWidth={420}
                dropOffBoardAction="snapback"
              />
            </div>
            <p className="text-xs text-theme-muted">
              Click a piece from the palette, then click a square to place it. Drag
              pieces to make legal moves.
            </p>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-theme-glass bg-theme-surface p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-theme-muted">
                Side to move
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleSideChange("w")}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    sideToMove === "w"
                      ? "bg-brand-500 text-theme-on-accent"
                      : "border border-theme-glass bg-theme-panel text-theme-foreground hover:bg-theme-hover"
                  }`}
                >
                  White
                </button>
                <button
                  type="button"
                  onClick={() => handleSideChange("b")}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    sideToMove === "b"
                      ? "bg-brand-500 text-theme-on-accent"
                      : "border border-theme-glass bg-theme-panel text-theme-foreground hover:bg-theme-hover"
                  }`}
                >
                  Black
                </button>
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-theme-glass bg-theme-surface p-3">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-theme-muted">
                Piece palette
              </div>

              <div className="flex items-center gap-2">
                <span className="w-12 text-xs font-medium text-theme-muted">White</span>
                <div className="flex gap-1">
                  {WHITE_PIECES.map((piece) => (
                    <button
                      key={piece}
                      type="button"
                      onClick={() => setSelectedPiece(selectedPiece === piece ? null : piece)}
                      title={PIECE_LABELS[piece]}
                      aria-label={PIECE_LABELS[piece]}
                      className={`h-9 w-9 rounded transition-colors ${
                        selectedPiece === piece
                          ? "bg-brand-500 ring-2 ring-brand-400"
                          : "border border-theme-glass bg-theme-panel hover:bg-theme-hover"
                      }`}
                    >
                      <span className="flex h-full w-full items-center justify-center">
                        <PiecePaletteIcon piece={piece} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-12 text-xs font-medium text-theme-muted">Black</span>
                <div className="flex gap-1">
                  {BLACK_PIECES.map((piece) => (
                    <button
                      key={piece}
                      type="button"
                      onClick={() => setSelectedPiece(selectedPiece === piece ? null : piece)}
                      title={PIECE_LABELS[piece]}
                      aria-label={PIECE_LABELS[piece]}
                      className={`h-9 w-9 rounded transition-colors ${
                        selectedPiece === piece
                          ? "bg-brand-500 ring-2 ring-brand-400"
                          : "border border-theme-glass bg-theme-panel hover:bg-theme-hover"
                      }`}
                    >
                      <span className="flex h-full w-full items-center justify-center">
                        <PiecePaletteIcon piece={piece} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-12 text-xs font-medium text-theme-muted">Tool</span>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedPiece(selectedPiece === "eraser" ? null : "eraser")
                  }
                  className={`flex h-9 w-9 items-center justify-center rounded transition-colors ${
                    selectedPiece === "eraser"
                      ? "bg-red-500 text-theme-on-accent"
                      : "border border-theme-glass bg-theme-panel text-theme-foreground hover:bg-theme-hover"
                  }`}
                  title="Eraser"
                  aria-label="Eraser"
                >
                  <Eraser className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-theme-glass bg-theme-surface p-3">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-theme-muted">
                FEN
              </label>
              <textarea
                value={fenInput}
                onChange={(event) => setFenInput(event.target.value)}
                className="min-h-[76px] w-full rounded-lg border border-theme-glass bg-theme-panel px-3 py-2 font-mono text-xs text-theme-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleLoadFen}
                  className="rounded-lg border border-theme-glass bg-theme-panel px-2.5 py-1.5 text-xs font-medium text-theme-foreground transition-colors hover:bg-theme-hover"
                >
                  Load FEN
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyFen()}
                  className="inline-flex items-center gap-1 rounded-lg border border-theme-glass bg-theme-panel px-2.5 py-1.5 text-xs font-medium text-theme-foreground transition-colors hover:bg-theme-hover"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy FEN
                </button>
              </div>
              {fenCopyFallback && (
                <textarea
                  readOnly
                  value={fenCopyFallback}
                  className="min-h-[56px] w-full rounded-lg border border-theme-glass bg-theme-panel px-3 py-2 font-mono text-[11px] text-theme-foreground"
                />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleStartPosition}
                className="rounded-lg border border-theme-glass bg-theme-panel px-3 py-2 text-xs font-medium text-theme-foreground transition-colors hover:bg-theme-hover"
              >
                Start position
              </button>
              <button
                type="button"
                onClick={handleClearBoard}
                className="inline-flex items-center gap-1 rounded-lg border border-theme-glass bg-theme-panel px-3 py-2 text-xs font-medium text-theme-foreground transition-colors hover:bg-theme-hover"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Clear board
              </button>
            </div>

            {errorMessage && (
              <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-500">
                {errorMessage}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-theme-glass pt-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-theme-glass bg-theme-panel px-3 py-2 text-sm font-medium text-theme-foreground transition-colors hover:bg-theme-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-theme-on-accent transition-colors hover:bg-brand-500"
              >
                {applyLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
