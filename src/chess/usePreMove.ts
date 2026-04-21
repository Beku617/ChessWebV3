import { useState, useCallback, useRef, useEffect } from "react";
import { PreMove, PreMoveSquares } from "./types";
import { playGameplaySound } from "../utils/moveSounds";
import { useGameplayPreferences } from "../hooks/useGameplayPreferences";

export const usePreMove = () => {
  const { premoves } = useGameplayPreferences();
  const [preMove, setPreMove] = useState<PreMove | null>(null);
  const preMoveRef = useRef<PreMove | null>(null);
  const [preMoveSquares, setPreMoveSquares] = useState<PreMoveSquares>({});

  // Set a pre-move with red target highlight similar to chess premove UX.
  const setPreMoveWithHighlight = useCallback(
    (from: string, to: string, promotion?: "b" | "n" | "r" | "q") => {
      if (!premoves) return;

      const nextPreMove = { from, to, promotion };
      preMoveRef.current = nextPreMove;
      setPreMove(nextPreMove);
      playGameplaySound("premove");
      setPreMoveSquares({
        [from]: {
          backgroundColor: "rgba(245, 158, 11, 0.35)",
          boxShadow: "inset 0 0 0 3px rgba(245, 158, 11, 0.8)",
        },
        [to]: {
          backgroundColor: "rgba(244, 63, 94, 0.38)",
          boxShadow: "inset 0 0 0 3px rgba(244, 63, 94, 0.92)",
          backgroundImage:
            "repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(255, 255, 255, 0.14) 6px, rgba(255, 255, 255, 0.14) 12px)",
        },
      });
    },
    [premoves],
  );

  // Clear the pre-move
  const clearPreMove = useCallback(() => {
    preMoveRef.current = null;
    setPreMove(null);
    setPreMoveSquares({});
  }, []);

  // Check if a pre-move is set
  const hasPreMove = useCallback(() => {
    return preMoveRef.current !== null;
  }, []);

  // Get the current pre-move
  const getPreMove = useCallback(() => {
    return preMoveRef.current;
  }, []);

  useEffect(() => {
    if (premoves) return;
    clearPreMove();
  }, [clearPreMove, premoves]);

  return {
    preMove,
    preMoveSquares,
    setPreMove: setPreMoveWithHighlight,
    clearPreMove,
    hasPreMove,
    getPreMove,
  };
};
