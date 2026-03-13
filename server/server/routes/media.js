import { Router } from "express";
import {
  LEGACY_COMMUNITY_MEDIA_BUCKET_NAME,
  getMediaAssetInfo,
  openMediaAssetStream,
} from "../utils/mediaStorage.js";

const router = Router();

function parseHttpByteRange(value, fileSize) {
  const match = String(value || "")
    .trim()
    .match(/^bytes=(\d*)-(\d*)$/i);
  if (!match || !Number.isFinite(fileSize) || fileSize <= 0) {
    return null;
  }

  const rawStart = match[1];
  const rawEnd = match[2];
  let start = rawStart === "" ? null : Number(rawStart);
  let end = rawEnd === "" ? null : Number(rawEnd);

  if (rawStart === "" && rawEnd !== "") {
    const suffixLength = Number(rawEnd);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return null;
    }
    start = Math.max(0, fileSize - suffixLength);
    end = fileSize - 1;
  }

  if (start === null) start = 0;
  if (end === null || end >= fileSize) end = fileSize - 1;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    start >= fileSize
  ) {
    return null;
  }

  return { start, end };
}

router.get("/:assetId/:filename?", async (req, res) => {
  try {
    const assetId = String(req.params.assetId || "").trim();
    const asset = await getMediaAssetInfo(assetId, {
      legacyBucketNames: [LEGACY_COMMUNITY_MEDIA_BUCKET_NAME],
    });
    if (!asset?._id) {
      return res.status(404).end();
    }

    const totalSize = Number(asset.length || 0);
    const mimeType = String(asset.contentType || "application/octet-stream");
    const range = parseHttpByteRange(req.headers.range, totalSize);

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Accept-Ranges", "bytes");

    let stream;
    if (range) {
      res.status(206);
      res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${totalSize}`);
      res.setHeader("Content-Length", String(range.end - range.start + 1));
      stream = openMediaAssetStream(assetId, {
        bucketName: asset.bucketName,
        start: range.start,
        end: range.end + 1,
      });
    } else {
      if (totalSize > 0) {
        res.setHeader("Content-Length", String(totalSize));
      }
      stream = openMediaAssetStream(assetId, {
        bucketName: asset.bucketName,
      });
    }

    stream.on("error", (error) => {
      console.error("Media stream error:", error);
      if (!res.headersSent) {
        res.status(404).end();
      } else {
        res.end();
      }
    });

    stream.pipe(res);
  } catch (error) {
    console.error("Media route error:", error);
    res.status(500).end();
  }
});

export default router;
