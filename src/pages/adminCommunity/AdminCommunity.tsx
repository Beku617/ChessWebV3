import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check,
  ChevronDown,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Pencil,
  PlayCircle,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import AdminSidebar from "../../components/AdminSidebar";
import { FeedPagination } from "../../components/community/FeedPagination";
import { useAdminStore } from "../../store/adminStore";
import {
  API_URL,
  CommunityPost,
  CommunityPostingRestrictionState,
  formatFileSize,
  formatRelativeTime,
  getInitials,
  resolveAssetUrl,
} from "../../components/community/types";
import { Avatar, RatingPill } from "../../components/community/CommunityUI";

type FilterOption = {
  value: string;
  label: string;
};

function FilterDropdown({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [isOpen]);

  const selected =
    options.find((option) => option.value === value) || options[0] || null;

  return (
    <div ref={containerRef} className="relative min-w-[140px] z-[140]">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="w-full inline-flex items-center justify-between gap-2 rounded-lg bg-white/[0.06] px-4 py-3 text-sm text-white hover:bg-white/[0.1] focus:outline-none focus:ring-2 focus:ring-teal-500/30 transition-colors"
      >
        <span className="truncate">{selected?.label || "Select"}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute z-[180] mt-2 w-full rounded-xl border border-white/10 bg-[#0f1a2d] shadow-[0_18px_48px_rgba(0,0,0,0.35)] p-1">
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={`${ariaLabel}-${option.value || "all"}`}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-teal-500/20 text-teal-100"
                    : "text-gray-200 hover:bg-white/[0.08]"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

type CommunityStats = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  removed: number;
};

type AdminCommunityResponse = {
  posts: (CommunityPost & {
    reviewedBy?: { id: string; username: string; email: string } | null;
    authorPostingRestriction?: CommunityPostingRestrictionState | null;
    authorPostingRateLimitBypass?: boolean;
  })[];
  stats: CommunityStats;
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
};

const DEFAULT_STATS: CommunityStats = {
  total: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
  removed: 0,
};

function statusClass(status: string) {
  if (status === "approved") {
    return "bg-teal-500/12 text-teal-200";
  }
  if (status === "rejected") {
    return "bg-red-500/12 text-red-200";
  }
  return "bg-amber-500/12 text-amber-200";
}

type RestrictionDuration = "none" | "1d" | "3d" | "7d" | "30d" | "forever";
type RestrictionDraft = {
  duration: RestrictionDuration;
  reason: string;
  unlimitedPosts: boolean;
};

function formatRestrictionLabel(
  restriction?: CommunityPostingRestrictionState | null,
) {
  if (!restriction?.active) return "No restriction";
  if (restriction.forever) return "Restricted forever";
  const until = restriction.until ? new Date(restriction.until) : null;
  if (until && Number.isFinite(until.getTime())) {
    return `Restricted until ${until.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })}`;
  }
  return "Temporarily restricted";
}

function inferRestrictionDuration(
  restriction?: CommunityPostingRestrictionState | null,
): RestrictionDuration {
  if (!restriction?.active) return "none";
  if (restriction.forever) return "forever";
  if (!restriction.until) return "1d";
  const untilMs = new Date(restriction.until).getTime();
  if (!Number.isFinite(untilMs)) return "1d";
  const remainingMs = Math.max(0, untilMs - Date.now());
  if (remainingMs >= 29 * 24 * 60 * 60 * 1000) return "30d";
  if (remainingMs >= 6 * 24 * 60 * 60 * 1000) return "7d";
  if (remainingMs >= 2 * 24 * 60 * 60 * 1000) return "3d";
  return "1d";
}

export default function AdminCommunity() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading, checkAuth } = useAdminStore();
  const [posts, setPosts] = useState<AdminCommunityResponse["posts"]>([]);
  const [stats, setStats] = useState<CommunityStats>(DEFAULT_STATS);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [mediaFilter, setMediaFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [activeRejectId, setActiveRejectId] = useState<string | null>(null);
  const [rejectionDrafts, setRejectionDrafts] = useState<Record<string, string>>(
    {},
  );
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(
    null,
  );
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createText, setCreateText] = useState("");
  const [createStatus, setCreateStatus] = useState("approved");
  const [createRejectionReason, setCreateRejectionReason] = useState("");
  const [createMediaFile, setCreateMediaFile] = useState<File | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editStatus, setEditStatus] = useState("pending");
  const [editRejectionReason, setEditRejectionReason] = useState("");
  const [editRemoveMedia, setEditRemoveMedia] = useState(false);
  const [editMediaFile, setEditMediaFile] = useState<File | null>(null);
  const [restrictionDrafts, setRestrictionDrafts] = useState<
    Record<string, RestrictionDraft>
  >({});
  const [restrictionProcessingUserId, setRestrictionProcessingUserId] = useState<
    string | null
  >(null);
  const [rateLimitBypassProcessingUserId, setRateLimitBypassProcessingUserId] =
    useState<string | null>(null);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (!previewImage) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewImage(null);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [previewImage]);

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;

    async function loadPosts() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: "8",
        });
        if (statusFilter) params.set("status", statusFilter);
        if (mediaFilter) params.set("mediaType", mediaFilter);
        if (search.trim()) params.set("search", search.trim());

        const res = await fetch(`${API_URL}/api/admin/community?${params}`, {
          credentials: "include",
        });
        const data: AdminCommunityResponse & { error?: string } = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to load moderation queue.");
        }
        if (cancelled) return;
        setPosts(data.posts || []);
        setStats(data.stats || DEFAULT_STATS);
        setPages(data.pagination?.pages || 1);
        setTotal(data.pagination?.total || 0);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load moderation queue.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPosts();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, mediaFilter, page, search, statusFilter]);

  useEffect(() => {
    if (posts.length === 0) return;
    setRestrictionDrafts((previous) => {
      const next = { ...previous };
      for (const post of posts) {
        const authorId = String(post.author?.id || "");
        if (!authorId || next[authorId]) continue;
        next[authorId] = {
          duration: inferRestrictionDuration(post.authorPostingRestriction),
          reason: post.authorPostingRestriction?.reason || "",
          unlimitedPosts: Boolean(post.authorPostingRateLimitBypass),
        };
      }
      return next;
    });
  }, [posts]);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 2800);
  };

  const refreshCurrentPage = async () => {
    const params = new URLSearchParams({
      page: String(page),
      limit: "8",
    });
    if (statusFilter) params.set("status", statusFilter);
    if (mediaFilter) params.set("mediaType", mediaFilter);
    if (search.trim()) params.set("search", search.trim());

    const res = await fetch(`${API_URL}/api/admin/community?${params}`, {
      credentials: "include",
    });
    const data: AdminCommunityResponse & { error?: string } = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to refresh moderation queue.");
    }
    setPosts(data.posts || []);
    setStats(data.stats || DEFAULT_STATS);
    setPages(data.pagination?.pages || 1);
    setTotal(data.pagination?.total || 0);
  };

  const runAction = async (
    postId: string,
    request: () => Promise<Response>,
    successMessage: string,
  ) => {
    setProcessingId(postId);
    setActionError("");
    try {
      const res = await request();
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to update post.");
      }
      await refreshCurrentPage();
      showToast("success", successMessage);
      setActiveRejectId(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update post.";
      setActionError(message);
      showToast("error", message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleApprove = async (postId: string) => {
    await runAction(
      postId,
      () =>
        fetch(`${API_URL}/api/admin/community/${postId}/approve`, {
          method: "PATCH",
          credentials: "include",
        }),
      "Post approved.",
    );
  };

  const handleReject = async (postId: string) => {
    const rejectionReason = (rejectionDrafts[postId] || "").trim();
    await runAction(
      postId,
      () =>
        fetch(`${API_URL}/api/admin/community/${postId}/reject`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rejectionReason }),
        }),
      "Post rejected.",
    );
  };

  const handleDelete = async (postId: string) => {
    const confirmed = window.confirm(
      "Delete this post permanently? The uploaded media will be removed too.",
    );
    if (!confirmed) return;

    await runAction(
      postId,
      () =>
        fetch(`${API_URL}/api/admin/community/${postId}`, {
          method: "DELETE",
          credentials: "include",
        }),
      "Post deleted.",
    );
  };

  const setRestrictionDraftValue = (
    userId: string,
    patch: Partial<RestrictionDraft>,
  ) => {
    if (!userId) return;
    setRestrictionDrafts((previous) => ({
      ...previous,
      [userId]: {
        duration: "none",
        reason: "",
        unlimitedPosts: false,
        ...(previous[userId] || {}),
        ...patch,
      },
    }));
  };

  const updatePostingRestriction = async (
    userId: string,
    duration: RestrictionDuration,
    reason: string,
  ) => {
    if (!userId) return;
    setRestrictionProcessingUserId(userId);
    setActionError("");
    try {
      const res = await fetch(
        `${API_URL}/api/admin/community/users/${userId}/posting-restriction`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ duration, reason: reason.trim() }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to update posting restriction.");
      }

      await refreshCurrentPage();
      showToast(
        "success",
        duration === "none"
          ? "Posting restriction removed."
          : "Posting restriction updated.",
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update posting restriction.";
      setActionError(message);
      showToast("error", message);
    } finally {
      setRestrictionProcessingUserId(null);
    }
  };

  const updatePostingRateLimitBypass = async (
    userId: string,
    enabled: boolean,
  ) => {
    if (!userId) return;
    setRateLimitBypassProcessingUserId(userId);
    setActionError("");
    try {
      const res = await fetch(
        `${API_URL}/api/admin/community/users/${userId}/posting-rate-limit-bypass`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to update posting limit access.");
      }

      setRestrictionDraftValue(userId, { unlimitedPosts: enabled });
      await refreshCurrentPage();
      showToast(
        "success",
        enabled
          ? "Unlimited posting enabled for this user."
          : "Standard posting limit restored.",
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to update posting limit access.";
      setActionError(message);
      showToast("error", message);
    } finally {
      setRateLimitBypassProcessingUserId(null);
    }
  };

  const resetCreateDraft = () => {
    setCreateText("");
    setCreateStatus("approved");
    setCreateRejectionReason("");
    setCreateMediaFile(null);
  };

  const handleCreatePost = async () => {
    if (isCreating) return;
    setIsCreating(true);
    setActionError("");
    try {
      const formData = new FormData();
      if (createText.trim()) formData.append("text", createText.trim());
      formData.append("status", createStatus);
      if (createStatus === "rejected" && createRejectionReason.trim()) {
        formData.append("rejectionReason", createRejectionReason.trim());
      }
      if (createMediaFile) formData.append("media", createMediaFile);

      const res = await fetch(`${API_URL}/api/admin/community`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to create post.");
      }

      resetCreateDraft();
      setIsCreateOpen(false);
      await refreshCurrentPage();
      showToast("success", "Post created.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create post.";
      setActionError(message);
      showToast("error", message);
    } finally {
      setIsCreating(false);
    }
  };

  const startEditPost = (post: AdminCommunityResponse["posts"][number]) => {
    setEditingPostId(post.id);
    setEditText(post.text || "");
    setEditStatus(post.status || "pending");
    setEditRejectionReason(post.rejectionReason || "");
    setEditRemoveMedia(false);
    setEditMediaFile(null);
  };

  const cancelEditPost = () => {
    setEditingPostId(null);
    setEditText("");
    setEditStatus("pending");
    setEditRejectionReason("");
    setEditRemoveMedia(false);
    setEditMediaFile(null);
  };

  const handleSaveEdit = async (postId: string) => {
    setProcessingId(postId);
    setActionError("");
    try {
      const formData = new FormData();
      formData.append("text", editText.trim());
      formData.append("status", editStatus);
      if (editStatus === "rejected" && editRejectionReason.trim()) {
        formData.append("rejectionReason", editRejectionReason.trim());
      } else {
        formData.append("rejectionReason", "");
      }
      if (editRemoveMedia) formData.append("removeMedia", "true");
      if (editMediaFile) formData.append("media", editMediaFile);

      const res = await fetch(`${API_URL}/api/admin/community/${postId}`, {
        method: "PATCH",
        credentials: "include",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to update post.");
      }

      await refreshCurrentPage();
      cancelEditPost();
      showToast("success", "Post updated.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update post.";
      setActionError(message);
      showToast("error", message);
    } finally {
      setProcessingId(null);
    }
  };

  const statPills = useMemo(
    () => [
      {
        label: "Pending",
        value: stats.pending,
        filterValue: "pending",
        tone: "text-amber-300 bg-amber-500/10",
      },
      {
        label: "Approved",
        value: stats.approved,
        filterValue: "approved",
        tone: "text-teal-300 bg-teal-500/10",
      },
      {
        label: "Rejected",
        value: stats.rejected,
        filterValue: "rejected",
        tone: "text-red-300 bg-red-500/10",
      },
      {
        label: "Total",
        value: stats.total,
        filterValue: "",
        tone: "text-gray-300 bg-white/[0.06]",
      },
    ],
    [stats],
  );

  const postStatusOptions = useMemo<FilterOption[]>(
    () => [
      { value: "approved", label: "Approved" },
      { value: "pending", label: "Pending" },
      { value: "rejected", label: "Rejected" },
      { value: "removed", label: "Removed" },
    ],
    [],
  );

  const statusOptions = useMemo<FilterOption[]>(
    () => [
      { value: "", label: "All statuses" },
      { value: "pending", label: "Pending" },
      { value: "approved", label: "Approved" },
      { value: "rejected", label: "Rejected" },
      { value: "removed", label: "Removed" },
    ],
    [],
  );

  const mediaOptions = useMemo<FilterOption[]>(
    () => [
      { value: "", label: "All media" },
      { value: "none", label: "Text only" },
      { value: "image", label: "Image" },
      { value: "video", label: "Video" },
    ],
    [],
  );

  const restrictionDurationOptions = useMemo<FilterOption[]>(
    () => [
      { value: "none", label: "No restriction" },
      { value: "1d", label: "1 day" },
      { value: "3d", label: "3 days" },
      { value: "7d", label: "7 days" },
      { value: "30d", label: "30 days" },
      { value: "forever", label: "Forever" },
    ],
    [],
  );

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#060f1d] text-white">
      <AdminSidebar />

      {toast && (
        <div
          className={`fixed top-5 right-5 z-[90] px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 ${
            toast.type === "success" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
          }`}
        >
                      {toast.type === "success" ? (
            <Check className="w-4 h-4" />
          ) : (
            <X className="w-4 h-4" />
          )}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {previewImage && (
        <div
          className="fixed inset-0 z-[130] bg-black/90 backdrop-blur-sm p-4 sm:p-8 flex items-center justify-center"
          onClick={() => setPreviewImage(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Close image preview"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={previewImage.src}
            alt={previewImage.alt}
            className="w-[94vw] h-[90vh] object-contain rounded-lg"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}

      <main className="ml-72 px-8 py-7">
        <div className="max-w-[1400px]">
          <section className="relative z-30 rounded-2xl bg-[#0c1728]/82 backdrop-blur p-5 mb-6 shadow-[0_18px_55px_rgba(0,0,0,0.22)]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {statPills.map((pill) => (
                  <button
                    key={pill.label}
                    type="button"
                    onClick={() => {
                      setStatusFilter(pill.filterValue);
                      setPage(1);
                    }}
                    className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm transition-colors ${
                      pill.tone
                    } ${
                      statusFilter === pill.filterValue
                        ? "ring-1 ring-white/25"
                        : "opacity-85 hover:opacity-100"
                    }`}
                  >
                    <span className="text-gray-400">{pill.label}</span>
                    <span className="font-semibold text-white">{pill.value}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setIsCreateOpen((value) => !value)}
                className="inline-flex items-center gap-2 rounded-full bg-white/[0.08] px-3.5 py-2 text-sm text-gray-200 hover:bg-white/[0.14] transition-colors shrink-0"
              >
                {isCreateOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {isCreateOpen ? "Close" : "New Post"}
              </button>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <div className="flex-1 min-w-[260px]">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Search by author, caption, or file name..."
                    className="w-full rounded-lg bg-white/[0.06] pl-11 pr-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                  />
                </div>
              </div>

              <FilterDropdown
                ariaLabel="Status filter"
                value={statusFilter}
                options={statusOptions}
                onChange={(value) => {
                  setStatusFilter(value);
                  setPage(1);
                }}
              />

              <FilterDropdown
                ariaLabel="Media filter"
                value={mediaFilter}
                options={mediaOptions}
                onChange={(value) => {
                  setMediaFilter(value);
                  setPage(1);
                }}
              />
            </div>

            {isCreateOpen && (
              <div className="mt-4 space-y-3">
                <textarea
                  value={createText}
                  onChange={(e) => setCreateText(e.target.value)}
                  placeholder="Post text..."
                  className="w-full min-h-[120px] rounded-xl bg-white/[0.05] px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                />
                <div className="max-w-[220px]">
                  <FilterDropdown
                    ariaLabel="Create post status"
                    value={createStatus}
                    options={postStatusOptions}
                    onChange={setCreateStatus}
                  />
                </div>
                {createStatus === "rejected" && (
                  <input
                    value={createRejectionReason}
                    onChange={(e) => setCreateRejectionReason(e.target.value)}
                    placeholder="Rejection reason"
                    className="w-full rounded-lg bg-white/[0.06] px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                  />
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                  onChange={(e) => setCreateMediaFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-white/[0.1] file:px-3 file:py-2 file:text-sm file:text-gray-100 hover:file:bg-white/[0.16]"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleCreatePost}
                    disabled={isCreating}
                    className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    {isCreating ? "Creating..." : "Create Post"}
                  </button>
                </div>
              </div>
            )}
          </section>

          {error && (
            <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}
          {actionError && (
            <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {actionError}
            </div>
          )}

          {loading ? (
            <div className="py-24 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
            </div>
          ) : posts.length === 0 ? (
            <div className="rounded-2xl bg-[#0c1728]/82 py-24 text-center shadow-[0_24px_75px_rgba(0,0,0,0.24)]">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 text-gray-500" />
              <p className="text-base font-medium text-white">No posts found</p>
              <p className="mt-2 text-sm text-gray-500">
                Try a different status or search filter.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {posts.map((post) => {
                const authorName = post.author?.fullName || "Chess Player";
                const authorId = String(post.author?.id || "");
                const mediaUrl = resolveAssetUrl(post.mediaUrl);
                const rejectionDraft = rejectionDrafts[post.id] || "";
                const isBusy = processingId === post.id;
                const showRejectBox = activeRejectId === post.id;
                const isEditing = editingPostId === post.id;
                const restriction = post.authorPostingRestriction || null;
                const restrictionDraft = authorId
                  ? restrictionDrafts[authorId] || {
                      duration: inferRestrictionDuration(restriction),
                      reason: restriction?.reason || "",
                      unlimitedPosts: Boolean(post.authorPostingRateLimitBypass),
                    }
                  : null;
                const isRestrictionBusy = restrictionProcessingUserId === authorId;
                const isRateLimitBypassBusy =
                  rateLimitBypassProcessingUserId === authorId;

                return (
                  <article
                    key={post.id}
                    className="group overflow-hidden rounded-xl bg-[#0c1728]/84 backdrop-blur-xl shadow-[0_18px_48px_rgba(0,0,0,0.22)]"
                  >
                    <div className="grid xl:grid-cols-[minmax(0,1fr)_300px]">
                      <div className="min-w-0">
                        <div className="px-4 pt-4 pb-3">
                          <div className="flex items-start gap-3">
                            <Avatar
                              initials={getInitials(authorName)}
                              src={post.author?.avatar}
                              size="sm"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-semibold text-white">
                                  {authorName}
                                </h3>
                                <RatingPill rating={Number(post.author?.rating || 0)} />
                              </div>
                              <div className="mt-0.5 text-xs text-gray-500">
                                Submitted {formatRelativeTime(post.createdAt)}
                              </div>
                            </div>
                          </div>

                          {post.text && (
                            <div className="mt-2.5 whitespace-pre-wrap text-sm leading-6 text-gray-200">
                              {post.text}
                            </div>
                          )}

                          {isEditing && (
                            <div className="mt-4 space-y-3 rounded-xl bg-white/[0.05] p-3">
                              <textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                placeholder="Edit post text..."
                                className="w-full min-h-[120px] rounded-lg bg-white/[0.06] px-3.5 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                              />
                              <div className="max-w-[220px]">
                                <FilterDropdown
                                  ariaLabel="Edit post status"
                                  value={editStatus}
                                  options={postStatusOptions}
                                  onChange={setEditStatus}
                                />
                              </div>
                              {editStatus === "rejected" && (
                                <input
                                  value={editRejectionReason}
                                  onChange={(e) => setEditRejectionReason(e.target.value)}
                                  placeholder="Rejection reason"
                                  className="w-full rounded-lg bg-white/[0.06] px-3.5 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                                />
                              )}
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                                onChange={(e) => setEditMediaFile(e.target.files?.[0] || null)}
                                className="block w-full text-sm text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-white/[0.1] file:px-3 file:py-2 file:text-sm file:text-gray-100 hover:file:bg-white/[0.16]"
                              />
                              {post.mediaType !== "none" && (
                                <label className="inline-flex items-center gap-2 text-xs text-gray-400">
                                  <input
                                    type="checkbox"
                                    checked={editRemoveMedia}
                                    onChange={(e) => setEditRemoveMedia(e.target.checked)}
                                    className="rounded border-white/20 bg-transparent text-teal-500 focus:ring-teal-500/30"
                                  />
                                  Remove existing media
                                </label>
                              )}
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={cancelEditPost}
                                  className="inline-flex items-center gap-2 rounded-lg bg-white/[0.08] px-3.5 py-2 text-sm text-gray-200 hover:bg-white/[0.14]"
                                >
                                  <X className="w-4 h-4" />
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleSaveEdit(post.id)}
                                  className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
                                >
                                  <Check className="w-4 h-4" />
                                  Save
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {post.mediaType !== "none" && mediaUrl && (
                          <div className="px-4 pb-3">
                            <div className="overflow-hidden rounded-[14px] bg-black/45">
                              {post.mediaType === "video" ? (
                                <video
                                  src={mediaUrl}
                                  controls
                                  playsInline
                                  preload="metadata"
                                  className="w-full max-h-[360px] bg-black object-contain"
                                />
                              ) : (
                                <img
                                  src={mediaUrl}
                                  alt={post.mediaOriginalName || "Community post media"}
                                  className="w-full max-h-[360px] object-contain bg-black cursor-zoom-in"
                                  onClick={() =>
                                    setPreviewImage({
                                      src: mediaUrl,
                                      alt: post.mediaOriginalName || "Community post media",
                                    })
                                  }
                                />
                              )}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-4 px-4 pb-4 pt-1 text-xs text-gray-500">
                          <div className="inline-flex items-center gap-2">
                            {post.mediaType === "video" ? (
                              <>
                                <PlayCircle className="w-3.5 h-3.5 text-teal-300" />
                                <span>Video</span>
                              </>
                            ) : post.mediaType === "image" ? (
                              <>
                                <ImageIcon className="w-3.5 h-3.5 text-teal-300" />
                                <span>Image</span>
                              </>
                            ) : (
                              <span>Text only</span>
                            )}
                          </div>
                          {post.mediaType !== "none" && (
                            <span>{formatFileSize(post.mediaSize)}</span>
                          )}
                        </div>
                      </div>

                      <aside className="bg-black/15 p-5 flex flex-col gap-4">
                        <div className="flex items-start justify-between gap-3">
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold ${statusClass(
                              post.status,
                            )}`}
                          >
                            {post.status}
                          </span>
                          <span className="text-xs text-gray-500 text-right">
                            {post.reviewedAt
                              ? `Reviewed ${formatRelativeTime(post.reviewedAt)}`
                              : "Awaiting review"}
                          </span>
                        </div>

                        <div className="space-y-3 rounded-xl bg-white/[0.05] p-4">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-500 uppercase tracking-[0.16em] text-[11px]">
                              Media
                            </span>
                            <span className="text-gray-200 capitalize">
                              {post.mediaType === "none" ? "Text only" : post.mediaType}
                            </span>
                          </div>
                          {post.reviewedBy && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-500 uppercase tracking-[0.16em] text-[11px]">
                                Reviewed by
                              </span>
                              <span className="text-gray-200">
                                {post.reviewedBy.username}
                              </span>
                            </div>
                          )}
                        </div>

                        {authorId && restrictionDraft && (
                          <div className="space-y-3 rounded-xl bg-white/[0.05] p-4">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-gray-500 uppercase tracking-[0.16em] text-[11px]">
                                Posting access
                              </span>
                              <span
                                className={`text-[11px] font-semibold ${
                                  restriction?.active ? "text-amber-200" : "text-emerald-200"
                                }`}
                              >
                                {formatRestrictionLabel(restriction)}
                              </span>
                            </div>

                            <div className="space-y-2.5">
                              <div className="flex items-center justify-between rounded-lg bg-white/[0.06] px-3.5 py-2.5 text-xs">
                                <span className="text-gray-300">Posting quota</span>
                                <span
                                  className={`font-semibold ${
                                    restrictionDraft.unlimitedPosts
                                      ? "text-emerald-200"
                                      : "text-gray-400"
                                  }`}
                                >
                                  {restrictionDraft.unlimitedPosts
                                    ? "Unlimited enabled"
                                    : "5 posts / 3 hours"}
                                </span>
                              </div>

                              <button
                                type="button"
                                disabled={isRateLimitBypassBusy}
                                onClick={() =>
                                  updatePostingRateLimitBypass(
                                    authorId,
                                    !restrictionDraft.unlimitedPosts,
                                  )
                                }
                                className={`w-full inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
                                  restrictionDraft.unlimitedPosts
                                    ? "bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                                    : "bg-white/[0.08] text-gray-100 hover:bg-white/[0.14]"
                                }`}
                              >
                                {isRateLimitBypassBusy
                                  ? "Saving..."
                                  : restrictionDraft.unlimitedPosts
                                    ? "Disable unlimited posting"
                                    : "Enable unlimited posting"}
                              </button>

                              <FilterDropdown
                                ariaLabel={`Posting restriction for ${authorName}`}
                                value={restrictionDraft.duration}
                                options={restrictionDurationOptions}
                                onChange={(value) =>
                                  setRestrictionDraftValue(authorId, {
                                    duration: value as RestrictionDuration,
                                  })
                                }
                              />

                              <input
                                value={restrictionDraft.reason}
                                onChange={(e) =>
                                  setRestrictionDraftValue(authorId, {
                                    reason: e.target.value,
                                  })
                                }
                                placeholder="Optional restriction reason..."
                                className="w-full rounded-lg bg-white/[0.06] px-3.5 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                              />

                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={isRestrictionBusy}
                                  onClick={() =>
                                    updatePostingRestriction(
                                      authorId,
                                      restrictionDraft.duration,
                                      restrictionDraft.reason,
                                    )
                                  }
                                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-white/[0.08] px-3.5 py-2.5 text-sm font-semibold text-gray-100 hover:bg-white/[0.14] disabled:opacity-50"
                                >
                                  {isRestrictionBusy ? "Saving..." : "Apply restriction"}
                                </button>

                                {restriction?.active && (
                                  <button
                                    type="button"
                                    disabled={isRestrictionBusy}
                                    onClick={() => {
                                      setRestrictionDraftValue(authorId, {
                                        duration: "none",
                                        reason: "",
                                      });
                                      void updatePostingRestriction(authorId, "none", "");
                                    }}
                                    className="inline-flex items-center justify-center rounded-lg bg-emerald-500/15 px-3.5 py-2.5 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {post.rejectionReason && (
                          <div className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-200">
                            <span className="font-semibold">Reason:</span>{" "}
                            {post.rejectionReason}
                          </div>
                        )}

                        {showRejectBox && (
                          <textarea
                            value={rejectionDraft}
                            onChange={(e) =>
                              setRejectionDrafts((prev) => ({
                                ...prev,
                                [post.id]: e.target.value,
                              }))
                            }
                            placeholder="Optional rejection reason..."
                            className="w-full min-h-[110px] rounded-xl bg-white/[0.05] px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                          />
                        )}

                        <div className="mt-auto flex flex-col gap-2">
                          {!isEditing && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => startEditPost(post)}
                              className="inline-flex items-center justify-center gap-2 rounded-lg bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-gray-300 hover:bg-white/[0.1] disabled:opacity-50"
                            >
                              <Pencil className="w-4 h-4" />
                              Edit
                            </button>
                          )}

                          {post.status !== "approved" && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleApprove(post.id)}
                              className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
                            >
                              <Check className="w-4 h-4" />
                              Approve
                            </button>
                          )}

                          {showRejectBox ? (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleReject(post.id)}
                                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-red-500/12 px-4 py-2.5 text-sm font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-50"
                              >
                                <X className="w-4 h-4" />
                                Confirm reject
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => setActiveRejectId(null)}
                                className="inline-flex items-center justify-center rounded-lg bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-gray-300 hover:bg-white/[0.1] disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : post.status !== "rejected" ? (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setActiveRejectId(post.id)}
                              className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-500/12 px-4 py-2.5 text-sm font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-50"
                            >
                              <X className="w-4 h-4" />
                              Reject
                            </button>
                          ) : null}

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleDelete(post.id)}
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-gray-300 hover:bg-white/[0.1] disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </button>
                        </div>
                      </aside>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {pages > 1 && (
            <div className="mt-6 space-y-2.5 px-1">
              <p className="text-xs text-gray-500 text-center">
                Showing {(page - 1) * 8 + 1} - {Math.min(page * 8, total)} of {total}
              </p>
              <FeedPagination
                currentPage={page}
                totalPages={pages}
                onPageChange={setPage}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
