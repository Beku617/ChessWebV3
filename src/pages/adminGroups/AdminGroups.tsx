import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Edit3, Loader2, Plus, Search, Trash2, Users } from "lucide-react";
import AdminSidebar from "../../components/AdminSidebar";
import {
  API_URL,
  CommunityGroup,
  CommunityGroupsListResponse,
  formatRelativeTime,
} from "../../components/community/types";
import { CommunityGroupAvatar } from "../../components/community/CommunityGroups";
import { useAdminStore } from "../../store/adminStore";

type GroupDraft = {
  name: string;
  description: string;
  topic: string;
};

const emptyDraft: GroupDraft = {
  name: "",
  description: "",
  topic: "",
};

export default function AdminGroups() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading, checkAuth } = useAdminStore();
  const [groups, setGroups] = useState<CommunityGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
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
      const params = new URLSearchParams({ limit: "60" });
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`${API_URL}/api/admin/groups?${params}`, {
        credentials: "include",
      });
      const data: CommunityGroupsListResponse & { error?: string } =
        await res.json().catch(() => ({ groups: [], total: 0 }));
      if (!res.ok) {
        throw new Error(data.error || "Failed to load groups.");
      }
      setGroups(data.groups || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load groups.");
    } finally {
      setLoading(false);
    }
  }, [search]);

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
    <div className="min-h-screen bg-[#06101d] text-white">
      <AdminSidebar />

      <main className="ml-72 px-8 py-7">
        <div className="mx-auto max-w-[1400px]">
          <section className="rounded-[28px] bg-[#0c1728]/86 p-6 shadow-[0_24px_75px_rgba(0,0,0,0.24)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-teal-200/70">
                  Admin Workspace
                </div>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
                  Community Groups
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-gray-400">
                  Create, inspect, edit, and remove public groups without leaving the
                  moderation workspace.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsCreateOpen((open) => !open)}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-500"
              >
                <Plus className="h-4 w-4" />
                {isCreateOpen ? "Close form" : "Create group"}
              </button>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <div className="relative min-w-[280px] flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search groups by name, topic, or description..."
                  className="w-full rounded-2xl bg-white/[0.05] py-3 pl-11 pr-4 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                />
              </div>
            </div>

            {isCreateOpen && (
              <div className="mt-5 rounded-[22px] border border-white/[0.05] bg-[#091321]/82 p-5">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="space-y-4">
                    <input
                      value={createDraft.name}
                      onChange={(event) =>
                        setCreateDraft((current) => ({ ...current, name: event.target.value }))
                      }
                      placeholder="Group name"
                      className="w-full rounded-2xl bg-white/[0.05] px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                    />
                    <textarea
                      value={createDraft.description}
                      onChange={(event) =>
                        setCreateDraft((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      placeholder="Describe what this group is for..."
                      className="min-h-[120px] w-full rounded-2xl bg-white/[0.05] px-4 py-3 text-sm leading-6 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                    />
                  </div>

                  <div className="space-y-4">
                    <input
                      value={createDraft.topic}
                      onChange={(event) =>
                        setCreateDraft((current) => ({ ...current, topic: event.target.value }))
                      }
                      placeholder="Topic"
                      className="w-full rounded-2xl bg-white/[0.05] px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                    />
                    <button
                      type="button"
                      onClick={handleCreate}
                      disabled={isCreating}
                      className="w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-500 disabled:opacity-50"
                    >
                      {isCreating ? "Creating..." : "Create group"}
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
            <div className="mt-6 rounded-2xl bg-[#0c1728]/82 py-24 flex items-center justify-center shadow-[0_22px_65px_rgba(0,0,0,0.22)]">
              <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
            </div>
          ) : groups.length === 0 ? (
            <div className="mt-6 rounded-2xl bg-[#0c1728]/82 px-6 py-24 text-center shadow-[0_22px_65px_rgba(0,0,0,0.22)]">
              <Users className="mx-auto h-10 w-10 text-gray-500" />
              <div className="mt-4 text-lg font-semibold text-white">No groups yet</div>
              <p className="mt-2 text-sm leading-7 text-gray-500">
                Create the first public community group.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-5 xl:grid-cols-2">
              {groups.map((group) => {
                const isEditing = editingId === group.id;
                const isBusy = processingId === group.id;
                return (
                  <article
                    key={group.id}
                    className="rounded-[24px] border border-white/[0.05] bg-[#0c1728]/86 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.22)]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <CommunityGroupAvatar group={group} size="md" />
                        <div className="min-w-0">
                          <div className="truncate text-lg font-semibold text-white">
                            {group.name}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                            <span>{group.memberCount} members</span>
                            {group.topic && (
                              <span className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] text-gray-400">
                                {group.topic}
                              </span>
                            )}
                            <span>/community/groups/{group.slug}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {!isEditing && (
                          <button
                            type="button"
                            onClick={() => handleStartEdit(group)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.05] text-gray-200 transition-colors hover:bg-white/[0.1]"
                            aria-label={`Edit ${group.name}`}
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleDelete(group)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-200 transition-colors hover:bg-red-500/18 disabled:opacity-50"
                          aria-label={`Delete ${group.name}`}
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
                          className="w-full rounded-2xl bg-white/[0.05] px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                        />
                        <textarea
                          value={editDraft.description}
                          onChange={(event) =>
                            setEditDraft((current) => ({
                              ...current,
                              description: event.target.value,
                            }))
                          }
                          className="min-h-[120px] w-full rounded-2xl bg-white/[0.05] px-4 py-3 text-sm leading-6 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                        />
                        <input
                          value={editDraft.topic}
                          onChange={(event) =>
                            setEditDraft((current) => ({ ...current, topic: event.target.value }))
                          }
                          className="w-full rounded-2xl bg-white/[0.05] px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                        />
                        <div className="flex items-center justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded-xl bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-gray-200 transition-colors hover:bg-white/[0.12]"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleSaveEdit(group.id)}
                            className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-500 disabled:opacity-50"
                          >
                            {isBusy ? "Saving..." : "Save changes"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="mt-4 text-sm leading-7 text-gray-400">
                          {group.description || "No description yet."}
                        </p>
                        <div className="mt-5 grid gap-3 sm:grid-cols-3">
                          <div className="rounded-2xl bg-white/[0.03] px-4 py-3">
                            <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500">
                              Members
                            </div>
                            <div className="mt-2 text-lg font-semibold text-white">
                              {group.memberCount}
                            </div>
                          </div>
                          <div className="rounded-2xl bg-white/[0.03] px-4 py-3">
                            <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500">
                              Approved Posts
                            </div>
                            <div className="mt-2 text-lg font-semibold text-white">
                              {group.approvedPostCount || 0}
                            </div>
                          </div>
                          <div className="rounded-2xl bg-white/[0.03] px-4 py-3">
                            <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500">
                              Created
                            </div>
                            <div className="mt-2 text-sm font-medium text-white">
                              {group.createdAt ? formatRelativeTime(group.createdAt) : "Just now"}
                            </div>
                          </div>
                        </div>

                        <div className="mt-5 border-t border-white/[0.05] pt-4 text-sm text-gray-500">
                          Creator:{" "}
                          <span className="text-gray-200">
                            {group.creator?.fullName || "Unknown"}
                          </span>
                        </div>
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
