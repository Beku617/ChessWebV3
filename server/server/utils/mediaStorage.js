import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Readable } from "stream";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENV_CANDIDATE_PATHS = [
  path.resolve(__dirname, "../../../.env.local"),
  path.resolve(__dirname, "../../.env.local"),
  path.resolve(__dirname, "../.env.local"),
  path.resolve(process.cwd(), ".env.local"),
  path.resolve(__dirname, "../../../.env"),
  path.resolve(__dirname, "../../.env"),
  path.resolve(__dirname, "../.env"),
  path.resolve(process.cwd(), ".env"),
];

let envInitialized = false;

function ensureEnvInitialized() {
  if (envInitialized) return;
  envInitialized = true;

  const seen = new Set();
  for (const candidate of ENV_CANDIDATE_PATHS) {
    const resolved = path.resolve(candidate);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    if (!fs.existsSync(resolved)) continue;
    dotenv.config({ path: resolved });
  }
}

ensureEnvInitialized();

export const RUNTIME_MEDIA_BUCKET_NAME = "runtimeMedia";
export const LEGACY_COMMUNITY_MEDIA_BUCKET_NAME = "communityMedia";
export const MEDIA_URL_PREFIX = "/api/media/";

const LEGACY_UPLOAD_ROOTS = [
  path.resolve(__dirname, "../uploads"),
  path.resolve(__dirname, "../../uploads"),
];
const LOCAL_UPLOAD_ROOT = LEGACY_UPLOAD_ROOTS[0];
const LOCAL_UPLOAD_FALLBACK_ENABLED =
  String(process.env.MEDIA_UPLOAD_FALLBACK || "true")
    .trim()
    .toLowerCase() !== "false";
const LOCAL_UPLOAD_FOLDER_ALIASES = Object.freeze({
  "bot-avatar": "bot-avatars",
  "learn-course-cover": "learn-course-cover",
});

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

const MONGO_OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;
const CLOUDINARY_HOST_PATTERN = /(^|\.)cloudinary\.com$/i;
const CLOUDINARY_CONFIG_KEY_ALIASES = Object.freeze({
  cloudName: [
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_CLOUD",
    "cloudinary_cloud_name",
  ],
  apiKey: ["CLOUDINARY_API_KEY", "cloudinary_api_key"],
  apiSecret: [
    "CLOUDINARY_API_SECRET",
    "cloudinary_api_secret",
  ],
  cloudinaryUrl: ["CLOUDINARY_URL", "cloudinary_url"],
});
const CLOUDINARY_ROOT_FOLDER =
  String(process.env.CLOUDINARY_UPLOAD_FOLDER || "").trim() || "neongambit";
const VALID_CLOUDINARY_RESOURCE_TYPES = new Set(["image", "video", "raw"]);

let cloudinaryReady = false;
let cloudinaryConfigSignature = "";

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

function isObjectIdString(value = "") {
  return MONGO_OBJECT_ID_PATTERN.test(String(value || "").trim());
}

function readEnvValue(keys = []) {
  ensureEnvInitialized();
  for (const key of keys) {
    const value = String(process.env[key] || "")
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2");
    if (value) return value;
  }
  return "";
}

function parseCloudinaryUrl(rawValue = "") {
  const raw = String(rawValue || "").trim();
  if (!raw) return null;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (parsed.protocol !== "cloudinary:") {
    return null;
  }

  return {
    cloudName: String(parsed.hostname || "").trim(),
    apiKey: decodeURIComponent(String(parsed.username || "").trim()),
    apiSecret: decodeURIComponent(String(parsed.password || "").trim()),
  };
}

