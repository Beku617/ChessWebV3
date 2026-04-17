import mongoose from "mongoose";

const CommunityGameSnapshotSchema = new mongoose.Schema(
  {
    sourceGameId: {
      type: String,
      default: "",
      trim: true,
    },
    variant: {
      type: String,
      enum: ["standard", "chess960", "threeCheck"],
      default: "standard",
    },
    startingFen: {
      type: String,
      default: "",
      trim: true,
    },
    currentPosition: {
      type: String,
      default: "",
      trim: true,
    },
    moves: {
      type: [String],
      default: [],
    },
    result: {
      type: String,
      default: "*",
      trim: true,
    },
    timeControl: {
      type: String,
      default: "",
      trim: true,
    },
    eco: {
      type: String,
      default: "",
      trim: true,
    },
    event: {
      type: String,
      default: "NeonGambit Game",
      trim: true,
    },
    white: {
      type: String,
      default: "White",
      trim: true,
    },
    black: {
      type: String,
      default: "Black",
      trim: true,
    },
    whiteElo: {
      type: Number,
      default: 1200,
    },
    blackElo: {
      type: Number,
      default: 1200,
    },
    playAs: {
      type: String,
      enum: ["white", "black"],
      default: "white",
    },
    opponent: {
      type: String,
      default: "Opponent",
      trim: true,
    },
    rated: {
      type: Boolean,
      default: false,
    },
    totalMoves: {
      type: Number,
      default: 0,
    },
    playedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

const CommunityMediaItemSchema = new mongoose.Schema(
  {
    assetId: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["image", "video"],
      default: "image",
    },
    url: {
      type: String,
      default: "",
      trim: true,
    },
    mimeType: {
      type: String,
      default: "",
      trim: true,
    },
    originalName: {
      type: String,
      default: "",
      trim: true,
    },
    size: {
      type: Number,
      default: 0,
    },
  },
  { _id: false },
);

const CommunityPostSchema = new mongoose.Schema(
  {
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CommunityGroup",
      default: null,
      index: true,
    },
    postType: {
      type: String,
      enum: ["standard", "game"],
      default: "standard",
      index: true,
    },
    text: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1200,
    },
    mediaItems: {
      type: [CommunityMediaItemSchema],
      default: [],
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
    gameSnapshot: {
      type: CommunityGameSnapshotSchema,
      default: null,
    },
    likeCount: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
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
CommunityPostSchema.index({ status: 1, likeCount: -1, createdAt: -1 });
CommunityPostSchema.index({ authorId: 1, createdAt: -1 });
CommunityPostSchema.index({ postType: 1, status: 1, approvedAt: -1, createdAt: -1 });

const CommunityPost =
  mongoose.models.CommunityPost ||
  mongoose.model("CommunityPost", CommunityPostSchema);

export default CommunityPost;
