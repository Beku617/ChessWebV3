import { Router } from "express";
import { History, History960 } from "../models/index.js";
import { adminAuthMiddleware } from "../middleware/index.js";
import mongoose from "mongoose";
import { MIN_REAL_GAME_PLIES } from "../utils/gameLifecyclePolicy.js";
import {
  applyDeletedUserAliasesToGame,
  applyDeletedUserAliasesToGames,
} from "../utils/historyPlayers.js";

const router = Router();
const { ObjectId } = mongoose.Types;
const MIN_STORED_MOVES = MIN_REAL_GAME_PLIES;

const ALLOWED_SORT_FIELDS = new Set([
  "createdAt",
  "updatedAt",
  "white",
  "black",
  "result",
  "variant",
  "rated",
]);

const ENUM_VARIANT = new Set([
  "standard",
  "chess960",
  "threeCheck",
  "kingOfHill",
  "atomic",
]);
const ENUM_PLAY_AS = new Set(["white", "black"]);
const ENUM_RATING_POOL = new Set(["bullet", "blitz", "rapid", "classical"]);

const STRING_FIELDS = [
  "event",
  "site",
  "date",
  "round",
  "white",
  "black",
  "result",
  "currentPosition",
  "timeControl",
  "utcDate",
  "utcTime",
  "startTime",
  "endDate",
  "endTime",
  "timezone",
  "eco",
  "ecoUrl",
  "link",
  "termination",
  "whiteUrl",
  "whiteCountry",
  "whiteTitle",
  "blackUrl",
  "blackCountry",
  "blackTitle",
  "moveText",
  "pgn",
  "opponent",
];

const NUMBER_FIELDS = [
  "whiteElo",
  "blackElo",
  "ratingBefore",
  "ratingAfter",
  "ratingDelta",
  "ratingDeviationBefore",
  "ratingDeviationAfter",
  "ratingDeviationDelta",
  "volatilityBefore",
  "volatilityAfter",
  "volatilityDelta",
  "opponentRatingBefore",
  "opponentRatingAfter",
  "opponentRatingDelta",
  "opponentRatingDeviationBefore",
  "opponentRatingDeviationAfter",
  "opponentRatingDeviationDelta",
  "opponentVolatilityBefore",
  "opponentVolatilityAfter",
  "opponentVolatilityDelta",
  "opponentLevel",
  "durationMs",
];

const BOOLEAN_FIELDS = ["rated", "isProvisional", "opponentIsProvisional"];

function withSource(docs, source) {
  return (docs || []).map((doc) => ({ ...doc, source }));
}

function sortValueForField(doc, field) {
  const value = doc?.[field];
  if (value === null || value === undefined) return null;
  if (field === "createdAt" || field === "updatedAt") {
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value === "string") return value.toLowerCase();
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "object" && typeof value.toString === "function") {
    return value.toString();
  }
  return value;
}

function compareByField(a, b, field, order) {
  const left = sortValueForField(a, field);
  const right = sortValueForField(b, field);
  if (left === null && right === null) return 0;
  if (left === null) return 1 * order;
  if (right === null) return -1 * order;
  if (left < right) return -1 * order;
  if (left > right) return 1 * order;
  return 0;
}

