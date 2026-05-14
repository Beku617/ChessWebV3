import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import { body, param, query, validationResult } from "express-validator";
import FeaturedEvent from "../models/FeaturedEvent.js";
import { adminAuthMiddleware } from "../middleware/index.js";
import { importEventsToEn } from "../services/adminContentImportService.js";
import {
  createMediaUploadStorage,
  deleteMediaAsset,
  extractMediaAssetId,
} from "../utils/mediaStorage.js";

const router = express.Router();

const VALID_TYPES = new Set(["tournament", "match", "broadcast", "event"]);
const VALID_STATUS = new Set(["upcoming", "live", "completed"]);
const VALID_BACKGROUND_TYPES = new Set(["default", "color", "image"]);
const PAIR_ID_PATTERN = /^\d{5}$/;

function toTrimmedString(value, { max = 5000 } = {}) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, max);
}

function toBooleanOrUndefined(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return undefined;
}

function toNumberOrUndefined(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function toDateOrUndefined(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return undefined;
  return parsed;
}

function sanitizePlayers(players) {
  if (!Array.isArray(players)) return undefined;
  return players
    .map((player) => ({
      name: toTrimmedString(player?.name, { max: 120 }),
      rating: toNumberOrUndefined(player?.rating),
      title: toTrimmedString(player?.title, { max: 20 }),
      country: toTrimmedString(player?.country, { max: 60 }),
    }))
    .filter((player) => player.name.length > 0);
}

function sanitizeTags(tags) {
  if (!Array.isArray(tags)) return undefined;
  return tags
    .map((tag) => toTrimmedString(tag, { max: 60 }))
    .filter(Boolean)
    .slice(0, 20);
}

function toArrayOrParsedJson(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return undefined;
  const raw = value.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function sanitizeOptionalTextColor(value) {
  const raw = toTrimmedString(value, { max: 40 });
  if (!raw) return "";
  if (!/^[#(),.%\s\-a-zA-Z0-9]+$/.test(raw)) {
    return "";
  }
  return raw;
}

function sanitizeFeaturedEventPayload(rawBody = {}, { partial = false } = {}) {
  const data = {};

  const title = toTrimmedString(rawBody.title, { max: 180 });
  if (!partial || rawBody.title !== undefined) {
    if (!title) {
      return { error: "Title is required" };
    }
    data.title = title;
  }

  if (rawBody.description !== undefined) {
    data.description = toTrimmedString(rawBody.description, { max: 4000 });
  }

  if (rawBody.pairId !== undefined) {
    const pairId = toTrimmedString(rawBody.pairId, { max: 16 });
    if (!pairId) {
      data.pairId = null;
    } else if (!PAIR_ID_PATTERN.test(pairId)) {
      return { error: "Pair ID must be exactly 5 digits" };
    } else {
      data.pairId = pairId;
    }
  }

  if (rawBody.type !== undefined) {
    const type = toTrimmedString(rawBody.type, { max: 20 });
    if (!VALID_TYPES.has(type)) {
      return { error: "Invalid event type" };
    }
    data.type = type;
  }

  if (rawBody.lichessUrl !== undefined) {
    data.lichessUrl = toTrimmedString(rawBody.lichessUrl, { max: 500 });
  }

  if (rawBody.imageUrl !== undefined) {
    const imageUrl = toTrimmedString(rawBody.imageUrl, { max: 500 });
    data.imageUrl = imageUrl;
    if (rawBody.backgroundImageUrl === undefined) {
      data.backgroundImageUrl = imageUrl;
    }
  }

  if (rawBody.players !== undefined) {
    const players = toArrayOrParsedJson(rawBody.players);
    if (players === undefined) {
      return { error: "Invalid players value" };
    }
    data.players = sanitizePlayers(players) || [];
  }

  if (rawBody.startDate !== undefined) {
    const rawStartDate = toTrimmedString(rawBody.startDate, { max: 120 });
    if (!rawStartDate) {
      data.startDate = null;
    } else {
      const startDate = toDateOrUndefined(rawStartDate);
      if (!startDate) return { error: "Invalid startDate" };
      data.startDate = startDate;
    }
  }

  if (rawBody.endDate !== undefined) {
    const rawEndDate = toTrimmedString(rawBody.endDate, { max: 120 });
    if (!rawEndDate) {
      data.endDate = null;
    } else {
      const endDate = toDateOrUndefined(rawEndDate);
      if (!endDate) return { error: "Invalid endDate" };
      data.endDate = endDate;
    }
  }

  if (rawBody.status !== undefined) {
    const status = toTrimmedString(rawBody.status, { max: 20 });
    if (!VALID_STATUS.has(status)) {
      return { error: "Invalid status" };
    }
    data.status = status;
  }

  if (rawBody.statusLabel !== undefined) {
    data.statusLabel = toTrimmedString(rawBody.statusLabel, { max: 40 });
  }

  if (rawBody.categoryLabel !== undefined) {
    data.categoryLabel = toTrimmedString(rawBody.categoryLabel, { max: 80 });
  }

  if (rawBody.viewerCountText !== undefined) {
    data.viewerCountText = toTrimmedString(rawBody.viewerCountText, { max: 80 });
  }

  if (rawBody.primaryButtonLabel !== undefined) {
    data.primaryButtonLabel = toTrimmedString(rawBody.primaryButtonLabel, {
      max: 80,
    });
  }

  if (rawBody.primaryButtonUrl !== undefined) {
    data.primaryButtonUrl = toTrimmedString(rawBody.primaryButtonUrl, {
      max: 500,
    });
  }

  if (rawBody.secondaryButtonLabel !== undefined) {
    data.secondaryButtonLabel = toTrimmedString(rawBody.secondaryButtonLabel, {
      max: 80,
    });
  }

  if (rawBody.secondaryButtonUrl !== undefined) {
    data.secondaryButtonUrl = toTrimmedString(rawBody.secondaryButtonUrl, {
      max: 500,
    });
  }

  if (rawBody.backgroundType !== undefined) {
    const backgroundType = toTrimmedString(rawBody.backgroundType, { max: 20 })
      .toLowerCase();
    if (!VALID_BACKGROUND_TYPES.has(backgroundType)) {
      return { error: "Invalid background type" };
    }
    data.backgroundType = backgroundType;
  }

  if (rawBody.backgroundColor !== undefined) {
    data.backgroundColor = sanitizeOptionalTextColor(rawBody.backgroundColor);
  }

  if (rawBody.backgroundImageUrl !== undefined) {
    const backgroundImageUrl = toTrimmedString(rawBody.backgroundImageUrl, {
      max: 500,
    });
    data.backgroundImageUrl = backgroundImageUrl;
    if (backgroundImageUrl) {
      data.imageUrl = backgroundImageUrl;
    }
  }

  if (rawBody.primaryButtonColor !== undefined) {
    data.primaryButtonColor = sanitizeOptionalTextColor(rawBody.primaryButtonColor);
  }

  if (rawBody.titleColor !== undefined) {
    data.titleColor = sanitizeOptionalTextColor(rawBody.titleColor);
  }

  if (rawBody.descriptionColor !== undefined) {
    data.descriptionColor = sanitizeOptionalTextColor(rawBody.descriptionColor);
  }

  if (rawBody.featured !== undefined) {
    const featured = toBooleanOrUndefined(rawBody.featured);
    if (featured === undefined) return { error: "Invalid featured value" };
    data.featured = featured;
  }

  if (rawBody.isActive !== undefined) {
    const isActive = toBooleanOrUndefined(rawBody.isActive);
    if (isActive === undefined) return { error: "Invalid isActive value" };
    data.isActive = isActive;
  }

  if (rawBody.priority !== undefined) {
    const priority = toNumberOrUndefined(rawBody.priority);
    if (priority === undefined) return { error: "Invalid priority value" };
    data.priority = Math.trunc(priority);
  }

  if (rawBody.viewers !== undefined) {
    const viewers = toNumberOrUndefined(rawBody.viewers);
    if (viewers === undefined) return { error: "Invalid viewers value" };
    data.viewers = Math.max(0, Math.trunc(viewers));
  }

  if (rawBody.tags !== undefined) {
    const tags = toArrayOrParsedJson(rawBody.tags);
    if (tags === undefined) {
      return { error: "Invalid tags value" };
    }
    data.tags = sanitizeTags(tags) || [];
  }

  return { data };
}

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const firstError = errors.array({ onlyFirstError: true })[0];
    return res.status(400).json({ error: firstError?.msg || "Invalid input" });
  }
  return next();
};

const idParamValidation = [
  param("id").custom((value) => {
    if (!mongoose.Types.ObjectId.isValid(String(value || ""))) {
      throw new Error("Invalid event id");
    }
    return true;
  }),
];

const backgroundImageFileFilter = (_req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (allowedTypes.includes(String(file?.mimetype || "").trim().toLowerCase())) {
    cb(null, true);
    return;
  }
  cb(
    new Error("Invalid file type. Only JPG, PNG, GIF, and WebP are allowed."),
    false,
  );
};

const backgroundImageUpload = multer({
  storage: createMediaUploadStorage({
    category: "featured-event-background",
  }),
  fileFilter: backgroundImageFileFilter,
  limits: { fileSize: 8 * 1024 * 1024 },
});

const uploadBackgroundImageFile = (req, res, next) =>
  backgroundImageUpload.single("backgroundImageFile")(req, res, async (error) => {
    if (!error) {
      return next();
    }

    if (req.file?.assetId) {
      await deleteMediaAsset(req.file.assetId).catch(() => null);
    }

    let message = "Failed to upload background image.";
    if (error instanceof multer.MulterError) {
      message =
        error.code === "LIMIT_FILE_SIZE"
          ? "Background image is too large. Maximum size is 8MB."
          : error.message || message;
    } else if (error instanceof Error && error.message) {
      message = error.message;
    }

    return res.status(400).json({ error: message });
  });

router.use(adminAuthMiddleware);

router.post("/import-from-mn", async (req, res) => {
  try {
    const result = await importEventsToEn({
      sourceEventIds: Array.isArray(req.body?.eventIds) ? req.body.eventIds : [],
    });
    return res.json(result);
  } catch (error) {
    return res.status(Number(error?.status) || 500).json({
      error:
        error instanceof Error ? error.message : "Failed to import events.",
    });
  }
});

// GET all events (admin - includes inactive)
router.get(
  "/",
  [
    query("status").optional().isString().trim(),
    query("page").optional().isInt({ min: 1 }).toInt(),
    query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
    validateRequest,
  ],
  async (req, res) => {
    try {
      const { status } = req.query;
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 20;

      const queryFilter = {};
      if (status) {
        const normalizedStatus = String(status).trim();
        if (VALID_STATUS.has(normalizedStatus)) {
          queryFilter.status = normalizedStatus;
        }
      }

      const events = await FeaturedEvent.find(queryFilter)
        .sort({ priority: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      const total = await FeaturedEvent.countDocuments(queryFilter);

      res.json({
        events,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error("Error fetching events:", error);
      res.status(500).json({ error: "Failed to fetch events" });
    }
  },
);

// CREATE new event
router.post(
  "/",
  [
    body("title").exists({ values: "falsy" }).withMessage("Title is required"),
    validateRequest,
  ],
  async (req, res) => {
    try {
      const { data, error } = sanitizeFeaturedEventPayload(req.body, {
        partial: false,
      });
      if (error) {
        return res.status(400).json({ error });
      }

      if (data.pairId == null) {
        delete data.pairId;
      }

      data.createdBy = req.admin?.adminId || undefined;
      const event = await FeaturedEvent.create(data);
      res.status(201).json(event);
    } catch (error) {
      if (error?.code === 11000 && error?.keyPattern?.pairId) {
        return res.status(409).json({ error: "Pair ID is already in use." });
      }
      console.error("Error creating event:", error);
      res.status(500).json({ error: "Failed to create event" });
    }
  },
);

// UPDATE event
router.put("/:id", [...idParamValidation, validateRequest], async (req, res) => {
  try {
    const { data, error } = sanitizeFeaturedEventPayload(req.body, {
      partial: true,
    });
    if (error) {
      return res.status(400).json({ error });
    }

    if (!Object.keys(data).length) {
      return res.status(400).json({ error: "No valid fields provided" });
    }

    const updateDoc = { $set: { ...data } };
    if (data.pairId === null) {
      delete updateDoc.$set.pairId;
      updateDoc.$unset = { pairId: 1 };
    }

    const event = await FeaturedEvent.findByIdAndUpdate(
      req.params.id,
      updateDoc,
      { new: true, runValidators: true },
    );

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    res.json(event);
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.pairId) {
      return res.status(409).json({ error: "Pair ID is already in use." });
    }
    console.error("Error updating event:", error);
    res.status(500).json({ error: "Failed to update event" });
  }
});

// Upload/replace event background image
router.post(
  "/:id/background-image",
  [...idParamValidation, validateRequest],
  uploadBackgroundImageFile,
  async (req, res) => {
    try {
      const uploadUrl = toTrimmedString(req.file?.url, { max: 500 });
      if (!uploadUrl) {
        return res.status(400).json({ error: "Background image upload failed." });
      }

      const event = await FeaturedEvent.findById(req.params.id);
      if (!event) {
        if (req.file?.assetId) {
          await deleteMediaAsset(req.file.assetId).catch(() => null);
        }
        return res.status(404).json({ error: "Event not found" });
      }

      const previousAssetId = extractMediaAssetId(
        event.backgroundImageUrl || event.imageUrl || "",
      );
      const nextAssetId = extractMediaAssetId(uploadUrl);

      event.backgroundImageUrl = uploadUrl;
      event.imageUrl = uploadUrl;
      event.backgroundType = "image";
      await event.save();

      if (previousAssetId && previousAssetId !== nextAssetId) {
        await deleteMediaAsset(previousAssetId).catch(() => null);
      }

      res.json(event);
    } catch (error) {
      console.error("Error uploading event background image:", error);
      if (req.file?.assetId) {
        await deleteMediaAsset(req.file.assetId).catch(() => null);
      }
      res.status(500).json({ error: "Failed to upload event background image" });
    }
  },
);

// DELETE event
router.delete("/:id", [...idParamValidation, validateRequest], async (req, res) => {
  try {
    const event = await FeaturedEvent.findByIdAndDelete(req.params.id);

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    const previousAssetId = extractMediaAssetId(
      event.backgroundImageUrl || event.imageUrl || "",
    );
    if (previousAssetId) {
      await deleteMediaAsset(previousAssetId).catch(() => null);
    }

    res.json({ message: "Event deleted successfully" });
  } catch (error) {
    console.error("Error deleting event:", error);
    res.status(500).json({ error: "Failed to delete event" });
  }
});

// Toggle featured status
router.patch(
  "/:id/toggle-featured",
  [...idParamValidation, validateRequest],
  async (req, res) => {
  try {
    const event = await FeaturedEvent.findById(req.params.id);

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    event.featured = !event.featured;
    await event.save();

    res.json(event);
  } catch (error) {
    console.error("Error toggling featured:", error);
    res.status(500).json({ error: "Failed to toggle featured status" });
  }
});

// Toggle active status
router.patch(
  "/:id/toggle-active",
  [...idParamValidation, validateRequest],
  async (req, res) => {
  try {
    const event = await FeaturedEvent.findById(req.params.id);

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    event.isActive = !event.isActive;
    await event.save();

    res.json(event);
  } catch (error) {
    console.error("Error toggling active:", error);
    res.status(500).json({ error: "Failed to toggle active status" });
  }
});

// Update event status (upcoming/live/completed)
router.patch(
  "/:id/status",
  [
    ...idParamValidation,
    body("status")
      .exists({ values: "falsy" })
      .withMessage("Status is required")
      .bail()
      .isString()
      .withMessage("Invalid status")
      .bail()
      .custom((value) => {
        if (!VALID_STATUS.has(String(value || "").trim())) {
          throw new Error("Invalid status");
        }
        return true;
      }),
    validateRequest,
  ],
  async (req, res) => {
    try {
      const status = String(req.body.status || "").trim();
      const event = await FeaturedEvent.findByIdAndUpdate(
        req.params.id,
        { $set: { status } },
        { new: true, runValidators: true },
      );

      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      res.json(event);
    } catch (error) {
      console.error("Error updating status:", error);
      res.status(500).json({ error: "Failed to update status" });
    }
  },
);

export default router;
