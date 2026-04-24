import { useCallback, useEffect, useState } from "react";
import {
  API_URL,
  AdminGame,
  AdminGameStats,
  AdminGamesResponse,
  AdminUserOption,
  GameFormData,
} from "./types";
import { MIN_STORED_MOVES } from "../../hooks/gameHistorySaver/historyPersistence";

interface UseAdminGamesOptions {
  enabled: boolean;
}

interface PaginationState {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const RESULT_TOKENS = new Set(["1-0", "0-1", "1/2-1/2", "*"]);
const MAX_ADMIN_GAMES_FETCH = 5000;

function parseMovesText(text: string): string[] {
  return String(text || "")
    .replace(/\r?\n/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !/^\d+\.+$/.test(token))
    .filter((token) => !/^\d+\.\.\.$/.test(token))
    .filter((token) => !RESULT_TOKENS.has(token));
}

function toOptionalNumber(value: number | ""): number | undefined {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formToPayload(
  form: GameFormData,
  { includeMoves = true }: { includeMoves?: boolean } = {},
) {
  return {
    userId: form.userId.trim(),
    event: form.event.trim() || "NeonGambit Game",
    site: form.site.trim() || "NeonGambit",
    date: form.date.trim(),
    white: form.white.trim(),
    black: form.black.trim(),
    result: form.result.trim(),
    variant: form.variant,
    playAs: form.playAs,
    rated: form.rated,
    timeControl: form.timeControl.trim(),
    whiteElo: toOptionalNumber(form.whiteElo),
    blackElo: toOptionalNumber(form.blackElo),
    opponent: form.opponent.trim(),
    opponentLevel: toOptionalNumber(form.opponentLevel),
    termination: form.termination.trim(),
    moveText: form.moveText.trim(),
    pgn: form.pgn.trim(),
    ...(includeMoves ? { moves: parseMovesText(form.movesText) } : {}),
  };
}

export function useAdminGames({ enabled }: UseAdminGamesOptions) {
  const [allGames, setAllGames] = useState<AdminGame[]>([]);
  const [games, setGames] = useState<AdminGame[]>([]);
  const [stats, setStats] = useState<AdminGameStats | null>(null);
  const [users, setUsers] = useState<AdminUserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    limit: 20,
    total: 0,
    pages: 1,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [variantFilter, setVariantFilter] = useState("");
  const [resultFilter, setResultFilter] = useState("");
  const [ratedFilter, setRatedFilter] = useState("");

  const fetchGames = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        limit: String(MAX_ADMIN_GAMES_FETCH),
        skip: "0",
        sortBy: "createdAt",
        sortOrder: "desc",
      });

