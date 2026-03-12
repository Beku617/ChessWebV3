import express from "express";
import FeaturedEvent from "../models/FeaturedEvent.js";

const router = express.Router();

// GET all events (admin - includes inactive)
router.get("/", async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const query = {};
    if (status) query.status = status;

    const events = await FeaturedEvent.find(query)
      .sort({ priority: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await FeaturedEvent.countDocuments(query);

    res.json({
      events,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching events:", error);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

// CREATE new event
router.post("/", async (req, res) => {
  try {
    const event = new FeaturedEvent(req.body);
    await event.save();
    res.status(201).json(event);
  } catch (error) {
    console.error("Error creating event:", error);
    res.status(500).json({ error: "Failed to create event" });
  }
});

// UPDATE event
router.put("/:id", async (req, res) => {
  try {
    const event = await FeaturedEvent.findByIdAndUpdate(
      req.params.id,
      req.body,
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
router.delete("/:id", async (req, res) => {
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
router.patch("/:id/toggle-featured", async (req, res) => {
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
router.patch("/:id/toggle-active", async (req, res) => {
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
router.patch("/:id/status", async (req, res) => {
  try {
    const { status } = req.body;

    if (!["upcoming", "live", "completed"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const event = await FeaturedEvent.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true },
    );

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    res.json(event);
  } catch (error) {
    console.error("Error updating status:", error);
    res.status(500).json({ error: "Failed to update status" });
  }
});

export default router;
