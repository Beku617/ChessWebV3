import path from "path";
import mongoose from "mongoose";
import { Router } from "express";
import { authMiddleware } from "../middleware/index.js";
import { CommunityPost, User } from "../models/index.js";
import {
  buildCommunityGameSnapshot,
  findShareableCommunityGameForUser,
  listShareableCommunityGamesForUser,
} from "../utils/communityGames.js";
import {
  buildCommunityMediaItems,
  COMMUNITY_DUPLICATE_WINDOW_MS,
  COMMUNITY_MAX_TEXT_LENGTH,
  COMMUNITY_RATE_LIMIT_MAX_POSTS,
  COMMUNITY_RATE_LIMIT_WINDOW_MS,
  buildCommunityPostingAccess,
  buildCommunitySubmissionFingerprint,
  cleanupCommunityMedia,
  communityUploadsRoot,
  detectCommunityMediaType,
  getCommunityMediaUrls,
  normalizeCommunityPostType,
  toCommunityPostDTO,
  uploadCommunityMedia,
  validateCommunityMediaFile,
} from "../utils/communityPosts.js";

const router = Router();
const POSTING_ACCESS_USER_FIELDS =
  "communityPostingRestrictedForever communityPostingRestrictedUntil communityPostingRestrictionReason communityPostingRestrictionUpdatedAt communityPostingRateLimitBypass communitySubmissionTimestamps";

function parsePagination(
  query,
  { defaultLimit = 10, maxLimit = 20 } = {},
) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number(query.limit) || defaultLimit));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

function toIsoOrNull(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
}

function serializePostingAccess(access) {
  return {
    canSubmit: Boolean(access?.canSubmit),
    reason: access?.reason || null,
    restriction: {
      active: Boolean(access?.restriction?.active),
      forever: Boolean(access?.restriction?.forever),
      until: toIsoOrNull(access?.restriction?.until),
      reason: String(access?.restriction?.reason || ""),
      updatedAt: toIsoOrNull(access?.restriction?.updatedAt),
    },
    rateLimit: {
      maxPosts: Number(access?.rateLimit?.maxPosts || COMMUNITY_RATE_LIMIT_MAX_POSTS),
      windowMs: Number(
        access?.rateLimit?.windowMs || COMMUNITY_RATE_LIMIT_WINDOW_MS,
      ),
      used: Number(access?.rateLimit?.used || 0),
      remaining: Number(access?.rateLimit?.remaining || 0),
      retryAt: toIsoOrNull(access?.rateLimit?.retryAt),
      bypass: Boolean(access?.rateLimit?.bypass),
    },
  };
}

function restrictionErrorMessage(restriction) {
  if (!restriction?.active) {
    return "Posting is unavailable right now.";
  }
  if (restriction.forever) {
    return "Your posting access is currently restricted by moderation.";
  }
  return "Your posting access is temporarily restricted by moderation.";
}

function rateLimitErrorMessage() {
  return "You've reached the posting limit (5 posts in 3 hours). Try again later.";
}

async function reserveCommunitySubmissionSlot(userId, now) {
  const windowStart = new Date(now.getTime() - COMMUNITY_RATE_LIMIT_WINDOW_MS);
  const reservationToken = new mongoose.Types.ObjectId().toString();

  const updatedUser = await User.findOneAndUpdate(
    {
      _id: userId,
      communityPostingRestrictedForever: { $ne: true },
      $or: [
        { communityPostingRestrictedUntil: { $exists: false } },
        { communityPostingRestrictedUntil: null },
        { communityPostingRestrictedUntil: { $lte: now } },
      ],
    },
    [
      {
        $set: {
          communitySubmissionTimestamps: {
            $filter: {
              input: { $ifNull: ["$communitySubmissionTimestamps", []] },
              as: "ts",
              cond: { $gt: ["$$ts", windowStart] },
            },
          },
        },
      },
      {
        $set: {
          communitySubmissionTimestamps: {
            $cond: [
              "$communityPostingRateLimitBypass",
              "$communitySubmissionTimestamps",
              {
                $cond: [
                  {
                    $lt: [
                      { $size: "$communitySubmissionTimestamps" },
                      COMMUNITY_RATE_LIMIT_MAX_POSTS,
                    ],
                  },
                  { $concatArrays: ["$communitySubmissionTimestamps", [now]] },
                  "$communitySubmissionTimestamps",
                ],
              },
            ],
          },
          communityLastSubmissionReservationToken: {
            $cond: [
              {
                $or: [
                  "$communityPostingRateLimitBypass",
                  {
                    $lt: [
                      { $size: "$communitySubmissionTimestamps" },
                      COMMUNITY_RATE_LIMIT_MAX_POSTS,
                    ],
                  },
                ],
              },
              reservationToken,
              "$communityLastSubmissionReservationToken",
            ],
          },
        },
      },
    ],
    { new: true, lean: true },
  );

  if (!updatedUser) {
    return { ok: false, reason: "restricted_or_missing", userDoc: null };
  }

  const postingAccess = buildCommunityPostingAccess(updatedUser, now);
  const accepted =
    String(updatedUser.communityLastSubmissionReservationToken || "") ===
    reservationToken;

  if (!accepted) {
    return {
      ok: false,
      reason: "rate_limited",
      postingAccess,
    };
  }

  return {
    ok: true,
    postingAccess,
  };
}

