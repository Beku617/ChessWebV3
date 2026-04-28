import { useEffect, useMemo, useState } from "react";
import {
  OpeningMatch,
  detectOpeningFromSan,
  fetchLichessOpening,
  sanToUci,
} from "../utils/openingExplorer";

type UseOpeningExplorerOptions = {
  enableRemote?: boolean;
};

export function useOpeningExplorer(
  moves: string[],
  options: UseOpeningExplorerOptions = {},
) {
  const [opening, setOpening] = useState<OpeningMatch | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const local = useMemo(() => detectOpeningFromSan(moves), [moves]);

  // Always prefer a local match first for instant feedback
  useEffect(() => {
    if (moves.length === 0) {
      setOpening(null);
      return;
    }
    setOpening(local || null);
  }, [local, moves.length]);

  // Optional remote lookup (Lichess Masters explorer) for full coverage
  useEffect(() => {
    if (!options.enableRemote) return;
    if (moves.length === 0) {
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setIsLoading(true);
        setError(null);
        const uciMoves = sanToUci(moves);
        const remote = await fetchLichessOpening(uciMoves, controller.signal);
        if (
          remote &&
          (!local || remote.matchedMoves >= (local?.matchedMoves || 0))
        ) {
          setOpening(remote);
        } else if (!local) {
          setOpening(null);
        }
      } catch (err) {
        setError("Opening lookup failed");
      } finally {
        setIsLoading(false);
      }
    }, 200);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [moves, options.enableRemote, local]);

  return {
    opening,
    isLoading,
    error,
  };
}
