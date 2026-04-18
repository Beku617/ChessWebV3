import mongoose from "mongoose";

const UserPuzzleMotifStatsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    motif: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    attempts: { type: Number, default: 0, min: 0 },
    solved: { type: Number, default: 0, min: 0 },
    failed: { type: Number, default: 0, min: 0 },
    hintsUsed: { type: Number, default: 0, min: 0 },
    averageTime: { type: Number, default: 0, min: 0 },
    accuracy: { type: Number, default: 0, min: 0, max: 100 },
  },
  { timestamps: true },
);

UserPuzzleMotifStatsSchema.index({ userId: 1, motif: 1 }, { unique: true });

const UserPuzzleMotifStats =
  mongoose.models.UserPuzzleMotifStats ||
  mongoose.model("UserPuzzleMotifStats", UserPuzzleMotifStatsSchema);

export default UserPuzzleMotifStats;
