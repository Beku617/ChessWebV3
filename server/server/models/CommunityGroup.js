import mongoose from "mongoose";

const CommunityGroupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
    },
    normalizedName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 320,
    },
    topic: {
      type: String,
      default: "",
      trim: true,
      maxlength: 40,
    },
    visibility: {
      type: String,
      enum: ["public"],
      default: "public",
      index: true,
    },
    avatarUrl: {
      type: String,
      default: "",
      trim: true,
    },
    coverUrl: {
      type: String,
      default: "",
      trim: true,
    },
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    creatorDisplayName: {
      type: String,
      default: "",
      trim: true,
      maxlength: 80,
    },
    creatorAvatar: {
      type: String,
      default: "",
      trim: true,
    },
    memberCount: {
      type: Number,
      default: 1,
      min: 0,
      index: true,
    },
    lastPostAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

CommunityGroupSchema.index({ createdAt: -1 });
CommunityGroupSchema.index({ memberCount: -1, createdAt: -1 });
CommunityGroupSchema.index({ topic: 1, memberCount: -1 });

const CommunityGroup =
  mongoose.models.CommunityGroup ||
  mongoose.model("CommunityGroup", CommunityGroupSchema);

export default CommunityGroup;
