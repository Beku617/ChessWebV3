import { Router } from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { OAuth2Client } from "google-auth-library";
import rateLimit from "express-rate-limit";
import { body, param, validationResult } from "express-validator";
import {
  ActiveGameSession,
  User,
  BlockedUser,
  Friend,
  FriendRequest,
  Tournament,
  TournamentPlayer,
  TournamentEloEvent,
} from "../models/index.js";
import { authMiddleware, optionalAuthMiddleware } from "../middleware/index.js";
import {
  buildAuthCookieOptions,
  clearAuthCookie,
  resolveAuthMaxAge,
} from "../utils/cookies.js";
import {
  canViewerAccessUser,
  getBlockStatusBetween,
  haveBlockedUsersListRelation,
} from "../utils/visibility.js";
import {
  createEmailVerificationCode,
  getEmailVerificationCodeTtlMs,
  getEmailVerificationResendCooldownMs,
  hashEmailVerificationCode,
  isEmailVerificationRequired,
  isVerificationEmailConfigured,
  sendEmailVerificationCode,
} from "../services/emailVerification.js";

const router = Router();

const VALID_PRESENCE = new Set([
  "online",
  "offline",
  "searching_match",
  "in_game",
  "away",
]);
const WATCHABLE_SESSION_STATUSES = ["active", "temporarily_disconnected"];
const WATCHABLE_SESSION_MODES = ["quick", "friend", "tournament", "fourPlayer"];
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

function normalizeWatchKind(kind) {
  return kind === "fourPlayer" ? "fourPlayer" : "classic";
}

function normalizeWatchMode(mode) {
  if (mode === "friend" || mode === "tournament" || mode === "fourPlayer") {
    return mode;
  }
  return "quick";
}

