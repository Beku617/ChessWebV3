import { useEffect, useMemo, useState } from "react";
import { Chessboard } from "react-chessboard";
import { useTranslation } from "react-i18next";
import { createCburnettCustomPieces } from "./chessPieceIcons";

interface ReplayBoardProps {
  position: string;
  orientation: "white" | "black";
  lastMove: { from: string; to: string } | null;
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
}

const CBURNETT_CUSTOM_PIECES = createCburnettCustomPieces();

export function ReplayBoard({
  position,
  orientation,
  lastMove,
  isCheck,
  isCheckmate,
  isStalemate,
}: ReplayBoardProps) {
  const { t } = useTranslation();
  const getViewport = () => ({
    width: typeof window !== "undefined" ? window.innerWidth : 1280,
    height: typeof window !== "undefined" ? window.innerHeight : 800,
  });

  const [viewport, setViewport] = useState(getViewport);

  useEffect(() => {
    const updateViewport = () => setViewport(getViewport());
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  // Keep board size stable and derived from viewport only to avoid mount-time grow/shrink flicker.
  const boardWidth = useMemo(() => {
    const byWidth = Math.floor(viewport.width * 0.38);
    const byHeight = Math.floor(viewport.height * 0.68);
    return Math.max(280, Math.min(640, byWidth, byHeight));
  }, [viewport.height, viewport.width]);

  const squareStyles = lastMove
    ? {
        [lastMove.from]: {
          boxShadow:
            "inset 0 0 0 3px rgba(250, 204, 21, 0.95), inset 0 0 0 1px rgba(120, 53, 15, 0.45)",
        },
        [lastMove.to]: {
          boxShadow:
            "inset 0 0 0 3px rgba(250, 204, 21, 0.95), inset 0 0 0 1px rgba(120, 53, 15, 0.45)",
        },
      }
    : {};

  return (
    <div className="relative h-full w-full flex items-center justify-center">
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-3 border border-gray-200 dark:border-gray-800 shadow-lg">
        <Chessboard
          id="replay-board"
          position={position}
          boardOrientation={orientation}
          customPieces={CBURNETT_CUSTOM_PIECES}
          animationDuration={0}
          boardWidth={boardWidth}
          customSquareStyles={squareStyles}
          arePiecesDraggable={false}
          customBoardStyle={{
            borderRadius: "8px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
          }}
        />
      </div>

      {/* Status Badge */}
      {(isCheck || isCheckmate || isStalemate) && (
        <div
          className={`absolute top-3 right-3 px-3 py-1.5 rounded-full text-white text-xs sm:text-sm font-bold shadow-lg ${
            isCheckmate
              ? "bg-red-500"
              : isStalemate
                ? "bg-yellow-500"
                : "bg-amber-500"
          }`}
        >
          {isCheckmate
            ? t("analysis.checkmate", "Checkmate!")
            : isStalemate
              ? t("analysis.stalemate", "Stalemate")
              : t("analysis.check", "Check!")}
        </div>
      )}
    </div>
  );
}
