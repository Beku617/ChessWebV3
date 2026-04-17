import { Router } from "express";
import mongoose from "mongoose";
import { History, History960, User } from "../models/index.js";
import { authMiddleware, optionalAuthMiddleware } from "../middleware/index.js";
import { canViewerAccessUser } from "../utils/visibility.js";
import {
  MIN_REAL_GAME_PLIES,
  shouldPersistHistoryByPlies,
} from "../utils/gameLifecyclePolicy.js";

const router = Router();
const MIN_STORED_MOVES = MIN_REAL_GAME_PLIES;
const { ObjectId } = mongoose.Types;
const CHESS960_STRIPPED_FIELDS = [
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
];

function normalizeVariant(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (
    normalized === "threecheck" ||
    normalized === "three-check" ||
    normalized === "three_check"
  ) {
    return "threeCheck";
  }
  return normalized === "chess960" ? "chess960" : "standard";
}

function detectVariantFromEvent(event) {
  const text = String(event || "");
  if (/three[\s_-]?check|3[\s_-]?check/i.test(text)) {
    return "threeCheck";
  }
  return /960|chess960/i.test(text) ? "chess960" : "standard";
}

function normalizeMoves(moves) {
  if (!Array.isArray(moves)) return [];
  return moves.map((move) => String(move || "").trim()).filter(Boolean);
}

function normalizeObjectId(value) {
  const text = String(value || "").trim();
  return ObjectId.isValid(text) ? text : null;
}

function normalizeHistoryDocForVariant(historyDoc) {
  if (historyDoc?.variant !== "chess960") return historyDoc;

  // Chess960 is stored as unrated history without opening metadata.
  historyDoc.rated = false;
  historyDoc.isProvisional = false;
  historyDoc.opponentIsProvisional = false;
  historyDoc.ratingPool = undefined;
  historyDoc.eco = "";
  historyDoc.ecoUrl = "";
  for (const field of CHESS960_STRIPPED_FIELDS) {
    historyDoc[field] = undefined;
  }
  return historyDoc;
}

// Save game history
router.post("/", authMiddleware, async (req, res) => {
  try {
    const requestUserId = normalizeObjectId(req.user?.userId);
    if (!requestUserId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const {
      event = "NeonGambit Game",
      site = "NeonGambit",
      date,
      round = "-",
      white,
      black,
      result,
      variant,
      currentPosition,
      startingFen = "",
      timeControl,
      utcDate,
      utcTime,
      startTime,
      endDate,
      endTime,
      whiteElo = 1200,
      blackElo = 1200,
      rated = false,
      ratingBefore,
      ratingAfter,
      ratingDelta,
      ratingDeviationBefore,
      ratingDeviationAfter,
      ratingDeviationDelta,
      volatilityBefore,
      volatilityAfter,
      volatilityDelta,
      isProvisional = false,
      opponentRatingBefore,
      opponentRatingAfter,
      opponentRatingDelta,
      opponentRatingDeviationBefore,
      opponentRatingDeviationAfter,
      opponentRatingDeviationDelta,
      opponentVolatilityBefore,
      opponentVolatilityAfter,
      opponentVolatilityDelta,
      opponentIsProvisional = false,
      ratingPool,
      timezone = "UTC",
      eco = "",
      ecoUrl = "",
      termination,
      link = "",
      whiteUrl = "",
      whiteCountry = "",
      whiteTitle = "",
      blackUrl = "",
      blackCountry = "",
      blackTitle = "",
      moves = [],
      moveText = "",
      pgn,
      playAs,
      opponent = "Stockfish",
      opponentLevel,
      durationMs,
      whiteCheckCount = 0,
      blackCheckCount = 0,
      analysis = [],
      moveTimes = [],
    } = req.body;

    const normalizedMoves = normalizeMoves(moves);

    if (!result || !playAs || !white || !black) {
      return res
        .status(400)
        .json({ error: "result, playAs, white, and black are required" });
    }

    if (!shouldPersistHistoryByPlies(normalizedMoves.length)) {
      return res.status(400).json({
        error: `Games with fewer than ${MIN_STORED_MOVES} moves are not stored`,
      });
    }

    const resolvedVariant = variant
      ? normalizeVariant(variant)
      : detectVariantFromEvent(event);
    const preferredModel =
      resolvedVariant === "chess960" ? History960 : History;

    const historyDoc = {
      userId: requestUserId,
      event,
      site,
      date,
      round,
      white,
      black,
      result,
      variant: resolvedVariant,
      currentPosition,
      startingFen,
      timeControl,
      utcDate,
      utcTime,
      startTime,
      endDate,
      endTime,
      whiteElo,
      blackElo,
      rated,
      ratingBefore,
      ratingAfter,
      ratingDelta,
      ratingDeviationBefore,
      ratingDeviationAfter,
      ratingDeviationDelta,
      volatilityBefore,
      volatilityAfter,
      volatilityDelta,
      isProvisional,
      opponentRatingBefore,
      opponentRatingAfter,
      opponentRatingDelta,
      opponentRatingDeviationBefore,
      opponentRatingDeviationAfter,
      opponentRatingDeviationDelta,
      opponentVolatilityBefore,
      opponentVolatilityAfter,
      opponentVolatilityDelta,
      opponentIsProvisional,
      ratingPool,
      timezone,
      eco,
      ecoUrl,
      link,
      termination,
      whiteUrl,
      whiteCountry,
      whiteTitle,
      blackUrl,
      blackCountry,
      blackTitle,
      moves: normalizedMoves,
      moveText,
      pgn,
      playAs,
      opponent,
      opponentLevel,
      durationMs,
      whiteCheckCount,
      blackCheckCount,
      analysis,
      moveTimes,
    };
    normalizeHistoryDocForVariant(historyDoc);

    let history;
    try {
      history = await preferredModel.create(historyDoc);
    } catch (primaryError) {
      const shouldRetryInStandard =
        resolvedVariant === "chess960" &&
        preferredModel === History960 &&
        primaryError?.name !== "ValidationError";

      if (!shouldRetryInStandard) {
        throw primaryError;
      }

      console.error(
        "History960 save failed; retrying in History collection:",
        primaryError,
      );
      history = await History.create(historyDoc);
    }

    res.json({ success: true, historyId: history._id });
  } catch (err) {
    console.error("History save error:", err);
    if (err?.name === "ValidationError") {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: "Server error" });
  }
});

