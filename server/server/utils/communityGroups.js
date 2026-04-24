import mongoose from "mongoose";
import { CommunityGroup, CommunityPost, User } from "../models/index.js";

export const COMMUNITY_GROUP_NAME_MIN_LENGTH = 3;
export const COMMUNITY_GROUP_NAME_MAX_LENGTH = 60;
export const COMMUNITY_GROUP_DESCRIPTION_MAX_LENGTH = 320;
export const COMMUNITY_GROUP_TOPIC_MAX_LENGTH = 40;

export function normalizeCommunityGroupName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

export function slugifyCommunityGroupName(value) {
  return normalizeCommunityGroupName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

export function validateCommunityGroupInput(input) {
  const name = normalizeCommunityGroupName(input?.name);
  const description = String(input?.description || "").trim();
  const topic = String(input?.topic || "").trim();

  if (name.length < COMMUNITY_GROUP_NAME_MIN_LENGTH) {
    return `Group name must be at least ${COMMUNITY_GROUP_NAME_MIN_LENGTH} characters.`;
  }
  if (name.length > COMMUNITY_GROUP_NAME_MAX_LENGTH) {
    return `Group name is too long (${COMMUNITY_GROUP_NAME_MAX_LENGTH} characters max).`;
  }
  if (description.length > COMMUNITY_GROUP_DESCRIPTION_MAX_LENGTH) {
    return `Description is too long (${COMMUNITY_GROUP_DESCRIPTION_MAX_LENGTH} characters max).`;
  }
  if (topic.length > COMMUNITY_GROUP_TOPIC_MAX_LENGTH) {
    return `Topic is too long (${COMMUNITY_GROUP_TOPIC_MAX_LENGTH} characters max).`;
  }
  if (!/^[a-z0-9][a-z0-9\s\-&+#'.]*$/i.test(name)) {
    return "Group name contains unsupported characters.";
  }
  return null;
}

export async function ensureUniqueCommunityGroupName(name, excludeGroupId = null) {
  const normalizedName = normalizeCommunityGroupName(name).toLowerCase();
  const query = { normalizedName };
  if (excludeGroupId && mongoose.Types.ObjectId.isValid(String(excludeGroupId))) {
    query._id = { $ne: new mongoose.Types.ObjectId(String(excludeGroupId)) };
  }
  const existing = await CommunityGroup.findOne(query).select("_id").lean();
  return !existing;
}

export async function buildUniqueCommunityGroupSlug(name, excludeGroupId = null) {
  const baseSlug = slugifyCommunityGroupName(name) || "group";
  let attempt = 0;

  while (attempt < 100) {
    const candidate = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    const query = { slug: candidate };
    if (excludeGroupId && mongoose.Types.ObjectId.isValid(String(excludeGroupId))) {
      query._id = { $ne: new mongoose.Types.ObjectId(String(excludeGroupId)) };
    }
    const existing = await CommunityGroup.findOne(query).select("_id").lean();
    if (!existing) return candidate;
    attempt += 1;
  }

  return `${baseSlug}-${Date.now()}`;
}

export function normalizeCommunityGroup(groupDoc, currentUserId = "") {
  if (!groupDoc || typeof groupDoc !== "object") return null;

  const creator = groupDoc.creatorId;
  const creatorId = String(creator?._id || creator?.id || groupDoc.creatorId || "");
  const creatorName = String(
    creator?.fullName || groupDoc.creatorDisplayName || "Chess Player",
  );
  const creatorAvatar = String(creator?.avatar || groupDoc.creatorAvatar || "");
  const current = String(currentUserId || "");
  const joinedGroupIds = Array.isArray(groupDoc.currentUserJoinedGroupIds)
    ? groupDoc.currentUserJoinedGroupIds.map((value) => String(value || ""))
    : [];

  return {
    id: String(groupDoc._id || groupDoc.id || ""),
    name: String(groupDoc.name || "Group"),
    slug: String(groupDoc.slug || ""),
    description: String(groupDoc.description || ""),
    topic: String(groupDoc.topic || ""),
    visibility: "public",
    avatarUrl: String(groupDoc.avatarUrl || ""),
    coverUrl: String(groupDoc.coverUrl || ""),
    memberCount: Number(groupDoc.memberCount || 0),
    createdAt: groupDoc.createdAt || null,
    updatedAt: groupDoc.updatedAt || null,
    creator: creatorId
      ? {
          id: creatorId,
          fullName: creatorName,
          avatar: creatorAvatar,
        }
      : groupDoc.creatorDisplayName
        ? {
            id: "",
            fullName: creatorName,
            avatar: creatorAvatar,
          }
        : null,
    joined: joinedGroupIds.includes(String(groupDoc._id || groupDoc.id || "")),
    isCreator: current ? creatorId === current : false,
  };
}

export function findCommunityGroupByIdentifier(identifier) {
  const raw = String(identifier || "").trim();
  if (!raw) {
    return null;
  }

  const normalizedSlug = raw.toLowerCase();
  const query = mongoose.Types.ObjectId.isValid(raw)
    ? {
        $or: [
          { _id: new mongoose.Types.ObjectId(raw) },
          { slug: normalizedSlug },
        ],
      }
    : { slug: normalizedSlug };

  return CommunityGroup.findOne(query);
}

export async function buildCommunityGroupsOverview(userId, { joinedLimit = 4, discoverLimit = 6 } = {}) {
  const currentUserId = String(userId || "");
  const user = currentUserId
    ? await User.findById(currentUserId).select("communityJoinedGroupIds").lean()
    : null;
  const joinedGroupIds = Array.isArray(user?.communityJoinedGroupIds)
    ? user.communityJoinedGroupIds.map((value) => String(value || ""))
    : [];

  const [joinedGroups, discoverGroups] = await Promise.all([
    joinedGroupIds.length > 0
      ? CommunityGroup.find({ _id: { $in: joinedGroupIds } })
          .populate("creatorId", "fullName avatar")
          .sort({ memberCount: -1, createdAt: -1 })
          .limit(joinedLimit)
          .lean()
      : Promise.resolve([]),
    CommunityGroup.find(
      joinedGroupIds.length > 0 ? { _id: { $nin: joinedGroupIds } } : {},
    )
      .populate("creatorId", "fullName avatar")
      .sort({ memberCount: -1, createdAt: -1 })
      .limit(discoverLimit)
      .lean(),
  ]);

  const joinedDecorated = joinedGroups.map((group) =>
    normalizeCommunityGroup(
      {
        ...group,
        currentUserJoinedGroupIds: joinedGroupIds,
      },
      currentUserId,
    ),
  );

  const discoverDecorated = discoverGroups.map((group) =>
    normalizeCommunityGroup(
      {
        ...group,
        currentUserJoinedGroupIds: joinedGroupIds,
      },
      currentUserId,
    ),
  );

  return {
    joinedGroups: joinedDecorated.filter(Boolean),
    discoverGroups: discoverDecorated.filter(Boolean),
    joinedGroupIds,
  };
}

export async function listCommunityGroupsForUser(
  userId,
  { page = 1, limit = 24, search = "", scope = "" } = {},
) {
  const currentUserId = String(userId || "");
  const user = currentUserId
    ? await User.findById(currentUserId).select("communityJoinedGroupIds").lean()
    : null;
  const joinedGroupIds = Array.isArray(user?.communityJoinedGroupIds)
    ? user.communityJoinedGroupIds.map((value) => String(value || ""))
    : [];
  const joinedObjectIds = joinedGroupIds
    .filter((value) => mongoose.Types.ObjectId.isValid(value))
    .map((value) => new mongoose.Types.ObjectId(value));

  const query = {};
  const searchValue = String(search || "").trim();
  if (searchValue) {
    const regex = new RegExp(searchValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$or = [{ name: regex }, { description: regex }, { topic: regex }];
  }

  if (scope === "joined") {
    if (joinedObjectIds.length === 0) {
      return {
        groups: [],
        total: 0,
        pagination: {
          page: 1,
          limit: Math.max(1, Math.min(100, Number(limit) || 24)),
          total: 0,
          pages: 1,
        },
      };
    }
    query._id = { $in: joinedObjectIds };
  } else if (scope === "discover" && joinedObjectIds.length > 0) {
    query._id = { $nin: joinedObjectIds };
  }

  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 24));
  const total = await CommunityGroup.countDocuments(query);
  const pages = Math.max(1, Math.ceil(total / safeLimit));
  const safePage = Math.min(Math.max(1, Number(page) || 1), pages);
  const skip = (safePage - 1) * safeLimit;

  const groups = await CommunityGroup.find(query)
    .populate("creatorId", "fullName avatar")
    .sort({ memberCount: -1, createdAt: -1 })
    .skip(skip)
    .limit(safeLimit)
    .lean();

  return {
    groups: groups
      .map((group) =>
        normalizeCommunityGroup(
          {
            ...group,
            currentUserJoinedGroupIds: joinedGroupIds,
          },
          currentUserId,
        ),
      )
      .filter(Boolean),
    total,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages,
    },
  };
}

