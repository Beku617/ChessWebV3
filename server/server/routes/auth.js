import { Router } from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { OAuth2Client } from "google-auth-library";
import rateLimit from "express-rate-limit";
import { body, param, validationResult } from "express-validator";
import { User, Friend, FriendRequest } from "../models/index.js";
import { authMiddleware, optionalAuthMiddleware } from "../middleware/index.js";
import {
  buildAuthCookieOptions,
  clearAuthCookie,
  resolveAuthMaxAge,
} from "../utils/cookies.js";
import { canViewerAccessUser } from "../utils/visibility.js";

const router = Router();

const VALID_PRESENCE = new Set([
  "online",
  "offline",
  "searching_match",
  "in_game",
  "away",
]);
const googleClientCache = new Map();

function getGoogleAuthConfig() {
  const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
  if (!googleClientId) {
    return { googleClientId: "", googleOAuthClient: null };
  }

  if (!googleClientCache.has(googleClientId)) {
    googleClientCache.set(googleClientId, new OAuth2Client(googleClientId));
  }

  return {
    googleClientId,
    googleOAuthClient: googleClientCache.get(googleClientId),
  };
}

function getFacebookAuthConfig() {
  const facebookAppId = process.env.FACEBOOK_APP_ID || "";
  return { facebookAppId };
}

function normalizePresenceStatus(value) {
  const status = String(value || "offline")
    .trim()
    .toLowerCase();
  return VALID_PRESENCE.has(status) ? status : "offline";
}

async function fetchGoogleProfileFromAccessToken(token, googleClientId) {
  const tokenInfoUrl = new URL("https://oauth2.googleapis.com/tokeninfo");
  tokenInfoUrl.searchParams.set("access_token", token);

  const tokenInfoResponse = await fetch(tokenInfoUrl.toString());
  const tokenInfoPayload = await tokenInfoResponse.json().catch(() => ({}));

  if (!tokenInfoResponse.ok || tokenInfoPayload?.error) {
    const error = new Error("Invalid Google access token");
    error.code = "GOOGLE_TOKEN_INVALID";
    throw error;
  }

  const audience = String(
    tokenInfoPayload?.aud || tokenInfoPayload?.azp || "",
  ).trim();
  if (googleClientId && audience && audience !== googleClientId) {
    const error = new Error("Google token audience mismatch");
    error.code = "GOOGLE_TOKEN_AUDIENCE_MISMATCH";
    throw error;
  }

  const userInfoResponse = await fetch(
    "https://www.googleapis.com/oauth2/v3/userinfo",
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  const userInfoPayload = await userInfoResponse.json().catch(() => ({}));
  if (!userInfoResponse.ok) {
    const error = new Error("Unable to fetch Google profile");
    error.code = "GOOGLE_PROFILE_FETCH_FAILED";
    throw error;
  }

  return userInfoPayload;
}

async function fetchFacebookProfile(token) {
  const profileUrl = new URL("https://graph.facebook.com/me");
  profileUrl.searchParams.set("fields", "id,name,email,picture.type(large)");
  profileUrl.searchParams.set("access_token", token);

  const response = await fetch(profileUrl.toString());
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.error) {
    const message =
      payload?.error?.message ||
      payload?.error?.error_user_msg ||
      "Invalid Facebook token";
    const error = new Error(message);
    error.code = "FACEBOOK_TOKEN_INVALID";
    throw error;
  }

  return payload;
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
    chess960BulletRating: user.chess960BulletRating ?? baseRating,
    chess960BlitzRating: user.chess960BlitzRating ?? baseRating,
    chess960RapidRating: user.chess960RapidRating ?? baseRating,
    chess960ClassicalRating: user.chess960ClassicalRating ?? baseRating,
    bulletRd: user.bulletRd ?? 350,
    blitzRd: user.blitzRd ?? 350,
    rapidRd: user.rapidRd ?? 350,
    classicalRd: user.classicalRd ?? 350,
    chess960BulletRd: user.chess960BulletRd ?? 350,
    chess960BlitzRd: user.chess960BlitzRd ?? 350,
    chess960RapidRd: user.chess960RapidRd ?? 350,
    chess960ClassicalRd: user.chess960ClassicalRd ?? 350,
    bulletVolatility: user.bulletVolatility ?? 0.06,
    blitzVolatility: user.blitzVolatility ?? 0.06,
    rapidVolatility: user.rapidVolatility ?? 0.06,
    classicalVolatility: user.classicalVolatility ?? 0.06,
    chess960BulletVolatility: user.chess960BulletVolatility ?? 0.06,
    chess960BlitzVolatility: user.chess960BlitzVolatility ?? 0.06,
    chess960RapidVolatility: user.chess960RapidVolatility ?? 0.06,
    chess960ClassicalVolatility: user.chess960ClassicalVolatility ?? 0.06,
    bulletGames: user.bulletGames ?? 0,
    blitzGames: user.blitzGames ?? 0,
    rapidGames: user.rapidGames ?? 0,
    classicalGames: user.classicalGames ?? 0,
    chess960BulletGames: user.chess960BulletGames ?? 0,
    chess960BlitzGames: user.chess960BlitzGames ?? 0,
    chess960RapidGames: user.chess960RapidGames ?? 0,
    chess960ClassicalGames: user.chess960ClassicalGames ?? 0,
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

const AUTH_RATE_LIMIT_MESSAGE = "Too many attempts, try again later";
const AUTH_RATE_LIMIT_RESPONSE = {
  error: AUTH_RATE_LIMIT_MESSAGE,
};

function makeAuthRateLimiter({ windowMs, max }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: AUTH_RATE_LIMIT_RESPONSE,
  });
}

