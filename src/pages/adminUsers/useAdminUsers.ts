import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminStore } from "../../store/adminStore";
import {
  User,
  UserStats,
  SortField,
  SortOrder,
  API_URL,
  LIMIT,
} from "./types";

const EMPTY_STATS: UserStats = {
  totalUsers: 0,
  totalGames: 0,
  newUsersThisWeek: 0,
  bannedUsers: 0,
  topRating: 0,
};

function resolveAccountStatus(user: User): "offline" | "active" | "playing" {
  if (user.accountStatus === "offline" || user.accountStatus === "active" || user.accountStatus === "playing") {
    return user.accountStatus;
  }
  if (user.presenceStatus === "in_game") return "playing";
  if (user.presenceStatus === "offline") return "offline";
  return "active";
}

export function useAdminUsers() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, checkAuth } = useAdminStore();

  const [users, setUsers] = useState<User[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [stats, setStats] = useState<UserStats>(EMPTY_STATS);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [banConfirm, setBanConfirm] = useState<string | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banning, setBanning] = useState(false);
  const [sortBy, setSortBy] = useState<SortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [isAuthenticated, isLoading, navigate]);

  // Fetch users
  useEffect(() => {
    if (!isAuthenticated) return;

    setLoadingUsers(true);
    const params = new URLSearchParams({
      limit: String(LIMIT),
      skip: String(page * LIMIT),
      search: searchQuery,
      sortBy,
      sortOrder,
    });

    fetch(`${API_URL}/api/admin/users?${params}`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        setUsers(data.users || []);
        setTotalUsers(data.total || 0);
        setStats({
          totalUsers: data.stats?.totalUsers ?? data.total ?? 0,
          totalGames: data.stats?.totalGames ?? 0,
          newUsersThisWeek: data.stats?.newUsersThisWeek ?? 0,
          bannedUsers: data.stats?.bannedUsers ?? 0,
          topRating: data.stats?.topRating ?? 0,
        });
      })
      .catch(console.error)
      .finally(() => setLoadingUsers(false));
  }, [isAuthenticated, page, searchQuery, sortBy, sortOrder]);

  const handleDeleteUser = useCallback(
    async (userId: string) => {
      const userToDelete = users.find((user) => user._id === userId);
      const isPlaying = userToDelete && resolveAccountStatus(userToDelete) === "playing";
      if (
        isPlaying &&
        !window.confirm(
          "This user is currently in an active game. Their account will be deleted automatically when the match ends. Continue?",
        )
      ) {
        return;
      }

      setDeleting(true);
      try {
        const res = await fetch(`${API_URL}/api/admin/users/${userId}`, {
          method: "DELETE",
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));

        if (res.ok) {
          if (data?.pendingDeletion) {
            const nextBanned = Boolean(data?.user?.banned);
            setUsers((prev) =>
              prev.map((u) =>
                u._id === userId
                  ? {
                    ...u,
                    banned: nextBanned,
                    bannedAt: data?.user?.bannedAt ?? u.bannedAt,
                    banReason: data?.user?.banReason ?? u.banReason,
                    pendingDeletion: true,
                  }
                  : u,
              ),
            );
            setStats((prev) => ({
              ...prev,
              bannedUsers: nextBanned
                ? userToDelete?.banned
                  ? prev.bannedUsers
                  : prev.bannedUsers + 1
                : userToDelete?.banned
                  ? Math.max(0, prev.bannedUsers - 1)
                  : prev.bannedUsers,
            }));
          } else {
            setUsers((prev) => prev.filter((u) => u._id !== userId));
            setTotalUsers((prev) => Math.max(0, prev - 1));
            setStats((prev) => ({
              ...prev,
              totalUsers: Math.max(0, prev.totalUsers - 1),
              bannedUsers: userToDelete?.banned
                ? Math.max(0, prev.bannedUsers - 1)
                : prev.bannedUsers,
            }));
          }
        }
      } catch (err) {
        console.error("Delete error:", err);
      } finally {
        setDeleting(false);
        setDeleteConfirm(null);
      }
    },
    [users],
  );

  const handleBanUser = useCallback(
    async (userId: string, shouldBan: boolean, reason: string) => {
      const userToBan = users.find((user) => user._id === userId);
      const isPlaying = userToBan && resolveAccountStatus(userToBan) === "playing";
      if (
        shouldBan &&
        isPlaying &&
        !window.confirm(
          "This user is currently in an active game. Their account will be deleted automatically when the match ends. Continue?",
        )
      ) {
        return;
      }

      setBanning(true);
      try {
        const res = await fetch(`${API_URL}/api/admin/users/${userId}/ban`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ banned: shouldBan, reason }),
        });
        const data = await res.json().catch(() => ({}));

        if (res.ok) {
          if (data?.deleted) {
            setUsers((prev) => prev.filter((u) => u._id !== userId));
            setTotalUsers((prev) => Math.max(0, prev - 1));
            setStats((prev) => ({
              ...prev,
              totalUsers: Math.max(0, prev.totalUsers - 1),
              bannedUsers: userToBan?.banned
                ? Math.max(0, prev.bannedUsers - 1)
                : prev.bannedUsers,
            }));
          } else {
            const nextBanned = Boolean(data?.user?.banned ?? shouldBan);
            setUsers((prev) =>
              prev.map((u) =>
                u._id === userId
                  ? {
                    ...u,
                    banned: nextBanned,
                    bannedAt: data?.user?.bannedAt ?? (shouldBan ? new Date().toISOString() : undefined),
                    banReason: data?.user?.banReason ?? (shouldBan ? reason : ""),
                    pendingDeletion: data?.user?.pendingDeletion ?? false,
                  }
                  : u,
              ),
            );
            setStats((prev) => ({
              ...prev,
              bannedUsers: nextBanned
                ? userToBan?.banned
                  ? prev.bannedUsers
                  : prev.bannedUsers + 1
                : userToBan?.banned
                  ? Math.max(0, prev.bannedUsers - 1)
                  : prev.bannedUsers,
            }));
          }
        }
      } catch (err) {
        console.error("Ban error:", err);
      } finally {
        setBanning(false);
        setBanConfirm(null);
        setBanReason("");
      }
    },
    [],
  );

  const handleSort = useCallback((field: SortField) => {
    setSortBy((currentSortBy) => {
      if (currentSortBy === field) {
        setSortOrder((order) => (order === "asc" ? "desc" : "asc"));
        return currentSortBy;
      } else {
        setSortOrder("desc");
        return field;
      }
    });
    setPage(0);
  }, []);

  const exportUsers = useCallback(() => {
    const csv = [
      ["Name", "Email", "Rating", "Games Played", "Win Rate", "Joined"],
      ...users.map((u) => [
        u.fullName,
        u.email,
        u.rating,
        u.gamesPlayed,
        u.gamesPlayed > 0
          ? `${Math.round((u.gamesWon / u.gamesPlayed) * 100)}%`
          : "0%",
        new Date(u.createdAt).toLocaleDateString(),
      ]),
    ]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "users.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [users]);

  const totalPages = Math.ceil(totalUsers / LIMIT);

  return {
    // State
    users,
    totalUsers,
    stats,
    searchQuery,
    page,
    loadingUsers,
    deleteConfirm,
    deleting,
    banConfirm,
    banReason,
    banning,
    sortBy,
    sortOrder,
    isLoading,
    totalPages,
    // Setters
    setSearchQuery,
    setPage,
    setDeleteConfirm,
    setBanConfirm,
    setBanReason,
    // Actions
    handleDeleteUser,
    handleBanUser,
    handleSort,
    exportUsers,
  };
}