// Get game history for a specific user (public unless either user has blocked the other)
router.get("/user/:userId", optionalAuthMiddleware, async (req, res) => {
  try {
    const userId = normalizeObjectId(req.params.userId);
    if (!userId) {
      return res.status(400).json({ error: "Invalid userId" });
    }
    const viewerId = normalizeObjectId(req.user?.userId);
    const owner = await User.findById(userId).select("_id banned").lean();
    if (!owner || owner.banned) {
      return res.status(404).json({ error: "User not found" });
    }
    const canAccess = await canViewerAccessUser(viewerId, owner._id);
    if (!canAccess) {
      return res.status(404).json({ error: "User not found" });
    }

    const { limit = 50, skip = 0 } = req.query;

    const [standardGames, chess960Games] = await Promise.all([
      History.find({ userId }).sort({ createdAt: -1 }).lean(),
      History960.find({ userId }).sort({ createdAt: -1 }).lean(),
    ]);

    const allGames = [...standardGames, ...chess960Games]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(Number(skip), Number(skip) + Number(limit));

    const total = standardGames.length + chess960Games.length;

    res.json({ games: allGames, total });
  } catch (err) {
    console.error("Get user history error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get game history for current user
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { limit = 50, skip = 0 } = req.query;
    const userId = normalizeObjectId(req.user?.userId);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const [standardGames, chess960Games] = await Promise.all([
      History.find({ userId }).sort({ createdAt: -1 }).lean(),
      History960.find({ userId }).sort({ createdAt: -1 }).lean(),
    ]);

    const allGames = [...standardGames, ...chess960Games]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(Number(skip), Number(skip) + Number(limit));

    const total = standardGames.length + chess960Games.length;

    res.json({ games: allGames, total });
  } catch (err) {
    console.error("Get history error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get single game by ID
router.get("/:id", optionalAuthMiddleware, async (req, res) => {
  try {
    const gameId = normalizeObjectId(req.params.id);
    if (!gameId) {
      return res.status(400).json({ error: "Invalid game id" });
    }
    const viewerId = normalizeObjectId(req.user?.userId);

    let game = await History.findById(gameId).lean();
    if (!game) {
      game = await History960.findById(gameId).lean();
    }

    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    const owner = await User.findById(game.userId).select("_id banned").lean();
    if (!owner || owner.banned) {
      return res.status(404).json({ error: "Game not found" });
    }
    const canAccess = await canViewerAccessUser(viewerId, owner._id);
    if (!canAccess) {
      return res.status(404).json({ error: "Game not found" });
    }

    res.json({ game });
  } catch (err) {
    console.error("Get game error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