const loginRateLimiter = makeAuthRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
});
const registerRateLimiter = makeAuthRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
});
const socialRateLimiter = makeAuthRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
});

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const firstError = errors.array({ onlyFirstError: true })[0];
    return res.status(400).json({ error: firstError?.msg || "Invalid input" });
  }
  return next();
};

const registerValidation = [
  body("fullName")
    .exists({ values: "falsy" })
    .withMessage("Full name is required")
    .bail()
    .isString()
    .withMessage("Full name must be a string")
    .bail()
    .trim()
    .isLength({ max: 80 })
    .withMessage("Full name cannot exceed 80 characters")
    .bail()
    .escape(),
  body("email")
    .exists({ values: "falsy" })
    .withMessage("Email is required")
    .bail()
    .isString()
    .withMessage("Email must be a string")
    .bail()
    .isEmail()
    .withMessage("Invalid email format")
    .bail()
    .normalizeEmail(),
  body("password")
    .exists({ values: "falsy" })
    .withMessage("Password is required")
    .bail()
    .isString()
    .withMessage("Password must be a string")
    .bail()
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),
  validateRequest,
];

const loginValidation = [
  body("email")
    .exists({ values: "falsy" })
    .withMessage("Email is required")
    .bail()
    .isString()
    .withMessage("Email must be a string")
    .bail()
    .isEmail()
    .withMessage("Invalid email format")
    .bail()
    .normalizeEmail(),
  body("password")
    .exists({ values: "falsy" })
    .withMessage("Password is required")
    .bail()
    .isString()
    .withMessage("Password must be a string")
    .bail()
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),
  body("rememberMe").optional().isBoolean().withMessage("rememberMe must be a boolean"),
  validateRequest,
];

const socialAuthValidation = [
  body("token")
    .exists({ values: "falsy" })
    .withMessage("OAuth token is required")
    .bail()
    .isString()
    .withMessage("OAuth token must be a string")
    .bail()
    .trim()
    .isLength({ min: 1 })
    .withMessage("OAuth token is required"),
  body("rememberMe").optional().isBoolean().withMessage("rememberMe must be a boolean"),
  validateRequest,
];

const profileValidation = [
  body("fullName")
    .optional()
    .isString()
    .withMessage("Full name must be a string")
    .bail()
    .trim()
    .isLength({ max: 80 })
    .withMessage("Full name cannot exceed 80 characters")
    .bail()
    .escape(),
  body("avatar")
    .optional()
    .isString()
    .withMessage("Avatar must be a string")
    .bail()
    .trim(),
  body("userId").optional().isString().withMessage("userId must be a string"),
  validateRequest,
];

const avatarValidation = [
  param("userId")
    .isString()
    .withMessage("Invalid userId")
    .bail()
    .trim()
    .isLength({ min: 1 })
    .withMessage("Invalid userId"),
  body("avatar")
    .exists({ values: "falsy" })
    .withMessage("Avatar is required")
    .bail()
    .isString()
    .withMessage("Avatar must be a string")
    .bail()
    .trim(),
  validateRequest,
];

// Public OAuth configuration (client-side SDK initialization)
router.get("/oauth/config", (_req, res) => {
  const { googleClientId } = getGoogleAuthConfig();
  const { facebookAppId } = getFacebookAuthConfig();

  res.json({
    googleClientId: googleClientId || "",
    facebookAppId: facebookAppId || "",
  });
});

