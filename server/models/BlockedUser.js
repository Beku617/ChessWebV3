import mongoose from "mongoose";

const BlockedUserSchema = new mongoose.Schema(
  {
    blocker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    blocked: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

BlockedUserSchema.index({ blocker: 1, blocked: 1 }, { unique: true });
BlockedUserSchema.index({ blocked: 1, blocker: 1 });

const BlockedUser =
  mongoose.models.BlockedUser || mongoose.model("BlockedUser", BlockedUserSchema);

export default BlockedUser;
