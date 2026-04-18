import mongoose from "mongoose";

const STATUS_VALUES = [
  "unseen",
  "seen",
  "solved",
  "failed",
  "review_due",
  "mastered",
  "archived",
];

const MODE_VALUES = ["rated", "review", "random", "daily", "library"];

const UserPuzzleStateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    puzzleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Puzzle",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: STATUS_VALUES,
      default: "unseen",
      index: true,
    },
    seenCount: { type: Number, default: 0, min: 0 },
    solveCount: { type: Number, default: 0, min: 0 },
    failCount: { type: Number, default: 0, min: 0 },
    hintCount: { type: Number, default: 0, min: 0 },
    solutionShownCount: { type: Number, default: 0, min: 0 },
    ratedAttemptCount: { type: Number, default: 0, min: 0 },
    reviewEnabled: { type: Boolean, default: false, index: true },
    reviewStage: { type: Number, default: 0, min: 0 },
    lastSeenAt: { type: Date, default: null },
    firstSolvedAt: { type: Date, default: null },
    lastSolvedAt: { type: Date, default: null },
    nextReviewAt: { type: Date, default: null, index: true },
    masteredAt: { type: Date, default: null },
    isBookmarked: { type: Boolean, default: false, index: true },
    isHidden: { type: Boolean, default: false, index: true },
    lastModePlayed: {
      type: String,
      enum: MODE_VALUES,
      default: "rated",
    },
  },
  { timestamps: true },
);

UserPuzzleStateSchema.index({ userId: 1, puzzleId: 1 }, { unique: true });
UserPuzzleStateSchema.index({ userId: 1, status: 1, nextReviewAt: 1 });

const UserPuzzleState =
  mongoose.models.UserPuzzleState ||
  mongoose.model("UserPuzzleState", UserPuzzleStateSchema);

export default UserPuzzleState;

