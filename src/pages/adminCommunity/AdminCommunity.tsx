import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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
import { useThemeStore } from "../../store/themeStore";
import {
  API_URL,
  CommunityPost,
  CommunityPostingRestrictionState,
  formatCommunityResult,
  formatCommunityTimeControl,
  formatFileSize,
  formatRelativeTime,
  getCommunityMediaItems,
  getCommunityOpeningLabel,
  getInitials,
  resolveAssetUrl,
} from "../../components/community/types";
import { Avatar } from "../../components/community/CommunityUI";
import { CommunityGameViewer } from "../../components/community/CommunityGameViewer";
import { CommunityImageGrid } from "../../components/community/CommunityImageGrid";

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
        className="w-full inline-flex items-center justify-between gap-2 rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-900 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30 transition-colors dark:bg-white/[0.06] dark:text-white dark:hover:bg-white/[0.1]"
      >
        <span className="truncate">{selected?.label || "Select"}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute z-[180] mt-2 w-full rounded-xl border border-gray-200 bg-white shadow-[0_18px_48px_rgba(0,0,0,0.16)] p-1 dark:border-white/10 dark:bg-[#0f1a2d] dark:shadow-[0_18px_48px_rgba(0,0,0,0.35)]">
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
                    ? "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-100"
                    : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/[0.08]"
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
    return "bg-teal-500/10 text-teal-200";
  }
  if (status === "rejected") {
    return "bg-red-500/10 text-red-200";
  }
  if (status === "removed") {
    return "bg-gray-500/15 text-gray-300";
  }
  return "bg-amber-500/10 text-amber-200";
}

