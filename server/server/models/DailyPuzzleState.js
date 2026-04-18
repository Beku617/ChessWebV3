import mongoose from "mongoose";

const DailyPuzzleStateSchema = new mongoose.Schema(
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
    dateKey: {
      type: String,
      required: true,
      index: true,
    },
    solved: { type: Boolean, default: false },
    solvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

DailyPuzzleStateSchema.index({ userId: 1, dateKey: 1 }, { unique: true });

const DailyPuzzleState =
  mongoose.models.DailyPuzzleState ||
  mongoose.model("DailyPuzzleState", DailyPuzzleStateSchema);

export default DailyPuzzleState;
