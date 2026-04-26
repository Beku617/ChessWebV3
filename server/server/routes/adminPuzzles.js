import { Router } from "express";
import { Chess } from "chess.js";
import {
  Puzzle,
  PuzzleAttempt,
  UserPuzzleState,
} from "../models/index.js";
import { adminAuthMiddleware } from "../middleware/index.js";

const router = Router();
const VALID_DIFFICULTIES = new Set(["Easy", "Medium", "Hard"]);
const UCI_MOVE_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/i;

function resolveIsWhiteToMove(fen, fallback = true) {
  const side = String(fen || "")
    .trim()
    .split(/\s+/)[1];
  if (side === "w") return true;
  if (side === "b") return false;
  return fallback;
}

function normalizeFenKey(fen) {
  const parts = String(fen || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length < 2) return String(fen || "").trim().toLowerCase();
  return `${parts[0]} ${parts[1]}`.toLowerCase();
}

function safeArray(values) {
  const source = Array.isArray(values)
    ? values
    : typeof values === "string"
      ? values.split(/[\n,]+/)
      : [];
  return source.map((entry) => String(entry || "").trim()).filter(Boolean);
}

function parseBoolean(value) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
}

function serializePuzzle(puzzle) {
  const base =
    puzzle && typeof puzzle.toObject === "function" ? puzzle.toObject() : puzzle || {};

  return {
    _id: base._id,
    title: base.title,
    difficulty: base.difficulty,
    category: base.category,
    description: base.description,
    fen: base.fen,
    solution: base.solution,
    rating: base.rating,
    isActive: base.isActive !== false,
    isWhiteToMove: base.isWhiteToMove,
    mateIn: base.mateIn,
    timesPlayed: Number(base.timesPlayed || 0),
    timesSolved: Number(base.timesSolved || 0),
    featured: base.featured === true,
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
  };
}

function parseFiniteNumber(value, fallback, { min, max, integer = false } = {}) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const normalized = integer ? Math.trunc(parsed) : parsed;
  if (min !== undefined && normalized < min) return null;
  if (max !== undefined && normalized > max) return null;
  return normalized;
}

function parseBooleanWithDefault(value, fallback) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function applyPuzzleMove(game, rawMove) {
  const move = String(rawMove || "").trim();
  if (!move) return null;
  if (UCI_MOVE_PATTERN.test(move)) {
    const normalized = move.toLowerCase();
    return game.move({
      from: normalized.slice(0, 2),
      to: normalized.slice(2, 4),
      promotion: normalized[4] || undefined,
    });
  }
  return game.move(move, { sloppy: true });
}

function validateSolutionAgainstFen(fen, solution) {
  let game;
  try {
    game = new Chess(fen);
  } catch {
    return "FEN position is invalid.";
  }

  for (const move of solution) {
    const applied = applyPuzzleMove(game, move);
    if (!applied) {
      return `Solution move "${move}" is not legal for the current position.`;
    }
  }
  return "";
}

function normalizePuzzlePayload(payload = {}) {
  const title = String(payload.title || "").trim();
  if (!title) return { error: "Puzzle title is required." };
  if (title.length > 160) {
    return { error: "Puzzle title is too long (160 characters max)." };
  }

  const difficulty = String(payload.difficulty || "").trim();
  if (!VALID_DIFFICULTIES.has(difficulty)) {
    return { error: "Difficulty must be Easy, Medium, or Hard." };
  }

  const fen = String(payload.fen || "").trim();
  if (!fen) return { error: "FEN position is required." };

  let chess;
  try {
    chess = new Chess(fen);
  } catch {
    return { error: "FEN position is invalid." };
  }

  const solution = safeArray(payload.solution);
  if (solution.length === 0) {
    return { error: "At least one solution move is required." };
  }

  const solutionError = validateSolutionAgainstFen(fen, solution);
  if (solutionError) {
    return { error: solutionError };
  }

  const rating = parseFiniteNumber(payload.rating, 1200, {
    min: 100,
    max: 4000,
    integer: true,
  });
  if (rating === null) {
    return { error: "Rating must be a number between 100 and 4000." };
  }

  const mateIn = parseFiniteNumber(payload.mateIn, 2, {
    min: 1,
    max: 20,
    integer: true,
  });
  if (mateIn === null) {
    return { error: "Move number must be between 1 and 20." };
  }

  const category = String(payload.category || "tactics").trim() || "tactics";
  if (category.length > 80) {
    return { error: "Category is too long (80 characters max)." };
  }

  const description = String(payload.description || "").trim();
  if (description.length > 1000) {
    return { error: "Description is too long (1000 characters max)." };
  }

  return {
    data: {
      title,
      difficulty,
      category,
      description,
      fen,
      solution,
      rating,
      isActive: parseBooleanWithDefault(payload.isActive, true),
      isWhiteToMove: resolveIsWhiteToMove(fen, chess.turn() === "w"),
      mateIn,
    },
  };
}