// Register
router.post("/register", registerRateLimiter, registerValidation, async (req, res) => {
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
        maxAge: resolveAuthMaxAge(false),
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
router.post("/login", loginRateLimiter, loginValidation, async (req, res) => {
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

    if (!user.password || user.authProvider !== "local") {
      return res
        .status(401)
        .json({ error: "Use Google/Facebook to sign in" });
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

    const maxAge = resolveAuthMaxAge(Boolean(rememberMe));

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

// Google OAuth login/register
router.post(
  "/auth/google",
  socialRateLimiter,
  socialAuthValidation,
  async (req, res) => {
  try {
    const { token, rememberMe } = req.body || {};
    const { googleClientId, googleOAuthClient } = getGoogleAuthConfig();

    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "Google token is required" });
    }

    if (!googleOAuthClient || !googleClientId) {
      return res.status(500).json({ error: "Google OAuth is not configured" });
    }

    let payload = null;
    const isLikelyIdToken = token.split(".").length === 3;

    if (isLikelyIdToken) {
      const ticket = await googleOAuthClient.verifyIdToken({
        idToken: token,
        audience: googleClientId,
      });
      payload = ticket.getPayload();
    } else {
      payload = await fetchGoogleProfileFromAccessToken(token, googleClientId);
    }

    if (!payload?.email || !payload?.sub) {
      return res.status(400).json({ error: "Invalid Google account payload" });
    }

    if (
      payload.email_verified === false ||
      String(payload.email_verified).toLowerCase() === "false"
    ) {
      return res.status(400).json({ error: "Google email is not verified" });
    }

    const googleEmail = String(payload.email).trim();
    const normalizedEmail = googleEmail.toLowerCase();
    const googleId = String(payload.sub);
    let user = await User.findOne({
      $or: [{ googleId }, { email: googleEmail }, { email: normalizedEmail }],
    });

    if (user?.googleId && user.googleId !== googleId) {
      return res.status(409).json({
        error: "This email is already linked to a different Google account",
      });
    }

    if (!user) {
      const generatedPassword = await bcrypt.hash(
        randomBytes(32).toString("hex"),
        10,
      );

      user = await User.create({
        fullName:
          String(payload.name || "").trim() ||
          normalizedEmail.split("@")[0] ||
          "Player",
        email: googleEmail,
        password: generatedPassword,
        avatar: String(payload.picture || ""),
        googleId,
        authProvider: "google",
      });
    } else {
      if (user.banned) {
        return res.status(403).json({
          error: "Your account has been banned",
          banned: true,
          banReason: user.banReason || "No reason provided",
        });
      }

      let needsSave = false;
      if (!user.googleId) {
        user.googleId = googleId;
        needsSave = true;
      }
      if (user.authProvider !== "google") {
        user.authProvider = "google";
        needsSave = true;
      }
      if ((!user.avatar || !String(user.avatar).trim()) && payload.picture) {
        user.avatar = String(payload.picture);
        needsSave = true;
      }
      if ((!user.fullName || !String(user.fullName).trim()) && payload.name) {
        user.fullName = String(payload.name);
        needsSave = true;
      }
      if (needsSave) {
        await user.save();
      }
    }

    const tokenData = {
      userId: user._id,
      email: user.email,
      fullName: user.fullName,
    };
    const maxAge = resolveAuthMaxAge(Boolean(rememberMe));

    res.cookie(
      "authToken",
      JSON.stringify(tokenData),
      buildAuthCookieOptions({ maxAge }),
    );

    res.json({
      success: true,
      message: "Google login successful",
      user: toPublicUser(user),
    });
  } catch (err) {
    console.error("Google auth error:", err);
    if (
      err?.code === "GOOGLE_TOKEN_INVALID" ||
      err?.code === "GOOGLE_TOKEN_AUDIENCE_MISMATCH" ||
      err?.code === "GOOGLE_PROFILE_FETCH_FAILED"
    ) {
      return res.status(401).json({ error: "Invalid Google token" });
    }
    res.status(401).json({ error: "Invalid Google token" });
  }
});

// Facebook OAuth login/register
router.post(
  "/auth/facebook",
  socialRateLimiter,
  socialAuthValidation,
  async (req, res) => {
  try {
    const { token, rememberMe } = req.body || {};
    const { facebookAppId } = getFacebookAuthConfig();

    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "Facebook token is required" });
    }

    if (!facebookAppId) {
      return res
        .status(500)
        .json({ error: "Facebook OAuth is not configured" });
    }

    const profile = await fetchFacebookProfile(token);
    const facebookId = String(profile?.id || "").trim();
    if (!facebookId) {
      return res.status(400).json({ error: "Invalid Facebook account payload" });
    }

    const facebookEmail = String(profile?.email || "").trim();
    const normalizedEmail = facebookEmail.toLowerCase();
    const resolvedEmail = facebookEmail || `facebook_${facebookId}@facebook.local`;
    const avatarUrl = String(profile?.picture?.data?.url || "");
    const fullName =
      String(profile?.name || "").trim() ||
      normalizedEmail.split("@")[0] ||
      `facebook_${facebookId.slice(0, 6)}`;

    const userLookup = [{ facebookId }];
    if (facebookEmail) {
      userLookup.push({ email: facebookEmail }, { email: normalizedEmail });
    }

    let user = await User.findOne({ $or: userLookup });

    if (user?.facebookId && user.facebookId !== facebookId) {
      return res.status(409).json({
        error: "This email is already linked to a different Facebook account",
      });
    }

    if (!user) {
      const generatedPassword = await bcrypt.hash(
        randomBytes(32).toString("hex"),
        10,
      );

      user = await User.create({
        fullName,
        email: resolvedEmail,
        password: generatedPassword,
        avatar: avatarUrl,
        facebookId,
        authProvider: "facebook",
      });
    } else {
      if (user.banned) {
        return res.status(403).json({
          error: "Your account has been banned",
          banned: true,
          banReason: user.banReason || "No reason provided",
        });
      }

      let needsSave = false;
      if (!user.facebookId) {
        user.facebookId = facebookId;
        needsSave = true;
      }
      if (user.authProvider !== "facebook") {
        user.authProvider = "facebook";
        needsSave = true;
      }
      if (facebookEmail && String(user.email || "").toLowerCase() !== normalizedEmail) {
        user.email = facebookEmail;
        needsSave = true;
      }
      if ((!user.avatar || !String(user.avatar).trim()) && avatarUrl) {
        user.avatar = avatarUrl;
        needsSave = true;
      }
      if ((!user.fullName || !String(user.fullName).trim()) && fullName) {
        user.fullName = fullName;
        needsSave = true;
      }
      if (needsSave) {
        await user.save();
      }
    }

    const tokenData = {
      userId: user._id,
      email: user.email,
      fullName: user.fullName,
    };
    const maxAge = resolveAuthMaxAge(Boolean(rememberMe));

    res.cookie(
      "authToken",
      JSON.stringify(tokenData),
      buildAuthCookieOptions({ maxAge }),
    );

    res.json({
      success: true,
      message: "Facebook login successful",
      user: toPublicUser(user),
    });
  } catch (err) {
    console.error("Facebook auth error:", err);
    if (err?.code === "FACEBOOK_TOKEN_INVALID") {
      return res.status(401).json({ error: "Invalid Facebook token" });
    }
    res.status(500).json({ error: "Facebook authentication failed" });
  }
});

