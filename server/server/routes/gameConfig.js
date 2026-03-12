import { Router } from "express";
import { GamePageConfig } from "../models/index.js";
import { adminAuthMiddleware } from "../middleware/index.js";
import { seedGamePageConfig } from "../seeds/index.js";

const router = Router();

// Get game page config (public)
router.get("/", async (req, res) => {
  try {
    const config = await GamePageConfig.findOne({ key: "default" }).lean();
    if (!config) {
      return res.status(404).json({ error: "Config not found" });
    }
    res.json({ config });
  } catch (err) {
    console.error("Get game config error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Admin: Update game page config
router.put("/", adminAuthMiddleware, async (req, res) => {
  try {
    const { timeOptions, quickActions } = req.body;

    const config = await GamePageConfig.findOneAndUpdate(
      { key: "default" },
      { timeOptions, quickActions },
      { new: true, upsert: true },
    ).lean();

    res.json({ success: true, config });
  } catch (err) {
    console.error("Update game config error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Admin: Reseed game page config
router.post("/reseed", adminAuthMiddleware, async (req, res) => {
  try {
    await GamePageConfig.deleteMany({});
    await seedGamePageConfig();
    const config = await GamePageConfig.findOne({ key: "default" }).lean();
    res.json({ success: true, message: "Game config reseeded", config });
  } catch (err) {
    console.error("Reseed game config error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
