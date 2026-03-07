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

// Drop legacy index that used old field names (`from`, `to`) to prevent
// duplicate-key errors when updating requests created with the new schema.
async function dropLegacyFromToIndex() {
  try {
    const collection = FriendRequest.collection;
    if (!collection) return;

    const indexes = await collection.indexes();
    const legacy = indexes.find((idx) => idx.name === "from_1_to_1_status_1");
    if (legacy) {
      await collection.dropIndex("from_1_to_1_status_1");
      console.log("Dropped legacy friendrequests index from_1_to_1_status_1");
    }
  } catch (error) {
    // Ignore missing-index errors; surface others for visibility.
    if (error?.code !== 27 && error?.codeName !== "IndexNotFound") {
      console.error("Failed to drop legacy friendrequests index:", error);
    }
  }
}

if (mongoose.connection.readyState === 1) {
  void dropLegacyFromToIndex();
} else {
  mongoose.connection.once("open", () => {
    void dropLegacyFromToIndex();
  });
}

export default FriendRequest;
