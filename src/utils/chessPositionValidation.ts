import { Chess } from "chess.js";

export type SideToMove = "w" | "b";

export type LegalChessPositionValidationResult =
  | {
      valid: true;
      normalizedFen: string;
    }
  | {
      valid: false;
      message: string;
    };

const EMPTY_BOARD_FEN = "8/8/8/8/8/8/8/8";

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

function hasStalemateMethod(game: Chess) {
  const candidate = game as unknown as {
    isStalemate?: () => boolean;
    in_stalemate?: () => boolean;
  };
  if (typeof candidate.isStalemate === "function") return candidate.isStalemate();
  if (typeof candidate.in_stalemate === "function") return candidate.in_stalemate();
  return false;
}

function isSideInCheck(game: Chess, side: SideToMove) {
  const fenParts = game.fen().split(" ");
  if (fenParts.length < 6) return false;
  fenParts[1] = side;
  const checkGame = new Chess();
  const loaded = checkGame.load(fenParts.join(" "));
  if (!loaded) return false;
  return hasCheckMethod(checkGame);
}

export function detectFenSideToMove(
  fen: string,
  fallback: SideToMove = "w",
): SideToMove {
  const parts = String(fen || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts[1] === "b") return "b";
  if (parts[1] === "w") return "w";
  return fallback;
}

export function withFenSideToMove(fen: string, sideToMove: SideToMove): string {
  const parts = String(fen || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const board = parts[0] || EMPTY_BOARD_FEN;
  const castling = parts[2] || "-";
  const enPassant = parts[3] || "-";
  const halfmove = parts[4] || "0";
  const fullmove = parts[5] || "1";

  return `${board} ${sideToMove} ${castling} ${enPassant} ${halfmove} ${fullmove}`;
}

function normalizeFenForBoardValidation(
  fen: string,
  sideToMove: SideToMove,
): string | null {
  const parts = String(fen || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts[0]) return null;
  return `${parts[0]} ${sideToMove} - - 0 1`;
}

export function validateLegalChessPosition(
  fen: string,
  preferredSideToMove?: SideToMove,
): LegalChessPositionValidationResult {
  const sideToMove = preferredSideToMove || detectFenSideToMove(fen, "w");
  const normalizedFen = normalizeFenForBoardValidation(fen, sideToMove);

  if (!normalizedFen) {
    return {
      valid: false,
      message: "FEN position is required.",
    };
  }

  const validationGame = new Chess();
  if (!validationGame.load(normalizedFen)) {
    return {
      valid: false,
      message: "FEN position is invalid.",
    };
  }

  const validator = validationGame as unknown as {
    validate_fen?: (value: string) => { valid: boolean; error?: string };
  };

  if (typeof validator.validate_fen === "function") {
    const result = validator.validate_fen(normalizedFen);
    if (!result.valid) {
      return {
        valid: false,
        message: "FEN position is invalid.",
      };
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
    return {
      valid: false,
      message: "Board must contain exactly 1 White king and 1 Black king.",
    };
  }

  if (
    whiteKingPos &&
    blackKingPos &&
    Math.abs(whiteKingPos.row - blackKingPos.row) <= 1 &&
    Math.abs(whiteKingPos.col - blackKingPos.col) <= 1
  ) {
    return {
      valid: false,
      message: "Kings cannot be adjacent.",
    };
  }

  const sideNotToMove: SideToMove = sideToMove === "w" ? "b" : "w";
  const sideNotToMoveLabel = sideNotToMove === "w" ? "White" : "Black";
  const sideToMoveLabel = sideToMove === "w" ? "White" : "Black";

  if (isSideInCheck(validationGame, sideNotToMove)) {
    return {
      valid: false,
      message: `${sideNotToMoveLabel} king is in check, but ${sideNotToMoveLabel} is not the side to move.`,
    };
  }

  const legalMoves = validationGame.moves();
  if (legalMoves.length === 0) {
    if (hasCheckmateMethod(validationGame) || hasCheckMethod(validationGame)) {
      return {
        valid: false,
        message: `Checkmate: no legal moves for ${sideToMoveLabel}.`,
      };
    }

    if (hasStalemateMethod(validationGame)) {
      return {
        valid: false,
        message: `Stalemate: no legal moves for ${sideToMoveLabel}.`,
      };
    }

    return {
      valid: false,
      message: `No legal moves for ${sideToMoveLabel}.`,
    };
  }

  return {
    valid: true,
    normalizedFen,
  };
}
