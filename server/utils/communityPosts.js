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
export const COMMUNITY_MAX_IMAGE_COUNT = 10;
export const COMMUNITY_MAX_TOTAL_IMAGE_BYTES = 40 * 1024 * 1024;
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
    files: COMMUNITY_MAX_IMAGE_COUNT,
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
  upload.array("media", COMMUNITY_MAX_IMAGE_COUNT)(req, res, (err) => {
    if (!err) {
      return next();
    }
    let message =
      err instanceof multer.MulterError
        ? err.message || "Failed to upload media."
        : "Failed to upload media.";

    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_COUNT") {
        message = `You can upload up to ${COMMUNITY_MAX_IMAGE_COUNT} images per post.`;
      } else if (
        err.code === "LIMIT_UNEXPECTED_FILE" &&
        err.message === "Unexpected field"
      ) {
        message = `You can upload up to ${COMMUNITY_MAX_IMAGE_COUNT} images per post.`;
      } else if (err.code === "LIMIT_FILE_SIZE") {
        message =
          "One of the selected files is too large. Images must be 8MB or less, and videos must be 50MB or less.";
      }
    }

    return res.status(400).json({ error: message });
  });

function normalizeCommunityFiles(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input.filter(Boolean);
  return [input].filter(Boolean);
}

function detectCommunityMediaItemType(file) {
  if (COMMUNITY_ALLOWED_VIDEO_TYPES.has(file?.mimetype)) return "video";
  return "image";
}

export async function cleanupCommunityMedia(input) {
  const files = normalizeCommunityFiles(input);
  if (files.length === 0) return;

  const seenPaths = new Set();
  await Promise.all(
    files.map(async (file) => {
      if (!file?.path || seenPaths.has(file.path)) return;
      seenPaths.add(file.path);
      await fs.promises.unlink(file.path).catch(() => null);
    }),
  );
}

export function detectCommunityMediaType(input) {
  const files = normalizeCommunityFiles(input);
  if (files.length === 0) return "none";
  if (files.some((file) => detectCommunityMediaItemType(file) === "video")) {
    return "video";
  }
  return "image";
}

export function normalizeCommunityPostType(value, fallback = "standard") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "game") return "game";
  return fallback === "game" ? "game" : "standard";
}

export function validateCommunityMediaFile(input) {
  const files = normalizeCommunityFiles(input);
  if (files.length === 0) return null;

  if (files.length > COMMUNITY_MAX_IMAGE_COUNT) {
    return `You can upload up to ${COMMUNITY_MAX_IMAGE_COUNT} images per post.`;
  }

  let imageCount = 0;
  let videoCount = 0;
  let totalImageBytes = 0;

  for (const file of files) {
    if (
      !COMMUNITY_ALLOWED_IMAGE_TYPES.has(file.mimetype) &&
      !COMMUNITY_ALLOWED_VIDEO_TYPES.has(file.mimetype)
    ) {
      return "Unsupported file type.";
    }

    if (COMMUNITY_ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      imageCount += 1;
      totalImageBytes += Number(file.size || 0);
      if (Number(file.size || 0) > COMMUNITY_MAX_IMAGE_BYTES) {
        return "One of the images is too large. Maximum size is 8MB.";
      }
      continue;
    }

    videoCount += 1;
    if (Number(file.size || 0) > COMMUNITY_MAX_VIDEO_BYTES) {
      return "Video is too large. Maximum size is 50MB.";
    }
  }

  if (videoCount > 1) {
    return "Only one video can be attached to a post.";
  }

  if (videoCount > 0 && imageCount > 0) {
    return "Please upload either images or one video, not both.";
  }

  if (imageCount > COMMUNITY_MAX_IMAGE_COUNT) {
    return `You can upload up to ${COMMUNITY_MAX_IMAGE_COUNT} images per post.`;
  }

  if (totalImageBytes > COMMUNITY_MAX_TOTAL_IMAGE_BYTES) {
    return "Selected images are too large together. Maximum total size is 40MB.";
  }

  return null;
}