function normalizeCloudName(rawValue = "") {
  const candidate = String(rawValue || "")
    .trim()
    .toLowerCase()
    .replace(/^(['"])(.*)\1$/, "$2");

  if (!candidate) return "";
  if (
    candidate.includes("/") ||
    candidate.includes("\\") ||
    candidate.includes(":") ||
    candidate.includes("?") ||
    candidate.includes("#")
  ) {
    return "";
  }
  if (!/^[a-z0-9_-]+$/i.test(candidate)) {
    return "";
  }
  return candidate;
}

function toLocalUploadsPath(value = "") {
  const raw = String(value || "").trim().replace(/\\/g, "/");
  if (!raw) return "";
  const marker = "/uploads/";
  const index = raw.toLowerCase().indexOf(marker);
  if (index < 0) return "";
  return raw.slice(index);
}

function configureCloudinaryIfNeeded() {
  ensureEnvInitialized();
  const cloudinaryUrlConfig = parseCloudinaryUrl(
    readEnvValue(CLOUDINARY_CONFIG_KEY_ALIASES.cloudinaryUrl),
  );
  const cloudName = normalizeCloudName(
    readEnvValue(CLOUDINARY_CONFIG_KEY_ALIASES.cloudName) ||
      cloudinaryUrlConfig?.cloudName ||
      "",
  );
  const apiKey =
    readEnvValue(CLOUDINARY_CONFIG_KEY_ALIASES.apiKey) ||
    String(cloudinaryUrlConfig?.apiKey || "").trim();
  const apiSecret =
    readEnvValue(CLOUDINARY_CONFIG_KEY_ALIASES.apiSecret) ||
    String(cloudinaryUrlConfig?.apiSecret || "").trim();

  if (!cloudName || !apiKey || !apiSecret) {
    cloudinaryReady = false;
    cloudinaryConfigSignature = "";
    return false;
  }

  const nextSignature = `${cloudName}|${apiKey}|${apiSecret}`;
  if (cloudinaryReady && nextSignature === cloudinaryConfigSignature) {
    return true;
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  cloudinaryReady = true;
  cloudinaryConfigSignature = nextSignature;
  return true;
}

function ensureCloudinaryConfigured() {
  if (configureCloudinaryIfNeeded()) return;
  const error = new Error(
    "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET (or cloud_name, api_key, api_secret).",
  );
  error.code = "CLOUDINARY_CONFIG_MISSING";
  throw error;
}

export function isCloudinaryConfigurationError(error) {
  if (!error) return false;
  if (String(error.code || "").trim() === "CLOUDINARY_CONFIG_MISSING") {
    return true;
  }
  const message = String(error.message || "").toLowerCase();
  return message.includes("cloudinary is not configured");
}

function normalizeResourceType(value, fallback = "image") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (VALID_CLOUDINARY_RESOURCE_TYPES.has(normalized)) return normalized;
  return fallback;
}

function inferResourceTypeFromMimeType(mimeType = "") {
  const normalized = String(mimeType || "")
    .trim()
    .toLowerCase();
  if (normalized.startsWith("video/")) return "video";
  if (normalized.startsWith("image/")) return "image";
  return "raw";
}

function resolveCloudinaryFolder(category = "runtime") {
  const safeCategory = String(category || "runtime").trim() || "runtime";
  return `${CLOUDINARY_ROOT_FOLDER}/${safeCategory}`.replace(/\/+/g, "/");
}

function extensionFromMimeType(mimeType = "") {
  const normalized = String(mimeType || "")
    .trim()
    .toLowerCase();
  if (!normalized) return "";
  const match = Object.entries(MIME_BY_EXTENSION).find(
    ([, value]) => value === normalized,
  );
  return match ? match[0] : "";
}

function sanitizeUploadFolderName(value = "") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "runtime";
}

function resolveLocalUploadFolderName(category = "runtime") {
  const normalizedCategory = String(category || "")
    .trim()
    .toLowerCase();
  if (LOCAL_UPLOAD_FOLDER_ALIASES[normalizedCategory]) {
    return LOCAL_UPLOAD_FOLDER_ALIASES[normalizedCategory];
  }
  return sanitizeUploadFolderName(normalizedCategory || "runtime");
}

async function ensureLocalUploadDirectory(folderName) {
  const safeFolderName = resolveLocalUploadFolderName(folderName);
  const uploadDir = path.join(LOCAL_UPLOAD_ROOT, safeFolderName);
  await fs.promises.mkdir(uploadDir, { recursive: true });
  return {
    folderName: safeFolderName,
    directory: uploadDir,
  };
}

function toSafeFilenameBase(value = "") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "media";
}

async function readUploadFileBuffer(file) {
  if (file?.buffer && Buffer.isBuffer(file.buffer)) {
    return file.buffer;
  }

  if (file?.stream && typeof file.stream.pipe === "function") {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let total = 0;

      file.stream.on("data", (chunk) => {
        const current = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        chunks.push(current);
        total += current.length;
      });
      file.stream.once("end", () => resolve(Buffer.concat(chunks, total)));
      file.stream.once("error", reject);
    });
  }

  throw new Error("Media upload source is missing.");
}

