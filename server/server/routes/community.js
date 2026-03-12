import path from "path";
import mongoose from "mongoose";
import { Router } from "express";
import { authMiddleware } from "../middleware/index.js";
import { CommunityGroup, CommunityPost, User } from "../models/index.js";
import {
  addUserToCommunityGroup,
  buildCommunityGroupDetail,
  buildCommunityGroupsOverview,
  buildUniqueCommunityGroupSlug,
  ensureUniqueCommunityGroupName,
  findCommunityGroupByIdentifier,
  listCommunityGroupsForUser,
  normalizeCommunityGroup,
  normalizeCommunityGroupName,
  removeUserFromCommunityGroup,
  validateCommunityGroupInput,
} from "../utils/communityGroups.js";
import {
  buildCommunityGameSnapshot,
  findShareableCommunityGameForUser,
  listShareableCommunityGamesForUser,
} from "../utils/communityGames.js";
import {
  createCommunityPostLike,
  deleteCommunityPostLikes,
  getCommunityLikedPostIdSet,
  listTrendingCommunityPosts,
  removeCommunityPostLike,
} from "../utils/communityLikes.js";
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
const COMMUNITY_POST_AUTHOR_FIELDS = "fullName avatar rating";

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

function toObjectIdArray(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value || "").trim())
    .filter((value, index, array) =>
      value && array.indexOf(value) === index && mongoose.Types.ObjectId.isValid(value),
    )
    .map((value) => new mongoose.Types.ObjectId(value));
}

function mergeWeightedPosts(groupPosts, generalPosts, limit, page) {
  const prioritized = Array.isArray(groupPosts) ? [...groupPosts] : [];
  const general = Array.isArray(generalPosts) ? [...generalPosts] : [];
  const merged = [];
  const pattern = [0, 0, 1];

  while (prioritized.length > 0 || general.length > 0) {
    for (const slot of pattern) {
      if (slot === 0 && prioritized.length > 0) {
        merged.push(prioritized.shift());
      } else if (slot === 1 && general.length > 0) {
        merged.push(general.shift());
      }
      if (merged.length >= page * limit) {
        return merged.slice((page - 1) * limit, page * limit);
      }
    }

    if (prioritized.length === 0 && general.length > 0) {
      while (general.length > 0 && merged.length < page * limit) {
        merged.push(general.shift());
      }
      break;
    }

    if (general.length === 0 && prioritized.length > 0) {
      while (prioritized.length > 0 && merged.length < page * limit) {
        merged.push(prioritized.shift());
      }
      break;
    }
  }

  return merged.slice((page - 1) * limit, page * limit);
}

function populateCommunityPostQuery(query) {
  return query
    .populate("authorId", COMMUNITY_POST_AUTHOR_FIELDS)
    .populate({
      path: "groupId",
      populate: { path: "creatorId", select: "fullName avatar" },
    });
}

async function serializeCommunityPosts(items, userId) {
  const likedPostIds = await getCommunityLikedPostIdSet(
    Array.isArray(items) ? items.map((item) => item?._id).filter(Boolean) : [],
    userId,
  );

  return (Array.isArray(items) ? items : [])
    .map((post) => toCommunityPostDTO(post, { likedPostIds }))
    .filter((post) => post?.author?.id);
}

