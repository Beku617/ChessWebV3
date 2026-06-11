import { useState, useEffect, useCallback } from "react";
import type {
  BotData,
  BotFormData,
  BotStats,
  BotsResponse,
  DEFAULT_BOT_FORM,
} from "./types";

const API_URL = import.meta.env.VITE_API_URL;

export function useAdminBots() {
  const [bots, setBots] = useState<BotData[]>([]);
  const [stats, setStats] = useState<BotStats | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0,
  });

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");

  const fetchBots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });
      if (searchQuery) params.set("search", searchQuery);
      if (difficultyFilter) params.set("difficulty", difficultyFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      if (activeFilter) params.set("isActive", activeFilter);

      const res = await fetch(`${API_URL}/api/admin/bots?${params}`, {
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to fetch bots");

      const data: BotsResponse = await res.json();
      setBots(data.bots);
      setPagination(data.pagination);
      setCategories(data.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch bots");
    } finally {
      setLoading(false);
    }
  }, [
    pagination.page,
    pagination.limit,
    searchQuery,
    difficultyFilter,
    categoryFilter,
    activeFilter,
  ]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/bots/stats`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch bot stats:", err);
    }
  }, []);

  useEffect(() => {
    fetchBots();
    fetchStats();
  }, [fetchBots, fetchStats]);

  const createBot = async (formData: BotFormData): Promise<BotData> => {
    const data = new FormData();
    Object.entries(formData).forEach(([key, value]) => {
      if (key === "avatarFile" && value) {
        data.append("avatarFile", value as File);
      } else if (value !== null && value !== undefined) {
        data.append(key, String(value));
      }
    });

    const res = await fetch(`${API_URL}/api/admin/bots`, {
      method: "POST",
      credentials: "include",
      body: data,
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to create bot");
    }

    const newBot = await res.json();
    await fetchBots();
    await fetchStats();
    return newBot;
  };

  const updateBot = async (
    id: string,
    formData: Partial<BotFormData>,
  ): Promise<BotData> => {
    const data = new FormData();
    Object.entries(formData).forEach(([key, value]) => {
      if (key === "avatarFile" && value) {
        data.append("avatarFile", value as File);
      } else if (value !== null && value !== undefined) {
        data.append(key, String(value));
      }
    });

    const res = await fetch(`${API_URL}/api/admin/bots/${id}`, {
      method: "PUT",
      credentials: "include",
      body: data,
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to update bot");
    }

    const updatedBot = await res.json();
    await fetchBots();
    await fetchStats();
    return updatedBot;
  };

  const deleteBot = async (id: string): Promise<void> => {
    const res = await fetch(`${API_URL}/api/admin/bots/${id}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to delete bot");
    }

    await fetchBots();
    await fetchStats();
  };

  const bulkUpdate = async (
    botIds: string[],
    action: "activate" | "deactivate",
  ): Promise<void> => {
    const res = await fetch(`${API_URL}/api/admin/bots/bulk-update`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ botIds, action }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to update bots");
    }

    await fetchBots();
    await fetchStats();
  };

  const toggleBotActive = async (bot: BotData): Promise<void> => {
    await updateBot(bot._id, { isActive: !bot.isActive });
  };

  const exportBots = async (): Promise<void> => {
    const res = await fetch(`${API_URL}/api/admin/bots/export/csv`, {
      credentials: "include",
    });

    if (!res.ok) throw new Error("Failed to export bots");

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bots-export.csv";
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const setPage = (page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  };

  return {
    bots,
    stats,
    categories,
    loading,
    error,
    pagination,
    searchQuery,
    setSearchQuery,
    difficultyFilter,
    setDifficultyFilter,
    categoryFilter,
    setCategoryFilter,
    activeFilter,
    setActiveFilter,
    setPage,
    fetchBots,
    createBot,
    updateBot,
    deleteBot,
    bulkUpdate,
    toggleBotActive,
    exportBots,
  };
}
