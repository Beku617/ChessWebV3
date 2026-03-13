import path from "path";
import { Bot } from "../models/index.js";
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

function isLegacyBotAvatarUrl(value = "") {
  return isLegacyUploadUrl(value, "bot-avatars");
}

export function normalizeBotAvatarMedia(botDoc) {
  if (!botDoc) return botDoc;

  const rawUrl = String(botDoc.avatarUrl || "").trim();
  const assetId = String(
    botDoc.avatarAssetId || extractMediaAssetId(rawUrl),
  ).trim();
  const avatarUrl =
    assetId && (rawUrl === "" || isLegacyBotAvatarUrl(rawUrl))
      ? buildMediaAssetUrl(assetId)
      : rawUrl || buildMediaAssetUrl(assetId);

  return {
    ...botDoc,
    avatarAssetId: assetId,
    avatarUrl,
    avatarMimeType: String(botDoc.avatarMimeType || "").trim(),
    avatarOriginalName: String(botDoc.avatarOriginalName || "").trim(),
    avatarSize: Number(botDoc.avatarSize || 0),
  };
}

export async function cleanupBotAvatarMedia(input) {
  const files = Array.isArray(input) ? input.filter(Boolean) : [input].filter(Boolean);
  if (files.length === 0) return;

  const seenAssetIds = new Set();
  await Promise.all(
    files.map(async (item) => {
      const url = String(item?.avatarUrl || item?.url || "").trim();
      const assetId = String(
        item?.avatarAssetId || item?.assetId || extractMediaAssetId(url),
      ).trim();

      if (assetId && !seenAssetIds.has(assetId)) {
        seenAssetIds.add(assetId);
        await deleteMediaAsset(assetId).catch(() => null);
      }

      await deleteLegacyUploadFiles(url).catch(() => null);
    }),
  );
}

export async function ensureBotAvatarMedia(botDoc) {
  if (!botDoc?._id) return normalizeBotAvatarMedia(botDoc);

  const rawUrl = String(botDoc.avatarUrl || "").trim();
  const normalized = normalizeBotAvatarMedia(botDoc);
  if (normalized.avatarAssetId && isLegacyBotAvatarUrl(rawUrl)) {
    await Bot.updateOne(
      { _id: botDoc._id },
      {
        $set: {
          avatarUrl: normalized.avatarUrl,
          avatarAssetId: normalized.avatarAssetId,
          avatarMimeType: normalized.avatarMimeType,
          avatarOriginalName: normalized.avatarOriginalName,
          avatarSize: normalized.avatarSize,
        },
      },
    );
    return normalized;
  }

  if (!isLegacyBotAvatarUrl(rawUrl)) {
    if (
      String(normalized.avatarUrl || "") !== String(botDoc.avatarUrl || "") ||
      String(normalized.avatarAssetId || "") !==
        String(botDoc.avatarAssetId || "")
    ) {
      await Bot.updateOne(
        { _id: botDoc._id },
        {
          $set: {
            avatarUrl: normalized.avatarUrl,
            avatarAssetId: normalized.avatarAssetId,
            avatarMimeType: normalized.avatarMimeType,
            avatarOriginalName: normalized.avatarOriginalName,
            avatarSize: normalized.avatarSize,
          },
        },
      );
    }
    return normalized;
  }

  const legacyPath = resolveLegacyUploadFilePath(normalized.avatarUrl);
  if (!legacyPath) {
    return normalized;
  }

  const originalName =
    normalized.avatarOriginalName || path.basename(legacyPath);
  const mimeType = normalized.avatarMimeType || guessMediaMimeType(legacyPath);
  const stored = await storeMediaAssetFromPath(legacyPath, {
    category: "bot-avatar",
    mimeType,
    originalName,
  });

  const update = {
    avatarUrl: stored.url,
    avatarAssetId: stored.assetId,
    avatarMimeType: mimeType,
    avatarOriginalName: originalName,
    avatarSize: Number(normalized.avatarSize || stored.size || 0),
  };

  await Bot.updateOne({ _id: botDoc._id }, { $set: update });

  return {
    ...normalized,
    ...update,
  };
}

export async function ensureBotAvatarMediaMany(items = []) {
  return Promise.all((Array.isArray(items) ? items : []).map(ensureBotAvatarMedia));
}

export async function migrateLegacyBotAvatarMedia(limit = 100) {
  const batchSize = Math.max(1, Number(limit) || 100);
  let scanned = 0;
  let migrated = 0;

  while (true) {
    const bots = await Bot.find({
      avatarUrl: /^\/uploads\/bot-avatars\//i,
    })
      .select(
        "_id avatarUrl avatarAssetId avatarMimeType avatarOriginalName avatarSize",
      )
      .sort({ updatedAt: -1, _id: -1 })
      .limit(batchSize)
      .lean();

    if (bots.length === 0) {
      break;
    }

    scanned += bots.length;
    for (const bot of bots) {
      const migratedBot = await ensureBotAvatarMedia(bot);
      if (String(migratedBot?.avatarUrl || "") !== String(bot?.avatarUrl || "")) {
        migrated += 1;
      }
    }
  }

  return {
    scanned,
    migrated,
  };
}
