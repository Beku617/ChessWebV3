export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export interface CommunityAuthor {
  id: string;
  fullName: string;
  avatar?: string;
  rating?: number;
}

export interface CommunityPostingRestrictionState {
  active: boolean;
  forever: boolean;
  until: string | null;
  reason: string;
  updatedAt?: string | null;
}

export interface CommunityPostingRateLimitState {
  maxPosts: number;
  windowMs: number;
  used: number;
  remaining: number;
  retryAt: string | null;
  bypass: boolean;
}

export interface CommunityPostingAccess {
  canSubmit: boolean;
  reason: "restricted" | "rate_limited" | null;
  restriction: CommunityPostingRestrictionState;
  rateLimit: CommunityPostingRateLimitState;
}

export interface CommunityPost {
  id: string;
  text: string;
  mediaType: "none" | "image" | "video";
  mediaUrl: string;
  mediaMimeType: string;
  mediaOriginalName: string;
  mediaSize: number;
  status: "pending" | "approved" | "rejected" | "removed";
  rejectionReason?: string;
  author: CommunityAuthor | null;
  createdAt: string | null;
  updatedAt?: string | null;
  reviewedAt?: string | null;
  approvedAt?: string | null;
}

export interface CommunityFeedResponse {
  posts: CommunityPost[];
  total: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface CommunityMineResponse {
  posts: CommunityPost[];
  summary: {
    pending: number;
    approved: number;
    rejected: number;
    removed: number;
  };
  total: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  postingAccess: CommunityPostingAccess;
}

export function resolveAssetUrl(url?: string | null): string {
  const value = String(url || "").trim();
  if (!value) return "";
  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:") ||
    value.startsWith("blob:")
  ) {
    return value;
  }
  return `${API_URL}${value.startsWith("/") ? "" : "/"}${value}`;
}

export function getInitials(name?: string | null): string {
  const source = String(name || "").trim();
  if (!source) return "NG";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

export function formatRelativeTime(value?: string | null): string {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / (60 * 1000)));
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: diffDays > 365 ? "numeric" : undefined,
  });
}

export function formatFileSize(bytes?: number | null): string {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}
