import { useCallback, useRef } from "react";
import type { Square } from "chess.js";

const BOARD_SQUARE_PATTERN = /^[a-h][1-8]$/;

function normalizeBoardSquare(value: unknown): Square | null {
  if (typeof value !== "string") return null;
  const square = value.trim().toLowerCase();
  if (!BOARD_SQUARE_PATTERN.test(square)) return null;
  return square as Square;
}

export function useChessboardDropCoordinates() {
  const dragSourceRef = useRef<Square | null>(null);
  const dragTargetRef = useRef<Square | null>(null);

  const clearInlinePiecePosition = useCallback(() => {
    if (typeof document === "undefined") return;

    document.querySelectorAll<HTMLElement>("[data-piece]").forEach((piece) => {
      piece.style.left = "";
      piece.style.top = "";
    });
  }, []);

  const clearDragSquares = useCallback(() => {
    dragSourceRef.current = null;
    dragTargetRef.current = null;
    clearInlinePiecePosition();
  }, [clearInlinePiecePosition]);

  const handlePieceDragBegin = useCallback(
    (_piece: string, sourceSquare: string) => {
      clearInlinePiecePosition();
      dragSourceRef.current = normalizeBoardSquare(sourceSquare);
      dragTargetRef.current = null;
    },
    [clearInlinePiecePosition],
  );

  const handleDragOverSquare = useCallback((square?: string) => {
    const normalizedSquare = normalizeBoardSquare(square);
    if (normalizedSquare) {
      dragTargetRef.current = normalizedSquare;
    }
  }, []);

  const resolveDropSquares = useCallback(
    (sourceSquare: string, targetSquare: string) => {
      const fallbackSource = normalizeBoardSquare(sourceSquare);
      const fallbackTarget = normalizeBoardSquare(targetSquare);
      const resolvedSource = fallbackSource ?? dragSourceRef.current;
      const resolvedTarget = fallbackTarget ?? dragTargetRef.current;

      dragSourceRef.current = null;
      dragTargetRef.current = null;
      clearInlinePiecePosition();

      if (!resolvedSource || !resolvedTarget) return null;

      return {
        sourceSquare: resolvedSource,
        targetSquare: resolvedTarget,
      };
    },
    [clearInlinePiecePosition],
  );

  return {
    clearDragSquares,
    handlePieceDragBegin,
    handleDragOverSquare,
    resolveDropSquares,
  };
}
