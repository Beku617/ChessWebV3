import { Chess } from "chess.js";

export function buildFenByPly(moves: string[]): Map<number, string> {
  const chess = new Chess();
  const fenByPly = new Map<number, string>();
  fenByPly.set(0, chess.fen());

  for (let index = 0; index < moves.length; index += 1) {
    const san = String(moves[index] || "").trim();
    if (!san) break;

    const appliedMove = chess.move(san, { sloppy: true });
    if (!appliedMove) break;
    fenByPly.set(index + 1, chess.fen());
  }

  return fenByPly;
}

export function formatOpeningLabel(opening: {
  name: string;
  variation?: string;
} | null): string {
  if (!opening) return "";
  return opening.variation ? `${opening.name}: ${opening.variation}` : opening.name;
}
