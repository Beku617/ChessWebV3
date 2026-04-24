import { Chess } from "chess.js";
import i18n from "../../i18n";

/**
 * Normalize FEN string to ensure valid 6-field format
 */
export function normalizeFen(fen: string): string {
  const parts = fen.trim().split(/\s+/);
  if (parts.length >= 6) {
    const halfmove = Number.isNaN(parseInt(parts[4], 10))
      ? 0
      : parseInt(parts[4], 10);
    let fullmove = parseInt(parts[5], 10);
    if (Number.isNaN(fullmove) || fullmove < 1) fullmove = 1;
    parts[4] = String(halfmove);
    parts[5] = String(fullmove);
    return parts.slice(0, 6).join(" ");
  }
  // If someone saved only the board + side, patch missing fields
  if (parts.length === 2 || parts.length === 3 || parts.length === 4) {
    const padded = [
      parts[0],
      parts[1] || "w",
      parts[2] || "-",
      parts[3] || "-",
      "0",
      "1",
    ];
    return padded.join(" ");
  }
  return fen;
}

/**
 * Resolve side-to-move from FEN (true = white, false = black)
 */
export function fenStartsWithWhite(fen: string, fallback = true): boolean {
  const normalized = normalizeFen(fen);
  const side = normalized.trim().split(/\s+/)[1];
  if (side === "w") return true;
  if (side === "b") return false;
  return fallback;
}

/**
 * Safely load a game from FEN with fallbacks
 */
export function safeLoadGame(
  fen: string,
  setFenError: (error: string | null) => void,
): Chess {
  setFenError(null);
  try {
    return new Chess(fen);
  } catch {
    // Try with normalized fen
    try {
      return new Chess(normalizeFen(fen));
    } catch {
      try {
        return new Chess(); // start position fallback
      } catch {
        setFenError(
          i18n.t("puzzles.trainer.invalidFen", {
            defaultValue: "Invalid FEN for this puzzle",
          }),
        );
        return new Chess();
      }
    }
  }
}

/**
 * Normalize solution moves array
 */
export function normalizeSolution(moves: string[]): string[] {
  return moves
    .map((m) => m.trim())
    .filter(
      (m) =>
        m.length > 0 &&
        m !== "*" &&
        m !== "..." &&
        m !== ".." &&
        !/^(1-0|0-1|1\/2-1\/2)$/.test(m),
    )
    .map((m) => m.replace(/[?!]+$/g, ""));
}

/**
 * Check if a move string is in UCI format
 */
export function isUciMove(move: string): boolean {
  return /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move);
}

/**
 * Apply a move string (SAN or UCI) to a chess instance
 */
export function applyMoveString(
  chess: Chess,
  moveStr: string,
): ReturnType<typeof chess.move> {
  if (isUciMove(moveStr)) {
    const from = moveStr.slice(0, 2);
    const to = moveStr.slice(2, 4);
    const promotion = moveStr.length === 5 ? moveStr[4] : undefined;
    return chess.move({ from, to, promotion });
  }
  return chess.move(moveStr);
}

/**
 * Convert a move string to a move object
 */
export function moveStringToMove(
  fen: string,
  moveStr: string,
): { from: string; to: string; promotion?: string } | null {
  const tempGame = new Chess(fen);
  const move = applyMoveString(tempGame, moveStr);
  return move
    ? { from: move.from, to: move.to, promotion: move.promotion }
    : null;
}

/**
 * Format elapsed time as MM:SS
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
