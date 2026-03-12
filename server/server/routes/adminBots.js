import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { Bot } from "../models/index.js";
import { adminAuthMiddleware } from "../middleware/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Setup multer for file uploads
const uploadDir = path.join(__dirname, "../uploads/bot-avatars");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "bot-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error("Invalid file type. Only JPG, PNG, GIF, and WebP are allowed."),
      false,
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});

// GET /api/admin/bots - List all bots with pagination, search, filter
router.get("/", adminAuthMiddleware, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = "",
      difficulty = "",
      category = "",
      isActive = "",
      sortBy = "sortOrder",
      sortOrder = "asc",
    } = req.query;

    const query = {};

    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { quote: { $regex: search, $options: "i" } },
      ];
    }

    // Difficulty filter
    if (difficulty) {
      query.difficulty = difficulty;
    }

    // Category filter
    if (category) {
      query.category = { $regex: category, $options: "i" };
    }

    // Active status filter
    if (isActive !== "") {
      query.isActive = isActive === "true";
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    const [bots, total] = await Promise.all([
      Bot.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Bot.countDocuments(query),
    ]);

    // Get unique categories for filter dropdown
    const categories = await Bot.distinct("category");

    res.json({
      bots,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
      categories,
    });
  } catch (error) {
    console.error("Failed to fetch bots:", error);
    res.status(500).json({ error: "Failed to fetch bots" });
  }
});

// GET /api/admin/bots/stats - Get bot statistics
router.get("/stats", adminAuthMiddleware, async (req, res) => {
  try {
    const [total, active, byDifficulty] = await Promise.all([
      Bot.countDocuments(),
      Bot.countDocuments({ isActive: true }),
      Bot.aggregate([{ $group: { _id: "$difficulty", count: { $sum: 1 } } }]),
    ]);

    const difficultyStats = {};
    byDifficulty.forEach((d) => {
      difficultyStats[d._id] = d.count;
    });

    res.json({
      total,
      active,
      inactive: total - active,
      byDifficulty: difficultyStats,
    });
  } catch (error) {
    console.error("Failed to fetch bot stats:", error);
    res.status(500).json({ error: "Failed to fetch bot statistics" });
  }
});

// GET /api/admin/bots/:id - Get single bot
router.get("/:id", adminAuthMiddleware, async (req, res) => {
  try {
    const bot = await Bot.findById(req.params.id).lean();
    if (!bot) {
      return res.status(404).json({ error: "Bot not found" });
    }
    res.json(bot);
  } catch (error) {
    console.error("Failed to fetch bot:", error);
    res.status(500).json({ error: "Failed to fetch bot" });
  }
});

// POST /api/admin/bots - Create new bot
router.post(
  "/",
  adminAuthMiddleware,
  upload.single("avatarFile"),
  async (req, res) => {
    try {
      const {
        name,
        avatar,
        eloRating,
        difficulty,
        category,
        title,
        quote,
        description,
        personality,
        countryCode,
        playStyle,
        skillLevel,
        depth,
        thinkTimeMs,
        blunderChance,
        aggressiveness,
        openingBook,
        isActive,
        sortOrder,
      } = req.body;

      // Validate required fields
      if (!name || name.length < 2 || name.length > 50) {
        return res
          .status(400)
          .json({ error: "Bot name must be 2-50 characters" });
      }

      const rating = parseInt(eloRating);
      if (isNaN(rating) || rating < 100 || rating > 3000) {
        return res
          .status(400)
          .json({ error: "ELO rating must be between 100-3000" });
      }

      // Check for duplicate name
      const existing = await Bot.findOne({
        name: { $regex: `^${name}$`, $options: "i" },
      });
      if (existing) {
        return res
          .status(400)
          .json({ error: "A bot with this name already exists" });
      }

      const botData = {
        name,
        avatar: avatar || "🤖",
        avatarUrl: req.file ? `/uploads/bot-avatars/${req.file.filename}` : "",
        eloRating: rating,
        difficulty: difficulty || "beginner",
        category: category || "general",
        title: title || "",
        quote: quote || "",
        description: description || "",
        personality: personality || "",
        countryCode: countryCode || "",
        playStyle: playStyle || "balanced",
        skillLevel: parseInt(skillLevel) || 5,
        depth: parseInt(depth) || 10,
        thinkTimeMs: parseInt(thinkTimeMs) || 2000,
        blunderChance: parseFloat(blunderChance) || 0.1,
        aggressiveness: parseInt(aggressiveness) || 0,
        openingBook: openingBook === "true" || openingBook === true,
        isActive: isActive === "true" || isActive === true,
        sortOrder: parseInt(sortOrder) || 0,
      };

      const bot = new Bot(botData);
      await bot.save();

      res.status(201).json(bot);
    } catch (error) {
      console.error("Failed to create bot:", error);
      if (error.code === 11000) {
        return res
          .status(400)
          .json({ error: "A bot with this name already exists" });
      }
      res.status(500).json({ error: "Failed to create bot" });
    }
  },
);

