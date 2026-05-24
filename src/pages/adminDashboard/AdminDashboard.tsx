import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { useAdminStore } from "../../store/adminStore";
import AdminSidebar from "../../components/AdminSidebar";
import { User, Stats, API_URL, LIMIT } from "./types";
import { DashboardStats } from "./DashboardStats";
import { DashboardUsersTable } from "./DashboardUsersTable";

export default function AdminDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, checkAuth } = useAdminStore();

  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [isAuthenticated, isLoading, navigate]);

  // Fetch stats
  useEffect(() => {
    if (!isAuthenticated) return;

    setLoadingStats(true);
    setStatsError(null);

    fetch(`${API_URL}/api/admin/stats`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) {
          throw new Error(t("admin.dashboard.errors.loadStats"));
        }
        return res.json();
      })
      .then((data) => setStats(data))
      .catch((err) => {
        console.error(err);
        setStats(null);
        setStatsError(
          err instanceof Error
            ? err.message
            : t("admin.dashboard.errors.loadStats"),
        );
      })
      .finally(() => setLoadingStats(false));
  }, [isAuthenticated, t]);

  // Fetch users
  useEffect(() => {
    if (!isAuthenticated) return;

    setLoadingUsers(true);
    const params = new URLSearchParams({
      limit: String(LIMIT),
      skip: String(page * LIMIT),
      search: searchQuery,
    });

    fetch(`${API_URL}/api/admin/users?${params}`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        setUsers(data.users || []);
        setTotalUsers(data.total || 0);
      })
      .catch(console.error)
      .finally(() => setLoadingUsers(false));
  }, [isAuthenticated, page, searchQuery]);

  const handleDeleteUser = async (userId: string) => {
    setDeleting(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${userId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u._id !== userId));
        setTotalUsers((prev) => prev - 1);
        if (stats) {
          setStats({ ...stats, totalUsers: stats.totalUsers - 1 });
        }
      }
    } catch (err) {
      console.error("Delete error:", err);
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 text-gray-900 dark:text-white">
      <AdminSidebar />

      <main className="ml-72 p-8">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold">{t("admin.dashboard.pageTitle")}</h1>
        </div>

        {/* Stats */}
        <DashboardStats
          stats={stats}
          isLoading={loadingStats}
          error={statsError}
        />

        {/* Users Table */}
        <DashboardUsersTable
          users={users}
          totalUsers={totalUsers}
          page={page}
          searchQuery={searchQuery}
          loadingUsers={loadingUsers}
          deleteConfirm={deleteConfirm}
          deleting={deleting}
          onSearchChange={(value) => {
            setSearchQuery(value);
            setPage(0);
          }}
          onPageChange={setPage}
          onDeleteClick={setDeleteConfirm}
          onDeleteConfirm={handleDeleteUser}
          onDeleteCancel={() => setDeleteConfirm(null)}
        />
      </main>
    </div>
  );
}