router.get("/", async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, {
      defaultLimit: 8,
      maxLimit: 20,
    });
    const query = { status: "approved" };

    const [items, total] = await Promise.all([
      CommunityPost.find(query)
        .populate("authorId", "fullName avatar rating")
        .sort({ approvedAt: -1, createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CommunityPost.countDocuments(query),
    ]);

    const posts = items
      .map(toCommunityPostDTO)
      .filter((post) => post?.author?.id);

    res.json({
      posts,
      total,
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    console.error("Community feed error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/mine", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.user?.userId || "");
    if (!isValidObjectId(userId)) {
      return res.status(401).json({ error: "Invalid user session." });
    }

    const { page, limit, skip } = parsePagination(req.query, {
      defaultLimit: 8,
      maxLimit: 20,
    });
    const authorObjectId = new mongoose.Types.ObjectId(userId);

    const [posts, author, counts, total, postingUser] = await Promise.all([
      CommunityPost.find({ authorId: userId })
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.findById(userId).select("fullName avatar rating").lean(),
      CommunityPost.aggregate([
        { $match: { authorId: authorObjectId } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      CommunityPost.countDocuments({ authorId: userId }),
      User.findById(userId).select(POSTING_ACCESS_USER_FIELDS).lean(),
    ]);

    const summary = { pending: 0, approved: 0, rejected: 0, removed: 0 };
    for (const item of counts) {
      if (item?._id && summary[item._id] !== undefined) {
        summary[item._id] = item.count;
      }
    }

    const postingAccess = serializePostingAccess(
      buildCommunityPostingAccess(postingUser || {}, new Date()),
    );

    res.json({
      posts: posts.map((post) =>
        toCommunityPostDTO({
          ...post,
          authorId: {
            _id: userId,
            fullName: author?.fullName || req.user.fullName || "You",
            avatar: author?.avatar || "",
            rating: author?.rating || 1200,
          },
        }),
      ),
      summary,
      total,
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
      postingAccess,
    });
  } catch (err) {
    console.error("Community mine error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/shareable-games", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.user?.userId || "");
    if (!isValidObjectId(userId)) {
      return res.status(401).json({ error: "Invalid user session." });
    }

    const limit = Math.min(24, Math.max(1, Number(req.query.limit) || 16));
    const search = String(req.query.search || "").trim();

    const games = await listShareableCommunityGamesForUser(userId, {
      limit,
      search,
    });

    res.json({
      games,
      total: games.length,
    });
  } catch (err) {
    console.error("Community shareable games error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/", authMiddleware, uploadCommunityMedia, async (req, res) => {
  const userId = String(req.user?.userId || "");
  let reservedSlot = false;
  let reservedAt = null;

  try {
    const files = Array.isArray(req.files) ? req.files : [];
    if (!isValidObjectId(userId)) {
      await cleanupCommunityMedia(files);
      return res.status(401).json({ error: "Invalid user session." });
    }

    const text =
      typeof req.body?.text === "string"
        ? req.body.text.trim()
        : typeof req.body?.content === "string"
          ? req.body.content.trim()
          : "";
    const postType = normalizeCommunityPostType(req.body?.postType, "standard");
    const gameId = String(req.body?.gameId || "").trim();

    if (text.length > COMMUNITY_MAX_TEXT_LENGTH) {
      await cleanupCommunityMedia(files);
      return res.status(400).json({
        error: `Post text is too long (${COMMUNITY_MAX_TEXT_LENGTH} characters max).`,
      });
    }

    const fileError = validateCommunityMediaFile(files);
    if (fileError) {
      await cleanupCommunityMedia(files);
      return res.status(400).json({ error: fileError });
    }

    if (postType === "game" && files.length > 0) {
      await cleanupCommunityMedia(files);
      return res.status(400).json({
        error: "Game posts currently support a caption and one shared game only.",
      });
    }

    if (postType === "game" && !gameId) {
      return res.status(400).json({
        error: "Please choose one of your games to share.",
      });
    }

    if (postType === "standard" && !text && files.length === 0) {
      return res
        .status(400)
        .json({ error: "Post must include text, an image, or a video." });
    }

    let gameSnapshot = null;
    if (postType === "game") {
      const selectedGame = await findShareableCommunityGameForUser(userId, gameId);
      if (!selectedGame) {
        return res.status(404).json({
          error: "That game could not be found in your history.",
        });
      }

      gameSnapshot = buildCommunityGameSnapshot(selectedGame);
      if (!gameSnapshot || gameSnapshot.totalMoves <= 0) {
        return res.status(400).json({
          error: "This game does not have enough move data to be shared.",
        });
      }
    }

    const submissionFingerprint = buildCommunitySubmissionFingerprint({
      authorId: userId,
      text,
      files,
      postType,
      gameId,
    });

    const duplicate = await CommunityPost.findOne({
      authorId: userId,
      submissionFingerprint,
      createdAt: {
        $gte: new Date(Date.now() - COMMUNITY_DUPLICATE_WINDOW_MS),
      },
    })
      .select("_id status")
      .lean();

    if (duplicate) {
      await cleanupCommunityMedia(file);
      return res.status(409).json({
        error: "This post was already submitted a moment ago. Please wait.",
      });
    }

    const now = new Date();
    const slotResult = await reserveCommunitySubmissionSlot(userId, now);
    if (!slotResult.ok) {
      await cleanupCommunityMedia(files);

      if (slotResult.reason === "rate_limited") {
        return res.status(429).json({
          error: rateLimitErrorMessage(),
          code: "community_rate_limited",
          postingAccess: serializePostingAccess(slotResult.postingAccess),
        });
      }

      const currentUser = await User.findById(userId)
        .select(POSTING_ACCESS_USER_FIELDS)
        .lean();
      if (!currentUser) {
        return res.status(404).json({ error: "User not found." });
      }

      const postingAccess = buildCommunityPostingAccess(currentUser, now);
      if (postingAccess.restriction.active) {
        return res.status(403).json({
          error: restrictionErrorMessage(postingAccess.restriction),
          code: "community_posting_restricted",
          postingAccess: serializePostingAccess(postingAccess),
        });
      }

      return res.status(429).json({
        error: rateLimitErrorMessage(),
        code: "community_rate_limited",
        postingAccess: serializePostingAccess(postingAccess),
      });
    }

    reservedSlot = true;
    reservedAt = now;

    const mediaItems = postType === "game" ? [] : buildCommunityMediaItems(files);
    const primaryMedia = mediaItems[0] || null;
    const mediaType =
      postType === "game" ? "none" : detectCommunityMediaType(files);
    const post = await CommunityPost.create({
      authorId: userId,
      postType,
      text,
      mediaItems,
      mediaType,
      mediaUrl: primaryMedia?.url || "",
      mediaMimeType: primaryMedia?.mimeType || "",
      mediaOriginalName: primaryMedia?.originalName || "",
      mediaSize: mediaItems.reduce(
        (total, item) => total + Number(item?.size || 0),
        0,
      ),
      gameSnapshot,
      submissionFingerprint,
      status: "pending",
    });

    const [created, postingUser] = await Promise.all([
      CommunityPost.findById(post._id)
        .populate("authorId", "fullName avatar rating")
        .lean(),
      User.findById(userId).select(POSTING_ACCESS_USER_FIELDS).lean(),
    ]);

    res.status(201).json({
      message: "Post submitted for admin review.",
      post: toCommunityPostDTO(created),
      postingAccess: serializePostingAccess(
        buildCommunityPostingAccess(postingUser || {}, new Date()),
      ),
    });
  } catch (err) {
    console.error("Create community post error:", err);
    await cleanupCommunityMedia(req.files);

    if (reservedSlot && reservedAt) {
      await User.updateOne(
        { _id: userId },
        { $pull: { communitySubmissionTimestamps: reservedAt } },
      ).catch(() => null);
    }

    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/:postId", authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(postId || ""))) {
      return res.status(400).json({ error: "Invalid post id." });
    }

    const post = await CommunityPost.findOneAndDelete({
      _id: postId,
      authorId: req.user.userId,
    }).lean();

    if (!post) {
      const exists = await CommunityPost.exists({ _id: postId });
      return res
        .status(exists ? 403 : 404)
        .json({
          error: exists ? "You can only delete your own posts." : "Post not found.",
        });
    }

    const mediaUrls = getCommunityMediaUrls(post);
    if (mediaUrls.length > 0) {
      await Promise.all(
        mediaUrls.map(async (url) => {
          const filePath = path.join(communityUploadsRoot, path.basename(url));
          await import("fs/promises").then((fs) =>
            fs.unlink(filePath).catch(() => null),
          );
        }),
      );
    }

    res.json({ success: true, message: "Post deleted." });
  } catch (err) {
    console.error("Delete own community post error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
