import {
  LEGACY_COMMUNITY_MEDIA_BUCKET_NAME,
  buildMediaAssetUrl,
  deleteMediaAsset,
  extractMediaAssetId,
  getMediaAssetInfo,
  openMediaAssetStream,
  storeMediaAsset,
} from "./mediaStorage.js";

export function buildCommunityMediaAssetUrl(assetId, options = {}) {
  return buildMediaAssetUrl(assetId, options);
}

export function extractCommunityMediaAssetId(value = "") {
  const runtimeAssetId = extractMediaAssetId(value);
  if (runtimeAssetId) return runtimeAssetId;

  const match = String(value || "")
    .trim()
    .match(/\/api\/community\/media\/([a-f0-9]{24})(?:\/[^/?#]+)?/i);
  return match ? match[1] : "";
}

export async function storeCommunityMediaAsset(file) {
  return storeMediaAsset(file, { category: "community" });
}

export async function getCommunityMediaAssetInfo(assetId) {
  return getMediaAssetInfo(assetId, {
    legacyBucketNames: [LEGACY_COMMUNITY_MEDIA_BUCKET_NAME],
  });
}

export function openCommunityMediaAssetStream(assetId, options = {}) {
  return openMediaAssetStream(assetId, options);
}

export async function deleteCommunityMediaAsset(assetId) {
  return deleteMediaAsset(assetId, {
    legacyBucketNames: [LEGACY_COMMUNITY_MEDIA_BUCKET_NAME],
  });
}
