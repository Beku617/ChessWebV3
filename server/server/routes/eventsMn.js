import express from "express";
import EventMN from "../models/EventMN.js";

const router = express.Router();
const PAIR_ID_PATTERN = /^\d{5}$/;

// GET all active featured events (public)
router.get("/", async (req, res) => {
  try {
    const { status, featured, limit = 10 } = req.query;

    const query = { isActive: true };
    if (status) query.status = status;
    if (featured === "true") query.featured = true;

    const events = await EventMN.find(query)
      .sort({ priority: -1, createdAt: -1 })
      .limit(parseInt(limit));

    res.json(events);
  } catch (error) {
    console.error("Error fetching featured events:", error);
    res.status(500).json({ error: "Failed to fetch featured events" });
  }
});

// GET event by pairId (public)
router.get("/pair/:pairId", async (req, res) => {
  try {
    const pairId = String(req.params.pairId || "").trim();
    if (!PAIR_ID_PATTERN.test(pairId)) {
      return res.status(400).json({ error: "Pair ID must be exactly 5 digits." });
    }

    const event = await EventMN.findOne({ pairId, isActive: true }).lean();
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }
    return res.json({ pairId, event });
  } catch (error) {
    console.error("Error fetching event by pairId:", error);
    return res.status(500).json({ error: "Failed to fetch event" });
  }
});

// GET single event (public)
router.get("/:id", async (req, res) => {
  try {
    const event = await EventMN.findById(req.params.id);
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

