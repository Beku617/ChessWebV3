import { Router } from "express";
import mongoose from "mongoose";
import { authMiddleware, checkBlocked } from "../middleware/index.js";
import {
  ActiveGameSession,
  BlockedUser,
  Friend,
  FriendRequest,
  User,
} from "../models/index.js";
import {
  areFriends,
  ensureFriendship,
  removeFriendship,
  normalizeId,
  fetchUserSummary,
} from "../utils/friendship.js";
import { notifyUser } from "../services/notify.js";

const router = Router();
const REQUEST_USER_FIELDS =
  "fullName email avatar rating presenceStatus lastActiveAt lastSeenAt";
const WATCHABLE_SESSION_STATUSES = ["active", "temporarily_disconnected"];
const WATCHABLE_SESSION_MODES = ["quick", "friend", "tournament", "fourPlayer"];

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

function userRoom(userId) {
  return `user:${normalizeId(userId)}`;
}

function resolveUser(doc) {
  if (!doc) {
    return {
      id: "",
      name: "Player",
      email: "",
      avatar: "",
      rating: 1200,
      presenceStatus: "offline",
      lastActiveAt: null,
      lastSeenAt: null,
    };
  }
  const id = normalizeId(doc._id || doc.id || doc);
  return {
    id,
    name: doc.fullName || doc.name || "Player",
    email: doc.email || "",
    avatar: doc.avatar || "",
    rating: typeof doc.rating === "number" ? doc.rating : 1200,
    presenceStatus: doc.presenceStatus || "offline",
    lastActiveAt: doc.lastActiveAt || doc.lastSeenAt || null,
    lastSeenAt: doc.lastSeenAt || null,
  };
}

function normalizeWatchMode(mode) {
  if (mode === "friend" || mode === "tournament" || mode === "fourPlayer") {
    return mode;
  }
  return "quick";
}

function normalizeWatchKind(kind) {
  return kind === "fourPlayer" ? "fourPlayer" : "classic";
}

async function buildWatchableSessionMap(userIds) {
  const normalizedUserIds = Array.from(
    new Set(
      (Array.isArray(userIds) ? userIds : [])
        .map((id) => normalizeId(id))
        .filter(Boolean),
    ),
  );
  if (normalizedUserIds.length === 0) {
    return new Map();
  }

  const sessions = await ActiveGameSession.find({
    participantUserIds: { $in: normalizedUserIds },
    status: { $in: WATCHABLE_SESSION_STATUSES },
    mode: { $in: WATCHABLE_SESSION_MODES },
  })
    .select("gameId kind mode status variant participantUserIds updatedAt")
    .sort({ updatedAt: -1 })
    .lean();

  const targetUsers = new Set(normalizedUserIds);
  const byUserId = new Map();

  for (const session of sessions) {
    const participants = Array.from(
      new Set(
        (Array.isArray(session?.participantUserIds) ? session.participantUserIds : [])
          .map((id) => normalizeId(id))
          .filter(Boolean),
      ),
    );
    if (participants.length < 2) {
      continue;
    }

    const sessionInfo = {
      gameId: String(session?.gameId || "").trim(),
      kind: normalizeWatchKind(session?.kind),
      mode: normalizeWatchMode(session?.mode),
      variant: String(session?.variant || "standard"),
      status:
        String(session?.status || "") === "temporarily_disconnected"
          ? "temporarily_disconnected"
          : "active",
      participantCount: participants.length,
    };

    if (!sessionInfo.gameId) {
      continue;
    }

    for (const participantId of participants) {
      if (!targetUsers.has(participantId) || byUserId.has(participantId)) {
        continue;
      }
      byUserId.set(participantId, sessionInfo);
    }
  }

  return byUserId;
}

function buildRequestDTO(requestDoc, viewerId) {
  const sender = resolveUser(requestDoc.senderId);
  const receiver = resolveUser(requestDoc.receiverId);
  const viewerIsReceiver = normalizeId(requestDoc.receiverId?._id || requestDoc.receiverId) === normalizeId(viewerId);
  const otherUser = viewerIsReceiver ? sender : receiver;

  return {
    id: normalizeId(requestDoc._id),
    status: requestDoc.status,
    direction: viewerIsReceiver ? "incoming" : "outgoing",
    createdAt: requestDoc.createdAt,
    updatedAt: requestDoc.updatedAt,
    respondedAt: requestDoc.respondedAt || null,
    user: otherUser,
  };
}

