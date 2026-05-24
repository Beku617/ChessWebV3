import { useState, useEffect, useCallback, useId, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation, Trans } from "react-i18next";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Loader2,
  X,
  Check,
  RotateCcw,
  Play,
  Square as SquareIcon,
  Eraser,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const PUZZLES_PER_PAGE = 10;

function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) pages.push("...");
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < total - 1) pages.push("...");
  pages.push(total);
  return pages;
}
import { Chessboard } from "react-chessboard";
import type {
  BoardPosition,
  CustomSquareStyles,
  Piece,
  Square,
} from "react-chessboard/dist/chessboard/types";
import { Chess } from "chess.js";
import AdminSidebar from "../components/AdminSidebar";
import { useAdminStore } from "../store/adminStore";
import bishopIcon from "../assets/pieces/cburnett/bishop.svg";
import kingIcon from "../assets/pieces/cburnett/king.svg";
import knightIcon from "../assets/pieces/cburnett/knight.svg";
import pawnIcon from "../assets/pieces/cburnett/pawn.svg";
import queenIcon from "../assets/pieces/cburnett/queen.svg";
import rookIcon from "../assets/pieces/cburnett/rook.svg";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface Puzzle {
  _id: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  category?: string;
  description: string;
  fen: string;
  solution: string[];
  rating: number;
  isActive?: boolean;
  isWhiteToMove: boolean;
  mateIn?: number;
  timesPlayed: number;
  timesSolved: number;
  duplicateCount?: number;
  quality?: {
    attempts: number;
    solved: number;
    failed: number;
    solveRate: number;
    failRate: number;
    avgTimeMs: number;
    masteredUsers?: number;
  };
  createdAt: string;
}

interface PuzzleFormData {
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  category: string;
  description: string;
  fen: string;
  solution: string;
  rating: number;
  isActive: boolean;
  isWhiteToMove: boolean;
  mateIn: number;
}

const defaultFormData: PuzzleFormData = {
  title: "",
  difficulty: "Easy",
  category: "tactics",
  description: "",
  fen: "8/8/8/8/8/8/8/8 w - - 0 1",
  solution: "",
  rating: 1200,
  isActive: true,
  isWhiteToMove: true,
  mateIn: 2,
};

type SelectedTool = Piece | "eraser" | null;

const EMPTY_BOARD_FEN = "8/8/8/8/8/8/8/8";

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

type VerboseMove = {
  from: Square;
  to: Square;
  san: string;
};


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

function getFenSideToMove(fen: string, fallback = true): boolean {
  const parts = fen.trim().split(/\s+/).filter(Boolean);
  if (parts[1] === "w") return true;
  if (parts[1] === "b") return false;
  return fallback;
}

function withFenSideToMove(fen: string, isWhiteToMove: boolean): string {
  const parts = fen.trim().split(/\s+/).filter(Boolean);
  const board = parts[0] || EMPTY_BOARD_FEN;
  const castling = parts[2] || "-";
  const enPassant = parts[3] || "-";
  const halfmove = parts[4] || "0";
  const fullmove = parts[5] || "1";
  return `${board} ${isWhiteToMove ? "w" : "b"} ${castling} ${enPassant} ${halfmove} ${fullmove}`;
}

function getPuzzleDraftError(formData: PuzzleFormData): string {
  if (!formData.title.trim()) return "Puzzle title is required.";
  if (!formData.fen.trim()) return "FEN position is required.";
  try {
    new Chess(withFenSideToMove(formData.fen, formData.isWhiteToMove));
  } catch {
    return "FEN position is invalid.";
  }

  const solution = formData.solution
    .split(",")
    .map((move) => move.trim())
    .filter(Boolean);
  if (solution.length === 0) {
    return "Record at least one solution move before saving.";
  }
  if (!Number.isFinite(Number(formData.rating))) {
    return "Rating must be a valid number.";
  }
  if (!Number.isFinite(Number(formData.mateIn)) || Number(formData.mateIn) < 1) {
    return "Move number must be at least 1.";
  }
  return "";
}

function getExpectedSolutionPlyCount(mateIn: number): number {
  const parsed = Number.isFinite(Number(mateIn)) ? Math.trunc(Number(mateIn)) : 1;
  return Math.max(1, parsed * 2 - 1);
}

function getSideToMoveLabel(game: Chess): string {
  return game.turn() === "w" ? "White" : "Black";
}

