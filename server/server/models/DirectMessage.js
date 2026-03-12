import mongoose from "mongoose";

const DirectMessageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    toUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true, trim: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

DirectMessageSchema.index({ conversationId: 1, createdAt: -1 });

export default mongoose.model("DirectMessage", DirectMessageSchema);
