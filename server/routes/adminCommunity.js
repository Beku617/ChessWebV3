import path from "path";
import mongoose from "mongoose";
import { Router } from "express";
import { adminAuthMiddleware } from "../middleware/index.js";
import { CommunityPost, User } from "../models/index.js";
import {
  COMMUNITY_MAX_POSTING_RESTRICTION_REASON_LENGTH,
  COMMUNITY_MAX_TEXT_LENGTH,
  COMMUNITY_POSTING_RESTRICTION_DURATIONS,
  COMMUNITY_MAX_REJECTION_REASON_LENGTH,
  buildCommunityPostingAccess,
  cleanupCommunityMedia,
  communityUploadsRoot,
  detectCommunityMediaType,
  toCommunityPostDTO,
  uploadCommunityMedia,
  validateCommunityMediaFile,
} from "../utils/communityPosts.js";

const router = Router();
const AUTHOR_POPULATE_FIELDS =
  "fullName avatar rating email communityPostingRestrictedForever communityPostingRestrictedUntil communityPostingRestrictionReason communityPostingRestrictionUpdatedAt";
const RESTRICTION_FIELD_SELECT =
  "communityPostingRestrictedForever communityPostingRestrictedUntil communityPostingRestrictionReason communityPostingRestrictionUpdatedAt";

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

