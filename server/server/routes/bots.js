import express from "express";
import Bot from "../models/Bot.js";
import { ensureBotAvatarMedia, ensureBotAvatarMediaMany } from "../utils/botMedia.js";

const router = express.Router();

// GET /api/bots - Get all active bots (public endpoint)
router.get("/", async (req, res) => {
  try {
    const bots = await Bot.find({ isActive: true })
      .sort({ difficulty: 1, eloRating: 1 })
      .select("-__v")
      .lean();
    const normalizedBots = await ensureBotAvatarMediaMany(bots);

    // Group bots by difficulty
    const grouped = {
      beginner: [],
      casual: [],
      intermediate: [],
      advanced: [],
      master: [],
    };

    normalizedBots.forEach((bot) => {
      if (grouped[bot.difficulty]) {
        grouped[bot.difficulty].push(bot);
      }
    });

    res.json({
      success: true,
      bots: normalizedBots,
      grouped,
      total: normalizedBots.length,
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
    })
      .select("-__v")
      .lean();

    if (!bot) {
      return res.status(404).json({ message: "Bot not found" });
    }

    res.json({ success: true, bot: await ensureBotAvatarMedia(bot) });
  } catch (error) {
    console.error("Error fetching bot:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch bot", error: error.message });
  }
});

export default router;
