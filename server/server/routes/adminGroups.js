import mongoose from "mongoose";
import { Router } from "express";
import { adminAuthMiddleware } from "../middleware/index.js";
import { CommunityGroup, CommunityPost, User } from "../models/index.js";
import {
  buildCommunityGroupDetail,
  buildUniqueCommunityGroupSlug,
  ensureUniqueCommunityGroupName,
  normalizeCommunityGroup,
  normalizeCommunityGroupName,
  validateCommunityGroupInput,
} from "../utils/communityGroups.js";

const router = Router();

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
}

router.get("/", adminAuthMiddleware, async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const requestedPage = Math.max(1, parsePositiveInt(req.query.page, 1));
    const limit = Math.min(24, Math.max(1, parsePositiveInt(req.query.limit, 8)));
    const query = {};

    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [{ name: regex }, { description: regex }, { topic: regex }, { slug: regex }];
    }

    const total = await CommunityGroup.countDocuments(query);
    const pages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(requestedPage, pages);
    const skip = (page - 1) * limit;

    const groups = await CommunityGroup.find(query)
      .populate("creatorId", "fullName avatar")
      .sort({ memberCount: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const postCounts = await CommunityPost.aggregate([
      {
        $match: {
          groupId: { $in: groups.map((group) => group._id) },
        },
      },
      {
        $group: {
          _id: "$groupId",
          totalPostCount: { $sum: 1 },
          approvedPostCount: {
            $sum: {
              $cond: [{ $eq: ["$status", "approved"] }, 1, 0],
            },
          },
        },
      },
    ]);

    const countMap = new Map(
      postCounts.map((row) => [
        String(row._id),
        {
          totalPostCount: Number(row.totalPostCount || 0),
          approvedPostCount: Number(row.approvedPostCount || 0),
        },
      ]),
    );

    res.json({
      groups: groups.map((group) => ({
        ...normalizeCommunityGroup(group),
        totalPostCount: countMap.get(String(group._id))?.totalPostCount || 0,
        approvedPostCount: countMap.get(String(group._id))?.approvedPostCount || 0,
      })),
      total,
      pagination: {
        page,
        limit,
        total,
        pages,
      },
    });
  } catch (err) {
    console.error("Admin groups list error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/", adminAuthMiddleware, async (req, res) => {
  try {
    const validationError = validateCommunityGroupInput(req.body || {});
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const name = normalizeCommunityGroupName(req.body?.name);
    const description = String(req.body?.description || "").trim();
    const topic = String(req.body?.topic || "").trim();
    const uniqueName = await ensureUniqueCommunityGroupName(name);
    if (!uniqueName) {
      return res.status(409).json({ error: "A group with this name already exists." });
    }

    const creatorUser = await User.findOne({ email: req.admin.email })
      .select("_id fullName avatar")
      .lean();

    const slug = await buildUniqueCommunityGroupSlug(name);
    const group = await CommunityGroup.create({
      name,
      normalizedName: name.toLowerCase(),
      slug,
      description,
      topic,
      creatorId: creatorUser?._id || null,
      creatorDisplayName: creatorUser?.fullName || req.admin.username || "Admin Staff",
      creatorAvatar: creatorUser?.avatar || "",
      memberCount: 1,
    });

    if (creatorUser?._id) {
      await User.updateOne(
        { _id: creatorUser._id },
        { $addToSet: { communityJoinedGroupIds: group._id } },
      );
    }

    const created = await CommunityGroup.findById(group._id)
      .populate("creatorId", "fullName avatar")
      .lean();

    res.status(201).json({
      message: "Group created.",
      group: {
        ...normalizeCommunityGroup(created),
        totalPostCount: 0,
        approvedPostCount: 0,
      },
    });
  } catch (err) {
    console.error("Admin create group error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/:groupId", adminAuthMiddleware, async (req, res) => {
  try {
    const groupId = String(req.params.groupId || "");
    if (!isValidObjectId(groupId)) {
      return res.status(400).json({ error: "Invalid group id." });
    }

    const existing = await CommunityGroup.findById(groupId).lean();
    if (!existing) {
      return res.status(404).json({ error: "Group not found." });
    }

    const nextName =
      req.body?.name !== undefined
        ? normalizeCommunityGroupName(req.body.name)
        : existing.name;
    const nextDescription =
      req.body?.description !== undefined
        ? String(req.body.description || "").trim()
        : existing.description || "";
    const nextTopic =
      req.body?.topic !== undefined
        ? String(req.body.topic || "").trim()
        : existing.topic || "";

    const validationError = validateCommunityGroupInput({
      name: nextName,
      description: nextDescription,
      topic: nextTopic,
    });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const uniqueName = await ensureUniqueCommunityGroupName(nextName, groupId);
    if (!uniqueName) {
      return res.status(409).json({ error: "A group with this name already exists." });
    }

    const update = {
      name: nextName,
      normalizedName: nextName.toLowerCase(),
      description: nextDescription,
      topic: nextTopic,
    };

    if (nextName !== existing.name) {
      update.slug = await buildUniqueCommunityGroupSlug(nextName, groupId);
    }

    const group = await CommunityGroup.findByIdAndUpdate(
      groupId,
      { $set: update },
      { new: true },
    )
      .populate("creatorId", "fullName avatar")
      .lean();

    const detail = await buildCommunityGroupDetail(group.slug || groupId, "");

    res.json({
      message: "Group updated.",
      group: detail,
    });
  } catch (err) {
    console.error("Admin update group error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/:groupId", adminAuthMiddleware, async (req, res) => {
  try {
    const groupId = String(req.params.groupId || "");
    if (!isValidObjectId(groupId)) {
      return res.status(400).json({ error: "Invalid group id." });
    }

    const group = await CommunityGroup.findByIdAndDelete(groupId).lean();
    if (!group) {
      return res.status(404).json({ error: "Group not found." });
    }

    await Promise.all([
      User.updateMany(
        { communityJoinedGroupIds: group._id },
        { $pull: { communityJoinedGroupIds: group._id } },
      ),
      CommunityPost.updateMany(
        { groupId: group._id },
        { $set: { groupId: null } },
      ),
    ]);

    res.json({
      success: true,
      message: "Group deleted. Existing posts were returned to the general community feed.",
    });
  } catch (err) {
    console.error("Admin delete group error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
