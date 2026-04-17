import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Search, Users } from "lucide-react";
import Sidebar from "../components/Sidebar";
import {
  CommunityGroupCard,
  CommunityGroupCreateModal,
} from "../components/community/CommunityGroups";
import {
  API_URL,
  CommunityGroup,
  CommunityGroupsListResponse,
} from "../components/community/types";

export default function CommunityGroups() {
  const [groups, setGroups] = useState<CommunityGroup[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyGroupId, setBusyGroupId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "36" });
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`${API_URL}/api/community/groups?${params}`, {
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
    void loadGroups();
  }, [loadGroups]);

  const handleToggleGroup = async (group: CommunityGroup) => {
    setBusyGroupId(group.id);
    setError("");
    try {
      const action = group.joined ? "leave" : "join";
      const res = await fetch(
        `${API_URL}/api/community/groups/${group.slug || group.id}/${action}`,
        { method: "POST", credentials: "include" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Failed to ${action} group.`);
      }
      await loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update group.");
    } finally {
      setBusyGroupId(null);
    }
  };

  const handleCreateGroup = async (payload: {
    name: string;
    description: string;
    topic: string;
  }) => {
    setIsCreating(true);
    setCreateError("");
    try {
      const res = await fetch(`${API_URL}/api/community/groups`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to create group.");
      }
      setIsCreateOpen(false);
      await loadGroups();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create group.");
    } finally {
      setIsCreating(false);
    }
  };

  const joinedGroups = useMemo(
    () => groups.filter((group) => group.joined),
    [groups],
  );

  return (
    <div className="min-h-screen bg-[#060f1d] text-white flex transition-colors duration-300">
      <Sidebar />

      <main className="relative flex-1 ml-[60px] md:ml-72 min-h-screen overflow-x-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-24 bg-gradient-to-b from-[#060f1d] via-[#060f1d]/96 to-transparent" />

        <div className="relative z-10 mx-auto max-w-[1500px] px-6 py-7">
          <section className="rounded-[28px] bg-[#0c1728]/84 p-6 shadow-[0_22px_65px_rgba(0,0,0,0.24)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-200/70">
                  Community Groups
                </div>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
                  Find your chess circle
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-gray-400">
                  Join public NeonGambit groups for openings, tactics, club prep, and
                  shared games. Posts from groups you join will surface more often in
                  your community feed.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsCreateOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-500"
              >
                <Users className="h-4 w-4" />
                Create group
              </button>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <div className="relative min-w-[280px] flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by group name, topic, or description..."
                  className="w-full rounded-2xl bg-white/[0.05] py-3 pl-11 pr-4 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
              </div>

              <Link
                to="/community"
                className="rounded-xl bg-white/[0.05] px-4 py-2.5 text-sm font-medium text-gray-200 transition-colors hover:bg-white/[0.1]"
              >
                Back to Community
              </Link>
            </div>
          </section>

          {error && (
            <div className="mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          {joinedGroups.length > 0 && (
            <section className="mt-6">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">
                Joined Groups
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {joinedGroups.map((group) => (
                  <CommunityGroupCard
                    key={`joined-${group.id}`}
                    group={group}
                    busy={busyGroupId === group.id}
                    onToggle={handleToggleGroup}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="mt-6">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">
              Discover
            </div>

            {loading ? (
              <div className="rounded-2xl bg-[#0c1728]/82 py-20 shadow-[0_22px_65px_rgba(0,0,0,0.22)] flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
              </div>
            ) : groups.length === 0 ? (
              <div className="rounded-2xl bg-[#0c1728]/82 px-6 py-20 text-center shadow-[0_22px_65px_rgba(0,0,0,0.22)]">
                <Users className="mx-auto h-10 w-10 text-gray-500" />
                <div className="mt-4 text-lg font-semibold text-white">No groups found</div>
                <p className="mt-2 text-sm leading-7 text-gray-500">
                  Start the first public group for your chess community.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {groups.map((group) => (
                  <CommunityGroupCard
                    key={group.id}
                    group={group}
                    busy={busyGroupId === group.id}
                    onToggle={handleToggleGroup}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      <CommunityGroupCreateModal
        open={isCreateOpen}
        busy={isCreating}
        error={createError}
        onClose={() => {
          if (isCreating) return;
          setIsCreateOpen(false);
          setCreateError("");
        }}
        onSubmit={handleCreateGroup}
      />
    </div>
  );
}