async function loadRankedCommunityFeed(userId, { page, limit }) {
  const currentUserId = String(userId || "");
  const currentUser = currentUserId
    ? await User.findById(currentUserId).select("communityJoinedGroupIds").lean()
    : null;
  const joinedGroupIds = toObjectIdArray(currentUser?.communityJoinedGroupIds || []);

  if (joinedGroupIds.length === 0) {
    const query = { status: "approved" };
    const [items, total] = await Promise.all([
      populateCommunityPostQuery(CommunityPost.find(query))
        .sort({ approvedAt: -1, createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      CommunityPost.countDocuments(query),
    ]);

    return { items, total, joinedGroupIds: [] };
  }

  const baseFetchLimit = Math.max(limit * page * 3, limit * 3, 24);
  const groupQuery = {
    status: "approved",
    groupId: { $in: joinedGroupIds },
  };
  const generalQuery = {
    status: "approved",
    $or: [{ groupId: null }, { groupId: { $nin: joinedGroupIds } }],
  };

  const [groupPosts, generalPosts, total] = await Promise.all([
    populateCommunityPostQuery(CommunityPost.find(groupQuery))
      .sort({ approvedAt: -1, createdAt: -1, _id: -1 })
      .limit(baseFetchLimit)
      .lean(),
    populateCommunityPostQuery(CommunityPost.find(generalQuery))
      .sort({ approvedAt: -1, createdAt: -1, _id: -1 })
      .limit(baseFetchLimit)
      .lean(),
    CommunityPost.countDocuments({ status: "approved" }),
  ]);

  return {
    items: mergeWeightedPosts(groupPosts, generalPosts, limit, page),
    total,
    joinedGroupIds: joinedGroupIds.map((value) => String(value)),
  };
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

router.get("/", authMiddleware, async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query, {
      defaultLimit: 8,
      maxLimit: 20,
    });
    const userId = String(req.user?.userId || "");
    if (!isValidObjectId(userId)) {
      return res.status(401).json({ error: "Invalid user session." });
    }

    const { items, total, joinedGroupIds } = await loadRankedCommunityFeed(userId, {
      page,
      limit,
    });
    const posts = await serializeCommunityPosts(items, userId);

    res.json({
      posts,
      total,
      feedMode: joinedGroupIds.length > 0 ? "group_weighted" : "general",
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
        .populate({
          path: "groupId",
          populate: { path: "creatorId", select: "fullName avatar" },
        })
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

    const likedPostIds = await getCommunityLikedPostIdSet(
      posts.map((post) => post?._id).filter(Boolean),
      userId,
    );
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
        }, { likedPostIds }),
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

router.get("/trending", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.user?.userId || "");
    if (!isValidObjectId(userId)) {
      return res.status(401).json({ error: "Invalid user session." });
    }

    const { items, mode } = await listTrendingCommunityPosts(3);
    const populatedItems = items.length
      ? await populateCommunityPostQuery(
          CommunityPost.find({
            _id: { $in: items.map((item) => item._id) },
          }),
        )
          .sort(
            mode === "likes"
              ? { likeCount: -1, createdAt: -1, _id: -1 }
              : { createdAt: -1, _id: -1 },
          )
          .lean()
      : [];
    const posts = await serializeCommunityPosts(populatedItems, userId);

    res.json({
      posts,
      mode,
    });
  } catch (err) {
    console.error("Community trending error:", err);
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

router.get("/groups/overview", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.user?.userId || "");
    if (!isValidObjectId(userId)) {
      return res.status(401).json({ error: "Invalid user session." });
    }

    const overview = await buildCommunityGroupsOverview(userId, {
      joinedLimit: 4,
      discoverLimit: 6,
    });

    res.json({
      joinedGroups: overview.joinedGroups,
      discoverGroups: overview.discoverGroups,
      joinedCount: overview.joinedGroupIds.length,
      joinedGroupIds: overview.joinedGroupIds,
    });
  } catch (err) {
    console.error("Community groups overview error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/groups", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.user?.userId || "");
    if (!isValidObjectId(userId)) {
      return res.status(401).json({ error: "Invalid user session." });
    }

    const limit = Math.min(40, Math.max(1, Number(req.query.limit) || 24));
    const search = String(req.query.search || "").trim();
    const scope = String(req.query.scope || "").trim().toLowerCase();
    const groups = await listCommunityGroupsForUser(userId, { limit, search });

    const filteredGroups =
      scope === "joined"
        ? groups.filter((group) => group?.joined)
        : scope === "discover"
          ? groups.filter((group) => !group?.joined)
          : groups;

    res.json({
      groups: filteredGroups,
      total: filteredGroups.length,
    });
  } catch (err) {
    console.error("Community groups list error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/groups", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.user?.userId || "");
    if (!isValidObjectId(userId)) {
      return res.status(401).json({ error: "Invalid user session." });
    }

    const validationError = validateCommunityGroupInput(req.body || {});
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const name = normalizeCommunityGroupName(req.body?.name);
    const description = String(req.body?.description || "").trim();
    const topic = String(req.body?.topic || "").trim();
    const uniqueName = await ensureUniqueCommunityGroupName(name);
    if (!uniqueName) {
      return res.status(409).json({
        error: "A group with this name already exists.",
      });
    }

    const slug = await buildUniqueCommunityGroupSlug(name);
    const creatorObjectId = new mongoose.Types.ObjectId(userId);
    const group = await CommunityGroup.create({
      name,
      normalizedName: name.toLowerCase(),
      slug,
      description,
      topic,
      creatorId: creatorObjectId,
      creatorDisplayName: req.user?.fullName || "",
      memberCount: 1,
    });

    await User.updateOne(
      { _id: creatorObjectId },
      {
        $addToSet: { communityJoinedGroupIds: group._id },
      },
    );

    const createdGroup = await findCommunityGroupByIdentifier(group.slug)
      .populate("creatorId", "fullName avatar")
      .lean();

    res.status(201).json({
      message: "Group created.",
      group: normalizeCommunityGroup(
        {
          ...createdGroup,
          currentUserJoinedGroupIds: [String(group._id)],
        },
        userId,
      ),
    });
  } catch (err) {
    console.error("Create community group error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/groups/:groupIdentifier", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.user?.userId || "");
    if (!isValidObjectId(userId)) {
      return res.status(401).json({ error: "Invalid user session." });
    }

    const detail = await buildCommunityGroupDetail(req.params.groupIdentifier, userId);
    if (!detail) {
      return res.status(404).json({ error: "Group not found." });
    }

    res.json({ group: detail });
  } catch (err) {
    console.error("Community group detail error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/groups/:groupIdentifier/posts", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.user?.userId || "");
    if (!isValidObjectId(userId)) {
      return res.status(401).json({ error: "Invalid user session." });
    }

    const group = await findCommunityGroupByIdentifier(req.params.groupIdentifier)
      .populate("creatorId", "fullName avatar")
      .lean();
    if (!group?._id) {
      return res.status(404).json({ error: "Group not found." });
    }

    const { page, limit, skip } = parsePagination(req.query, {
      defaultLimit: 8,
      maxLimit: 20,
    });

    const query = { status: "approved", groupId: group._id };
    const [items, total, detail] = await Promise.all([
      populateCommunityPostQuery(CommunityPost.find(query))
        .sort({ approvedAt: -1, createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CommunityPost.countDocuments(query),
      buildCommunityGroupDetail(String(group.slug || group._id), userId),
    ]);

    const posts = await serializeCommunityPosts(items, userId);
    res.json({
      group: detail,
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
    console.error("Community group posts error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/groups/:groupIdentifier/join", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.user?.userId || "");
    if (!isValidObjectId(userId)) {
      return res.status(401).json({ error: "Invalid user session." });
    }

    const group = await findCommunityGroupByIdentifier(req.params.groupIdentifier);
    if (!group?._id) {
      return res.status(404).json({ error: "Group not found." });
    }

    await addUserToCommunityGroup(group._id, userId);
    const detail = await buildCommunityGroupDetail(String(group.slug || group._id), userId);
    res.json({
      message: "Joined group.",
      group: detail,
    });
  } catch (err) {
    console.error("Join community group error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/groups/:groupIdentifier/leave", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.user?.userId || "");
    if (!isValidObjectId(userId)) {
      return res.status(401).json({ error: "Invalid user session." });
    }

    const group = await findCommunityGroupByIdentifier(req.params.groupIdentifier);
    if (!group?._id) {
      return res.status(404).json({ error: "Group not found." });
    }

    await removeUserFromCommunityGroup(group._id, userId);
    const detail = await buildCommunityGroupDetail(String(group.slug || group._id), userId);
    res.json({
      message: "Left group.",
      group: detail,
    });
  } catch (err) {
    console.error("Leave community group error:", err);
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
    const groupIdentifier = String(req.body?.groupId || "").trim();

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

    let selectedGroup = null;
    if (groupIdentifier) {
      selectedGroup = await findCommunityGroupByIdentifier(groupIdentifier);
      if (!selectedGroup?._id) {
        await cleanupCommunityMedia(files);
        return res.status(404).json({ error: "Selected group could not be found." });
      }

      const membership = await User.findOne({
        _id: userId,
        communityJoinedGroupIds: selectedGroup._id,
      })
        .select("_id")
        .lean();

      if (!membership) {
        await cleanupCommunityMedia(files);
        return res.status(403).json({
          error: "You can only post to groups you have joined.",
        });
      }
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
      groupId: selectedGroup?._id ? String(selectedGroup._id) : "",
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
      await cleanupCommunityMedia(files);
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
      groupId: selectedGroup?._id || null,
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

    if (selectedGroup?._id) {
      await CommunityGroup.updateOne(
        { _id: selectedGroup._id },
        { $set: { lastPostAt: new Date() } },
      ).catch(() => null);
    }

    const [created, postingUser] = await Promise.all([
      CommunityPost.findById(post._id)
        .populate("authorId", COMMUNITY_POST_AUTHOR_FIELDS)
        .populate({
          path: "groupId",
          populate: { path: "creatorId", select: "fullName avatar" },
        })
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

router.post("/:postId/like", authMiddleware, async (req, res) => {
  try {
    const postId = String(req.params.postId || "");
    const userId = String(req.user?.userId || "");
    if (!isValidObjectId(postId) || !isValidObjectId(userId)) {
      return res.status(400).json({ error: "Invalid request." });
    }

    const result = await createCommunityPostLike(postId, userId);
    if (!result.ok) {
      if (result.code === "not_found") {
        return res.status(404).json({ error: "Approved post not found." });
      }
      if (result.code === "self_like_blocked") {
        return res.status(403).json({ error: "You can't like your own post." });
      }
      return res.status(400).json({ error: "Unable to like this post." });
    }

    res.json({
      success: true,
      likedByMe: true,
      likeCount: Number(result.likeCount || 0),
    });
  } catch (err) {
    console.error("Community like error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/:postId/like", authMiddleware, async (req, res) => {
  try {
    const postId = String(req.params.postId || "");
    const userId = String(req.user?.userId || "");
    if (!isValidObjectId(postId) || !isValidObjectId(userId)) {
      return res.status(400).json({ error: "Invalid request." });
    }

    const result = await removeCommunityPostLike(postId, userId);
    if (!result.ok) {
      if (result.code === "not_found") {
        return res.status(404).json({ error: "Post not found." });
      }
      return res.status(400).json({ error: "Unable to unlike this post." });
    }

    res.json({
      success: true,
      likedByMe: false,
      likeCount: Number(result.likeCount || 0),
    });
  } catch (err) {
    console.error("Community unlike error:", err);
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

    await deleteCommunityPostLikes(post._id);

    res.json({ success: true, message: "Post deleted." });
  } catch (err) {
    console.error("Delete own community post error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
