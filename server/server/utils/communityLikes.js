import mongoose from "mongoose";
import { CommunityPost, CommunityPostLike } from "../models/index.js";

export const COMMUNITY_TRENDING_LIMIT = 3;

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

export async function getCommunityLikedPostIdSet(postIds, userId) {
  if (!isValidObjectId(userId) || !Array.isArray(postIds) || postIds.length === 0) {
    return new Set();
  }

  const normalizedIds = [...new Set(
    postIds
      .map((value) => String(value || "").trim())
      .filter((value) => isValidObjectId(value)),
  )].map((value) => new mongoose.Types.ObjectId(value));

  if (normalizedIds.length === 0) {
    return new Set();
  }

  const likes = await CommunityPostLike.find({
    userId: new mongoose.Types.ObjectId(String(userId)),
    postId: { $in: normalizedIds },
  })
    .select("postId")
    .lean();

  return new Set(likes.map((item) => String(item.postId)));
}

export async function createCommunityPostLike(postId, userId) {
  if (!isValidObjectId(postId) || !isValidObjectId(userId)) {
    return { ok: false, code: "invalid_request" };
  }

  const post = await CommunityPost.findOne({
    _id: postId,
    status: "approved",
  })
    .select("_id authorId likeCount")
    .lean();

  if (!post?._id) {
    return { ok: false, code: "not_found" };
  }

  if (String(post.authorId || "") === String(userId)) {
    return {
      ok: false,
      code: "self_like_blocked",
      likeCount: Number(post.likeCount || 0),
      likedByMe: false,
    };
  }

  try {
    await CommunityPostLike.create({
      postId: post._id,
      userId: new mongoose.Types.ObjectId(String(userId)),
    });
  } catch (err) {
    if (err?.code === 11000) {
      return {
        ok: true,
        created: false,
        likeCount: Number(post.likeCount || 0),
        likedByMe: true,
      };
    }
    throw err;
  }

  const updated = await CommunityPost.findByIdAndUpdate(
    post._id,
    { $inc: { likeCount: 1 } },
    { new: true },
  )
    .select("likeCount")
    .lean();

  return {
    ok: true,
    created: true,
    likeCount: Number(updated?.likeCount || post.likeCount || 0),
    likedByMe: true,
  };
}

export async function removeCommunityPostLike(postId, userId) {
  if (!isValidObjectId(postId) || !isValidObjectId(userId)) {
    return { ok: false, code: "invalid_request" };
  }

  const removed = await CommunityPostLike.findOneAndDelete({
    postId: new mongoose.Types.ObjectId(String(postId)),
    userId: new mongoose.Types.ObjectId(String(userId)),
  })
    .select("_id")
    .lean();

  if (removed?._id) {
    const updated = await CommunityPost.findOneAndUpdate(
      { _id: postId, likeCount: { $gt: 0 } },
      { $inc: { likeCount: -1 } },
      { new: true },
    )
      .select("likeCount")
      .lean();

    return {
      ok: true,
      removed: true,
      likeCount: Number(updated?.likeCount || 0),
      likedByMe: false,
    };
  }

  const post = await CommunityPost.findById(postId).select("likeCount").lean();
  if (!post?._id) {
    return { ok: false, code: "not_found" };
  }
  return {
    ok: true,
    removed: false,
    likeCount: Number(post?.likeCount || 0),
    likedByMe: false,
  };
}

export async function deleteCommunityPostLikes(postId) {
  if (!isValidObjectId(postId)) return;
  await CommunityPostLike.deleteMany({
    postId: new mongoose.Types.ObjectId(String(postId)),
  });
}

export async function listTrendingCommunityPosts(limit = COMMUNITY_TRENDING_LIMIT) {
  const safeLimit = Math.min(10, Math.max(1, Number(limit) || COMMUNITY_TRENDING_LIMIT));
  const topLiked = await CommunityPost.findOne({ status: "approved" })
    .select("likeCount")
    .sort({ likeCount: -1, createdAt: -1, _id: -1 })
    .lean();

  if (!topLiked?._id) {
    return { items: [], mode: "latest" };
  }

  const useLikeRanking = Number(topLiked.likeCount || 0) > 0;
  const sort = useLikeRanking
    ? { likeCount: -1, createdAt: -1, _id: -1 }
    : { createdAt: -1, _id: -1 };

  const items = await CommunityPost.find({ status: "approved" })
    .sort(sort)
    .limit(safeLimit)
    .lean();

  return {
    items,
    mode: useLikeRanking ? "likes" : "latest",
  };
}
