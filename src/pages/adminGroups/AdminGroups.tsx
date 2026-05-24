import { useCallback, useDeferredValue, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation, Trans } from "react-i18next";
import { Edit3, Loader2, Plus, Search, Trash2, Users } from "lucide-react";
import { AdminPagination } from "../../components/AdminPagination";
import AdminSidebar from "../../components/AdminSidebar";
import {
  API_URL,
  CommunityGroup,
  CommunityGroupsListResponse,
  formatRelativeTime,
} from "../../components/community/types";
import { CommunityGroupAvatar } from "../../components/community/CommunityGroups";
import { useAdminStore } from "../../store/adminStore";
import { useThemeStore } from "../../store/themeStore";

type GroupDraft = {
  name: string;
  description: string;
  topic: string;
};

const GROUPS_PAGE_SIZE = 8;

const emptyDraft: GroupDraft = {
  name: "",
  description: "",
  topic: "",
};

export default function AdminGroups() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading, checkAuth } = useAdminStore();
  const { isDarkMode } = useThemeStore();
  const [groups, setGroups] = useState<CommunityGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState(1);
  const [totalGroups, setTotalGroups] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<GroupDraft>(emptyDraft);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<GroupDraft>(emptyDraft);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [authLoading, isAuthenticated, navigate]);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(GROUPS_PAGE_SIZE),
      });
      if (deferredSearch.trim()) params.set("search", deferredSearch.trim());
      const res = await fetch(`${API_URL}/api/admin/groups?${params}`, {
        credentials: "include",
      });
      const data: CommunityGroupsListResponse & { error?: string } =
        await res.json().catch(() => ({ groups: [], total: 0 }));
      if (!res.ok) {
        throw new Error(data.error || "Failed to load groups.");
      }
      setGroups(data.groups || []);
      setTotalGroups(Number(data.pagination?.total || data.total || 0));
      setTotalPages(Math.max(1, Number(data.pagination?.pages || 1)));
      setPage(Math.max(1, Number(data.pagination?.page || 1)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load groups.");
    } finally {
      setLoading(false);
    }
  }, [deferredSearch, page]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadGroups();
  }, [isAuthenticated, loadGroups]);

  const handleCreate = async () => {
    setIsCreating(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/admin/groups`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createDraft),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to create group.");
      }
      setCreateDraft(emptyDraft);
      setIsCreateOpen(false);
      await loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create group.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleStartEdit = (group: CommunityGroup) => {
    setEditingId(group.id);
    setEditDraft({
      name: group.name || "",
      description: group.description || "",
      topic: group.topic || "",
    });
  };

  const handleSaveEdit = async (groupId: string) => {
    setProcessingId(groupId);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/admin/groups/${groupId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editDraft),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to update group.");
      }
      setEditingId(null);
      setEditDraft(emptyDraft);
      await loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update group.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (group: CommunityGroup) => {
    const confirmed = window.confirm(
      `Delete "${group.name}"? Existing group posts will return to the general community feed.`,
    );
    if (!confirmed) return;

    setProcessingId(group.id);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/admin/groups/${group.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete group.");
      }
      await loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete group.");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className={isDarkMode ? "dark" : ""}>
      <div className="min-h-screen bg-[#f5f5f7] text-gray-900 dark:bg-[#06101d] dark:text-white">
        <AdminSidebar />

        <main className="ml-72 px-8 py-7">
          <div className="mx-auto max-w-[1400px]">
          <section className="rounded-[28px] border border-gray-200/80 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] dark:border-white/[0.05] dark:bg-[#0c1728]/85 dark:shadow-[0_24px_75px_rgba(0,0,0,0.24)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-white"> <Trans>Community Groups</Trans> </h1>
              </div>

              <button
                type="button"
                onClick={() => setIsCreateOpen((open) => !open)}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-500"
              >
                <Plus className="h-4 w-4" />
                {isCreateOpen
                  ? t("admin.groups.actions.closeForm", "Close form")
                  : t("admin.groups.actions.createGroup", "Create group")}
              </button>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <div className="relative min-w-[280px] flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder={t("admin.search.groups")}
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-11 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-white/[0.05] dark:bg-white/[0.05] dark:text-white dark:placeholder:text-gray-500"
                />
              </div>
            </div>

            {isCreateOpen && (
              <div className="mt-5 rounded-[22px] border border-gray-200/80 bg-gray-50/90 p-5 dark:border-white/[0.05] dark:bg-[#091321]/80">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="space-y-4">
                    <input
                      value={createDraft.name}
                      onChange={(event) =>
                        setCreateDraft((current) => ({ ...current, name: event.target.value }))
                      }
                      placeholder={t("admin.groups.placeholders.groupName", "Group name")}
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-white/[0.05] dark:bg-white/[0.05] dark:text-white dark:placeholder:text-gray-500"
                    />
                    <textarea
                      value={createDraft.description}
                      onChange={(event) =>
                        setCreateDraft((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      placeholder={t(
                        "admin.groups.placeholders.description",
                        "Describe what this group is for...",
                      )}
                      className="min-h-[120px] w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm leading-6 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-white/[0.05] dark:bg-white/[0.05] dark:text-white dark:placeholder:text-gray-500"
                    />
                  </div>

                  <div className="space-y-4">
                    <input
                      value={createDraft.topic}
                      onChange={(event) =>
                        setCreateDraft((current) => ({ ...current, topic: event.target.value }))
                      }
                      placeholder={t("admin.groups.placeholders.topic", "Topic")}
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-white/[0.05] dark:bg-white/[0.05] dark:text-white dark:placeholder:text-gray-500"
                    />
                    <button
                      type="button"
                      onClick={handleCreate}
                      disabled={isCreating}
                      className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-500 disabled:opacity-50"
                    >
                      {isCreating
                        ? t("admin.groups.actions.creating", "Creating...")
                        : t("admin.groups.actions.createGroup", "Create group")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {error && (
            <div className="mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          {loading ? (
            <div className="mt-6 flex items-center justify-center rounded-2xl border border-gray-200/80 bg-white/95 py-24 shadow-[0_18px_44px_rgba(15,23,42,0.08)] dark:border-white/[0.05] dark:bg-[#0c1728]/80 dark:shadow-[0_22px_65px_rgba(0,0,0,0.22)]">
              <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
            </div>
          ) : groups.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-gray-200/80 bg-white/95 px-6 py-24 text-center shadow-[0_18px_44px_rgba(15,23,42,0.08)] dark:border-white/[0.05] dark:bg-[#0c1728]/80 dark:shadow-[0_22px_65px_rgba(0,0,0,0.22)]">
              <Users className="mx-auto h-10 w-10 text-gray-500" />
              <div className="mt-4 text-lg font-semibold text-gray-900 dark:text-white"><Trans>No groups yet</Trans></div>
              <p className="mt-2 text-sm leading-7 text-gray-500 dark:text-gray-500"> <Trans>Create the first public community group.</Trans> </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-5 xl:grid-cols-2">
              {groups.map((group) => {
                const isEditing = editingId === group.id;
                const isBusy = processingId === group.id;
                return (
                  <article
                    key={group.id}
                    className="rounded-[24px] border border-gray-200/80 bg-white/95 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] dark:border-white/[0.05] dark:bg-[#0c1728]/85 dark:shadow-[0_20px_60px_rgba(0,0,0,0.22)]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <CommunityGroupAvatar group={group} size="md" />
                        <div className="min-w-0">
                          <div className="truncate text-lg font-semibold text-gray-900 dark:text-white">
                            {group.name}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-500">
                            <span>{group.memberCount} <Trans>members</Trans></span>
                            {group.topic && (
                              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
                                {group.topic}
                              </span>
                            )}
                            <span><Trans>/community/groups/</Trans>{group.slug}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {!isEditing && (
                          <button
                            type="button"
                            onClick={() => handleStartEdit(group)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-700 transition-colors hover:bg-gray-200 dark:bg-white/[0.05] dark:text-gray-200 dark:hover:bg-white/[0.1]"
                            aria-label={t("admin.aria.editGroup", {
                              name: group.name,
                            })}
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleDelete(group)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-200 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                          aria-label={t("admin.aria.deleteGroup", {
                            name: group.name,
                          })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="mt-5 space-y-3">
                        <input
                          value={editDraft.name}
                          onChange={(event) =>
                            setEditDraft((current) => ({ ...current, name: event.target.value }))
                          }
                          className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-white/[0.05] dark:bg-white/[0.05] dark:text-white dark:placeholder:text-gray-500"
                        />
                        <textarea
                          value={editDraft.description}
                          onChange={(event) =>
                            setEditDraft((current) => ({
                              ...current,
                              description: event.target.value,
                            }))
                          }
                          className="min-h-[120px] w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm leading-6 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-white/[0.05] dark:bg-white/[0.05] dark:text-white dark:placeholder:text-gray-500"
                        />
                        <input
                          value={editDraft.topic}
                          onChange={(event) =>
                            setEditDraft((current) => ({ ...current, topic: event.target.value }))
                          }
                          className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-white/[0.05] dark:bg-white/[0.05] dark:text-white dark:placeholder:text-gray-500"
                        />
                        <div className="flex items-center justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.12]"
                          > <Trans>Cancel</Trans> </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleSaveEdit(group.id)}
                            className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-500 disabled:opacity-50"
                          >
                            {isBusy
                              ? t("admin.groups.actions.saving", "Saving...")
                              : t("admin.groups.actions.saveChanges", "Save changes")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="mt-4 text-sm leading-7 text-gray-600 dark:text-gray-400">
                          {group.description ||
                            t("admin.groups.labels.noDescription", "No description yet.")}
                        </p>
                        <div className="mt-5 grid gap-3 sm:grid-cols-3">
                          <div className="rounded-2xl bg-gray-100/90 px-4 py-3 dark:bg-white/[0.03]">
                            <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 dark:text-gray-500"> <Trans>Members</Trans> </div>
                            <div className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
                              {group.memberCount}
                            </div>
                          </div>
                          <div className="rounded-2xl bg-gray-100/90 px-4 py-3 dark:bg-white/[0.03]">
                            <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 dark:text-gray-500"> <Trans>Approved Posts</Trans> </div>
                            <div className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
                              {group.approvedPostCount || 0}
                            </div>
                          </div>
                          <div className="rounded-2xl bg-gray-100/90 px-4 py-3 dark:bg-white/[0.03]">
                            <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 dark:text-gray-500"> <Trans>Created</Trans> </div>
                            <div className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                              {group.createdAt
                                ? formatRelativeTime(group.createdAt)
                                : t("admin.groups.labels.justNow", "Just now")}
                            </div>
                          </div>
                        </div>

                        <div className="mt-5 border-t border-gray-200 pt-4 text-sm text-gray-500 dark:border-white/[0.05] dark:text-gray-500"> <Trans>Creator:</Trans>{" "}
                          <span className="text-gray-800 dark:text-gray-200">
                            {group.creator?.fullName ||
                              t("admin.groups.labels.unknown", "Unknown")}
                          </span>
                        </div>
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          )}
          {!loading && groups.length > 0 && (
            <AdminPagination
              page={page}
              totalPages={totalPages}
              totalItems={totalGroups}
              pageSize={GROUPS_PAGE_SIZE}
              itemLabel={t("admin.groups.labels.groups", "groups")}
              onPageChange={setPage}
            />
          )}
          </div>
        </main>
      </div>
    </div>
  );
}

