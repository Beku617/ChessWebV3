import i18n from "../../../i18n";
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
      return i18n.t("communityComposer.errors.supportedImage");
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return i18n.t("communityComposer.errors.imageTooLarge");
    }
    return null;
  }

  if (!file.type.startsWith("video/")) {
    return i18n.t("communityComposer.errors.supportedVideo");
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return i18n.t("communityComposer.errors.videoTooLarge");
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
        ? i18n.t("communityComposer.errors.restrictedWithReason", {
            reason: postingAccess.restriction.reason,
          })
        : i18n.t("communityComposer.errors.restricted");
    }

    const untilLabel = formatDateTime(postingAccess.restriction?.until);
    const base = untilLabel
      ? i18n.t("communityComposer.errors.temporarilyRestrictedUntil", {
          until: untilLabel,
        })
      : i18n.t("communityComposer.errors.temporarilyRestricted");
    return postingAccess.restriction.reason
      ? i18n.t("communityComposer.errors.temporarilyRestrictedWithReason", {
          base,
          reason: postingAccess.restriction.reason,
        })
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
      remainingMs > 0
        ? i18n.t("communityComposer.errors.tryAgainIn", {
            duration: formatDuration(remainingMs),
          })
        : "";
    return i18n.t("communityComposer.errors.rateLimited", {
      maxPosts: postingAccess.rateLimit.maxPosts,
      waitText,
    });
  }

  return i18n.t("communityComposer.errors.unavailable");
}

export function perspectiveTone(value: ComposerPerspectiveResult) {
  if (value === "win") return "bg-brand-500/12 text-brand-200";
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
    throw new Error(
      data.error || i18n.t("communityComposer.errors.loadSelectedGame"),
    );
  }
  return data.game;
}

