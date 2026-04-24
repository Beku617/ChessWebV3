import type { GameHistory } from "../../historyTypes";
import { findOpeningByEco } from "../../utils/openingExplorer";

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export interface CommunityAuthor {
  id: string;
  fullName: string;
  avatar?: string;
  rating?: number;
}

export interface CommunityMediaItem {
  type: "image" | "video";
  url: string;
  mimeType: string;
  originalName: string;
  size: number;
}

export interface CommunityGroupCreator {
  id: string;
  fullName: string;
  avatar?: string;
}

export interface CommunityGroup {
  id: string;
  name: string;
  slug: string;
  description: string;
  topic: string;
  visibility: "public";
  avatarUrl: string;
  coverUrl: string;
  memberCount: number;
  createdAt: string | null;
  updatedAt?: string | null;
  creator: CommunityGroupCreator | null;
  joined: boolean;
  isCreator: boolean;
  approvedPostCount?: number;
  totalPostCount?: number;
}

export type CommunityPostType = "standard" | "game";
export type CommunityPerspectiveResult = "win" | "loss" | "draw" | "unknown";

export interface CommunitySharedGame {
  sourceGameId: string;
  variant: "standard" | "chess960" | "threeCheck" | "kingOfHill";
  startingFen: string;
  currentPosition: string;
  moves: string[];
  result: string;
  timeControl: string;
  eco: string;
  event: string;
  white: string;
  black: string;
  whiteElo: number;
  blackElo: number;
  playAs: "white" | "black";
  opponent: string;
  rated: boolean;
  totalMoves: number;
  playedAt: string | null;
}

export interface CommunityShareableGameSummary {
  id: string;
  opponent: string;
  result: string;
  perspectiveResult: CommunityPerspectiveResult;
  playedAt: string | null;
  timeControl: string;
  eco: string;
  event: string;
  white: string;
  black: string;
  whiteElo: number;
  blackElo: number;
  playAs: "white" | "black";
  rated: boolean;
  totalMoves: number;
  variant: "standard" | "chess960" | "threeCheck" | "kingOfHill";
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
  postType: CommunityPostType;
  text: string;
  mediaType: "none" | "image" | "video";
  mediaUrl: string;
  mediaMimeType: string;
  mediaOriginalName: string;
  mediaSize: number;
  mediaItems: CommunityMediaItem[];
  group: CommunityGroup | null;
  game: CommunitySharedGame | null;
  status: "pending" | "approved" | "rejected" | "removed";
  rejectionReason?: string;
  likeCount: number;
  likedByMe: boolean;
  author: CommunityAuthor | null;
  createdAt: string | null;
  updatedAt?: string | null;
  reviewedAt?: string | null;
  approvedAt?: string | null;
}