async function fetchCombinedGames({ query, sortBy, sortOrder, skip, limit }) {
  const fetchLimit = Math.max(1, skip + limit);
  const [historyGames, chess960Games] = await Promise.all([
    History.find(query)
      .populate("userId", "fullName email")
      .sort({ [sortBy]: sortOrder, _id: -1 })
      .limit(fetchLimit)
      .lean(),
    History960.find(query)
      .populate("userId", "fullName email")
      .sort({ [sortBy]: sortOrder, _id: -1 })
      .limit(fetchLimit)
      .lean(),
  ]);

  const combined = [
    ...withSource(historyGames, "history"),
    ...withSource(chess960Games, "history960"),
  ];

  combined.sort((a, b) => {
    const primary = compareByField(a, b, sortBy, sortOrder);
    if (primary !== 0) return primary;
    return compareByField(a, b, "_id", -1);
  });

  const deduped = [];
  const seen = new Set();
  for (const game of combined) {
    const id = String(game?._id || "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push(game);
  }

  const paged = deduped.slice(skip, skip + limit);
  return applyDeletedUserAliasesToGames(paged);
}

async function findAdminGameById(gameId) {
  const game = await History.findById(gameId)
    .populate("userId", "fullName email")
    .lean();
  if (game) {
    const normalizedGame = await applyDeletedUserAliasesToGame(game);
    return { game: { ...normalizedGame, source: "history" }, source: "history" };
  }
  const chess960Game = await History960.findById(gameId)
    .populate("userId", "fullName email")
    .lean();
  if (chess960Game) {
    const normalizedGame = await applyDeletedUserAliasesToGame(chess960Game);
    return {
      game: { ...normalizedGame, source: "history960" },
      source: "history960",
    };
  }
  return { game: null, source: null };
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return null;
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeVariant(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "standard") return "standard";
  if (normalized === "chess960") return "chess960";
  if (
    normalized === "atomic" ||
    normalized === "atomicchess" ||
    normalized === "atomic-chess" ||
    normalized === "atomic_chess"
  ) {
    return "atomic";
  }
  if (
    normalized === "threecheck" ||
    normalized === "three-check" ||
    normalized === "three_check"
  ) {
    return "threeCheck";
  }
  if (
    normalized === "kingofhill" ||
    normalized === "king-of-hill" ||
    normalized === "king_of_hill"
  ) {
    return "kingOfHill";
  }
  return null;
}

function sanitizeGamePayload(payload, { partial = false } = {}) {
  const data = {};

  if (!partial || payload.userId !== undefined) {
    if (!payload.userId && !partial) {
      return { error: "userId is required" };
    }
    if (payload.userId !== undefined) {
      if (!ObjectId.isValid(payload.userId)) {
        return { error: "Invalid userId" };
      }
      data.userId = payload.userId;
    }
  }

  for (const field of STRING_FIELDS) {
    if (payload[field] === undefined) continue;
    if (payload[field] === null) {
      data[field] = "";
      continue;
    }
    data[field] = String(payload[field]).trim();
  }

  for (const field of NUMBER_FIELDS) {
    if (payload[field] === undefined || payload[field] === null) continue;
    const parsed = toNumber(payload[field]);
    if (parsed === null) {
      return { error: `Invalid number for ${field}` };
    }
    data[field] = parsed;
  }

  for (const field of BOOLEAN_FIELDS) {
    if (payload[field] === undefined || payload[field] === null) continue;
    const parsed = toBoolean(payload[field]);
    if (parsed === null) {
      return { error: `Invalid boolean for ${field}` };
    }
    data[field] = parsed;
  }

  if (payload.variant !== undefined) {
    const variant = normalizeVariant(payload.variant);
    if (variant === null) {
      return {
        error:
          "variant must be standard, chess960, threeCheck, kingOfHill, or atomic",
      };
    }
    if (variant !== undefined) {
      data.variant = variant;
    }
  }

  if (payload.playAs !== undefined) {
    const normalized = String(payload.playAs).trim().toLowerCase();
    if (!ENUM_PLAY_AS.has(normalized)) {
      return { error: "playAs must be white or black" };
    }
    data.playAs = normalized;
  }

  if (payload.ratingPool !== undefined) {
    if (payload.ratingPool === null || payload.ratingPool === "") {
      data.ratingPool = null;
    } else {
      const normalized = String(payload.ratingPool).trim().toLowerCase();
      if (!ENUM_RATING_POOL.has(normalized)) {
        return {
          error: "ratingPool must be bullet, blitz, rapid, or classical",
        };
      }
      data.ratingPool = normalized;
    }
  }

  if (payload.moves !== undefined) {
    if (!Array.isArray(payload.moves)) {
      return { error: "moves must be an array of strings" };
    }
    data.moves = payload.moves
      .map((move) => String(move || "").trim())
      .filter(Boolean);
    if (data.moves.length < MIN_STORED_MOVES) {
      return {
        error: `Games must have at least ${MIN_STORED_MOVES} moves`,
      };
    }
  }

  if (payload.moveTimes !== undefined) {
    if (!Array.isArray(payload.moveTimes)) {
      return { error: "moveTimes must be an array of numbers" };
    }
    const parsedMoveTimes = [];
    for (const time of payload.moveTimes) {
      const parsed = toNumber(time);
      if (parsed === null) {
        return { error: "moveTimes must contain only numbers" };
      }
      parsedMoveTimes.push(parsed);
    }
    data.moveTimes = parsedMoveTimes;
  }

  if (payload.analysis !== undefined) {
    if (!Array.isArray(payload.analysis)) {
      return { error: "analysis must be an array" };
    }
    const parsedAnalysis = [];
    for (const entry of payload.analysis) {
      if (!entry || typeof entry !== "object") {
        return { error: "analysis entries must be objects" };
      }
      const ply = toNumber(entry.ply);
      const cp = entry.cp === undefined || entry.cp === null ? undefined : toNumber(entry.cp);
      const mate =
        entry.mate === undefined || entry.mate === null
          ? undefined
          : toNumber(entry.mate);
      if (ply === null || cp === null || mate === null) {
        return { error: "analysis entries must have numeric ply/cp/mate values" };
      }
      parsedAnalysis.push({
        ply,
        ...(cp !== undefined ? { cp } : {}),
        ...(mate !== undefined ? { mate } : {}),
      });
    }
    data.analysis = parsedAnalysis;
  }

  if (!partial) {
    if (!data.white) return { error: "white is required" };
    if (!data.black) return { error: "black is required" };
    if (!data.result) return { error: "result is required" };
    if (!data.playAs) return { error: "playAs is required" };
    if (!Array.isArray(data.moves) || data.moves.length < MIN_STORED_MOVES) {
      return {
        error: `moves is required and must contain at least ${MIN_STORED_MOVES} moves`,
      };
    }
  } else {
    if (payload.white !== undefined && !data.white) {
      return { error: "white cannot be empty" };
    }
    if (payload.black !== undefined && !data.black) {
      return { error: "black cannot be empty" };
    }
    if (payload.result !== undefined && !data.result) {
      return { error: "result cannot be empty" };
    }
  }

  return { data };
}

function buildAdminGameQuery(rawQuery) {
  const {
    search = "",
    variant = "",
    result = "",
    rated = "",
    userId = "",
  } = rawQuery;

  const query = {};

  const normalizedSearch = String(search).trim();
  if (normalizedSearch) {
    query.$or = [
      { white: { $regex: normalizedSearch, $options: "i" } },
      { black: { $regex: normalizedSearch, $options: "i" } },
      { event: { $regex: normalizedSearch, $options: "i" } },
      { opponent: { $regex: normalizedSearch, $options: "i" } },
      { eco: { $regex: normalizedSearch, $options: "i" } },
    ];
  }

  const normalizedVariant = normalizeVariant(variant);
  if (normalizedVariant) {
    if (normalizedVariant === "standard") {
      query.$and = [
        ...(query.$and || []),
        {
          $or: [
            { variant: "standard" },
            { variant: { $exists: false } },
            { variant: null },
            { variant: "" },
          ],
        },
      ];
    } else {
      query.variant = normalizedVariant;
    }
  }

  const normalizedResult = String(result).trim();
  if (normalizedResult) query.result = normalizedResult;

  const ratedValue = toBoolean(rated);
  if (ratedValue !== null) {
    if (ratedValue === false) {
      query.$and = [
        ...(query.$and || []),
        {
          $or: [
            { rated: false },
            { rated: { $exists: false } },
            { rated: null },
          ],
        },
      ];
    } else {
      query.rated = true;
    }
  }

  const normalizedUserId = String(userId).trim();
  if (normalizedUserId) {
    if (ObjectId.isValid(normalizedUserId)) {
      query.userId = normalizedUserId;
    } else {
      query.userId = "__invalid__";
    }
  }

  return query;
}

// Get all games
router.get("/", adminAuthMiddleware, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip =
      req.query.skip !== undefined
        ? Math.max(0, Number(req.query.skip) || 0)
        : (page - 1) * limit;

    const sortBy = String(req.query.sortBy || "createdAt");
    const sortOrder =
      String(req.query.sortOrder || "desc").toLowerCase() === "asc" ? 1 : -1;
    const safeSortBy = ALLOWED_SORT_FIELDS.has(sortBy) ? sortBy : "createdAt";

    const query = buildAdminGameQuery(req.query);

    const [historyCount, chess960Count, games] = await Promise.all([
      History.countDocuments(query),
      History960.countDocuments(query),
      fetchCombinedGames({
        query,
        sortBy: safeSortBy,
        sortOrder,
        skip,
        limit,
      }),
    ]);

    const total = historyCount + chess960Count;

    res.json({
      games,
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
      total,
    });
  } catch (err) {
    console.error("Admin get games error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get game stats for dashboard cards
router.get("/stats", adminAuthMiddleware, async (req, res) => {
  try {
    const standardQuery = {
      $or: [
        { variant: "standard" },
        { variant: { $exists: false } },
        { variant: null },
        { variant: "" },
      ],
    };
    const recentQuery = {
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    };

    const [
      historyTotal,
      chess960Total,
      historyRated,
      chess960Rated,
      historyStandard,
      chess960Standard,
      historyChess960,
      chess960Chess960,
      historyThreeCheck,
      chess960ThreeCheck,
      historyKingOfHill,
      chess960KingOfHill,
      historyAtomic,
      chess960Atomic,
      historyRecent,
      chess960Recent,
      historyResults,
      chess960Results,
    ] = await Promise.all([
      History.countDocuments(),
      History960.countDocuments(),
      History.countDocuments({ rated: true }),
      History960.countDocuments({ rated: true }),
      History.countDocuments(standardQuery),
      History960.countDocuments(standardQuery),
      History.countDocuments({ variant: "chess960" }),
      History960.countDocuments({ variant: "chess960" }),
      History.countDocuments({ variant: "threeCheck" }),
      History960.countDocuments({ variant: "threeCheck" }),
      History.countDocuments({ variant: "kingOfHill" }),
      History960.countDocuments({ variant: "kingOfHill" }),
      History.countDocuments({ variant: "atomic" }),
      History960.countDocuments({ variant: "atomic" }),
      History.countDocuments(recentQuery),
      History960.countDocuments(recentQuery),
      History.aggregate([{ $group: { _id: "$result", count: { $sum: 1 } } }]),
      History960.aggregate([{ $group: { _id: "$result", count: { $sum: 1 } } }]),
    ]);

    const total = historyTotal + chess960Total;
    const rated = historyRated + chess960Rated;
    const standard = historyStandard + chess960Standard;
    const chess960 = historyChess960 + chess960Chess960;
    const threeCheck = historyThreeCheck + chess960ThreeCheck;
    const kingOfHill = historyKingOfHill + chess960KingOfHill;
    const atomic = historyAtomic + chess960Atomic;
    const recent24h = historyRecent + chess960Recent;
    const results = [...historyResults, ...chess960Results];

    const byResult = { "1-0": 0, "0-1": 0, "1/2-1/2": 0, other: 0 };
    for (const item of results) {
      const key = item?._id;
      if (key === "1-0" || key === "0-1" || key === "1/2-1/2") {
        byResult[key] = item.count;
      } else {
        byResult.other += item.count;
      }
    }

    res.json({
      total,
      rated,
      unrated: total - rated,
      byVariant: { standard, chess960, threeCheck, kingOfHill, atomic },
      byResult,
      recent24h,
    });
  } catch (err) {
    console.error("Admin get game stats error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Export games as CSV
router.get("/export/csv", adminAuthMiddleware, async (req, res) => {
  try {
    const query = buildAdminGameQuery(req.query);
    const [historyGames, chess960Games] = await Promise.all([
      History.find(query)
        .populate("userId", "fullName email")
        .sort({ createdAt: -1 })
        .limit(5000)
        .lean(),
      History960.find(query)
        .populate("userId", "fullName email")
        .sort({ createdAt: -1 })
        .limit(5000)
        .lean(),
    ]);

    const combined = [
      ...withSource(historyGames, "history"),
      ...withSource(chess960Games, "history960"),
    ].sort((a, b) => compareByField(a, b, "createdAt", -1));

    const games = [];
    const seen = new Set();
    for (const game of combined) {
      const id = String(game?._id || "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      games.push(game);
      if (games.length >= 5000) break;
    }

    const headers = [
      "ID",
      "Created At",
      "Owner Name",
      "Owner Email",
      "White",
      "Black",
      "Result",
      "Variant",
      "Rated",
      "Time Control",
      "Moves",
      "Termination",
    ];

    const escapeCell = (value) =>
      String(value ?? "")
        .replace(/"/g, '""')
        .replace(/\r?\n/g, " ");

    const rows = games.map((game) => [
      game._id,
      game.createdAt ? new Date(game.createdAt).toISOString() : "",
      game.userId?.fullName || "",
      game.userId?.email || "",
      game.white || "",
      game.black || "",
      game.result || "",
      game.variant || "standard",
      game.rated ? "Yes" : "No",
      game.timeControl || "",
      Array.isArray(game.moves) ? game.moves.length : 0,
      game.termination || "",
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${escapeCell(cell)}"`).join(",")),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=games-export.csv");
    res.send(csv);
  } catch (err) {
    console.error("Admin export games error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get single game by ID
router.get("/:gameId", adminAuthMiddleware, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.gameId)) {
      return res.status(400).json({ error: "Invalid game ID" });
    }

    const { game } = await findAdminGameById(req.params.gameId);

    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    res.json({ game });
  } catch (err) {
    console.error("Admin get single game error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Create game
router.post("/", adminAuthMiddleware, async (req, res) => {
  try {
    const { data, error } = sanitizeGamePayload(req.body, { partial: false });
    if (error) {
      return res.status(400).json({ error });
    }

    const targetModel = data.variant === "chess960" ? History960 : History;
    let created;
    try {
      created = await targetModel.create(data);
    } catch (primaryError) {
      const shouldRetryInStandard =
        data.variant === "chess960" &&
        targetModel === History960 &&
        primaryError?.name !== "ValidationError";
      if (!shouldRetryInStandard) {
        throw primaryError;
      }
      created = await History.create(data);
    }
    const { game } = await findAdminGameById(created._id);
    res.status(201).json({ game });
  } catch (err) {
    console.error("Admin create game error:", err);
    if (err?.name === "ValidationError") {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: "Server error" });
  }
});

// Update game
router.put("/:gameId", adminAuthMiddleware, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.gameId)) {
      return res.status(400).json({ error: "Invalid game ID" });
    }

    const { data, error } = sanitizeGamePayload(req.body, { partial: true });
    if (error) {
      return res.status(400).json({ error });
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No valid fields provided" });
    }

    let game = await History.findByIdAndUpdate(req.params.gameId, data, {
      new: true,
      runValidators: true,
    })
      .populate("userId", "fullName email")
      .lean();

    if (!game) {
      game = await History960.findByIdAndUpdate(req.params.gameId, data, {
        new: true,
        runValidators: true,
      })
        .populate("userId", "fullName email")
        .lean();
    }

    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    res.json({ game });
  } catch (err) {
    console.error("Admin update game error:", err);
    if (err?.name === "ValidationError") {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: "Server error" });
  }
});

// Delete game
router.delete("/:gameId", adminAuthMiddleware, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.gameId)) {
      return res.status(400).json({ error: "Invalid game ID" });
    }

    let game = await History.findByIdAndDelete(req.params.gameId).lean();
    if (!game) {
      game = await History960.findByIdAndDelete(req.params.gameId).lean();
    }
    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    res.json({ success: true, message: "Game deleted successfully" });
  } catch (err) {
    console.error("Admin delete game error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
