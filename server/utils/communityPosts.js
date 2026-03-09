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
export const COMMUNITY_DUPLICATE_WINDOW_MS = 15 * 1000;

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
