import mongoose from "mongoose";

const DAILY_GOAL_VALUES = [5, 10, 15];

const UserPuzzleStatsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    puzzleRating: { type: Number, default: 1200 },
    puzzleXP: { type: Number, default: 0, min: 0 },
    currentStreak: { type: Number, default: 0, min: 0 },
    longestStreak: { type: Number, default: 0, min: 0 },
    dailyGoal: { type: Number, enum: DAILY_GOAL_VALUES, default: 10 },
    graceTokens: { type: Number, default: 1, min: 0 },
    graceTokenMonthKey: { type: String, default: "" },
    lastPracticeDate: { type: String, default: "" },
    solvedToday: { type: Number, default: 0, min: 0 },
    solvedTodayDate: { type: String, default: "" },
    reviewDueCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

const UserPuzzleStats =
  mongoose.models.UserPuzzleStats ||
  mongoose.model("UserPuzzleStats", UserPuzzleStatsSchema);

export default UserPuzzleStats;
