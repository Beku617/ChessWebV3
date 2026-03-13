import crypto from "crypto";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const RUNTIME_MEDIA_BUCKET_NAME = "runtimeMedia";
export const LEGACY_COMMUNITY_MEDIA_BUCKET_NAME = "communityMedia";
export const MEDIA_URL_PREFIX = "/api/media/";

const LEGACY_UPLOAD_ROOTS = [
  path.resolve(__dirname, "../uploads"),
  path.resolve(__dirname, "../../uploads"),
];

const MIME_BY_EXTENSION = Object.freeze({
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".qt": "video/quicktime",
});

function safeExtension(filename = "") {
  const ext = path.extname(filename || "").toLowerCase();
  return /^[.a-z0-9]+$/.test(ext) ? ext : "";
}

function toObjectId(value) {
  const raw = String(value || "").trim();
  return mongoose.Types.ObjectId.isValid(raw)
    ? new mongoose.Types.ObjectId(raw)
    : null;
}

function getGridFsBucket(bucketName = RUNTIME_MEDIA_BUCKET_NAME) {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    throw new Error("MongoDB is not ready for media storage.");
  }

  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName,
  });
}

function normalizeBucketNames(bucketName, legacyBucketNames = []) {
  const names = [bucketName, ...legacyBucketNames]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return [...new Set(names)];
}

function buildStoredFilename(filename = "") {
  const ext = safeExtension(filename);
  return `${Date.now()}-${crypto.randomBytes(12).toString("hex")}${ext}`;
}

function createAssetMetadata(file, category, extraMetadata = {}) {
  return {
    originalName: String(file?.originalname || file?.filename || "media"),
    category: String(category || "runtime"),
    uploadedAt: new Date(),
    ...extraMetadata,
  };
}

export function buildMediaAssetUrl(assetId) {
  const raw = String(assetId || "").trim();
  if (!raw) return "";
  return `${MEDIA_URL_PREFIX}${raw}`;
}

