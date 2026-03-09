import mongoose from "mongoose";

const CommunityPostSchema = new mongoose.Schema(
  {
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    text: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1200,
    },
    mediaType: {
      type: String,
      enum: ["none", "image", "video"],
      default: "none",
      index: true,
    },
    mediaUrl: {
      type: String,
      default: "",
      trim: true,
    },
    mediaMimeType: {
      type: String,
      default: "",
      trim: true,
    },
    mediaOriginalName: {
      type: String,
      default: "",
      trim: true,
    },
    mediaSize: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "removed"],
      default: "pending",
      index: true,
    },
    submissionFingerprint: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
      index: true,
    },
    rejectionReason: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300,
    },
  },
  { timestamps: true },
);

CommunityPostSchema.index({ status: 1, approvedAt: -1, createdAt: -1 });
CommunityPostSchema.index({ authorId: 1, createdAt: -1 });

const CommunityPost =
  mongoose.models.CommunityPost ||
  mongoose.model("CommunityPost", CommunityPostSchema);

export default CommunityPost;
