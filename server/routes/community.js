import path from "path";
import mongoose from "mongoose";
import { Router } from "express";
import { authMiddleware } from "../middleware/index.js";
import { CommunityPost, User } from "../models/index.js";
import {
  COMMUNITY_DUPLICATE_WINDOW_MS,
  COMMUNITY_MAX_TEXT_LENGTH,
  buildCommunitySubmissionFingerprint,
  cleanupCommunityMedia,
  communityUploadsRoot,
  detectCommunityMediaType,
  toCommunityPostDTO,
  uploadCommunityMedia,
  validateCommunityMediaFile,
} from "../utils/communityPosts.js";

const router = Router();

function parsePagination(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(20, Math.max(1, Number(query.limit) || 10));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

router.get("/", async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = { status: "approved" };

    const [items, total] = await Promise.all([
      CommunityPost.find(query)
        .populate("authorId", "fullName avatar rating")
        .sort({ approvedAt: -1, createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CommunityPost.countDocuments(query),
    ]);

    const posts = items
      .map(toCommunityPostDTO)
      .filter((post) => post?.author?.id);

    res.json({
      posts,
      total,
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    console.error("Community feed error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/mine", authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(10, Math.max(1, Number(req.query.limit) || 5));
    const authorObjectId = new mongoose.Types.ObjectId(String(req.user.userId));
    const [posts, author, counts] = await Promise.all([
      CommunityPost.find({ authorId: req.user.userId })
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .lean(),
      User.findById(req.user.userId).select("fullName avatar rating").lean(),
      CommunityPost.aggregate([
        { $match: { authorId: authorObjectId } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    const summary = { pending: 0, approved: 0, rejected: 0, removed: 0 };
    for (const item of counts) {
      if (item?._id && summary[item._id] !== undefined) {
        summary[item._id] = item.count;
      }
    }

    res.json({
      posts: posts.map((post) =>
        toCommunityPostDTO({
          ...post,
          authorId: {
            _id: req.user.userId,
            fullName: author?.fullName || req.user.fullName || "You",
            avatar: author?.avatar || "",
            rating: author?.rating || 1200,
          },
        }),
      ),
      summary,
    });
  } catch (err) {
    console.error("Community mine error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/", authMiddleware, uploadCommunityMedia, async (req, res) => {
  try {
    const text =
      typeof req.body?.text === "string"
        ? req.body.text.trim()
        : typeof req.body?.content === "string"
          ? req.body.content.trim()
          : "";
    const file = req.file || null;

    if (text.length > COMMUNITY_MAX_TEXT_LENGTH) {
      await cleanupCommunityMedia(file);
      return res.status(400).json({
        error: `Post text is too long (${COMMUNITY_MAX_TEXT_LENGTH} characters max).`,
      });
    }

    const fileError = validateCommunityMediaFile(file);
    if (fileError) {
      await cleanupCommunityMedia(file);
      return res.status(400).json({ error: fileError });
    }

    if (!text && !file) {
      return res
        .status(400)
        .json({ error: "Post must include text, an image, or a video." });
    }

    const submissionFingerprint = buildCommunitySubmissionFingerprint({
      authorId: req.user.userId,
      text,
      file,
    });

    const duplicate = await CommunityPost.findOne({
      authorId: req.user.userId,
      submissionFingerprint,
      createdAt: {
        $gte: new Date(Date.now() - COMMUNITY_DUPLICATE_WINDOW_MS),
      },
    })
      .select("_id status")
      .lean();

    if (duplicate) {
      await cleanupCommunityMedia(file);
      return res.status(409).json({
        error: "This post was already submitted a moment ago. Please wait.",
      });
    }

    const mediaType = detectCommunityMediaType(file);
    const post = await CommunityPost.create({
      authorId: req.user.userId,
      text,
      mediaType,
      mediaUrl: file ? `/uploads/community/${path.basename(file.filename)}` : "",
      mediaMimeType: file?.mimetype || "",
      mediaOriginalName: file?.originalname || "",
      mediaSize: Number(file?.size || 0),
      submissionFingerprint,
      status: "pending",
    });

    const created = await CommunityPost.findById(post._id)
      .populate("authorId", "fullName avatar rating")
      .lean();

    res.status(201).json({
      message: "Post submitted for admin review.",
      post: toCommunityPostDTO(created),
    });
  } catch (err) {
    console.error("Create community post error:", err);
    await cleanupCommunityMedia(req.file);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/:postId", authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(postId || ""))) {
      return res.status(400).json({ error: "Invalid post id." });
    }

    const post = await CommunityPost.findOneAndDelete({
      _id: postId,
      authorId: req.user.userId,
    }).lean();

    if (!post) {
      const exists = await CommunityPost.exists({ _id: postId });
      return res
        .status(exists ? 403 : 404)
        .json({ error: exists ? "You can only delete your own posts." : "Post not found." });
    }

    const filePath = post.mediaUrl
      ? path.join(communityUploadsRoot, path.basename(post.mediaUrl))
      : "";
    if (filePath) {
      await import("fs/promises").then((fs) =>
        fs.unlink(filePath).catch(() => null),
      );
    }

    res.json({ success: true, message: "Post deleted." });
  } catch (err) {
    console.error("Delete own community post error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