// PUT /api/admin/bots/:id - Update bot
router.put(
  "/:id",
  adminAuthMiddleware,
  upload.single("avatarFile"),
  async (req, res) => {
    try {
      const {
        name,
        avatar,
        eloRating,
        difficulty,
        category,
        title,
        quote,
        description,
        personality,
        countryCode,
        playStyle,
        skillLevel,
        depth,
        thinkTimeMs,
        blunderChance,
        aggressiveness,
        openingBook,
        isActive,
        sortOrder,
      } = req.body;

      // Validate required fields
      if (name && (name.length < 2 || name.length > 50)) {
        return res
          .status(400)
          .json({ error: "Bot name must be 2-50 characters" });
      }

      if (eloRating) {
        const rating = parseInt(eloRating);
        if (isNaN(rating) || rating < 100 || rating > 3000) {
          return res
            .status(400)
            .json({ error: "ELO rating must be between 100-3000" });
        }
      }

      // Check for duplicate name (excluding current bot)
      if (name) {
        const existing = await Bot.findOne({
          name: { $regex: `^${name}$`, $options: "i" },
          _id: { $ne: req.params.id },
        });
        if (existing) {
          return res
            .status(400)
            .json({ error: "A bot with this name already exists" });
        }
      }

      const updateData = {};
      if (name) updateData.name = name;
      if (avatar) updateData.avatar = avatar;
      if (req.file)
        updateData.avatarUrl = `/uploads/bot-avatars/${req.file.filename}`;
      if (eloRating) updateData.eloRating = parseInt(eloRating);
      if (difficulty) updateData.difficulty = difficulty;
      if (category !== undefined) updateData.category = category;
      if (title !== undefined) updateData.title = title;
      if (quote !== undefined) updateData.quote = quote;
      if (description !== undefined) updateData.description = description;
      if (personality !== undefined) updateData.personality = personality;
      if (countryCode !== undefined) updateData.countryCode = countryCode;
      if (playStyle) updateData.playStyle = playStyle;
      if (skillLevel !== undefined)
        updateData.skillLevel = parseInt(skillLevel);
      if (depth !== undefined) updateData.depth = parseInt(depth);
      if (thinkTimeMs !== undefined)
        updateData.thinkTimeMs = parseInt(thinkTimeMs);
      if (blunderChance !== undefined)
        updateData.blunderChance = parseFloat(blunderChance);
      if (aggressiveness !== undefined)
        updateData.aggressiveness = parseInt(aggressiveness);
      if (openingBook !== undefined)
        updateData.openingBook = openingBook === "true" || openingBook === true;
      if (isActive !== undefined)
        updateData.isActive = isActive === "true" || isActive === true;
      if (sortOrder !== undefined) updateData.sortOrder = parseInt(sortOrder);

      const bot = await Bot.findByIdAndUpdate(req.params.id, updateData, {
        new: true,
      });

      if (!bot) {
        return res.status(404).json({ error: "Bot not found" });
      }

      res.json(bot);
    } catch (error) {
      console.error("Failed to update bot:", error);
      if (error.code === 11000) {
        return res
          .status(400)
          .json({ error: "A bot with this name already exists" });
      }
      res.status(500).json({ error: "Failed to update bot" });
    }
  },
);

// DELETE /api/admin/bots/:id - Delete bot
router.delete("/:id", adminAuthMiddleware, async (req, res) => {
  try {
    const bot = await Bot.findById(req.params.id);
    if (!bot) {
      return res.status(404).json({ error: "Bot not found" });
    }

    // Delete avatar file if exists
    if (bot.avatarUrl) {
      const filePath = path.join(__dirname, "..", bot.avatarUrl);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await Bot.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Bot deleted successfully" });
  } catch (error) {
    console.error("Failed to delete bot:", error);
    res.status(500).json({ error: "Failed to delete bot" });
  }
});

// POST /api/admin/bots/bulk-update - Bulk update bots (activate/deactivate)
router.post("/bulk-update", adminAuthMiddleware, async (req, res) => {
  try {
    const { botIds, action } = req.body;

    if (!Array.isArray(botIds) || botIds.length === 0) {
      return res.status(400).json({ error: "No bots selected" });
    }

    let updateData = {};
    if (action === "activate") {
      updateData = { isActive: true };
    } else if (action === "deactivate") {
      updateData = { isActive: false };
    } else {
      return res.status(400).json({ error: "Invalid action" });
    }

    const result = await Bot.updateMany({ _id: { $in: botIds } }, updateData);

    res.json({
      success: true,
      message: `${result.modifiedCount} bots updated`,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Failed to bulk update bots:", error);
    res.status(500).json({ error: "Failed to update bots" });
  }
});

// POST /api/admin/bots/reorder - Reorder bots
router.post("/reorder", adminAuthMiddleware, async (req, res) => {
  try {
    const { orders } = req.body; // Array of { id, sortOrder }

    if (!Array.isArray(orders)) {
      return res.status(400).json({ error: "Invalid order data" });
    }

    const bulkOps = orders.map(({ id, sortOrder }) => ({
      updateOne: {
        filter: { _id: id },
        update: { sortOrder },
      },
    }));

    await Bot.bulkWrite(bulkOps);
    res.json({ success: true, message: "Bots reordered successfully" });
  } catch (error) {
    console.error("Failed to reorder bots:", error);
    res.status(500).json({ error: "Failed to reorder bots" });
  }
});

// GET /api/admin/bots/export/csv - Export bots to CSV
router.get("/export/csv", adminAuthMiddleware, async (req, res) => {
  try {
    const bots = await Bot.find().sort({ sortOrder: 1 }).lean();

    const headers = [
      "Name",
      "Avatar",
      "ELO Rating",
      "Difficulty",
      "Category",
      "Title",
      "Quote",
      "Description",
      "Country",
      "Play Style",
      "Skill Level",
      "Active",
    ];

    const rows = bots.map((bot) => [
      bot.name,
      bot.avatar,
      bot.eloRating,
      bot.difficulty,
      bot.category,
      bot.title || "",
      (bot.quote || "").replace(/"/g, '""'),
      (bot.description || "").replace(/"/g, '""'),
      bot.countryCode || "",
      bot.playStyle,
      bot.skillLevel,
      bot.isActive ? "Yes" : "No",
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=bots-export.csv",
    );
    res.send(csv);
  } catch (error) {
    console.error("Failed to export bots:", error);
    res.status(500).json({ error: "Failed to export bots" });
  }
});

export default router;
