import express from "express";
import FeaturedEvent from "../models/FeaturedEvent.js";

const router = express.Router();

// GET all active featured events (public)
router.get("/", async (req, res) => {
  try {
    const { status, featured, limit = 10 } = req.query;

    const query = { isActive: true };
    if (status) query.status = status;
    if (featured === "true") query.featured = true;

    const events = await FeaturedEvent.find(query)
      .sort({ priority: -1, createdAt: -1 })
      .limit(parseInt(limit));

    res.json(events);
  } catch (error) {
    console.error("Error fetching featured events:", error);
    res.status(500).json({ error: "Failed to fetch featured events" });
  }
});

// GET single event (public)
router.get("/:id", async (req, res) => {
  try {
    const event = await FeaturedEvent.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }
    res.json(event);
  } catch (error) {
    console.error("Error fetching event:", error);
    res.status(500).json({ error: "Failed to fetch event" });
  }
});

export default router;