// Logout
router.post("/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ success: true, message: "Logged out successfully" });
});

// Get current user/session
router.get("/me", optionalAuthMiddleware, async (req, res) => {
  try {
    if (!req.user?.userId) {
      return res.json({ user: null });
    }

    const user = await User.findById(req.user.userId).select("-password");
    if (!user) {
      return res.json({ user: null });
    }

    if (user.banned) {
      clearAuthCookie(res);
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

// Get profile of any user by ID (authenticated)
router.get("/users/:userId", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(userId || ""))) {
      return res.status(404).json({ error: "User not found" });
    }
    const viewerId = req.user?.userId || null;
    const user = await User.findById(userId).select("-password");
    if (!user || user.banned) {
      return res.status(404).json({ error: "User not found" });
    }

    const canAccess = await canViewerAccessUser(viewerId, user._id);
    if (!canAccess) {
      return res.status(404).json({ error: "User not found" });
    }

    // Determine relationship
    let relationship = "none";
    let relationshipRequestId = null;
    const viewerIdStr = viewerId ? String(viewerId) : "";
    if (viewerId && String(user._id) === viewerIdStr) {
      relationship = "self";
    } else if (viewerId) {
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
router.put("/profile", authMiddleware, profileValidation, async (req, res) => {
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
router.put(
  "/users/:userId/avatar",
  authMiddleware,
  avatarValidation,
  async (req, res) => {
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