async function aggregatePuzzleQuality(puzzleIds) {
  if (!Array.isArray(puzzleIds) || puzzleIds.length === 0) {
    return { qualityById: new Map(), masteredById: new Map() };
  }

  const [attemptAgg, masteredAgg] = await Promise.all([
    PuzzleAttempt.aggregate([
      { $match: { puzzleId: { $in: puzzleIds } } },
      {
        $group: {
          _id: "$puzzleId",
          attempts: { $sum: 1 },
          solved: {
            $sum: { $cond: [{ $eq: ["$result", "SOLVED"] }, 1, 0] },
          },
          failed: {
            $sum: { $cond: [{ $eq: ["$result", "FAILED"] }, 1, 0] },
          },
          avgTimeMs: { $avg: "$timeMs" },
        },
      },
    ]),
    UserPuzzleState.aggregate([
      {
        $match: {
          puzzleId: { $in: puzzleIds },
          status: "mastered",
        },
      },
      {
        $group: {
          _id: "$puzzleId",
          masteredUsers: { $sum: 1 },
        },
      },
    ]),
  ]);

  const qualityById = new Map();
  for (const row of attemptAgg) {
    const attempts = Number(row.attempts || 0);
    const solved = Number(row.solved || 0);
    const failed = Number(row.failed || 0);
    qualityById.set(String(row._id), {
      attempts,
      solved,
      failed,
      solveRate: attempts > 0 ? Number(((solved / attempts) * 100).toFixed(1)) : 0,
      failRate: attempts > 0 ? Number(((failed / attempts) * 100).toFixed(1)) : 0,
      avgTimeMs: Math.round(Number(row.avgTimeMs || 0)),
    });
  }

  const masteredById = new Map();
  for (const row of masteredAgg) {
    masteredById.set(String(row._id), Number(row.masteredUsers || 0));
  }

  return { qualityById, masteredById };
}

function mapPuzzle(puzzle, qualityById, masteredById, duplicateCounts) {
  const base = serializePuzzle(puzzle);
  const quality = qualityById.get(String(puzzle._id)) || {
    attempts: 0,
    solved: 0,
    failed: 0,
    solveRate: 0,
    failRate: 0,
    avgTimeMs: 0,
  };
  const fenKey = normalizeFenKey(puzzle.fen);
  const duplicateCount = Number(duplicateCounts.get(fenKey) || 1);
  const masteredUsers = Number(masteredById.get(String(puzzle._id)) || 0);

  return {
    ...base,
    duplicateCount,
    duplicateFenKey: fenKey,
    quality: {
      ...quality,
      masteredUsers,
    },
  };
}

