import { BlockedUser } from "../models/index.js";
import { normalizeId } from "./friendship.js";

export async function areUsersBlocked(userA, userB) {
  const a = normalizeId(userA);
  const b = normalizeId(userB);

  if (!a || !b || a === b) {
    return false;
  }

  const edge = await BlockedUser.findOne({
    $or: [
      { blocker: a, blocked: b },
      { blocker: b, blocked: a },
    ],
  })
    .select("_id")
    .lean();

  return !!edge;
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

  return !(await areUsersBlocked(viewer, target));
}
