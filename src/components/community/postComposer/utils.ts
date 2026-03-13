import type { GameHistory } from "../../../historyTypes";
import type {
  CommunityPostingAccess,
  CommunityShareableGameSummary,
} from "../types";
import { API_URL } from "../types";
import type {
  ComposerPerspectiveResult,
  SelectedComposerImage,
} from "./types";

export const MAX_CHARS = 1200;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_IMAGE_COUNT = 10;
export const MAX_TOTAL_IMAGE_BYTES = 40 * 1024 * 1024;

export function validateFile(file: File, expectedKind: "image" | "video") {
  if (expectedKind === "image") {
    if (!file.type.startsWith("image/")) {
      return "Please choose a supported image file.";
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return "Image is too large. Maximum size is 8MB.";
    }
    return null;
  }

  if (!file.type.startsWith("video/")) {
    return "Please choose a supported video file.";
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return "Video is too large. Maximum size is 50MB.";
  }
  return null;
}

export function formatDateTime(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDuration(valueMs: number) {
  const totalMinutes = Math.max(1, Math.ceil(valueMs / (60 * 1000)));
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function getImageSelectionId(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function totalImageBytes(items: Pick<SelectedComposerImage, "file">[]) {
  return items.reduce((total, item) => total + Number(item.file.size || 0), 0);
}

export function buildSubmissionBlockedMessage(
  postingAccess?: CommunityPostingAccess | null,
) {
  if (!postingAccess || postingAccess.canSubmit) return "";

  if (postingAccess.reason === "restricted") {
    if (postingAccess.restriction?.forever) {
      return postingAccess.restriction.reason
        ? `Posting is restricted by moderation. Reason: ${postingAccess.restriction.reason}`
        : "Posting is currently restricted by moderation.";
    }

    const untilLabel = formatDateTime(postingAccess.restriction?.until);
    const base = untilLabel
      ? `Posting is temporarily restricted until ${untilLabel}.`
      : "Posting is temporarily restricted by moderation.";
    return postingAccess.restriction.reason
      ? `${base} Reason: ${postingAccess.restriction.reason}`
      : base;
  }

  if (postingAccess.reason === "rate_limited") {
    const retryAt = postingAccess.rateLimit?.retryAt
      ? new Date(postingAccess.rateLimit.retryAt)
      : null;
    const remainingMs =
      retryAt && Number.isFinite(retryAt.getTime())
        ? Math.max(0, retryAt.getTime() - Date.now())
        : 0;
    const waitText =
      remainingMs > 0 ? ` Try again in ${formatDuration(remainingMs)}.` : "";
    return `You've reached the posting limit (${postingAccess.rateLimit.maxPosts} posts every 3 hours).${waitText}`;
  }

  return "Posting is unavailable right now.";
}

export function perspectiveTone(value: ComposerPerspectiveResult) {
  if (value === "win") return "bg-emerald-500/12 text-emerald-200";
  if (value === "loss") return "bg-red-500/12 text-red-200";
  if (value === "draw") return "bg-slate-500/14 text-slate-200";
  return "bg-white/[0.06] text-gray-300";
}

export async function fetchGameDetail(gameId: string) {
  const res = await fetch(`${API_URL}/api/history/${gameId}`, {
    credentials: "include",
  });
  const data: { game?: GameHistory; error?: string } = await res
    .json()
    .catch(() => ({}));
  if (!res.ok || !data.game) {
    throw new Error(data.error || "Failed to load the selected game.");
  }
  return data.game;
}
