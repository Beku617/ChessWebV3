import { Router } from "express";
import multer from "multer";
import { Bot } from "../models/index.js";
import { adminAuthMiddleware } from "../middleware/index.js";
import { createMediaUploadStorage } from "../utils/mediaStorage.js";
import {
  cleanupBotAvatarMedia,
  ensureBotAvatarMedia,
  ensureBotAvatarMediaMany,
} from "../utils/botMedia.js";

const router = Router();
const VALID_DIFFICULTIES = new Set([
  "beginner",
  "casual",
  "intermediate",
  "advanced",
  "master",
]);
const VALID_PLAY_STYLES = new Set(["aggressive", "defensive", "balanced", "random"]);

function cleanString(value, { max = 1000 } = {}) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, max);
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseNumber(value, { label, min, max, fallback, integer = false }) {
  if (value === undefined || value === null || value === "") {
    if (fallback !== undefined) return fallback;
    return { error: `${label} is required` };
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return { error: `${label} must be a number` };
  }
  const normalized = integer ? Math.trunc(parsed) : parsed;
  if (min !== undefined && normalized < min) {
    return { error: `${label} must be at least ${min}` };
  }
  if (max !== undefined && normalized > max) {
    return { error: `${label} must be at most ${max}` };
  }
  return normalized;
}

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function normalizeBotPayload(payload = {}, { partial = false } = {}) {
  const data = {};

  if (!partial || payload.name !== undefined) {
    const name = cleanString(payload.name, { max: 80 });
    if (name.length < 2 || name.length > 50) {
      return { error: "Bot name must be 2-50 characters" };
    }
    data.name = name;
  }

  if (!partial || payload.eloRating !== undefined) {
    const eloRating = parseNumber(payload.eloRating, {
      label: "ELO rating",
      min: 100,
      max: 3000,
      integer: true,
    });
    if (eloRating && typeof eloRating === "object" && eloRating.error) {
      return { error: "ELO rating must be between 100-3000" };
    }
    data.eloRating = eloRating;
  }

  if (!partial || payload.difficulty !== undefined) {
    const difficulty = cleanString(payload.difficulty).toLowerCase() || "beginner";
    if (!VALID_DIFFICULTIES.has(difficulty)) {
      return { error: "Invalid bot difficulty" };
    }
    data.difficulty = difficulty;
  }

  if (!partial || payload.playStyle !== undefined) {
    const playStyle = cleanString(payload.playStyle).toLowerCase() || "balanced";
    if (!VALID_PLAY_STYLES.has(playStyle)) {
      return { error: "Invalid bot play style" };
    }
    data.playStyle = playStyle;
  }

  const stringFields = [
    ["avatar", 500],
    ["category", 80],
    ["title", 80],
    ["quote", 200],
    ["description", 500],
    ["personality", 200],
    ["countryCode", 5],
  ];
  for (const [field, max] of stringFields) {
    if (payload[field] !== undefined) {
      data[field] = cleanString(payload[field], { max });
    }
  }
  if (!partial && data.category === undefined) data.category = "general";
  if (!partial && !data.category) data.category = "general";

  const numericFields = [
    ["skillLevel", { label: "Skill level", min: 0, max: 20, fallback: 5, integer: true }],
    ["depth", { label: "Depth", min: 1, max: 25, fallback: 10, integer: true }],
    [
      "thinkTimeMs",
      { label: "Think time", min: 100, max: 10000, fallback: 2000, integer: true },
    ],
    [
      "blunderChance",
      { label: "Blunder chance", min: 0, max: 1, fallback: 0.1 },
    ],
    [
      "aggressiveness",
      { label: "Aggressiveness", min: -100, max: 100, fallback: 0, integer: true },
    ],
    ["sortOrder", { label: "Sort order", fallback: 0, integer: true }],
  ];
  for (const [field, options] of numericFields) {
    if (!partial || payload[field] !== undefined) {
      const parsed = parseNumber(payload[field], options);
      if (parsed && typeof parsed === "object" && parsed.error) {
        return { error: parsed.error };
      }
      data[field] = parsed;
    }
  }

  if (!partial || payload.openingBook !== undefined) {
    data.openingBook = parseBoolean(payload.openingBook, true);
  }
  if (!partial || payload.isActive !== undefined) {
    data.isActive = parseBoolean(payload.isActive, true);
  }

  return { data };
}

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
  storage: createMediaUploadStorage({
    category: "bot-avatar",
  }),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});