export interface CommunityFeedResponse {
  posts: CommunityPost[];
  total: number;
  feedMode?: "group_weighted" | "general";
  postingAccess?: CommunityPostingAccess;
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

export interface CommunityShareableGamesResponse {
  games: CommunityShareableGameSummary[];
  total: number;
}

export interface CommunityGroupsOverviewResponse {
  joinedGroups: CommunityGroup[];
  discoverGroups: CommunityGroup[];
  joinedCount: number;
  joinedGroupIds: string[];
}

export interface CommunityGroupsListResponse {
  groups: CommunityGroup[];
  total: number;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface CommunityGroupDetailResponse {
  group: CommunityGroup | null;
}

export interface CommunityGroupPostsResponse {
  group: CommunityGroup | null;
  posts: CommunityPost[];
  total: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface CommunityTrendingResponse {
  posts: CommunityPost[];
  mode: "likes" | "latest";
}

function normalizePotentialUploadPath(value = ""): string {
  const raw = String(value || "").trim().replace(/\\/g, "/");
  if (!raw) return "";
  const marker = "/uploads/";
  const index = raw.toLowerCase().indexOf(marker);
  if (index < 0) return raw;
  return raw.slice(index);
}

export function resolveAssetUrl(url?: string | null): string {
  const value = normalizePotentialUploadPath(url || "");
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

export function summarizeCommunityPost(post?: CommunityPost | null): string {
  const text = String(post?.text || "")
    .replace(/\s+/g, " ")
    .trim();

  if (text) {
    return text.length > 78 ? `${text.slice(0, 75).trimEnd()}...` : text;
  }

  if (post?.postType === "game") {
    return "Shared game";
  }

  if (post?.mediaType === "video") {
    return "Video post";
  }

  if (post?.mediaType === "image") {
    const count = Array.isArray(post.mediaItems) ? post.mediaItems.length : 0;
    return count > 1 ? "Image set" : "Image post";
  }

  return "Community post";
}

export function getCommunityMediaItems(post?: Pick<
  CommunityPost,
  | "mediaItems"
  | "mediaType"
  | "mediaUrl"
  | "mediaMimeType"
  | "mediaOriginalName"
  | "mediaSize"
> | null): CommunityMediaItem[] {
  const normalized = Array.isArray(post?.mediaItems)
    ? post.mediaItems
        .map((item) => ({
          type: item?.type === "video" ? "video" : "image",
          url: String(item?.url || ""),
          mimeType: String(item?.mimeType || ""),
          originalName: String(item?.originalName || ""),
          size: Number(item?.size || 0),
        }))
        .filter((item) => item.url)
    : [];

  if (normalized.length > 0) {
    return normalized;
  }

  const legacyType =
    post?.mediaType === "video"
      ? "video"
      : post?.mediaType === "image"
        ? "image"
        : null;
  const legacyUrl = String(post?.mediaUrl || "");

  if (!legacyType || !legacyUrl) {
    return [];
  }

  return [
    {
      type: legacyType,
      url: legacyUrl,
      mimeType: String(post?.mediaMimeType || ""),
      originalName: String(post?.mediaOriginalName || ""),
      size: Number(post?.mediaSize || 0),
    },
  ];
}

export function formatGamePlayedAt(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatCommunityTimeControl(value?: string | null): string {
  const raw = String(value || "").trim();
  if (!raw) return "Custom";
  const normalized = raw.replace("|", "+");
  const [initialRaw, incrementRaw = "0"] = normalized.split("+");
  const initialSeconds = Number(initialRaw);
  const incrementSeconds = Number(incrementRaw);
  if (!Number.isFinite(initialSeconds) || !Number.isFinite(incrementSeconds)) {
    return raw;
  }

  const baseMinutes = initialSeconds / 60;
  const baseLabel = Number.isInteger(baseMinutes)
    ? `${baseMinutes}`
    : `${baseMinutes.toFixed(1)}`;
  return `${baseLabel}+${Math.max(0, incrementSeconds)}`;
}

export function getCommunityOpeningLabel(
  eco?: string | null,
  event?: string | null,
): string {
  const opening = eco ? findOpeningByEco(eco) : null;
  if (opening) {
    return opening.variation
      ? `${opening.name}: ${opening.variation}`
      : opening.name;
  }

  const eventLabel = String(event || "").trim();
  if (!eventLabel || /^neongambit game$/i.test(eventLabel)) {
    return "";
  }
  return eventLabel;
}

export function formatCommunityPerspectiveResult(
  value?: CommunityPerspectiveResult | null,
): string {
  if (value === "win") return "Won";
  if (value === "loss") return "Lost";
  if (value === "draw") return "Draw";
  return "Result unavailable";
}

export function formatCommunityResult(result?: string | null): string {
  const normalized = String(result || "").trim();
  if (normalized === "1-0" || normalized === "0-1" || normalized === "1/2-1/2") {
    return normalized;
  }
  return "Result unavailable";
}

export function communityGameFromHistory(game: GameHistory): CommunitySharedGame {
  const playAs = game.playAs === "black" ? "black" : "white";
  const variant =
    game.variant === "chess960"
      ? "chess960"
      : game.variant === "kingOfHill"
        ? "kingOfHill"
      : game.variant === "threeCheck"
        ? "threeCheck"
        : "standard";
  return {
    sourceGameId: String(game._id || ""),
    variant,
    startingFen: String(game.startingFen || ""),
    currentPosition: String(game.currentPosition || ""),
    moves: Array.isArray(game.moves)
      ? game.moves.map((move) => String(move || "").trim()).filter(Boolean)
      : [],
    result: String(game.result || "*"),
    timeControl: String(game.timeControl || ""),
    eco: String(game.eco || ""),
    event: String(game.event || "NeonGambit Game"),
    white: String(game.white || "White"),
    black: String(game.black || "Black"),
    whiteElo: Number(game.whiteElo || 1200),
    blackElo: Number(game.blackElo || 1200),
    playAs,
    opponent: String(game.opponent || (playAs === "white" ? game.black : game.white) || "Opponent"),
    rated: Boolean(game.rated),
    totalMoves: Array.isArray(game.moves) ? game.moves.length : 0,
    playedAt: game.createdAt || null,
  };
}
