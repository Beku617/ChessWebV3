import mongoose from "mongoose";

const FriendSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    friendId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

FriendSchema.index({ userId: 1, friendId: 1 }, { unique: true });

const Friend =
  mongoose.models.Friend || mongoose.model("Friend", FriendSchema);

export default Friend;
