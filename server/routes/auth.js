import { Router } from "express";
import bcrypt from "bcryptjs";
import { User, Friend, FriendRequest } from "../models/index.js";
import { authMiddleware } from "../middleware/index.js";

const router = Router();

const VALID_PRESENCE = new Set([
  "online",
  "offline",
  "searching_match",
  "in_game",
  "away",
]);
const IS_PRODUCTION = process.env.NODE_ENV === "production";

function buildAuthCookieOptions(overrides = {}) {
  return {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? "none" : "lax",
    path: "/",
    ...overrides,
  };
}

function normalizePresenceStatus(value) {
  const status = String(value || "offline")
    .trim()
    .toLowerCase();
  return VALID_PRESENCE.has(status) ? status : "offline";
}

function toPublicUser(user) {
  if (!user) return null;
  const baseRating = user.rating ?? 1200;
  return {
    id: String(user._id),
    email: user.email,
    fullName: user.fullName,
    avatar: user.avatar || "",
    rating: baseRating,
    bulletRating: user.bulletRating ?? baseRating,
    blitzRating: user.blitzRating ?? baseRating,
    rapidRating: user.rapidRating ?? baseRating,
    classicalRating: user.classicalRating ?? baseRating,
    bulletRd: user.bulletRd ?? 350,
    blitzRd: user.blitzRd ?? 350,
    rapidRd: user.rapidRd ?? 350,
    classicalRd: user.classicalRd ?? 350,
    bulletVolatility: user.bulletVolatility ?? 0.06,
    blitzVolatility: user.blitzVolatility ?? 0.06,
    rapidVolatility: user.rapidVolatility ?? 0.06,
    classicalVolatility: user.classicalVolatility ?? 0.06,
    bulletGames: user.bulletGames ?? 0,
    blitzGames: user.blitzGames ?? 0,
    rapidGames: user.rapidGames ?? 0,
    classicalGames: user.classicalGames ?? 0,
    gamesPlayed: user.gamesPlayed ?? 0,
    gamesWon: user.gamesWon ?? 0,
    presenceStatus: normalizePresenceStatus(user.presenceStatus),
    lastSeenAt: user.lastSeenAt ?? null,
    lastActiveAt: user.lastActiveAt ?? null,
    puzzleElo: user.puzzleElo ?? 1200,
    puzzleBestElo: user.puzzleBestElo ?? user.puzzleElo ?? 1200,
    puzzleAttempts: user.puzzleAttempts ?? 0,
    puzzleSolved: user.puzzleSolved ?? 0,
    puzzleFailed: user.puzzleFailed ?? 0,
    puzzleSkipped: user.puzzleSkipped ?? 0,
    puzzleLastAttemptAt: user.puzzleLastAttemptAt ?? null,
  };
}

// Register
router.post("/register", async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ error: "Email already in use" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      fullName,
      email,
      password: hashedPassword,
    });

    const tokenData = {
      userId: user._id,
      email: user.email,
      fullName: user.fullName,
    };

    res.cookie(
      "authToken",
      JSON.stringify(tokenData),
      buildAuthCookieOptions({
        maxAge: 7 * 24 * 60 * 60 * 1000,
      }),
    );

    res.json({
      success: true,
      message: "User registered successfully",
      user: toPublicUser(user),
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (user.banned) {
      return res.status(403).json({
        error: "Your account has been banned",
        banned: true,
        banReason: user.banReason || "No reason provided",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const tokenData = {
      userId: user._id,
      email: user.email,
      fullName: user.fullName,
    };

    const maxAge = rememberMe
      ? 30 * 24 * 60 * 60 * 1000
      : 7 * 24 * 60 * 60 * 1000;

    res.cookie(
      "authToken",
      JSON.stringify(tokenData),
      buildAuthCookieOptions({ maxAge }),
    );

    res.json({
      success: true,
      message: "Login successful",
      user: toPublicUser(user),
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Logout
router.post("/logout", (req, res) => {
  res.cookie(
    "authToken",
    "",
    buildAuthCookieOptions({
      maxAge: 0,
    }),
  );
  res.json({ success: true, message: "Logged out successfully" });
});

// Get current user
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.banned) {
      res.clearCookie("authToken", buildAuthCookieOptions());
      return res.status(403).json({
        error: "Your account has been banned",
        banned: true,
        banReason: user.banReason || "No reason provided",
      });
    }

    res.json({ user: toPublicUser(user) });
  } catch (err) {
    console.error("Get user error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get public profile of any user by ID
router.get("/users/:userId", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const viewerId = req.user.userId;
    const user = await User.findById(userId).select("-password");
    if (!user || user.banned) {
      return res.status(404).json({ error: "User not found" });
    }

    // Determine relationship
    let relationship = "none";
    let relationshipRequestId = null;
    const viewerIdStr = String(viewerId);
    if (String(user._id) === viewerIdStr) {
      relationship = "self";
    } else {
      const isFriend = await Friend.findOne({
        userId: viewerId,
        friendId: user._id,
      }).lean();
      if (isFriend) {
        relationship = "friends";
      } else {
        const pending = await FriendRequest.findOne({
          status: "pending",
          $or: [
            { senderId: viewerId, receiverId: user._id },
            { senderId: user._id, receiverId: viewerId },
          ],
        })
          .select("_id senderId receiverId status")
          .lean();

        if (pending) {
          relationshipRequestId = String(pending._id);
          relationship =
            String(pending.senderId) === viewerIdStr
              ? "outgoing_pending"
              : "incoming_pending";
        }
      }
    }

    // Fetch game history count
    const { default: HistoryModel } = await import("../models/History.js");
    const totalGames = await HistoryModel.countDocuments({ userId: user._id });
    const totalWins = await HistoryModel.countDocuments({
      userId: user._id,
      $or: [
        { result: "1-0", playAs: "white" },
        { result: "0-1", playAs: "black" },
      ],
    });

    res.json({
      user: {
        ...toPublicUser(user),
        gamesPlayed: Math.max(user.gamesPlayed ?? 0, totalGames),
        gamesWon: Math.max(user.gamesWon ?? 0, totalWins),
      },
      relationship,
      relationshipRequestId,
    });
  } catch (err) {
    console.error("Public profile error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Update profile
router.put("/profile", authMiddleware, async (req, res) => {
  try {
    const { fullName, avatar, userId: targetUserId } = req.body || {};

    if (
      targetUserId &&
      String(targetUserId).trim() &&
      String(targetUserId) !== String(req.user.userId)
    ) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const update = {};
    if (typeof fullName === "string" && fullName.trim().length > 0) {
      update.fullName = fullName.trim().slice(0, 80);
    }
    if (typeof avatar === "string") {
      update.avatar = avatar;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: "No valid profile fields provided" });
    }

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: update },
      { new: true },
    ).select("-password");
    res.json({ success: true, user: toPublicUser(user) });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Explicit avatar update endpoint with ownership check
router.put("/users/:userId/avatar", authMiddleware, async (req, res) => {
  try {
    const targetUserId = String(req.params.userId || "");
    const requesterId = String(req.user.userId || "");
    if (!targetUserId || targetUserId !== requesterId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const avatar = req.body?.avatar;
    if (typeof avatar !== "string") {
      return res.status(400).json({ error: "Avatar is required" });
    }

    const user = await User.findByIdAndUpdate(
      requesterId,
      { $set: { avatar } },
      { new: true },
    ).select("-password");

    res.json({ success: true, user: toPublicUser(user) });
  } catch (err) {
    console.error("Update avatar error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
