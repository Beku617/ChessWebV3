import { AnimatePresence, motion } from "framer-motion";
import { Chess, Square } from "chess.js";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { Chessboard } from "react-chessboard";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChessMoveList, buildChessMoveRows } from "../../components/game";
import { PromotionModal } from "../../components/game/PromotionModal";
import type { PromotionPiece, PromotionState } from "../../components/game";
import { usePreMove } from "../../chess/usePreMove";
import { useBoardTheme } from "../../hooks/useBoardTheme";
import { useGameplayPreferences } from "../../hooks/useGameplayPreferences";
import { useOpeningExplorer } from "../../hooks/useOpeningExplorer";
import { usePositionTopMoves } from "../../hooks/usePositionTopMoves";
import {
  playChessMoveSound,
  playGameplaySound,
} from "../../utils/moveSounds";
import { BOARD_FRAME } from "../quickMatch/types";
import { PracticePgnImport } from "./PracticePgnImport";

type PracticeModeId =
  | "free-move"
  | "position-builder";

interface PracticeMode {
  id: PracticeModeId;
  icon: (color: string) => ReactElement;
}

type PracticeModeCopy = {
  title: string;
  desc: string;
  openLabel: string;
};

type BuilderPieceId =
  | "wK"
  | "wQ"
  | "wR"
  | "wB"
  | "wN"
  | "wP"
  | "bK"
  | "bQ"
  | "bR"
  | "bB"
  | "bN"
  | "bP"
  | "eraser";

type BoardPieceConfig = {
  color: "w" | "b";
  type: "k" | "q" | "r" | "b" | "n" | "p";
  label: string;
};

type FreeMoveHistoryEntry = {
  color: "w" | "b";
  fenAfter: string;
  fenBefore: string;
  from: Square;
  promotion?: "q" | "r" | "b" | "n";
  san: string;
  to: Square;
};

type PracticePromotionMove = {
  from: Square;
  to: Square;
  color: "w" | "b";
};

type PracticeLegalMove = {
  to: Square;
  promotion?: PromotionPiece;
};

const CLOSED_PROMOTION_STATE: PromotionState = {
  isOpen: false,
  from: null,
  to: null,
  color: null,
};

const POSITION_BUILDER_BOARD_PIECES: Record<
  Exclude<BuilderPieceId, "eraser">,
  BoardPieceConfig
> = {
  wK: { color: "w", type: "k", label: "K" },
  wQ: { color: "w", type: "q", label: "Q" },
  wR: { color: "w", type: "r", label: "R" },
  wB: { color: "w", type: "b", label: "B" },
  wN: { color: "w", type: "n", label: "N" },
  wP: { color: "w", type: "p", label: "P" },
  bK: { color: "b", type: "k", label: "K" },
  bQ: { color: "b", type: "q", label: "Q" },
  bR: { color: "b", type: "r", label: "R" },
  bB: { color: "b", type: "b", label: "B" },
  bN: { color: "b", type: "n", label: "N" },
  bP: { color: "b", type: "p", label: "P" },
};

const POSITION_BUILDER_WHITE_PIECES: Array<Exclude<BuilderPieceId, "eraser">> =
  ["wK", "wQ", "wR", "wB", "wN", "wP"];
const POSITION_BUILDER_BLACK_PIECES: Array<Exclude<BuilderPieceId, "eraser">> =
  ["bK", "bQ", "bR", "bB", "bN", "bP"];
const POSITION_BUILDER_PIECE_SYMBOLS: Record<
  Exclude<BuilderPieceId, "eraser">,
  string
> = {
  wK: "\u2654",
  wQ: "\u2655",
  wR: "\u2656",
  wB: "\u2657",
  wN: "\u2658",
  wP: "\u2659",
  bK: "\u265A",
  bQ: "\u265B",
  bR: "\u265C",
  bB: "\u265D",
  bN: "\u265E",
  bP: "\u265F",
};

const PRACTICE_MODE_ROUTES: Partial<Record<PracticeModeId, string>> = {
  "free-move": "/play/practice/freeMove",
  "position-builder": "/play/practice/positionBuilder",
};

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

const PREMOVE_SOURCE_STYLE: CSSProperties = {
  backgroundColor: "rgba(245, 158, 11, 0.35)",
  boxShadow: "inset 0 0 0 3px rgba(245, 158, 11, 0.8)",
  borderRadius: "0",
};

const FREE_MOVE_ARROW_BUTTON_STYLE: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 9,
  background: "rgba(var(--bg-panel-rgb), 0.88)",
  border: "1px solid rgba(var(--color-brand-500-rgb), 0.62)",
  color: "var(--text-primary)",
  cursor: "pointer",
  fontSize: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "inset 0 1px 0 rgba(var(--text-primary-rgb), 0.06)",
};

const FREE_MOVE_BASE_BUTTON_STYLE: CSSProperties = {
  padding: 10,
  borderRadius: 9,
  border: "1px solid rgba(var(--color-brand-500-rgb), 0.62)",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};

const PRACTICE_CARD_STYLE: CSSProperties = {
  background: "rgba(var(--bg-panel-rgb), 0.66)",
  border: "1px solid rgba(var(--text-primary-rgb), 0.1)",
  borderRadius: 16,
  overflow: "hidden",
};

const PRACTICE_CARD_BODY_STYLE: CSSProperties = {
  padding: "14px 16px",
};

const PRACTICE_RIGHT_PANEL_STYLE: CSSProperties = {
  background: "rgba(var(--bg-panel-rgb), 0.62)",
  border: "1px solid rgba(var(--text-primary-rgb), 0.1)",
  borderRadius: 12,
  padding: 16,
  backdropFilter: "blur(4px)",
  WebkitBackdropFilter: "blur(4px)",
};

const FREE_MOVE_HISTORY_LIST_HEIGHT = 252;

const PRACTICE_MODES: PracticeMode[] = [
  {
    id: "free-move",
    icon: (color) => (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        width={18}
        height={18}
      >
        <path d="M5 9l7-7 7 7M5 15l7 7 7-7" />
      </svg>
    ),
  },
  {
    id: "position-builder",
    icon: (color) => (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        width={18}
        height={18}
      >
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
];

const DEFAULT_PRACTICE_MODE_COPY: Record<PracticeModeId, PracticeModeCopy> = {
  "free-move": {
    title: "Free Move",
    desc: "Move pieces freely, alternating turns",
    openLabel: "Open Free Move",
  },
  "position-builder": {
    title: "Position Builder",
    desc: "Set up any custom position",
    openLabel: "Open Position Builder",
  },
};

function hasCheckMethod(game: Chess) {
  const candidate = game as unknown as {
    isCheck?: () => boolean;
    in_check?: () => boolean;
  };
  if (typeof candidate.isCheck === "function") return candidate.isCheck();
  if (typeof candidate.in_check === "function") return candidate.in_check();
  return false;
}

function hasCheckmateMethod(game: Chess) {
  const candidate = game as unknown as {
    isCheckmate?: () => boolean;
    in_checkmate?: () => boolean;
  };
  if (typeof candidate.isCheckmate === "function") return candidate.isCheckmate();
  if (typeof candidate.in_checkmate === "function") return candidate.in_checkmate();
  return false;
}

function hasGameOverMethod(game: Chess) {
  const candidate = game as unknown as {
    game_over?: () => boolean;
    isGameOver?: () => boolean;
  };
  if (typeof candidate.isGameOver === "function") return candidate.isGameOver();
  if (typeof candidate.game_over === "function") return candidate.game_over();
  return false;
}

function hasStalemateMethod(game: Chess) {
  const candidate = game as unknown as {
    isStalemate?: () => boolean;
    in_stalemate?: () => boolean;
  };
  if (typeof candidate.isStalemate === "function") return candidate.isStalemate();
  if (typeof candidate.in_stalemate === "function") return candidate.in_stalemate();
  return false;
}

function isSideInCheck(game: Chess, side: "w" | "b") {
  const fenParts = game.fen().split(" ");
  if (fenParts.length < 6) return false;
  fenParts[1] = side;
  const checkGame = new Chess();
  const loaded = checkGame.load(fenParts.join(" "));
  if (!loaded) return false;
  return hasCheckMethod(checkGame);
}

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

function createGameFromFen(fen: string) {
  const game = new Chess();
  if (fen !== "start") {
    const loaded = game.load(fen);
    if (!loaded) {
      return new Chess();
    }
  }
  return game;
}

function buildGameFromHistory(initialFen: string, moves: FreeMoveHistoryEntry[]) {
  const game = createGameFromFen(initialFen);
  for (const move of moves) {
    game.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion,
    });
  }
  return game;
}

function sanitizeFenForPractice(rawFen: string, preferredTurn?: "w" | "b") {
  const parts = rawFen.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const board = parts[0];
  const turn = preferredTurn ?? (parts[1] === "b" ? "b" : "w");
  return [board, turn, "-", "-", "0", "1"].join(" ");
}

function withTurnFromFen(rawFen: string, sideToMove: "w" | "b") {
  const parts = rawFen.trim().split(/\s+/);
  if (parts.length < 6) return null;
  parts[1] = sideToMove;
  return parts.slice(0, 6).join(" ");
}

function formatTopMoveScore(scoreCp?: number, scoreMate?: number) {
  if (typeof scoreMate === "number") {
    const sign = scoreMate > 0 ? "+" : "";
    return `${sign}M${scoreMate}`;
  }
  if (typeof scoreCp === "number") {
    const pawns = scoreCp / 100;
    const sign = pawns > 0 ? "+" : "";
    return `${sign}${pawns.toFixed(2)}`;
  }
  return "--";
}

