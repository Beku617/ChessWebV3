import mongoose from "mongoose";

const FriendRequestSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "denied", "ignored", "canceled"],
      default: "pending",
      index: true,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
    canceledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

// Only one active pending request between the same two users (directional)
FriendRequestSchema.index(
  { senderId: 1, receiverId: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } },
);

FriendRequestSchema.index({ receiverId: 1, status: 1, createdAt: -1 });
FriendRequestSchema.index({ senderId: 1, status: 1, createdAt: -1 });
FriendRequestSchema.index({ senderId: 1, receiverId: 1, status: 1 });

const FriendRequest =
  mongoose.models.FriendRequest ||
  mongoose.model("FriendRequest", FriendRequestSchema);

export default FriendRequest;
