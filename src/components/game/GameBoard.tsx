import { Chessboard } from "react-chessboard";
import { Square } from "chess.js";
import { useEffect, useId } from "react";
import type { CSSProperties } from "react";
import { PromotionModal } from "./PromotionModal";
import type { PromotionState } from "./types";
import { useBoardTheme } from "../../hooks/useBoardTheme";
import { useGameplayPreferences } from "../../hooks/useGameplayPreferences";
import { createCburnettCustomPieces } from "../replay/chessPieceIcons";

const CLOSED_PROMOTION_STATE: PromotionState = {
  isOpen: false,
  from: null,
  to: null,
  color: null,
};

interface GameBoardProps {
  fen: string;
  boardWidth: number;
  boardOrientation: "white" | "black";
  onSquareClick: (square: Square) => void;
  onPieceDrop?: (
    sourceSquare: Square,
    targetSquare: Square,
    piece?: string,
  ) => boolean;
  onCancelSelection?: () => void;
  isDraggablePiece?: (sourceSquare: Square) => boolean;
  customSquareStyles: Record<string, CSSProperties>;
  persistentSquareStyles?: Record<string, CSSProperties>;
  lastMove?: { from: string; to: string } | null;
  promotionState?: PromotionState;
  onPromotionPieceSelect?: (
    piece?: string,
    fromSquare?: Square,
    toSquare?: Square,
  ) => boolean;
  pieceStyle?: "default" | "cburnett";
  squareColors?: {
    light: string;
    dark: string;
  };
  customBoardStyle?: CSSProperties;
}

const CBURNETT_CUSTOM_PIECES = createCburnettCustomPieces();

export function GameBoard({
  fen,
  boardWidth,
  boardOrientation,
  onSquareClick,
  onPieceDrop,
  onCancelSelection,
  isDraggablePiece,
  customSquareStyles,
  persistentSquareStyles = {},
  lastMove,
  promotionState = CLOSED_PROMOTION_STATE,
  onPromotionPieceSelect,
  pieceStyle = "default",
  squareColors,
  customBoardStyle,
}: GameBoardProps) {
  const { colors } = useBoardTheme();
  const { allowClickInput, allowDragInput } = useGameplayPreferences();
  const boardInstanceId = useId().replace(/:/g, "");
  const isPromotionOpen = Boolean(
    promotionState.isOpen &&
      promotionState.from &&
      promotionState.to &&
      promotionState.color,
  );

  useEffect(() => {
    if (!onCancelSelection && !onPromotionPieceSelect) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (isPromotionOpen) {
          onPromotionPieceSelect?.(
            undefined,
            promotionState.from ?? undefined,
            promotionState.to ?? undefined,
          );
          return;
        }
        onCancelSelection?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPromotionOpen, onCancelSelection, onPromotionPieceSelect, promotionState.from, promotionState.to]);

  const lastMoveStyles = lastMove
    ? {
        [lastMove.from]: {
          boxShadow:
            "inset 0 0 0 3px rgba(250, 204, 21, 0.95), inset 0 0 0 1px rgba(120, 53, 15, 0.45)",
          borderRadius: "0",
        },
        [lastMove.to]: {
          boxShadow:
            "inset 0 0 0 3px rgba(250, 204, 21, 0.95), inset 0 0 0 1px rgba(120, 53, 15, 0.45)",
          borderRadius: "0",
        },
      }
    : {};

  const mergedSquareStyles = (() => {
    const merged: Record<string, CSSProperties> = {};
    const sources = [persistentSquareStyles, customSquareStyles, lastMoveStyles];
    for (const source of sources) {
      for (const [square, style] of Object.entries(source || {})) {
        merged[square] = {
          ...(merged[square] || {}),
          ...(style || {}),
        };
      }
    }
    return merged;
  })();

  return (
    <div className="relative">
      <Chessboard
        id={`game-board-${boardInstanceId}`}
        animationDuration={200}
        arePiecesDraggable={
          allowDragInput && !!onPieceDrop && !isPromotionOpen
        }
        boardWidth={boardWidth}
        position={fen}
        onSquareClick={(square) => {
          if (isPromotionOpen || !allowClickInput) return;
          onSquareClick(square as Square);
        }}
        onSquareRightClick={() => {
          if (isPromotionOpen) return;
          onCancelSelection?.();
        }}
        onPieceDrop={(sourceSquare, targetSquare, piece) => {
          if (!onPieceDrop || isPromotionOpen || !allowDragInput) return false;
          return onPieceDrop(
            sourceSquare as Square,
            targetSquare as Square,
            piece,
          );
        }}
        onPromotionCheck={() => false}
        isDraggablePiece={({ sourceSquare }) => {
          if (!onPieceDrop || isPromotionOpen || !allowDragInput) return false;
          if (!isDraggablePiece) return true;
          return isDraggablePiece(sourceSquare as Square);
        }}
        boardOrientation={boardOrientation}
        customBoardStyle={{
          borderRadius: "8px",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
          ...customBoardStyle,
        }}
        customSquareStyles={mergedSquareStyles}
        customDarkSquareStyle={{
          backgroundColor: squareColors?.dark || colors.dark,
        }}
        customLightSquareStyle={{
          backgroundColor: squareColors?.light || colors.light,
        }}
        customPieces={pieceStyle === "cburnett" ? CBURNETT_CUSTOM_PIECES : undefined}
      />

      <PromotionModal
        state={promotionState}
        onSelect={(piece) => {
          onPromotionPieceSelect?.(
            piece,
            promotionState.from ?? undefined,
            promotionState.to ?? undefined,
          );
        }}
      />
    </div>
  );
}
