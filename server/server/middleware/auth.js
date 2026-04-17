import { Admin, User } from "../models/index.js";
import { clearAdminCookie, clearAuthCookie } from "../utils/cookies.js";

function readSignedCookie(req, key) {
  const signedValue = req?.signedCookies?.[key];
  const unsignedValue = req?.cookies?.[key];

  if (!signedValue && unsignedValue) {
    return { value: null, tampered: true };
  }

  return { value: signedValue || null, tampered: false };
}

function parseJsonCookie(rawValue) {
  if (!rawValue || typeof rawValue !== "string") return null;
  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function toSafeUserPayload(user) {
  return {
    userId: String(user?._id || ""),
    email: String(user?.email || ""),
    fullName: String(user?.fullName || ""),
  };
}

// Auth Middleware for regular users
export const authMiddleware = async (req, res, next) => {
  if (req.user?.userId) {
    return next();
  }

  const { value: authToken, tampered } = readSignedCookie(req, "authToken");

  if (tampered) {
    clearAuthCookie(res);
    return res.status(401).json({ error: "Invalid token" });
  }

  if (!authToken) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const parsedToken = parseJsonCookie(authToken);
  const userId = String(parsedToken?.userId || "").trim();
  if (!userId) {
    clearAuthCookie(res);
    return res.status(401).json({ error: "Invalid token" });
  }

  try {
    const user = await User.findById(userId)
      .select("_id email fullName banned banReason")
      .lean();

    if (!user) {
      clearAuthCookie(res);
      return res.status(401).json({ error: "Invalid token" });
    }

    if (user.banned) {
      clearAuthCookie(res);
      return res.status(403).json({
        error: "Your account has been banned",
        banned: true,
        banReason: user.banReason || "No reason provided",
      });
    }

    req.user = toSafeUserPayload(user);
    return next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({ error: "Server error" });
  }
};

// Optional auth for endpoints that may personalize by user context.
export const optionalAuthMiddleware = async (req, res, next) => {
  const { value: authToken, tampered } = readSignedCookie(req, "authToken");

  if (tampered) {
    clearAuthCookie(res);
    req.user = null;
    return next();
  }

  if (!authToken) {
    req.user = null;
    return next();
  }

  const parsedToken = parseJsonCookie(authToken);
  const userId = String(parsedToken?.userId || "").trim();
  if (!userId) {
    clearAuthCookie(res);
    req.user = null;
    return next();
  }

  try {
    const user = await User.findById(userId)
      .select("_id email fullName banned banReason")
      .lean();

    if (!user) {
      clearAuthCookie(res);
      req.user = null;
      return next();
    }

    if (user.banned) {
      clearAuthCookie(res);
      return res.status(403).json({
        error: "Your account has been banned",
        banned: true,
        banReason: user.banReason || "No reason provided",
      });
    }

    req.user = toSafeUserPayload(user);
    return next();
  } catch (error) {
    console.error("Optional auth middleware error:", error);
    return res.status(500).json({ error: "Server error" });
  }
};

// Admin Auth Middleware
export const adminAuthMiddleware = async (req, res, next) => {
  const { value: adminToken, tampered } = readSignedCookie(req, "adminToken");

  if (tampered) {
    clearAdminCookie(res);
    return res.status(401).json({ error: "Invalid admin token" });
  }

  if (!adminToken) {
    return res.status(401).json({ error: "Not authenticated as admin" });
  }

  const parsed = parseJsonCookie(adminToken);
  const adminId = String(parsed?.adminId || "").trim();

  if (!parsed?.isAdmin || !adminId) {
    clearAdminCookie(res);
    return res.status(403).json({ error: "Not authorized" });
  }

  try {
    const admin = await Admin.findById(adminId)
      .select("_id email username")
      .lean();
    if (!admin) {
      clearAdminCookie(res);
      return res.status(401).json({ error: "Invalid admin token" });
    }

    req.admin = {
      adminId: String(admin._id),
      email: String(admin.email || ""),
      username: String(admin.username || ""),
      isAdmin: true,
    };

    return next();
  } catch (error) {
    console.error("Admin auth middleware error:", error);
    return res.status(500).json({ error: "Server error" });
  }
};
