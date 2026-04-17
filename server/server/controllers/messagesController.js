import { Router } from "express";
import mongoose from "mongoose";
import multer from "multer";
import { authMiddleware } from "../middleware/index.js";
import {
  BlockedUser,
  Friend,
  History,
  History960,
  Message,
  User,
  UserConversationState,
} from "../models/index.js";
import { notifyUser } from "../services/notify.js";
import { areFriends } from "../utils/friendship.js";
import {
  createMediaUploadStorage,
  isCloudinaryConfigurationError,
} from "../utils/mediaStorage.js";
import {
  buildMessageAttachments,
  cleanupMessageMedia,
  ensureMessageAttachmentMedia,
} from "../utils/messageMedia.js";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const ALLOWED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB per image
const MAX_TOTAL_IMAGE_BYTES = 32 * 1024 * 1024; // 32MB per message (images only)
const MAX_IMAGES_PER_MESSAGE = 10;
const MAX_VIDEOS_PER_MESSAGE = 1;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50MB per video

const storage = createMediaUploadStorage({
  category: "messages",
});

const upload = multer({
  storage,
  limits: {
    fileSize: Math.max(MAX_IMAGE_BYTES, MAX_VIDEO_BYTES),
    files: MAX_IMAGES_PER_MESSAGE + MAX_VIDEOS_PER_MESSAGE,
  },
  fileFilter: (_req, file, cb) => {
    if (
      !ALLOWED_IMAGE_TYPES.has(file.mimetype) &&
      !ALLOWED_VIDEO_TYPES.has(file.mimetype)
    ) {
      const err = new multer.MulterError(
        "LIMIT_UNEXPECTED_FILE",
        file.fieldname,
      );
      err.message =
        "Unsupported file type. Please upload jpg, jpeg, png, webp, gif, mp4, webm, or mov.";
      return cb(err);
    }
    cb(null, true);
  },
});

const uploadAttachments = (req, res, next) =>
  upload.array("attachments", MAX_IMAGES_PER_MESSAGE + MAX_VIDEOS_PER_MESSAGE)(
    req,
    res,
    (err) => {
      if (err) {
        if (isCloudinaryConfigurationError(err)) {
          return res.status(503).json({
            error:
              "Media upload is temporarily unavailable. Please verify Cloudinary credentials on the server.",
          });
        }
        const message =
          err instanceof multer.MulterError
            ? err.message ||
              "Attachment error. Please ensure files are jpg/png/webp/gif or mp4/webm/mov and within size limits."
            : "Failed to upload attachments.";
        return res.status(400).json({ error: message });
      }
      return next();
    },
  );

const router = Router();
const VISIBLE_MESSAGE_STATUSES = ["delivered", "request_accepted"];
const MAX_MESSAGE_LENGTH = 2000;
const STATE_COLLECTION =
  UserConversationState.collection?.name || "userconversationstates";

const visibleStatusQuery = () => ({
  $or: [
    { status: { $in: VISIBLE_MESSAGE_STATUSES } },
    { status: { $exists: false } },
  ],
});

const summarizeAttachmentLabel = (attachments = []) => {
  const list = Array.isArray(attachments) ? attachments : [];
  const videos = list.filter(
    (a) => a?.type === "video" || (a?.mimeType || "").startsWith("video/"),
  ).length;
  const images = list.filter(
    (a) => a?.type === "image" || (a?.mimeType || "").startsWith("image/"),
  ).length;

  if (videos > 0) return videos > 1 ? `${videos} Videos` : "Video";
  if (images > 0) return images > 1 ? `${images} Photos` : "Photo";
  return "";
};

const getMessagePreview = (content, attachments, sharedGame) => {
  if (sharedGame?.gameId) return "Shared a game";
  const text = String(content || "").trim();
  const label = summarizeAttachmentLabel(attachments);
  if (!label) return text;
  if (!text) return label;
  return `${text} · ${label}`;
};

const toObjectId = (value) => new mongoose.Types.ObjectId(String(value));
const toId = (value) => (value ? String(value) : "");
const isValidObjectId = (value) =>
  mongoose.Types.ObjectId.isValid(String(value || ""));
