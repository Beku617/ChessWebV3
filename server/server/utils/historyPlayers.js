import mongoose from "mongoose";
import { User } from "../models/index.js";

export const BANNED_USER_LABEL = "Banned user";

function normalizeObjectId(value) {
  const text = String(value || "").trim();
  return mongoose.Types.ObjectId.isValid(text) ? text : "";
}

function normalizeName(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function shouldAliasByMissingOwner(game, side) {
  const ownerId = normalizeObjectId(game?.userId);
  if (ownerId) return false;
  const playAs = String(game?.playAs || "").trim().toLowerCase();
  return playAs === side;
}

function resolveDisplayName(game, side, existingUserIds) {
  const userIdKey = side === "white" ? "whiteUserId" : "blackUserId";
  const snapshotKey = side === "white" ? "whiteNameSnapshot" : "blackNameSnapshot";
  const liveKey = side === "white" ? "white" : "black";
  const fallback = side === "white" ? "White" : "Black";
  const linkedUserId = normalizeObjectId(game?.[userIdKey]);

  if (linkedUserId && !existingUserIds.has(linkedUserId)) {
    return BANNED_USER_LABEL;
  }
  if (!linkedUserId && shouldAliasByMissingOwner(game, side)) {
    return BANNED_USER_LABEL;
  }

  return normalizeName(game?.[snapshotKey], normalizeName(game?.[liveKey], fallback));
}

export async function applyDeletedUserAliasesToGames(games) {
  const list = Array.isArray(games) ? games : [];
  if (list.length === 0) return [];

  const linkedUserIds = Array.from(
    new Set(
      list.flatMap((game) => [
        normalizeObjectId(game?.whiteUserId),
        normalizeObjectId(game?.blackUserId),
      ]),
    ),
  ).filter(Boolean);

  const existingUsers =
    linkedUserIds.length > 0
      ? await User.find({ _id: { $in: linkedUserIds } }).select("_id").lean()
      : [];
  const existingUserIds = new Set(
    existingUsers.map((user) => normalizeObjectId(user?._id)).filter(Boolean),
  );

  return list.map((game) => ({
    ...game,
    white: resolveDisplayName(game, "white", existingUserIds),
    black: resolveDisplayName(game, "black", existingUserIds),
  }));
}

export async function applyDeletedUserAliasesToGame(game) {
  if (!game) return game;
  const [normalized] = await applyDeletedUserAliasesToGames([game]);
  return normalized || game;
}

