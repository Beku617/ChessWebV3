import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation, Trans } from "react-i18next";
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
import { openAnalyzeWindow } from "../../utils/analyzeNavigation";
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
    return "bg-brand-500/10 text-brand-600";
  }
  if (result === "0-1") {
    return "bg-blue-500/10 text-blue-600";
  }
  if (result === "1/2-1/2") {
    return "bg-amber-500/10 text-amber-600";
  }
  return "bg-theme-surface/10 text-theme-muted";
}

function variantBadgeClass(variant: string): string {
  return variant === "chess960"
    ? "bg-purple-500/10 text-purple-600"
    : "bg-theme-surface/10 text-theme-muted";
}

export default function AdminGames() {
  const { t } = useTranslation();
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
      <div className="min-h-screen bg-theme-panel flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-panel text-theme-foreground ">
      <AdminSidebar />

      {notification && (
        <div
          className={`fixed top-5 right-5 z-[90] px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 ${
            notification.type === "success"
              ? "bg-brand-500 text-theme-on-accent"
              : "bg-red-500 text-theme-on-accent"
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
              <Gamepad2 className="w-8 h-8 text-brand-500" /> <Trans>Games Management</Trans> </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-theme-glass text-theme-muted hover:bg-theme-surface transition-colors"
            >
              <Download className="w-4 h-4" /> <Trans>Export CSV</Trans> </button>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <div className="bg-theme-panel rounded-xl border border-theme-glass p-4">
              <p className="text-sm text-theme-muted"> <Trans>Total Games</Trans> </p>
              <p className="mt-1 text-2xl font-bold">{stats.total}</p>
            </div>
            <div className="bg-theme-panel rounded-xl border border-theme-glass p-4">
              <p className="text-sm text-theme-muted"><Trans>Rated</Trans></p>
              <p className="mt-1 text-2xl font-bold text-brand-600">
                {stats.rated}
              </p>
              <p className="text-xs text-theme-muted mt-1">
                {ratedPercent}<Trans>% of all games</Trans> </p>
            </div>
            <div className="bg-theme-panel rounded-xl border border-theme-glass p-4">
              <p className="text-sm text-theme-muted"> <Trans>Standard / 960</Trans> </p>
              <p className="mt-1 text-2xl font-bold">
                {stats.byVariant.standard} / {stats.byVariant.chess960}
              </p>
            </div>
            <div className="bg-theme-panel rounded-xl border border-theme-glass p-4">
              <p className="text-sm text-theme-muted"> <Trans>Last 24 Hours</Trans> </p>
              <p className="mt-1 text-2xl font-bold text-brand-600">
                {stats.recent24h}
              </p>
            </div>
          </div>
        )}

        <div className="bg-theme-panel rounded-xl border border-theme-glass p-4 mb-6">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[220px]">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" />
                <input
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder={t("admin.search.games")}
                  className="w-full pl-10 pr-3 py-2 rounded-lg border border-theme-glass bg-theme-panel text-theme-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <select
              value={variantFilter}
              onChange={(e) => {
                setVariantFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-lg border border-theme-glass bg-theme-panel text-theme-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value=""><Trans>All Variants</Trans></option>
              <option value="standard"><Trans>Standard</Trans></option>
              <option value="chess960"><Trans>Chess960</Trans></option>
            </select>

            <select
              value={resultFilter}
              onChange={(e) => {
                setResultFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-lg border border-theme-glass bg-theme-panel text-theme-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value=""><Trans>All Results</Trans></option>
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
              className="px-3 py-2 rounded-lg border border-theme-glass bg-theme-panel text-theme-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value=""><Trans>All Types</Trans></option>
              <option value="true"><Trans>Rated</Trans></option>
              <option value="false"><Trans>Casual</Trans></option>
            </select>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="bg-theme-panel rounded-xl border border-theme-glass overflow-hidden">
          {loading ? (
            <div className="py-24 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
            </div>
          ) : games.length === 0 ? (
            <div className="py-20 text-center text-theme-muted">
              <Gamepad2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p><Trans>No games found with current filters.</Trans></p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-theme-surface border-b border-theme-glass ">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-theme-muted"> <Trans>Players</Trans> </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-theme-muted"> <Trans>Result</Trans> </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-theme-muted"> <Trans>Variant</Trans> </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-theme-muted"> <Trans>Owner</Trans> </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-theme-muted"> <Trans>Moves</Trans> </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-theme-muted"> <Trans>Created</Trans> </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-theme-muted"> <Trans>Actions</Trans> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme-glass">
                {games.map((game) => {
                  const owner =
                    typeof game.userId === "string" ? null : game.userId;

                  return (
                    <tr
                      key={game._id}
                      className="hover:bg-theme-surface/40 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-theme-foreground ">
                          {game.white} <Trans>vs</Trans> {game.black}
                        </div>
                        <div className="text-xs text-theme-muted">
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
                              ? "bg-brand-500/10 text-brand-600"
                              : "bg-theme-surface/10 text-theme-muted"
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
                        <div className="text-xs text-theme-muted mt-1">
                          {game.timeControl || "-"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-theme-foreground ">
                          {owner?.fullName || "Unknown"}
                        </div>
                        <div className="text-xs text-theme-muted">
                          {owner?.email ||
                            (typeof game.userId === "string"
                              ? game.userId
                              : "")}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-theme-muted">
                        {Array.isArray(game.moves) ? game.moves.length : 0}
                      </td>
                      <td className="px-4 py-3 text-sm text-theme-muted">
                        {formatDate(game.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openAnalyzeWindow(`/admin/analyze/${game._id}`)}
                            className="p-2 rounded-lg text-theme-muted hover:text-brand-500 hover:bg-brand-50 transition-colors"
                            title={t("admin.actions.analyze")}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditClick(game)}
                            className="p-2 rounded-lg text-theme-muted hover:text-blue-500 hover:bg-blue-50 transition-colors"
                            title={t("admin.actions.edit")}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(game)}
                            className="p-2 rounded-lg text-theme-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                            title={t("admin.actions.delete")}
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
            <div className="flex items-center justify-between px-4 py-3 border-t border-theme-glass ">
              <div className="text-sm text-theme-muted"> <Trans>Showing</Trans> {(pagination.page - 1) * pagination.limit + 1} <Trans>to</Trans>{" "}
                {Math.min(pagination.page * pagination.limit, pagination.total)}{" "} <Trans>of</Trans> {pagination.total} <Trans>games</Trans> </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="p-2 rounded-lg border border-theme-glass text-theme-muted hover:bg-theme-surface disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-theme-muted"> <Trans>Page</Trans> {pagination.page} <Trans>of</Trans> {pagination.pages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(pagination.page + 1)}
                  disabled={pagination.page >= pagination.pages}
                  className="p-2 rounded-lg border border-theme-glass text-theme-muted hover:bg-theme-surface disabled:opacity-40"
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

