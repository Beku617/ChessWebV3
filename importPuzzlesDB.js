import mongoose from "mongoose";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { buildPuzzle3Dataset } from "./src/data/Puzzle3/buildPuzzleDataset.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

const MONGODB_URL =
  process.env.MONGODB_URL || "mongodb://localhost:27017/neongambit";

const puzzleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    difficulty: {
      type: String,
      enum: ["Easy", "Medium", "Hard"],
      required: true,
    },
    category: { type: String, default: "mate" },
    description: { type: String, default: "" },
    fen: { type: String, required: true },
    solution: { type: [String], required: true },
    rating: { type: Number, default: 1200 },
    isActive: { type: Boolean, default: true },
    isWhiteToMove: { type: Boolean, required: true },
    mateIn: { type: Number, default: 2 },
    timesPlayed: { type: Number, default: 0 },
    timesSolved: { type: Number, default: 0 },
    featured: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const Puzzle =
  mongoose.models.PuzzleImportRoot ||
  mongoose.model("PuzzleImportRoot", puzzleSchema, "puzzles");

function normalizeFenKey(fen) {
  const parts = String(fen || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length < 2) {
    return String(fen || "").trim().toLowerCase();
  }

  return `${parts[0]} ${parts[1]}`.toLowerCase();
}

async function importPuzzles() {
  const limit = Number.parseInt(process.argv[2], 10);

  try {
    console.log(`Connecting to MongoDB: ${MONGODB_URL}`);
    await mongoose.connect(MONGODB_URL);

    const allPuzzles = buildPuzzle3Dataset();
    const puzzlesData =
      Number.isFinite(limit) && limit > 0 ? allPuzzles.slice(0, limit) : allPuzzles;

    const existingPuzzleDocs = await Puzzle.find(
      {},
      {
        fen: 1,
        isActive: 1,
        featured: 1,
        timesPlayed: 1,
        timesSolved: 1,
      },
    ).lean();
    const existingByFenKey = new Map(
      existingPuzzleDocs.map((puzzle) => [normalizeFenKey(puzzle.fen), puzzle]),
    );

    console.log(`Importing ${puzzlesData.length} normalized puzzles`);

    let imported = 0;
    let updated = 0;
    let failed = 0;

    for (const puzzle of puzzlesData) {
      const fenKey = normalizeFenKey(puzzle.fen);
      const existing = existingByFenKey.get(fenKey);

      try {
        if (existing?._id) {
          await Puzzle.findByIdAndUpdate(existing._id, {
            ...puzzle,
            isActive: existing.isActive !== false,
            featured: existing.featured === true,
            timesPlayed: Number(existing.timesPlayed || 0),
            timesSolved: Number(existing.timesSolved || 0),
          });
          updated += 1;
          console.log(`[Updated ${updated}/${puzzlesData.length}] ${puzzle.title}`);
          continue;
        }

        const newPuzzle = new Puzzle(puzzle);
        await newPuzzle.save();
        existingByFenKey.set(fenKey, {
          _id: newPuzzle._id,
          fen: newPuzzle.fen,
          isActive: newPuzzle.isActive,
          featured: newPuzzle.featured,
          timesPlayed: newPuzzle.timesPlayed,
          timesSolved: newPuzzle.timesSolved,
        });
        imported += 1;
        console.log(`[Imported ${imported}/${puzzlesData.length}] ${puzzle.title}`);
      } catch (error) {
        failed += 1;
        console.log(`[Failed ${failed}] ${puzzle.title} - ${error.message}`);
      }
    }

    const totalPuzzles = await Puzzle.countDocuments();

    console.log("");
    console.log("Import Summary");
    console.log(`Imported: ${imported}`);
    console.log(`Updated existing: ${updated}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total puzzles in database: ${totalPuzzles}`);

    await mongoose.disconnect();
  } catch (error) {
    console.error("Import failed:", error.message);
    process.exit(1);
  }
}

importPuzzles();
