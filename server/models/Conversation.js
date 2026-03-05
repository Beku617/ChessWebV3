import mongoose from "mongoose";

const ConversationSchema = new mongoose.Schema(
  {
    participants: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      required: true,
      validate: [(arr) => arr.length === 2, "Conversation must have 2 participants"],
    },
    // deterministic key "idA_idB" (sorted) for unique pairing
    participantsKey: { type: String, required: true, unique: true },
    lastMessage: { type: String, default: "" },
    lastSender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    lastMessageAt: { type: Date, default: Date.now },
    unreadCounts: {
      // keyed by userId string; keeps unread counts per participant
      type: Map,
      of: Number,
      default: {},
    },
  },
  { timestamps: true },
);

function buildKey(participants) {
  return participants
    .map((p) => p.toString())
    .sort()
    .join("_");
}

ConversationSchema.pre("validate", function (next) {
  if (Array.isArray(this.participants) && this.participants.length === 2) {
    this.participantsKey = buildKey(this.participants);
  }
  next();
});

ConversationSchema.index({ participantsKey: 1 }, { unique: true });
ConversationSchema.index({ lastMessageAt: -1 });

export { buildKey };
export default mongoose.model("Conversation", ConversationSchema);