function getTerminalGameMessage(game: Chess): string {
  if (game.in_checkmate()) {
    return "Checkmate reached. The line is complete; undo the mating move if you need to record more moves.";
  }
  if (game.in_stalemate()) {
    return "Stalemate reached. The line is complete; undo if you need to record more moves.";
  }
  if (game.in_draw()) {
    return "Draw reached. The line is complete; undo if you need to record more moves.";
  }
  if (game.moves().length === 0) {
    return "No legal moves remain. Undo if you need to continue the line.";
  }
  return "";
}

function getRecordingProgressMessage(
  game: Chess,
  recordedPlyCount: number,
  targetPlyCount: number,
): string {
  const terminalMessage = getTerminalGameMessage(game);
  if (terminalMessage) return terminalMessage;

  if (recordedPlyCount >= targetPlyCount) {
    return `Target reached (${recordedPlyCount}/${targetPlyCount} plies). Stop recording, or continue if this puzzle needs a longer forced line.`;
  }

  return `Recorded ${recordedPlyCount}/${targetPlyCount} plies. Next: ${getSideToMoveLabel(game)} to move.`;
}

function rebuildGameFromSolutionMoves(startFen: string, moves: string[]): Chess {
  const game = new Chess(startFen);
  for (const move of moves) {
    game.move(move, { sloppy: true });
  }
  return game;
}

function getLegalMoveTargets(game: Chess, sourceSquare: Square): Square[] {
  const moves = game.moves({
    square: sourceSquare,
    verbose: true,
  }) as VerboseMove[];

  return Array.from(new Set(moves.map((move) => move.to)));
}

