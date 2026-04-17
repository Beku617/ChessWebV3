import path from "path";
import { Message } from "../models/index.js";
import {
  buildMediaAssetUrl,
  deleteLegacyUploadFiles,
  deleteMediaAsset,
  extractMediaAssetId,
  guessMediaMimeType,
  isLegacyUploadUrl,
  resolveLegacyUploadFilePath,
  storeMediaAssetFromPath,
} from "./mediaStorage.js";

function normalizePotentialMessageUploadUrl(value = "") {
  const raw = String(value || "").trim().replace(/\\/g, "/");
  if (!raw) return "";
  const marker = "/uploads/messages/";
  const index = raw.toLowerCase().indexOf(marker);
  if (index < 0) return raw;
  return raw.slice(index);
}

function isLegacyMessageUploadUrl(value = "") {
  return isLegacyUploadUrl(normalizePotentialMessageUploadUrl(value), "messages");
}

function normalizeMessageAttachmentRecord(attachment) {
  if (!attachment || typeof attachment !== "object") return null;

  const rawUrl = normalizePotentialMessageUploadUrl(attachment.url);
  const mimeType = String(attachment.mimeType || "").trim();
  const attachmentType =
    attachment.type === "video" || mimeType.startsWith("video/")
      ? "video"
      : "image";
  const assetId = String(
    attachment.assetId || extractMediaAssetId(rawUrl),
  ).trim();
  const url =
    assetId && (rawUrl === "" || isLegacyMessageUploadUrl(rawUrl))
      ? buildMediaAssetUrl(assetId, { resourceType: attachmentType })
      : rawUrl || buildMediaAssetUrl(assetId, { resourceType: attachmentType });
  if (!url) return null;

  const originalName = String(
    attachment.originalName || attachment.filename || "",
  ).trim();

  return {
    assetId,
    type: attachmentType,
    url,
    filename: String(originalName || attachment.filename || "attachment").trim(),
    originalName:
      originalName || String(attachment.filename || "attachment").trim(),
    mimeType,
    size: Number(attachment.size || 0),
    width:
      attachment.width == null ? null : Number(attachment.width || 0) || null,
    height:
      attachment.height == null ? null : Number(attachment.height || 0) || null,
    duration:
      attachment.duration == null
        ? null
        : Number(attachment.duration || 0) || null,
    thumbnail: attachment.thumbnail ? String(attachment.thumbnail) : null,
  };
}

async function migrateLegacyMessageAttachmentRecord(attachment) {
  const normalized = normalizeMessageAttachmentRecord(attachment);
  if (!normalized || !isLegacyMessageUploadUrl(normalized.url)) {
    return normalized;
  }

  const legacyPath = resolveLegacyUploadFilePath(normalized.url);
  if (!legacyPath) {
    return normalized;
  }

  const originalName =
    normalized.originalName ||
    normalized.filename ||
    path.basename(legacyPath);
  const mimeType = normalized.mimeType || guessMediaMimeType(legacyPath);
  const stored = await storeMediaAssetFromPath(legacyPath, {
    category: "messages",
    mimeType,
    originalName,
  });

  return {
    ...normalized,
    assetId: stored.assetId,
    url: stored.url,
    filename: normalized.filename || originalName,
    originalName,
    mimeType,
    size: Number(normalized.size || stored.size || 0),
  };
}

export async function cleanupMessageMedia(input) {
  const files = Array.isArray(input) ? input.filter(Boolean) : [input].filter(Boolean);
  if (files.length === 0) return;

  const seenAssetIds = new Set();
  await Promise.all(
    files.map(async (file) => {
      const normalizedUrl = normalizePotentialMessageUploadUrl(file?.url);
      const assetId = String(
        file?.assetId || extractMediaAssetId(normalizedUrl),
      ).trim();
      if (assetId && !seenAssetIds.has(assetId)) {
        seenAssetIds.add(assetId);
        await deleteMediaAsset(assetId).catch(() => null);
      }

      await deleteLegacyUploadFiles(normalizedUrl).catch(() => null);
    }),
  );
}

export function buildMessageAttachments(files = []) {
  return (Array.isArray(files) ? files : [])
    .map((file) => {
    const normalized = normalizeMessageAttachmentRecord({
      assetId: file?.assetId,
      type:
        String(file?.mimetype || "").startsWith("video/") ? "video" : "image",
      url: file?.url,
      filename: file?.originalName || file?.originalname || file?.filename,
      originalName: file?.originalName || file?.originalname || file?.filename,
      mimeType: file?.mimetype,
      size: file?.size,
      width: file?.width,
      height: file?.height,
      duration: file?.duration,
      thumbnail: file?.thumbnail,
    });
    return normalized;
    })
    .filter(Boolean);
}

export async function ensureMessageAttachmentMedia(messageDoc) {
  if (!messageDoc?._id || !Array.isArray(messageDoc.attachments)) {
    return messageDoc;
  }

  let changed = false;
  const attachments = [];

  for (const attachment of messageDoc.attachments) {
    const rawUrl = String(attachment?.url || "").trim();
    const normalized = normalizeMessageAttachmentRecord(attachment);
    if (!normalized) continue;

    const migrated = isLegacyMessageUploadUrl(rawUrl)
      ? await migrateLegacyMessageAttachmentRecord(normalized)
      : normalized;

    if (
      String(migrated.assetId || "") !== String(normalized.assetId || "") ||
      String(migrated.url || "") !== String(normalized.url || "") ||
      String(migrated.originalName || "") !== String(normalized.originalName || "")
    ) {
      changed = true;
    }

    if (
      String(normalized.url || "") !== String(attachment?.url || "") ||
      String(normalized.assetId || "") !== String(attachment?.assetId || "") ||
      String(normalized.originalName || "") !==
        String(attachment?.originalName || "")
    ) {
      changed = true;
    }

    attachments.push(migrated);
  }

  if (!changed) {
    return {
      ...messageDoc,
      attachments,
    };
  }

  await Message.updateOne({ _id: messageDoc._id }, { $set: { attachments } });

  return {
    ...messageDoc,
    attachments,
  };
}

export async function migrateLegacyMessageAttachmentMedia(limit = 200) {
  const batchSize = Math.max(1, Number(limit) || 200);
  let scanned = 0;
  let migrated = 0;

  while (true) {
    const messages = await Message.find({
      "attachments.url": /^\/uploads\/messages\//i,
    })
      .select("_id attachments")
      .sort({ createdAt: -1, _id: -1 })
      .limit(batchSize)
      .lean();

    if (messages.length === 0) {
      break;
    }

    scanned += messages.length;
    for (const message of messages) {
      const migratedMessage = await ensureMessageAttachmentMedia(message);
      const before = JSON.stringify(message.attachments || []);
      const after = JSON.stringify(migratedMessage?.attachments || []);
      if (before !== after) {
        migrated += 1;
      }
    }
  }

  return {
    scanned,
    migrated,
  };
}