export async function buildCommunityGroupDetail(identifier, userId) {
  const currentUserId = String(userId || "");
  const [group, user] = await Promise.all([
    findCommunityGroupByIdentifier(identifier)
      .populate("creatorId", "fullName avatar")
      .lean(),
    currentUserId
      ? User.findById(currentUserId).select("communityJoinedGroupIds").lean()
      : Promise.resolve(null),
  ]);

  if (!group) return null;
  const joinedGroupIds = Array.isArray(user?.communityJoinedGroupIds)
    ? user.communityJoinedGroupIds.map((value) => String(value || ""))
    : [];

  const approvedPostCount = await CommunityPost.countDocuments({
    status: "approved",
    groupId: group._id,
  });

  return {
    ...normalizeCommunityGroup(
      {
        ...group,
        currentUserJoinedGroupIds: joinedGroupIds,
      },
      currentUserId,
    ),
    approvedPostCount,
  };
}

async function syncCommunityGroupMemberCount(groupId) {
  const groupObjectId = new mongoose.Types.ObjectId(String(groupId));
  const memberCount = await User.countDocuments({
    communityJoinedGroupIds: groupObjectId,
  });

  await CommunityGroup.updateOne(
    { _id: groupObjectId },
    { $set: { memberCount } },
  );

  return Number(memberCount || 0);
}