export function buildCommunityMediaItems(input) {
  const files = normalizeCommunityFiles(input);
  return files.map((file) => ({
    type: detectCommunityMediaItemType(file),
    url: `/uploads/community/${path.basename(file.filename)}`,
    mimeType: String(file.mimetype || ""),
    originalName: String(file.originalname || ""),
    size: Number(file.size || 0),
  }));
}

function normalizeCommunityMediaItem(item) {
  if (!item || typeof item !== "object") return null;
  const type =
    String(item.type || "").trim().toLowerCase() === "video"
      ? "video"
      : String(item.type || "").trim().toLowerCase() === "image"
        ? "image"
        : detectCommunityMediaItemType(item);
  const url = String(item.url || "").trim();
  if (!url) return null;
  return {
    type,
    url,
    mimeType: String(item.mimeType || item.mimetype || "").trim(),
    originalName: String(item.originalName || item.originalname || "").trim(),
    size: Number(item.size || 0),
  };
}

export function normalizeCommunityMediaItems(postDoc) {
  const fromItems = Array.isArray(postDoc?.mediaItems)
    ? postDoc.mediaItems.map(normalizeCommunityMediaItem).filter(Boolean)
    : [];
  if (fromItems.length > 0) {
    return fromItems;
  }

  const legacyType =
    postDoc?.mediaType === "video"
      ? "video"
      : postDoc?.mediaType === "image"
        ? "image"
        : "";
  const legacyUrl = String(postDoc?.mediaUrl || "").trim();
  if (!legacyType || !legacyUrl) {
    return [];
  }

  return [
    {
      type: legacyType,
      url: legacyUrl,
      mimeType: String(postDoc?.mediaMimeType || "").trim(),
      originalName: String(postDoc?.mediaOriginalName || "").trim(),
      size: Number(postDoc?.mediaSize || 0),
    },
  ];
}

export function getCommunityMediaUrls(postDoc) {
  const urls = normalizeCommunityMediaItems(postDoc)
    .map((item) => String(item.url || "").trim())
    .filter(Boolean);

  if (urls.length > 0) {
    return [...new Set(urls)];
  }

  const legacyUrl = String(postDoc?.mediaUrl || "").trim();
  return legacyUrl ? [legacyUrl] : [];
}