export default function PlayPractice() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { colors } = useBoardTheme();
  const { autoQueen, allowClickInput, allowDragInput, showLegalMoves, premoves } =
    useGameplayPreferences();

  const normalizedPath = location.pathname.replace(/\/+$/, "").toLowerCase();
  const freeMoveRouteSignature = `${normalizedPath}:${location.key}`;
  const isPracticeFreeMoveActive = normalizedPath === "/play/practice/freemove";
  const isPositionBuilderFreeMoveActive =
    normalizedPath === "/play/practice/positionbuilder/freemove";
  const isFreeMoveActive =
    isPracticeFreeMoveActive || isPositionBuilderFreeMoveActive;
  const isPositionBuilderActive =
    normalizedPath === "/play/practice/positionbuilder";
  const isPracticePgnActive = normalizedPath === "/play/practice/pgn";
  const isSessionModeActive = isFreeMoveActive || isPositionBuilderActive;
  const builderLocationState = isPositionBuilderFreeMoveActive
    ? (location.state as
        | {
            initialFen?: string;
            fen?: string;
            turn?: "w" | "b";
          }
        | null)
    : null;
  const rawPassedFen = typeof builderLocationState?.fen === "string"
    ? builderLocationState.fen.trim()
    : typeof builderLocationState?.initialFen === "string"
      ? builderLocationState.initialFen.trim()
      : "";
  const passedTurn =
    builderLocationState?.turn === "b" || builderLocationState?.turn === "w"
      ? builderLocationState.turn
      : rawPassedFen.split(/\s+/)[1] === "b"
        ? "b"
        : "w";
  const passedFen = rawPassedFen
    ? sanitizeFenForPractice(rawPassedFen, passedTurn)
    : null;
  const standardFreeMoveStartFen = "start";

  const [selectedModeId, setSelectedModeId] =
    useState<PracticeModeId>("free-move");
  const [fen, setFen] = useState<string>(standardFreeMoveStartFen);
  const [positionBuilderGame, setPositionBuilderGame] = useState(() => new Chess());
  const [freeMoveInitialFen, setFreeMoveInitialFen] = useState<string>(
    standardFreeMoveStartFen,
  );
  const [freeMoveHistory, setFreeMoveHistory] = useState<FreeMoveHistoryEntry[]>(
    [],
  );
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
  const [positionBuilderFenInput, setPositionBuilderFenInput] = useState("");
  const [positionBuilderFenFallback, setPositionBuilderFenFallback] =
    useState("");
  const [isPositionBuilderFenFocused, setIsPositionBuilderFenFocused] =
    useState(false);
  const [positionBuilderValidationModal, setPositionBuilderValidationModal] =
    useState<{ title: string; message: string } | null>(null);
  const [positionBuilderSideToMove, setPositionBuilderSideToMove] = useState<
    "w" | "b"
  >("w");
  const [positionBuilderSelectedPiece, setPositionBuilderSelectedPiece] =
    useState<BuilderPieceId>("wK");
  const [redoStack, setRedoStack] = useState<FreeMoveHistoryEntry[]>([]);
  const [pendingPromotionMove, setPendingPromotionMove] =
    useState<PracticePromotionMove | null>(null);
  const [boardWidth, setBoardWidth] = useState(620);
  const [isPgnImportModalOpen, setIsPgnImportModalOpen] = useState(
    isPracticePgnActive,
  );
  const practiceBoardId = useId().replace(/:/g, "");
  const {
    preMove,
    preMoveSquares,
    setPreMove,
    clearPreMove,
    getPreMove,
  } = usePreMove();

  const leftRef = useRef<HTMLDivElement>(null);
  const movesEndRef = useRef<HTMLDivElement>(null);
  const wasFreeMoveRef = useRef(false);
  const freeMovePathRef = useRef<string | null>(null);
  const wasPositionBuilderRef = useRef(false);
  const suppressNextSquareClickRef = useRef(false);

  const evalState = useMemo(() => evaluateGame(createGameFromFen(fen)), [fen]);
  const practicePlayerColor: "w" | "b" =
    boardOrientation === "white" ? "w" : "b";
  const sanMoves = useMemo(
    () => freeMoveHistory.map((move) => move.san),
    [freeMoveHistory],
  );
  const { opening, isLoading: openingLoading } = useOpeningExplorer(sanMoves, {
    enableRemote: true,
  });
  const {
    topMoves,
    isAnalyzing: topMovesLoading,
    error: topMovesError,
  } = usePositionTopMoves(fen, {
    enabled: isFreeMoveActive,
    multiPv: 3,
    depth: 14,
  });
  const moveRows = useMemo(() => buildChessMoveRows(sanMoves), [sanMoves]);
  const practiceModeCopy = useMemo<Record<PracticeModeId, PracticeModeCopy>>(
    () => ({
      "free-move": {
        title: t(
          "practice.workspace.modes.freeMove.title",
          DEFAULT_PRACTICE_MODE_COPY["free-move"].title,
        ),
        desc: t(
          "practice.workspace.modes.freeMove.desc",
          DEFAULT_PRACTICE_MODE_COPY["free-move"].desc,
        ),
        openLabel: t(
          "practice.workspace.modes.freeMove.open",
          DEFAULT_PRACTICE_MODE_COPY["free-move"].openLabel,
        ),
      },
      "position-builder": {
        title: t(
          "practice.workspace.modes.positionBuilder.title",
          DEFAULT_PRACTICE_MODE_COPY["position-builder"].title,
        ),
        desc: t(
          "practice.workspace.modes.positionBuilder.desc",
          DEFAULT_PRACTICE_MODE_COPY["position-builder"].desc,
        ),
        openLabel: t(
          "practice.workspace.modes.positionBuilder.open",
          DEFAULT_PRACTICE_MODE_COPY["position-builder"].openLabel,
        ),
      },
    }),
    [t],
  );
  const activeMode = useMemo(
    () => PRACTICE_MODES.find((mode) => mode.id === selectedModeId) ?? PRACTICE_MODES[0],
    [selectedModeId],
  );
  const activeModeCopy = practiceModeCopy[activeMode.id];
  const positionBuilderModeIcon = useMemo(
    () => PRACTICE_MODES.find((mode) => mode.id === "position-builder")?.icon,
    [],
  );
  const activeModeRoute = PRACTICE_MODE_ROUTES[activeMode.id];
  const activeModeIsLive = Boolean(activeModeRoute);
  const lastMoveSquares = useMemo<Record<string, CSSProperties>>(() => {
    if (!lastMove) return {};
    return {
      [lastMove.from]: {
        boxShadow: "inset 0 0 0 3px rgba(250, 204, 21, 0.95)",
        borderRadius: "0",
      },
      [lastMove.to]: {
        boxShadow: "inset 0 0 0 3px rgba(250, 204, 21, 0.95)",
        borderRadius: "0",
      },
    };
  }, [lastMove]);
  const boardSquareStyles = useMemo(
    () => ({ ...lastMoveSquares, ...preMoveSquares, ...optionSquares }),
    [lastMoveSquares, preMoveSquares, optionSquares],
  );
  const boardKey = isFreeMoveActive
    ? (isPositionBuilderFreeMoveActive ? "pb-free-move" : "free-move")
    : "position-builder-board";
  const boardPosition = isFreeMoveActive ? fen : positionBuilderGame.fen();
  const freeMovePanelHeight = boardWidth + 24;
  const promotionState = useMemo<PromotionState>(
    () =>
      pendingPromotionMove
        ? {
            isOpen: true,
            from: pendingPromotionMove.from,
            to: pendingPromotionMove.to,
            color: pendingPromotionMove.color,
          }
        : CLOSED_PROMOTION_STATE,
    [pendingPromotionMove],
  );

  const initializeFreeMoveSession = (nextFen: string, notice: string | null) => {
    clearPreMove();
    setFen(nextFen);
    setFreeMoveInitialFen(nextFen);
    setFreeMoveHistory([]);
    setPendingPromotionMove(null);
    setMoveFrom(null);
    setOptionSquares({});
    setLastMove(null);
    suppressNextSquareClickRef.current = false;
    setBoardOrientation("white");
    setExportFallback("");
    setRedoStack([]);
    setPanelNotice(notice);
    playGameplaySound("gameStart");
    wasFreeMoveRef.current = true;
    freeMovePathRef.current = freeMoveRouteSignature;
  };

  const closePgnImportModal = () => {
    setIsPgnImportModalOpen(false);
    if (isPracticePgnActive) {
      navigate("/play/practice", { replace: true });
    }
  };

  useEffect(() => {
    setIsPgnImportModalOpen(isPracticePgnActive);
  }, [isPracticePgnActive]);

  useEffect(() => {
    if (!isPgnImportModalOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      closePgnImportModal();
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isPgnImportModalOpen, isPracticePgnActive, navigate]);

  useEffect(() => {
    if (isFreeMoveActive) {
      setSelectedModeId("free-move");
    } else if (isPositionBuilderActive) {
      setSelectedModeId("position-builder");
    }
  }, [isFreeMoveActive, isPositionBuilderActive]);

  useEffect(() => {
    if (!isFreeMoveActive) {
      wasFreeMoveRef.current = false;
      freeMovePathRef.current = null;
      setPendingPromotionMove(null);
      clearPreMove();
    }
  }, [clearPreMove, isFreeMoveActive]);

  useEffect(() => {
    if (!isPracticeFreeMoveActive) return;
    const hasFreeMovePathChanged = freeMovePathRef.current !== freeMoveRouteSignature;
    if (!wasFreeMoveRef.current || hasFreeMovePathChanged) {
      initializeFreeMoveSession(standardFreeMoveStartFen, null);
    }
  }, [freeMoveRouteSignature, isPracticeFreeMoveActive]);

  useEffect(() => {
    if (!isPositionBuilderFreeMoveActive) return;
    const hasFreeMovePathChanged = freeMovePathRef.current !== freeMoveRouteSignature;
    if (!wasFreeMoveRef.current || hasFreeMovePathChanged) {
      let nextFen = standardFreeMoveStartFen;
      let nextNotice = t(
        "practice.workspace.notices.invalidFenStart",
        "Invalid FEN received. Loaded start position.",
      );

      if (rawPassedFen && passedFen) {
        const importedGame = new Chess();
        const isValidFen = importedGame.load(passedFen);
        if (isValidFen) {
          nextFen = passedFen;
          const sideToMove = importedGame.turn() === "w"
            ? t("practice.workspace.turn.white", "White")
            : t("practice.workspace.turn.black", "Black");
          nextNotice = t("practice.workspace.notices.loadedFromBuilder", {
            side: sideToMove,
            defaultValue: `Loaded position from Position Builder (${sideToMove} to move).`,
          });
        }
      }

      initializeFreeMoveSession(nextFen, nextNotice);
    }
  }, [
    freeMoveRouteSignature,
    isPositionBuilderFreeMoveActive,
    passedFen,
    rawPassedFen,
    standardFreeMoveStartFen,
    t,
  ]);

  useEffect(() => {
    if (isPositionBuilderActive && !wasPositionBuilderRef.current) {
      const freshGame = new Chess();
      setPositionBuilderGame(freshGame);
      setMoveFrom(null);
      setOptionSquares({});
      setLastMove(null);
      setBoardOrientation("white");
      setPanelNotice(null);
      setExportFallback("");
      setPositionBuilderFenFallback("");
      setPositionBuilderValidationModal(null);
      setRedoStack([]);
      setPositionBuilderSelectedPiece("wK");
      setPositionBuilderSideToMove("w");
      setPositionBuilderFenInput(freshGame.fen());
      clearPreMove();
    }
    wasPositionBuilderRef.current = isPositionBuilderActive;
  }, [clearPreMove, isPositionBuilderActive]);

  useEffect(() => {
    if (!isPositionBuilderActive) return;
    setPositionBuilderFenInput(positionBuilderGame.fen());
    setPositionBuilderSideToMove(positionBuilderGame.turn());
  }, [positionBuilderGame, isPositionBuilderActive]);

  useEffect(() => {
    const container = leftRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const styles = window.getComputedStyle(container);
      const paddingLeft = parseFloat(styles.paddingLeft || "0") || 0;
      const paddingRight = parseFloat(styles.paddingRight || "0") || 0;
      const paddingTop = parseFloat(styles.paddingTop || "0") || 0;
      const paddingBottom = parseFloat(styles.paddingBottom || "0") || 0;
      const verticalBreathingRoom = 10;
      const horizontalBreathingRoom = 6;
      const availableWidth =
        rect.width -
        (paddingLeft + paddingRight) -
        BOARD_FRAME -
        horizontalBreathingRoom;
      const availableHeight =
        Math.min(rect.height, window.innerHeight) -
        (paddingTop + paddingBottom) -
        verticalBreathingRoom;
      const size = Math.floor(Math.min(availableWidth, availableHeight));
      setBoardWidth(Math.max(280, Math.min(size, 700)));
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
    setSelectedModeId(mode.id);
  };

  const clearSelection = () => {
    setMoveFrom(null);
    setOptionSquares({});
  };

  const getLegalMovesFromSquare = (game: Chess, square: Square) =>
    game.moves({ square, verbose: true }) as PracticeLegalMove[];

  const queuePromotionMove = (from: Square, to: Square, color: "w" | "b") => {
    setPendingPromotionMove({ from, to, color });
    clearSelection();
  };

  const getMoveOptionsForSquare = (square: Square) => {
    const currentGame = createGameFromFen(fen);
    const legalMoves = getLegalMovesFromSquare(currentGame, square);
    if (!legalMoves.length) {
      setOptionSquares({});
      return false;
    }

    const squares: Record<string, CSSProperties> = {
      [square]: SELECTED_SQUARE_STYLE,
    };
    if (showLegalMoves) {
      legalMoves.forEach((move) => {
        const isCapture = Boolean(currentGame.get(move.to as Square));
        squares[move.to] = isCapture
          ? LEGAL_CAPTURE_STYLE
          : LEGAL_TARGET_STYLE;
      });
    }

    setOptionSquares(squares);
    return true;
  };

  const getPreMoveTargetMoves = (
    currentGame: Chess,
    sourceSquare: Square,
    targetSquare: Square,
  ) => {
    const adjustedFen = withTurnFromFen(currentGame.fen(), practicePlayerColor);
    if (!adjustedFen) return [];
    const preMoveValidationGame = createGameFromFen(adjustedFen);
    const legalMovesFromSource = getLegalMovesFromSquare(
      preMoveValidationGame,
      sourceSquare,
    );
    return legalMovesFromSource.filter((move) => move.to === targetSquare);
  };

  const showPreMoveSourceOptions = (square: Square) => {
    const currentGame = createGameFromFen(fen);
    const adjustedFen = withTurnFromFen(currentGame.fen(), practicePlayerColor);
    if (!adjustedFen) {
      setOptionSquares({});
      return false;
    }

    const preMoveValidationGame = createGameFromFen(adjustedFen);
    const legalMoves = getLegalMovesFromSquare(preMoveValidationGame, square);
    if (!legalMoves.length) {
      setOptionSquares({});
      return false;
    }

    const squares: Record<string, CSSProperties> = {
      [square]: PREMOVE_SOURCE_STYLE,
    };
    if (showLegalMoves) {
      legalMoves.forEach((move) => {
        const isCapture = Boolean(currentGame.get(move.to as Square));
        squares[move.to] = isCapture
          ? LEGAL_CAPTURE_STYLE
          : LEGAL_TARGET_STYLE;
      });
    }

    setOptionSquares(squares);
    return true;
  };

  const applyQueuedPreMoveFromFen = (baseFen: string) => {
    const queuedPreMove = getPreMove();
    if (!queuedPreMove) return false;

    const preMoveGame = createGameFromFen(baseFen);
    if (preMoveGame.turn() !== practicePlayerColor) {
      return false;
    }

    try {
      const move = preMoveGame.move({
        from: queuedPreMove.from as Square,
        to: queuedPreMove.to as Square,
        promotion: queuedPreMove.promotion ?? "q",
      });

      clearPreMove();
      if (!move) {
        setPanelNotice(
          t(
            "practice.workspace.notices.queuedPreMoveNoLongerLegal",
            "Queued pre-move is no longer legal.",
          ),
        );
        return false;
      }

      const preMoveFen = preMoveGame.fen();
      setFen(preMoveFen);
      setFreeMoveHistory((current) => [
        ...current,
        {
          color: move.color,
          fenAfter: preMoveFen,
          fenBefore: baseFen,
          from: queuedPreMove.from as Square,
          promotion: move.promotion ?? undefined,
          san: move.san,
          to: queuedPreMove.to as Square,
        },
      ]);
      setLastMove({
        from: queuedPreMove.from as Square,
        to: queuedPreMove.to as Square,
      });
      clearSelection();
      setPanelNotice(t("practice.workspace.notices.preMovePlayed", "Pre-move played."));
      setExportFallback("");
      setRedoStack([]);
      playChessMoveSound(move, { isOpponentMove: move.color !== practicePlayerColor });
      if (hasGameOverMethod(preMoveGame) && !hasCheckmateMethod(preMoveGame)) {
        playGameplaySound("gameEnd");
      }
      return true;
    } catch {
      clearPreMove();
      setPanelNotice(
        t("practice.workspace.notices.queuedPreMoveInvalid", "Queued pre-move was invalid."),
      );
      return false;
    }
  };

  const applyFreeMove = (
    sourceSquare: Square,
    targetSquare: Square,
    options?: { debug?: boolean; promotion?: PromotionPiece },
  ) => {
    try {
      const game = createGameFromFen(fen);
      const move = game.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: options?.promotion ?? "q",
      });
      const isGameOver = hasGameOverMethod(game);

      if (options?.debug) {
        console.log("Current FEN before move:", fen);
        console.log("Move result:", move);
        console.log("New FEN after move:", game.fen());
        console.log("Is game over?", isGameOver);
        console.log("Legal moves:", game.moves());
      }

      if (!move) {
        playGameplaySound("illegal");
        return false;
      }

      const nextFen = game.fen();
      const shouldTryQueuedPreMove =
        premoves &&
        move.color !== practicePlayerColor &&
        !hasGameOverMethod(game);
      setFen(nextFen);
      setFreeMoveHistory((current) => [
        ...current,
        {
          color: move.color,
          fenAfter: nextFen,
          fenBefore: fen,
          from: sourceSquare,
          promotion: move.promotion ?? undefined,
          san: move.san,
          to: targetSquare,
        },
      ]);
      setLastMove({ from: sourceSquare, to: targetSquare });
      clearSelection();
      setPanelNotice(null);
      setExportFallback("");
      setRedoStack([]);
      if (move.color === practicePlayerColor || hasGameOverMethod(game)) {
        clearPreMove();
      }
      playChessMoveSound(move, { isOpponentMove: move.color === "b" });
      if (isGameOver && !hasCheckmateMethod(game)) {
        playGameplaySound("gameEnd");
      }

      if (shouldTryQueuedPreMove) {
        window.setTimeout(() => {
          applyQueuedPreMoveFromFen(nextFen);
        }, 0);
      }
      return true;
    } catch {
      playGameplaySound("illegal");
      return false;
    }
  };

  const handlePromotionPieceSelect = (piece: PromotionPiece) => {
    const pendingMove = pendingPromotionMove;
    if (!pendingMove) return;
    setPendingPromotionMove(null);
    applyFreeMove(pendingMove.from, pendingMove.to, { promotion: piece });
  };

  const handleSquareClick = (squareName: string) => {
    if (!isFreeMoveActive) return;
    if (pendingPromotionMove) return;
    if (!allowClickInput) return;
    if (suppressNextSquareClickRef.current) {
      suppressNextSquareClickRef.current = false;
      return;
    }

    const currentGame = createGameFromFen(fen);
    const currentTurn = currentGame.turn();
    const isPreMoveTurn = currentTurn !== practicePlayerColor;
    const square = squareName as Square;
    if (!moveFrom) {
      const clickedPiece = currentGame.get(square);
      if (!clickedPiece) {
        return;
      }

      if (isPreMoveTurn && premoves && clickedPiece.color === practicePlayerColor) {
        const hasOptions = showPreMoveSourceOptions(square);
        if (!hasOptions) {
          playGameplaySound("illegal");
          return;
        }
        setMoveFrom(square);
        return;
      }

      if (clickedPiece.color !== currentTurn) {
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
    const sourcePiece = currentGame.get(moveFrom);
    if (!sourcePiece) {
      clearSelection();
      return;
    }

    const isSelectedPreMoveSource =
      isPreMoveTurn && sourcePiece.color === practicePlayerColor;
    if (
      clickedPiece &&
      clickedPiece.color ===
        (isSelectedPreMoveSource ? practicePlayerColor : currentTurn)
    ) {
      if (isSelectedPreMoveSource) {
        showPreMoveSourceOptions(square);
      } else {
        getMoveOptionsForSquare(square);
      }
      setMoveFrom(square);
      return;
    }

    const targetMoves = isSelectedPreMoveSource
      ? getPreMoveTargetMoves(currentGame, moveFrom, square)
      : getLegalMovesFromSquare(currentGame, moveFrom).filter(
          (move) => move.to === square,
        );
    const isLegalTarget = targetMoves.length > 0;

    if (!isLegalTarget) {
      playGameplaySound("illegal");
      setPanelNotice(
        isSelectedPreMoveSource
          ? t(
              "practice.workspace.notices.selectLegalPreMoveTarget",
              "Select a legal pre-move target.",
            )
          : t(
              "practice.workspace.notices.chooseHighlightedLegalMove",
              "Choose one of the highlighted legal moves.",
            ),
      );
      return;
    }

    if (isSelectedPreMoveSource) {
      const targetHasPromotion = targetMoves.some((move) => Boolean(move.promotion));
      if (targetHasPromotion) {
        if (!autoQueen) {
          setPanelNotice(
            t(
              "practice.workspace.notices.promotionPremovesQueuedAsQueen",
              "Promotion pre-moves are queued as a queen.",
            ),
          );
        }
        setPreMove(moveFrom, square, "q");
      } else {
        setPreMove(moveFrom, square);
      }
      clearSelection();
      setPanelNotice(t("practice.workspace.notices.preMoveQueued", "Pre-move queued."));
      return;
    }

    if (targetMoves.some((move) => Boolean(move.promotion))) {
      if (autoQueen) {
        applyFreeMove(moveFrom, square, { promotion: "q" });
        return;
      }
      queuePromotionMove(moveFrom, square, sourcePiece.color);
      return;
    }

    applyFreeMove(moveFrom, square);
  };

  const handleFreeMovePieceDrop = (sourceSquare: string, targetSquare: string) => {
    if (!isFreeMoveActive || sourceSquare === targetSquare) return false;
    if (pendingPromotionMove) return false;
    const currentGame = createGameFromFen(fen);
    const source = sourceSquare as Square;
    const target = targetSquare as Square;
    const sourcePiece = currentGame.get(source);
    if (!sourcePiece) return false;

    const currentTurn = currentGame.turn();
    const isPreMoveTurn = currentTurn !== practicePlayerColor;
    const isPreMoveDrop =
      isPreMoveTurn && premoves && sourcePiece.color === practicePlayerColor;

    const targetMoves = isPreMoveDrop
      ? getPreMoveTargetMoves(currentGame, source, target)
      : getLegalMovesFromSquare(currentGame, source).filter(
          (move) => move.to === target,
        );

    if (!targetMoves.length) {
      playGameplaySound("illegal");
      return false;
    }

    if (isPreMoveDrop) {
      const targetHasPromotion = targetMoves.some((move) => Boolean(move.promotion));
      if (targetHasPromotion) {
        if (!autoQueen) {
          setPanelNotice(
            t(
              "practice.workspace.notices.promotionPremovesQueuedAsQueen",
              "Promotion pre-moves are queued as a queen.",
            ),
          );
        }
        setPreMove(source, target, "q");
      } else {
        setPreMove(source, target);
      }
      clearSelection();
      setPanelNotice(t("practice.workspace.notices.preMoveQueued", "Pre-move queued."));
      suppressNextSquareClickRef.current = true;
      return false;
    }

    if (targetMoves.some((move) => Boolean(move.promotion))) {
      if (autoQueen) {
        const moved = applyFreeMove(source, target, {
          promotion: "q",
          debug: true,
        });
        if (moved) suppressNextSquareClickRef.current = true;
        return moved;
      }
      queuePromotionMove(source, target, sourcePiece.color);
      return false;
    }

    const moved = applyFreeMove(sourceSquare as Square, targetSquare as Square, {
      debug: true,
    });
    if (moved) suppressNextSquareClickRef.current = true;
    return moved;
  };

  const handlePositionBuilderSquareClick = (squareName: string) => {
    if (!isPositionBuilderActive) return;
    const square = squareName as Square;
    const next = new Chess();
    next.load(positionBuilderGame.fen());

    if (positionBuilderSelectedPiece === "eraser") {
      const removed = next.remove(square);
      if (!removed) {
        setPanelNotice(
          t(
            "practice.workspace.notices.positionBuilderNoPieceOnSquare",
            "No piece on that square.",
          ),
        );
        return;
      }
    } else {
      const pieceToPlace =
        POSITION_BUILDER_BOARD_PIECES[positionBuilderSelectedPiece];
      next.remove(square);
      const wasPlaced = next.put(
        { type: pieceToPlace.type, color: pieceToPlace.color },
        square,
      );
      if (!wasPlaced) {
        setPanelNotice(
          t(
            "practice.workspace.notices.positionBuilderInvalidSetup",
            "Invalid setup. Keep legal piece counts and only one king per side.",
          ),
        );
        return;
      }
    }

    const rawFen = next.fen();
    const parts = rawFen.split(" ");
    const cleanFen = [parts[0], positionBuilderSideToMove, "-", "-", "0", "1"].join(
      " ",
    );
    const cleanGame = new Chess();
    const loaded = cleanGame.load(cleanFen);
    if (loaded) {
      setPositionBuilderGame(cleanGame);
    } else {
      setPositionBuilderGame(next);
    }
    setLastMove(null);
    clearSelection();
    setPanelNotice(null);
    setPositionBuilderFenFallback("");
  };

  const handlePositionBuilderPieceDrop = (
    sourceSquare: string,
    targetSquare: string,
  ) => {
    if (!isPositionBuilderActive || sourceSquare === targetSquare) return false;
    const source = sourceSquare as Square;
    const target = targetSquare as Square;
    const currentPiece = positionBuilderGame.get(source);
    if (!currentPiece) return false;

    const next = new Chess();
    next.load(positionBuilderGame.fen());
    next.remove(source);
    const moved = next.put(currentPiece, target);
    if (!moved) {
      setPanelNotice(
        t(
          "practice.workspace.notices.positionBuilderInvalidPlacement",
          "Invalid placement for this position.",
        ),
      );
      return false;
    }

    const rawFen = next.fen();
    const parts = rawFen.split(" ");
    const cleanFen = [parts[0], positionBuilderSideToMove, "-", "-", "0", "1"].join(
      " ",
    );
    const cleanGame = new Chess();
    const loaded = cleanGame.load(cleanFen);
    if (loaded) {
      setPositionBuilderGame(cleanGame);
    } else {
      setPositionBuilderGame(next);
    }
    clearSelection();
    setLastMove({ from: source, to: target });
    setPanelNotice(null);
    setPositionBuilderFenFallback("");
    return true;
  };

  const applyPositionBuilderFen = (fen: string) => {
    const next = new Chess();
    const loaded = next.load(fen);
    if (!loaded) {
      setPanelNotice(
        t(
          "practice.workspace.notices.positionBuilderInvalidFenString",
          "Invalid FEN string.",
        ),
      );
      return false;
    }
    setPositionBuilderGame(next);
    clearSelection();
    setLastMove(null);
    setPanelNotice(
      t("practice.workspace.notices.positionBuilderPositionLoaded", "Position loaded."),
    );
    setPositionBuilderFenFallback("");
    return true;
  };

  const handlePositionBuilderLoadFen = () => {
    const fen = positionBuilderFenInput.trim();
    if (!fen) {
      setPanelNotice(
        t(
          "practice.workspace.notices.positionBuilderEnterFenFirst",
          "Enter a FEN string first.",
        ),
      );
      return;
    }
    applyPositionBuilderFen(fen);
  };

  const handlePositionBuilderCopyFen = async () => {
    const fen = positionBuilderGame.fen();
    if (!navigator.clipboard?.writeText) {
      setPositionBuilderFenFallback(fen);
      setPanelNotice(
        t(
          "practice.workspace.notices.positionBuilderClipboardUnavailableFenShown",
          "Clipboard unavailable. FEN shown below.",
        ),
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(fen);
      setPositionBuilderFenFallback("");
      setPanelNotice(
        t(
          "practice.workspace.notices.positionBuilderFenCopiedToClipboard",
          "FEN copied to clipboard.",
        ),
      );
    } catch {
      setPositionBuilderFenFallback(fen);
      setPanelNotice(
        t(
          "practice.workspace.notices.positionBuilderClipboardBlockedFenShown",
          "Clipboard blocked. FEN shown below.",
        ),
      );
    }
  };

  const handlePositionBuilderSideChange = (side: "w" | "b") => {
    const fenParts = positionBuilderGame.fen().split(" ");
    if (fenParts.length < 6) {
      setPanelNotice(
        t(
          "practice.workspace.notices.positionBuilderCannotUpdateSideToMove",
          "Cannot update side to move.",
        ),
      );
      return;
    }
    fenParts[1] = side;
    fenParts[2] = "-";
    fenParts[3] = "-";
    const nextFen = fenParts.join(" ");
    const loaded = applyPositionBuilderFen(nextFen);
    if (loaded) {
      setPositionBuilderSideToMove(side);
      const sideLabel =
        side === "w"
          ? t("practice.workspace.turn.white", "White")
          : t("practice.workspace.turn.black", "Black");
      setPanelNotice(
        t("practice.workspace.notices.positionBuilderTurnSetTo", {
          side: sideLabel,
          defaultValue: `Turn set to ${sideLabel}.`,
        }),
      );
    }
  };

  const handlePositionBuilderStartPosition = () => {
    const next = new Chess();
    setPositionBuilderGame(next);
    clearSelection();
    setLastMove(null);
    setPanelNotice(
      t(
        "practice.workspace.notices.positionBuilderLoadedStartPosition",
        "Loaded start position.",
      ),
    );
    setPositionBuilderFenFallback("");
  };

  const handlePositionBuilderClearBoard = () => {
    const emptyBoardFen = `8/8/8/8/8/8/8/8 ${positionBuilderSideToMove} - - 0 1`;
    applyPositionBuilderFen(emptyBoardFen);
    setPanelNotice(
      t("practice.workspace.notices.positionBuilderBoardCleared", "Board cleared."),
    );
  };

  const validatePositionBuilderBeforeStart = () => {
    const fenParts = positionBuilderGame.fen().split(" ");
    const validationFen = [fenParts[0], fenParts[1], "-", "-", "0", "1"].join(" ");
    const validationGame = new Chess();
    if (!validationGame.load(validationFen)) {
      setPositionBuilderValidationModal({
        title: t(
          "practice.workspace.positionBuilderValidation.invalidTitle",
          "Invalid Position",
        ),
        message: t(
          "practice.workspace.positionBuilderValidation.couldNotValidate",
          "Could not validate this position. Try rebuilding it.",
        ),
      });
      return false;
    }
    const validator = validationGame as unknown as {
      validate_fen?: (value: string) => { valid: boolean; error?: string };
    };

    if (typeof validator.validate_fen === "function") {
      const result = validator.validate_fen(validationFen);
      if (!result.valid) {
        setPositionBuilderValidationModal({
          title: t(
            "practice.workspace.positionBuilderValidation.invalidTitle",
            "Invalid Position",
          ),
          message: t(
            "practice.workspace.positionBuilderValidation.fenValidationFailed",
            "FEN validation failed.",
          ),
        });
        return false;
      }
    }

    const board = validationGame.board();
    let whiteKingCount = 0;
    let blackKingCount = 0;
    let whiteKingPos: { row: number; col: number } | null = null;
    let blackKingPos: { row: number; col: number } | null = null;

    board.forEach((rank, row) => {
      rank.forEach((piece, col) => {
        if (!piece || piece.type !== "k") return;
        if (piece.color === "w") {
          whiteKingCount += 1;
          whiteKingPos = { row, col };
        } else {
          blackKingCount += 1;
          blackKingPos = { row, col };
        }
      });
    });

    if (whiteKingCount !== 1 || blackKingCount !== 1) {
      setPositionBuilderValidationModal({
        title: t(
          "practice.workspace.positionBuilderValidation.invalidTitle",
          "Invalid Position",
        ),
        message: t(
          "practice.workspace.positionBuilderValidation.boardMustContainKings",
          "Board must contain exactly 1 White king and 1 Black king.",
        ),
      });
      return false;
    }

    if (
      whiteKingPos &&
      blackKingPos &&
      Math.abs(whiteKingPos.row - blackKingPos.row) <= 1 &&
      Math.abs(whiteKingPos.col - blackKingPos.col) <= 1
    ) {
      setPositionBuilderValidationModal({
        title: t(
          "practice.workspace.positionBuilderValidation.invalidTitle",
          "Invalid Position",
        ),
        message: t(
          "practice.workspace.positionBuilderValidation.kingsCannotBeAdjacent",
          "Kings cannot be adjacent.",
        ),
      });
      return false;
    }

    const sideToMove = fenParts[1] === "b" ? "b" : "w";
    const sideNotToMove: "w" | "b" = sideToMove === "w" ? "b" : "w";
    const sideNotToMoveLabel = sideNotToMove === "w" ? "White" : "Black";
    const sideToMoveLabel = sideToMove === "w" ? "White" : "Black";

    if (isSideInCheck(validationGame, sideNotToMove)) {
      setPositionBuilderValidationModal({
        title: t(
          "practice.workspace.positionBuilderValidation.invalidTitle",
          "Invalid Position",
        ),
        message: t(
          "practice.workspace.positionBuilderValidation.sideInCheckButNotToMove",
          {
            side: sideNotToMoveLabel,
            defaultValue: `${sideNotToMoveLabel} king is in check, but ${sideNotToMoveLabel} is not the side to move.`,
          },
        ),
      });
      return false;
    }

    const legalMoves = validationGame.moves();
    if (legalMoves.length === 0) {
      const isCheckmate =
        hasCheckmateMethod(validationGame) || hasCheckMethod(validationGame);
      const isStalemate = hasStalemateMethod(validationGame) || !isCheckmate;

      if (isCheckmate) {
        setPositionBuilderValidationModal({
          title: t(
            "practice.workspace.positionBuilderValidation.checkmateTitle",
            "Checkmate",
          ),
          message: t(
            "practice.workspace.positionBuilderValidation.checkmateNoLegalMoves",
            {
              side: sideToMoveLabel,
              defaultValue: `Checkmate: No legal moves for ${sideToMoveLabel}`,
            },
          ),
        });
      } else if (isStalemate) {
        setPositionBuilderValidationModal({
          title: t(
            "practice.workspace.positionBuilderValidation.stalemateTitle",
            "Stalemate",
          ),
          message: t(
            "practice.workspace.positionBuilderValidation.stalemateNoLegalMoves",
            {
              side: sideToMoveLabel,
              defaultValue: `Stalemate: No legal moves for ${sideToMoveLabel}`,
            },
          ),
        });
      }
      return false;
    }

    return true;
  };

  const handlePositionBuilderStartFromPosition = () => {
    if (!validatePositionBuilderBeforeStart()) return;
    const rawFen = positionBuilderGame.fen();
    const turn = rawFen.split(" ")[1] === "b" ? "b" : "w";
    const cleanFen = sanitizeFenForPractice(rawFen, turn) ?? rawFen.trim();
    if (cleanFen.split(/\s+/).length !== 6) {
      setPanelNotice(
        t(
          "practice.workspace.notices.positionBuilderInvalidFenString",
          "Invalid FEN string.",
        ),
      );
      return;
    }
    console.log("Passing FEN to FreeMove:", cleanFen);
    navigate("/play/practice/positionBuilder/freeMove", {
      state: {
        fen: cleanFen,
        turn,
        initialFen: cleanFen,
      },
    });
  };

  const handleUndo = () => {
    if (!freeMoveHistory.length) {
      setPanelNotice(t("practice.workspace.notices.noMovesToUndo", "No moves to undo."));
      return;
    }

    const undone = freeMoveHistory[freeMoveHistory.length - 1];
    setRedoStack((current) => [
      ...current,
      undone,
    ]);
    setFreeMoveHistory((current) => current.slice(0, -1));
    setFen(undone.fenBefore);
    setLastMove(null);
    clearSelection();
    clearPreMove();
    setPanelNotice(t("practice.workspace.notices.lastMoveUndone", "Last move undone."));
    setExportFallback("");
  };

  const handleRedo = () => {
    if (!redoStack.length) {
      setPanelNotice(t("practice.workspace.notices.noMovesToRedo", "No moves to redo."));
      return;
    }

    const redoMove = redoStack[redoStack.length - 1];
    const next = createGameFromFen(fen);
    const move = next.move({
      from: redoMove.from,
      to: redoMove.to,
      promotion: redoMove.promotion,
    });

    if (!move || next.fen() !== redoMove.fenAfter) {
      setPanelNotice(
        t(
          "practice.workspace.notices.cannotRedoFromCurrentPosition",
          "Cannot redo from current position.",
        ),
      );
      setRedoStack([]);
      return;
    }

    setRedoStack((current) => current.slice(0, -1));
    setFreeMoveHistory((current) => [...current, redoMove]);
    setFen(redoMove.fenAfter);
    setLastMove({ from: redoMove.from, to: redoMove.to });
    clearSelection();
    clearPreMove();
    setPanelNotice(t("practice.workspace.notices.moveRestored", "Move restored."));
    setExportFallback("");
    playChessMoveSound(move, { isOpponentMove: move.color === "b" });
  };

  const handleReset = () => {
    setPendingPromotionMove(null);
    setFen(freeMoveInitialFen);
    setFreeMoveHistory([]);
    setLastMove(null);
    clearSelection();
    clearPreMove();
    setPanelNotice(
      isPositionBuilderFreeMoveActive
        ? t(
            "practice.workspace.notices.positionResetToBuilderStart",
            "Position reset to builder start.",
          )
        : t("practice.workspace.notices.positionResetToStart", "Position reset to start."),
    );
    setExportFallback("");
    setRedoStack([]);
    playGameplaySound("gameStart");
  };

  const handleFlipBoard = () => {
    clearPreMove();
    setBoardOrientation((current) => (current === "white" ? "black" : "white"));
  };

  const handleExportPgn = async () => {
    const pgnGame = buildGameFromHistory(freeMoveInitialFen, freeMoveHistory);
    const pgn = pgnGame.pgn();
    if (!pgn) {
      setPanelNotice(t("practice.workspace.notices.noMovesToExportYet", "No moves to export yet."));
      return;
    }

    if (!navigator.clipboard?.writeText) {
      setExportFallback(pgn);
      setPanelNotice(
        t(
          "practice.workspace.notices.clipboardUnavailablePgnShown",
          "Clipboard unavailable. PGN displayed below.",
        ),
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(pgn);
      setPanelNotice(
        t("practice.workspace.notices.pgnCopiedToClipboard", "PGN copied to clipboard."),
      );
      setExportFallback("");
    } catch {
      setExportFallback(pgn);
      setPanelNotice(
        t(
          "practice.workspace.notices.clipboardBlockedPgnShown",
          "Clipboard blocked. PGN displayed below.",
        ),
      );
    }
  };

  return (
    <div
      className={`relative h-full min-h-0 w-full bg-theme-surface ${
        isPositionBuilderActive
          ? "overflow-y-auto overflow-x-hidden lg:overflow-hidden"
          : "overflow-hidden"
      }`}
    >
      <div
        className={`h-full grid ${
          isPositionBuilderActive
            ? "grid-cols-1 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]"
            : isFreeMoveActive && showEvalBar
              ? "grid-cols-[minmax(0,1.08fr)_38px_minmax(0,0.92fr)]"
              : "grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]"
        }`}
      >
        <div
          ref={leftRef}
          className={`min-w-0 flex justify-center p-3 lg:p-4 ${
            isPositionBuilderActive
              ? "items-start lg:items-center h-auto lg:h-full"
              : "items-center h-full"
          }`}
        >
          <div
            className="relative inline-flex rounded-[30px] border border-theme-glass/80 bg-theme-panel/75 p-2.5 lg:p-3 shadow-[0_24px_58px_-30px_rgba(8,47,73,0.65)]"
          >
            <div className="pointer-events-none absolute inset-0 rounded-[30px]" />
            <div
              className="relative rounded-2xl overflow-hidden shadow-2xl border border-theme-glass/65"
              style={{ width: boardWidth, height: boardWidth }}
            >
              <Chessboard
                key={boardKey}
                id={`practice-board-${practiceBoardId}`}
                boardWidth={boardWidth}
                position={boardPosition}
                boardOrientation={boardOrientation}
                arePiecesDraggable={
                  isPositionBuilderActive ||
                  (allowDragInput &&
                    isFreeMoveActive &&
                    !promotionState.isOpen)
                }
                showPromotionDialog={false}
                promotionToSquare={null}
                onPromotionCheck={() => false}
                onSquareClick={(squareName) => {
                  if (promotionState.isOpen) return;
                  if (isPositionBuilderActive) {
                    handlePositionBuilderSquareClick(squareName);
                    return;
                  }
                  if (!allowClickInput) return;
                  handleSquareClick(squareName);
                }}
                onSquareRightClick={() => {
                  if (promotionState.isOpen) return;
                  if (moveFrom) {
                    clearSelection();
                    return;
                  }
                  clearPreMove();
                }}
                onPieceDrop={(sourceSquare, targetSquare) => {
                  if (promotionState.isOpen) return false;
                  if (!allowDragInput && !isPositionBuilderActive) return false;
                  return isPositionBuilderActive
                    ? handlePositionBuilderPieceDrop(
                        sourceSquare,
                        targetSquare,
                      )
                    : handleFreeMovePieceDrop(
                        sourceSquare,
                        targetSquare,
                      );
                }}
                isDraggablePiece={({
                  sourceSquare,
                  piece,
                }: {
                  sourceSquare?: string;
                  piece?: string;
                }) => {
                  if (isPositionBuilderActive) return true;
                  if (!isFreeMoveActive) return false;
                  if (!allowDragInput) return false;
                  if (promotionState.isOpen) return false;
                  const currentGame = createGameFromFen(fen);
                  const turn = currentGame.turn();
                  const canPreMove = premoves && turn !== practicePlayerColor;
                  if (typeof piece === "string" && piece.length > 0) {
                    const pieceColor = piece[0].toLowerCase();
                    if (pieceColor === turn) return true;
                    return canPreMove && pieceColor === practicePlayerColor;
                  }
                  if (!sourceSquare) return false;
                  const boardPiece = currentGame.get(sourceSquare as Square);
                  if (!boardPiece) return false;
                  if (boardPiece.color === turn) return true;
                  return canPreMove && boardPiece.color === practicePlayerColor;
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
                dropOffBoardAction="snapback"
              />
              <PromotionModal
                state={promotionState}
                onSelect={handlePromotionPieceSelect}
              />
            </div>
          </div>
        </div>

        {isFreeMoveActive && showEvalBar && (
          <div className="h-full flex items-center justify-center py-4">
            <div className="h-full rounded-2xl bg-theme-panel/70 px-1.5 py-2 flex flex-col items-center shadow-[0_14px_36px_-26px_rgba(6,95,70,0.8)]">
              <div className="mb-1 px-1.5 py-1 rounded bg-theme-panel text-theme-foreground text-[10px] font-semibold text-center leading-none">
                {evalState.label}
              </div>
              <div className="relative flex-1 w-4 rounded overflow-hidden border border-theme-glass/70 bg-theme-surface">
                <div
                  className="absolute left-0 right-0 bottom-0 bg-theme-panel transition-all duration-300 ease-out"
                  style={{ height: `${evalState.percent}%` }}
                />
                <div
                  className="absolute left-0 right-0 top-0 bg-theme-panel transition-all duration-300 ease-out"
                  style={{ height: `${100 - evalState.percent}%` }}
                />
                <div className="absolute left-0 right-0 top-1/2 h-px bg-theme-border/60" />
              </div>
            </div>
          </div>
        )}

        <div
          className={`min-w-0 w-full overflow-hidden ${
            isSessionModeActive
              ? isPositionBuilderActive
                ? "h-auto lg:h-full bg-transparent border-l-0"
                : "h-full bg-transparent border-l-0"
              : "h-full bg-transparent border-l border-theme-glass/60"
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
                className="h-full min-h-0 p-3 lg:p-4 flex items-start justify-center"
              >
                <div
                  className="premium-scrollbar"
                  style={{
                    ...PRACTICE_RIGHT_PANEL_STYLE,
                    width: "100%",
                    maxWidth: 560,
                    height: freeMovePanelHeight,
                    minHeight: 0,
                    maxHeight: "100%",
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                    fontFamily: "inherit",
                    boxShadow: "0 24px 58px -30px rgba(6,95,70,0.58)",
                    overflowY: "auto",
                    overflowX: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0 2px 6px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div
                        style={{
                          width: 11,
                          height: 11,
                          borderRadius: "50%",
                          background: "rgb(var(--color-brand-500-rgb))",
                          boxShadow:
                            "0 0 0 3px rgb(var(--color-brand-500-rgb) / 0.25), 0 0 8px rgb(var(--color-brand-500-rgb) / 0.4)",
                        }}
                      />
                      <h2
                        style={{
                          fontSize: 16,
                          fontWeight: 700,
                          color: "var(--text-primary)",
                          letterSpacing: "-0.01em",
                        }}
                      >
                        {practiceModeCopy["free-move"].title}
                      </h2>
                    </div>
                    <button
                      onClick={() =>
                        navigate(
                          isPositionBuilderFreeMoveActive
                            ? "/play/practice/positionBuilder"
                            : "/play/practice",
                        )
                      }
                      className="transition-colors hover:text-theme-foreground"
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: "var(--text-secondary)",
                        background: "var(--bg-surface)",
                        border: "1px solid rgba(var(--color-brand-500-rgb), 0.62)",
                        borderRadius: 7,
                        padding: "5px 13px",
                        cursor: "pointer",
                      }}
                    >
                      {t("practice.workspace.back", "Буцах")}
                    </button>
                  </div>

                  <div
                    style={{
                      ...PRACTICE_CARD_STYLE,
                      flex: "0 0 auto",
                      minHeight: 158,
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "13px 16px",
                        borderBottom: "1px solid rgba(var(--text-primary-rgb), 0.1)",
                        background: "rgba(var(--bg-base-rgb), 0.38)",
                      }}
                    >
                      <div
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: "rgba(var(--text-primary-rgb), 0.85)",
                        }}
                      />
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "var(--text-primary)",
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                        }}
                      >
                        {t("practice.workspace.moveHistory", "Move History")}
                      </span>
                    </div>
                    <div
                      className="practice-history-scroll"
                      style={{
                        flex: "0 0 auto",
                        minHeight: FREE_MOVE_HISTORY_LIST_HEIGHT,
                        maxHeight: FREE_MOVE_HISTORY_LIST_HEIGHT,
                        overflowY: "auto",
                        padding: "14px 16px",
                        fontFamily: '"Roboto Mono", monospace',
                      }}
                    >
                      <ChessMoveList
                        rows={moveRows}
                        emptyMessage={t(
                          "practice.workspace.moveHistoryEmpty",
                          "Make a legal move to start your PGN list.",
                        )}
                        activePly={sanMoves.length || null}
                        rowClassName="grid grid-cols-[34px_minmax(0,1fr)_minmax(0,1fr)] gap-2 items-center text-[12px] py-0.5"
                        moveNumberClassName="text-theme-accent"
                        moveCellClassName="font-medium rounded-md px-2.5 py-1.5 bg-theme-panel text-theme-foreground text-[11px] overflow-hidden text-ellipsis whitespace-nowrap"
                        activeMoveClassName="bg-[linear-gradient(135deg,rgb(var(--color-brand-500-rgb)),rgb(var(--color-brand-600-rgb)))] text-theme-on-accent shadow-[0_2px_8px_rgb(var(--color-brand-500-rgb)/0.28)]"
                        inactiveMoveClassName="text-theme-foreground/90"
                        showMissingMoveCell
                        missingMoveText="--"
                        footer={<div ref={movesEndRef} />}
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      ...PRACTICE_CARD_STYLE,
                    }}
                  >
                    <div
                      style={{
                        ...PRACTICE_CARD_BODY_STYLE,
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                      }}
                    >
                      {opening && (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 3,
                            padding: "0 2px",
                          }}
                        >
                          <div
                            style={{
                             fontSize: 12.5,
                             fontWeight: 600,
                             color: "var(--text-primary)",
                             lineHeight: 1.35,
                            }}
                          >
                            {opening.variation
                              ? `${opening.name}: ${opening.variation}`
                              : opening.name}
                          </div>
                          <div
                            style={{
                             fontSize: 11,
                             color: "rgba(var(--text-secondary-rgb), 0.96)",
                            }}
                          >
                            {opening.eco ? `ECO ${opening.eco}` : ""}
                            {opening.line ? ` • ${opening.line}` : ""}
                          </div>
                        </div>
                      )}
                      {!opening && !openingLoading && sanMoves.length > 0 && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-secondary)",
                            padding: "0 2px",
                          }}
                        >
                          {t(
                            "practice.workspace.freeMove.openingUnavailable",
                            "Opening data unavailable",
                          )}
                        </div>
                      )}

                      <div
                        style={{
                          borderRadius: 10,
                          border: "1px solid rgba(var(--text-primary-rgb), 0.12)",
                          background: "rgba(var(--bg-base-rgb), 0.46)",
                          padding: "11px 12px",
                          boxShadow: "inset 0 1px 0 rgba(var(--text-primary-rgb), 0.05)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                            marginBottom: 6,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 10.5,
                              fontWeight: 700,
                              color: "var(--text-primary)",
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                            }}
                          >
                            {t("practice.workspace.freeMove.topFiveMoves", "Top 5 Moves").replace(
                              "5",
                              "3",
                            )}
                          </div>
                           <div
                             style={{
                               fontSize: 10.5,
                               color: "rgba(var(--text-secondary-rgb), 0.96)",
                             }}
                           >
                            {createGameFromFen(fen).turn() === "w"
                              ? t("practice.workspace.freeMove.whiteToMove", "White to move")
                              : t("practice.workspace.freeMove.blackToMove", "Black to move")}
                          </div>
                        </div>

                        {topMoves.length === 0 ? (
                          <div
                            style={{
                              fontSize: 11.5,
                              color: "var(--text-secondary)",
                            }}
                          >
                            {topMovesLoading
                              ? t(
                                  "practice.workspace.freeMove.analyzingTopMoves",
                                  "Analyzing top moves...",
                                )
                              : topMovesError
                                ? topMovesError
                                : t(
                                    "practice.workspace.freeMove.topMovesPlaceholder",
                                    "Top moves will appear here.",
                                  )}
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {topMoves.slice(0, 3).map((line) => (
                              <div
                                key={`${line.rank}-${line.uci}`}
                                className="practice-top-move-row"
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "24px minmax(0,1fr) auto",
                                  gap: 10,
                                  alignItems: "center",
                                  padding: "7px 8px",
                                  borderRadius: 8,
                                  background:
                                    line.rank % 2 === 0
                                      ? "rgba(var(--bg-base-rgb), 0.56)"
                                      : "rgba(var(--text-primary-rgb), 0.045)",
                                  fontFamily: '"Roboto Mono", monospace',
                                  fontSize: 11,
                                  color: "var(--text-primary)",
                                }}
                              >
                                <span style={{ color: "rgba(var(--text-secondary-rgb), 0.98)" }}>#{line.rank}</span>
                                <span
                                  style={{
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    color: "rgba(var(--text-primary-rgb), 0.96)",
                                  }}
                                >
                                  {line.san}
                                  {line.pvSan.length > 1
                                    ? ` • ${line.pvSan.slice(0, 4).join(" ")}`
                                    : ""}
                                </span>
                                <span
                                  style={{
                                    color:
                                      typeof line.scoreMate === "number"
                                        ? line.scoreMate > 0
                                          ? "#4ade80"
                                          : line.scoreMate < 0
                                            ? "#fb7185"
                                            : "rgba(var(--text-secondary-rgb), 0.98)"
                                        : typeof line.scoreCp === "number"
                                          ? line.scoreCp > 0
                                            ? "#4ade80"
                                            : line.scoreCp < 0
                                              ? "#fb7185"
                                              : "rgba(var(--text-secondary-rgb), 0.98)"
                                          : "rgba(var(--text-secondary-rgb), 0.98)",
                                    fontWeight: 700,
                                    fontVariantNumeric: "tabular-nums",
                                  }}
                                >
                                  {formatTopMoveScore(line.scoreCp, line.scoreMate)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      ...PRACTICE_CARD_STYLE,
                    }}
                  >

                    <div
                      style={{
                        ...PRACTICE_CARD_BODY_STYLE,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 12,
                          padding: 8,
                          borderRadius: 12,
                          border: "1px solid rgba(var(--text-primary-rgb), 0.12)",
                          background: "rgba(var(--bg-base-rgb), 0.42)",
                          boxShadow: "inset 0 1px 0 rgba(var(--text-primary-rgb), 0.05)",
                        }}
                      >
                        <button
                          onClick={handleUndo}
                          disabled={sanMoves.length === 0}
                          className="practice-free-move-nav-button transition-colors hover:text-theme-muted"
                          style={{
                            ...FREE_MOVE_ARROW_BUTTON_STYLE,
                            width: 38,
                            height: 38,
                            background: "rgba(var(--bg-surface-rgb), 0.9)",
                            opacity: sanMoves.length === 0 ? 0.5 : 1,
                            cursor: sanMoves.length === 0 ? "not-allowed" : "pointer",
                          }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ width: 14, height: 14 }}>
                            <path d="M19 12H5M12 5l-7 7 7 7" />
                          </svg>
                        </button>
                        <span
                          style={{
                            fontSize: 12,
                            color: "rgba(var(--text-secondary-rgb), 0.96)",
                            flex: "0 1 180px",
                            minWidth: 118,
                            maxWidth: 220,
                            textAlign: "center",
                            padding: "0 8px",
                            fontWeight: 600,
                          }}
                        >
                          {sanMoves.length === 0
                            ? t("practice.workspace.freeMove.startPosition", "Start Position")
                            : t("practice.workspace.freeMove.plyCount", {
                                count: sanMoves.length,
                                defaultValue: `${sanMoves.length} ply`,
                              })}
                        </span>
                        <button
                          onClick={handleRedo}
                          disabled={redoStack.length === 0}
                          className="practice-free-move-nav-button transition-colors hover:text-theme-muted"
                          style={{
                            ...FREE_MOVE_ARROW_BUTTON_STYLE,
                            width: 38,
                            height: 38,
                            background: "rgba(var(--bg-surface-rgb), 0.9)",
                            opacity: redoStack.length === 0 ? 0.5 : 1,
                            cursor: redoStack.length === 0 ? "not-allowed" : "pointer",
                          }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ width: 14, height: 14 }}>
                            <path d="M5 12h14M12 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      ...PRACTICE_CARD_STYLE,
                    }}
                  >
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, padding: "14px 16px" }}>
                      <button
                        onClick={handleReset}
                        className="transition-colors hover:text-theme-muted"
                        style={{
                          ...FREE_MOVE_BASE_BUTTON_STYLE,
                          background: "var(--bg-surface)",
                          color: "var(--text-secondary)",
                          minHeight: 50,
                          fontSize: 13,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {t("practice.workspace.freeMove.resetToStart", "Reset to Start")}
                      </button>
                      <button
                        onClick={handleExportPgn}
                        className="transition-all hover:brightness-105"
                        style={{
                          ...FREE_MOVE_BASE_BUTTON_STYLE,
                          background:
                            "linear-gradient(135deg, rgb(var(--color-brand-500-rgb)), rgb(var(--color-brand-600-rgb)))",
                          color: "var(--text-primary)",
                          border: "none",
                          fontWeight: 600,
                          minHeight: 50,
                          fontSize: 13,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow:
                            "0 2px 8px rgb(var(--color-brand-500-rgb) / 0.25)",
                        }}
                      >
                        {t("practice.workspace.exportPgn", "Export PGN")}
                      </button>
                    </div>
                    <div style={{ padding: "0 16px 14px" }}>
                      <button
                        onClick={handleFlipBoard}
                        className="transition-colors hover:text-theme-muted"
                        style={{
                          width: "100%",
                          padding: 10,
                          borderRadius: 9,
                          fontSize: 12.5,
                          fontWeight: 500,
                          background: "var(--bg-surface)",
                          color: "var(--text-secondary)",
                          border: "1px dashed rgba(var(--color-brand-500-rgb), 0.72)",
                          cursor: "pointer",
                        }}
                      >
                        {t("practice.workspace.freeMove.flipBoard", "Flip Board")}
                      </button>
                    </div>
                    {preMove && (
                      <div
                        style={{
                          padding: "0 16px 12px",
                          fontSize: 11.5,
                          color: "var(--accent-muted)",
                          fontWeight: 700,
                          fontFamily: '"Roboto Mono", monospace',
                          textShadow: "0 0 10px rgba(var(--accent-rgb), 0.24)",
                        }}
                      >
                        {t("practice.workspace.freeMove.queuedPreMove", "Queued pre-move")}:{" "}
                        {preMove.from}{"->"}
                        {preMove.to}
                        {preMove.promotion ?? ""}
                      </div>
                    )}
                    {panelNotice && (
                      <div
                        style={{
                          padding: "0 16px 10px",
                          fontSize: 11,
                          color: "var(--text-secondary)",
                        }}
                      >
                        {panelNotice}
                      </div>
                    )}

                    {exportFallback && (
                      <div style={{ padding: "0 16px 14px" }}>
                        <textarea
                          readOnly
                          value={exportFallback}
                          style={{
                            width: "100%",
                            height: 112,
                            borderRadius: 8,
                            border: "1px solid rgba(var(--text-primary-rgb), 0.12)",
                            background: "rgba(var(--bg-base-rgb), 0.52)",
                            color: "var(--text-secondary)",
                            padding: 8,
                            fontSize: 12,
                            fontFamily: '"Roboto Mono", monospace',
                            resize: "none",
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </motion.section>
            ) : isPositionBuilderActive ? (
              <motion.section
                key="position-builder-session"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="min-h-0 p-3 lg:p-4 flex items-start lg:items-stretch justify-center"
              >
                <div
                  className="premium-scrollbar"
                  style={{
                    ...PRACTICE_RIGHT_PANEL_STYLE,
                    width: "100%",
                    maxWidth: 620,
                    height: freeMovePanelHeight,
                    maxHeight: freeMovePanelHeight,
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                    fontFamily: "inherit",
                    boxShadow:
                      "0 20px 48px -30px rgba(6,95,70,0.64), inset 0 0 0 1px rgba(var(--border-color-rgb), 0.45)",
                    overflowY: "auto",
                    overflowX: "hidden",
                    scrollbarGutter: "stable",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0 2px 8px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          background: "rgb(var(--color-brand-500-rgb) / 0.22)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {positionBuilderModeIcon?.(
                          "rgb(var(--color-brand-500-rgb))",
                        )}
                      </div>
                      <h2
                        style={{
                          fontSize: 16,
                          fontWeight: 700,
                          color: "var(--text-primary)",
                          letterSpacing: "-0.01em",
                        }}
                      >
                        {practiceModeCopy["position-builder"].title}
                      </h2>
                    </div>
                    <button
                      onClick={() => navigate("/play/practice")}
                      className="transition-colors hover:text-theme-foreground"
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: "var(--text-secondary)",
                        background: "rgba(var(--bg-panel-rgb), 0.88)",
                        border: "1px solid rgba(var(--border-color-rgb), 0.72)",
                        borderRadius: 9,
                        padding: "6px 14px",
                        cursor: "pointer",
                      }}
                    >
                      {t("practice.workspace.back", "Буцах")}
                    </button>
                  </div>

                  <div
                    style={{
                      ...PRACTICE_CARD_STYLE,
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                        ...PRACTICE_CARD_BODY_STYLE,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handlePositionBuilderSideChange("w")}
                        style={{
                          minHeight: 42,
                          borderRadius: 9,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          border: `1px solid ${
                            positionBuilderSideToMove === "w"
                              ? "rgb(var(--color-brand-500-rgb) / 0.75)"
                              : "rgba(var(--border-color-rgb), 0.72)"
                          }`,
                          color:
                            positionBuilderSideToMove === "w"
                              ? "var(--text-primary)"
                              : "var(--text-secondary)",
                          background:
                            positionBuilderSideToMove === "w"
                              ? "rgb(var(--color-brand-500-rgb) / 0.2)"
                              : "rgba(var(--bg-base-rgb), 0.45)",
                        }}
                      >
                        <span
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            background:
                              positionBuilderSideToMove === "w"
                                ? "rgb(var(--color-brand-500-rgb))"
                                : "transparent",
                            border: `1.6px solid ${
                              positionBuilderSideToMove === "w"
                                ? "rgb(var(--color-brand-500-rgb))"
                                : "rgba(var(--border-color-rgb), 0.78)"
                            }`,
                          }}
                        />
                        {t("practice.workspace.turn.white", "White")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePositionBuilderSideChange("b")}
                        style={{
                          minHeight: 42,
                          borderRadius: 9,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          border: `1px solid ${
                            positionBuilderSideToMove === "b"
                              ? "rgb(var(--color-brand-500-rgb) / 0.75)"
                              : "rgba(var(--border-color-rgb), 0.72)"
                          }`,
                          color:
                            positionBuilderSideToMove === "b"
                              ? "var(--text-primary)"
                              : "var(--text-secondary)",
                          background:
                            positionBuilderSideToMove === "b"
                              ? "rgb(var(--color-brand-500-rgb) / 0.2)"
                              : "rgba(var(--bg-base-rgb), 0.45)",
                        }}
                      >
                        <span
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            background:
                              positionBuilderSideToMove === "b"
                                ? "rgb(var(--color-brand-500-rgb))"
                                : "transparent",
                            border: `1.6px solid ${
                              positionBuilderSideToMove === "b"
                                ? "rgb(var(--color-brand-500-rgb))"
                                : "rgba(var(--border-color-rgb), 0.78)"
                            }`,
                          }}
                        />
                        {t("practice.workspace.turn.black", "Black")}
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      ...PRACTICE_CARD_STYLE,
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <div
                      className="premium-scrollbar"
                      style={{ padding: "14px 16px", overflowY: "auto" }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
                          gap: 6,
                          padding: "0 0 10px",
                        }}
                      >
                        {POSITION_BUILDER_WHITE_PIECES.map((pieceId) => {
                          const isSelected = positionBuilderSelectedPiece === pieceId;
                          const symbol = POSITION_BUILDER_PIECE_SYMBOLS[pieceId];
                          return (
                            <button
                              key={pieceId}
                              type="button"
                              onClick={() => setPositionBuilderSelectedPiece(pieceId)}
                              style={{
                                height: 44,
                                borderRadius: 8,
                                background: isSelected
                                  ? "rgb(var(--color-brand-500-rgb) / 0.2)"
                                  : "rgba(var(--bg-base-rgb), 0.42)",
                                border: isSelected
                                  ? "1px solid rgb(var(--color-brand-500-rgb) / 0.85)"
                                  : "1px solid rgba(255,255,255,0.28)",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <span
                                aria-hidden="true"
                                style={{
                                  fontSize: 30,
                                  lineHeight: 1,
                                  color: "var(--text-primary)",
                                  textShadow: "0 0 1px rgba(0,0,0,0.9)",
                                  userSelect: "none",
                                }}
                              >
                                {symbol}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div
                        style={{
                          height: 1,
                          background: "rgba(var(--border-color-rgb), 0.45)",
                          margin: "0 0 8px",
                        }}
                      />

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
                          gap: 6,
                          padding: "0 0 10px",
                        }}
                      >
                        {POSITION_BUILDER_BLACK_PIECES.map((pieceId) => {
                          const isSelected = positionBuilderSelectedPiece === pieceId;
                          const symbol = POSITION_BUILDER_PIECE_SYMBOLS[pieceId];
                          return (
                            <button
                              key={pieceId}
                              type="button"
                              onClick={() => setPositionBuilderSelectedPiece(pieceId)}
                              style={{
                                height: 44,
                                borderRadius: 8,
                                background: isSelected
                                  ? "rgb(var(--color-brand-500-rgb) / 0.2)"
                                  : "rgba(var(--bg-base-rgb), 0.42)",
                                border: isSelected
                                  ? "1px solid rgb(var(--color-brand-500-rgb) / 0.85)"
                                  : "1px solid rgba(255,255,255,0.28)",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <span
                                aria-hidden="true"
                                style={{
                                  fontSize: 30,
                                  lineHeight: 1,
                                  color: "var(--practice-piece-black-color)",
                                  textShadow: "var(--practice-piece-black-shadow)",
                                  userSelect: "none",
                                }}
                              >
                                {symbol}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div
                        style={{
                          height: 1,
                          background: "rgba(var(--border-color-rgb), 0.45)",
                          margin: "2px 0 10px",
                        }}
                      />
                      <div style={{ padding: 0 }}>
                        <button
                          type="button"
                          onClick={() => setPositionBuilderSelectedPiece("eraser")}
                          style={{
                            width: "100%",
                            minHeight: 38,
                            padding: "8px 10px",
                            borderRadius: 9,
                            fontSize: 12.5,
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 7,
                            border:
                              positionBuilderSelectedPiece === "eraser"
                                ? "1px solid rgba(239,68,68,0.5)"
                                : "1px solid rgba(var(--border-color-rgb), 0.7)",
                            background:
                              positionBuilderSelectedPiece === "eraser"
                                ? "rgba(239,68,68,0.14)"
                                : "rgba(var(--bg-base-rgb), 0.42)",
                            color:
                              positionBuilderSelectedPiece === "eraser"
                                ? "var(--accent-hover)"
                                : "var(--text-secondary)",
                          }}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.9"
                          >
                            <path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                          </svg>
                          {t(
                            "practice.workspace.positionBuilderPanel.eraserHelp",
                            "Eraser (click board square to remove)",
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      ...PRACTICE_CARD_STYLE,
                    }}
                  >
                    <div
                      style={{
                        ...PRACTICE_CARD_BODY_STYLE,
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      <textarea
                        value={positionBuilderFenInput}
                        onChange={(event) =>
                          setPositionBuilderFenInput(event.target.value)
                        }
                        onFocus={() => setIsPositionBuilderFenFocused(true)}
                        onBlur={() => setIsPositionBuilderFenFocused(false)}
                        spellCheck={false}
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          background: "rgba(var(--bg-base-rgb), 0.75)",
                          border: isPositionBuilderFenFocused
                            ? "1px solid rgb(var(--color-brand-500-rgb) / 0.85)"
                            : "1px solid rgba(var(--border-color-rgb), 0.72)",
                          borderRadius: 9,
                          color: "var(--text-primary)",
                          fontSize: 12,
                          fontFamily: '"Roboto Mono", monospace',
                          padding: "10px 12px",
                          outline: "none",
                          resize: "none",
                          minHeight: 58,
                          boxShadow: isPositionBuilderFenFocused
                            ? "0 0 0 2px rgb(var(--color-brand-500-rgb) / 0.22), 0 0 10px rgb(var(--color-brand-500-rgb) / 0.22)"
                            : "none",
                          transition: "border-color 140ms ease, box-shadow 140ms ease",
                        }}
                      />
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 8,
                        }}
                      >
                        <button
                          type="button"
                          onClick={handlePositionBuilderLoadFen}
                          style={{
                            ...FREE_MOVE_BASE_BUTTON_STYLE,
                            minHeight: 40,
                            background: "rgba(var(--bg-base-rgb), 0.42)",
                            color: "var(--text-secondary)",
                            border: "1px solid rgba(var(--border-color-rgb), 0.72)",
                            padding: 9,
                            fontSize: 12,
                            borderRadius: 8,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {t(
                            "practice.workspace.positionBuilderPanel.loadFen",
                            "Load FEN",
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={handlePositionBuilderCopyFen}
                          style={{
                            ...FREE_MOVE_BASE_BUTTON_STYLE,
                            minHeight: 40,
                            background:
                              "linear-gradient(135deg, rgb(var(--color-brand-500-rgb)), rgb(var(--color-brand-600-rgb)))",
                            color: "var(--text-primary)",
                            border: "none",
                            padding: 9,
                            fontSize: 12,
                            borderRadius: 8,
                            boxShadow: "0 3px 10px rgb(var(--color-brand-500-rgb) / 0.28)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {t(
                            "practice.workspace.positionBuilderPanel.copyFen",
                            "Copy FEN",
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      ...PRACTICE_CARD_STYLE,
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        columnGap: 8,
                        rowGap: 8,
                        padding: "14px 16px",
                      }}
                    >
                      <button
                        type="button"
                        onClick={handlePositionBuilderStartPosition}
                        style={{
                          ...FREE_MOVE_BASE_BUTTON_STYLE,
                          minHeight: 40,
                          background: "rgba(var(--bg-base-rgb), 0.42)",
                          color: "var(--text-secondary)",
                          border: "1px solid rgba(var(--border-color-rgb), 0.72)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {t(
                          "practice.workspace.freeMove.startPositionButton",
                          "Start Position",
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={handlePositionBuilderClearBoard}
                        style={{
                          ...FREE_MOVE_BASE_BUTTON_STYLE,
                          minHeight: 40,
                          background: "transparent",
                          color: "var(--accent-hover)",
                          border: "1px solid rgba(var(--accent-hover-rgb),0.45)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {t(
                          "practice.workspace.positionBuilderPanel.clearBoard",
                          "Clear Board",
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={handlePositionBuilderStartFromPosition}
                        style={{
                          ...FREE_MOVE_BASE_BUTTON_STYLE,
                          gridColumn: "span 2",
                          minHeight: 42,
                          background:
                            "linear-gradient(135deg, rgb(var(--color-brand-500-rgb)), rgb(var(--color-brand-600-rgb)))",
                          color: "var(--text-primary)",
                          border: "none",
                          boxShadow: "0 4px 14px rgb(var(--color-brand-500-rgb) / 0.34)",
                        }}
                      >
                        {t(
                          "practice.workspace.positionBuilderPanel.startFromThisPosition",
                          "Start from This Position",
                        )}
                      </button>
                    </div>
                  </div>
                  {panelNotice && (
                    <div
                      style={{
                        padding: "0 4px 4px",
                        fontSize: 11.5,
                        color: "var(--text-secondary)",
                      }}
                    >
                      {panelNotice}
                    </div>
                  )}

                  {positionBuilderFenFallback && (
                    <textarea
                      readOnly
                      value={positionBuilderFenFallback}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        height: 74,
                        borderRadius: 8,
                        border: "1px solid rgba(var(--border-color-rgb), 0.72)",
                        background: "rgba(var(--bg-base-rgb), 0.62)",
                        color: "var(--text-secondary)",
                        padding: 10,
                        fontSize: 12,
                        fontFamily: '"Roboto Mono", monospace',
                        resize: "none",
                      }}
                    />
                  )}
                </div>
              </motion.section>
            ) : (
              <motion.section
                key="mode-picker"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="h-full min-h-0"
              >
                <div
                  style={{
                    background: "var(--bg-surface)",
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    borderLeft: "1px solid rgba(var(--glass-border-rgb), 0.55)",
                  }}
                >
                  <div
                    style={{
                      padding: "20px 20px 16px",
                      borderBottom: "1px solid rgba(var(--glass-border-rgb), 0.55)",
                    }}
                  >
                    <p
                      style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}
                    >
                      {t("practice.workspace.title", "Practice Workspace")}
                    </p>
                    <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>
                      {t(
                        "practice.workspace.subtitle",
                        "Choose a training mode to set your next session.",
                      )}
                    </p>
                  </div>

                  <div
                    style={{
                      flex: 1,
                      padding: "12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      overflowY: "auto",
                    }}
                  >
                    {PRACTICE_MODES.map((mode) => {
                      const isActive = selectedModeId === mode.id;
                      const modeCopy = practiceModeCopy[mode.id];
                      return (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => handleModeClick(mode)}
                          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/70"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 14,
                            padding: "13px 14px",
                            borderRadius: 10,
                            cursor: "pointer",
                            border: `1px solid ${
                              isActive
                                ? "rgb(var(--color-brand-500-rgb) / 0.32)"
                                : "transparent"
                            }`,
                            background: isActive
                              ? "rgb(var(--color-brand-500-rgb) / 0.14)"
                              : "transparent",
                            transition: "all 0.15s",
                            textAlign: "left",
                          }}
                        >
                          <div
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 10,
                              flexShrink: 0,
                              background: isActive
                                ? "rgb(var(--color-brand-500-rgb) / 0.22)"
                                : "var(--bg-surface)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {mode.icon(
                              isActive ? "rgb(var(--color-brand-500-rgb))" : "var(--text-secondary)",
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p
                              style={{
                                fontSize: 13.5,
                                fontWeight: 500,
                                color: "var(--text-primary)",
                              }}
                            >
                              {modeCopy.title}
                            </p>
                            <p
                              style={{
                                fontSize: 12,
                                color: "var(--text-secondary)",
                                marginTop: 2,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {modeCopy.desc}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div
                    style={{
                      padding: "14px 16px 18px",
                      borderTop: "1px solid rgba(var(--glass-border-rgb), 0.55)",
                    }}
                  >
                    <p
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: "var(--text-secondary)",
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        marginBottom: 6,
                      }}
                    >
                      {t("practice.workspace.currentSelection", "Current Selection")}
                    </p>
                    <p
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        marginBottom: 2,
                      }}
                    >
                      {activeModeCopy.title}
                    </p>
                    <p
                      style={{
                        fontSize: 12,
                        color: "var(--text-secondary)",
                        marginBottom: 14,
                      }}
                    >
                      {activeModeCopy.desc}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        if (activeModeIsLive && activeModeRoute) {
                          navigate(activeModeRoute);
                        }
                      }}
                      disabled={!activeModeIsLive}
                      style={{
                        width: "100%",
                        padding: "12px",
                        background: activeModeIsLive
                          ? "rgb(var(--color-brand-500-rgb))"
                          : "var(--bg-surface)",
                        color: activeModeIsLive ? "var(--text-primary)" : "var(--text-secondary)",
                        border: "none",
                        borderRadius: 10,
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: activeModeIsLive ? "pointer" : "not-allowed",
                        letterSpacing: "0.01em",
                      }}
                    >
                      {activeModeCopy.openLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate("/play/practice/pgn")}
                      style={{
                        width: "100%",
                        padding: "10px",
                        marginTop: 8,
                        background: "transparent",
                        color: "var(--text-secondary)",
                        border: "1px solid var(--border-color)",
                        borderRadius: 10,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        letterSpacing: "0.01em",
                      }}
                    >
                      {t("practice.workspace.importUploadPgn", "Import / Upload PGN")}
                    </button>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </div>
      {isPgnImportModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onMouseDown={closePgnImportModal}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 110,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 12,
            background: "rgba(2, 6, 23, 0.8)",
            backdropFilter: "blur(2px)",
          }}
        >
          <div
            onMouseDown={(event) => event.stopPropagation()}
            style={{
              width: "min(90vw, 720px)",
              height: "min(520px, 92vh)",
              maxHeight: 520,
              borderRadius: 16,
              border: "1px solid var(--border-color)",
              background: "var(--bg-panel)",
              boxShadow: "0 22px 56px -24px rgba(2,6,23,0.95)",
              overflow: "hidden",
            }}
          >
            <PracticePgnImport
              embedded
              onRequestClose={closePgnImportModal}
            />
          </div>
        </div>
      )}
      {positionBuilderValidationModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 90,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            background: "rgba(2, 6, 23, 0.72)",
            backdropFilter: "blur(2px)",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 420,
              borderRadius: 14,
              background: "var(--bg-panel)",
              border: "1px solid var(--border-color)",
              boxShadow: "0 20px 56px -20px rgba(2,6,23,0.9)",
              overflow: "hidden",
              pointerEvents: "auto",
            }}
          >
            <div
              style={{
                padding: "14px 16px 10px",
                borderBottom: "1px solid var(--border-color)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "rgb(var(--color-brand-500-rgb))",
                }}
              />
              <h3
                style={{
                  margin: 0,
                  fontSize: 15,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                }}
              >
                {positionBuilderValidationModal.title}
              </h3>
            </div>
            <div style={{ padding: "14px 16px 16px" }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: "var(--text-secondary)",
                }}
              >
                {positionBuilderValidationModal.message}
              </p>
              <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setPositionBuilderValidationModal(null)}
                  style={{
                    ...FREE_MOVE_BASE_BUTTON_STYLE,
                    padding: "8px 14px",
                    fontSize: 12,
                    background:
                      "linear-gradient(135deg, rgb(var(--accent-rgb)), rgb(var(--accent-hover-rgb)))",
                    color: "var(--text-primary)",
                    border: "none",
                    boxShadow: "0 2px 10px rgba(var(--accent-rgb),0.28)",
                  }}
                >
                  {t("practice.workspace.positionBuilderValidation.okButton", "OK")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
