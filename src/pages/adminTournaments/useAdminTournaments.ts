import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  API_URL,
  AdminTournamentDetailResponse,
  AdminTournamentListResponse,
  AdminTournamentOrganizer,
  AdminTournamentPagination,
  AdminTournamentStats,
  AdminTournamentSummary,
  buildTournamentPayload,
  TournamentFormData,
  TournamentSortMode,
  TournamentStatus,
  TournamentType,
} from "./types";

interface UseAdminTournamentsOptions {
  enabled: boolean;
}

const ADMIN_TOURNAMENT_REQUEST_TIMEOUT_MS = 10000;

function createTimeoutSignal(timeoutMs: number) {
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
    return AbortSignal.timeout(timeoutMs);
  }

  const controller = new AbortController();
  window.setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

function adminFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetch(input, {
    ...init,
    signal: init.signal || createTimeoutSignal(ADMIN_TOURNAMENT_REQUEST_TIMEOUT_MS),
  });
}

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

export function useAdminTournaments({
  enabled,
}: UseAdminTournamentsOptions) {
  const { t } = useTranslation();
  const [pagination, setPagination] = useState<AdminTournamentPagination>({
    page: 1,
    limit: 12,
    total: 0,
    pages: 1,
  });
  const [tournaments, setTournaments] = useState<AdminTournamentSummary[]>([]);
  const [stats, setStats] = useState<AdminTournamentStats | null>(null);
  const [users, setUsers] = useState<AdminTournamentOrganizer[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<AdminTournamentDetailResponse | null>(
    null,
  );
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | TournamentType>("");
  const [statusFilter, setStatusFilter] = useState<"" | TournamentStatus>("");
  const [sortMode, setSortMode] = useState<TournamentSortMode>("newest");

  const fetchTournaments = useCallback(async () => {
    if (!enabled) return;
    setLoadingList(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (typeFilter) params.set("type", typeFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (sortMode) params.set("sort", sortMode);
      params.set("page", String(pagination.page));
      params.set("limit", String(pagination.limit));

      const response = await adminFetch(
        `${API_URL}/api/admin/tournaments?${params.toString()}`,
        {
          credentials: "include",
        },
      );
      const data = (await readJson(response)) as Partial<AdminTournamentListResponse> & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error ||
            t(
              "adminTournaments.errors.fetchTournaments",
              "Failed to fetch tournaments",
            ),
        );
      }

      const nextTournaments = data.tournaments || [];
      setTournaments(nextTournaments);
      setStats(data.stats || null);
      setPagination((current) => ({
        page: data.pagination?.page || current.page,
        limit: data.pagination?.limit || current.limit,
        total: data.pagination?.total || 0,
        pages: data.pagination?.pages || 1,
      }));
      setSelectedId((current) => {
        if (!nextTournaments.length) return "";
        if (current && nextTournaments.some((item) => item.id === current)) {
          return current;
        }
        return nextTournaments[0].id;
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t(
              "adminTournaments.errors.fetchTournaments",
              "Failed to fetch tournaments",
            ),
      );
      setPagination((current) => ({
        ...current,
        total: 0,
        pages: 1,
      }));
    } finally {
      setLoadingList(false);
    }
  }, [
    enabled,
    pagination.limit,
    pagination.page,
    searchQuery,
    sortMode,
    statusFilter,
    t,
    typeFilter,
  ]);

  const fetchUsers = useCallback(async () => {
    if (!enabled) return;
    setLoadingUsers(true);

    try {
      const params = new URLSearchParams({
        limit: "200",
        skip: "0",
        sortBy: "createdAt",
        sortOrder: "desc",
      });
      const response = await adminFetch(`${API_URL}/api/admin/users?${params.toString()}`, {
        credentials: "include",
      });
      const data = (await readJson(response)) as {
        users?: Array<{
          _id: string;
          fullName: string;
          email: string;
          avatar?: string;
        }>;
      };
      if (!response.ok) return;
      setUsers(data.users || []);
    } catch (err) {
      console.error("Failed to fetch organizer options:", err);
    } finally {
      setLoadingUsers(false);
    }
  }, [enabled]);

  const fetchDetail = useCallback(
    async (tournamentId: string) => {
      if (!enabled || !tournamentId) {
        setDetail(null);
        return;
      }
      setLoadingDetail(true);

      try {
        const response = await adminFetch(
          `${API_URL}/api/admin/tournaments/${tournamentId}`,
          {
            credentials: "include",
          },
        );
        const data = (await readJson(response)) as Partial<AdminTournamentDetailResponse> & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(
            data.error ||
              t(
                "adminTournaments.errors.fetchTournamentDetail",
                "Failed to fetch tournament detail",
              ),
          );
        }

        setDetail(data as AdminTournamentDetailResponse);
      } catch (err) {
        setDetail(null);
        setError(
          err instanceof Error
            ? err.message
            : t(
                "adminTournaments.errors.fetchTournamentDetail",
                "Failed to fetch tournament detail",
              ),
        );
      } finally {
        setLoadingDetail(false);
      }
    },
    [enabled, t],
  );

  useEffect(() => {
    if (!enabled) {
      setTournaments([]);
      setStats(null);
      setUsers([]);
      setSelectedId("");
      setDetail(null);
      setPagination((current) => ({
        ...current,
        page: 1,
        total: 0,
        pages: 1,
      }));
      return;
    }

    void fetchUsers();
  }, [enabled, fetchUsers]);

  useEffect(() => {
    if (!enabled) return;

    const timer = window.setTimeout(() => {
      void fetchTournaments();
    }, 200);

    return () => window.clearTimeout(timer);
  }, [enabled, fetchTournaments]);

  useEffect(() => {
    if (!enabled || !selectedId) {
      setDetail(null);
      return;
    }

    void fetchDetail(selectedId);
  }, [enabled, fetchDetail, selectedId]);

  const createTournament = useCallback(
    async (formData: TournamentFormData) => {
      const response = await adminFetch(`${API_URL}/api/admin/tournaments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(buildTournamentPayload(formData)),
      });
      const data = (await readJson(response)) as Partial<AdminTournamentDetailResponse> & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error ||
            t(
              "adminTournaments.errors.createTournament",
              "Failed to create tournament",
            ),
        );
      }

      const detailResponse = data as AdminTournamentDetailResponse;
      setSelectedId(detailResponse.tournament.id);
      setDetail(detailResponse);
      await fetchTournaments();
      return detailResponse;
    },
    [fetchTournaments, t],
  );

  const updateTournament = useCallback(
    async (tournamentId: string, formData: TournamentFormData) => {
      const response = await adminFetch(`${API_URL}/api/admin/tournaments/${tournamentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(buildTournamentPayload(formData)),
      });
      const data = (await readJson(response)) as Partial<AdminTournamentDetailResponse> & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error ||
            t(
              "adminTournaments.errors.updateTournament",
              "Failed to update tournament",
            ),
        );
      }

      const detailResponse = data as AdminTournamentDetailResponse;
      setSelectedId(detailResponse.tournament.id);
      setDetail(detailResponse);
      await fetchTournaments();
      return detailResponse;
    },
    [fetchTournaments, t],
  );

  const deleteTournament = useCallback(
    async (tournamentId: string) => {
      const response = await adminFetch(`${API_URL}/api/admin/tournaments/${tournamentId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await readJson(response)) as { error?: string };

      if (!response.ok) {
        throw new Error(
          data.error ||
            t(
              "adminTournaments.errors.deleteTournament",
              "Failed to delete tournament",
            ),
        );
      }

      if (selectedId === tournamentId) {
        setSelectedId("");
        setDetail(null);
      }
      await fetchTournaments();
    },
    [fetchTournaments, selectedId, t],
  );

  const runTournamentAction = useCallback(
    async (tournamentId: string, action: string) => {
      const response = await adminFetch(
        `${API_URL}/api/admin/tournaments/${tournamentId}/state`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action }),
        },
      );
      const data = (await readJson(response)) as Partial<AdminTournamentDetailResponse> & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error ||
            t(
              "adminTournaments.errors.updateTournamentState",
              "Failed to update tournament state",
            ),
        );
      }

      const detailResponse = data as AdminTournamentDetailResponse;
      setDetail(detailResponse);
      setSelectedId(detailResponse.tournament.id);
      await fetchTournaments();
      return detailResponse;
    },
    [fetchTournaments, t],
  );

  const closeCurrentRound = useCallback(
    async (tournamentId: string, roundNumber: number) => {
      const response = await adminFetch(
        `${API_URL}/api/admin/tournaments/${tournamentId}/rounds/${roundNumber}/close`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      const data = (await readJson(response)) as Partial<AdminTournamentDetailResponse> & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error ||
            t("adminTournaments.errors.closeRound", "Failed to close round"),
        );
      }

      const detailResponse = data as AdminTournamentDetailResponse;
      setDetail(detailResponse);
      setSelectedId(detailResponse.tournament.id);
      await fetchTournaments();
      return detailResponse;
    },
    [fetchTournaments, t],
  );

  return {
    tournaments,
    stats,
    users,
    pagination,
    selectedId,
    detail,
    loadingList,
    loadingDetail,
    loadingUsers,
    error,
    searchQuery,
    typeFilter,
    statusFilter,
    sortMode,
    setPage: (page: number) =>
      setPagination((current) => ({
        ...current,
        page: Math.max(1, page),
      })),
    setSelectedId,
    setSearchQuery,
    setTypeFilter,
    setStatusFilter,
    setSortMode,
    fetchTournaments,
    fetchDetail,
    createTournament,
    updateTournament,
    deleteTournament,
    runTournamentAction,
    closeCurrentRound,
  };
}
