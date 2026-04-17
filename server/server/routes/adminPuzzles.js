import { Router } from "express";
import { Puzzle } from "../models/index.js";
import { adminAuthMiddleware } from "../middleware/index.js";

const router = Router();

function resolveIsWhiteToMove(fen, fallback = true) {
  const side = String(fen || "")
    .trim()
    .split(/\s+/)[1];
  if (side === "w") return true;
  if (side === "b") return false;
  return fallback;
}

// Get all puzzles (admin)
router.get("/", adminAuthMiddleware, async (_req, res) => {
  try {
    const puzzles = await Puzzle.find().sort({ createdAt: -1 });
    res.json(puzzles);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch puzzles" });
  }
});

// Create puzzle
router.post("/", adminAuthMiddleware, async (req, res) => {
  try {
    const {
      title,
      difficulty,
      themes,
      description,
      icon,
      fen,
      solution,
      rating,
      isWhiteToMove,
      mateIn,
    } = req.body;
    const normalizedIsWhiteToMove = resolveIsWhiteToMove(fen, isWhiteToMove);

    const puzzle = new Puzzle({
      title,
      difficulty,
      themes: themes || [],
      description: description || "",
      icon: icon || "🧩",
      fen,
      solution,
      rating: rating || 1200,
      isWhiteToMove: normalizedIsWhiteToMove,
      mateIn: mateIn || 2,
    });

    await puzzle.save();
    res.status(201).json(puzzle);
  } catch (error) {
    res.status(500).json({ error: "Failed to create puzzle" });
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
    res.json(puzzle);
  } catch (error) {
    res.status(500).json({ error: "Failed to update puzzle" });
  }
});

// Update puzzle
router.put("/:id", adminAuthMiddleware, async (req, res) => {
  try {
    const {
      title,
      difficulty,
      themes,
      description,
      icon,
      fen,
      solution,
      rating,
      isWhiteToMove,
      mateIn,
    } = req.body;
    const normalizedIsWhiteToMove = resolveIsWhiteToMove(fen, isWhiteToMove);

    const puzzle = await Puzzle.findByIdAndUpdate(
      req.params.id,
      {
        title,
        difficulty,
        themes,
        description,
        icon,
        fen,
        solution,
        rating,
        isWhiteToMove: normalizedIsWhiteToMove,
        mateIn,
      },
      { new: true },
    );

    if (!puzzle) {
      return res.status(404).json({ error: "Puzzle not found" });
    }
    res.json(puzzle);
  } catch (error) {
    res.status(500).json({ error: "Failed to update puzzle" });
  }
});

// Delete puzzle
router.delete("/:id", adminAuthMiddleware, async (req, res) => {
  try {
    const puzzle = await Puzzle.findByIdAndDelete(req.params.id);
    if (!puzzle) {
      return res.status(404).json({ error: "Puzzle not found" });
    }
    res.json({ success: true, message: "Puzzle deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete puzzle" });
  }
});

export default router;
