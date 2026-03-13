import {
  CommunityPost,
  CommunityPostingRestrictionState,
} from "../../components/community/types";

type FilterOption = {
  value: string;
  label: string;
};

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

type RestrictionDuration =
  | "none"
  | "1d"
  | "3d"
  | "7d"
  | "30d"
  | "forever";

type RestrictionDraft = {
  duration: RestrictionDuration;
  reason: string;
  unlimitedPosts: boolean;
};

type AdminCommunityPost = AdminCommunityResponse["posts"][number];

export type {
  AdminCommunityPost,
  AdminCommunityResponse,
  CommunityStats,
  FilterOption,
  RestrictionDraft,
  RestrictionDuration,
};
export { DEFAULT_STATS };
