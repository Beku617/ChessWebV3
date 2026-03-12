import express from "express";
import Bot from "../models/Bot.js";

const router = express.Router();

// GET /api/bots - Get all active bots (public endpoint)
router.get("/", async (req, res) => {
  try {
    const bots = await Bot.find({ isActive: true })
      .sort({ difficulty: 1, eloRating: 1 })
      .select("-__v");

    // Group bots by difficulty
    const grouped = {
      beginner: [],
      casual: [],
      intermediate: [],
      advanced: [],
      master: [],
    };

    bots.forEach((bot) => {
      if (grouped[bot.difficulty]) {
        grouped[bot.difficulty].push(bot);
      }
    });

    res.json({
      success: true,
      bots,
      grouped,
      total: bots.length,
    });
  } catch (error) {
    console.error("Error fetching bots:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch bots", error: error.message });
  }
});

// GET /api/bots/:id - Get single bot by ID
router.get("/:id", async (req, res) => {
  try {
    const bot = await Bot.findOne({
      _id: req.params.id,
      isActive: true,
    }).select("-__v");

    if (!bot) {
      return res.status(404).json({ message: "Bot not found" });
    }

    res.json({ success: true, bot });
  } catch (error) {
    console.error("Error fetching bot:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch bot", error: error.message });
  }
});

export default router;
