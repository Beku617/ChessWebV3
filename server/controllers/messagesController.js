import { Router } from "express";
import mongoose from "mongoose";
import { authMiddleware } from "../middleware/index.js";
import { BlockedUser, Friend, Message, User } from "../models/index.js";
import { notifyUser } from "../services/notify.js";
import { areFriends } from "../utils/friendship.js";

const router = Router();
const VISIBLE_MESSAGE_STATUSES = ["delivered", "request_accepted"];
const MAX_MESSAGE_LENGTH = 2000;

const visibleStatusQuery = () => ({
  $or: [{ status: { $in: VISIBLE_MESSAGE_STATUSES } }, { status: { $exists: false } }],
});

const toObjectId = (value) => new mongoose.Types.ObjectId(String(value));
const toId = (value) => (value ? String(value) : "");
const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ""));

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
          $and: [{ $or: [{ sender: userId }, { receiver: userId }] }, visibleStatusQuery()],
        },
      },
      {
        $addFields: {
          partnerId: { $cond: [{ $eq: ["$sender", userId] }, "$receiver", "$sender"] },
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$partnerId",
          lastMessage: { $first: "$content" },
          lastMessageAt: { $first: "$createdAt" },
          lastSender: { $first: "$sender" },
          unreadCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$receiver", userId] }, { $eq: ["$read", false] }] },
                1,
                0,
              ],
            },
          },
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
          lastMessageAt: 1,
          lastSender: 1,
          unreadCount: 1,
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
    const filteredConversations = conversations.filter((c) =>
      friendSet.has(String(c.partnerId)),
    );

    res.json({ conversations: filteredConversations });
  } catch (err) {
    console.error("Conversations list error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/messages/unread-count — total unread count for visible messages
router.get("/unread-count", async (req, res) => {
  try {
    const count = await Message.countDocuments({
      receiver: req.user.userId,
      read: false,
      ...visibleStatusQuery(),
    });
    res.json({ count });
  } catch (err) {
    console.error("Unread count error:", err);
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

    const query = {
      $and: [
        { $or: [{ sender: userId, receiver: friendId }, { sender: friendId, receiver: userId }] },
        visibleStatusQuery(),
      ],
    };

    if (before) {
      const parsedDate = new Date(before);
      if (Number.isFinite(parsedDate.getTime())) {
        query.createdAt = { $lt: parsedDate };
      }
    }

    const messages = await Message.find(query).sort({ createdAt: -1 }).limit(limit).lean();

    res.json({ messages: messages.reverse() });
  } catch (err) {
    console.error("Get messages error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/messages — send a message (direct or request)
router.post("/", async (req, res) => {
  try {
    const senderId = req.user.userId;
    const receiverId = String(req.body?.receiverId || "").trim();
    const content = String(req.body?.content || "").trim();

    if (!receiverId) {
      return res.status(400).json({ error: "Receiver id required" });
    }
    if (!isValidObjectId(receiverId)) {
      return res.status(400).json({ error: "Invalid receiver id" });
    }
    if (!content || content.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: "Message must be 1-2000 characters" });
    }
    if (receiverId === senderId) {
      return res.status(400).json({ error: "Cannot message yourself" });
    }

    const receiver = await User.findOne({ _id: receiverId, deletedAt: null })
      .select("_id")
      .lean();
    if (!receiver) {
      return res.status(404).json({ error: "Receiver not found" });
    }

    if (!(await areFriends(senderId, receiverId))) {
      return res
        .status(403)
        .json({ error: "You must be friends to send direct messages." });
    }

    if (await hasBlockRelation(senderId, receiverId)) {
      return res.status(403).json({ error: "Messaging is blocked between users" });
    }

    const message = await Message.create({
      sender: senderId,
      receiver: receiverId,
      content,
      status: "delivered",
    });

    await notifyUser(req.app, {
      userId: receiverId,
      type: "new_message",
      title: "New message",
      message: "You received a new message.",
      link: "/messages",
      payload: { fromUserId: senderId, messageId: toId(message._id) },
    });

    res.json({
      message: {
        _id: message._id,
        sender: message.sender,
        receiver: message.receiver,
        content: message.content,
        read: message.read,
        status: "delivered",
        createdAt: message.createdAt,
      },
      mode: "direct",
    });
  } catch (err) {
    console.error("Send message error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/messages/read/:friendId — mark visible messages as read
router.patch("/read/:friendId", async (req, res) => {
  try {
    const userId = req.user.userId;
    const { friendId } = req.params;

    await Message.updateMany(
      {
        sender: friendId,
        receiver: userId,
        read: false,
        ...visibleStatusQuery(),
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
