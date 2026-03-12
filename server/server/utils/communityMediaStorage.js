import crypto from "crypto";
import path from "path";
import mongoose from "mongoose";

const COMMUNITY_MEDIA_BUCKET_NAME = "communityMedia";
const COMMUNITY_MEDIA_URL_PREFIX = "/api/community/media/";

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

function getCommunityMediaBucket() {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    throw new Error("MongoDB is not ready for community media storage.");
  }

  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: COMMUNITY_MEDIA_BUCKET_NAME,
  });
}

function buildStoredFilename(filename = "") {
  const ext = safeExtension(filename);
  return `${Date.now()}-${crypto.randomBytes(12).toString("hex")}${ext}`;
}

export function buildCommunityMediaAssetUrl(assetId) {
  const raw = String(assetId || "").trim();
  if (!raw) return "";
  return `${COMMUNITY_MEDIA_URL_PREFIX}${raw}`;
}

export function extractCommunityMediaAssetId(value = "") {
  const match = String(value || "")
    .trim()
    .match(/\/api\/community\/media\/([a-f0-9]{24})(?:\/[^/?#]+)?/i);
  return match ? match[1] : "";
}

export async function storeCommunityMediaAsset(file) {
  if (!file?.buffer || !Buffer.isBuffer(file.buffer)) {
    throw new Error("Community media upload buffer is missing.");
  }

  const bucket = getCommunityMediaBucket();
  const filename = buildStoredFilename(file.originalname || file.filename || "media");
  const uploadStream = bucket.openUploadStream(filename, {
    contentType: String(file.mimetype || "application/octet-stream"),
    metadata: {
      originalName: String(file.originalname || ""),
      size: Number(file.size || file.buffer.length || 0),
      category: "community",
      uploadedAt: new Date(),
    },
  });

  await new Promise((resolve, reject) => {
    uploadStream.on("error", reject);
    uploadStream.on("finish", resolve);
    uploadStream.end(file.buffer);
  });

  return {
    assetId: String(uploadStream.id),
    filename,
    url: buildCommunityMediaAssetUrl(uploadStream.id),
  };
}

export async function getCommunityMediaAssetInfo(assetId) {
  const objectId = toObjectId(assetId);
  if (!objectId) return null;

  const bucket = getCommunityMediaBucket();
  return bucket.find({ _id: objectId }).next();
}

export function openCommunityMediaAssetStream(assetId, options = {}) {
  const objectId = toObjectId(assetId);
  if (!objectId) {
    throw new Error("Invalid community media asset id.");
  }

  const bucket = getCommunityMediaBucket();
  return bucket.openDownloadStream(objectId, options);
}

export async function deleteCommunityMediaAsset(assetId) {
  const objectId = toObjectId(assetId);
  if (!objectId) return false;

  const bucket = getCommunityMediaBucket();
  try {
    await bucket.delete(objectId);
    return true;
  } catch (err) {
    if (String(err?.message || "").includes("FileNotFound")) {
      return false;
    }
    throw err;
  }
}
