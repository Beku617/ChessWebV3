import { useCallback } from "react";
import { Chess, Square } from "chess.js";
import { OptionSquares } from "./useStockfishGameTypes";
import { useGameplayPreferences } from "./useGameplayPreferences";

const SELECTED_SOURCE_STYLE = {
  backgroundColor: "rgba(250, 204, 21, 0.38)",
};

const LEGAL_MOVE_STYLE = {
  background:
    "radial-gradient(circle, rgba(31, 41, 55, 0.26) 34%, rgba(0, 0, 0, 0) 36%)",
  borderRadius: "50%",
};

const LEGAL_CAPTURE_STYLE = {
  boxShadow:
    "inset 0 0 0 2px rgba(31, 41, 55, 0.58), inset 0 0 0 5px rgba(31, 41, 55, 0.2)",
};

export function useMoveOptions(
  gameRef: React.MutableRefObject<Chess>,
  setOptionSquares: React.Dispatch<React.SetStateAction<OptionSquares>>,
) {
  const { showLegalMoves } = useGameplayPreferences();

  const getMoveOptions = useCallback(
    (square: Square) => {
      const currentGame = gameRef.current;
      const movesForSquare = currentGame.moves({ square, verbose: true });
      if (movesForSquare.length === 0) {
        setOptionSquares({});
        return false;
      }

      const newSquares: OptionSquares = {
        [square]: SELECTED_SOURCE_STYLE,
      };
      if (showLegalMoves) {
        movesForSquare.forEach((move) => {
          const targetPiece = currentGame.get(move.to);
          newSquares[move.to] = targetPiece
            ? LEGAL_CAPTURE_STYLE
            : LEGAL_MOVE_STYLE;
        });
      }
      setOptionSquares(newSquares);
      return true;
    },
    [gameRef, setOptionSquares, showLegalMoves],
  );

  return getMoveOptions;
}