async function storeLocalUploadAsset(file, { category = "runtime" } = {}) {
  const originalName =
    String(file?.originalname || file?.filename || "media").trim() || "media";
  const mimeType =
    String(file?.mimetype || "").trim() ||
    guessMediaMimeType(originalName) ||
    "application/octet-stream";
  const extension =
    safeExtension(originalName) || extensionFromMimeType(mimeType) || "";
  const { folderName, directory } = await ensureLocalUploadDirectory(category);
  const storedFilename = `${toSafeFilenameBase(originalName)}-${Date.now()}-${crypto
    .randomBytes(6)
    .toString("hex")}${extension}`;
  const targetPath = path.join(directory, storedFilename);
  const buffer = await readUploadFileBuffer(file);

  await fs.promises.writeFile(targetPath, buffer);

  return {
    assetId: "",
    publicId: "",
    resourceType: inferResourceTypeFromMimeType(mimeType),
    filename: originalName,
    originalName,
    size: Number(file?.size || buffer.length || 0),
    url: `/uploads/${folderName}/${storedFilename}`,
    mimeType,
  };
}

function normalizeCloudinaryContextEntries(metadata = {}) {
  const context = {};
  Object.entries(metadata || {}).forEach(([rawKey, rawValue]) => {
    const key = String(rawKey || "")
      .trim()
      .replace(/[^a-zA-Z0-9_]/g, "_")
      .slice(0, 100);
    if (!key) return;

    let value = "";
    if (rawValue instanceof Date) {
      value = rawValue.toISOString();
    } else if (rawValue != null) {
      value = String(rawValue).trim();
    }

    if (!value) return;
    context[key] = value.slice(0, 1000);
  });
  return context;
}

function parseCloudinaryUploadUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return null;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (!CLOUDINARY_HOST_PATTERN.test(parsed.hostname)) {
    return null;
  }

  const pathname = String(parsed.pathname || "");
  const versionedMatch = pathname.match(
    /\/(image|video|raw)\/upload\/(?:[^/]+\/)*v\d+\/([^?#]+)/i,
  );

  let resourceType = "";
  let publicPath = "";

  if (versionedMatch) {
    resourceType = versionedMatch[1];
    publicPath = versionedMatch[2];
  } else {
    const fallbackMatch = pathname.match(/\/(image|video|raw)\/upload\/([^?#]+)/i);
    if (!fallbackMatch) return null;
    resourceType = fallbackMatch[1];
    publicPath = fallbackMatch[2];
  }

  const decoded = decodeURIComponent(publicPath);
  const segments = decoded.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  segments[segments.length - 1] = segments[segments.length - 1].replace(
    /\.[^/.?#]+$/,
    "",
  );
  const publicId = segments.join("/").trim();
  if (!publicId) return null;

  return {
    publicId,
    resourceType: normalizeResourceType(resourceType, "image"),
  };
}

function getCloudinaryAssetDescriptor(value = "", { resourceType } = {}) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const localUploadPath = toLocalUploadsPath(raw);
  if (localUploadPath) {
    return null;
  }

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return parseCloudinaryUploadUrl(raw);
  }

  if (
    raw.startsWith("/") ||
    raw.startsWith("blob:") ||
    raw.startsWith("data:") ||
    isObjectIdString(raw)
  ) {
    return null;
  }

  const inferredType = normalizeResourceType(
    resourceType || inferResourceTypeFromMimeType(guessMediaMimeType(raw)),
    "image",
  );
  return {
    publicId: raw,
    resourceType: inferredType,
  };
}

function buildCloudinaryDeliveryUrl(publicId, { resourceType } = {}) {
  if (!configureCloudinaryIfNeeded()) return "";
  const safePublicId = String(publicId || "")
    .trim()
    .replace(/^\/+/, "");
  if (!safePublicId) return "";

  return cloudinary.url(safePublicId, {
    secure: true,
    type: "upload",
    resource_type: normalizeResourceType(resourceType, "image"),
  });
}

async function uploadToCloudinary(
  file,
  {
    category = "runtime",
    metadata = {},
  } = {},
) {
  ensureCloudinaryConfigured();

  const contentType =
    String(file?.mimetype || "").trim() ||
    guessMediaMimeType(String(file?.originalname || file?.filename || ""));
  const originalName =
    String(file?.originalname || file?.filename || "media").trim() || "media";
  const inferredResourceType = inferResourceTypeFromMimeType(contentType);
  const uploadMetadata = createAssetMetadata(file, category, metadata);
  const context = normalizeCloudinaryContextEntries(uploadMetadata);
  const uploadOptions = {
    folder: resolveCloudinaryFolder(category),
    resource_type: "auto",
    use_filename: true,
    unique_filename: true,
    overwrite: false,
    filename_override: originalName,
  };
  if (Object.keys(context).length > 0) {
    uploadOptions.context = context;
  }

  const knownSize = Number(file?.size || 0);
  let observedSize = 0;

  const sourceStream = (() => {
    if (file?.buffer && Buffer.isBuffer(file.buffer)) {
      return Readable.from(file.buffer);
    }
    if (file?.stream && typeof file.stream.pipe === "function") {
      return file.stream;
    }
    return null;
  })();

  if (!sourceStream) {
    throw new Error("Media upload source is missing.");
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      if (error) {
        reject(error);
        return;
      }
      if (!result?.public_id || !result?.secure_url) {
        reject(new Error("Cloudinary upload failed: missing media metadata."));
        return;
      }

      const resolvedResourceType = normalizeResourceType(
        result.resource_type,
        inferredResourceType,
      );

      resolve({
        assetId: String(result.public_id).trim(),
        publicId: String(result.public_id).trim(),
        resourceType: resolvedResourceType,
        filename: originalName,
        originalName,
        size:
          knownSize > 0
            ? knownSize
            : Number(result.bytes || observedSize || 0),
        url: String(result.secure_url || "").trim(),
        mimeType: contentType || "application/octet-stream",
      });
    };

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => finish(error, result),
    );

    sourceStream.on("data", (chunk) => {
      observedSize += Number(chunk?.length || 0);
    });
    sourceStream.on("error", (error) => finish(error));
    uploadStream.on("error", (error) => finish(error));

    sourceStream.pipe(uploadStream);
  });
}

