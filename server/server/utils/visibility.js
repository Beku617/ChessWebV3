import { BlockedUser, User } from "../models/index.js";
import { normalizeId } from "./friendship.js";
import mongoose from "mongoose";

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

async function hasLegacyBlock(blockerId, blockedId) {
  const edge = await BlockedUser.findOne({
    blocker: blockerId,
    blocked: blockedId,
  })
    .select("_id")
    .lean();
  return !!edge;
}

export async function isBlocked(blockerId, blockedId) {
  const blocker = normalizeId(blockerId);
  const blocked = normalizeId(blockedId);

  if (
    !blocker ||
    !blocked ||
    blocker === blocked ||
    !isValidObjectId(blocker) ||
    !isValidObjectId(blocked)
  ) {
    return false;
  }

  const blockerDoc = await User.findOne({
    _id: blocker,
    blockedUsers: blocked,
  })
    .select("_id")
    .lean();

  if (blockerDoc) {
    return true;
  }

  return hasLegacyBlock(blocker, blocked);
}

export async function getBlockStatusBetween(userA, userB) {
  const a = normalizeId(userA);
  const b = normalizeId(userB);

  if (
    !a ||
    !b ||
    a === b ||
    !isValidObjectId(a) ||
    !isValidObjectId(b)
  ) {
    return {
      isBlocked: false,
      isBlockedByTarget: false,
      isAnyBlocked: false,
    };
  }

  const [blockedByViewer, blockedByTarget] = await Promise.all([
    isBlocked(a, b),
    isBlocked(b, a),
  ]);

  return {
    isBlocked: blockedByViewer,
    isBlockedByTarget: blockedByTarget,
    isAnyBlocked: blockedByViewer || blockedByTarget,
  };
}

export async function areUsersBlocked(userA, userB) {
  const status = await getBlockStatusBetween(userA, userB);
  return status.isAnyBlocked;
}

export async function canViewerAccessUser(viewerId, targetUserId) {
  const viewer = normalizeId(viewerId);
  const target = normalizeId(targetUserId);

  if (!target) {
    return false;
  }
  if (!viewer || viewer === target) {
    return true;
  }

  const hasBlockedTarget = await isBlocked(viewer, target);
  return !hasBlockedTarget;
}
