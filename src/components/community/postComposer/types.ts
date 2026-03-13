import type {
  CommunityGroup,
  CommunityPostingAccess,
  CommunityShareableGameSummary,
} from "../types";

export interface SelectedComposerImage {
  id: string;
  file: File;
  previewUrl: string;
}

export interface ComposerSummary {
  pending: number;
  approved: number;
  rejected: number;
  removed: number;
}

export interface PostComposerProps {
  summary?: ComposerSummary | null;
  postingAccess?: CommunityPostingAccess | null;
  availableGroups?: CommunityGroup[];
  defaultGroupId?: string | null;
  lockGroupSelection?: boolean;
  onSubmitted?: () => void | Promise<void>;
}

export type SelectedMediaType = "none" | "image" | "video";

export type ComposerPerspectiveResult =
  CommunityShareableGameSummary["perspectiveResult"];
