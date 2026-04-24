import mongoose from "mongoose";
import { normalizeId } from "../utils/friendship.js";
import { getBlockStatusBetween } from "../utils/visibility.js";

const DEFAULT_PARAM_KEYS = ["id", "userId", "friendId"];
const DEFAULT_BODY_KEYS = ["id", "userId", "receiverId", "friendId", "toUserId"];
const DEFAULT_QUERY_KEYS = ["id", "userId", "receiverId", "friendId", "toUserId"];
const TOURNAMENT_PATH_MATCHERS = [
  "/tournament",
  "/tournaments",
];

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

function isTournamentPath(pathname = "") {
  const normalized = String(pathname || "").toLowerCase();
  return TOURNAMENT_PATH_MATCHERS.some((prefix) => normalized.includes(prefix));
}

function pickTargetId(req, options = {}) {
  const paramKeys = options.paramKeys || DEFAULT_PARAM_KEYS;
  const bodyKeys = options.bodyKeys || DEFAULT_BODY_KEYS;
  const queryKeys = options.queryKeys || DEFAULT_QUERY_KEYS;

  for (const key of paramKeys) {
    const value = normalizeId(req.params?.[key]);
    if (value) return value;
  }
  for (const key of bodyKeys) {
    const value = normalizeId(req.body?.[key]);
    if (value) return value;
  }
  for (const key of queryKeys) {
    const value = normalizeId(req.query?.[key]);
    if (value) return value;
  }

  return "";
}

export function checkBlocked(options = {}) {
  const statusCode = Number.isInteger(options.statusCode)
    ? options.statusCode
    : 403;
  const message =
    String(options.message || "").trim() ||
    "This action is unavailable due to block settings.";

  return async (req, res, next) => {
    try {
      if (options.skipTournament !== false && isTournamentPath(req.path)) {
        return next();
      }

      const requesterId = normalizeId(req.user?.userId);
      if (!requesterId || !isValidObjectId(requesterId)) {
        return next();
      }

      const targetUserId = pickTargetId(req, options);
      if (!targetUserId || !isValidObjectId(targetUserId)) {
        return next();
      }
      if (targetUserId === requesterId) {
        return next();
      }

      const status = await getBlockStatusBetween(requesterId, targetUserId);
      const shouldBlock =
        status.isBlocked || (options.blockIfTargetBlocked === true && status.isBlockedByTarget);
      if (!shouldBlock) {
        return next();
      }

      return res.status(statusCode).json({
        error: message,
        code: "user_blocked",
        isBlocked: status.isBlocked,
        isBlockedByTarget: status.isBlockedByTarget,
      });
    } catch (error) {
      console.error("checkBlocked middleware error:", error);
      return res.status(500).json({ error: "Server error" });
    }
  };
}

export default checkBlocked;
