import { useCallback, useEffect, useState } from "react";
import { API_URL } from "./useStockfishGameTypes";

export type RatingPool = "bullet" | "blitz" | "rapid" | "classical";
export type RatingRange = "7d" | "30d" | "90d" | "1y" | "all";

export interface RatingTimelinePoint {
  ts: string;
  rating: number;
  delta: number;
  rd?: number;
  volatility?: number;
  result: "W" | "L" | "D";
  isProvisional: boolean;
  poolGames: number;
}

export interface LeaderboardEntry {
  rank: number;
  id: string;
  name: string;
  avatar?: string;
  rating: number;
  games: number;
  isProvisional: boolean;
}

interface RatingTimelineOptions {
  enabled?: boolean;
}

export function useRatingTimeline(
  pool: RatingPool,
  range: RatingRange,
  options?: RatingTimelineOptions,
) {
  const enabled = options?.enabled ?? true;
  const [points, setPoints] = useState<RatingTimelinePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setPoints([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({ pool, range });
        const res = await fetch(`${API_URL}/api/ratings/timeline?${params}`, {
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error("Failed to load rating timeline");
        }
        const data = await res.json();
        if (!cancelled) {
          setPoints(Array.isArray(data.points) ? data.points : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load timeline",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [pool, range, enabled]);

  return { points, loading, error };
}

export function useLeaderboard(pool: RatingPool, limit = 10) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        pool,
        limit: String(limit),
      });
      const res = await fetch(`${API_URL}/api/ratings/leaderboard?${params}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to load leaderboard");
      }
      const data = await res.json();
      setEntries(Array.isArray(data.leaderboard) ? data.leaderboard : []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load leaderboard",
      );
    } finally {
      setLoading(false);
    }
  }, [pool, limit]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { entries, loading, error, refetch };
}