const getUserRoom = (userId) => `user:${userId}`;

async function hasBlockRelation(userA, userB) {
  return !!(await BlockedUser.findOne({
    $or: [
      { blocker: userA, blocked: userB },
      { blocker: userB, blocked: userA },
    ],
  })
    .select("_id")
    .lean());
}

router.use(authMiddleware);

// GET /api/messages/conversations — list conversations with latest visible message
router.get("/conversations", async (req, res) => {
  try {
    const userId = toObjectId(req.user.userId);
    const userIdStr = String(req.user.userId);

    const conversations = await Message.aggregate([
      {
        $match: {
          $and: [
            { $or: [{ sender: userId }, { receiver: userId }] },
            visibleStatusQuery(),
          ],
        },
      },
      {
        $addFields: {
          partnerId: {
            $cond: [{ $eq: ["$sender", userId] }, "$receiver", "$sender"],
          },
        },
      },
      {
        $lookup: {
          from: STATE_COLLECTION,
          let: { partnerId: "$partnerId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$userId", userId] },
                    { $eq: ["$partnerId", "$$partnerId"] },
                  ],
                },
              },
            },
            { $project: { clearedAt: 1, archivedAt: 1, deletedAt: 1 } },
          ],
          as: "state",
        },
      },
      { $addFields: { state: { $first: "$state" } } },
      {
        $addFields: {
          clearedAt: { $ifNull: ["$state.clearedAt", null] },
          archivedAt: { $ifNull: ["$state.archivedAt", null] },
          deletedAt: { $ifNull: ["$state.deletedAt", null] },
        },
      },
      {
        $match: {
          $expr: {
            $or: [
              { $eq: ["$clearedAt", null] },
              { $gt: ["$createdAt", "$clearedAt"] },
            ],
          },
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$partnerId",
          lastMessage: { $first: "$content" },
          lastAttachments: { $first: "$attachments" },
          lastSharedGame: { $first: "$sharedGame" },
          lastMessageAt: { $first: "$createdAt" },
          lastSender: { $first: "$sender" },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$receiver", userId] },
                    { $eq: ["$read", false] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          archivedAt: { $first: "$archivedAt" },
          deletedAt: { $first: "$deletedAt" },
          clearedAt: { $first: "$clearedAt" },
        },
      },
      { $sort: { lastMessageAt: -1 } },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "partner",
        },
      },
      { $unwind: "$partner" },
      {
        $project: {
          partnerId: "$_id",
          partnerName: "$partner.fullName",
          partnerAvatar: { $ifNull: ["$partner.avatar", ""] },
          lastMessage: 1,
          lastAttachments: 1,
          lastMessageAt: 1,
          lastSender: 1,
          unreadCount: 1,
          archivedAt: 1,
          deletedAt: 1,
          clearedAt: 1,
        },
      },
    ]);

    const partnerIds = conversations.map((c) => String(c.partnerId));

    const friendEdges = await Friend.find({
      userId: userIdStr,
      friendId: { $in: partnerIds },
    })
      .select("friendId")
      .lean();
    const friendSet = new Set(friendEdges.map((f) => String(f.friendId)));
    const filteredConversations = conversations
      .filter((c) => friendSet.has(String(c.partnerId)))
      .map((c) => {
        const lastAttachmentCount = Array.isArray(c.lastAttachments)
          ? c.lastAttachments.length
          : 0;
        const preview = getMessagePreview(
          c.lastMessage,
          c.lastAttachments,
          c.lastSharedGame,
        );
        const { lastAttachments, lastSharedGame, ...rest } = c;
        return {
          ...rest,
          lastAttachmentCount,
          lastMessage: preview,
          archived: !!c.archivedAt,
          isArchived: !!c.archivedAt,
        };
      });

    res.json({ conversations: filteredConversations });
  } catch (err) {
    console.error("Conversations list error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/messages/unread-count — total unread count for visible messages
router.get("/unread-count", async (req, res) => {
  try {
    const userId = toObjectId(req.user.userId);
    const states = await UserConversationState.find({
      userId: req.user.userId,
    })
      .select("partnerId clearedAt")
      .lean();

    const clearedStates = states.filter((s) => s.clearedAt);
    const clearedPartners = clearedStates.map((s) => toObjectId(s.partnerId));

    const query = {
      receiver: userId,
      read: false,
      ...visibleStatusQuery(),
    };

    if (clearedStates.length > 0) {
      query.$or = [
        { sender: { $nin: clearedPartners } },
        ...clearedStates.map((s) => ({
          $and: [
            { sender: toObjectId(s.partnerId) },
            { createdAt: { $gt: s.clearedAt } },
          ],
        })),
      ];
    }

    const count = await Message.countDocuments(query);
    res.json({ count });
  } catch (err) {
    console.error("Unread count error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/messages/conversations/:partnerId/archive — archive/unarchive for current user
router.patch("/conversations/:partnerId/archive", async (req, res) => {
  try {
    const userId = String(req.user.userId || "");
    const partnerId = String(req.params?.partnerId || "");
    const archive = req.body?.archived !== false;

    if (!isValidObjectId(partnerId)) {
      return res.status(400).json({ error: "Invalid conversation id" });
    }

    if (!(await areFriends(userId, partnerId))) {
      return res
        .status(403)
        .json({ error: "Not authorized for this conversation." });
    }

    const archivedAt = archive ? new Date() : null;
    const state = await UserConversationState.findOneAndUpdate(
      { userId, partnerId },
      { $set: { archivedAt, deletedAt: null } },
      { upsert: true, new: true },
    )
      .select("archivedAt partnerId")
      .lean();

    res.json({ success: true, archived: !!state?.archivedAt });
  } catch (err) {
    console.error("Archive conversation error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/messages/conversations/:partnerId — soft delete for current user
router.delete("/conversations/:partnerId", async (req, res) => {
  try {
    const userId = String(req.user.userId || "");
    const partnerId = String(req.params?.partnerId || "");

    if (!isValidObjectId(partnerId)) {
      return res.status(400).json({ error: "Invalid conversation id" });
    }

    if (!(await areFriends(userId, partnerId))) {
      return res
        .status(403)
        .json({ error: "Not authorized for this conversation." });
    }

    const now = new Date();
    await UserConversationState.findOneAndUpdate(
      { userId, partnerId },
      { $set: { deletedAt: now, clearedAt: now, archivedAt: null } },
      { upsert: true, new: true },
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Delete conversation error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/messages/requests — pending incoming/outgoing message requests
router.get("/requests", async (req, res) => {
  return res.json({ incoming: [], outgoing: [] });
});

// POST /api/messages/requests/:userId/accept — accept pending requests from user
router.post("/requests/:userId/accept", async (req, res) => {
  return res
    .status(410)
    .json({ error: "Message requests are disabled. Add as friend to chat." });
});

// POST /api/messages/requests/:userId/decline — decline pending requests from user
router.post("/requests/:userId/decline", async (req, res) => {
  return res
    .status(410)
    .json({ error: "Message requests are disabled. Add as friend to chat." });
});

// GET /api/messages/:friendId — get visible message history
router.get("/:friendId", async (req, res) => {
  try {
    const userId = req.user.userId;
    const { friendId } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const before = req.query.before;

    if (!(await areFriends(userId, friendId))) {
      return res
        .status(403)
        .json({ error: "Direct messages are available between friends only." });
    }

    const state = await UserConversationState.findOne({
      userId,
      partnerId: friendId,
    })
      .select("clearedAt")
      .lean();
    const clearedAt = state?.clearedAt || null;

    const query = {
      $and: [
        {
          $or: [
            { sender: userId, receiver: friendId },
            { sender: friendId, receiver: userId },
          ],
        },
        visibleStatusQuery(),
      ],
    };

    const createdAt = {};
    if (before) {
      const parsedDate = new Date(before);
      if (Number.isFinite(parsedDate.getTime())) {
        createdAt.$lt = parsedDate;
      }
    }
    if (clearedAt) {
      createdAt.$gt = clearedAt;
    }
    if (Object.keys(createdAt).length > 0) {
      query.createdAt = createdAt;
    }

    const rawMessages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    const messages = await Promise.all(
      rawMessages.map((message) => ensureMessageAttachmentMedia(message)),
    );

    res.json({ messages: messages.reverse() });
  } catch (err) {
    console.error("Get messages error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/messages — send a message (text and/or media)
router.post("/", uploadAttachments, async (req, res) => {
  try {
    const senderId = req.user.userId;
    const receiverId = String(req.body?.receiverId || "").trim();
    const rawContent =
      typeof req.body?.content === "string"
        ? req.body.content
        : typeof req.body?.text === "string"
          ? req.body.text
          : "";
    const content = String(rawContent || "").trim();
    const files = Array.isArray(req.files) ? req.files : [];

    if (!receiverId) {
      return res.status(400).json({ error: "Receiver id required" });
    }
    if (!isValidObjectId(receiverId)) {
      await cleanupMessageMedia(files);
      return res.status(400).json({ error: "Invalid receiver id" });
    }

    if (content.length > MAX_MESSAGE_LENGTH) {
      await cleanupMessageMedia(files);
      return res
        .status(400)
        .json({ error: "Message text is too long (2000 characters max)." });
    }

    const images = files.filter((file) =>
      ALLOWED_IMAGE_TYPES.has(file.mimetype),
    );
    const videos = files.filter((file) =>
      ALLOWED_VIDEO_TYPES.has(file.mimetype),
    );

    if (images.length + videos.length !== files.length) {
      await cleanupMessageMedia(files);
      return res.status(400).json({ error: "Unsupported file type." });
    }

    if (!content && images.length === 0 && videos.length === 0) {
      await cleanupMessageMedia(files);
      return res
        .status(400)
        .json({
          error: "Message must include text or at least one attachment.",
        });
    }

    if (images.length > 0 && videos.length > 0) {
      await cleanupMessageMedia(files);
      return res
        .status(400)
        .json({
          error:
            "Send either multiple images or one video per message (with optional text).",
        });
    }

    if (images.length > MAX_IMAGES_PER_MESSAGE) {
      await cleanupMessageMedia(files);
      return res
        .status(400)
        .json({
          error: `You can upload up to ${MAX_IMAGES_PER_MESSAGE} images per message.`,
        });
    }

    if (videos.length > MAX_VIDEOS_PER_MESSAGE) {
      await cleanupMessageMedia(files);
      return res
        .status(400)
        .json({ error: "Only one video can be sent per message." });
    }

    const invalidImage = images.find((file) => file.size > MAX_IMAGE_BYTES);
    if (invalidImage) {
      await cleanupMessageMedia(files);
      return res
        .status(400)
        .json({
          error: `${invalidImage.originalname || "Image"} is too large (max 8MB per image).`,
        });
    }

    const totalImageBytes = images.reduce(
      (sum, file) => sum + (Number(file.size) || 0),
      0,
    );
    if (images.length > 0 && totalImageBytes > MAX_TOTAL_IMAGE_BYTES) {
      await cleanupMessageMedia(files);
      const limitMb = Math.round(MAX_TOTAL_IMAGE_BYTES / (1024 * 1024));
      return res
        .status(400)
        .json({
          error: `Attachments are too large. Please keep the total under ${limitMb}MB.`,
        });
    }

    const invalidVideo = videos.find((file) => file.size > MAX_VIDEO_BYTES);
    if (invalidVideo) {
      await cleanupMessageMedia(files);
      const limitMb = Math.round(MAX_VIDEO_BYTES / (1024 * 1024));
      return res
        .status(400)
        .json({
          error: `${invalidVideo.originalname || "Video"} is too large (max ${limitMb}MB).`,
        });
    }

    if (receiverId === senderId) {
      await cleanupMessageMedia(files);
      return res.status(400).json({ error: "Cannot message yourself" });
    }

    const receiver = await User.findOne({ _id: receiverId, deletedAt: null })
      .select("_id")
      .lean();
    if (!receiver) {
      await cleanupMessageMedia(files);
      return res.status(404).json({ error: "Receiver not found" });
    }

    if (!(await areFriends(senderId, receiverId))) {
      await cleanupMessageMedia(files);
      return res
        .status(403)
        .json({ error: "You must be friends to send direct messages." });
    }

    if (await hasBlockRelation(senderId, receiverId)) {
      await cleanupMessageMedia(files);
      return res
        .status(403)
        .json({ error: "Messaging is blocked between users" });
    }

    const attachments = buildMessageAttachments([...images, ...videos]);

    const message = await Message.create({
      sender: senderId,
      receiver: receiverId,
      content,
      attachments,
      status: "delivered",
    });

    // Revive conversation visibility for both participants (including auto-unarchive on new inbound messages)
    // while preserving the clearedAt boundary so older history stays hidden for the user who deleted.
    await UserConversationState.findOneAndUpdate(
      { userId: senderId, partnerId: receiverId },
      {
        $set: { deletedAt: null, archivedAt: null },
        $setOnInsert: { clearedAt: null },
      },
      { upsert: true },
    );
    await UserConversationState.findOneAndUpdate(
      { userId: receiverId, partnerId: senderId },
      {
        $set: { deletedAt: null, archivedAt: null },
        $setOnInsert: { clearedAt: null },
      },
      { upsert: true },
    );

    const preview = getMessagePreview(content, attachments);

    await notifyUser(req.app, {
      userId: receiverId,
      type: "new_message",
      title: "New message",
      message:
        attachments.length > 0
          ? summarizeAttachmentLabel(attachments) === "Video"
            ? "You received a new video."
            : "You received new photos."
          : "You received a new message.",
      link: "/messages",
      payload: { fromUserId: senderId, messageId: toId(message._id) },
    });

    const payload = {
      _id: message._id,
      sender: message.sender,
      receiver: message.receiver,
      content: message.content,
      attachments: message.attachments || [],
      read: message.read,
      status: "delivered",
      createdAt: message.createdAt,
    };

    const io = req.app.get("io");
    if (io) {
      io.to(getUserRoom(senderId)).emit("message:new", payload);
      io.to(getUserRoom(receiverId)).emit("message:new", payload);
    }

    res.json({
      message: payload,
      preview,
      mode: "direct",
    });
  } catch (err) {
    console.error("Send message error:", err);
    if (Array.isArray(req.files) && req.files.length > 0) {
      await cleanupMessageMedia(req.files);
    }
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/messages/share-game — send a shared game message
router.post("/share-game", async (req, res) => {
  try {
    const senderId = req.user.userId;
    const receiverId = String(req.body?.receiverId || "").trim();
    const gameId = String(req.body?.gameId || "").trim();
    const gameIndex =
      req.body?.gameIndex != null ? Number(req.body.gameIndex) : null;

    if (!receiverId || !isValidObjectId(receiverId)) {
      return res.status(400).json({ error: "Valid receiver id required." });
    }
    if (receiverId === senderId) {
      return res.status(400).json({ error: "Cannot message yourself." });
    }

    // Validate friendship
    if (!(await areFriends(senderId, receiverId))) {
      return res
        .status(403)
        .json({ error: "You must be friends to share games." });
    }
    if (await hasBlockRelation(senderId, receiverId)) {
      return res
        .status(403)
        .json({ error: "Messaging is blocked between users." });
    }

    const receiver = await User.findOne({ _id: receiverId, deletedAt: null })
      .select("_id")
      .lean();
    if (!receiver) {
      return res.status(404).json({ error: "Receiver not found." });
    }

    // Resolve game — either by gameId or by index from sender's history
    let game = null;

    if (gameId && isValidObjectId(gameId)) {
      // Direct game ID — validate sender owns the game
      game = await History.findOne({ _id: gameId, userId: senderId }).lean();
      if (!game) {
        game = await History960.findOne({
          _id: gameId,
          userId: senderId,
        }).lean();
      }
    } else if (
      gameIndex != null &&
      Number.isFinite(gameIndex) &&
      gameIndex >= 1
    ) {
      // Index-based lookup: merge standard + chess960 by createdAt desc to mirror profile ordering
      const skipN = gameIndex - 1;
      const history960Collection = History960.collection?.name || "history960s";
      const baseProject = {
        _id: 1,
        userId: 1,
        white: 1,
        black: 1,
        result: 1,
        whiteElo: 1,
        blackElo: 1,
        timeControl: 1,
        eco: 1,
        date: 1,
        utcDate: 1,
        rated: 1,
        moves: 1,
        variant: { $ifNull: ["$variant", "standard"] },
        termination: 1,
        createdAt: 1,
      };

      const unified = await History.aggregate([
        { $match: { userId: toObjectId(senderId) } },
        { $project: { ...baseProject, _source: { $literal: "standard" } } },
        {
          $unionWith: {
            coll: history960Collection,
            pipeline: [
              { $match: { userId: toObjectId(senderId) } },
              {
                $project: { ...baseProject, _source: { $literal: "chess960" } },
              },
            ],
          },
        },
        { $sort: { createdAt: -1 } },
        { $skip: skipN },
        { $limit: 1 },
      ]).exec();

      game = unified?.[0] || null;
    }

    if (!game) {
      return res
        .status(404)
        .json({
          error: "Game not found. Check the game number and try again.",
        });
    }

    // Build snapshot
    const sharedGame = {
      gameId: String(game._id),
      white: game.white || "",
      black: game.black || "",
      result: game.result || "",
      whiteElo: game.whiteElo || null,
      blackElo: game.blackElo || null,
      timeControl: game.timeControl || "",
      eco: game.eco || "",
      playedAt: game.date || game.utcDate || "",
      rated: !!game.rated,
      moves: Array.isArray(game.moves) ? game.moves.length : 0,
      variant: game.variant || "standard",
      termination: game.termination || "",
    };

    const message = await Message.create({
      sender: senderId,
      receiver: receiverId,
      content: "",
      attachments: [],
      sharedGame,
      status: "delivered",
    });

    // Revive conversation for both sides
    await UserConversationState.findOneAndUpdate(
      { userId: senderId, partnerId: receiverId },
      {
        $set: { deletedAt: null, archivedAt: null },
        $setOnInsert: { clearedAt: null },
      },
      { upsert: true },
    );
    await UserConversationState.findOneAndUpdate(
      { userId: receiverId, partnerId: senderId },
      {
        $set: { deletedAt: null, archivedAt: null },
        $setOnInsert: { clearedAt: null },
      },
      { upsert: true },
    );

    await notifyUser(req.app, {
      userId: receiverId,
      type: "new_message",
      title: "New message",
      message: "Shared a game with you.",
      link: "/messages",
      payload: { fromUserId: senderId, messageId: toId(message._id) },
    });

    const payload = {
      _id: message._id,
      sender: message.sender,
      receiver: message.receiver,
      content: message.content,
      attachments: [],
      sharedGame: message.sharedGame,
      read: message.read,
      status: "delivered",
      createdAt: message.createdAt,
    };

    const io = req.app.get("io");
    if (io) {
      io.to(getUserRoom(senderId)).emit("message:new", payload);
      io.to(getUserRoom(receiverId)).emit("message:new", payload);
    }

    res.json({
      message: payload,
      preview: "Shared a game",
      mode: "direct",
    });
  } catch (err) {
    console.error("Share game error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/messages/read/:friendId — mark visible messages as read
router.patch("/read/:friendId", async (req, res) => {
  try {
    const userId = req.user.userId;
    const { friendId } = req.params;

    const state = await UserConversationState.findOne({
      userId,
      partnerId: friendId,
    })
      .select("clearedAt")
      .lean();

    const createdAt =
      state?.clearedAt && state.clearedAt instanceof Date
        ? { $gt: state.clearedAt }
        : undefined;

    await Message.updateMany(
      {
        sender: friendId,
        receiver: userId,
        read: false,
        ...visibleStatusQuery(),
        ...(createdAt ? { createdAt } : {}),
      },
      { $set: { read: true } },
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Mark read error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