// Get all puzzles (admin)
router.get("/", adminAuthMiddleware, async (req, res) => {
  try {
    const search = String(req.query.search || "").trim().toLowerCase();
    const active = parseBoolean(req.query.active);
    const duplicateOnly = parseBoolean(req.query.duplicate) === true;
    const category = String(req.query.category || "").trim().toLowerCase();

    const minRating = Number(req.query.minRating);
    const maxRating = Number(req.query.maxRating);

    const query = {};
    if (active !== null) query.isActive = active;

    if (Number.isFinite(minRating) || Number.isFinite(maxRating)) {
      query.rating = {};
      if (Number.isFinite(minRating)) query.rating.$gte = minRating;
      if (Number.isFinite(maxRating)) query.rating.$lte = maxRating;
    }

    const puzzles = await Puzzle.find(query).sort({ createdAt: -1 });
    const puzzleIds = puzzles.map((puzzle) => puzzle._id);
    const { qualityById, masteredById } = await aggregatePuzzleQuality(puzzleIds);

    const duplicateCounts = new Map();
    for (const puzzle of puzzles) {
      const key = normalizeFenKey(puzzle.fen);
      duplicateCounts.set(key, Number(duplicateCounts.get(key) || 0) + 1);
    }

    let items = puzzles.map((puzzle) =>
      mapPuzzle(puzzle, qualityById, masteredById, duplicateCounts),
    );

    if (search) {
      items = items.filter((item) => {
        const blob = [item.title, item.description, item.fen, item.category]
          .join(" ")
          .toLowerCase();
        return blob.includes(search);
      });
    }

    if (category) {
      items = items.filter((item) =>
        String(item.category || "").toLowerCase().includes(category),
      );
    }

    if (duplicateOnly) {
      items = items.filter((item) => Number(item.duplicateCount || 1) > 1);
    }

    return res.json(items);
  } catch (error) {
    console.error("Admin puzzle list error:", error);
    return res.status(500).json({ error: "Failed to fetch puzzles" });
  }
});

// Create puzzle
router.post("/", adminAuthMiddleware, async (req, res) => {
  try {
    const { data, error } = normalizePuzzlePayload(req.body || {});
    if (error) {
      return res.status(400).json({ error });
    }

    const puzzle = new Puzzle(data);
    await puzzle.save();
    return res.status(201).json(serializePuzzle(puzzle));
  } catch (error) {
    console.error("Admin puzzle create error:", error);
    if (error?.name === "ValidationError") {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to create puzzle" });
  }
});

// Toggle puzzle featured status (admin)
router.patch("/:id/featured", adminAuthMiddleware, async (req, res) => {
  try {
    const { featured } = req.body;
    const puzzle = await Puzzle.findByIdAndUpdate(
      req.params.id,
      { featured: !!featured },
      { new: true },
    );
    if (!puzzle) {
      return res.status(404).json({ error: "Puzzle not found" });
    }
    return res.json(serializePuzzle(puzzle));
  } catch (error) {
    return res.status(500).json({ error: "Failed to update puzzle" });
  }
});

// Update puzzle active state quickly
router.patch("/:id/state", adminAuthMiddleware, async (req, res) => {
  try {
    const updates = {};
    if (typeof req.body?.isActive === "boolean") {
      updates.isActive = req.body.isActive;
    }

    const puzzle = await Puzzle.findByIdAndUpdate(req.params.id, updates, {
      new: true,
    });
    if (!puzzle) {
      return res.status(404).json({ error: "Puzzle not found" });
    }
    return res.json(serializePuzzle(puzzle));
  } catch (error) {
    console.error("Admin puzzle state patch error:", error);
    return res.status(500).json({ error: "Failed to update puzzle state" });
  }
});

// Update puzzle
router.put("/:id", adminAuthMiddleware, async (req, res) => {
  try {
    const { data, error } = normalizePuzzlePayload(req.body || {});
    if (error) {
      return res.status(400).json({ error });
    }

    const puzzle = await Puzzle.findByIdAndUpdate(
      req.params.id,
      data,
      { new: true, runValidators: true },
    );

    if (!puzzle) {
      return res.status(404).json({ error: "Puzzle not found" });
    }
    return res.json(serializePuzzle(puzzle));
  } catch (error) {
    console.error("Admin puzzle update error:", error);
    if (error?.name === "ValidationError") {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to update puzzle" });
  }
});

// Delete puzzle
router.delete("/:id", adminAuthMiddleware, async (req, res) => {
  try {
    const puzzle = await Puzzle.findByIdAndDelete(req.params.id);
    if (!puzzle) {
      return res.status(404).json({ error: "Puzzle not found" });
    }
    return res.json({ success: true, message: "Puzzle deleted" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete puzzle" });
  }
});

export default router;
