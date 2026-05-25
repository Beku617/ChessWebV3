import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Search, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import Sidebar from "../components/Sidebar";
import { FeedPagination } from "../components/community/FeedPagination";
import {
  CommunityGroupCard,
  CommunityGroupCreateModal,
} from "../components/community/CommunityGroups";
import {
  API_URL,
  CommunityGroup,
  CommunityGroupsListResponse,
} from "../components/community/types";

const DISCOVER_GROUPS_PAGE_SIZE = 12;
const JOINED_GROUPS_FETCH_LIMIT = 100;

export default function CommunityGroups() {
  const { t } = useTranslation();
  const [joinedGroups, setJoinedGroups] = useState<CommunityGroup[]>([]);
  const [discoverGroups, setDiscoverGroups] = useState<CommunityGroup[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyGroupId, setBusyGroupId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [discoverPage, setDiscoverPage] = useState(1);
  const [discoverTotalPages, setDiscoverTotalPages] = useState(1);
  const [discoverTotal, setDiscoverTotal] = useState(0);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const joinedParams = new URLSearchParams({
        scope: "joined",
        limit: String(JOINED_GROUPS_FETCH_LIMIT),
      });
      const discoverParams = new URLSearchParams({
        scope: "discover",
        page: String(discoverPage),
        limit: String(DISCOVER_GROUPS_PAGE_SIZE),
      });
      if (search.trim()) {
        joinedParams.set("search", search.trim());
        discoverParams.set("search", search.trim());
      }

      const [joinedRes, discoverRes] = await Promise.all([
        fetch(`${API_URL}/api/community/groups?${joinedParams.toString()}`, {
          credentials: "include",
        }),
        fetch(`${API_URL}/api/community/groups?${discoverParams.toString()}`, {
          credentials: "include",
        }),
      ]);
      const [joinedData, discoverData] = await Promise.all([
        joinedRes
          .json()
          .catch(() => ({ groups: [], total: 0 })) as Promise<
          CommunityGroupsListResponse & { error?: string }
        >,
        discoverRes
          .json()
          .catch(() => ({ groups: [], total: 0 })) as Promise<
          CommunityGroupsListResponse & { error?: string }
        >,
      ]);

      if (!joinedRes.ok) {
        throw new Error(joinedData.error || t("communityPage.errors.loadJoinedGroups"));
      }
      if (!discoverRes.ok) {
        throw new Error(discoverData.error || t("communityPage.errors.loadGroups"));
      }

      setJoinedGroups(joinedData.groups || []);
      setDiscoverGroups(discoverData.groups || []);
      setDiscoverTotal(Number(discoverData.pagination?.total || discoverData.total || 0));
      setDiscoverTotalPages(Math.max(1, Number(discoverData.pagination?.pages || 1)));
      setDiscoverPage(Math.max(1, Number(discoverData.pagination?.page || 1)));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("communityPage.errors.loadGroups"),
      );
    } finally {
      setLoading(false);
    }
  }, [discoverPage, search, t]);

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
        throw new Error(data.error || t("communityPage.errors.updateGroup"));
      }
      await loadGroups();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("communityPage.errors.updateGroup"),
      );
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
        throw new Error(data.error || t("communityPage.errors.createGroup"));
      }
      setIsCreateOpen(false);
      await loadGroups();
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : t("communityPage.errors.createGroup"),
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-theme-panel text-theme-foreground flex transition-colors duration-300">
      <Sidebar />

      <main className="relative flex-1 ml-[60px] md:ml-72 min-h-screen overflow-x-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-24 bg-gradient-to-b from-theme-panel via-theme-surface to-transparent" />

        <div className="relative z-10 mx-auto max-w-[1500px] px-6 py-7">
          <section className="rounded-[28px] bg-theme-panel p-6 shadow-[0_22px_65px_rgba(0,0,0,0.24)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-theme-foreground">
                  {t("communityGroupsPage.title")}
                </h1>
              </div>

              <button
                type="button"
                onClick={() => setIsCreateOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-theme-on-accent transition-colors hover:bg-brand-500"
              >
                <Users className="h-4 w-4" />
                {t("communityGroupsPage.createGroup")}
              </button>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <div className="relative min-w-[280px] flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-muted" />
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setDiscoverPage(1);
                  }}
                  placeholder={t("communityGroupsPage.searchPlaceholder")}
                  className="w-full rounded-2xl bg-theme-panel/[0.05] py-3 pl-11 pr-4 text-sm text-theme-foreground placeholder:text-theme-disabled focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
              </div>

              <Link
                to="/community"
                className="rounded-xl bg-theme-panel/[0.05] px-4 py-2.5 text-sm font-medium text-theme-muted transition-colors hover:bg-theme-panel/[0.1]"
              >
                {t("communityGroupsPage.backToCommunity")}
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
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-theme-muted">
                {t("communityGroups.sidebar.joinedGroups")}
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
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-theme-muted">
              {t("communityGroups.sidebar.discover")}
            </div>

            {loading ? (
              <div className="rounded-2xl bg-theme-panel py-20 shadow-[0_22px_65px_rgba(0,0,0,0.22)] flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
              </div>
            ) : discoverGroups.length === 0 ? (
              <div className="rounded-2xl bg-theme-panel px-6 py-20 text-center shadow-[0_22px_65px_rgba(0,0,0,0.22)]">
                <Users className="mx-auto h-10 w-10 text-theme-muted" />
                <div className="mt-4 text-lg font-semibold text-theme-foreground">
                  {t("communityGroupsPage.noGroupsTitle")}
                </div>
                <p className="mt-2 text-sm leading-7 text-theme-muted">
                  {t("communityGroupsPage.noGroupsDescription")}
                </p>
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {discoverGroups.map((group) => (
                    <CommunityGroupCard
                      key={group.id}
                      group={group}
                      busy={busyGroupId === group.id}
                      onToggle={handleToggleGroup}
                    />
                  ))}
                </div>

                {discoverTotalPages > 1 && (
                  <div className="mt-6 flex flex-col gap-3">
                    <div className="text-center text-sm text-theme-muted">
                      {t("communityGroupsPage.pagination.showing", {
                        start: (discoverPage - 1) * DISCOVER_GROUPS_PAGE_SIZE + 1,
                        end: Math.min(
                          discoverPage * DISCOVER_GROUPS_PAGE_SIZE,
                          discoverTotal,
                        ),
                        total: discoverTotal,
                      })}
                    </div>
                    <FeedPagination
                      currentPage={discoverPage}
                      totalPages={discoverTotalPages}
                      onPageChange={setDiscoverPage}
                    />
                  </div>
                )}
              </>
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
