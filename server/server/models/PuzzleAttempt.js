import mongoose from "mongoose";

const RESULT_VALUES = ["SOLVED", "FAILED", "SKIPPED"];

const PuzzleAttemptSchema = new mongoose.Schema(
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
    result: {
      type: String,
      enum: RESULT_VALUES,
      required: true,
    },
    movesPlayed: {
      type: [String],
      default: [],
    },
    timeMs: {
      type: Number,
      default: 0,
      min: 0,
    },
    usedHint: {
      type: Boolean,
      default: false,
    },
    score: {
      type: Number,
      default: 0,
    },
    expectedScore: {
      type: Number,
      default: 0,
    },
    kUser: {
      type: Number,
      default: 20,
    },
    kPuzzle: {
      type: Number,
      default: 10,
    },
    userRatingBefore: {
      type: Number,
      required: true,
    },
    userRatingAfter: {
      type: Number,
      required: true,
    },
    puzzleRatingBefore: {
      type: Number,
      required: true,
    },
    puzzleRatingAfter: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

PuzzleAttemptSchema.index({ userId: 1, createdAt: -1 });
PuzzleAttemptSchema.index({ userId: 1, puzzleId: 1, createdAt: -1 });

const PuzzleAttempt =
  mongoose.models.PuzzleAttempt ||
  mongoose.model("PuzzleAttempt", PuzzleAttemptSchema);

export default PuzzleAttempt;