export default function AdminPuzzles() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, checkAuth } = useAdminStore();
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingPuzzle, setEditingPuzzle] = useState<Puzzle | null>(null);
  const [formData, setFormData] = useState<PuzzleFormData>(defaultFormData);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [selectedPiece, setSelectedPiece] = useState<SelectedTool>(null);
  const [isRecordingSolution, setIsRecordingSolution] = useState(false);
  const [solutionMoves, setSolutionMoves] = useState<string[]>([]);
  const [solutionGame, setSolutionGame] = useState<Chess | null>(null);
  const [recordingStartFen, setRecordingStartFen] = useState("");
  const [recordingMessage, setRecordingMessage] = useState("");
  const [selectedMoveSquare, setSelectedMoveSquare] = useState<Square | null>(
    null,
  );
  const adminPuzzleBoardId = useId().replace(/:/g, "");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">(
    "all",
  );
  const [duplicateOnly, setDuplicateOnly] = useState(false);

  useEffect(() => {
    checkAuth();
    fetchPuzzles();
  }, []);

  useEffect(() => {
    if (!isAuthenticated && !loading) {
      navigate("/login");
    }
  }, [isAuthenticated, loading, navigate]);

  const fetchPuzzles = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/puzzles`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setPuzzles(data);
      }
    } catch (error) {
      console.error("Failed to fetch puzzles:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingPuzzle(null);
    setFormData(defaultFormData);
    setSaveError("");
    setSelectedPiece(null);
    setIsRecordingSolution(false);
    setSolutionMoves([]);
    setSolutionGame(null);
    setRecordingStartFen("");
    setRecordingMessage("");
    setSelectedMoveSquare(null);
    setShowModal(true);
  };

  // Convert board position object to FEN
  const positionToFen = (
    position: BoardPosition,
    isWhiteToMove: boolean,
  ): string => {
    const rows: string[] = [];
    for (let rank = 8; rank >= 1; rank--) {
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
          // Convert wK -> K, bK -> k, etc.
          const fenPiece =
            piece[0] === "w" ? piece[1].toUpperCase() : piece[1].toLowerCase();
          row += fenPiece;
        } else {
          emptyCount++;
        }
      }
      if (emptyCount > 0) row += emptyCount;
      rows.push(row);
    }
    return `${rows.join("/")} ${isWhiteToMove ? "w" : "b"} - - 0 1`;
  };

  // Convert FEN to board position object
  const fenToPosition = (fen: string): BoardPosition => {
    const position: BoardPosition = {};
    const parts = fen.split(" ");
    const rows = parts[0].split("/");

    rows.forEach((row, rowIndex) => {
      const rank = 8 - rowIndex;
      let fileIndex = 0;
      for (const char of row) {
        if (/\d/.test(char)) {
          fileIndex += parseInt(char);
        } else {
          const file = "abcdefgh"[fileIndex];
          const color = char === char.toUpperCase() ? "w" : "b";
          const piece = char.toUpperCase();
          position[`${file}${rank}`] = `${color}${piece}`;
          fileIndex++;
        }
      }
    });
    return position;
  };

  // Handle recording solution moves
  const recordSolutionMove = useCallback(
    (sourceSquare: Square, targetSquare: Square) => {
      if (!isRecordingSolution || !solutionGame) return false;

      if (solutionGame.moves().length === 0) {
        setRecordingMessage(getTerminalGameMessage(solutionGame));
        setSelectedMoveSquare(null);
        return false;
      }

      try {
        const nextGame = new Chess(solutionGame.fen());
        const move = nextGame.move({
          from: sourceSquare,
          to: targetSquare,
          promotion: "q",
        });

        if (move) {
          setSolutionGame(nextGame);
          setSelectedMoveSquare(null);
          setSolutionMoves((previousMoves) => {
            const newMoves = [...previousMoves, move.san];
            setFormData((prev) => ({
              ...prev,
              solution: newMoves.join(", "),
            }));
            setRecordingMessage(
              getRecordingProgressMessage(
                nextGame,
                newMoves.length,
                getExpectedSolutionPlyCount(formData.mateIn),
              ),
            );
            return newMoves;
          });
          return true;
        }
        setRecordingMessage(
          `Illegal move for the current position. Next: ${getSideToMoveLabel(
            solutionGame,
          )} to move.`,
        );
      } catch {
        setRecordingMessage(
          `Illegal move for the current position. Next: ${getSideToMoveLabel(
            solutionGame,
          )} to move.`,
        );
        return false;
      }
      return false;
    },
    [formData.mateIn, isRecordingSolution, solutionGame],
  );

  // Handle clicking on board square to place/remove pieces or record moves.
  const handleSquareClick = (square: Square) => {
    if (isRecordingSolution) {
      if (!solutionGame) return;

      if (solutionGame.moves().length === 0) {
        setRecordingMessage(getTerminalGameMessage(solutionGame));
        setSelectedMoveSquare(null);
        return;
      }

      const piece = solutionGame.get(square);
      const isOwnPiece = piece?.color === solutionGame.turn();

      if (!selectedMoveSquare) {
        if (!isOwnPiece) {
          setRecordingMessage(
            `Select a ${getSideToMoveLabel(solutionGame)} piece to see legal moves.`,
          );
          return;
        }

        const legalTargets = getLegalMoveTargets(solutionGame, square);
        if (legalTargets.length === 0) {
          setRecordingMessage(`${square} has no legal moves.`);
          return;
        }

        setSelectedMoveSquare(square);
        setRecordingMessage(
          `Selected ${square}. Legal targets: ${legalTargets.join(", ")}.`,
        );
        return;
      }

      if (selectedMoveSquare === square) {
        setSelectedMoveSquare(null);
        setRecordingMessage(
          `Selection cleared. Select a ${getSideToMoveLabel(
            solutionGame,
          )} piece to see legal moves.`,
        );
        return;
      }

      if (isOwnPiece) {
        const legalTargets = getLegalMoveTargets(solutionGame, square);
        if (legalTargets.length > 0) {
          setSelectedMoveSquare(square);
          setRecordingMessage(
            `Selected ${square}. Legal targets: ${legalTargets.join(", ")}.`,
          );
          return;
        }
      }

      const selectedTargets = getLegalMoveTargets(solutionGame, selectedMoveSquare);
      if (!selectedTargets.includes(square)) {
        setRecordingMessage(
          `${square} is not a legal target for ${selectedMoveSquare}. Click a highlighted square, or select another ${getSideToMoveLabel(
            solutionGame,
          )} piece.`,
        );
        return;
      }

      recordSolutionMove(selectedMoveSquare, square);
      return;
    }

    if (!selectedPiece) return;

    setFormData((prevForm) => {
      const nextPosition = fenToPosition(prevForm.fen);

      if (selectedPiece === "eraser") {
        delete nextPosition[square];
      } else {
        nextPosition[square] = selectedPiece;
      }

      return {
        ...prevForm,
        fen: positionToFen(nextPosition, prevForm.isWhiteToMove),
      };
    });
  };

  const onDrop = useCallback(
    (sourceSquare: Square, targetSquare: Square) => {
      setSelectedMoveSquare(null);
      return recordSolutionMove(sourceSquare, targetSquare);
    },
    [recordSolutionMove],
  );

  const recordingSquareStyles = useMemo<CustomSquareStyles>(() => {
    if (!isRecordingSolution || !solutionGame || !selectedMoveSquare) {
      return {};
    }

    const legalTargets = getLegalMoveTargets(solutionGame, selectedMoveSquare);
    const styles: CustomSquareStyles = {
      [selectedMoveSquare]: {
        background:
          "linear-gradient(135deg, rgba(20,184,166,0.72), rgba(14,165,233,0.58))",
        boxShadow: "inset 0 0 0 4px rgba(255,255,255,0.7)",
      },
    };

    for (const target of legalTargets) {
      styles[target] = {
        background:
          "radial-gradient(circle, rgba(34,197,94,0.95) 18%, rgba(34,197,94,0.25) 20%, transparent 24%)",
      };
    }

    return styles;
  }, [isRecordingSolution, selectedMoveSquare, solutionGame]);

  // Start recording solution
  const startRecordingSolution = () => {
    try {
      const fenWithSide = withFenSideToMove(formData.fen, formData.isWhiteToMove);
      const game = new Chess(fenWithSide);
      setSolutionGame(game);
      setRecordingStartFen(fenWithSide);
      setSolutionMoves([]);
      setRecordingMessage(
        `Recording started. Target ${getExpectedSolutionPlyCount(
          formData.mateIn,
        )} plies for mate in ${formData.mateIn}. First move: ${getSideToMoveLabel(
          game,
        )}.`,
      );
      setIsRecordingSolution(true);
      setSelectedPiece(null);
      setSelectedMoveSquare(null);
    } catch (e) {
      alert(
        t(
          "practice.workspace.notices.positionBuilderInvalidFenString",
          "Invalid FEN string.",
        ),
      );
    }
  };

  // Stop recording solution
  const stopRecordingSolution = () => {
    setIsRecordingSolution(false);
    setSolutionGame(null);
    setRecordingStartFen("");
    setRecordingMessage("");
    setSelectedMoveSquare(null);
  };

  // Undo last solution move
  const undoSolutionMove = () => {
    if (recordingStartFen && solutionMoves.length > 0) {
      const newMoves = solutionMoves.slice(0, -1);
      const rebuiltGame = rebuildGameFromSolutionMoves(recordingStartFen, newMoves);
      setSolutionGame(rebuiltGame);
      setSolutionMoves(newMoves);
      setSelectedMoveSquare(null);
      setFormData((prev) => ({ ...prev, solution: newMoves.join(", ") }));
      setRecordingMessage(
        newMoves.length > 0
          ? getRecordingProgressMessage(
              rebuiltGame,
              newMoves.length,
              getExpectedSolutionPlyCount(formData.mateIn),
            )
          : `Back at the starting position. First move: ${getSideToMoveLabel(
              rebuiltGame,
            )}.`,
      );
    }
  };

  // Clear the board
  const clearBoard = () => {
    setFormData((prev) => ({
      ...prev,
      fen: positionToFen({}, prev.isWhiteToMove),
    }));
  };

  // Set starting position
  const setStartingPosition = () => {
    setFormData((prev) => {
      const startFenBase = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
      const startFen = `${startFenBase} ${prev.isWhiteToMove ? "w" : "b"} KQkq - 0 1`;
      return { ...prev, fen: startFen };
    });
  };

  // Update FEN when isWhiteToMove changes
  const handleWhiteToMoveChange = (isWhite: boolean) => {
    setFormData((prev) => ({
      ...prev,
      isWhiteToMove: isWhite,
      fen: withFenSideToMove(prev.fen, isWhite),
    }));
  };

  const handleEdit = (puzzle: Puzzle) => {
    setEditingPuzzle(puzzle);
    setSaveError("");
    setSelectedPiece(null);
    setIsRecordingSolution(false);
    setSolutionMoves([]);
    setSolutionGame(null);
    setRecordingStartFen("");
    setRecordingMessage("");
    setSelectedMoveSquare(null);
    const isWhiteToMove = getFenSideToMove(puzzle.fen, puzzle.isWhiteToMove);
    const normalizedFen = withFenSideToMove(puzzle.fen, isWhiteToMove);

    setFormData({
      title: puzzle.title,
      difficulty: puzzle.difficulty,
      category: puzzle.category || "tactics",
      description: puzzle.description,
      fen: normalizedFen,
      solution: puzzle.solution.join(", "),
      rating: puzzle.rating,
      isActive: puzzle.isActive !== false,
      isWhiteToMove,
      mateIn: puzzle.mateIn || 2,
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/puzzles/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setPuzzles(puzzles.filter((p) => p._id !== id));
        setDeleteConfirm(null);
      }
    } catch (error) {
      console.error("Failed to delete puzzle:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = getPuzzleDraftError(formData);
    if (validationError) {
      setSaveError(validationError);
      return;
    }

    setSaving(true);
    setSaveError("");

    try {
      const isWhiteToMove = getFenSideToMove(formData.fen, formData.isWhiteToMove);
      const normalizedFen = withFenSideToMove(formData.fen, isWhiteToMove);
      const payload = {
        title: formData.title.trim(),
        difficulty: formData.difficulty,
        category: formData.category.trim() || "tactics",
        description: formData.description.trim(),
        fen: normalizedFen,
        solution: formData.solution
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        rating: formData.rating,
        isActive: formData.isActive,
        isWhiteToMove,
        mateIn: formData.mateIn,
      };

      const url = editingPuzzle
        ? `${API_URL}/api/admin/puzzles/${editingPuzzle._id}`
        : `${API_URL}/api/admin/puzzles`;

      const res = await fetch(url, {
        method: editingPuzzle ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to save puzzle.");
      }

      setShowModal(false);
      fetchPuzzles();
    } catch (error) {
      console.error("Failed to save puzzle:", error);
      setSaveError(
        error instanceof Error ? error.message : "Failed to save puzzle.",
      );
    } finally {
      setSaving(false);
    }
  };

  const [currentPage, setCurrentPage] = useState(1);

  const filteredPuzzles = puzzles.filter((puzzle) => {
    const query = searchQuery.trim().toLowerCase();
    const textBlob = [
      puzzle.title,
      puzzle.description,
      puzzle.fen,
      puzzle.category || "",
    ]
      .join(" ")
      .toLowerCase();

    const matchesQuery = !query || textBlob.includes(query);

    const matchesActive =
      activeFilter === "all" ||
      (activeFilter === "active" && puzzle.isActive !== false) ||
      (activeFilter === "inactive" && puzzle.isActive === false);

    const isDuplicate = Number(puzzle.duplicateCount || 1) > 1;

    return (
      matchesQuery &&
      matchesActive &&
      (!duplicateOnly || isDuplicate)
    );
  });

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeFilter, duplicateOnly]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredPuzzles.length / PUZZLES_PER_PAGE),
  );
  const safePage = Math.min(currentPage, totalPages);

  const paginatedPuzzles = useMemo(() => {
    const start = (safePage - 1) * PUZZLES_PER_PAGE;
    return filteredPuzzles.slice(start, start + PUZZLES_PER_PAGE);
  }, [filteredPuzzles, safePage]);

  const pageNums = getPageNumbers(safePage, totalPages);
  const rangeStart =
    filteredPuzzles.length === 0 ? 0 : (safePage - 1) * PUZZLES_PER_PAGE + 1;
  const rangeEnd = Math.min(
    safePage * PUZZLES_PER_PAGE,
    filteredPuzzles.length,
  );

  const pBtnBase =
    "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus:outline-none disabled:pointer-events-none disabled:opacity-40";
  const pBtnPage = (active: boolean) =>
    active
      ? `${pBtnBase} w-9 h-9 bg-brand-500 text-white shadow-md shadow-brand-500/25`
      : `${pBtnBase} w-9 h-9 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:border-brand-400 dark:hover:border-brand-600 hover:text-brand-600 dark:hover:text-brand-400`;

  const patchPuzzleState = async (
    puzzleId: string,
    updates: { isActive?: boolean },
  ) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/puzzles/${puzzleId}/state`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      if (!res.ok) return;
      const updated = await res.json();
      setPuzzles((previous) =>
        previous.map((entry) =>
          entry._id === puzzleId
            ? {
                ...entry,
                isActive: updated.isActive,
              }
            : entry,
        ),
      );
    } catch (error) {
      console.error("Failed to patch puzzle state:", error);
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "Easy":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "Medium":
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "Hard":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 text-gray-900 dark:text-white">
      <AdminSidebar />

      <main className="ml-72 p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold"><Trans>Puzzles</Trans></h1>
            </div>
            <button
              onClick={handleCreate}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-medium transition-colors"
            >
              <Plus size={20} /> <Trans>Add Puzzle</Trans> </button>
          </div>

          {/* Search */}
          <div className="mb-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder={t("admin.search.puzzles")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                value={activeFilter}
                onChange={(event) =>
                  setActiveFilter(
                    event.target.value as "all" | "active" | "inactive",
                  )
                }
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
              >
                <option value="all"><Trans>All active states</Trans></option>
                <option value="active"><Trans>Active only</Trans></option>
                <option value="inactive"><Trans>Inactive only</Trans></option>
              </select>

              <label className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={duplicateOnly}
                  onChange={(event) => setDuplicateOnly(event.target.checked)}
                /> <Trans>Duplicates</Trans> </label>
            </div>
          </div>

          {/* Puzzles Table */}
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-500 dark:text-gray-400"> <Trans>Puzzle</Trans> </th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-500 dark:text-gray-400"> <Trans>Difficulty</Trans> </th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-500 dark:text-gray-400"> <Trans>Rating</Trans> </th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-500 dark:text-gray-400"> <Trans>Quality</Trans> </th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-500 dark:text-gray-400"> <Trans>State</Trans> </th>
                    <th className="text-right px-6 py-4 text-sm font-medium text-gray-500 dark:text-gray-400"> <Trans>Actions</Trans> </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedPuzzles.map((puzzle) => (
                    <tr
                      key={puzzle._id}
                      className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-medium">{puzzle.title}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {puzzle.category || "tactics"}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${getDifficultyColor(puzzle.difficulty)}`}
                        >
                          {puzzle.difficulty}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium">{puzzle.rating}</td>
                      <td className="px-6 py-4 text-xs text-gray-500 dark:text-gray-300 space-y-0.5">
                        <div> <Trans>Attempts:</Trans>{" "}
                          <span className="font-medium text-gray-700 dark:text-gray-100">
                            {puzzle.quality?.attempts ?? puzzle.timesPlayed}
                          </span>
                        </div>
                        <div> <Trans>Solve / Fail:</Trans>{" "}
                          <span className="font-medium text-emerald-600 dark:text-emerald-300">
                            {puzzle.quality?.solveRate ?? 0}%
                          </span>{" "}
                          /{" "}
                          <span className="font-medium text-rose-600 dark:text-rose-300">
                            {puzzle.quality?.failRate ?? 0}%
                          </span>
                        </div>
                        <div> <Trans>Avg Time:</Trans>{" "}
                          <span className="font-medium text-gray-700 dark:text-gray-100">
                            {Math.round((puzzle.quality?.avgTimeMs ?? 0) / 1000)}<Trans>s</Trans> </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500 dark:text-gray-300">
                        <div className="flex flex-col gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              patchPuzzleState(puzzle._id, {
                                isActive: puzzle.isActive === false,
                              })
                            }
                            className={`rounded-md px-2 py-1 text-left ${
                              puzzle.isActive !== false
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                                : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                            }`}
                          >
                            {puzzle.isActive !== false ? "Active" : "Inactive"}
                          </button>
                          {Number(puzzle.duplicateCount || 1) > 1 && (
                            <span className="text-amber-500 dark:text-amber-300"> <Trans>Duplicate ×</Trans>{puzzle.duplicateCount}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEdit(puzzle)}
                            className="p-2 text-gray-500 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-colors"
                          >
                            <Pencil size={18} />
                          </button>
                          {deleteConfirm === puzzle._id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDelete(puzzle._id)}
                                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                              >
                                <Check size={18} />
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(null)}
                                className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                              >
                                <X size={18} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirm(puzzle._id)}
                              className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredPuzzles.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <p><Trans>No puzzles found</Trans></p>
                </div>
              )}

              {/* Pagination */}
              {filteredPuzzles.length > 0 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-800">
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {rangeStart}-{rangeEnd} <Trans>of</Trans> {filteredPuzzles.length}{" "}
                    {t("admin.puzzles.pagination.items", "puzzles")}
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-1.5">
                      <button
                        disabled={safePage <= 1}
                        onClick={() =>
                          setCurrentPage((p) => Math.max(1, p - 1))
                        }
                        className={`${pBtnBase} w-9 h-9 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:border-brand-400 dark:hover:border-brand-600 hover:text-brand-600 dark:hover:text-brand-400`}
                      >
                        <ChevronLeft size={16} />
                      </button>
                      {pageNums.map((p, i) =>
                        p === "..." ? (
                          <span
                            key={`dots-${i}`}
                            className="w-9 h-9 flex items-center justify-center text-gray-400 dark:text-gray-600 text-sm select-none"
                          >
                                ...
                          </span>
                        ) : (
                          <button
                            key={p}
                            onClick={() => setCurrentPage(p)}
                            className={pBtnPage(p === safePage)}
                          >
                            {p}
                          </button>
                        ),
                      )}
                      <button
                        disabled={safePage >= totalPages}
                        onClick={() =>
                          setCurrentPage((p) => Math.min(totalPages, p + 1))
                        }
                        className={`${pBtnBase} w-9 h-9 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:border-brand-400 dark:hover:border-brand-600 hover:text-brand-600 dark:hover:text-brand-400`}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-5xl my-4">
            <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h2 className="text-xl font-bold">
                {editingPuzzle
                  ? t("admin.modal.editPuzzle")
                  : t("admin.modal.createPuzzle")}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              {saveError && (
                <div className="mb-4 rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">
                  {saveError}
                </div>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column - Board Editor */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">
                      {isRecordingSolution
                        ? "Record Solution"
                        : "Setup Position"}
                    </h3>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={clearBoard}
                        disabled={isRecordingSolution}
                        className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-50"
                      > <Trans>Clear</Trans> </button>
                      <button
                        type="button"
                        onClick={setStartingPosition}
                        disabled={isRecordingSolution}
                        className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-50"
                      > <Trans>Starting</Trans> </button>
                    </div>
                  </div>

                  {/* Piece Palette */}
                  {!isRecordingSolution && (
                    <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg space-y-2">
                      {/* White Pieces Row */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-300 w-12"> <Trans>White</Trans> </span>
                        <div className="flex gap-1">
                          {WHITE_PIECES.map((piece) => (
                            <button
                              key={piece}
                              type="button"
                              onClick={() =>
                                setSelectedPiece(
                                  selectedPiece === piece ? null : piece,
                                )
                              }
                              aria-label={PIECE_LABELS[piece]}
                              title={PIECE_LABELS[piece]}
                              className={`w-9 h-9 flex items-center justify-center rounded transition-colors ${
                                selectedPiece === piece
                                  ? "bg-brand-500 ring-2 ring-brand-400"
                                  : "bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
                              }`}
                            >
                              <PiecePaletteIcon piece={piece} />
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Black Pieces Row */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-300 w-12"> <Trans>Black</Trans> </span>
                        <div className="flex gap-1">
                          {BLACK_PIECES.map((piece) => (
                            <button
                              key={piece}
                              type="button"
                              onClick={() =>
                                setSelectedPiece(
                                  selectedPiece === piece ? null : piece,
                                )
                              }
                              aria-label={PIECE_LABELS[piece]}
                              title={PIECE_LABELS[piece]}
                              className={`w-9 h-9 flex items-center justify-center rounded transition-colors ${
                                selectedPiece === piece
                                  ? "bg-brand-500 ring-2 ring-brand-400"
                                  : "bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
                              }`}
                            >
                              <PiecePaletteIcon piece={piece} />
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Eraser */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-300 w-12"> <Trans>Tool</Trans> </span>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedPiece(
                              selectedPiece === "eraser" ? null : "eraser",
                            )
                          }
                          className={`w-9 h-9 flex items-center justify-center rounded transition-colors ${
                            selectedPiece === "eraser"
                              ? "bg-red-500 text-white"
                              : "bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
                          }`}
                        >
                          <Eraser size={18} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Chessboard */}
                  <div className="aspect-square max-w-[360px] mx-auto">
                    <Chessboard
                      id={`admin-puzzle-board-${adminPuzzleBoardId}`}
                      allowDragOutsideBoard={false}
                      position={
                        isRecordingSolution && solutionGame
                          ? solutionGame.fen()
                          : formData.fen
                      }
                      onSquareClick={handleSquareClick}
                      onPieceDrop={onDrop}
                      boardOrientation={
                        formData.isWhiteToMove ? "white" : "black"
                      }
                      arePiecesDraggable={isRecordingSolution}
                      customSquareStyles={recordingSquareStyles}
                      dropOffBoardAction="snapback"
                    />
                  </div>

                  {/* Solution Recording Controls */}
                  <div className="flex items-center gap-2">
                    {!isRecordingSolution ? (
                      <button
                        type="button"
                        onClick={startRecordingSolution}
                        className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium"
                      >
                        <Play size={16} /> <Trans>Record Solution</Trans> </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={stopRecordingSolution}
                          className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium"
                        >
                          <SquareIcon size={16} /> <Trans>Stop Recording</Trans> </button>
                        <button
                          type="button"
                          onClick={undoSolutionMove}
                          disabled={solutionMoves.length === 0}
                          className="flex items-center gap-2 px-3 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                        >
                          <RotateCcw size={16} /> <Trans>Undo</Trans> </button>
                      </>
                    )}
                  </div>
                  {isRecordingSolution && (
                    <p className="text-xs text-gray-500 dark:text-gray-400"> <Trans>Click a piece to highlight its legal moves, then click a highlighted square to record. Dragging still works.</Trans> </p>
                  )}

                  {recordingMessage && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg text-sm text-blue-800 dark:text-blue-200">
                      {recordingMessage}
                    </div>
                  )}

                  {/* Recorded Moves Display */}
                  {solutionMoves.length > 0 && (
                    <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                      <div className="text-sm font-medium mb-1"> <Trans>Recorded Moves:</Trans> </div>
                      <div className="font-mono text-sm">
                        {solutionMoves.join(", ")}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column - Form Fields */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1"> <Trans>Move Number</Trans> </label>
                    <input
                      type="number"
                      step={1}
                      min={1}
                      value={formData.mateIn}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          mateIn: Math.max(1, parseInt(e.target.value, 10) || 1),
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>

                  {/* Who to Move */}
                  <div>
                    <label className="block text-sm font-medium mb-1"> <Trans>Who to Move</Trans> </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleWhiteToMoveChange(true)}
                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          formData.isWhiteToMove
                            ? "bg-gray-200 dark:bg-gray-600 border-2 border-brand-500"
                            : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                        }`}
                      > <Trans>White to Move</Trans> </button>
                      <button
                        type="button"
                        onClick={() => handleWhiteToMoveChange(false)}
                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          !formData.isWhiteToMove
                            ? "bg-gray-700 dark:bg-gray-300 text-white dark:text-gray-900 border-2 border-brand-500"
                            : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                        }`}
                      > <Trans>Black to Move</Trans> </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1"> <Trans>Title</Trans> </label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) =>
                        setFormData({ ...formData, title: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1"> <Trans>Category</Trans> </label>
                    <input
                      type="text"
                      value={formData.category}
                      onChange={(e) =>
                        setFormData({ ...formData, category: e.target.value })
                      }
                      placeholder="tactics / endgame / opening / mate"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1"> <Trans>Difficulty</Trans> </label>
                      <select
                        value={formData.difficulty}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            difficulty: e.target.value as
                              | "Easy"
                              | "Medium"
                              | "Hard",
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        <option value="Easy"><Trans>Easy</Trans></option>
                        <option value="Medium"><Trans>Medium</Trans></option>
                        <option value="Hard"><Trans>Hard</Trans></option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1"> <Trans>Rating</Trans> </label>
                      <input
                        type="number"
                        value={formData.rating}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            rating: parseInt(e.target.value) || 1200,
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={formData.isActive}
                        onChange={(e) =>
                          setFormData({ ...formData, isActive: e.target.checked })
                        }
                      /> <Trans>Active</Trans> </label>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1"> <Trans>Description</Trans> </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          description: e.target.value,
                        })
                      }
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1"> <Trans>FEN Position</Trans> </label>
                    <input
                      type="text"
                      value={formData.fen}
                      onChange={(e) => {
                        const nextFen = e.target.value;
                        setFormData((prev) => ({
                          ...prev,
                          fen: nextFen,
                          isWhiteToMove: getFenSideToMove(
                            nextFen,
                            prev.isWhiteToMove,
                          ),
                        }));
                      }}
                      placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono text-xs"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1"> <Trans>Solution (comma-separated moves)</Trans> </label>
                    <input
                      type="text"
                      value={formData.solution}
                      readOnly
                      placeholder="Qh7+, Kf8, Qh8#"
                      title={t("admin.actions.useRecordedSolution")}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/70 focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono text-sm cursor-not-allowed"
                      required
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                    > <Trans>Cancel</Trans> </button>
                    <button
                      type="submit"
                      disabled={saving || isRecordingSolution}
                      className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                      {editingPuzzle
                        ? t("admin.modal.saveChanges")
                        : t("admin.modal.createPuzzle")}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}