export async function addUserToCommunityGroup(groupId, userId) {
  const groupObjectId = new mongoose.Types.ObjectId(String(groupId));
  const userObjectId = new mongoose.Types.ObjectId(String(userId));
  const [groupExists, userExists] = await Promise.all([
    CommunityGroup.exists({ _id: groupObjectId }),
    User.exists({ _id: userObjectId }),
  ]);

  if (!groupExists) {
    return { ok: false, code: "group_not_found" };
  }
  if (!userExists) {
    return { ok: false, code: "user_not_found" };
  }

  const updateResult = await User.updateOne(
    {
      _id: userObjectId,
      communityJoinedGroupIds: { $ne: groupObjectId },
    },
    {
      $addToSet: { communityJoinedGroupIds: groupObjectId },
    },
  );

  const memberCount = await syncCommunityGroupMemberCount(groupObjectId);
  return {
    ok: true,
    joined: Number(updateResult.modifiedCount || 0) > 0,
    memberCount,
  };
}

export async function removeUserFromCommunityGroup(groupId, userId) {
  const groupObjectId = new mongoose.Types.ObjectId(String(groupId));
  const userObjectId = new mongoose.Types.ObjectId(String(userId));
  const [groupExists, userExists] = await Promise.all([
    CommunityGroup.exists({ _id: groupObjectId }),
    User.exists({ _id: userObjectId }),
  ]);

  if (!groupExists) {
    return { ok: false, code: "group_not_found" };
  }
  if (!userExists) {
    return { ok: false, code: "user_not_found" };
  }

  const updateResult = await User.updateOne(
    {
      _id: userObjectId,
      communityJoinedGroupIds: groupObjectId,
    },
    {
      $pull: { communityJoinedGroupIds: groupObjectId },
    },
  );

  const memberCount = await syncCommunityGroupMemberCount(groupObjectId);
  return {
    ok: true,
    left: Number(updateResult.modifiedCount || 0) > 0,
    memberCount,
  };
}
