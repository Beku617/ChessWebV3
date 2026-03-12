import { Router } from "express";
import { authMiddleware } from "../middleware/index.js";
import { RatingEvent, User } from "../models/index.js";
import { gamesFieldForPool, ratingFieldForPool } from "../utils/elo.js";

const router = Router();
const VALID_POOLS = new Set(["bullet", "blitz", "rapid", "classical"]);

function normalizePool(value) {
  const pool = String(value || "blitz")
    .trim()
    .toLowerCase();
  return VALID_POOLS.has(pool) ? pool : null;
}

function parseRangeStart(rangeRaw) {
  const value = String(rangeRaw || "90d")
    .trim()
    .toLowerCase();
  if (value === "all") return null;

  const matched = value.match(/^(\d+)([dwmy])$/);
  if (!matched) return null;

  const amount = Number(matched[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const unit = matched[2];
  const now = Date.now();
  if (unit === "d") return new Date(now - amount * 24 * 60 * 60 * 1000);
  if (unit === "w") return new Date(now - amount * 7 * 24 * 60 * 60 * 1000);
  if (unit === "m") return new Date(now - amount * 30 * 24 * 60 * 60 * 1000);
  return new Date(now - amount * 365 * 24 * 60 * 60 * 1000);
}

function downsampleTimeline(events, maxPoints = 500) {
  if (events.length <= maxPoints) return events;

  // Keep one point per day (the last rating of that day) first.
  const byDay = new Map();
  for (const event of events) {
    const key = new Date(event.ts).toISOString().slice(0, 10);
    byDay.set(key, event);
  }
  let points = Array.from(byDay.values()).sort(
    (a, b) => new Date(a.ts) - new Date(b.ts),
  );

  if (points.length <= maxPoints) return points;

  // Fall back to deterministic interval sampling.
  const stride = Math.ceil(points.length / maxPoints);
  points = points.filter((_, index) => index % stride === 0);
  return points.slice(-maxPoints);
}

router.get("/timeline", authMiddleware, async (req, res) => {
  try {
    const pool = normalizePool(req.query.pool);
    if (!pool) {
      return res.status(400).json({ error: "Invalid pool." });
    }

    const rangeRaw = String(req.query.range || "90d");
    const start = parseRangeStart(rangeRaw);
    const query = {
      userId: req.user.userId,
      pool,
    };
    if (start) {
      query.ts = { $gte: start };
    }

    const events = await RatingEvent.find(query)
      .sort({ ts: 1 })
      .select(
        "ts ratingAfter delta rdAfter volAfter result isProvisional poolGamesAfter",
      )
      .lean();

    const points = downsampleTimeline(events).map((event) => ({
      ts: event.ts,
      rating: event.ratingAfter,
      delta: event.delta,
      rd: event.rdAfter,
      volatility: event.volAfter,
      result: event.result,
      isProvisional: event.isProvisional === true,
      poolGames: Number(event.poolGamesAfter || 0),
    }));

    res.json({
      pool,
      range: rangeRaw,
      points,
    });
  } catch (error) {
    console.error("Rating timeline error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/leaderboard", async (req, res) => {
  try {
    const pool = normalizePool(req.query.pool);
    if (!pool) {
      return res.status(400).json({ error: "Invalid pool." });
    }

    const limit = Math.min(
      200,
      Math.max(1, Number.parseInt(String(req.query.limit || "100"), 10) || 100),
    );
    const includeProvisional =
      String(req.query.includeProvisional || "").toLowerCase() === "true" ||
      String(req.query.includeProvisional || "") === "1";
    const minGamesRaw = Number.parseInt(String(req.query.minGames || ""), 10);

    const ratingField = ratingFieldForPool(pool);
    const gamesField = gamesFieldForPool(pool);
    const minGames = Number.isFinite(minGamesRaw)
      ? Math.max(0, minGamesRaw)
      : includeProvisional
        ? 0
        : 10;

    const query = {
      [gamesField]: { $gte: minGames },
    };

    const users = await User.find(query)
      .sort({ [ratingField]: -1, [gamesField]: -1, fullName: 1 })
      .limit(limit)
      .select(`fullName avatar ${ratingField} ${gamesField}`)
      .lean();

    const leaderboard = users.map((user, index) => ({
      rank: index + 1,
      id: String(user._id),
      name: user.fullName,
      avatar: user.avatar || "",
      rating: Number(user?.[ratingField] ?? user.rating ?? 1200),
      games: Number(user?.[gamesField] ?? 0),
      isProvisional: Number(user?.[gamesField] ?? 0) < 10,
    }));

    res.json({
      pool,
      limit,
      minGames,
      leaderboard,
    });
  } catch (error) {
    console.error("Leaderboard error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