async function buildWatchableSessionForUser(userId) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return null;

  const sessions = await ActiveGameSession.find({
    participantUserIds: normalizedUserId,
    status: { $in: WATCHABLE_SESSION_STATUSES },
    mode: { $in: WATCHABLE_SESSION_MODES },
  })
    .select("gameId kind mode status variant participantUserIds updatedAt")
    .sort({ updatedAt: -1 })
    .lean();

  for (const session of sessions) {
    const participants = Array.from(
      new Set(
        (Array.isArray(session?.participantUserIds) ? session.participantUserIds : [])
          .map((id) => String(id || "").trim())
          .filter(Boolean),
      ),
    );

    // "Watch" should only show for real multiplayer games.
    if (participants.length < 2) continue;

    const gameId = String(session?.gameId || "").trim();
    if (!gameId) continue;

    return {
      gameId,
      kind: normalizeWatchKind(session?.kind),
      mode: normalizeWatchMode(session?.mode),
      variant: String(session?.variant || "standard"),
      status:
        String(session?.status || "") === "temporarily_disconnected"
          ? "temporarily_disconnected"
          : "active",
      participantCount: participants.length,
    };
  }

  return null;
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
    authProvider: user.authProvider || "local",
    emailVerified:
      !isEmailVerificationRequired() ||
      user.authProvider !== "local" || user.emailVerified !== false,
    hasGoogleAuth: !!String(user.googleId || "").trim(),
    hasFacebookAuth: !!String(user.facebookId || "").trim(),
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
    createdAt: user.createdAt ?? null,
  };
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function eloTierLabel(elo) {
  const rating = Number(elo || 1200);
  if (rating < 1200) return "Beginner";
  if (rating < 1600) return "Intermediate";
  if (rating < 1900) return "Advanced";
  if (rating < 2200) return "Expert";
  return "Master";
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
const verifyEmailRateLimiter = makeAuthRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
});
const resendVerificationRateLimiter = makeAuthRateLimiter({
  windowMs: 60 * 60 * 1000,
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

const verifyEmailValidation = [
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
  body("code")
    .exists({ values: "falsy" })
    .withMessage("Verification code is required")
    .bail()
    .isString()
    .withMessage("Verification code must be a string")
    .bail()
    .trim()
    .matches(/^\d{6}$/)
    .withMessage("Verification code must be 6 digits"),
  body("rememberMe")
    .optional()
    .isBoolean()
    .withMessage("rememberMe must be a boolean"),
  validateRequest,
];

const resendVerificationValidation = [
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
  validateRequest,
];

const changePasswordValidation = [
  body("currentPassword")
    .exists({ values: "falsy" })
    .withMessage("Current password is required")
    .bail()
    .isString()
    .withMessage("Current password must be a string"),
  body("newPassword")
    .exists({ values: "falsy" })
    .withMessage("New password is required")
    .bail()
    .isString()
    .withMessage("New password must be a string")
    .bail()
    .isLength({ min: 8 })
    .withMessage("New password must be at least 8 characters"),
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

function buildTokenData(user) {
  return {
    userId: user._id,
    email: user.email,
    fullName: user.fullName,
  };
}

function getDateOrNull(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed;
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

async function syncLegacyBlockedEdge(blockerId, blockedId, shouldExist) {
  if (shouldExist) {
    try {
      await BlockedUser.updateOne(
        { blocker: blockerId, blocked: blockedId },
        { $setOnInsert: { blocker: blockerId, blocked: blockedId } },
        { upsert: true },
      );
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
    }
    return;
  }

  await BlockedUser.deleteOne({ blocker: blockerId, blocked: blockedId });
}

async function removeFriendshipAndPendingRequests(userA, userB) {
  await Promise.all([
    Friend.deleteMany({
      $or: [
        { userId: userA, friendId: userB },
        { userId: userB, friendId: userA },
      ],
    }),
    FriendRequest.deleteMany({
      status: "pending",
      $or: [
        { senderId: userA, receiverId: userB },
        { senderId: userB, receiverId: userA },
      ],
    }),
  ]);
}

async function issueVerificationCodeForUser(user) {
  const code = createEmailVerificationCode();
  const expiresAt = new Date(Date.now() + getEmailVerificationCodeTtlMs());

  user.emailVerificationCodeHash = hashEmailVerificationCode(code);
  user.emailVerificationCodeExpiresAt = expiresAt;
  user.emailVerificationCodeSentAt = new Date();
  await user.save();

  await sendEmailVerificationCode({
    toEmail: user.email,
    fullName: user.fullName,
    code,
  });

  return expiresAt;
}

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

    const requiresEmailVerification = isEmailVerificationRequired();

    if (requiresEmailVerification && !isVerificationEmailConfigured()) {
      return res.status(503).json({
        error:
          "Email verification is not configured on the server. Please contact support.",
        code: "EMAIL_TRANSPORT_NOT_CONFIGURED",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      fullName,
      email,
      password: hashedPassword,
      authProvider: "local",
      emailVerified: !requiresEmailVerification,
    });

    if (!requiresEmailVerification) {
      const maxAge = resolveAuthMaxAge(false);
      res.cookie(
        "authToken",
        JSON.stringify(buildTokenData(user)),
        buildAuthCookieOptions({ maxAge }),
      );

      return res.status(201).json({
        success: true,
        message: "User registered successfully",
        requiresEmailVerification: false,
        user: toPublicUser(user),
      });
    }

    let emailSent = false;
    try {
      await issueVerificationCodeForUser(user);
      emailSent = true;
    } catch (emailError) {
      console.error("Register verification email error:", emailError);
    }

    res.status(201).json({
      success: true,
      message: emailSent
        ? "User registered. Verification code sent to your email."
        : "User registered, but we could not send the verification email. Request a new code from login.",
      requiresEmailVerification: true,
      emailSent,
      email: user.email,
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

    if (isEmailVerificationRequired() && user.emailVerified === false) {
      return res.status(403).json({
        error: "Please verify your email before logging in",
        code: "EMAIL_NOT_VERIFIED",
        requiresEmailVerification: true,
        email: user.email,
      });
    }

    const tokenData = buildTokenData(user);

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

// Verify local account email
router.post(
  "/verify-email",
  verifyEmailRateLimiter,
  verifyEmailValidation,
  async (req, res) => {
    try {
      const { email, code, rememberMe } = req.body || {};
      const user = await User.findOne({ email });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (user.banned) {
        return res.status(403).json({
          error: "Your account has been banned",
          banned: true,
          banReason: user.banReason || "No reason provided",
        });
      }

      if (user.authProvider !== "local") {
        return res.status(400).json({ error: "This account uses social sign-in" });
      }

      if (!isEmailVerificationRequired()) {
        const maxAge = resolveAuthMaxAge(Boolean(rememberMe));
        res.cookie(
          "authToken",
          JSON.stringify(buildTokenData(user)),
          buildAuthCookieOptions({ maxAge }),
        );
        return res.json({
          success: true,
          message: "Email verification is currently disabled",
          user: toPublicUser(user),
        });
      }

      if (user.emailVerified !== false) {
        const maxAge = resolveAuthMaxAge(Boolean(rememberMe));
        res.cookie(
          "authToken",
          JSON.stringify(buildTokenData(user)),
          buildAuthCookieOptions({ maxAge }),
        );
        return res.json({
          success: true,
          message: "Email already verified",
          user: toPublicUser(user),
        });
      }

      const expiresAt = getDateOrNull(user.emailVerificationCodeExpiresAt);
      const storedHash = String(user.emailVerificationCodeHash || "");
      if (!storedHash || !expiresAt || expiresAt.getTime() <= Date.now()) {
        return res.status(400).json({
          error: "Verification code expired. Please request a new code.",
          code: "VERIFICATION_CODE_EXPIRED",
        });
      }

      const submittedHash = hashEmailVerificationCode(code);
      if (submittedHash !== storedHash) {
        return res.status(400).json({
          error: "Invalid verification code",
          code: "VERIFICATION_CODE_INVALID",
        });
      }

      user.emailVerified = true;
      user.emailVerificationCodeHash = "";
      user.emailVerificationCodeExpiresAt = null;
      user.emailVerificationCodeSentAt = null;
      await user.save();

      const maxAge = resolveAuthMaxAge(Boolean(rememberMe));
      res.cookie(
        "authToken",
        JSON.stringify(buildTokenData(user)),
        buildAuthCookieOptions({ maxAge }),
      );

      return res.json({
        success: true,
        message: "Email verified successfully",
        user: toPublicUser(user),
      });
    } catch (err) {
      console.error("Verify email error:", err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);

// Resend local account verification code
router.post(
  "/resend-verification-code",
  resendVerificationRateLimiter,
  resendVerificationValidation,
  async (req, res) => {
    try {
      if (!isEmailVerificationRequired()) {
        return res.json({
          success: true,
          message: "Email verification is currently disabled. You can log in normally.",
        });
      }

      const { email } = req.body || {};

      if (!isVerificationEmailConfigured()) {
        return res.status(503).json({
          error:
            "Email verification is not configured on the server. Please contact support.",
          code: "EMAIL_TRANSPORT_NOT_CONFIGURED",
        });
      }

      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (user.banned) {
        return res.status(403).json({
          error: "Your account has been banned",
          banned: true,
          banReason: user.banReason || "No reason provided",
        });
      }

      if (user.authProvider !== "local") {
        return res.status(400).json({ error: "This account uses social sign-in" });
      }

      if (user.emailVerified !== false) {
        return res.status(400).json({
          error: "Email is already verified",
          code: "EMAIL_ALREADY_VERIFIED",
        });
      }

      const cooldownMs = getEmailVerificationResendCooldownMs();
      const lastSentAt = getDateOrNull(user.emailVerificationCodeSentAt);
      const elapsedMs = Date.now() - Number(lastSentAt?.getTime() || 0);
      if (lastSentAt && elapsedMs < cooldownMs) {
        const retryAfterSeconds = Math.ceil((cooldownMs - elapsedMs) / 1000);
        return res.status(429).json({
          error: "Please wait before requesting another code",
          code: "VERIFICATION_CODE_RESEND_COOLDOWN",
          retryAfterSeconds,
        });
      }

      await issueVerificationCodeForUser(user);

      return res.json({
        success: true,
        message: "Verification code sent",
        email: user.email,
      });
    } catch (err) {
      console.error("Resend verification code error:", err);
      return res.status(500).json({
        error: "Could not send verification code. Please try again.",
      });
    }
  },
);

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
        emailVerified: true,
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
      if (user.emailVerified !== true) {
        user.emailVerified = true;
        user.emailVerificationCodeHash = "";
        user.emailVerificationCodeExpiresAt = null;
        user.emailVerificationCodeSentAt = null;
        needsSave = true;
      }
      if (needsSave) {
        await user.save();
      }
    }

    const tokenData = buildTokenData(user);
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
        emailVerified: true,
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
      if (user.emailVerified !== true) {
        user.emailVerified = true;
        user.emailVerificationCodeHash = "";
        user.emailVerificationCodeExpiresAt = null;
        user.emailVerificationCodeSentAt = null;
        needsSave = true;
      }
      if (needsSave) {
        await user.save();
      }
    }

    const tokenData = buildTokenData(user);
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

router.post(
  "/change-password",
  authMiddleware,
  changePasswordValidation,
  async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body || {};
      const user = await User.findById(req.user?.userId);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (user.banned) {
        clearAuthCookie(res);
        return res.status(403).json({
          error: "Your account has been banned",
          banned: true,
          banReason: user.banReason || "No reason provided",
        });
      }

      if (user.authProvider !== "local" || !user.password) {
        return res.status(400).json({
          error: "Password changes are only available for email/password accounts",
        });
      }

      const isPasswordValid = await bcrypt.compare(
        currentPassword,
        user.password,
      );
      if (!isPasswordValid) {
        return res.status(400).json({ error: "Current password is incorrect" });
      }

      user.password = await bcrypt.hash(newPassword, 10);
      await user.save();

      return res.json({
        success: true,
        message: "Password changed successfully",
      });
    } catch (err) {
      console.error("Change password error:", err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);

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

router.get("/users/blocks", authMiddleware, async (req, res) => {
  try {
    const blockerId = String(req.user.userId || "");
    const blocker = await User.findById(blockerId)
      .select("blockedUsers")
      .lean();
    const legacyBlocked = await BlockedUser.find({ blocker: blockerId })
      .select("blocked")
      .lean();

    const blockedIds = [
      ...new Set([
        ...(Array.isArray(blocker?.blockedUsers)
          ? blocker.blockedUsers.map((id) => String(id))
          : []),
        ...legacyBlocked.map((item) => String(item.blocked || "")),
      ].filter(Boolean)),
    ];

    if (!blockedIds.length) {
      return res.json({ blocks: [] });
    }

    const [blockedUsers, legacyEdges] = await Promise.all([
      User.find({ _id: { $in: blockedIds } })
        .select("_id fullName avatar rating banned")
        .lean(),
      BlockedUser.find({
        blocker: blockerId,
        blocked: { $in: blockedIds },
      })
        .select("blocked createdAt")
        .lean(),
    ]);

    const userMap = new Map(
      blockedUsers
        .filter((entry) => !entry?.banned)
        .map((entry) => [String(entry._id), entry]),
    );
    const blockedAtMap = new Map(
      legacyEdges.map((edge) => [String(edge.blocked), edge.createdAt || null]),
    );

    const blocks = blockedIds
      .map((blockedId) => {
        const target = userMap.get(blockedId);
        if (!target) return null;

        return {
          id: blockedId,
          fullName: target.fullName || "Player",
          avatar: target.avatar || "",
          rating: Number(target.rating || 1200),
          blockedAt: blockedAtMap.get(blockedId) || null,
        };
      })
      .filter(Boolean);

    return res.json({ blocks });
  } catch (err) {
    console.error("Get blocked users error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/users/:id/block-status", authMiddleware, async (req, res) => {
  try {
    const requesterId = String(req.user.userId || "");
    const targetUserId = String(req.params.id || "");

    if (!isValidObjectId(targetUserId)) {
      return res.status(404).json({ error: "User not found" });
    }
    if (requesterId === targetUserId) {
      return res.json({
        isBlocked: false,
        isBlockedByTarget: false,
        isAnyBlocked: false,
      });
    }

    const target = await User.findById(targetUserId)
      .select("_id banned")
      .lean();
    if (!target || target.banned) {
      return res.status(404).json({ error: "User not found" });
    }

    const status = await getBlockStatusBetween(requesterId, targetUserId);
    return res.json(status);
  } catch (err) {
    console.error("Get block status error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/users/:id/block", authMiddleware, async (req, res) => {
  try {
    const blockerId = String(req.user.userId || "");
    const blockedId = String(req.params.id || "");

    if (!isValidObjectId(blockedId)) {
      return res.status(404).json({ error: "User not found" });
    }
    if (blockerId === blockedId) {
      return res.status(400).json({ error: "You cannot block yourself." });
    }

    const target = await User.findById(blockedId)
      .select("_id banned")
      .lean();
    if (!target || target.banned) {
      return res.status(404).json({ error: "User not found" });
    }

    await User.updateOne(
      { _id: blockerId },
      { $addToSet: { blockedUsers: blockedId } },
    );
    await syncLegacyBlockedEdge(blockerId, blockedId, true);
    await removeFriendshipAndPendingRequests(blockerId, blockedId);

    return res.json({
      success: true,
      isBlocked: true,
      blockedUserId: blockedId,
    });
  } catch (err) {
    console.error("Block user error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/users/:id/unblock", authMiddleware, async (req, res) => {
  try {
    const blockerId = String(req.user.userId || "");
    const blockedId = String(req.params.id || "");

    if (!isValidObjectId(blockedId)) {
      return res.status(404).json({ error: "User not found" });
    }
    if (blockerId === blockedId) {
      return res.status(400).json({ error: "You cannot unblock yourself." });
    }

    await User.updateOne(
      { _id: blockerId },
      { $pull: { blockedUsers: blockedId } },
    );
    await syncLegacyBlockedEdge(blockerId, blockedId, false);

    return res.json({
      success: true,
      isBlocked: false,
      blockedUserId: blockedId,
    });
  } catch (err) {
    console.error("Unblock user error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Get profile of any user by username/fullName (authenticated)
router.get("/users/profile/:username", authMiddleware, async (req, res) => {
  try {
    const username = String(req.params.username || "").trim();
    if (!username) {
      return res.status(404).json({ error: "User not found" });
    }

    const viewerId = req.user?.userId || null;
    const user = mongoose.Types.ObjectId.isValid(username)
      ? await User.findById(username).select("-password")
      : await User.findOne({
          fullName: new RegExp(`^${escapeRegExp(username)}$`, "i"),
        }).select("-password");

    if (!user || user.banned) {
      return res.status(404).json({ error: "User not found" });
    }

    const hasBlockedUsersListRelation = await haveBlockedUsersListRelation(
      viewerId,
      user._id,
      { userBDoc: user },
    );
    const canAccess =
      !hasBlockedUsersListRelation &&
      (await canViewerAccessUser(viewerId, user._id));
    if (!canAccess) {
      return res.status(404).json({ error: "User not found" });
    }

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

    const [{ default: HistoryModel }, watchableGame] = await Promise.all([
      import("../models/History.js"),
      buildWatchableSessionForUser(user._id),
    ]);

    const [totalGames, totalWins] = await Promise.all([
      HistoryModel.countDocuments({ userId: user._id }),
      HistoryModel.countDocuments({
        userId: user._id,
        $or: [
          { result: "1-0", playAs: "white" },
          { result: "0-1", playAs: "black" },
        ],
      }),
    ]);

    return res.json({
      user: {
        ...toPublicUser(user),
        gamesPlayed: Math.max(user.gamesPlayed ?? 0, totalGames),
        gamesWon: Math.max(user.gamesWon ?? 0, totalWins),
        isWatchableInGame: !!watchableGame,
        watchableGame,
      },
      relationship,
      relationshipRequestId,
    });
  } catch (err) {
    console.error("Public username profile error:", err);
    return res.status(500).json({ error: "Server error" });
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

    const hasBlockedUsersListRelation = await haveBlockedUsersListRelation(
      viewerId,
      user._id,
      { userBDoc: user },
    );
    const canAccess =
      !hasBlockedUsersListRelation &&
      (await canViewerAccessUser(viewerId, user._id));
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

    // Fetch profile activity + game history count
    const [{ default: HistoryModel }, watchableGame] = await Promise.all([
      import("../models/History.js"),
      buildWatchableSessionForUser(user._id),
    ]);

    const [totalGames, totalWins] = await Promise.all([
      HistoryModel.countDocuments({ userId: user._id }),
      HistoryModel.countDocuments({
        userId: user._id,
        $or: [
          { result: "1-0", playAs: "white" },
          { result: "0-1", playAs: "black" },
        ],
      }),
    ]);

    res.json({
      user: {
        ...toPublicUser(user),
        gamesPlayed: Math.max(user.gamesPlayed ?? 0, totalGames),
        gamesWon: Math.max(user.gamesWon ?? 0, totalWins),
        isWatchableInGame: !!watchableGame,
        watchableGame,
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

router.get("/users/:userId/profile", optionalAuthMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(userId || ""))) {
      return res.status(404).json({ error: "User not found" });
    }
    const viewerId = req.user?.userId || null;

    const user = await User.findById(userId)
      .select("fullName avatar rating createdAt blockedUsers")
      .lean();
    if (!user || user.banned) {
      return res.status(404).json({ error: "User not found" });
    }

    const hasBlockedUsersListRelation = await haveBlockedUsersListRelation(
      viewerId,
      user._id,
      { userBDoc: user },
    );
    const canAccess =
      !hasBlockedUsersListRelation &&
      (await canViewerAccessUser(viewerId, user._id));
    if (!canAccess) {
      return res.status(404).json({ error: "User not found" });
    }

    const [eloEvents, tournamentPlayers, createdTournaments] = await Promise.all([
      TournamentEloEvent.find({ userId: user._id })
        .sort({ at: 1 })
        .select("at eloAfter delta tournamentId gameId")
        .lean(),
      TournamentPlayer.find({ userId: user._id })
        .select(
          "tournamentId score tournamentEloDelta wins draws losses placement status updatedAt",
        )
        .lean(),
      Tournament.find({ createdBy: user._id })
        .sort({ createdAt: -1 })
        .select("name type status createdAt finishedAt")
        .lean(),
    ]);

    const tournamentIds = [
      ...new Set(tournamentPlayers.map((item) => String(item.tournamentId || "")).filter(Boolean)),
    ];
    const tournaments = tournamentIds.length
      ? await Tournament.find({ _id: { $in: tournamentIds } })
          .select("name type status createdAt finishedAt")
          .lean()
      : [];
    const tournamentMap = new Map(
      tournaments.map((tournament) => [String(tournament._id), tournament]),
    );

    const tournamentHistory = tournamentPlayers
      .map((entry) => {
        const tournament = tournamentMap.get(String(entry.tournamentId || ""));
        if (!tournament) return null;
        return {
          tournamentId: String(tournament._id),
          tournamentName: tournament.name,
          format: tournament.type,
          placement:
            Number.isFinite(Number(entry.placement)) && Number(entry.placement) > 0
              ? Number(entry.placement)
              : null,
          score: Number(entry.score || 0),
          eloChange: Number(entry.tournamentEloDelta || 0),
          date: tournament.finishedAt || tournament.createdAt || entry.updatedAt || null,
          status: tournament.status,
        };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

    const totalRecord = tournamentPlayers.reduce(
      (acc, item) => {
        acc.wins += Number(item.wins || 0);
        acc.draws += Number(item.draws || 0);
        acc.losses += Number(item.losses || 0);
        return acc;
      },
      { wins: 0, draws: 0, losses: 0 },
    );

    res.json({
      profile: {
        id: String(user._id),
        username: user.fullName,
        avatar: user.avatar || "",
        currentElo: Number(user.rating || 1200),
        eloTier: eloTierLabel(user.rating),
        eloHistory: eloEvents.map((event) => ({
          date: event.at || null,
          elo: Number(event.eloAfter || 1200),
          delta: Number(event.delta || 0),
          tournamentId: event.tournamentId ? String(event.tournamentId) : null,
          gameId: event.gameId || null,
        })),
        tournamentHistory,
        record: totalRecord,
        tournamentsCreated: createdTournaments.map((tournament) => ({
          id: String(tournament._id),
          name: tournament.name,
          format: tournament.type,
          status: tournament.status,
          createdAt: tournament.createdAt || null,
          finishedAt: tournament.finishedAt || null,
        })),
      },
    });
  } catch (err) {
    console.error("User tournament profile error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
