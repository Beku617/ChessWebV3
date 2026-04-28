import mongoose from "mongoose";
import { ActiveGameSession, History, History960, User } from "../models/index.js";

const LIVE_GAME_SESSION_STATUSES = ["active", "temporarily_disconnected"];

function normalizeUserId(value) {
  const text = String(value || "").trim();
  return text || "";
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || "").trim());
}

function uniqueUserIds(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => normalizeUserId(value))
        .filter((value) => isValidObjectId(value)),
    ),
  );
}

async function detachUserHistoryReferences(model, userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) return;
  await Promise.all([
    model.updateMany({ userId: { $in: userIds } }, { $set: { userId: null } }),
    model.updateMany({ whiteUserId: { $in: userIds } }, { $set: { whiteUserId: null } }),
    model.updateMany({ blackUserId: { $in: userIds } }, { $set: { blackUserId: null } }),
  ]);
}

export async function isUserCurrentlyPlaying(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!isValidObjectId(normalizedUserId)) return false;

  const [activeSession, user] = await Promise.all([
    ActiveGameSession.exists({
      participantUserIds: normalizedUserId,
      status: { $in: LIVE_GAME_SESSION_STATUSES },
    }),
    User.findById(normalizedUserId)
      .select("presenceStatus accountStatus")
      .lean(),
  ]);

  if (activeSession) return true;
  const accountStatus = String(user?.accountStatus || "")
    .trim()
    .toLowerCase();
  const presenceStatus = String(user?.presenceStatus || "")
    .trim()
    .toLowerCase();
  return accountStatus === "playing" || presenceStatus === "in_game";
}

export async function markUserPendingDeletion(userOrId, { reason = "" } = {}) {
  const normalizedUserId = normalizeUserId(userOrId?._id || userOrId);
  if (!isValidObjectId(normalizedUserId)) return null;

  const user =
    typeof userOrId?.save === "function"
      ? userOrId
      : await User.findById(normalizedUserId);
  if (!user) return null;

  user.pendingDeletion = true;
  if (reason && !user.banReason) {
    user.banReason = String(reason).trim();
  }
  await user.save();
  return user;
}

export async function deleteUserAccountById(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!isValidObjectId(normalizedUserId)) return null;

  const user = await User.findById(normalizedUserId);
  if (!user) return null;

  await Promise.all([
    detachUserHistoryReferences(History, [normalizedUserId]),
    detachUserHistoryReferences(History960, [normalizedUserId]),
  ]);
  await User.deleteOne({ _id: normalizedUserId });
  return user;
}

export async function deletePendingUsersByIds(userIds) {
  const normalizedIds = uniqueUserIds(userIds);
  if (normalizedIds.length === 0) return [];

  const pendingUsers = await User.find({
    _id: { $in: normalizedIds },
    pendingDeletion: true,
  })
    .select("_id")
    .lean();

  const pendingIds = uniqueUserIds(pendingUsers.map((user) => user?._id));
  if (pendingIds.length === 0) return [];

  await Promise.all([
    detachUserHistoryReferences(History, pendingIds),
    detachUserHistoryReferences(History960, pendingIds),
  ]);
  await User.deleteMany({ _id: { $in: pendingIds } });
  return pendingIds;
}
