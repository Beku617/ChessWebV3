import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { buildPuzzle3Dataset } from "../../src/data/Puzzle3/buildPuzzleDataset.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

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
  mongoose.models.PuzzleImportServer ||
  mongoose.model("PuzzleImportServer", puzzleSchema, "puzzles");

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
    await mongoose.connect(process.env.MONGODB_URL);
    console.log("Connected to MongoDB");

    const allPuzzles = buildPuzzle3Dataset();
    const puzzles =
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

    console.log(`Prepared ${puzzles.length} normalized Puzzle3 records`);

    let imported = 0;
    let updated = 0;

    for (const puzzle of puzzles) {
      const fenKey = normalizeFenKey(puzzle.fen);
      const existing = existingByFenKey.get(fenKey);

      if (existing?._id) {
        await Puzzle.findByIdAndUpdate(existing._id, {
          ...puzzle,
          isActive: existing.isActive !== false,
          featured: existing.featured === true,
          timesPlayed: Number(existing.timesPlayed || 0),
          timesSolved: Number(existing.timesSolved || 0),
        });
        updated += 1;
        console.log(`[Updated ${updated}/${puzzles.length}] ${puzzle.title}`);
        continue;
      }

      const created = await new Puzzle(puzzle).save();
      existingByFenKey.set(fenKey, {
        _id: created._id,
        fen: created.fen,
        isActive: created.isActive,
        featured: created.featured,
        timesPlayed: created.timesPlayed,
        timesSolved: created.timesSolved,
      });
      imported += 1;
      console.log(`[Imported ${imported}/${puzzles.length}] ${puzzle.title}`);
    }

    console.log("");
    console.log(`Imported ${imported} puzzles`);
    console.log(`Updated existing: ${updated}`);

    await mongoose.connection.close();
    console.log("Disconnected from MongoDB");
  } catch (error) {
    console.error("Error importing puzzles:", error);
    process.exit(1);
  }
}

importPuzzles();
