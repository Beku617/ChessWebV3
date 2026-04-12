import {
  CommunityPost,
  CommunityPostingRestrictionState,
  getCommunityMediaItems,
} from "../../components/community/types";
import { AdminCommunityPost, CommunityStats, RestrictionDuration } from "./types";

function statusClass(status: string) {
  if (status === "approved") {
    return "bg-brand-500/12 text-brand-200";
  }
  if (status === "rejected") {
    return "bg-red-500/12 text-red-200";
  }
  if (status === "removed") {
    return "bg-gray-500/15 text-gray-300";
  }
  return "bg-amber-500/12 text-amber-200";
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

export {
  compareAdminPosts,
  formatAdminContentType,
  formatRestrictionLabel,
  formatStatusLabel,
  inferRestrictionDuration,
  matchesAdminPostFilters,
  statusClass,
};

