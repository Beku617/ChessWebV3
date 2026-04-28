import { Chess, Move } from "chess.js";
import { OPENING_BOOK, OpeningLine } from "../data/openings";

export type OpeningSource = "book" | "lichess";

export type OpeningMatch = {
  eco: string;
  name: string;
  variation?: string;
  line: string;
  matchedMoves: number;
  totalMoves: number;
  nextMoves: string[];
  source: OpeningSource;
};

type BookLine = OpeningLine & { uci: string[]; line: string };

// Precompute UCI move strings for every book line for fast matching
const BOOK_LINES: BookLine[] = OPENING_BOOK.map((entry) => {
  const chess = new Chess();
  const uci: string[] = [];
  for (const san of entry.moves) {
    const move = chess.move(san, { sloppy: true });
    if (!move) break;
    uci.push(toUci(move));
  }
  return {
    ...entry,
    uci,
    line: entry.moves.join(" "),
  };
}).filter((e) => e.uci.length > 0);

function toUci(move: Move) {
  return `${move.from}${move.to}${move.promotion || ""}`;
}

export function sanToUci(moves: string[]): string[] {
  const chess = new Chess();
  const list: string[] = [];
  for (const san of moves) {
    const move = chess.move(san, { sloppy: true });
    if (!move) break;
    list.push(toUci(move));
  }
  return list;
}

export function verboseToUci(moves: Move[]): string[] {
  return moves.map((m) => `${m.from}${m.to}${m.promotion || ""}`);
}

const MIN_MATCH = 3; // require at least 3 plies to avoid noisy prefixes

function bestBookMatch(uciMoves: string[]): OpeningMatch | null {
  if (!uciMoves.length) return null;

  let best: OpeningMatch | null = null;

  for (const line of BOOK_LINES) {
    const matchDepth = longestPrefix(uciMoves, line.uci);
    if (matchDepth < MIN_MATCH) continue;

    const candidate: OpeningMatch = {
      eco: line.eco,
      name: line.name,
      variation: line.variation,
      line: line.line,
      matchedMoves: matchDepth,
      totalMoves: line.uci.length,
      nextMoves: line.moves.slice(matchDepth, matchDepth + 2),
      source: "book",
    };

    if (
      !best ||
      candidate.matchedMoves > best.matchedMoves ||
      (candidate.matchedMoves === best.matchedMoves &&
        candidate.totalMoves < best.totalMoves)
    ) {
      best = candidate;
    }
  }

  return best;
}

function longestPrefix(a: string[], b: string[]) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}

export function detectOpeningFromSan(historySan: string[]): OpeningMatch | null {
  const uciHistory = sanToUci(historySan);
  return bestBookMatch(uciHistory);
}

export function detectOpeningFromVerbose(
  moves: Move[],
): OpeningMatch | null {
  const uciHistory = verboseToUci(moves);
  return bestBookMatch(uciHistory);
}

export function lichessPlayParam(uciMoves: string[]) {
  return encodeURIComponent(uciMoves.join(","));
}

export function findOpeningByEco(eco: string): OpeningMatch | null {
  if (!eco) return null;
  const line = BOOK_LINES.find(
    (l) => l.eco.toLowerCase() === eco.toLowerCase(),
  );
  if (!line) return null;
  return {
    eco: line.eco,
    name: line.name,
    variation: line.variation,
    line: line.line,
    matchedMoves: line.uci.length,
    totalMoves: line.uci.length,
    nextMoves: line.moves.slice(0, 2),
    source: "book",
  };
}

export async function fetchLichessOpening(
  uciMoves: string[],
  signal?: AbortSignal,
): Promise<OpeningMatch | null> {
  if (!uciMoves.length) return null;
  const play = lichessPlayParam(uciMoves);
  const url = `https://explorer.lichess.ovh/masters?play=${play}`;

  try {
    const res = await fetch(url, {
      signal,
      credentials: "omit",
      mode: "cors",
      headers: {
        Accept: "application/json",
      },
    });
    if (res.status === 401) return null;
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data?.opening) return null;

    const openingName: string = data.opening.name || "Opening";
    const eco: string = data.opening.eco || "";

    return {
      eco,
      name: openingName,
      variation: undefined,
      line: openingName,
      matchedMoves: data.opening.ply || uciMoves.length,
      totalMoves: data.opening.ply || uciMoves.length,
      nextMoves: [],
      source: "lichess",
    };
  } catch (err) {
    return null;
  }
}
