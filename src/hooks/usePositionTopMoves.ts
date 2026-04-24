import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { createStockfishWorker } from "../utils/stockfishWorker";

type ScoreType = "cp" | "mate";

type ParsedInfoLine = {
  rank: number;
  scoreType?: ScoreType;
  scoreValue?: number;
  pvMoves: string[];
};

export type EngineTopMove = {
  rank: number;
  uci: string;
  san: string;
  pvSan: string[];
  scoreCp?: number;
  scoreMate?: number;
};

type UsePositionTopMovesOptions = {
  enabled?: boolean;
  multiPv?: number;
  depth?: number;
  timeoutMs?: number;
};

function normalizeFen(inputFen: string): string | null {
  const game = new Chess();
  if (inputFen !== "start") {
    const loaded = game.load(inputFen);
    if (!loaded) return null;
  }
  return game.fen();
}

function parseUciMove(uci: string) {
  const normalized = uci.trim().toLowerCase();
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(normalized)) return null;
  return {
    from: normalized.slice(0, 2),
    to: normalized.slice(2, 4),
    promotion: (normalized.slice(4, 5) || undefined) as
      | "q"
      | "r"
      | "b"
      | "n"
      | undefined,
  };
}

function uciPvToSan(fen: string, pvMoves: string[]) {
  const game = new Chess();
  const loaded = game.load(fen);
  if (!loaded) {
    return {
      firstSan: pvMoves[0] ?? "",
      pvSan: [],
    };
  }

  const pvSan: string[] = [];
  for (const uci of pvMoves) {
    const parsed = parseUciMove(uci);
    if (!parsed) break;
    const move = game.move(parsed);
    if (!move) break;
    pvSan.push(move.san);
  }

  return {
    firstSan: pvSan[0] ?? pvMoves[0] ?? "",
    pvSan,
  };
}

function parseInfoLine(line: string): ParsedInfoLine | null {
  if (!line.startsWith("info ")) return null;
  if (!line.includes(" multipv ") || !line.includes(" pv ")) return null;

  const rankMatch = line.match(/\bmultipv\s+(\d+)\b/);
  if (!rankMatch) return null;

  const rank = Number.parseInt(rankMatch[1], 10);
  if (!Number.isFinite(rank) || rank <= 0) return null;

  const scoreMatch = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)\b/);
  const pvPart = line.split(" pv ")[1];
  if (!pvPart) return null;
  const pvMoves = pvPart
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);

  if (!pvMoves.length) return null;

  return {
    rank,
    scoreType: scoreMatch?.[1] as ScoreType | undefined,
    scoreValue: scoreMatch
      ? Number.parseInt(scoreMatch[2], 10)
      : undefined,
    pvMoves,
  };
}

export function usePositionTopMoves(
  fen: string,
  options: UsePositionTopMovesOptions = {},
) {
  const enabled = options.enabled ?? true;
  const multiPv = Math.max(1, Math.min(5, options.multiPv ?? 5));
  const depth = Math.max(8, Math.min(20, options.depth ?? 14));
  const timeoutMs = Math.max(800, options.timeoutMs ?? 2200);

  const [topMoves, setTopMoves] = useState<EngineTopMove[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedFen = useMemo(() => normalizeFen(fen), [fen]);

  useEffect(() => {
    if (!enabled) {
      setTopMoves([]);
      setError(null);
      setIsAnalyzing(false);
      return;
    }

    if (!normalizedFen) {
      setTopMoves([]);
      setError("Invalid position");
      setIsAnalyzing(false);
      return;
    }

    const worker = createStockfishWorker();
    if (!worker) {
      setTopMoves([]);
      setError("Engine unavailable");
      setIsAnalyzing(false);
      return;
    }

    let disposed = false;
    const linesByRank = new Map<number, EngineTopMove>();

    const stopWorker = () => {
      try {
        worker.postMessage("stop");
      } catch {}
      try {
        worker.postMessage("quit");
      } catch {}
      worker.terminate();
    };

    const publishMoves = () => {
      if (disposed) return;
      const sorted = Array.from(linesByRank.values())
        .sort((a, b) => a.rank - b.rank)
        .slice(0, multiPv);
      setTopMoves(sorted);
    };

    const finishAnalysis = () => {
      if (disposed) return;
      setIsAnalyzing(false);
      publishMoves();
      stopWorker();
    };

    setIsAnalyzing(true);
    setError(null);

    const timeout = window.setTimeout(() => {
      finishAnalysis();
    }, timeoutMs);

    worker.onmessage = (event) => {
      if (disposed) return;
      const line = typeof event.data === "string" ? event.data : "";
      if (!line) return;

      const parsed = parseInfoLine(line);
      if (parsed && parsed.rank <= multiPv) {
        const firstUci = parsed.pvMoves[0];
        const { firstSan, pvSan } = uciPvToSan(
          normalizedFen,
          parsed.pvMoves.slice(0, 8),
        );
        linesByRank.set(parsed.rank, {
          rank: parsed.rank,
          uci: firstUci,
          san: firstSan,
          pvSan,
          scoreCp: parsed.scoreType === "cp" ? parsed.scoreValue : undefined,
          scoreMate: parsed.scoreType === "mate" ? parsed.scoreValue : undefined,
        });
        publishMoves();
      }

      if (line.startsWith("bestmove")) {
        clearTimeout(timeout);
        finishAnalysis();
      }
    };

    worker.onerror = () => {
      if (disposed) return;
      clearTimeout(timeout);
      setTopMoves([]);
      setError("Engine analysis failed");
      setIsAnalyzing(false);
      stopWorker();
    };

    worker.postMessage("uci");
    worker.postMessage("isready");
    worker.postMessage("setoption name Threads value 1");
    worker.postMessage(`setoption name MultiPV value ${multiPv}`);
    worker.postMessage(`position fen ${normalizedFen}`);
    worker.postMessage(`go depth ${depth}`);

    return () => {
      disposed = true;
      clearTimeout(timeout);
      stopWorker();
    };
  }, [normalizedFen, enabled, multiPv, depth, timeoutMs]);

  return {
    topMoves,
    isAnalyzing,
    error,
  };
}
