import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import Sidebar from "../components/Sidebar";
import {
  CommunityGroupCreateModal,
  CommunityGroupsSidebarSection,
} from "../components/community/CommunityGroups";
import { PostComposer } from "../components/community/PostComposer";
import { PostCard } from "../components/community/PostCard";
import { FeedPagination } from "../components/community/FeedPagination";
import {
  TrendingWidget,
} from "../components/community/SidebarWidgets";
import {
  API_URL,
  CommunityFeedResponse,
  CommunityGroup,
  CommunityGroupsOverviewResponse,
  CommunityMineResponse,
  CommunityPost,
  CommunityPostingAccess,
  CommunityTrendingResponse,
} from "../components/community/types";
import { useAuthStore } from "../store/authStore";

const POSTS_PER_PAGE = 8;
type CommunityTab = "feed" | "my_posts";

function upsertGroup(groups: CommunityGroup[], nextGroup: CommunityGroup) {
  const filtered = groups.filter((group) => group.id !== nextGroup.id);
  return [nextGroup, ...filtered];
}

export default function Community() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<CommunityTab>("feed");

  const [feedPosts, setFeedPosts] = useState<CommunityPost[]>([]);
  const [feedTotalPosts, setFeedTotalPosts] = useState(0);
  const [feedTotalPages, setFeedTotalPages] = useState(1);
  const [feedPage, setFeedPage] = useState(1);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState("");

  const [minePosts, setMinePosts] = useState<CommunityPost[]>([]);
  const [mineTotalPosts, setMineTotalPosts] = useState(0);
  const [mineTotalPages, setMineTotalPages] = useState(1);
  const [minePage, setMinePage] = useState(1);
  const [mineLoading, setMineLoading] = useState(false);
  const [mineError, setMineError] = useState("");
  const [hasLoadedMine, setHasLoadedMine] = useState(false);
  const [trendingPosts, setTrendingPosts] = useState<CommunityPost[]>([]);
  const [trendingMode, setTrendingMode] = useState<CommunityTrendingResponse["mode"]>("latest");
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [trendingError, setTrendingError] = useState("");

  const [summary, setSummary] = useState<CommunityMineResponse["summary"] | null>(
    null,
  );
  const [postingAccess, setPostingAccess] = useState<CommunityPostingAccess | null>(
    null,
  );
  const [joinedGroups, setJoinedGroups] = useState<CommunityGroup[]>([]);
  const [discoverGroups, setDiscoverGroups] = useState<CommunityGroup[]>([]);
  const [composerGroups, setComposerGroups] = useState<CommunityGroup[]>([]);
  const [busyGroupId, setBusyGroupId] = useState<string | null>(null);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupError, setGroupError] = useState("");
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [createGroupError, setCreateGroupError] = useState("");

  const loadFeedPage = useCallback(async () => {
    setFeedLoading(true);
    setFeedError("");
    try {
      const feedRes = await fetch(
        `${API_URL}/api/community?page=${feedPage}&limit=${POSTS_PER_PAGE}`,
        { credentials: "include" },
      );
      const feedData: CommunityFeedResponse & { error?: string } =
        await feedRes.json();
      if (!feedRes.ok) {
        throw new Error(feedData.error || "Failed to load feed.");
      }

      setFeedPosts(feedData.posts || []);
      setFeedTotalPosts(feedData.total || 0);
      setFeedTotalPages(feedData.pagination?.pages || 1);
      if (feedData.postingAccess) {
        setPostingAccess(feedData.postingAccess);
      }
    } catch (err) {
      setFeedError(err instanceof Error ? err.message : "Failed to load feed.");
    } finally {
      setFeedLoading(false);
    }
  }, [feedPage]);

  const loadMinePage = useCallback(async () => {
    setMineLoading(true);
    setMineError("");
    try {
      const mineRes = await fetch(
        `${API_URL}/api/community/mine?page=${minePage}&limit=${POSTS_PER_PAGE}`,
        { credentials: "include" },
      );
      const mineData: CommunityMineResponse & { error?: string } =
        await mineRes.json();
      if (!mineRes.ok) {
        throw new Error(mineData.error || "Failed to load your posts.");
      }

      setMinePosts(mineData.posts || []);
      setMineTotalPosts(mineData.total || 0);
      setMineTotalPages(mineData.pagination?.pages || 1);
      setSummary(mineData.summary || null);
      setPostingAccess(mineData.postingAccess || null);
      setHasLoadedMine(true);
    } catch (err) {
      setMineError(
        err instanceof Error ? err.message : "Failed to load your posts.",
      );
    } finally {
      setMineLoading(false);
    }
  }, [minePage]);

  const loadMineMeta = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/community/mine?page=1&limit=1`, {
        credentials: "include",
      });
      const data: CommunityMineResponse & { error?: string } = await res.json().catch(
        () => ({
          posts: [],
          total: 0,
          pagination: { page: 1, limit: 1, total: 0, pages: 1 },
          summary: null,
          postingAccess: null,
        }),
      );
      if (!res.ok) {
        throw new Error(data.error || "Failed to load posting access.");
      }
      setSummary(data.summary || null);
      setPostingAccess(data.postingAccess || null);
    } catch {
      // keep the main feed responsive if this lightweight sync fails
    }
  }, []);

  const loadTrending = useCallback(async () => {
    setTrendingLoading(true);
    setTrendingError("");
    try {
      const res = await fetch(`${API_URL}/api/community/trending`, {
        credentials: "include",
      });
      const data: CommunityTrendingResponse & { error?: string } =
        await res.json().catch(() => ({ posts: [], mode: "latest" }));
      if (!res.ok) {
        throw new Error(data.error || "Failed to load trending posts.");
      }

      setTrendingPosts(data.posts || []);
      setTrendingMode(data.mode || "latest");
    } catch (err) {
      setTrendingError(
        err instanceof Error ? err.message : "Failed to load trending posts.",
      );
    } finally {
      setTrendingLoading(false);
    }
  }, []);

  const loadGroupsOverview = useCallback(async () => {
    setGroupsLoading(true);
    setGroupError("");
    try {
      const [overviewRes, joinedRes] = await Promise.all([
        fetch(`${API_URL}/api/community/groups/overview`, {
          credentials: "include",
        }),
        fetch(`${API_URL}/api/community/groups?scope=joined&limit=40`, {
          credentials: "include",
        }),
      ]);
      const overviewData: CommunityGroupsOverviewResponse & { error?: string } =
        await overviewRes.json().catch(() => ({
          joinedGroups: [],
          discoverGroups: [],
          joinedCount: 0,
          joinedGroupIds: [],
        }));
      const joinedData: { groups: CommunityGroup[]; error?: string } =
        await joinedRes.json().catch(() => ({ groups: [] }));
      if (!overviewRes.ok) {
        throw new Error(overviewData.error || "Failed to load groups.");
      }
      if (!joinedRes.ok) {
        throw new Error(joinedData.error || "Failed to load joined groups.");
      }

      setJoinedGroups(overviewData.joinedGroups || []);
      setDiscoverGroups(overviewData.discoverGroups || []);
      setComposerGroups(joinedData.groups || []);
    } catch (err) {
      setGroupError(err instanceof Error ? err.message : "Failed to load groups.");
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  const syncGroupMembershipState = useCallback((nextGroup: CommunityGroup) => {
    setJoinedGroups((prev) =>
      nextGroup.joined
        ? upsertGroup(prev, nextGroup)
        : prev.filter((group) => group.id !== nextGroup.id),
    );
    setComposerGroups((prev) =>
      nextGroup.joined
        ? upsertGroup(prev, nextGroup)
        : prev.filter((group) => group.id !== nextGroup.id),
    );
    setDiscoverGroups((prev) => {
      const filtered = prev.filter((group) => group.id !== nextGroup.id);
      return nextGroup.joined ? filtered : upsertGroup(filtered, nextGroup);
    });
  }, []);

  useEffect(() => {
    void loadFeedPage();
  }, [loadFeedPage]);

  useEffect(() => {
    if (activeTab !== "my_posts") return;
    if (hasLoadedMine && minePage === 1) return;
    void loadMinePage();
  }, [activeTab, hasLoadedMine, loadMinePage, minePage]);

  useEffect(() => {
    void loadTrending();
  }, [loadTrending]);

  useEffect(() => {
    void loadGroupsOverview();
  }, [loadGroupsOverview]);

  useEffect(() => {
    if (trendingLoading || !trendingError) return;
    if (feedPosts.length === 0) return;

    setTrendingPosts(feedPosts.slice(0, 3));
    setTrendingMode("latest");
    setTrendingError("");
  }, [feedPosts, trendingError, trendingLoading]);

  const handleRefreshAfterSubmit = useCallback(async () => {
    await loadMineMeta();
    if (activeTab !== "my_posts") {
      return;
    }

    if (minePage !== 1) {
      setMinePage(1);
    } else {
      await loadMinePage();
    }
  }, [activeTab, loadMineMeta, loadMinePage, minePage]);

  const handleDeleteOwnPost = useCallback(async (postId: string) => {
    const res = await fetch(`${API_URL}/api/community/${postId}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Failed to delete post.");
    }

    if (hasLoadedMine && minePosts.length === 1 && minePage > 1) {
      setMinePage((page) => Math.max(1, page - 1));
    } else if (hasLoadedMine) {
      await loadMinePage();
    }

    if (feedPosts.length === 1 && feedPage > 1) {
      setFeedPage((page) => Math.max(1, page - 1));
    } else {
      await loadFeedPage();
    }

    await loadTrending();
  }, [
    feedPage,
    feedPosts.length,
    hasLoadedMine,
    loadFeedPage,
    loadMinePage,
    loadTrending,
    minePage,
    minePosts.length,
  ]);

  const handlePostLikeChanged = useCallback(async () => {
    await loadTrending();
  }, [loadTrending]);

  const handleToggleGroupMembership = useCallback(async (group: CommunityGroup) => {
    setBusyGroupId(group.id);
    setGroupError("");
    const optimisticGroup: CommunityGroup = {
      ...group,
      joined: !group.joined,
      memberCount: Math.max(
        0,
        Number(group.memberCount || 0) + (group.joined ? -1 : 1),
      ),
    };
    syncGroupMembershipState(optimisticGroup);
    try {
      const action = group.joined ? "leave" : "join";
      const res = await fetch(
        `${API_URL}/api/community/groups/${group.slug || group.id}/${action}`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Failed to ${action} group.`);
      }
      if (data.group) {
        syncGroupMembershipState(data.group);
      }
    } catch (err) {
      syncGroupMembershipState(group);
      setGroupError(err instanceof Error ? err.message : "Failed to update group.");
    } finally {
      setBusyGroupId(null);
    }
  }, [syncGroupMembershipState]);

  const handleCreateGroup = useCallback(async (payload: {
    name: string;
    description: string;
    topic: string;
  }) => {
    setIsCreatingGroup(true);
    setCreateGroupError("");
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

      setIsCreateGroupOpen(false);
      if (data.group) {
        syncGroupMembershipState(data.group);
      } else {
        await loadGroupsOverview();
      }
    } catch (err) {
      setCreateGroupError(
        err instanceof Error ? err.message : "Failed to create group.",
      );
    } finally {
      setIsCreatingGroup(false);
    }
  }, [loadGroupsOverview, syncGroupMembershipState]);

  const handleOpenCreateGroup = useCallback(() => {
    setIsCreateGroupOpen(true);
  }, []);

  const feedRange = useMemo(() => {
    const start = feedTotalPosts === 0 ? 0 : (feedPage - 1) * POSTS_PER_PAGE + 1;
    const end = Math.min(feedPage * POSTS_PER_PAGE, feedTotalPosts);
    return { start, end };
  }, [feedPage, feedTotalPosts]);

  const mineRange = useMemo(() => {
    const start = mineTotalPosts === 0 ? 0 : (minePage - 1) * POSTS_PER_PAGE + 1;
    const end = Math.min(minePage * POSTS_PER_PAGE, mineTotalPosts);
    return { start, end };
  }, [minePage, mineTotalPosts]);

  return (
    <div className="min-h-screen bg-[#060f1d] text-white flex transition-colors duration-300">
      <Sidebar />

      <main className="relative flex-1 ml-[60px] md:ml-72 min-h-screen overflow-x-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-24 bg-gradient-to-b from-[#060f1d] via-[#060f1d]/96 to-transparent" />

        <div className="relative z-10 max-w-[1500px] mx-auto flex justify-center gap-5 px-5 py-7">
          <section className="flex-1 min-w-0 max-w-[860px] space-y-5">
            <PostComposer
              summary={summary}
              postingAccess={postingAccess}
              availableGroups={composerGroups}
              onSubmitted={handleRefreshAfterSubmit}
            />

            <div className="flex items-center justify-between gap-3 rounded-xl bg-[#0c1728]/80 px-3 py-2.5 shadow-[0_14px_38px_rgba(0,0,0,0.2)]">
              <div className="inline-flex rounded-lg bg-white/[0.04] p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("feed")}
                  className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                    activeTab === "feed"
                      ? "bg-brand-500/25 text-brand-100"
                      : "text-gray-300 hover:bg-white/[0.06]"
                  }`}
                >
                  Feed
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("my_posts")}
                  className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                    activeTab === "my_posts"
                      ? "bg-brand-500/25 text-brand-100"
                      : "text-gray-300 hover:bg-white/[0.06]"
                  }`}
                >
                  My Posts
                </button>
              </div>
            </div>

            {activeTab === "feed" ? (
              feedLoading ? (
                <div className="rounded-2xl bg-[#0c1728]/82 py-24 flex items-center justify-center shadow-[0_22px_65px_rgba(0,0,0,0.22)]">
                  <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
                </div>
              ) : feedError ? (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-200">
                  {feedError}
                </div>
              ) : feedPosts.length === 0 ? (
                <div className="rounded-2xl bg-[#0c1728]/82 py-24 flex flex-col items-center justify-center text-center shadow-[0_22px_65px_rgba(0,0,0,0.22)]">
                  <Search className="w-10 h-10 mb-4 text-gray-500" />
                  <p className="text-base font-medium text-white">No approved posts yet</p>
                  <p className="mt-2 max-w-sm text-sm leading-7 text-gray-500">
                    Submit the first chess post. It will show up here after it
                    passes moderation.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {feedPosts.map((post, index) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        index={index}
                        canDelete={Boolean(user?.id && post.author?.id === user.id)}
                        onDelete={handleDeleteOwnPost}
                        onLikeChanged={handlePostLikeChanged}
                      />
                    ))}
                  </div>

                  {feedTotalPages > 1 && (
                    <div className="pt-2 pb-4 space-y-2.5">
                      <p className="text-center text-xs text-gray-500">
                        Showing {feedRange.start} - {feedRange.end} of {feedTotalPosts}
                      </p>
                      <FeedPagination
                        currentPage={feedPage}
                        totalPages={feedTotalPages}
                        onPageChange={setFeedPage}
                      />
                    </div>
                  )}
                </>
              )
            ) : mineLoading ? (
              <div className="rounded-2xl bg-[#0c1728]/82 py-24 flex items-center justify-center shadow-[0_22px_65px_rgba(0,0,0,0.22)]">
                <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
              </div>
            ) : mineError ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-200">
                {mineError}
              </div>
            ) : minePosts.length === 0 ? (
              <div className="rounded-2xl bg-[#0c1728]/82 py-24 flex flex-col items-center justify-center text-center shadow-[0_22px_65px_rgba(0,0,0,0.22)]">
                <Search className="w-10 h-10 mb-4 text-gray-500" />
                <p className="text-base font-medium text-white">No posts yet</p>
                <p className="mt-2 max-w-sm text-sm leading-7 text-gray-500">
                  Your submissions will appear here with their moderation status.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {minePosts.map((post, index) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      index={index}
                      canDelete={Boolean(user?.id && post.author?.id === user.id)}
                      onDelete={handleDeleteOwnPost}
                      onLikeChanged={handlePostLikeChanged}
                      showModerationStatus
                      preferCreatedTimestamp
                    />
                  ))}
                </div>

                {mineTotalPages > 1 && (
                  <div className="pt-2 pb-4 space-y-2.5">
                    <p className="text-center text-xs text-gray-500">
                      Showing {mineRange.start} - {mineRange.end} of {mineTotalPosts}
                    </p>
                    <FeedPagination
                      currentPage={minePage}
                      totalPages={mineTotalPages}
                      onPageChange={setMinePage}
                    />
                  </div>
                )}
              </>
            )}
          </section>

          <aside className="hidden xl:block w-80 shrink-0">
            <div className="sticky top-6 space-y-4">
              <TrendingWidget
                posts={trendingPosts}
                mode={trendingMode}
                loading={trendingLoading}
                error={trendingError}
              />
              {groupsLoading ? (
                <div className="rounded-2xl bg-[#0c1728]/82 px-5 py-10 text-center text-sm text-gray-500 shadow-[0_18px_55px_rgba(0,0,0,0.22)]">
                  Loading groups...
                </div>
              ) : (
                <CommunityGroupsSidebarSection
                  joinedGroups={joinedGroups}
                  discoverGroups={discoverGroups}
                  busyGroupId={busyGroupId}
                  onToggleGroup={handleToggleGroupMembership}
                  onOpenCreate={handleOpenCreateGroup}
                />
              )}
              {groupError && (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {groupError}
                </div>
              )}
              {!groupsLoading && joinedGroups.length === 0 && discoverGroups.length === 0 && (
                <div className="rounded-2xl bg-[#0c1728]/82 px-5 py-5 text-sm text-gray-400 shadow-[0_18px_55px_rgba(0,0,0,0.22)]">
                  No groups yet. Create the first one from here.
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>

      <CommunityGroupCreateModal
        open={isCreateGroupOpen}
        busy={isCreatingGroup}
        error={createGroupError}
        onClose={() => {
          if (isCreatingGroup) return;
          setIsCreateGroupOpen(false);
          setCreateGroupError("");
        }}
        onSubmit={handleCreateGroup}
      />
    </div>
  );
}

