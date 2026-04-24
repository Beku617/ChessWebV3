import { Chess, type Square } from "chess.js";
import type { OptionSquares } from "./useStockfishGameTypes";

export type PlayerColor = "w" | "b";
export type MatchVariant =
  | "standard"
  | "chess960"
  | "threeCheck"
  | "kingOfHill"
  | "atomic";
export type GameOverReason =
  | "checkmate"
  | "draw"
  | "resign"
  | "timeout"
  | "opponent_left"
  | "aborted"
  | "three_check"
  | "king_of_the_hill"
  | "atomic_explosion";

export interface MoveAppliedPayload {
  gameId: string;
  move: { from: Square; to: Square; san: string };
  fen: string;
  turn: PlayerColor;
  isChess960Castle?: boolean;
  isCheckmate?: boolean;
  isDraw?: boolean;
  isStalemate?: boolean;
  whiteCheckCount?: number;
  blackCheckCount?: number;
  checkAwarded?: PlayerColor | null;
}

export interface GameOverPayload {
  gameId: string;
  reason: GameOverReason;
  winner: PlayerColor | null;
  whiteCheckCount?: number;
  blackCheckCount?: number;
  elo?: {
    rated: boolean;
    applied: boolean;
    pool?:
      | "bullet"
      | "blitz"
      | "rapid"
      | "classical"
      | "chess960Bullet"
      | "chess960Blitz"
      | "chess960Rapid"
      | "chess960Classical";
    skippedReason?: string;
    white?: {
      userId: string;
      oldRating: number;
      newRating: number;
      delta: number;
      oldRd?: number;
      newRd?: number;
      oldVolatility?: number;
      newVolatility?: number;
      gamesPlayed: number;
      gamesWon: number;
      poolGamesPlayed?: number;
      isProvisional?: boolean;
      wasProvisional?: boolean;
    };
    black?: {
      userId: string;
      oldRating: number;
      newRating: number;
      delta: number;
      oldRd?: number;
      newRd?: number;
      oldVolatility?: number;
      newVolatility?: number;
      gamesPlayed: number;
      gamesWon: number;
      poolGamesPlayed?: number;
      isProvisional?: boolean;
      wasProvisional?: boolean;
    };
  };
}

function normalizeCheckCount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function isStalemate(chess: Chess): boolean {
  return typeof (chess as any).isStalemate === "function"
    ? (chess as any).isStalemate()
    : chess.in_stalemate();
}

function isInsufficientMaterial(chess: Chess): boolean {
  return typeof (chess as any).isInsufficientMaterial === "function"
    ? (chess as any).isInsufficientMaterial()
    : chess.insufficient_material();
}

function isThreefoldRepetition(chess: Chess): boolean {
  return typeof (chess as any).isThreefoldRepetition === "function"
    ? (chess as any).isThreefoldRepetition()
    : chess.in_threefold_repetition();
}

function getDrawReason(chess: Chess): string | null {
  if (isStalemate(chess)) return "by stalemate";
  if (isThreefoldRepetition(chess)) return "by repetition";
  if (isInsufficientMaterial(chess)) return "by insufficient material";
  return null;
}