      const res = await fetch(`${API_URL}/api/admin/games?${params.toString()}`, {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to fetch games");
      }

      const data: AdminGamesResponse = await res.json();
      setAllGames(data.games || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch games");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const fetchStats = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/games/stats`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error("Failed to fetch admin game stats:", err);
    }
  }, [enabled]);

  const fetchUsers = useCallback(async () => {
    if (!enabled) return;
    try {
      const params = new URLSearchParams({
        limit: "200",
        skip: "0",
      });
      const res = await fetch(`${API_URL}/api/admin/users?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err) {
      console.error("Failed to fetch admin users:", err);
    }
  }, [enabled]);

  useEffect(() => {
    fetchGames();
  }, [fetchGames]);

  useEffect(() => {
    if (!enabled) {
      setGames([]);
      setPagination((prev) =>
        prev.page === 1 && prev.total === 0 && prev.pages === 1
          ? prev
          : { ...prev, page: 1, total: 0, pages: 1 },
      );
      return;
    }

    const normalizedSearch = searchQuery.trim().toLowerCase();

    const filtered = allGames.filter((game) => {
      const variant = String(game.variant || "standard").trim().toLowerCase();
      const isRated = game.rated === true;

      if (variantFilter && variant !== variantFilter) return false;
      if (resultFilter && String(game.result || "") !== resultFilter) return false;
      if (ratedFilter === "true" && !isRated) return false;
      if (ratedFilter === "false" && isRated) return false;

      if (normalizedSearch) {
        const ownerName =
          typeof game.userId === "string" ? "" : String(game.userId?.fullName || "");
        const ownerEmail =
          typeof game.userId === "string" ? "" : String(game.userId?.email || "");
        const haystack = [
          game._id,
          game.white,
          game.black,
          game.event,
          game.opponent,
          game.eco,
          game.termination,
          game.timeControl,
          game.result,
          variant,
          ownerName,
          ownerEmail,
        ]
          .map((value) => String(value || "").toLowerCase())
          .join(" ");

        if (!haystack.includes(normalizedSearch)) return false;
      }

      return true;
    });

    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / pagination.limit));
    const safePage = Math.min(Math.max(1, pagination.page), pages);
    const start = (safePage - 1) * pagination.limit;
    const end = start + pagination.limit;
    setGames(filtered.slice(start, end));

    setPagination((prev) => {
      if (
        prev.page === safePage &&
        prev.total === total &&
        prev.pages === pages
      ) {
        return prev;
      }
      return { ...prev, page: safePage, total, pages };
    });
  }, [
    enabled,
    allGames,
    searchQuery,
    variantFilter,
    resultFilter,
    ratedFilter,
    pagination.page,
    pagination.limit,
  ]);

  useEffect(() => {
    fetchStats();
    fetchUsers();
  }, [fetchStats, fetchUsers]);

  const createGame = useCallback(
    async (formData: GameFormData): Promise<AdminGame> => {
      const payload = formToPayload(formData);
      if ((payload.moves?.length || 0) < MIN_STORED_MOVES) {
        throw new Error(
          `Games must have at least ${MIN_STORED_MOVES} moves to be saved`,
        );
      }
      const res = await fetch(`${API_URL}/api/admin/games`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create game");
      }

      const data = await res.json();
      await Promise.all([fetchGames(), fetchStats()]);
      return data.game;
    },
    [fetchGames, fetchStats],
  );

  const updateGame = useCallback(
    async (id: string, formData: GameFormData): Promise<AdminGame> => {
      const includeMoves = formData.movesText.trim().length > 0;
      const payload = formToPayload(formData, { includeMoves });
      if (
        payload.moves !== undefined &&
        payload.moves.length < MIN_STORED_MOVES
      ) {
        throw new Error(
          `Games must have at least ${MIN_STORED_MOVES} moves to be saved`,
        );
      }
      const res = await fetch(`${API_URL}/api/admin/games/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update game");
      }

      const data = await res.json();
      await Promise.all([fetchGames(), fetchStats()]);
      return data.game;
    },
    [fetchGames, fetchStats],
  );

  const deleteGame = useCallback(
    async (id: string): Promise<void> => {
      const res = await fetch(`${API_URL}/api/admin/games/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete game");
      }

      await Promise.all([fetchGames(), fetchStats()]);
    },
    [fetchGames, fetchStats],
  );

  const exportGames = useCallback(async () => {
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set("search", searchQuery.trim());
    if (variantFilter) params.set("variant", variantFilter);
    if (resultFilter) params.set("result", resultFilter);
    if (ratedFilter) params.set("rated", ratedFilter);

    const res = await fetch(
      `${API_URL}/api/admin/games/export/csv?${params.toString()}`,
      { credentials: "include" },
    );

    if (!res.ok) {
      throw new Error("Failed to export games");
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "games-export.csv";
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, [searchQuery, variantFilter, resultFilter, ratedFilter]);

  const setPage = (page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  };

  return {
    games,
    stats,
    users,
    loading,
    error,
    pagination,
    searchQuery,
    setSearchQuery,
    variantFilter,
    setVariantFilter,
    resultFilter,
    setResultFilter,
    ratedFilter,
    setRatedFilter,
    setPage,
    fetchGames,
    createGame,
    updateGame,
    deleteGame,
    exportGames,
  };
}
