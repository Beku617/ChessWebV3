import { Chessboard } from "react-chessboard";
import { Square } from "chess.js";
import { useEffect, useId } from "react";
import type { CSSProperties } from "react";
import { PromotionModal } from "./PromotionModal";
import type { PromotionState } from "./types";
import { useBoardTheme } from "../../hooks/useBoardTheme";
import { useGameplayPreferences } from "../../hooks/useGameplayPreferences";

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
}

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
          backgroundColor: "rgba(250, 204, 21, 0.55)",
        },
        [lastMove.to]: {
          backgroundColor: "rgba(74, 222, 128, 0.55)",
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
        isDraggablePiece={({ sourceSquare }) => {
          if (!onPieceDrop || isPromotionOpen || !allowDragInput) return false;
          if (!isDraggablePiece) return true;
          return isDraggablePiece(sourceSquare as Square);
        }}
        boardOrientation={boardOrientation}
        customBoardStyle={{
          borderRadius: "8px",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
        }}
        customSquareStyles={mergedSquareStyles}
        customDarkSquareStyle={{
          backgroundColor: colors.dark,
          transition: "background-color 160ms ease",
        }}
        customLightSquareStyle={{
          backgroundColor: colors.light,
          transition: "background-color 160ms ease",
        }}
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
