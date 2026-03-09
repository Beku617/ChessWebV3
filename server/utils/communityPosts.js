import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const communityUploadsRoot = path.resolve(__dirname, "../uploads/community");

fs.mkdirSync(communityUploadsRoot, { recursive: true });

export const COMMUNITY_ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const COMMUNITY_ALLOWED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

export const COMMUNITY_MAX_TEXT_LENGTH = 1200;
export const COMMUNITY_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const COMMUNITY_MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const COMMUNITY_MAX_REJECTION_REASON_LENGTH = 300;
export const COMMUNITY_MAX_POSTING_RESTRICTION_REASON_LENGTH = 300;
export const COMMUNITY_DUPLICATE_WINDOW_MS = 15 * 1000;
export const COMMUNITY_RATE_LIMIT_MAX_POSTS = 5;
export const COMMUNITY_RATE_LIMIT_WINDOW_MS = 3 * 60 * 60 * 1000;

export const COMMUNITY_POSTING_RESTRICTION_DURATIONS = Object.freeze({
  none: 0,
  "1d": 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  forever: -1,
});

function safeExtension(filename = "") {
  const ext = path.extname(filename || "").toLowerCase();
  return /^[.a-z0-9]+$/.test(ext) ? ext : "";
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, communityUploadsRoot),
  filename: (_req, file, cb) => {
    const ext = safeExtension(file.originalname || "");
    const name = crypto.randomBytes(12).toString("hex");
    cb(null, `${Date.now()}-${name}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: COMMUNITY_MAX_VIDEO_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (
      !COMMUNITY_ALLOWED_IMAGE_TYPES.has(file.mimetype) &&
      !COMMUNITY_ALLOWED_VIDEO_TYPES.has(file.mimetype)
    ) {
      const err = new multer.MulterError(
        "LIMIT_UNEXPECTED_FILE",
        file.fieldname,
      );
      err.message =
        "Unsupported file type. Please upload jpg, jpeg, png, webp, gif, mp4, webm, or mov.";
      return cb(err);
    }
    cb(null, true);
  },
});

export const uploadCommunityMedia = (req, res, next) =>
  upload.single("media")(req, res, (err) => {
    if (!err) {
      return next();
    }
    const message =
      err instanceof multer.MulterError
        ? err.message || "Failed to upload media."
        : "Failed to upload media.";
    return res.status(400).json({ error: message });
  });

export async function cleanupCommunityMedia(file) {
  if (!file?.path) return;
  await fs.promises.unlink(file.path).catch(() => null);
}

export function detectCommunityMediaType(file) {
  if (!file) return "none";
  if (COMMUNITY_ALLOWED_VIDEO_TYPES.has(file.mimetype)) return "video";
  return "image";
}

export function validateCommunityMediaFile(file) {
  if (!file) return null;

  if (
    !COMMUNITY_ALLOWED_IMAGE_TYPES.has(file.mimetype) &&
    !COMMUNITY_ALLOWED_VIDEO_TYPES.has(file.mimetype)
  ) {
    return "Unsupported file type.";
  }

  if (
    COMMUNITY_ALLOWED_IMAGE_TYPES.has(file.mimetype) &&
    Number(file.size || 0) > COMMUNITY_MAX_IMAGE_BYTES
  ) {
    return "Image is too large. Maximum size is 8MB.";
  }

  if (
    COMMUNITY_ALLOWED_VIDEO_TYPES.has(file.mimetype) &&
    Number(file.size || 0) > COMMUNITY_MAX_VIDEO_BYTES
  ) {
    return "Video is too large. Maximum size is 50MB.";
  }

  return null;
}

export function buildCommunitySubmissionFingerprint({
  authorId,
  text,
  file,
}) {
  const normalizedText = String(text || "").trim().replace(/\s+/g, " ");
  const mediaType = detectCommunityMediaType(file);
  const signature = [
    String(authorId || ""),
    normalizedText,
    mediaType,
    String(file?.mimetype || ""),
    String(file?.originalname || "").trim().toLowerCase(),
    String(file?.size || 0),
  ].join("|");

  return crypto.createHash("sha1").update(signature).digest("hex");
}

export function getCommunityRestrictionState(userDoc, now = new Date()) {
  const safeNow = now instanceof Date ? now : new Date(now);
  const forever = Boolean(userDoc?.communityPostingRestrictedForever);
  const reason = String(userDoc?.communityPostingRestrictionReason || "").trim();
  const updatedAt = userDoc?.communityPostingRestrictionUpdatedAt
    ? new Date(userDoc.communityPostingRestrictionUpdatedAt)
    : null;
  const untilRaw = userDoc?.communityPostingRestrictedUntil
    ? new Date(userDoc.communityPostingRestrictedUntil)
    : null;
  const until =
    untilRaw && Number.isFinite(untilRaw.getTime()) ? untilRaw : null;
  const activeTemporary = Boolean(until && until.getTime() > safeNow.getTime());
  const active = forever || activeTemporary;

  return {
    active,
    forever,
    until: activeTemporary ? until : null,
    reason,
    updatedAt:
      updatedAt && Number.isFinite(updatedAt.getTime()) ? updatedAt : null,
  };
}

export function getCommunityRateLimitState(
  timestampsInput,
  now = new Date(),
) {
  const safeNow = now instanceof Date ? now : new Date(now);
  const windowStart = safeNow.getTime() - COMMUNITY_RATE_LIMIT_WINDOW_MS;
  const timestamps = Array.isArray(timestampsInput)
    ? timestampsInput
        .map((value) => new Date(value))
        .filter(
          (value) =>
            Number.isFinite(value.getTime()) && value.getTime() > windowStart,
        )
        .sort((a, b) => a.getTime() - b.getTime())
    : [];
  const used = timestamps.length;
  const remaining = Math.max(0, COMMUNITY_RATE_LIMIT_MAX_POSTS - used);
  const retryAt =
    remaining > 0 || timestamps.length === 0
      ? null
      : new Date(timestamps[0].getTime() + COMMUNITY_RATE_LIMIT_WINDOW_MS);

  return {
    used,
    remaining,
    retryAt,
    timestamps,
  };
}

export function buildCommunityPostingAccess(userDoc, now = new Date()) {
  const restriction = getCommunityRestrictionState(userDoc, now);
  const rateLimit = getCommunityRateLimitState(
    userDoc?.communitySubmissionTimestamps,
    now,
  );
  const canSubmit = !restriction.active && rateLimit.remaining > 0;
  const reason = restriction.active
    ? "restricted"
    : rateLimit.remaining <= 0
      ? "rate_limited"
      : null;

  return {
    canSubmit,
    reason,
    restriction: {
      active: restriction.active,
      forever: restriction.forever,
      until: restriction.until,
      reason: restriction.reason,
      updatedAt: restriction.updatedAt,
    },
    rateLimit: {
      maxPosts: COMMUNITY_RATE_LIMIT_MAX_POSTS,
      windowMs: COMMUNITY_RATE_LIMIT_WINDOW_MS,
      used: rateLimit.used,
      remaining: rateLimit.remaining,
      retryAt: rateLimit.retryAt,
    },
  };
}

function normalizeAuthor(author) {
  if (!author || typeof author !== "object") return null;
  return {
    id: String(author._id || author.id || ""),
    fullName: author.fullName || "Chess Player",
    avatar: author.avatar || "",
    rating: typeof author.rating === "number" ? author.rating : 1200,
  };
}

export function toCommunityPostDTO(postDoc) {
  if (!postDoc) return null;
  return {
    id: String(postDoc._id),
    text: postDoc.text || "",
    mediaType: postDoc.mediaType || "none",
    mediaUrl: postDoc.mediaUrl || "",
    mediaMimeType: postDoc.mediaMimeType || "",
    mediaOriginalName: postDoc.mediaOriginalName || "",
    mediaSize: Number(postDoc.mediaSize || 0),
    status: postDoc.status || "pending",
    rejectionReason: postDoc.rejectionReason || "",
    author: normalizeAuthor(postDoc.authorId),
    createdAt: postDoc.createdAt || null,
    updatedAt: postDoc.updatedAt || null,
    reviewedAt: postDoc.reviewedAt || null,
    approvedAt: postDoc.approvedAt || null,
  };
}
