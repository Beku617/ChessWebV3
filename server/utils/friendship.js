import { Friend, User } from "../models/index.js";

export function normalizeId(value) {
  return value ? String(value) : "";
}

export async function areFriends(userA, userB) {
  const a = normalizeId(userA);
  const b = normalizeId(userB);
  if (!a || !b || a === b) return false;
  const friendship = await Friend.findOne({ userId: a, friendId: b })
    .select("_id")
    .lean();
  return !!friendship;
}

export async function ensureFriendship(userA, userB) {
  const a = normalizeId(userA);
  const b = normalizeId(userB);
  if (!a || !b || a === b) return { created: false };

  await Friend.bulkWrite([
    {
      updateOne: {
        filter: { userId: a, friendId: b },
        update: { $setOnInsert: { userId: a, friendId: b } },
        upsert: true,
      },
    },
    {
      updateOne: {
        filter: { userId: b, friendId: a },
        update: { $setOnInsert: { userId: b, friendId: a } },
        upsert: true,
      },
    },
  ]);

  return { created: true };
}

export async function removeFriendship(userA, userB) {
  const a = normalizeId(userA);
  const b = normalizeId(userB);
  if (!a || !b || a === b) return;
  await Friend.deleteMany({
    $or: [
      { userId: a, friendId: b },
      { userId: b, friendId: a },
    ],
  });
}

export async function fetchUserSummary(userId) {
  const user = await User.findById(userId)
    .select("fullName avatar rating presenceStatus lastActiveAt lastSeenAt")
    .lean();
  if (!user) return null;
  return {
    id: normalizeId(user._id),
    name: user.fullName || "Player",
    avatar: user.avatar || "",
    rating: typeof user.rating === "number" ? user.rating : 1200,
    presenceStatus: user.presenceStatus || "offline",
    lastActiveAt: user.lastActiveAt || user.lastSeenAt || null,
    lastSeenAt: user.lastSeenAt || null,
  };
}
