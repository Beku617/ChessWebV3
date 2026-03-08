import { useState, useEffect } from "react";
import { GameHistory } from "../../historyTypes";
import { AnalysisEntry } from "../useGameReplayTypes";

const STOCKFISH_WORKER_URL =
  "https://cdn.jsdelivr.net/npm/stockfish@16/stockfish.js";

/**
 * Hook to run Stockfish analysis on positions when no analysis is provided
 */
export function useStockfishAnalysis(game: GameHistory, positions: string[]) {
  const [analysis, setAnalysis] = useState<AnalysisEntry[]>(
    game.analysis || [],
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);

  // Sync external analysis if present
  useEffect(() => {
    if (game.analysis && game.analysis.length > 0) {
      setAnalysis(game.analysis);
      setIsAnalyzing(false);
      setAnalysisProgress(100);
    }
  }, [game]);

  // Compute evaluations locally when none provided
  useEffect(() => {
    if ((game.analysis && game.analysis.length > 0) || positions.length === 0) {
      return;
    }

    let cancelled = false;
    let idx = 0;
    const totalPositions = positions.length;
    setIsAnalyzing(true);
    setAnalysisProgress(0);

    const worker =
      typeof Worker !== "undefined" ? new Worker(STOCKFISH_WORKER_URL) : null;
    if (!worker) {
      setIsAnalyzing(false);
      return;
    }

    worker.postMessage("uci");
    worker.postMessage("isready");
    worker.postMessage("setoption name Threads value 1");

    const evalNext = () => {
      if (cancelled || idx >= positions.length) {
        worker.postMessage("quit");
        worker.terminate();
        setIsAnalyzing(false);
        setAnalysisProgress(100);
        return;
      }

      setAnalysisProgress(Math.round((idx / totalPositions) * 100));

      const fen = positions[idx];
      const plyIndex = idx;
      let best: AnalysisEntry | null = null;

      worker.onmessage = (e) => {
        const line = typeof e.data === "string" ? e.data : "";
        const match = line.match(/score (cp|mate) (-?\d+)/);
        if (match) {
          const type = match[1];
          const raw = parseInt(match[2], 10);
          const sideToMove = fen.split(" ")[1] === "b" ? -1 : 1;
          if (type === "cp") {
            best = { ply: plyIndex, cp: raw * sideToMove };
          } else {
            best = { ply: plyIndex, mate: raw * sideToMove };
          }
        }

        const bestMoveMatch = line.match(/^bestmove\s+(\S+)/);
        if (bestMoveMatch) {
          const bestMoveUci = bestMoveMatch[1];
          if (best) {
            best.bestMove = bestMoveUci;
            setAnalysis((prev) => {
              if (prev.some((a) => a.ply === best!.ply)) return prev;
              return [...prev, best!].sort((a, b) => a.ply - b.ply);
            });
          }
          idx += 1;
          evalNext();
        }
      };

      worker.postMessage(`position fen ${fen}`);
      worker.postMessage("go depth 12");
    };

    evalNext();

    return () => {
      cancelled = true;
      worker.postMessage("quit");
      worker.terminate();
    };
  }, [game.analysis, positions]);

  return { analysis, isAnalyzing, analysisProgress };
}