const uploadAvatarFile = (req, res, next) =>
  upload.single("avatarFile")(req, res, async (error) => {
    if (!error) {
      return next();
    }

    await cleanupBotAvatarMedia(req.file);

    let message = "Failed to upload avatar.";
    if (error instanceof multer.MulterError) {
      message =
        error.code === "LIMIT_FILE_SIZE"
          ? "Avatar image is too large. Maximum size is 5MB."
          : error.message || message;
    } else if (error instanceof Error && error.message) {
      message = error.message;
    }

    return res.status(400).json({ error: message });
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
    const normalizedBots = await ensureBotAvatarMediaMany(bots);

    // Get unique categories for filter dropdown
    const categories = await Bot.distinct("category");

    res.json({
      bots: normalizedBots,
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
    res.json(await ensureBotAvatarMedia(bot));
  } catch (error) {
    console.error("Failed to fetch bot:", error);
    res.status(500).json({ error: "Failed to fetch bot" });
  }
});

// POST /api/admin/bots - Create new bot
router.post(
  "/",
  adminAuthMiddleware,
  uploadAvatarFile,
  async (req, res) => {
    try {
      const { data: normalizedData, error: validationError } = normalizeBotPayload(
        req.body,
        { partial: false },
      );
      if (validationError) {
        await cleanupBotAvatarMedia(req.file);
        return res.status(400).json({ error: validationError });
      }

      // Check for duplicate name
      const existing = await Bot.findOne({
        name: { $regex: `^${escapeRegex(normalizedData.name)}$`, $options: "i" },
      });
      if (existing) {
        await cleanupBotAvatarMedia(req.file);
        return res
          .status(400)
          .json({ error: "A bot with this name already exists" });
      }

      const botData = {
        ...normalizedData,
        avatarUrl: req.file ? req.file.url : "",
        avatarAssetId: req.file ? String(req.file.assetId || "") : "",
        avatarMimeType: req.file ? String(req.file.mimetype || "") : "",
        avatarOriginalName: req.file ? String(req.file.originalName || "") : "",
        avatarSize: req.file ? Number(req.file.size || 0) : 0,
      };

      const bot = new Bot(botData);
      await bot.save();

      res.status(201).json(await ensureBotAvatarMedia(bot.toObject()));
    } catch (error) {
      console.error("Failed to create bot:", error);
      await cleanupBotAvatarMedia(req.file);
      if (error.code === 11000) {
        return res
          .status(400)
          .json({ error: "A bot with this name already exists" });
      }
      if (error?.name === "ValidationError") {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to create bot" });
    }
  },
);

// PUT /api/admin/bots/:id - Update bot
router.put(
  "/:id",
  adminAuthMiddleware,
  uploadAvatarFile,
  async (req, res) => {
    try {
      const { data: normalizedData, error: validationError } = normalizeBotPayload(
        req.body,
        { partial: true },
      );
      if (validationError) {
        await cleanupBotAvatarMedia(req.file);
        return res.status(400).json({ error: validationError });
      }

      // Check for duplicate name (excluding current bot)
      if (normalizedData.name) {
        const existing = await Bot.findOne({
          name: {
            $regex: `^${escapeRegex(normalizedData.name)}$`,
            $options: "i",
          },
          _id: { $ne: req.params.id },
        });
        if (existing) {
          await cleanupBotAvatarMedia(req.file);
          return res
            .status(400)
            .json({ error: "A bot with this name already exists" });
        }
      }

      const currentBot = await Bot.findById(req.params.id).lean();
      if (!currentBot) {
        await cleanupBotAvatarMedia(req.file);
        return res.status(404).json({ error: "Bot not found" });
      }

      const updateData = { ...normalizedData };
      if (req.file) {
        updateData.avatarUrl = req.file.url;
        updateData.avatarAssetId = String(req.file.assetId || "");
        updateData.avatarMimeType = String(req.file.mimetype || "");
        updateData.avatarOriginalName = String(req.file.originalName || "");
        updateData.avatarSize = Number(req.file.size || 0);
      }

      const bot = await Bot.findByIdAndUpdate(req.params.id, updateData, {
        new: true,
        runValidators: true,
      });

      if (req.file) {
        await cleanupBotAvatarMedia({
          avatarUrl: currentBot.avatarUrl,
          avatarAssetId: currentBot.avatarAssetId,
        }).catch((cleanupError) => {
          console.error("Failed to cleanup previous bot avatar:", cleanupError);
        });
      }

      res.json(await ensureBotAvatarMedia(bot?.toObject ? bot.toObject() : bot));
    } catch (error) {
      console.error("Failed to update bot:", error);
      await cleanupBotAvatarMedia(req.file);
      if (error.code === 11000) {
        return res
          .status(400)
          .json({ error: "A bot with this name already exists" });
      }
      if (error?.name === "ValidationError") {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to update bot" });
    }
  },
);

// DELETE /api/admin/bots/:id - Delete bot
router.delete("/:id", adminAuthMiddleware, async (req, res) => {
  try {
    const bot = await Bot.findById(req.params.id).lean();
    if (!bot) {
      return res.status(404).json({ error: "Bot not found" });
    }

    await Bot.findByIdAndDelete(req.params.id);
    await cleanupBotAvatarMedia(bot).catch((cleanupError) => {
      console.error("Failed to cleanup bot avatar during delete:", cleanupError);
    });
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
