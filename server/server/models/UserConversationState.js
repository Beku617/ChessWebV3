import mongoose from "mongoose";

const UserConversationStateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    // When a user deletes/clears a conversation, we keep the boundary timestamp
    // here so future messages after this moment are shown, but history before
    // it stays hidden for that user.
    clearedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

UserConversationStateSchema.index({ userId: 1, partnerId: 1 }, { unique: true });
UserConversationStateSchema.index({ userId: 1, archivedAt: 1 });
UserConversationStateSchema.index({ userId: 1, deletedAt: 1 });
UserConversationStateSchema.index({ userId: 1, clearedAt: 1 });

const UserConversationState =
  mongoose.models.UserConversationState ||
  mongoose.model("UserConversationState", UserConversationStateSchema);

export default UserConversationState;