function buildFriendDTO(friendDoc, watchableSessionMap = null) {
  const friend = resolveUser(friendDoc.friendId || friendDoc);
  const friendId = normalizeId(friend.id);
  const watchableGame = friendId ? watchableSessionMap?.get(friendId) || null : null;
  return {
    id: friend.id,
    name: friend.name,
    email: friend.email,
    avatar: friend.avatar,
    rating: friend.rating,
    presenceStatus: friend.presenceStatus,
    lastActiveAt: friend.lastActiveAt,
    isWatchableInGame: !!watchableGame,
    watchableGame,
    since: friendDoc.createdAt || new Date(),
  };
}

function emitToUser(io, userId, eventName, payload) {
  if (!io) return;
  const room = userRoom(userId);
  io.to(room).emit(eventName, payload);
}

async function buildBlockedExclusionSet(userId) {
  const normalizedUserId = normalizeId(userId);
  const [selfDoc, legacyEdges] = await Promise.all([
    User.findById(normalizedUserId)
      .select("blockedUsers")
      .lean(),
    BlockedUser.find({
      blocker: normalizedUserId,
    })
      .select("blocker blocked")
      .lean(),
  ]);

  const excluded = new Set([normalizedUserId]);
  for (const blockedId of selfDoc?.blockedUsers || []) {
    const normalized = normalizeId(blockedId);
    if (normalized) excluded.add(normalized);
  }
  for (const edge of legacyEdges) {
    const blockedId = normalizeId(edge?.blocked);
    if (blockedId) {
      excluded.add(blockedId);
    }
  }

  return excluded;
}

async function getFriendshipPayload(userId, friendId) {
  const doc = await Friend.findOne({ userId, friendId })
    .populate("friendId", REQUEST_USER_FIELDS)
    .lean();
  if (!doc) {
    const fallbackUser = await fetchUserSummary(friendId);
    return {
      ...(fallbackUser || {
        id: normalizeId(friendId),
        name: "Player",
        avatar: "",
        rating: 1200,
        presenceStatus: "offline",
        lastActiveAt: null,
        isWatchableInGame: false,
        watchableGame: null,
      }),
      since: new Date(),
    };
  }
  return {
    ...buildFriendDTO(doc),
    since: doc.createdAt || new Date(),
  };
}

async function ensureFriendshipAndNotify(app, userA, userB) {
  await ensureFriendship(userA, userB);
  const io = app.get("io");
  const aPayload = await getFriendshipPayload(userA, userB);
  const bPayload = await getFriendshipPayload(userB, userA);
  emitToUser(io, userA, "friendship_created", aPayload);
  emitToUser(io, userB, "friendship_created", bPayload);
  return { aPayload, bPayload };
}

async function loadRequestsForUser(userId) {
  const requests = await FriendRequest.find({
    status: "pending",
    $or: [{ senderId: userId }, { receiverId: userId }],
  })
    .sort({ createdAt: -1 })
    .populate("senderId", REQUEST_USER_FIELDS)
    .populate("receiverId", REQUEST_USER_FIELDS)
    .lean();

  const incoming = [];
  const outgoing = [];

  for (const req of requests) {
    const dto = buildRequestDTO(req, userId);
    if (dto.direction === "incoming") incoming.push(dto);
    else outgoing.push(dto);
  }

  return { incoming, outgoing };
}

