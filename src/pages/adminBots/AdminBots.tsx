import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation, Trans } from "react-i18next";
import AdminSidebar from "../../components/AdminSidebar";
import { useAdminStore } from "../../store/adminStore";
import { useAdminBots } from "./useAdminBots";
import { BotFormModal } from "./BotFormModal";
import { DeleteConfirmModal } from "./DeleteConfirmModal";
import { AnalysisAiModelSelector } from "./AnalysisAiModelSelector";
import type { BotData, BotFormData } from "./types";
import { DIFFICULTY_OPTIONS } from "./types";

export default function AdminBots() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, checkAuth } = useAdminStore();

  const {
    bots,
    stats,
    categories,
    loading,
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
    createBot,
    updateBot,
    deleteBot,
    toggleBotActive,
    exportBots,
  } = useAdminBots();

  const [showModal, setShowModal] = useState(false);
  const [editingBot, setEditingBot] = useState<BotData | null>(null);
  const [deleteBot_, setDeleteBot] = useState<BotData | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedBots, setSelectedBots] = useState<string[]>([]);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (!isAuthenticated && !loading) {
      navigate("/login");
    }
  }, [isAuthenticated, loading, navigate]);

  const showNotification = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleCreate = () => {
    setEditingBot(null);
    setShowModal(true);
  };

  const handleEdit = (bot: BotData) => {
    setEditingBot(bot);
    setShowModal(true);
  };

  const handleSubmit = async (formData: BotFormData) => {
    setSaving(true);
    try {
      if (editingBot) {
        await updateBot(editingBot._id, formData);
        showNotification("success", "Bot updated successfully");
      } else {
        await createBot(formData);
        showNotification("success", "Bot created successfully");
      }
      setShowModal(false);
    } catch (err) {
      showNotification(
        "error",
        err instanceof Error ? err.message : "Failed to save bot",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteBot_) return;
    setDeleting(true);
    try {
      await deleteBot(deleteBot_._id);
      showNotification("success", "Bot deleted successfully");
      setDeleteBot(null);
    } catch (err) {
      showNotification(
        "error",
        err instanceof Error ? err.message : "Failed to delete bot",
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleActive = async (bot: BotData) => {
    try {
      await toggleBotActive(bot);
      showNotification(
        "success",
        `Bot ${bot.isActive ? "deactivated" : "activated"}`,
      );
    } catch (err) {
      showNotification("error", "Failed to update bot status");
    }
  };

  const handleExport = async () => {
    try {
      await exportBots();
      showNotification("success", "Bots exported successfully");
    } catch (err) {
      showNotification("error", "Failed to export bots");
    }
  };

  const toggleSelectBot = (id: string) => {
    setSelectedBots((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const toggleSelectAll = () => {
    if (selectedBots.length === bots.length) {
      setSelectedBots([]);
    } else {
      setSelectedBots(bots.map((b) => b._id));
    }
  };

  const getDifficultyBadge = (difficulty: BotData["difficulty"]) => {
    const opt = DIFFICULTY_OPTIONS.find((o) => o.value === difficulty);
    return opt ? (
      <span
        className={`px-2 py-1 text-xs font-medium rounded-full ${opt.color}`}
      >
        {opt.label}
      </span>
    ) : null;
  };

  return (
    <div className="flex min-h-screen bg-theme-panel ">
      <AdminSidebar />

      <div className="flex-1 ml-72 p-8">
        {/* Notification */}
        {notification && (
          <div
            className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 ${
              notification.type === "success"
                ? "bg-green-500 text-theme-on-accent"
                : "bg-red-500 text-theme-on-accent"
            }`}
          >
            <span className="text-sm font-semibold uppercase tracking-wide">
              {notification.type === "success" ? "Success" : "Error"}
            </span>
            {notification.message}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-theme-foreground "> <Trans>Bot Management</Trans> </h1>
          </div>
          <div className="flex items-center gap-3">
            <AnalysisAiModelSelector />
            <button
              onClick={handleExport}
              className="px-4 py-2 rounded-lg border border-theme-glass text-theme-muted hover:bg-theme-surface transition-colors flex items-center gap-2"
            > <Trans>Export CSV</Trans> </button>
            <button
              onClick={handleCreate}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-brand-500 to-brand-500 text-theme-on-accent font-medium hover:from-brand-600 hover:to-brand-600 transition-colors flex items-center gap-2"
            > <Trans>Create Bot</Trans> </button>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-theme-panel rounded-xl p-4 border border-theme-glass ">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-theme-muted"> <Trans>Total Bots</Trans> </p>
                  <p className="text-2xl font-bold text-theme-foreground ">
                    {stats.total}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-theme-panel rounded-xl p-4 border border-theme-glass ">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-theme-muted"> <Trans>Active</Trans> </p>
                  <p className="text-2xl font-bold text-green-600">
                    {stats.active}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-theme-panel rounded-xl p-4 border border-theme-glass ">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-theme-muted"> <Trans>Inactive</Trans> </p>
                  <p className="text-2xl font-bold text-theme-muted">
                    {stats.inactive}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-theme-panel rounded-xl p-4 border border-theme-glass ">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-theme-muted"> <Trans>Masters</Trans> </p>
                  <p className="text-2xl font-bold text-amber-600">
                    {stats.byDifficulty?.master || 0}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-theme-panel rounded-xl border border-theme-glass p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t("admin.search.bots")}
                    className="w-full px-4 py-2 rounded-lg border border-theme-glass bg-theme-panel text-theme-foreground focus:ring-2 focus:ring-brand-500"
                  />
              </div>
            </div>

            {/* Difficulty Filter */}
            <select
              value={difficultyFilter}
              onChange={(e) => setDifficultyFilter(e.target.value)}
              className="px-4 py-2 rounded-lg border border-theme-glass bg-theme-panel text-theme-foreground focus:ring-2 focus:ring-brand-500"
            >
              <option value=""><Trans>All Difficulties</Trans></option>
              {DIFFICULTY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-2 rounded-lg border border-theme-glass bg-theme-panel text-theme-foreground focus:ring-2 focus:ring-brand-500"
            >
              <option value=""><Trans>All Categories</Trans></option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            {/* Active Filter */}
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="px-4 py-2 rounded-lg border border-theme-glass bg-theme-panel text-theme-foreground focus:ring-2 focus:ring-brand-500"
            >
              <option value=""><Trans>All Status</Trans></option>
              <option value="true"><Trans>Active</Trans></option>
              <option value="false"><Trans>Inactive</Trans></option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-theme-panel rounded-xl border border-theme-glass overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <span className="text-sm font-medium text-theme-muted">
                Loading bots...
              </span>
            </div>
          ) : bots.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-theme-muted">
              <p><Trans>No bots found</Trans></p>
              <button
                onClick={handleCreate}
                className="mt-4 px-4 py-2 rounded-lg bg-brand-500 text-theme-on-accent hover:bg-brand-600 transition-colors"
              > <Trans>Create your first bot</Trans> </button>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-theme-glass bg-theme-surface">
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedBots.length === bots.length}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-theme-glass text-brand-500 focus:ring-brand-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-theme-muted uppercase"> <Trans>Bot</Trans> </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-theme-muted uppercase">
                    ELO
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-theme-muted uppercase"> <Trans>Difficulty</Trans> </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-theme-muted uppercase"> <Trans>Category</Trans> </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-theme-muted uppercase"> <Trans>Quote</Trans> </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-theme-muted uppercase"> <Trans>Status</Trans> </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-theme-muted uppercase"> <Trans>Actions</Trans> </th>
                </tr>
              </thead>
              <tbody>
                {bots.map((bot) => (
                  <tr
                    key={bot._id}
                    className="border-b border-theme-glass hover:bg-theme-surface/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedBots.includes(bot._id)}
                        onChange={() => toggleSelectBot(bot._id)}
                        className="w-4 h-4 rounded border-theme-glass text-brand-500 focus:ring-brand-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <div className="font-medium text-theme-foreground flex items-center gap-2">
                          {bot.name}
                          {bot.title && (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-600 rounded">
                              {bot.title}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-theme-muted">
                          {bot.playStyle}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-theme-foreground ">
                        {bot.eloRating}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {getDifficultyBadge(bot.difficulty)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-theme-muted">
                        {bot.category}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-theme-muted italic line-clamp-1 max-w-[200px]">
                        {bot.quote || "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleActive(bot)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          bot.isActive
                            ? "bg-green-100 text-green-700"
                            : "bg-theme-surface text-theme-muted"
                        }`}
                      >
                        {bot.isActive ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEdit(bot)}
                          className="px-3 py-1.5 rounded-lg text-sm text-theme-muted hover:text-brand-500 hover:bg-brand-50 transition-colors"
                          title={t("admin.actions.edit")}
                        > <Trans>Edit</Trans> </button>
                        <button
                          onClick={() => setDeleteBot(bot)}
                          className="px-3 py-1.5 rounded-lg text-sm text-theme-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                          title={t("admin.actions.delete")}
                        > <Trans>Delete</Trans> </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-theme-glass ">
              <div className="text-sm text-theme-muted"> <Trans>Showing</Trans> {(pagination.page - 1) * pagination.limit + 1} <Trans>to</Trans>{" "}
                {Math.min(pagination.page * pagination.limit, pagination.total)}{" "} <Trans>of</Trans> {pagination.total} <Trans>bots</Trans> </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="px-3 py-2 rounded-lg border border-theme-glass text-sm text-theme-muted hover:bg-theme-surface disabled:opacity-50 disabled:cursor-not-allowed"
                > <Trans>Previous</Trans> </button>
                <span className="px-3 py-1 text-sm text-theme-muted"> <Trans>Page</Trans> {pagination.page} <Trans>of</Trans> {pagination.pages}
                </span>
                <button
                  onClick={() => setPage(pagination.page + 1)}
                  disabled={pagination.page >= pagination.pages}
                  className="px-3 py-2 rounded-lg border border-theme-glass text-sm text-theme-muted hover:bg-theme-surface disabled:opacity-50 disabled:cursor-not-allowed"
                > <Trans>Next</Trans> </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <BotFormModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSubmit={handleSubmit}
        editingBot={editingBot}
        saving={saving}
      />

      <DeleteConfirmModal
        isOpen={!!deleteBot_}
        bot={deleteBot_}
        onClose={() => setDeleteBot(null)}
        onConfirm={handleDelete}
        deleting={deleting}
      />
    </div>
  );
}

