import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2, MessageSquare, Users } from "lucide-react";
import Sidebar from "../components/Sidebar";
import {
  CommunityGroupAvatar,
  CommunityGroupCreateModal,
  CommunityGroupActionButton,
} from "../components/community/CommunityGroups";
import { FeedPagination } from "../components/community/FeedPagination";
import { PostCard } from "../components/community/PostCard";
import { PostComposer } from "../components/community/PostComposer";
import {
  API_URL,
  CommunityGroup,
  CommunityGroupDetailResponse,
  CommunityGroupPostsResponse,
  CommunityPost,
  CommunityPostingAccess,
  CommunityMineResponse,
  formatRelativeTime,
} from "../components/community/types";

const POSTS_PER_PAGE = 8;

export default function CommunityGroupDetail() {
  const { groupIdentifier = "" } = useParams();
  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyMembership, setBusyMembership] = useState(false);
  const [summary, setSummary] = useState<CommunityMineResponse["summary"] | null>(null);
  const [postingAccess, setPostingAccess] = useState<CommunityPostingAccess | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [createGroupError, setCreateGroupError] = useState("");

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
      // keep composer functional if this auxiliary request fails
    }
  }, []);

  const loadGroup = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(POSTS_PER_PAGE),
      });
      const [groupRes, postsRes] = await Promise.all([
        fetch(`${API_URL}/api/community/groups/${groupIdentifier}`, {
          credentials: "include",
        }),
        fetch(`${API_URL}/api/community/groups/${groupIdentifier}/posts?${params}`, {
          credentials: "include",
        }),
      ]);

      const groupData: CommunityGroupDetailResponse & { error?: string } =
        await groupRes.json().catch(() => ({ group: null }));
      const postsData: CommunityGroupPostsResponse & { error?: string } =
        await postsRes.json().catch(() => ({
          group: null,
          posts: [],
          total: 0,
          pagination: { page: 1, limit: POSTS_PER_PAGE, total: 0, pages: 1 },
        }));

      if (!groupRes.ok) {
        throw new Error(groupData.error || "Failed to load group.");
      }
      if (!postsRes.ok) {
        throw new Error(postsData.error || "Failed to load group posts.");
      }

      setGroup(groupData.group || postsData.group || null);
      setPosts(postsData.posts || []);
      setPages(postsData.pagination?.pages || 1);
      setTotal(postsData.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load group.");
    } finally {
      setLoading(false);
    }
  }, [groupIdentifier, page]);

  useEffect(() => {
    void loadGroup();
  }, [loadGroup]);

  useEffect(() => {
    void loadMineMeta();
  }, [loadMineMeta]);

  const handleToggleGroup = async () => {
    if (!group) return;
    setBusyMembership(true);
    setError("");
    const previousGroup = group;
    const optimisticGroup: CommunityGroup = {
      ...group,
      joined: !group.joined,
      memberCount: Math.max(
        0,
        Number(group.memberCount || 0) + (group.joined ? -1 : 1),
      ),
    };
    setGroup(optimisticGroup);
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
      setGroup(data.group || optimisticGroup);
      await loadMineMeta();
    } catch (err) {
      setGroup(previousGroup);
      setError(err instanceof Error ? err.message : "Failed to update group.");
    } finally {
      setBusyMembership(false);
    }
  };

  const handleRefreshAfterSubmit = async () => {
    await loadMineMeta();
  };

  const handleCreateGroup = async (payload: {
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
      setIsCreateOpen(false);
      setCreateGroupError("");
    } catch (err) {
      setCreateGroupError(err instanceof Error ? err.message : "Failed to create group.");
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const range = useMemo(() => {
    const start = total === 0 ? 0 : (page - 1) * POSTS_PER_PAGE + 1;
    const end = Math.min(page * POSTS_PER_PAGE, total);
    return { start, end };
  }, [page, total]);

  return (
    <div className="min-h-screen bg-[#060f1d] text-white flex transition-colors duration-300">
      <Sidebar />

      <main className="relative flex-1 ml-72 min-h-screen overflow-x-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-24 bg-gradient-to-b from-[#060f1d] via-[#060f1d]/96 to-transparent" />

        <div className="relative z-10 mx-auto max-w-[1500px] px-6 py-7">
          {loading ? (
            <div className="rounded-2xl bg-[#0c1728]/82 py-24 flex items-center justify-center shadow-[0_22px_65px_rgba(0,0,0,0.22)]">
              <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-200">
              {error}
            </div>
          ) : !group ? (
            <div className="rounded-2xl bg-[#0c1728]/82 py-24 text-center shadow-[0_22px_65px_rgba(0,0,0,0.22)]">
              <Users className="mx-auto h-10 w-10 text-gray-500" />
              <div className="mt-4 text-lg font-semibold text-white">Group not found</div>
              <p className="mt-2 text-sm text-gray-500">
                This group may have been removed.
              </p>
            </div>
          ) : (
            <>
              <section className="rounded-[28px] bg-[#0c1728]/84 p-6 shadow-[0_22px_65px_rgba(0,0,0,0.24)]">
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div className="flex min-w-0 flex-1 items-start gap-4">
                    <CommunityGroupAvatar group={group} size="lg" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-200/70">
                        Public Group
                      </div>
                      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
                        {group.name}
                      </h1>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <span>{group.memberCount} members</span>
                        {group.topic && (
                          <span className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] text-gray-400">
                            {group.topic}
                          </span>
                        )}
                        {group.creator && <span>by {group.creator.fullName}</span>}
                        {group.createdAt && (
                          <span>created {formatRelativeTime(group.createdAt)}</span>
                        )}
                      </div>
                      <p className="mt-4 max-w-3xl text-sm leading-7 text-gray-400">
                        {group.description || "A NeonGambit public group for chess discussion and shared posts."}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Link
                      to="/community/groups"
                      className="rounded-xl bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-gray-200 transition-colors hover:bg-white/[0.12]"
                    >
                      All groups
                    </Link>
                    <CommunityGroupActionButton
                      group={group}
                      busy={busyMembership}
                      onToggle={() => void handleToggleGroup()}
                    />
                  </div>
                </div>
              </section>

              <section className="mt-6">
                {group.joined ? (
                  <PostComposer
                    summary={summary}
                    postingAccess={postingAccess}
                    availableGroups={[group]}
                    defaultGroupId={group.id}
                    lockGroupSelection
                    onSubmitted={handleRefreshAfterSubmit}
                  />
                ) : (
                  <div className="rounded-2xl bg-[#0c1728]/82 px-5 py-5 shadow-[0_18px_55px_rgba(0,0,0,0.22)]">
                    <div className="text-sm font-semibold text-white">
                      Join this group to post here
                    </div>
                    <p className="mt-2 text-sm leading-7 text-gray-400">
                      You can browse approved posts, but group posting is limited to members.
                    </p>
                    <div className="mt-4 flex items-center gap-3">
                      <CommunityGroupActionButton
                        group={group}
                        busy={busyMembership}
                        onToggle={() => void handleToggleGroup()}
                      />
                      <button
                        type="button"
                        onClick={() => setIsCreateOpen(true)}
                        className="rounded-xl bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-gray-200 transition-colors hover:bg-white/[0.12]"
                      >
                        Create another group
                      </button>
                    </div>
                  </div>
                )}
              </section>

              <section className="mt-6">
                <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">
                  Group Feed
                </div>
                {posts.length === 0 ? (
                  <div className="rounded-2xl bg-[#0c1728]/82 px-6 py-20 text-center shadow-[0_22px_65px_rgba(0,0,0,0.22)]">
                    <MessageSquare className="mx-auto h-10 w-10 text-gray-500" />
                    <div className="mt-4 text-lg font-semibold text-white">
                      No approved posts yet
                    </div>
                    <p className="mt-2 text-sm leading-7 text-gray-500">
                      {group.joined
                        ? "Share the first post for this group. It will appear here after moderation."
                        : "Join the group and help start the conversation."}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-4">
                      {posts.map((post, index) => (
                        <PostCard key={post.id} post={post} index={index} />
                      ))}
                    </div>

                    {pages > 1 && (
                      <div className="pt-2 pb-4 space-y-2.5">
                        <p className="text-center text-xs text-gray-500">
                          Showing {range.start} - {range.end} of {total}
                        </p>
                        <FeedPagination
                          currentPage={page}
                          totalPages={pages}
                          onPageChange={setPage}
                        />
                      </div>
                    )}
                  </>
                )}
              </section>
            </>
          )}
        </div>
      </main>

      <CommunityGroupCreateModal
        open={isCreateOpen}
        busy={isCreatingGroup}
        error={createGroupError}
        onClose={() => {
          if (isCreatingGroup) return;
          setIsCreateOpen(false);
          setCreateGroupError("");
        }}
        onSubmit={handleCreateGroup}
      />
    </div>
  );
}