async function deleteCloudinaryAsset(assetIdOrUrl, options = {}) {
  if (!configureCloudinaryIfNeeded()) return false;
  const descriptor = getCloudinaryAssetDescriptor(assetIdOrUrl, options);
  if (!descriptor?.publicId) return false;

  const tryTypes = [
    normalizeResourceType(descriptor.resourceType, "image"),
    "image",
    "video",
    "raw",
  ].filter((value, index, list) => list.indexOf(value) === index);

  let deleted = false;
  for (const resourceType of tryTypes) {
    try {
      const result = await cloudinary.uploader.destroy(descriptor.publicId, {
        resource_type: resourceType,
        invalidate: true,
      });
      const status = String(result?.result || "")
        .trim()
        .toLowerCase();
      if (status === "ok") {
        deleted = true;
        break;
      }
      if (status === "not found") {
        continue;
      }
    } catch (error) {
      const message = String(error?.message || "")
        .trim()
        .toLowerCase();
      if (
        message.includes("not found") ||
        message.includes("resource type")
      ) {
        continue;
      }
      throw error;
    }
  }

  return deleted;
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

function createAssetMetadata(file, category, extraMetadata = {}) {
  return {
    originalName: String(file?.originalname || file?.filename || "media"),
    category: String(category || "runtime"),
    uploadedAt: new Date(),
    ...extraMetadata,
  };
}

export function buildMediaAssetUrl(assetId, options = {}) {
  const raw = String(assetId || "").trim();
  if (!raw) return "";

  const localUploadPath = toLocalUploadsPath(raw);
  if (localUploadPath) {
    return localUploadPath;
  }

  if (
    raw.startsWith("http://") ||
    raw.startsWith("https://") ||
    raw.startsWith("blob:") ||
    raw.startsWith("data:")
  ) {
    return raw;
  }

  if (raw.startsWith("/")) {
    return raw;
  }

  if (isObjectIdString(raw)) {
    return `${MEDIA_URL_PREFIX}${raw}`;
  }

  const resolvedResourceType = normalizeResourceType(
    options?.resourceType ||
      inferResourceTypeFromMimeType(guessMediaMimeType(raw)),
    "image",
  );
  const cloudinaryUrl = buildCloudinaryDeliveryUrl(raw, {
    resourceType: resolvedResourceType,
  });
  return cloudinaryUrl || raw;
}

export function extractMediaAssetId(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (isObjectIdString(raw)) return raw;

  const apiMatch = raw.match(/\/api\/media\/([a-f0-9]{24})(?:\/[^/?#]+)?/i);
  if (apiMatch) return apiMatch[1];

  const communityMatch = raw.match(
    /\/api\/community\/media\/([a-f0-9]{24})(?:\/[^/?#]+)?/i,
  );
  if (communityMatch) return communityMatch[1];

  const cloudinaryDescriptor = parseCloudinaryUploadUrl(raw);
  if (cloudinaryDescriptor?.publicId) {
    return cloudinaryDescriptor.publicId;
  }

  return "";
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

  return LEGACY_UPLOAD_ROOTS.map((root) =>
    path.join(root, directory, filename),
  );
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
    metadata = {},
  } = {},
) {
  const normalizedFile =
    file?.buffer && Buffer.isBuffer(file.buffer)
      ? file
      : {
          ...file,
          buffer: await readUploadFileBuffer(file),
          size: Number(file?.size || 0),
        };

  if (!Number.isFinite(Number(normalizedFile.size)) || Number(normalizedFile.size) <= 0) {
    normalizedFile.size = Number(normalizedFile.buffer?.length || 0);
  }

  const uploaded = await uploadToCloudinary(normalizedFile, {
    category,
    metadata,
  }).catch(async (error) => {
    if (!LOCAL_UPLOAD_FALLBACK_ENABLED) {
      throw error;
    }

    console.warn(
      `Media upload failed for ${category}, falling back to local storage:`,
      error?.message || error,
    );
    return storeLocalUploadAsset(normalizedFile, { category });
  });

  return {
    assetId: uploaded.assetId,
    publicId: uploaded.publicId,
    resourceType: uploaded.resourceType,
    filename: uploaded.filename,
    originalName: uploaded.originalName,
    size: uploaded.size,
    url: uploaded.url,
    bucketName,
    mimeType: uploaded.mimeType,
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
      let metadata = {};
      try {
        metadata = typeof getMetadata === "function" ? getMetadata(req, file) : {};
      } catch (error) {
        cb(error);
        return;
      }

      readUploadFileBuffer(file)
        .then((buffer) => {
          const normalizedFile = {
            buffer,
            size: buffer.length,
            mimetype: String(file.mimetype || "application/octet-stream"),
            originalname: String(file.originalname || file.filename || "media"),
          };

          storeMediaAsset(normalizedFile, {
            bucketName,
            category,
            metadata,
          })
            .catch(async (error) => {
              if (!LOCAL_UPLOAD_FALLBACK_ENABLED) {
                throw error;
              }

              console.warn(
                `Media upload failed for ${category}, falling back to local storage:`,
                error?.message || error,
              );
              return storeLocalUploadAsset(normalizedFile, { category });
            })
            .then((stored) => {
              cb(null, {
                assetId: stored.assetId,
                publicId: stored.publicId,
                resourceType: stored.resourceType,
                filename: stored.filename,
                originalName: stored.originalName,
                mimetype: file.mimetype,
                size: stored.size,
                url: stored.url,
                bucketName,
              });
            })
            .catch((error) => cb(error));
        })
        .catch((error) => cb(error));
    },
    _removeFile(_req, file, cb) {
      Promise.allSettled([
        deleteMediaAsset(file?.assetId || file?.url, { bucketName }),
        deleteLegacyUploadFiles(file?.url),
      ])
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
  const raw = String(assetId || "").trim();
  if (!raw) return false;

  const extracted = extractMediaAssetId(raw);
  const normalized = extracted || raw;

  if (isObjectIdString(normalized)) {
    const objectId = toObjectId(normalized);
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

  return deleteCloudinaryAsset(normalized, {
    resourceType: inferResourceTypeFromMimeType(guessMediaMimeType(normalized)),
  });
}
