import mongoose from "mongoose";

const RESULT_VALUES = ["SOLVED", "FAILED", "SKIPPED", "ABANDONED"];
const MODE_VALUES = ["rated", "review", "random", "daily", "library"];
const STATUS_VALUES = [
  "unseen",
  "seen",
  "solved",
  "failed",
  "review_due",
  "mastered",
  "archived",
];

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
    mode: {
      type: String,
      enum: MODE_VALUES,
      default: "rated",
      index: true,
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
    hintsUsed: {
      type: Number,
      default: 0,
      min: 0,
      max: 2,
    },
    solutionShown: {
      type: Boolean,
      default: false,
    },
    xpAwarded: {
      type: Number,
      default: 0,
    },
    ratingChange: {
      type: Number,
      default: 0,
    },
    isRated: {
      type: Boolean,
      default: false,
    },
    isRepeat: {
      type: Boolean,
      default: false,
    },
    repeatDecayMultiplier: {
      type: Number,
      default: 1,
    },
    attemptIndex: {
      type: Number,
      default: 1,
      min: 1,
    },
    statusAfter: {
      type: String,
      enum: STATUS_VALUES,
      default: "seen",
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
PuzzleAttemptSchema.index({ userId: 1, mode: 1, createdAt: -1 });

const PuzzleAttempt =
  mongoose.models.PuzzleAttempt ||
  mongoose.model("PuzzleAttempt", PuzzleAttemptSchema);

export default PuzzleAttempt;

