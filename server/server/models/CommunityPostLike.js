import mongoose from "mongoose";

const CommunityPostLikeSchema = new mongoose.Schema(
  {
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CommunityPost",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

CommunityPostLikeSchema.index({ postId: 1, userId: 1 }, { unique: true });
CommunityPostLikeSchema.index({ userId: 1, createdAt: -1 });

const CommunityPostLike =
  mongoose.models.CommunityPostLike ||
  mongoose.model("CommunityPostLike", CommunityPostLikeSchema);

export default CommunityPostLike;