export function formatPerspectiveResult(
  payload: Pick<
    GameOverPayload,
    "reason" | "winner" | "whiteCheckCount" | "blackCheckCount"
  >,
  playerColor: PlayerColor,
  currentGame: Chess,
): string {
  if (payload.reason === "aborted") {
    return "Game Aborted";
  }

  if (payload.reason === "draw" || !payload.winner) {
    const drawReason = getDrawReason(currentGame);
    return drawReason ? `Draw (${drawReason})` : "Draw";
  }

  const win = payload.winner === playerColor;
  if (payload.reason === "three_check") {
    const whiteChecks = normalizeCheckCount(payload.whiteCheckCount);
    const blackChecks = normalizeCheckCount(payload.blackCheckCount);
    const winnerLabel =
      payload.winner === "w" ? "White" : payload.winner === "b" ? "Black" : null;
    const winnerText = winnerLabel
      ? `${winnerLabel} wins by 3-check`
      : "Win by 3-check";
    const countsText = `W ${whiteChecks}/3, B ${blackChecks}/3`;
    return `${win ? "You Win" : "You Lose"} (${winnerText}; ${countsText})`;
  }
  if (payload.reason === "king_of_the_hill") {
    return `${win ? "You Win" : "You Lose"} (by reaching the center)`;
  }
  if (payload.reason === "atomic_explosion") {
    return `${win ? "You Win" : "You Lose"} (by king explosion)`;
  }
  const reasonMap: Record<GameOverReason, string> = {
    checkmate: "by checkmate",
    resign: "by resignation",
    timeout: "on time",
    opponent_left: "opponent left",
    aborted: "game aborted",
    three_check: "by three checks",
    king_of_the_hill: "by reaching the center",
    atomic_explosion: "by king explosion",
    draw: "",
  };
  const reason = reasonMap[payload.reason];

  if (!reason) {
    return win ? "You Win" : "You Lose";
  }

  return `${win ? "You Win" : "You Lose"} (${reason})`;
}

export interface PreMove {
  from: Square;
  to: Square;
  promotion?: string;
}

export const BOARD_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export const PREMOVE_SOURCE_STYLE = {};

export function buildPreMoveSquares(preMove: PreMove | null): OptionSquares {
  if (!preMove) return {};
  return {
    [preMove.from]: { backgroundColor: "rgba(249, 115, 22, 0.4)" },
    [preMove.to]: { backgroundColor: "rgba(244, 63, 94, 0.36)" },
  };
}

export function isPromotionTargetSquare(color: PlayerColor, targetSquare: Square) {
  return (
    (color === "w" && targetSquare[1] === "8") ||
    (color === "b" && targetSquare[1] === "1")
  );
}

export function isChess960CastlingDropForColor(
  currentGame: Chess,
  sourceSquare: Square,
  targetSquare: Square,
  color: PlayerColor,
  variant: MatchVariant,
) {
  if (variant !== "chess960") return false;

  const kingPiece = currentGame.get(sourceSquare);
  if (!kingPiece || kingPiece.color !== color || kingPiece.type !== "k") {
    return false;
  }

  if (sourceSquare[1] !== targetSquare[1]) return false;

  const targetPiece = currentGame.get(targetSquare);
  return !!targetPiece && targetPiece.color === color && targetPiece.type === "r";
}

export function normalizeMatchVariant(value: unknown): MatchVariant {
  if (typeof value !== "string") return "standard";
  const normalized = value.trim().toLowerCase();
  if (normalized === "chess960") return "chess960";
  if (
    normalized === "atomic" ||
    normalized === "atomicchess" ||
    normalized === "atomic-chess" ||
    normalized === "atomic_chess"
  ) {
    return "atomic";
  }
  if (
    normalized === "kingofhill" ||
    normalized === "king-of-hill" ||
    normalized === "king_of_hill"
  ) {
    return "kingOfHill";
  }
  if (
    normalized === "threecheck" ||
    normalized === "three-check" ||
    normalized === "three_check"
  ) {
    return "threeCheck";
  }
  return "standard";
}

export function isUnratedVariant(variant: MatchVariant): boolean {
  return (
    variant === "threeCheck" ||
    variant === "kingOfHill" ||
    variant === "atomic"
  );
}

export function isAtomicKingCaptureAttempt(
  currentGame: Pick<Chess, "get"> | null | undefined,
  sourceSquare: Square,
  targetSquare: Square,
  moverColor?: PlayerColor,
) {
  if (!currentGame || typeof currentGame.get !== "function") return false;
  const movingPiece = currentGame.get(sourceSquare);
  if (!movingPiece || movingPiece.type !== "k") return false;
  if (moverColor && movingPiece.color !== moverColor) return false;

  const targetPiece = currentGame.get(targetSquare);
  return !!targetPiece && targetPiece.color !== movingPiece.color;
}

export function isAtomicVerboseMoveAllowed(move: {
  piece?: string;
  captured?: string;
}) {
  return !(move?.piece === "k" && !!move?.captured);
}
