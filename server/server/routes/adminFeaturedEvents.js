import express from "express";
import mongoose from "mongoose";
import { body, param, query, validationResult } from "express-validator";
import FeaturedEvent from "../models/FeaturedEvent.js";
import { adminAuthMiddleware } from "../middleware/index.js";

const router = express.Router();

const VALID_TYPES = new Set(["tournament", "match", "broadcast", "event"]);
const VALID_STATUS = new Set(["upcoming", "live", "completed"]);

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
    data.imageUrl = toTrimmedString(rawBody.imageUrl, { max: 500 });
  }

  if (rawBody.players !== undefined) {
    data.players = sanitizePlayers(rawBody.players) || [];
  }

  if (rawBody.startDate !== undefined) {
    const startDate = toDateOrUndefined(rawBody.startDate);
    if (!startDate) return { error: "Invalid startDate" };
    data.startDate = startDate;
  }

  if (rawBody.endDate !== undefined) {
    const endDate = toDateOrUndefined(rawBody.endDate);
    if (!endDate) return { error: "Invalid endDate" };
    data.endDate = endDate;
  }

  if (rawBody.status !== undefined) {
    const status = toTrimmedString(rawBody.status, { max: 20 });
    if (!VALID_STATUS.has(status)) {
      return { error: "Invalid status" };
    }
    data.status = status;
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
    data.tags = sanitizeTags(rawBody.tags) || [];
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

router.use(adminAuthMiddleware);

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

      data.createdBy = req.admin?.adminId || undefined;
      const event = await FeaturedEvent.create(data);
      res.status(201).json(event);
    } catch (error) {
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

    const event = await FeaturedEvent.findByIdAndUpdate(
      req.params.id,
      { $set: data },
      { new: true, runValidators: true },
    );

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    res.json(event);
  } catch (error) {
    console.error("Error updating event:", error);
    res.status(500).json({ error: "Failed to update event" });
  }
});

// DELETE event
router.delete("/:id", [...idParamValidation, validateRequest], async (req, res) => {
  try {
    const event = await FeaturedEvent.findByIdAndDelete(req.params.id);

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
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