export function buildCommunitySubmissionFingerprint({
  authorId,
  text,
  files,
  postType = "standard",
  gameId = "",
}) {
  const normalizedText = String(text || "").trim().replace(/\s+/g, " ");
  const normalizedFiles = normalizeCommunityFiles(files);
  const mediaType = detectCommunityMediaType(normalizedFiles);
  const mediaSignature = normalizedFiles
    .map((file) =>
      [
        detectCommunityMediaItemType(file),
        String(file?.mimetype || ""),
        String(file?.originalname || "").trim().toLowerCase(),
        String(file?.size || 0),
      ].join(":"),
    )
    .join("||");
  const signature = [
    String(authorId || ""),
    normalizeCommunityPostType(postType),
    normalizedText,
    mediaType,
    String(gameId || "").trim(),
    mediaSignature,
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
  bypass = false,
) {
  const safeNow = now instanceof Date ? now : new Date(now);
  const windowStart = safeNow.getTime() - COMMUNITY_RATE_LIMIT_WINDOW_MS;
  const bypassEnabled = Boolean(bypass);
  const timestamps = Array.isArray(timestampsInput)
    ? timestampsInput
        .map((value) => new Date(value))
        .filter(
          (value) =>
            Number.isFinite(value.getTime()) && value.getTime() > windowStart,
        )
        .sort((a, b) => a.getTime() - b.getTime())
    : [];
  const used = bypassEnabled ? 0 : timestamps.length;
  const remaining = bypassEnabled
    ? COMMUNITY_RATE_LIMIT_MAX_POSTS
    : Math.max(0, COMMUNITY_RATE_LIMIT_MAX_POSTS - used);
  const retryAt =
    bypassEnabled || remaining > 0 || timestamps.length === 0
      ? null
      : new Date(timestamps[0].getTime() + COMMUNITY_RATE_LIMIT_WINDOW_MS);

  return {
    used,
    remaining,
    retryAt,
    timestamps,
    bypass: bypassEnabled,
  };
}

export function buildCommunityPostingAccess(userDoc, now = new Date()) {
  const restriction = getCommunityRestrictionState(userDoc, now);
  const rateLimit = getCommunityRateLimitState(
    userDoc?.communitySubmissionTimestamps,
    now,
    userDoc?.communityPostingRateLimitBypass,
  );
  const canSubmit = !restriction.active && (rateLimit.bypass || rateLimit.remaining > 0);
  const reason = restriction.active
    ? "restricted"
    : !rateLimit.bypass && rateLimit.remaining <= 0
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
      bypass: rateLimit.bypass,
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

function normalizeCommunityGame(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;

  const moves = Array.isArray(snapshot.moves)
    ? snapshot.moves.map((move) => String(move || "").trim()).filter(Boolean)
    : [];

  return {
    sourceGameId: String(snapshot.sourceGameId || ""),
    variant:
      String(snapshot.variant || "").trim().toLowerCase() === "chess960"
        ? "chess960"
        : "standard",
    startingFen: String(snapshot.startingFen || ""),
    currentPosition: String(snapshot.currentPosition || ""),
    moves,
    result: String(snapshot.result || "*"),
    timeControl: String(snapshot.timeControl || ""),
    eco: String(snapshot.eco || ""),
    event: String(snapshot.event || "NeonGambit Game"),
    white: String(snapshot.white || "White"),
    black: String(snapshot.black || "Black"),
    whiteElo: Number(snapshot.whiteElo || 1200),
    blackElo: Number(snapshot.blackElo || 1200),
    playAs:
      String(snapshot.playAs || "").trim().toLowerCase() === "black"
        ? "black"
        : "white",
    opponent: String(snapshot.opponent || "Opponent"),
    rated: Boolean(snapshot.rated),
    totalMoves: Number(snapshot.totalMoves || moves.length || 0),
    playedAt: snapshot.playedAt || null,
  };
}

export function toCommunityPostDTO(postDoc) {
  if (!postDoc) return null;
  const mediaItems = normalizeCommunityMediaItems(postDoc);
  const primaryMedia = mediaItems[0] || null;
  const primaryMediaSize = mediaItems.reduce(
    (total, item) => total + Number(item?.size || 0),
    0,
  );
  const normalizedMediaType =
    postDoc.mediaType === "image" || postDoc.mediaType === "video"
      ? postDoc.mediaType
      : primaryMedia?.type || "none";
  return {
    id: String(postDoc._id),
    postType: normalizeCommunityPostType(
      postDoc.postType,
      postDoc.gameSnapshot ? "game" : "standard",
    ),
    text: postDoc.text || "",
    mediaType: normalizedMediaType,
    mediaUrl: postDoc.mediaUrl || primaryMedia?.url || "",
    mediaMimeType: postDoc.mediaMimeType || primaryMedia?.mimeType || "",
    mediaOriginalName:
      postDoc.mediaOriginalName || primaryMedia?.originalName || "",
    mediaSize: Number(postDoc.mediaSize || primaryMediaSize || 0),
    mediaItems,
    game: normalizeCommunityGame(postDoc.gameSnapshot),
    status: postDoc.status || "pending",
    rejectionReason: postDoc.rejectionReason || "",
    author: normalizeAuthor(postDoc.authorId),
    createdAt: postDoc.createdAt || null,
    updatedAt: postDoc.updatedAt || null,
    reviewedAt: postDoc.reviewedAt || null,
    approvedAt: postDoc.approvedAt || null,
  };
}
