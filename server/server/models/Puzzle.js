import mongoose from "mongoose";

const PuzzleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    difficulty: {
      type: String,
      enum: ["Easy", "Medium", "Hard"],
      required: true,
    },
    themes: { type: [String], default: [] },
    description: { type: String, default: "" },
    icon: { type: String, default: "🧩" },
    fen: { type: String, required: true },
    solution: { type: [String], required: true },
    rating: { type: Number, default: 1200 },
    isWhiteToMove: { type: Boolean, required: true },
    mateIn: { type: Number, default: 2 },
    timesPlayed: { type: Number, default: 0 },
    timesSolved: { type: Number, default: 0 },
    featured: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const Puzzle = mongoose.models.Puzzle || mongoose.model("Puzzle", PuzzleSchema);

export default Puzzle;