// List friends for current user
router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = normalizeId(req.user.userId);
    const excludedIds = await buildBlockedExclusionSet(userId);
    const friends = await Friend.find({ userId })
      .sort({ createdAt: -1 })
      .populate("friendId", REQUEST_USER_FIELDS)
      .lean();
    const friendIds = friends
      .map((edge) => normalizeId(edge?.friendId?._id || edge?.friendId))
      .filter(Boolean);
    const watchableSessionMap = await buildWatchableSessionMap(friendIds);

    const result = friends
      .map((f) => buildFriendDTO(f, watchableSessionMap))
      .filter((friend) => !excludedIds.has(normalizeId(friend.id)));
    res.json({ friends: result });
  } catch (err) {
    console.error("Friends list error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get incoming/outgoing/history requests
router.get("/requests", authMiddleware, async (req, res) => {
  try {
    const userId = normalizeId(req.user.userId);
    const data = await loadRequestsForUser(userId);
    res.json(data);
  } catch (err) {
    console.error("Friend requests list error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Send friend request (also keeps backward compatibility with POST /api/friends)
const sendRequestHandler = async (req, res) => {
  try {
    const senderId = normalizeId(req.user.userId);
    const receiverId = normalizeId(
      req.body?.receiverId || req.body?.friendId || req.body?.userId,
    );

    if (!receiverId) {
      return res.status(400).json({ error: "receiverId is required" });
    }
    if (!mongoose.Types.ObjectId.isValid(receiverId)) {
      return res.status(400).json({ error: "Invalid receiver id" });
    }
    if (senderId === receiverId) {
      return res.status(400).json({ error: "Cannot add yourself" });
    }

    const receiver = await User.findById(receiverId)
      .select("_id " + REQUEST_USER_FIELDS)
      .lean();
    if (!receiver) {
      return res.status(404).json({ error: "User not found" });
    }

    if (await areFriends(senderId, receiverId)) {
      return res
        .status(409)
        .json({ error: "Already friends", code: "already_friends" });
    }

    // Check reverse pending - auto accept
    const reversePending = await FriendRequest.findOne({
      senderId: receiverId,
      receiverId: senderId,
      status: "pending",
    });

    if (reversePending) {
      reversePending.status = "accepted";
      reversePending.respondedAt = new Date();
      await reversePending.save();
      await reversePending.populate("senderId", REQUEST_USER_FIELDS);
      await reversePending.populate("receiverId", REQUEST_USER_FIELDS);
      const finalDoc = reversePending;
      await ensureFriendshipAndNotify(req.app, senderId, receiverId);

      const senderView = buildRequestDTO(finalDoc, senderId);
      const receiverView = buildRequestDTO(finalDoc, receiverId);
      emitToUser(req.app.get("io"), senderId, "friend_request_updated", senderView);
      emitToUser(req.app.get("io"), receiverId, "friend_request_updated", receiverView);

      return res.json({
        success: true,
        status: "accepted",
        request: senderView,
      });
    }

    // Existing pending same direction
    const existing = await FriendRequest.findOne({
      senderId,
      receiverId,
      status: "pending",
    })
      .populate("senderId", REQUEST_USER_FIELDS)
      .populate("receiverId", REQUEST_USER_FIELDS);

    if (existing) {
      return res.json({
        success: true,
        status: "pending",
        request: buildRequestDTO(existing, senderId),
      });
    }

    let request;
    try {
      request = await FriendRequest.create({ senderId, receiverId });
    } catch (error) {
      if (error?.code === 11000) {
        const dup = await FriendRequest.findOne({
          senderId,
          receiverId,
          status: "pending",
        })
          .populate("senderId", REQUEST_USER_FIELDS)
          .populate("receiverId", REQUEST_USER_FIELDS);
        return res.json({
          success: true,
          status: dup ? dup.status : "pending",
          request: dup ? buildRequestDTO(dup, senderId) : null,
        });
      }
      throw error;
    }

    await request.populate("senderId", REQUEST_USER_FIELDS);
    await request.populate("receiverId", REQUEST_USER_FIELDS);
    const finalDoc = request;

    const senderView = buildRequestDTO(finalDoc, senderId);
    const receiverView = buildRequestDTO(finalDoc, receiverId);

    const io = req.app.get("io");
    emitToUser(io, senderId, "friend_request_sent", senderView);
    emitToUser(io, receiverId, "friend_request_received", receiverView);

    await notifyUser(req.app, {
      userId: receiverId,
      type: "friend_request",
      title: "New friend request",
      message: `${senderView.user.name} sent you a friend request.`,
      link: "/friends",
      payload: { fromUserId: senderId, requestId: senderView.id },
    });

    res.status(201).json({ success: true, status: "pending", request: senderView });
  } catch (err) {
    console.error("Add friend error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

const friendRequestBlockGuard = checkBlocked({
  bodyKeys: ["receiverId", "friendId", "userId"],
  message: "You cannot send a friend request to this player.",
});

router.post("/", authMiddleware, friendRequestBlockGuard, sendRequestHandler);
router.post("/requests", authMiddleware, friendRequestBlockGuard, sendRequestHandler);

// Accept friend request
router.post("/requests/:requestId/accept", authMiddleware, async (req, res) => {
  try {
    const userId = normalizeId(req.user.userId);
    const { requestId } = req.params;
    if (!isValidObjectId(requestId)) {
      return res.status(400).json({ error: "Invalid request id" });
    }
    const request = await FriendRequest.findOneAndUpdate(
      { _id: requestId, receiverId: userId, status: "pending" },
      { $set: { status: "accepted", respondedAt: new Date() } },
      { new: true },
    )
      .populate("senderId", REQUEST_USER_FIELDS)
      .populate("receiverId", REQUEST_USER_FIELDS);

    if (!request) {
      return res.status(409).json({ error: "Request not found or already processed" });
    }

    // Create friendship; tolerate duplicate-key races gracefully
    try {
      await ensureFriendshipAndNotify(
        req.app,
        normalizeId(request.senderId?._id || request.senderId),
        normalizeId(request.receiverId?._id || request.receiverId),
      );
    } catch (err) {
      if (err?.code !== 11000) {
        throw err;
      }
    }

    const io = req.app.get("io");
    const receiverView = buildRequestDTO(request, userId);
    const senderId = normalizeId(request.senderId?._id || request.senderId);
    const senderView = buildRequestDTO(request, senderId);

    emitToUser(io, userId, "friend_request_updated", receiverView);
    emitToUser(io, senderId, "friend_request_updated", senderView);

    await notifyUser(req.app, {
      userId: senderId,
      type: "friend_request_accepted",
      title: "Friend request accepted",
      message: `${receiverView.user.name} accepted your friend request.`,
      link: "/friends",
      payload: { userId },
    });

    const friendship = await getFriendshipPayload(userId, senderId);

    res.json({
      success: true,
      status: "accepted",
      request: receiverView,
      friendship,
    });
  } catch (err) {
    console.error("Accept friend request error:", err);
    res.status(500).json({ error: "Server error", detail: err?.message });
  }
});

// Deny friend request
router.post("/requests/:requestId/deny", authMiddleware, async (req, res) => {
  try {
    const userId = normalizeId(req.user.userId);
    const { requestId } = req.params;
    if (!isValidObjectId(requestId)) {
      return res.status(400).json({ error: "Invalid request id" });
    }
    const request = await FriendRequest.findOneAndUpdate(
      { _id: requestId, receiverId: userId, status: "pending" },
      { $set: { status: "denied", respondedAt: new Date() } },
      { new: true },
    )
      .populate("senderId", REQUEST_USER_FIELDS)
      .populate("receiverId", REQUEST_USER_FIELDS);

    if (!request) {
      return res.status(409).json({ error: "Request not found or already processed" });
    }

    const senderId = normalizeId(request.senderId?._id || request.senderId);
    const receiverView = buildRequestDTO(request, userId);
    const senderView = buildRequestDTO(request, senderId);
    const io = req.app.get("io");
    emitToUser(io, userId, "friend_request_updated", receiverView);
    emitToUser(io, senderId, "friend_request_updated", senderView);

    await notifyUser(req.app, {
      userId: senderId,
      type: "friend_request_denied",
      title: "Friend request denied",
      message: `${receiverView.user.name} denied your friend request.`,
      link: "/friends",
      payload: { userId },
    });

    res.json({ success: true, status: "denied", request: receiverView });
  } catch (err) {
    console.error("Deny friend request error:", err);
    res.status(500).json({ error: "Server error", detail: err?.message });
  }
});

// Ignore friend request
router.post("/requests/:requestId/ignore", authMiddleware, async (req, res) => {
  try {
    const userId = normalizeId(req.user.userId);
    const { requestId } = req.params;
    if (!isValidObjectId(requestId)) {
      return res.status(400).json({ error: "Invalid request id" });
    }
    const request = await FriendRequest.findOneAndUpdate(
      { _id: requestId, receiverId: userId, status: "pending" },
      { $set: { status: "ignored", respondedAt: new Date() } },
      { new: true },
    )
      .populate("senderId", REQUEST_USER_FIELDS)
      .populate("receiverId", REQUEST_USER_FIELDS);

    if (!request) {
      return res.status(409).json({ error: "Request not found or already processed" });
    }

    const senderId = normalizeId(request.senderId?._id || request.senderId);
    const receiverView = buildRequestDTO(request, userId);
    const senderView = buildRequestDTO(request, senderId);
    const io = req.app.get("io");
    emitToUser(io, userId, "friend_request_updated", receiverView);
    emitToUser(io, senderId, "friend_request_updated", senderView);

    res.json({ success: true, status: "ignored", request: receiverView });
  } catch (err) {
    console.error("Ignore friend request error:", err);
    res.status(500).json({ error: "Server error", detail: err?.message });
  }
});

// Cancel outgoing friend request
router.post("/requests/:requestId/cancel", authMiddleware, async (req, res) => {
  try {
    const userId = normalizeId(req.user.userId);
    const { requestId } = req.params;
    if (!isValidObjectId(requestId)) {
      return res.status(400).json({ error: "Invalid request id" });
    }
    const request = await FriendRequest.findById(requestId)
      .populate("senderId", REQUEST_USER_FIELDS)
      .populate("receiverId", REQUEST_USER_FIELDS);

    if (!request) {
      return res.status(404).json({ error: "Request not found" });
    }
    if (normalizeId(request.senderId?._id || request.senderId) !== userId) {
      return res.status(403).json({ error: "Not authorized for this request" });
    }
    if (request.status !== "pending") {
      return res.status(409).json({ error: "Request already processed" });
    }

    request.status = "canceled";
    request.canceledBy = userId;
    request.respondedAt = new Date();
    await request.save();

    const receiverId = normalizeId(request.receiverId?._id || request.receiverId);
    const senderView = buildRequestDTO(request, userId);
    const receiverView = buildRequestDTO(request, receiverId);
    const io = req.app.get("io");
    emitToUser(io, userId, "friend_request_updated", senderView);
    emitToUser(io, receiverId, "friend_request_updated", receiverView);

    res.json({ success: true, status: "canceled", request: senderView });
  } catch (err) {
    console.error("Cancel friend request error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Search users to add
router.get("/search", authMiddleware, async (req, res) => {
  try {
    const userId = normalizeId(req.user.userId);
    const query = (req.query.q || "").toString().trim();
    if (!query) return res.json({ results: [] });
    const excludedIds = await buildBlockedExclusionSet(userId);

    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const users = await User.find({
      _id: { $nin: Array.from(excludedIds) },
      $or: [{ fullName: regex }, { email: regex }],
    })
      .select("_id fullName email avatar rating")
      .limit(12)
      .lean();

    const targetIds = users.map((u) => u._id);

    const [friendEdges, pendingRequests] = await Promise.all([
      Friend.find({ userId, friendId: { $in: targetIds } })
        .select("friendId")
        .lean(),
      FriendRequest.find({
        status: "pending",
        $or: [
          { senderId: userId, receiverId: { $in: targetIds } },
          { senderId: { $in: targetIds }, receiverId: userId },
        ],
      })
        .select("senderId receiverId status")
        .lean(),
    ]);

    const friendsSet = new Set(friendEdges.map((f) => normalizeId(f.friendId)));
    const pendingMap = new Map();
    pendingRequests.forEach((r) => {
      const target =
        normalizeId(r.senderId) === userId
          ? normalizeId(r.receiverId)
          : normalizeId(r.senderId);
      const direction =
        normalizeId(r.senderId) === userId ? "outgoing_pending" : "incoming_pending";
      pendingMap.set(target, { direction, requestId: normalizeId(r._id) });
    });

    const results = users.map((u) => {
      const normalizedId = normalizeId(u._id);
      let relation = "none";
      let requestId = null;
      if (friendsSet.has(normalizedId)) {
        relation = "friends";
      } else if (pendingMap.has(normalizedId)) {
        relation = pendingMap.get(normalizedId).direction;
        requestId = pendingMap.get(normalizedId).requestId;
      }

      return {
        id: normalizedId,
        name: u.fullName,
        email: u.email,
        avatar: u.avatar || "",
        rating: typeof u.rating === "number" ? u.rating : 1200,
        relation,
        requestId,
      };
    });

    res.json({ results });
  } catch (err) {
    console.error("Friend search error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Remove friend (mutual)
router.delete("/:friendId", authMiddleware, async (req, res) => {
  try {
    const userId = normalizeId(req.user.userId);
    const { friendId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(friendId)) {
      return res.status(400).json({ error: "Invalid friend id" });
    }
    await removeFriendship(userId, friendId);

    const io = req.app.get("io");
    emitToUser(io, userId, "friendship_removed", { friendId: normalizeId(friendId) });
    emitToUser(io, friendId, "friendship_removed", { friendId: userId });

    res.json({ success: true });
  } catch (err) {
    console.error("Remove friend error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
