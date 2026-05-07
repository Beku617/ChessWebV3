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

function userIdListIncludes(userIds, targetUserId) {
  const normalizedTargetUserId = normalizeId(targetUserId);
  if (!normalizedTargetUserId || !Array.isArray(userIds)) {
    return false;
  }
  return userIds.some((id) => normalizeId(id) === normalizedTargetUserId);
}

export async function haveBlockedUsersListRelation(
  userA,
  userB,
  { userADoc = null, userBDoc = null } = {},
) {
  const a = normalizeId(userA);
  const b = normalizeId(userB);

  if (
    !a ||
    !b ||
    a === b ||
    !isValidObjectId(a) ||
    !isValidObjectId(b)
  ) {
    return false;
  }

  const needsUserA =
    !userADoc || !Array.isArray(userADoc.blockedUsers);
  const needsUserB =
    !userBDoc || !Array.isArray(userBDoc.blockedUsers);

  const [resolvedUserA, resolvedUserB] = await Promise.all([
    needsUserA
      ? User.findById(a).select("blockedUsers").lean()
      : Promise.resolve(userADoc),
    needsUserB
      ? User.findById(b).select("blockedUsers").lean()
      : Promise.resolve(userBDoc),
  ]);

  return (
    userIdListIncludes(resolvedUserA?.blockedUsers, b) ||
    userIdListIncludes(resolvedUserB?.blockedUsers, a)
  );
}

export async function buildBlockedUserIdSet(
  userId,
  {
    includeSelf = true,
    includeBlockedBySelf = true,
    includeBlockingSelf = true,
  } = {},
) {
  const normalizedUserId = normalizeId(userId);
  const blockedIds = new Set();

  if (!normalizedUserId || !isValidObjectId(normalizedUserId)) {
    return blockedIds;
  }

  if (includeSelf) {
    blockedIds.add(normalizedUserId);
  }

  const tasks = [];

  if (includeBlockedBySelf) {
    tasks.push(
      User.findById(normalizedUserId).select("blockedUsers").lean(),
      BlockedUser.find({ blocker: normalizedUserId }).select("blocked").lean(),
    );
  } else {
    tasks.push(Promise.resolve(null), Promise.resolve([]));
  }

  if (includeBlockingSelf) {
    tasks.push(
      User.find({ blockedUsers: normalizedUserId }).select("_id").lean(),
      BlockedUser.find({ blocked: normalizedUserId }).select("blocker").lean(),
    );
  } else {
    tasks.push(Promise.resolve([]), Promise.resolve([]));
  }

  const [
    currentUserDoc,
    legacyBlockedBySelf,
    usersBlockingSelf,
    legacyBlockingSelf,
  ] = await Promise.all(tasks);

  for (const blockedUserId of currentUserDoc?.blockedUsers || []) {
    const normalizedBlockedUserId = normalizeId(blockedUserId);
    if (normalizedBlockedUserId) {
      blockedIds.add(normalizedBlockedUserId);
    }
  }

  for (const edge of legacyBlockedBySelf || []) {
    const normalizedBlockedUserId = normalizeId(edge?.blocked);
    if (normalizedBlockedUserId) {
      blockedIds.add(normalizedBlockedUserId);
    }
  }

  for (const user of usersBlockingSelf || []) {
    const normalizedBlockingUserId = normalizeId(user?._id);
    if (normalizedBlockingUserId) {
      blockedIds.add(normalizedBlockingUserId);
    }
  }

  for (const edge of legacyBlockingSelf || []) {
    const normalizedBlockingUserId = normalizeId(edge?.blocker);
    if (normalizedBlockingUserId) {
      blockedIds.add(normalizedBlockingUserId);
    }
  }

  return blockedIds;
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

  if (await haveBlockedUsersListRelation(viewer, target)) {
    return false;
  }

  const blockStatus = await getBlockStatusBetween(viewer, target);
  return !blockStatus.isAnyBlocked;
}
