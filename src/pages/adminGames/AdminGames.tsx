import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Gamepad2,
  Loader2,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import AdminSidebar from "../../components/AdminSidebar";
import { useAdminStore } from "../../store/adminStore";
import { DeleteGameModal } from "./DeleteGameModal";
import { GameFormModal } from "./GameFormModal";
import { useAdminGames } from "./useAdminGames";
import { AdminGame, GAME_RESULT_OPTIONS, GameFormData } from "./types";

function formatDate(value?: string): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function resultBadgeClass(result: string): string {
  if (result === "1-0") {
    return "bg-brand-500/10 text-brand-600 dark:text-brand-400";
  }
  if (result === "0-1") {
    return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
  }
  if (result === "1/2-1/2") {
    return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  }
  return "bg-gray-500/10 text-gray-600 dark:text-gray-400";
}

function variantBadgeClass(variant: string): string {
  return variant === "chess960"
    ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
    : "bg-slate-500/10 text-slate-600 dark:text-slate-300";
}

export default function AdminGames() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading, checkAuth } = useAdminStore();

  const {
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
    updateGame,
    deleteGame,
    exportGames,
  } = useAdminGames({ enabled: isAuthenticated });

  const [showFormModal, setShowFormModal] = useState(false);
  const [editingGame, setEditingGame] = useState<AdminGame | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminGame | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [authLoading, isAuthenticated, navigate]);

  const showNotification = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3200);
  };

  const handleEditClick = (game: AdminGame) => {
    setEditingGame(game);
    setShowFormModal(true);
  };

  const handleSubmitGame = async (formData: GameFormData) => {
    setSaving(true);
    try {
      if (editingGame) {
        await updateGame(editingGame._id, formData);
        showNotification("success", "Game updated successfully");
      } else {
        throw new Error("No game selected for editing");
      }
      setShowFormModal(false);
    } catch (err) {
      showNotification(
        "error",
        err instanceof Error ? err.message : "Failed to save game",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGame = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteGame(deleteTarget._id);
      setDeleteTarget(null);
      showNotification("success", "Game deleted successfully");
    } catch (err) {
      showNotification(
        "error",
        err instanceof Error ? err.message : "Failed to delete game",
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = async () => {
    try {
      await exportGames();
      showNotification("success", "Games exported successfully");
    } catch (err) {
      showNotification("error", "Failed to export games");
    }
  };

  const ratedPercent = useMemo(() => {
    if (!stats || stats.total <= 0) return 0;
    return Math.round((stats.rated / stats.total) * 100);
  }, [stats]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 text-gray-900 dark:text-white">
      <AdminSidebar />

      {notification && (
        <div
          className={`fixed top-5 right-5 z-[90] px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 ${
            notification.type === "success"
              ? "bg-brand-500 text-white"
              : "bg-red-500 text-white"
          }`}
        >
          {notification.type === "success" ? (
            <Check className="w-4 h-4" />
          ) : (
            <X className="w-4 h-4" />
          )}
          <span className="text-sm font-medium">{notification.message}</span>
        </div>
      )}

      <main className="ml-72 p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-7">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Gamepad2 className="w-8 h-8 text-brand-500" />
              Games Management
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Total Games
              </p>
              <p className="mt-1 text-2xl font-bold">{stats.total}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Rated</p>
              <p className="mt-1 text-2xl font-bold text-brand-600 dark:text-brand-400">
                {stats.rated}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {ratedPercent}% of all games
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Standard / 960
              </p>
              <p className="mt-1 text-2xl font-bold">
                {stats.byVariant.standard} / {stats.byVariant.chess960}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Last 24 Hours
              </p>
              <p className="mt-1 text-2xl font-bold text-brand-600 dark:text-brand-400">
                {stats.recent24h}
              </p>
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 mb-6">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[220px]">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search by players, event, ECO..."
                  className="w-full pl-10 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <select
              value={variantFilter}
              onChange={(e) => {
                setVariantFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">All Variants</option>
              <option value="standard">Standard</option>
              <option value="chess960">Chess960</option>
            </select>

            <select
              value={resultFilter}
              onChange={(e) => {
                setResultFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">All Results</option>
              {GAME_RESULT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.value}
                </option>
              ))}
            </select>

            <select
              value={ratedFilter}
              onChange={(e) => {
                setRatedFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">All Types</option>
              <option value="true">Rated</option>
              <option value="false">Casual</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          {loading ? (
            <div className="py-24 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
            </div>
          ) : games.length === 0 ? (
            <div className="py-20 text-center text-gray-500 dark:text-gray-400">
              <Gamepad2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>No games found with current filters.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Players
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Result
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Variant
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Owner
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Moves
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Created
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {games.map((game) => {
                  const owner =
                    typeof game.userId === "string" ? null : game.userId;

                  return (
                    <tr
                      key={game._id}
                      className="hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {game.white} vs {game.black}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {game.event || "NeonGambit Game"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${resultBadgeClass(
                            game.result,
                          )}`}
                        >
                          {game.result}
                        </span>
                        <span
                          className={`ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            game.rated
                              ? "bg-brand-500/10 text-brand-600 dark:text-brand-400"
                              : "bg-gray-500/10 text-gray-600 dark:text-gray-400"
                          }`}
                        >
                          {game.rated ? "Rated" : "Casual"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${variantBadgeClass(
                            game.variant,
                          )}`}
                        >
                          {game.variant || "standard"}
                        </span>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {game.timeControl || "-"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-900 dark:text-white">
                          {owner?.fullName || "Unknown"}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {owner?.email ||
                            (typeof game.userId === "string"
                              ? game.userId
                              : "")}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {Array.isArray(game.moves) ? game.moves.length : 0}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {formatDate(game.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => navigate(`/admin/analyze/${game._id}`)}
                            className="p-2 rounded-lg text-gray-500 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                            title="Analyze"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditClick(game)}
                            className="p-2 rounded-lg text-gray-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(game)}
                            className="p-2 rounded-lg text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {pagination.pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-800">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
                {Math.min(pagination.page * pagination.limit, pagination.total)}{" "}
                of {pagination.total} games
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="p-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Page {pagination.page} of {pagination.pages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(pagination.page + 1)}
                  disabled={pagination.page >= pagination.pages}
                  className="p-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <GameFormModal
        isOpen={showFormModal}
        onClose={() => setShowFormModal(false)}
        onSubmit={handleSubmitGame}
        editingGame={editingGame}
        users={users}
        saving={saving}
      />

      <DeleteGameModal
        isOpen={!!deleteTarget}
        game={deleteTarget}
        deleting={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteGame}
      />
    </div>
  );
}