function parsePagination(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(24, Math.max(1, Number(query.limit) || 12));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function toIsoOrNull(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
}

function serializeRestrictionState(userDoc) {
  const access = buildCommunityPostingAccess(userDoc || {}, new Date());
  return {
    active: Boolean(access.restriction?.active),
    forever: Boolean(access.restriction?.forever),
    until: toIsoOrNull(access.restriction?.until),
    reason: String(access.restriction?.reason || ""),
    updatedAt: toIsoOrNull(access.restriction?.updatedAt),
  };
}

function normalizeRestrictionDuration(value) {
  const normalized = String(value || "none").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(
    COMMUNITY_POSTING_RESTRICTION_DURATIONS,
    normalized,
  )
    ? normalized
    : null;
}

async function buildAdminCommunityQuery(rawQuery) {
  const query = {};
  const status = String(rawQuery.status || "pending").trim().toLowerCase();
  const mediaType = String(rawQuery.mediaType || "").trim().toLowerCase();
  const search = String(rawQuery.search || "").trim();

  if (["pending", "approved", "rejected", "removed"].includes(status)) {
    query.status = status;
  }

  if (["image", "video", "none"].includes(mediaType)) {
    query.mediaType = mediaType;
  }

  if (search) {
    const regex = new RegExp(
      search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );
    const users = await User.find({ fullName: regex }).select("_id").lean();
    const authorIds = users.map((user) => user._id);
    query.$or = [
      { text: regex },
      { mediaOriginalName: regex },
      ...(authorIds.length > 0 ? [{ authorId: { $in: authorIds } }] : []),
    ];
  }

  return query;
}

async function buildStats() {
  const rows = await CommunityPost.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  const stats = {
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    removed: 0,
  };

  for (const row of rows) {
    if (row?._id && stats[row._id] !== undefined) {
      stats[row._id] = row.count;
      stats.total += row.count;
    }
  }

  return stats;
}

function normalizeStatus(value, fallback = "pending") {
  const status = String(value || "").trim().toLowerCase();
  return ["pending", "approved", "rejected", "removed"].includes(status)
    ? status
    : fallback;
}

async function resolvePostAuthorId(rawAuthorId, adminEmail) {
  if (isValidObjectId(rawAuthorId)) {
    const explicitUser = await User.findById(rawAuthorId).select("_id").lean();
    if (explicitUser?._id) return explicitUser._id;
    return null;
  }

  const adminLinkedUser = await User.findOne({ email: adminEmail })
    .select("_id")
    .lean();
  if (adminLinkedUser?._id) return adminLinkedUser._id;
  return null;
}

async function cleanupMediaByUrl(url) {
  const filePath = url ? path.join(communityUploadsRoot, path.basename(url)) : "";
  if (!filePath) return;
  await import("fs/promises").then((fs) =>
    fs.unlink(filePath).catch(() => null),
  );
}

router.get("/", adminAuthMiddleware, async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = await buildAdminCommunityQuery(req.query);
    const sort =
      query.status === "pending"
        ? { createdAt: 1, _id: 1 }
        : { reviewedAt: -1, createdAt: -1, _id: -1 };

    const [items, total, stats] = await Promise.all([
      CommunityPost.find(query)
        .populate("authorId", AUTHOR_POPULATE_FIELDS)
        .populate("reviewedBy", "username email")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      CommunityPost.countDocuments(query),
      buildStats(),
    ]);

    const posts = items.map((post) => ({
      ...toCommunityPostDTO(post),
      authorPostingRestriction: serializeRestrictionState(post.authorId),
      reviewedBy: post.reviewedBy
        ? {
            id: String(post.reviewedBy._id),
            username: post.reviewedBy.username || "Admin",
            email: post.reviewedBy.email || "",
          }
        : null,
    }));

    res.json({
      posts,
      stats,
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    console.error("Admin community list error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.patch(
  "/users/:userId/posting-restriction",
  adminAuthMiddleware,
  async (req, res) => {
    try {
      const userId = String(req.params.userId || "");
      if (!isValidObjectId(userId)) {
        return res.status(400).json({ error: "Invalid user id." });
      }

      const duration = normalizeRestrictionDuration(req.body?.duration);
      if (!duration) {
        return res.status(400).json({
          error: "Invalid restriction duration. Use none, 1d, 3d, 7d, 30d, or forever.",
        });
      }

      const reason = String(req.body?.reason || "").trim();
      if (reason.length > COMMUNITY_MAX_POSTING_RESTRICTION_REASON_LENGTH) {
        return res.status(400).json({
          error: `Restriction reason is too long (${COMMUNITY_MAX_POSTING_RESTRICTION_REASON_LENGTH} characters max).`,
        });
      }

      const now = new Date();
      const durationMs = COMMUNITY_POSTING_RESTRICTION_DURATIONS[duration];
      const update = {
        communityPostingRestrictedForever: false,
        communityPostingRestrictedUntil: null,
        communityPostingRestrictionReason: "",
        communityPostingRestrictionUpdatedAt: now,
        communityPostingRestrictionUpdatedBy: req.admin.adminId,
      };

      if (duration === "forever") {
        update.communityPostingRestrictedForever = true;
        update.communityPostingRestrictionReason = reason;
      } else if (durationMs > 0) {
        update.communityPostingRestrictedUntil = new Date(now.getTime() + durationMs);
        update.communityPostingRestrictionReason = reason;
      }

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: update },
        { new: true },
      )
        .select(`_id fullName ${RESTRICTION_FIELD_SELECT}`)
        .lean();

      if (!updatedUser) {
        return res.status(404).json({ error: "User not found." });
      }

      res.json({
        success: true,
        duration,
        user: {
          id: String(updatedUser._id),
          fullName: updatedUser.fullName || "User",
        },
        restriction: serializeRestrictionState(updatedUser),
      });
    } catch (err) {
      console.error("Update posting restriction error:", err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

router.post("/", adminAuthMiddleware, uploadCommunityMedia, async (req, res) => {
  try {
    const text =
      typeof req.body?.text === "string"
        ? req.body.text.trim()
        : typeof req.body?.content === "string"
          ? req.body.content.trim()
          : "";
    const file = req.file || null;
    const status = normalizeStatus(req.body?.status, "approved");
    const rejectionReason = String(req.body?.rejectionReason || "").trim();

    if (text.length > COMMUNITY_MAX_TEXT_LENGTH) {
      await cleanupCommunityMedia(file);
      return res.status(400).json({
        error: `Post text is too long (${COMMUNITY_MAX_TEXT_LENGTH} characters max).`,
      });
    }

    if (rejectionReason.length > COMMUNITY_MAX_REJECTION_REASON_LENGTH) {
      await cleanupCommunityMedia(file);
      return res.status(400).json({
        error: `Rejection reason is too long (${COMMUNITY_MAX_REJECTION_REASON_LENGTH} characters max).`,
      });
    }

    const fileError = validateCommunityMediaFile(file);
    if (fileError) {
      await cleanupCommunityMedia(file);
      return res.status(400).json({ error: fileError });
    }

    if (!text && !file) {
      return res
        .status(400)
        .json({ error: "Post must include text, an image, or a video." });
    }

    const authorId = await resolvePostAuthorId(req.body?.authorId, req.admin.email);
    if (!authorId) {
      await cleanupCommunityMedia(file);
      return res.status(400).json({
        error:
          "No valid post author found. Provide a valid authorId or use an admin email linked to a user account.",
      });
    }

    const now = new Date();
    const mediaType = detectCommunityMediaType(file);
    const post = await CommunityPost.create({
      authorId,
      text,
      mediaType,
      mediaUrl: file ? `/uploads/community/${path.basename(file.filename)}` : "",
      mediaMimeType: file?.mimetype || "",
      mediaOriginalName: file?.originalname || "",
      mediaSize: Number(file?.size || 0),
      status,
      reviewedAt: now,
      reviewedBy: req.admin.adminId,
      approvedAt: status === "approved" ? now : null,
      rejectionReason: status === "rejected" ? rejectionReason : "",
      submissionFingerprint: "",
    });

    const created = await CommunityPost.findById(post._id)
      .populate("authorId", AUTHOR_POPULATE_FIELDS)
      .populate("reviewedBy", "username email")
      .lean();

    res.status(201).json({
      message: "Post created.",
      post: {
        ...toCommunityPostDTO(created),
        authorPostingRestriction: serializeRestrictionState(created?.authorId),
        reviewedBy: created?.reviewedBy
          ? {
              id: String(created.reviewedBy._id),
              username: created.reviewedBy.username || "Admin",
              email: created.reviewedBy.email || "",
            }
          : null,
      },
    });
  } catch (err) {
    console.error("Create admin community post error:", err);
    await cleanupCommunityMedia(req.file);
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/:postId/approve", adminAuthMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    if (!isValidObjectId(postId)) {
      return res.status(400).json({ error: "Invalid post id" });
    }

    const now = new Date();
    const post = await CommunityPost.findByIdAndUpdate(
      postId,
      {
        $set: {
          status: "approved",
          reviewedAt: now,
          reviewedBy: req.admin.adminId,
          approvedAt: now,
          rejectionReason: "",
        },
      },
      { new: true },
    )
      .populate("authorId", AUTHOR_POPULATE_FIELDS)
      .populate("reviewedBy", "username email")
      .lean();

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    res.json({
      message: "Post approved.",
      post: {
        ...toCommunityPostDTO(post),
        authorPostingRestriction: serializeRestrictionState(post?.authorId),
        reviewedBy: post.reviewedBy
          ? {
              id: String(post.reviewedBy._id),
              username: post.reviewedBy.username || "Admin",
              email: post.reviewedBy.email || "",
            }
          : null,
      },
    });
  } catch (err) {
    console.error("Approve community post error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/:postId/reject", adminAuthMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    if (!isValidObjectId(postId)) {
      return res.status(400).json({ error: "Invalid post id" });
    }

    const rejectionReason = String(req.body?.rejectionReason || "").trim();
    if (rejectionReason.length > COMMUNITY_MAX_REJECTION_REASON_LENGTH) {
      return res.status(400).json({
        error: `Rejection reason is too long (${COMMUNITY_MAX_REJECTION_REASON_LENGTH} characters max).`,
      });
    }

    const post = await CommunityPost.findByIdAndUpdate(
      postId,
      {
        $set: {
          status: "rejected",
          reviewedAt: new Date(),
          reviewedBy: req.admin.adminId,
          approvedAt: null,
          rejectionReason,
        },
      },
      { new: true },
    )
      .populate("authorId", AUTHOR_POPULATE_FIELDS)
      .populate("reviewedBy", "username email")
      .lean();

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    res.json({
      message: "Post rejected.",
      post: {
        ...toCommunityPostDTO(post),
        authorPostingRestriction: serializeRestrictionState(post?.authorId),
        reviewedBy: post.reviewedBy
          ? {
              id: String(post.reviewedBy._id),
              username: post.reviewedBy.username || "Admin",
              email: post.reviewedBy.email || "",
            }
          : null,
      },
    });
  } catch (err) {
    console.error("Reject community post error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/:postId", adminAuthMiddleware, uploadCommunityMedia, async (req, res) => {
  try {
    const { postId } = req.params;
    if (!isValidObjectId(postId)) {
      await cleanupCommunityMedia(req.file);
      return res.status(400).json({ error: "Invalid post id" });
    }

    const existing = await CommunityPost.findById(postId).lean();
    if (!existing) {
      await cleanupCommunityMedia(req.file);
      return res.status(404).json({ error: "Post not found" });
    }

    const nextTextRaw =
      typeof req.body?.text === "string"
        ? req.body.text
        : typeof req.body?.content === "string"
          ? req.body.content
          : null;
    const nextText =
      nextTextRaw === null ? existing.text || "" : String(nextTextRaw || "").trim();

    if (nextText.length > COMMUNITY_MAX_TEXT_LENGTH) {
      await cleanupCommunityMedia(req.file);
      return res.status(400).json({
        error: `Post text is too long (${COMMUNITY_MAX_TEXT_LENGTH} characters max).`,
      });
    }

    const file = req.file || null;
    const fileError = validateCommunityMediaFile(file);
    if (fileError) {
      await cleanupCommunityMedia(file);
      return res.status(400).json({ error: fileError });
    }

    const removeMedia = String(req.body?.removeMedia || "").trim() === "true";
    const nextStatus = normalizeStatus(req.body?.status, existing.status || "pending");
    const rejectionReason = String(
      req.body?.rejectionReason !== undefined
        ? req.body.rejectionReason
        : existing.rejectionReason || "",
    ).trim();

    if (rejectionReason.length > COMMUNITY_MAX_REJECTION_REASON_LENGTH) {
      await cleanupCommunityMedia(file);
      return res.status(400).json({
        error: `Rejection reason is too long (${COMMUNITY_MAX_REJECTION_REASON_LENGTH} characters max).`,
      });
    }

    let nextAuthorId = existing.authorId;
    if (req.body?.authorId !== undefined) {
      const resolved = await resolvePostAuthorId(req.body.authorId, req.admin.email);
      if (!resolved) {
        await cleanupCommunityMedia(file);
        return res.status(400).json({ error: "Invalid authorId." });
      }
      nextAuthorId = resolved;
    }

    const update = {
      authorId: nextAuthorId,
      text: nextText,
      status: nextStatus,
      reviewedBy: req.admin.adminId,
      reviewedAt: new Date(),
      approvedAt: nextStatus === "approved" ? new Date() : null,
      rejectionReason: nextStatus === "rejected" ? rejectionReason : "",
    };

    let previousMediaUrl = "";
    const hasExistingMedia = existing.mediaType !== "none" && !!existing.mediaUrl;
    if (file) {
      update.mediaType = detectCommunityMediaType(file);
      update.mediaUrl = `/uploads/community/${path.basename(file.filename)}`;
      update.mediaMimeType = file.mimetype || "";
      update.mediaOriginalName = file.originalname || "";
      update.mediaSize = Number(file.size || 0);
      previousMediaUrl = existing.mediaUrl || "";
    } else if (removeMedia && hasExistingMedia) {
      update.mediaType = "none";
      update.mediaUrl = "";
      update.mediaMimeType = "";
      update.mediaOriginalName = "";
      update.mediaSize = 0;
      previousMediaUrl = existing.mediaUrl || "";
    }

    const resultingMediaType = file
      ? update.mediaType
      : removeMedia
        ? "none"
        : existing.mediaType || "none";
    const resultingText = update.text || "";
    if (!resultingText && resultingMediaType === "none") {
      await cleanupCommunityMedia(file);
      return res
        .status(400)
        .json({ error: "Post must include text, an image, or a video." });
    }

    const post = await CommunityPost.findByIdAndUpdate(postId, { $set: update }, { new: true })
      .populate("authorId", AUTHOR_POPULATE_FIELDS)
      .populate("reviewedBy", "username email")
      .lean();

    if (previousMediaUrl) {
      await cleanupMediaByUrl(previousMediaUrl);
    }

    res.json({
      message: "Post updated.",
      post: {
        ...toCommunityPostDTO(post),
        authorPostingRestriction: serializeRestrictionState(post?.authorId),
        reviewedBy: post?.reviewedBy
          ? {
              id: String(post.reviewedBy._id),
              username: post.reviewedBy.username || "Admin",
              email: post.reviewedBy.email || "",
            }
          : null,
      },
    });
  } catch (err) {
    console.error("Update admin community post error:", err);
    await cleanupCommunityMedia(req.file);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/:postId", adminAuthMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    if (!isValidObjectId(postId)) {
      return res.status(400).json({ error: "Invalid post id" });
    }

    const post = await CommunityPost.findByIdAndDelete(postId).lean();
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    await cleanupMediaByUrl(post.mediaUrl || "");

    res.json({ message: "Post deleted.", success: true });
  } catch (err) {
    console.error("Delete community post error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