export function extractMediaAssetId(value = "") {
  const match = String(value || "")
    .trim()
    .match(/\/api\/media\/([a-f0-9]{24})(?:\/[^/?#]+)?/i);
  return match ? match[1] : "";
}

export function guessMediaMimeType(value = "") {
  const ext = safeExtension(value);
  return MIME_BY_EXTENSION[ext] || "application/octet-stream";
}

export function isLegacyUploadUrl(value = "", folderName = "") {
  const escapedFolder = String(folderName || "")
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escapedFolder) return false;
  const pattern = new RegExp(`^/uploads/${escapedFolder}/[^/?#]+$`, "i");
  return pattern.test(String(value || "").trim());
}

export function getLegacyUploadFileCandidates(value = "") {
  const raw = String(value || "").trim();
  const match = raw.match(/^\/uploads\/([^/?#\\]+)\/([^/?#\\]+)$/i);
  if (!match) return [];

  const directory = path.basename(match[1]);
  const filename = path.basename(match[2]);
  if (!directory || !filename) return [];

  return LEGACY_UPLOAD_ROOTS.map((root) => path.join(root, directory, filename));
}

export function resolveLegacyUploadFilePath(value = "") {
  return (
    getLegacyUploadFileCandidates(value).find((candidate) =>
      fs.existsSync(candidate),
    ) || ""
  );
}

export async function deleteLegacyUploadFiles(value = "") {
  const candidates = getLegacyUploadFileCandidates(value);
  if (candidates.length === 0) return;

  await Promise.all(
    candidates.map((candidate) => fs.promises.unlink(candidate).catch(() => null)),
  );
}

export async function storeMediaAsset(
  file,
  {
    bucketName = RUNTIME_MEDIA_BUCKET_NAME,
    category = "runtime",
    filename,
    metadata = {},
  } = {},
) {
  const contentType = String(file?.mimetype || "application/octet-stream");
  const originalName = String(file?.originalname || file?.filename || "media");
  const storedFilename = buildStoredFilename(filename || originalName);
  const uploadStream = getGridFsBucket(bucketName).openUploadStream(storedFilename, {
    contentType,
    metadata: createAssetMetadata(file, category, metadata),
  });

  let size = 0;

  await new Promise((resolve, reject) => {
    uploadStream.on("error", reject);
    uploadStream.on("finish", resolve);

    if (file?.buffer && Buffer.isBuffer(file.buffer)) {
      size = Number(file.size || file.buffer.length || 0);
      uploadStream.end(file.buffer);
      return;
    }

    if (file?.stream && typeof file.stream.pipe === "function") {
      file.stream.on("data", (chunk) => {
        size += Number(chunk?.length || 0);
      });
      file.stream.on("error", reject);
      file.stream.pipe(uploadStream);
      return;
    }

    reject(new Error("Media upload source is missing."));
  });

  return {
    assetId: String(uploadStream.id),
    filename: storedFilename,
    originalName,
    size,
    url: buildMediaAssetUrl(uploadStream.id),
    bucketName,
  };
}

export async function storeMediaAssetFromPath(
  filePath,
  {
    bucketName = RUNTIME_MEDIA_BUCKET_NAME,
    category = "runtime",
    mimeType,
    originalName,
    metadata = {},
  } = {},
) {
  const absolutePath = String(filePath || "").trim();
  if (!absolutePath || !fs.existsSync(absolutePath)) {
    throw new Error("Legacy media file does not exist.");
  }

  const stats = await fs.promises.stat(absolutePath);
  const stream = fs.createReadStream(absolutePath);

  try {
    return await storeMediaAsset(
      {
        stream,
        size: stats.size,
        mimetype: mimeType || guessMediaMimeType(absolutePath),
        originalname: originalName || path.basename(absolutePath),
      },
      {
        bucketName,
        category,
        metadata,
      },
    );
  } finally {
    stream.destroy();
  }
}

export function createMediaUploadStorage({
  bucketName = RUNTIME_MEDIA_BUCKET_NAME,
  category = "runtime",
  getMetadata,
} = {}) {
  return {
    _handleFile(req, file, cb) {
      try {
        let size = 0;
        let settled = false;
        const storedFilename = buildStoredFilename(file.originalname || file.filename || "media");
        const uploadStream = getGridFsBucket(bucketName).openUploadStream(storedFilename, {
          contentType: String(file.mimetype || "application/octet-stream"),
          metadata: createAssetMetadata(
            file,
            category,
            typeof getMetadata === "function" ? getMetadata(req, file) : {},
          ),
        });

        const finishWithError = (error) => {
          if (settled) return;
          settled = true;
          cb(error);
        };

        file.stream.on("data", (chunk) => {
          size += Number(chunk?.length || 0);
        });
        file.stream.on("error", finishWithError);
        uploadStream.on("error", finishWithError);
        uploadStream.on("finish", () => {
          if (settled) return;
          settled = true;
          cb(null, {
            assetId: String(uploadStream.id),
            filename: storedFilename,
            originalName: String(file.originalname || storedFilename),
            mimetype: file.mimetype,
            size,
            url: buildMediaAssetUrl(uploadStream.id),
            bucketName,
          });
        });

        file.stream.pipe(uploadStream);
      } catch (error) {
        cb(error);
      }
    },
    _removeFile(_req, file, cb) {
      deleteMediaAsset(file?.assetId, { bucketName })
        .then(() => cb(null))
        .catch(cb);
    },
  };
}

export async function getMediaAssetInfo(
  assetId,
  {
    bucketName = RUNTIME_MEDIA_BUCKET_NAME,
    legacyBucketNames = [],
  } = {},
) {
  const objectId = toObjectId(assetId);
  if (!objectId) return null;

  for (const candidateBucketName of normalizeBucketNames(
    bucketName,
    legacyBucketNames,
  )) {
    const asset = await getGridFsBucket(candidateBucketName)
      .find({ _id: objectId })
      .next();
    if (asset?._id) {
      return {
        ...asset,
        bucketName: candidateBucketName,
      };
    }
  }

  return null;
}

export function openMediaAssetStream(
  assetId,
  { bucketName = RUNTIME_MEDIA_BUCKET_NAME, start, end } = {},
) {
  const objectId = toObjectId(assetId);
  if (!objectId) {
    throw new Error("Invalid media asset id.");
  }

  const options = {};
  if (Number.isFinite(start)) {
    options.start = Number(start);
  }
  if (Number.isFinite(end)) {
    options.end = Number(end);
  }

  return getGridFsBucket(bucketName).openDownloadStream(objectId, options);
}

export async function deleteMediaAsset(
  assetId,
  {
    bucketName = RUNTIME_MEDIA_BUCKET_NAME,
    legacyBucketNames = [],
  } = {},
) {
  const objectId = toObjectId(assetId);
  if (!objectId) return false;

  for (const candidateBucketName of normalizeBucketNames(
    bucketName,
    legacyBucketNames,
  )) {
    try {
      await getGridFsBucket(candidateBucketName).delete(objectId);
      return true;
    } catch (error) {
      if (String(error?.message || "").includes("FileNotFound")) {
        continue;
      }
      throw error;
    }
  }

  return false;
}