function formatStatusLabel(status: string) {
  if (!status) return "Pending";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatAdminContentType(post: CommunityPost) {
  if (post.postType === "game") return "Shared game";
  const mediaItems = getCommunityMediaItems(post);
  if (post.mediaType === "video") return "Video";
  if (post.mediaType === "image" && mediaItems.length > 1) {
    return `${mediaItems.length} images`;
  }
  if (post.mediaType === "image") return "Image";
  return "Text only";
}

type RestrictionDuration = "none" | "1d" | "3d" | "7d" | "30d" | "forever";
type RestrictionDraft = {
  duration: RestrictionDuration;
  reason: string;
  unlimitedPosts: boolean;
};

type AdminCommunityPost = AdminCommunityResponse["posts"][number];

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

function compareAdminPosts(
  left: AdminCommunityPost,
  right: AdminCommunityPost,
  statusFilter: string,
) {
  if (statusFilter === "pending") {
    const leftCreatedAt = left.createdAt ? new Date(left.createdAt).getTime() : 0;
    const rightCreatedAt = right.createdAt ? new Date(right.createdAt).getTime() : 0;
    return leftCreatedAt - rightCreatedAt;
  }

  const leftReviewedAt = left.reviewedAt || left.createdAt || "";
  const rightReviewedAt = right.reviewedAt || right.createdAt || "";
  return new Date(rightReviewedAt).getTime() - new Date(leftReviewedAt).getTime();
}

function matchesAdminPostFilters(
  post: AdminCommunityPost,
  statusFilter: string,
  mediaFilter: string,
  search: string,
) {
  if (statusFilter && post.status !== statusFilter) {
    return false;
  }

  if (mediaFilter === "game") {
    if (post.postType !== "game") return false;
  } else if (mediaFilter) {
    if (post.postType === "game") return false;
    if (post.mediaType !== mediaFilter) return false;
  }

  const query = search.trim().toLowerCase();
  if (!query) return true;

  const mediaNames = getCommunityMediaItems(post)
    .map((item) => item.originalName)
    .filter(Boolean);
  const haystacks = [
    post.text,
    post.mediaOriginalName,
    post.author?.fullName,
    post.group?.name,
    post.game?.white,
    post.game?.black,
    post.game?.opponent,
    post.game?.eco,
    post.game?.event,
    post.game?.timeControl,
    ...mediaNames,
  ];

  return haystacks.some((value) =>
    String(value || "").toLowerCase().includes(query),
  );
}

export default function AdminCommunity() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading, checkAuth } = useAdminStore();
  const { isDarkMode } = useThemeStore();
  const [posts, setPosts] = useState<AdminCommunityResponse["posts"]>([]);
  const [stats, setStats] = useState<CommunityStats>(DEFAULT_STATS);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [mediaFilter, setMediaFilter] = useState("");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
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
  const [previewGallery, setPreviewGallery] = useState<{
    items: { src: string; alt: string }[];
    index: number;
  } | null>(null);
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
    if (!previewGallery) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreviewGallery(null);
        return;
      }

      if (event.key === "ArrowRight" && previewGallery.items.length > 1) {
        setPreviewGallery((current) => {
          if (!current) return current;
          return {
            ...current,
            index: (current.index + 1) % current.items.length,
          };
        });
      }

      if (event.key === "ArrowLeft" && previewGallery.items.length > 1) {
        setPreviewGallery((current) => {
          if (!current) return current;
          return {
            ...current,
            index: (current.index - 1 + current.items.length) % current.items.length,
          };
        });
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [previewGallery]);

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
      if (deferredSearch.trim()) params.set("search", deferredSearch.trim());

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
  }, [deferredSearch, isAuthenticated, mediaFilter, page, statusFilter]);

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

  const adjustVisibleTotal = useCallback((delta: number) => {
    if (delta === 0) return;
    setTotal((previous) => {
      const nextTotal = Math.max(0, previous + delta);
      setPages(Math.max(1, Math.ceil(nextTotal / 8)));
      return nextTotal;
    });
  }, []);

  const adjustStatsForPostChange = useCallback(
    (previousPost: AdminCommunityPost | null, nextPost: AdminCommunityPost | null) => {
      const previousStatus = previousPost?.status || "";
      const nextStatus = nextPost?.status || "";
      if (!previousStatus && !nextStatus) return;

      setStats((previous) => {
        const next = { ...previous };
        if (previousStatus && previousStatus !== nextStatus) {
          const statKey = previousStatus as keyof CommunityStats;
          if (typeof next[statKey] === "number") {
            next[statKey] = Math.max(0, Number(next[statKey]) - 1);
          }
          next.total = Math.max(0, next.total - 1);
        }
        if (nextStatus && previousStatus !== nextStatus) {
          const statKey = nextStatus as keyof CommunityStats;
          if (typeof next[statKey] === "number") {
            next[statKey] = Number(next[statKey]) + 1;
          }
          next.total += 1;
        }
        return next;
      });
    },
    [],
  );

  const applyLocalPostMutation = useCallback(
    (nextPost: AdminCommunityPost | null, previousPost: AdminCommunityPost | null) => {
      const wasVisible = previousPost
        ? matchesAdminPostFilters(previousPost, statusFilter, mediaFilter, deferredSearch)
        : false;
      const isVisible = nextPost
        ? matchesAdminPostFilters(nextPost, statusFilter, mediaFilter, deferredSearch)
        : false;

      adjustStatsForPostChange(previousPost, nextPost);
      adjustVisibleTotal(Number(isVisible) - Number(wasVisible));

      setPosts((previous) => {
        const filtered = previous.filter(
          (post) => post.id !== (previousPost?.id || nextPost?.id),
        );
        const nextVisiblePosts =
          isVisible && nextPost ? [nextPost, ...filtered] : filtered;
        return nextVisiblePosts.sort((left, right) =>
          compareAdminPosts(left, right, statusFilter),
        );
      });
    },
    [adjustStatsForPostChange, adjustVisibleTotal, deferredSearch, mediaFilter, statusFilter],
  );

  const refreshCurrentPage = async () => {
    const params = new URLSearchParams({
      page: String(page),
      limit: "8",
    });
    if (statusFilter) params.set("status", statusFilter);
    if (mediaFilter) params.set("mediaType", mediaFilter);
    if (deferredSearch.trim()) params.set("search", deferredSearch.trim());

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
    const currentPost = posts.find((post) => post.id === postId) || null;
    try {
      const res = await request();
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to update post.");
      }
      if (data.post) {
        applyLocalPostMutation(data.post, currentPost);
      } else {
        await refreshCurrentPage();
      }
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
    const currentPost = posts.find((post) => post.id === postId) || null;
    setProcessingId(postId);
    setActionError("");
    try {
      const res = await fetch(`${API_URL}/api/admin/community/${postId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete post.");
      }

      if (currentPost) {
        applyLocalPostMutation(null, currentPost);
      } else {
        await refreshCurrentPage();
      }
      showToast("success", "Post deleted.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete post.";
      setActionError(message);
      showToast("error", message);
    } finally {
      setProcessingId(null);
    }
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

      setPosts((previous) =>
        previous.map((post) =>
          String(post.author?.id || "") === userId
            ? {
                ...post,
                authorPostingRestriction: data.restriction || null,
                authorPostingRateLimitBypass: Boolean(data.rateLimitBypass),
              }
            : post,
        ),
      );
      setRestrictionDraftValue(userId, {
        duration: inferRestrictionDuration(data.restriction),
        reason: String(data.restriction?.reason || ""),
        unlimitedPosts: Boolean(data.rateLimitBypass),
      });
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

      setPosts((previous) =>
        previous.map((post) =>
          String(post.author?.id || "") === userId
            ? {
                ...post,
                authorPostingRestriction: data.restriction || post.authorPostingRestriction || null,
                authorPostingRateLimitBypass: Boolean(data.rateLimitBypass),
              }
            : post,
        ),
      );
      setRestrictionDraftValue(userId, {
        duration: inferRestrictionDuration(data.restriction),
        reason: String(data.restriction?.reason || ""),
        unlimitedPosts: Boolean(data.rateLimitBypass),
      });
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
      if (data.post) {
        applyLocalPostMutation(data.post, null);
      } else {
        await refreshCurrentPage();
      }
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
    const currentPost = posts.find((post) => post.id === postId) || null;
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

      if (data.post) {
        applyLocalPostMutation(data.post, currentPost);
      } else {
        await refreshCurrentPage();
      }
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
        tone: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
      },
      {
        label: "Approved",
        value: stats.approved,
        filterValue: "approved",
        tone: "bg-teal-100 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300",
      },
      {
        label: "Rejected",
        value: stats.rejected,
        filterValue: "rejected",
        tone: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-300",
      },
      {
        label: "Total",
        value: stats.total,
        filterValue: "",
        tone: "bg-gray-100 text-gray-700 dark:bg-white/[0.06] dark:text-gray-300",
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
      { value: "", label: "All content" },
      { value: "none", label: "Text only" },
      { value: "image", label: "Image" },
      { value: "video", label: "Video" },
      { value: "game", label: "Shared game" },
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
    <div className={isDarkMode ? "dark" : ""}>
      <div className="min-h-screen bg-[#f5f5f7] text-gray-900 dark:bg-[#060f1d] dark:text-white">
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

      {previewGallery && (
        <div
          className="fixed inset-0 z-[130] bg-black/90 backdrop-blur-sm p-4 sm:p-8 flex items-center justify-center"
          onClick={() => setPreviewGallery(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewGallery(null)}
            className="absolute top-4 right-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Close image preview"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={previewGallery.items[previewGallery.index]?.src}
            alt={previewGallery.items[previewGallery.index]?.alt}
            className="w-[94vw] h-[90vh] object-contain rounded-lg"
            onClick={(event) => event.stopPropagation()}
          />

          {previewGallery.items.length > 1 && (
            <div
              className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-4 pb-5 pt-12"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 text-xs text-gray-400">
                <span>
                  {previewGallery.index + 1} / {previewGallery.items.length}
                </span>
                <span>Use keyboard arrows to browse</span>
              </div>
              <div className="mx-auto mt-3 flex max-w-4xl gap-2 overflow-x-auto pb-1 premium-scrollbar">
                {previewGallery.items.map((item, index) => (
                  <button
                    key={`${item.src}-${index}`}
                    type="button"
                    onClick={() =>
                      setPreviewGallery((current) =>
                        current
                          ? {
                              ...current,
                              index,
                            }
                          : current,
                      )
                    }
                    className={`h-14 w-14 shrink-0 overflow-hidden rounded-xl transition-all ${
                      index === previewGallery.index
                        ? "ring-2 ring-teal-400/60"
                        : "opacity-70 hover:opacity-100"
                    }`}
                  >
                    <img
                      src={item.src}
                      alt={item.alt}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <main className="ml-72 px-8 py-7">
        <div className="max-w-[1400px]">
          <section className="relative z-30 mb-6 rounded-2xl border border-gray-200/80 bg-white/95 p-5 shadow-[0_18px_42px_rgba(15,23,42,0.08)] backdrop-blur dark:border-white/[0.05] dark:bg-[#0c1728]/80 dark:shadow-[0_18px_55px_rgba(0,0,0,0.22)]">
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
                        ? "ring-1 ring-gray-300 dark:ring-white/25"
                        : "opacity-85 hover:opacity-100"
                    }`}
                  >
                    <span className="text-gray-500 dark:text-gray-400">{pill.label}</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{pill.value}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setIsCreateOpen((value) => !value)}
                className="inline-flex shrink-0 items-center gap-2 rounded-full bg-gray-100 px-3.5 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-200 dark:bg-white/[0.08] dark:text-gray-200 dark:hover:bg-white/[0.14]"
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
                    placeholder="Search by author, caption, file name, or game info..."
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 py-3 pl-11 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-white/[0.05] dark:bg-white/[0.06] dark:text-white dark:placeholder:text-gray-500"
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
                  className="min-h-[120px] w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-white/[0.05] dark:bg-white/[0.05] dark:text-white dark:placeholder:text-gray-500"
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
                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-white/[0.05] dark:bg-white/[0.06] dark:text-white dark:placeholder:text-gray-500"
                  />
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                  onChange={(e) => setCreateMediaFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:text-gray-700 hover:file:bg-gray-200 dark:text-gray-300 dark:file:bg-white/[0.1] dark:file:text-gray-100 dark:hover:file:bg-white/[0.16]"
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
            <div className="rounded-2xl border border-gray-200/80 bg-white/95 py-24 text-center shadow-[0_18px_42px_rgba(15,23,42,0.08)] dark:border-white/[0.05] dark:bg-[#0c1728]/80 dark:shadow-[0_24px_75px_rgba(0,0,0,0.24)]">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 text-gray-500" />
              <p className="text-base font-medium text-gray-900 dark:text-white">No posts found</p>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">
                Try a different status or search filter.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {posts.map((post) => {
                const authorName = post.author?.fullName || "Chess Player";
                const authorId = String(post.author?.id || "");
                const mediaItems = getCommunityMediaItems(post);
                const mediaUrl = resolveAssetUrl(mediaItems[0]?.url || post.mediaUrl);
                const imageItems = mediaItems
                  .filter((item) => item.type === "image")
                  .map((item) => ({
                    ...item,
                    url: resolveAssetUrl(item.url),
                  }));
                const isGamePost = post.postType === "game";
                const gameOpening = getCommunityOpeningLabel(
                  post.game?.eco,
                  post.game?.event,
                );
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
                const contentTypeLabel = formatAdminContentType(post);
                const reviewStatusLabel = formatStatusLabel(post.status);
                const reviewStateLabel = post.reviewedAt
                  ? `Reviewed ${formatRelativeTime(post.reviewedAt)}`
                  : "Awaiting review";
                const postingQuotaLabel = restrictionDraft?.unlimitedPosts
                  ? "Unlimited posting"
                  : "5 posts / 3 hours";
                const showApproveAction = post.status !== "approved";
                const showRejectAction = post.status !== "rejected";
                const showSecondaryActionRow = !isEditing || showRejectBox || showRejectAction;
                const secondaryActionGridClass =
                  !isEditing && (showRejectBox || showRejectAction)
                    ? "grid-cols-2"
                    : "grid-cols-1";

                return (
                  <article
                    key={post.id}
                    className="group overflow-hidden rounded-[24px] border border-gray-200/80 bg-white/95 backdrop-blur-xl shadow-[0_18px_42px_rgba(15,23,42,0.08)] dark:border-white/[0.05] dark:bg-[#0c1728]/90 dark:shadow-[0_22px_60px_rgba(0,0,0,0.24)]"
                  >
                    <div className="grid xl:grid-cols-[minmax(0,1fr)_340px]">
                      <div className="min-w-0 px-5 py-5 sm:px-6 sm:py-6">
                        <div className="flex flex-col gap-4">
                          <div className="flex items-start justify-between gap-4 border-b border-white/[0.05] pb-4">
                            <div className="flex items-center gap-3.5 min-w-0">
                            <Avatar
                              initials={getInitials(authorName)}
                              src={post.author?.avatar}
                              size="sm"
                            />
                            <div className="min-w-0">
                                <h3 className="truncate text-[15px] font-semibold text-white">
                                  {authorName}
                                </h3>
                              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                                <span>Submitted {formatRelativeTime(post.createdAt)}</span>
                                {post.updatedAt && (
                                  <span>Updated {formatRelativeTime(post.updatedAt)}</span>
                                )}
                              </div>
                            </div>

                            </div>

                            <div className="shrink-0 text-right">
                              <div className="text-[10px] uppercase tracking-[0.22em] text-gray-500">
                                Preview
                              </div>
                              <div className="mt-1 text-xs text-gray-400">
                                {contentTypeLabel}
                              </div>
                            </div>
                          </div>

                          {post.text && (
                            <div className="rounded-[18px] border border-white/[0.04] bg-white/[0.025] px-4 py-3.5">
                              <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500">
                                Caption
                              </div>
                              <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-100/90">
                                {post.text}
                              </div>
                            </div>
                          )}

                          {post.group && (
                            <div className="rounded-[18px] border border-white/[0.04] bg-white/[0.02] px-4 py-3 text-sm text-gray-300">
                              <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500">
                                Group
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-teal-500/10 px-2.5 py-1 text-[11px] font-semibold text-teal-100">
                                  {post.group.name}
                                </span>
                                {post.group.topic && (
                                  <span className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] text-gray-400">
                                    {post.group.topic}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {isEditing && (
                            <div className="space-y-3 rounded-[18px] border border-white/[0.05] bg-[#091321]/80 p-4">
                              <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500">
                                Edit Submission
                              </div>
                              <textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                placeholder="Edit post text..."
                                className="w-full min-h-[120px] rounded-xl bg-white/[0.05] px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
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
                                  className="w-full rounded-xl bg-white/[0.05] px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                                />
                              )}
                              {isGamePost ? (
                                <div className="rounded-xl bg-white/[0.04] px-4 py-3 text-sm leading-6 text-gray-400">
                                  Shared game snapshot is locked for moderation edits. You can update the caption, status, and rejection reason here.
                                </div>
                              ) : (
                                <>
                                  <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                                    onChange={(e) => setEditMediaFile(e.target.files?.[0] || null)}
                                    className="block w-full text-sm text-gray-300 file:mr-3 file:rounded-xl file:border-0 file:bg-white/[0.1] file:px-3 file:py-2 file:text-sm file:text-gray-100 hover:file:bg-white/[0.16]"
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
                                </>
                              )}
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={cancelEditPost}
                                  className="inline-flex items-center gap-2 rounded-xl bg-white/[0.08] px-4 py-2.5 text-sm text-gray-200 hover:bg-white/[0.14]"
                                >
                                  <X className="w-4 h-4" />
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleSaveEdit(post.id)}
                                  className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
                                >
                                  <Check className="w-4 h-4" />
                                  Save changes
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                          {isGamePost && (
                            <div className="mt-4 rounded-[20px] bg-[#091321]/45 p-1.5">
                              <CommunityGameViewer
                                game={post.game}
                                analyzeHref={
                                  post.game?.sourceGameId
                                    ? `/admin/analyze/${post.game.sourceGameId}`
                                    : ""
                                }
                              />
                            </div>
                          )}

                          {!isGamePost && post.mediaType !== "none" && mediaItems.length > 0 && (
                            <div className="mt-4 rounded-[20px] border border-white/[0.04] bg-[#091321]/80 p-3">
                              {post.mediaType === "video" ? (
                                <div className="overflow-hidden rounded-[16px] bg-black/55">
                                  <video
                                    src={mediaUrl}
                                    controls
                                    playsInline
                                    preload="metadata"
                                    className="w-full max-h-[420px] bg-black object-contain"
                                  />
                                </div>
                              ) : imageItems.length === 1 ? (
                                <div className="overflow-hidden rounded-[16px] bg-black/55">
                                  <img
                                    src={imageItems[0].url}
                                    alt={imageItems[0].originalName || "Community post media"}
                                    className="w-full max-h-[420px] object-contain bg-black cursor-zoom-in"
                                    onClick={() =>
                                      setPreviewGallery({
                                        items: [
                                          {
                                            src: imageItems[0].url,
                                            alt:
                                              imageItems[0].originalName ||
                                              "Community post media",
                                          },
                                        ],
                                        index: 0,
                                      })
                                    }
                                  />
                                </div>
                              ) : (
                                <div className="rounded-[16px] bg-black/20 p-1.5">
                                  <CommunityImageGrid
                                    items={imageItems.map((item) => ({
                                      url: item.url,
                                      alt: item.originalName || "Community post image",
                                    }))}
                                    onImageClick={(index) => {
                                      const galleryItems = imageItems.map((item) => ({
                                        src: item.url,
                                        alt: item.originalName || "Community post media",
                                      }));
                                      if (!galleryItems[index]) return;
                                      setPreviewGallery({
                                        items: galleryItems,
                                        index,
                                      });
                                    }}
                                  />
                                </div>
                              )}

                              <div className="mt-3 flex items-center justify-between rounded-[14px] bg-gray-100 px-3.5 py-2.5 text-xs text-gray-500 dark:bg-white/[0.03] dark:text-gray-500">
                                <div className="inline-flex items-center gap-2">
                                  {post.mediaType === "video" ? (
                                    <>
                                      <PlayCircle className="w-3.5 h-3.5 text-teal-300" />
                                      <span>Video preview</span>
                                    </>
                                  ) : post.mediaType === "image" ? (
                                    <>
                                      <ImageIcon className="w-3.5 h-3.5 text-teal-300" />
                                      <span>
                                        {imageItems.length > 1
                                          ? "Image set"
                                          : "Image preview"}
                                      </span>
                                    </>
                                  ) : (
                                    <span>{contentTypeLabel}</span>
                                  )}
                                </div>
                                {post.mediaType !== "none" && (
                                  <span>
                                    {imageItems.length > 1
                                      ? `${imageItems.length} images`
                                      : formatFileSize(post.mediaSize)}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                      </div>

                      <aside className="border-t border-gray-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(241,245,249,0.94))] px-5 py-5 xl:border-l xl:border-t-0 sm:px-6 sm:py-6 dark:border-white/[0.05] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.015),rgba(255,255,255,0.01))]">
                        <div className="flex h-full flex-col">
                          <div className="rounded-[20px] border border-gray-200/80 bg-white/90 p-4 dark:border-white/[0.04] dark:bg-white/[0.025]">
                            <div className="text-[10px] uppercase tracking-[0.22em] text-gray-500 dark:text-gray-500">
                              Review
                            </div>
                            <div className="mt-3 flex items-start justify-between gap-3">
                              <span
                                className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold ${statusClass(
                                  post.status,
                                )}`}
                              >
                                {reviewStatusLabel}
                              </span>
                              <span className="text-xs text-right text-gray-500 dark:text-gray-500">
                                {reviewStateLabel}
                              </span>
                            </div>

                            <div className="mt-4 space-y-3 border-t border-gray-200 pt-4 dark:border-white/[0.05]">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-500 dark:text-gray-500">Content type</span>
                                <span className="text-gray-900 dark:text-gray-100">{contentTypeLabel}</span>
                              </div>
                              {post.group && (
                                <div className="flex items-center justify-between gap-3 text-sm">
                                  <span className="text-gray-500 dark:text-gray-500">Group</span>
                                  <span className="text-right text-gray-800 dark:text-gray-200">
                                    {post.group.name}
                                  </span>
                                </div>
                              )}
                              {isGamePost && post.game && (
                                <>
                                  <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className="text-gray-500">Result</span>
                                    <span className="text-right text-gray-200">
                                      {formatCommunityResult(post.game.result)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className="text-gray-500">Time control</span>
                                    <span className="text-right text-gray-200">
                                      {formatCommunityTimeControl(post.game.timeControl)}
                                    </span>
                                  </div>
                                  {gameOpening && (
                                    <div className="flex items-center justify-between gap-3 text-sm">
                                      <span className="text-gray-500">Opening</span>
                                      <span className="truncate text-right text-gray-200">
                                        {gameOpening}
                                      </span>
                                    </div>
                                  )}
                                </>
                              )}
                              {post.reviewedBy && (
                                <div className="flex items-center justify-between gap-3 text-sm">
                                  <span className="text-gray-500">Reviewed by</span>
                                  <span className="text-right text-gray-200">
                                    {post.reviewedBy.username}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                        {authorId && restrictionDraft && (
                          <div className="mt-4 rounded-[20px] border border-white/[0.04] bg-white/[0.025] p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-[10px] uppercase tracking-[0.22em] text-gray-500">
                                  Posting access
                                </div>
                                <div className="mt-2 text-sm font-medium text-gray-100">
                                  {formatRestrictionLabel(restriction)}
                                </div>
                              </div>
                              <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-gray-400">
                                {postingQuotaLabel}
                              </span>
                            </div>

                            <div className="mt-4 space-y-3 border-t border-white/[0.05] pt-4">
                              <div className="flex items-center justify-between rounded-[14px] bg-black/10 px-3.5 py-2.5 text-xs">
                                <span className="text-gray-400">Posting quota</span>
                                <span
                                  className={`font-semibold ${
                                    restrictionDraft.unlimitedPosts
                                      ? "text-emerald-200"
                                      : "text-gray-300"
                                  }`}
                                >
                                  {postingQuotaLabel}
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
                                className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
                                  restrictionDraft.unlimitedPosts
                                    ? "bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/20"
                                    : "bg-white/[0.06] text-gray-100 hover:bg-white/[0.12]"
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
                                className="w-full rounded-xl bg-white/[0.05] px-3.5 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                              />

                              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2.5">
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
                                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/[0.08] px-3.5 py-2.5 text-sm font-semibold text-gray-100 hover:bg-white/[0.14] disabled:opacity-50"
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
                                    className="inline-flex items-center justify-center rounded-xl bg-emerald-500/15 px-3.5 py-2.5 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {post.rejectionReason && (
                          <div className="mt-4 rounded-[18px] bg-red-500/10 px-4 py-3.5 text-sm text-red-200">
                            <div className="text-[10px] uppercase tracking-[0.2em] text-red-200/75">
                              Rejection note
                            </div>
                            <div className="mt-2 leading-6">{post.rejectionReason}</div>
                          </div>
                        )}

                          <div className="mt-4 border-t border-white/[0.05] pt-4">
                            <div className="text-[10px] uppercase tracking-[0.22em] text-gray-500">
                              Review actions
                            </div>

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
                                className="mt-3 w-full min-h-[110px] rounded-[18px] bg-white/[0.05] px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                              />
                            )}

                            <div className="mt-3 space-y-2.5">
                              {showApproveAction && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleApprove(post.id)}
                                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(13,148,136,0.22)] hover:bg-teal-500 disabled:opacity-50"
                                >
                                  <Check className="w-4 h-4" />
                                  Approve
                                </button>
                              )}

                              {showSecondaryActionRow && (
                                <div className={`grid gap-2.5 ${secondaryActionGridClass}`}>
                                  {!isEditing && (
                                    <button
                                      type="button"
                                      disabled={isBusy}
                                      onClick={() => startEditPost(post)}
                                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-gray-200 hover:bg-white/[0.1] disabled:opacity-50"
                                    >
                                      <Pencil className="w-4 h-4" />
                                      Edit
                                    </button>
                                  )}

                                  {showRejectBox ? (
                                    <button
                                      type="button"
                                      disabled={isBusy}
                                      onClick={() => setActiveRejectId(null)}
                                      className="inline-flex items-center justify-center rounded-xl bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-gray-300 hover:bg-white/[0.1] disabled:opacity-50"
                                    >
                                      Cancel
                                    </button>
                                  ) : showRejectAction ? (
                                    <button
                                      type="button"
                                      disabled={isBusy}
                                      onClick={() => setActiveRejectId(post.id)}
                                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-200 hover:bg-red-500/18 disabled:opacity-50"
                                    >
                                      <X className="w-4 h-4" />
                                      Reject
                                    </button>
                                  ) : null}
                                </div>
                              )}

                              {showRejectBox && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleReject(post.id)}
                                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-50"
                                >
                                  <X className="w-4 h-4" />
                                  Confirm reject
                                </button>
                              )}

                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleDelete(post.id)}
                                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-gray-300 hover:bg-white/[0.08] disabled:opacity-50"
                              >
                                <Trash2 className="w-4 h-4" />
                                Delete
                              </button>
                            </div>
                          </div>
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
    </div>
  );
}
