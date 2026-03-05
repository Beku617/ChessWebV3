import { Router } from "express";
import mongoose from "mongoose";
import { authMiddleware } from "../middleware/index.js";
import { BlockedUser, Friend, Message, User } from "../models/index.js";
import { notifyUser } from "../services/notify.js";

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

async function canSendDirectMessage(senderId, receiverId) {
  const [friendship, acceptedEdge] = await Promise.all([
    Friend.findOne({ userId: senderId, friendId: receiverId }).select("_id").lean(),
    Message.findOne({
      $or: [
        { sender: senderId, receiver: receiverId, status: "request_accepted" },
        { sender: receiverId, receiver: senderId, status: "request_accepted" },
      ],
    })
      .select("_id")
      .lean(),
  ]);

  return !!(friendship || acceptedEdge);
}

router.use(authMiddleware);

// GET /api/messages/conversations — list conversations with latest visible message
router.get("/conversations", async (req, res) => {
  try {
    const userId = toObjectId(req.user.userId);

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

    res.json({ conversations });
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
  try {
    const userId = toObjectId(req.user.userId);

    const [incoming, outgoing] = await Promise.all([
      Message.aggregate([
        { $match: { receiver: userId, status: "request_pending" } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: "$sender",
            lastMessage: { $first: "$content" },
            lastMessageAt: { $first: "$createdAt" },
            totalMessages: { $sum: 1 },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: "$user" },
        {
          $project: {
            userId: "$_id",
            name: "$user.fullName",
            avatar: { $ifNull: ["$user.avatar", ""] },
            email: "$user.email",
            lastMessage: 1,
            lastMessageAt: 1,
            totalMessages: 1,
          },
        },
        { $sort: { lastMessageAt: -1 } },
      ]),
      Message.aggregate([
        { $match: { sender: userId, status: "request_pending" } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: "$receiver",
            lastMessage: { $first: "$content" },
            lastMessageAt: { $first: "$createdAt" },
            totalMessages: { $sum: 1 },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: "$user" },
        {
          $project: {
            userId: "$_id",
            name: "$user.fullName",
            avatar: { $ifNull: ["$user.avatar", ""] },
            email: "$user.email",
            lastMessage: 1,
            lastMessageAt: 1,
            totalMessages: 1,
          },
        },
        { $sort: { lastMessageAt: -1 } },
      ]),
    ]);

    res.json({ incoming, outgoing });
  } catch (error) {
    console.error("Message requests list error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/messages/requests/:userId/accept — accept pending requests from user
router.post("/requests/:userId/accept", async (req, res) => {
  try {
    const receiverId = req.user.userId;
    const senderId = String(req.params.userId || "").trim();

    if (!isValidObjectId(senderId)) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    if (await hasBlockRelation(receiverId, senderId)) {
      return res.status(403).json({ error: "Cannot accept request due to block settings" });
    }

    const updateResult = await Message.updateMany(
      { sender: senderId, receiver: receiverId, status: "request_pending" },
      { $set: { status: "request_accepted" } },
    );

    if (!updateResult.modifiedCount) {
      return res.status(404).json({ error: "No pending request found" });
    }

    await notifyUser(req.app, {
      userId: senderId,
      type: "message_request_accepted",
      title: "Message request accepted",
      message: "Your message request was accepted.",
      link: "/messages",
      payload: { userId: receiverId },
    });

    res.json({
      success: true,
      acceptedFrom: senderId,
      acceptedCount: updateResult.modifiedCount,
    });
  } catch (error) {
    console.error("Accept message request error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/messages/requests/:userId/decline — decline pending requests from user
router.post("/requests/:userId/decline", async (req, res) => {
  try {
    const receiverId = req.user.userId;
    const senderId = String(req.params.userId || "").trim();

    if (!isValidObjectId(senderId)) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    const updateResult = await Message.updateMany(
      { sender: senderId, receiver: receiverId, status: "request_pending" },
      { $set: { status: "request_declined" } },
    );

    if (!updateResult.modifiedCount) {
      return res.status(404).json({ error: "No pending request found" });
    }

    await notifyUser(req.app, {
      userId: senderId,
      type: "message_request_declined",
      title: "Message request declined",
      message: "Your message request was declined.",
      link: "/messages",
      payload: { userId: receiverId },
    });

    res.json({
      success: true,
      declinedFrom: senderId,
      declinedCount: updateResult.modifiedCount,
    });
  } catch (error) {
    console.error("Decline message request error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/messages/:friendId — get visible message history
router.get("/:friendId", async (req, res) => {
  try {
    const userId = req.user.userId;
    const { friendId } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const before = req.query.before;

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

    if (await hasBlockRelation(senderId, receiverId)) {
      return res.status(403).json({ error: "Messaging is blocked between users" });
    }

    const directAllowed = await canSendDirectMessage(senderId, receiverId);
    const status = directAllowed ? "delivered" : "request_pending";

    const hadUnreadDirectBefore =
      directAllowed &&
      (await Message.findOne({
        sender: senderId,
        receiver: receiverId,
        read: false,
        ...visibleStatusQuery(),
      })
        .select("_id")
        .lean());

    const hadPendingBefore =
      !directAllowed &&
      (await Message.findOne({
        sender: senderId,
        receiver: receiverId,
        status: "request_pending",
      })
        .select("_id")
        .lean());

    const message = await Message.create({
      sender: senderId,
      receiver: receiverId,
      content,
      status,
    });

    if (status === "request_pending" && !hadPendingBefore) {
      await notifyUser(req.app, {
        userId: receiverId,
        type: "message_request",
        title: "New message request",
        message: "You received a message request.",
        link: "/messages",
        payload: { fromUserId: senderId },
      });
    }

    if (status === "delivered" && !hadUnreadDirectBefore) {
      await notifyUser(req.app, {
        userId: receiverId,
        type: "new_message",
        title: "New message",
        message: "You received a new message.",
        link: "/messages",
        payload: { fromUserId: senderId, messageId: toId(message._id) },
      });
    }

    res.json({
      message: {
        _id: message._id,
        sender: message.sender,
        receiver: message.receiver,
        content: message.content,
        read: message.read,
        status: message.status || "delivered",
        createdAt: message.createdAt,
      },
      mode: status === "request_pending" ? "request_pending" : "direct",
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
