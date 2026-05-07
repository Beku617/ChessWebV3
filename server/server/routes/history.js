import { Router } from "express";
import mongoose from "mongoose";
import { ActiveGameSession, History, History960, User } from "../models/index.js";
import { authMiddleware, optionalAuthMiddleware } from "../middleware/index.js";
import {
  canViewerAccessUser,
  haveBlockedUsersListRelation,
} from "../utils/visibility.js";
import {
  MIN_REAL_GAME_PLIES,
  shouldPersistHistoryByPlies,
} from "../utils/gameLifecyclePolicy.js";
import {
  applyDeletedUserAliasesToGame,
  applyDeletedUserAliasesToGames,
} from "../utils/historyPlayers.js";

const router = Router();
const MIN_STORED_MOVES = MIN_REAL_GAME_PLIES;
const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 100;
const MAX_HISTORY_SKIP = 5000;
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
const UNRATED_VARIANTS = new Set([
  "chess960",
  "threeCheck",
  "kingOfHill",
  "atomic",
]);

function normalizeVariant(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (
    normalized === "atomic" ||
    normalized === "atomicchess" ||
    normalized === "atomic-chess" ||
    normalized === "atomic_chess"
  ) {
    return "atomic";
  }
  if (
    normalized === "kingofhill" ||
    normalized === "kingofthehill" ||
    normalized === "king-of-hill" ||
    normalized === "king_of_hill" ||
    normalized === "king-of-the-hill" ||
    normalized === "king_of_the_hill"
  ) {
    return "kingOfHill";
  }
  if (
    normalized === "threecheck" ||
    normalized === "three-check" ||
    normalized === "three_check"
  ) {
    return "threeCheck";
  }
  if (normalized === "fourplayer" || normalized === "four_player") {
    return "fourPlayer";
  }
  return normalized === "chess960" ? "chess960" : "standard";
}

function detectVariantFromEvent(event) {
  const text = String(event || "");
  if (/four[\s_-]?player|4[\s_-]?player/i.test(text)) {
    return "fourPlayer";
  }
  if (/atomic(\s|-|_)?chess|atomic/i.test(text)) {
    return "atomic";
  }
  if (/king[\s_-]?of[\s_-]?hill/i.test(text)) {
    return "kingOfHill";
  }
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

function normalizeSaveKey(value) {
  return String(value || "")
    .trim()
    .slice(0, 120);
}

function normalizePagination(query) {
  const parsedLimit = Number.parseInt(String(query?.limit ?? ""), 10);
  const parsedSkip = Number.parseInt(String(query?.skip ?? ""), 10);

  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), MAX_HISTORY_LIMIT)
    : DEFAULT_HISTORY_LIMIT;
  const skip = Number.isFinite(parsedSkip) ? Math.max(parsedSkip, 0) : 0;

  return { limit, skip };
}

async function loadMergedHistoryPage(userId, limit, skip) {
  const fetchWindow = skip + limit;
  const [standardGames, chess960Games, standardTotal, chess960Total] =
    await Promise.all([
      History.find({ userId }).sort({ createdAt: -1 }).limit(fetchWindow).lean(),
      History960.find({ userId }).sort({ createdAt: -1 }).limit(fetchWindow).lean(),
      History.countDocuments({ userId }),
      History960.countDocuments({ userId }),
    ]);

  const games = [...standardGames, ...chess960Games]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(skip, skip + limit);
  const total = standardTotal + chess960Total;

  return { games, total };
}

async function resolveHistoryPlayerLinks(requestUserId, playAs, link) {
  let whiteUserId = playAs === "white" ? requestUserId : null;
  let blackUserId = playAs === "black" ? requestUserId : null;
  let sessionInitialFen = "";
  const gameId = String(link || "").trim();
  if (!gameId) {
    return { whiteUserId, blackUserId, sessionInitialFen };
  }

  const session = await ActiveGameSession.findOne({ gameId })
    .select("whitePlayerId blackPlayerId white.userId black.userId initialFen")
    .lean()
    .catch(() => null);
  if (!session) {
    return { whiteUserId, blackUserId, sessionInitialFen };
  }

  whiteUserId =
    normalizeObjectId(session.whitePlayerId || session.white?.userId) || whiteUserId;
  blackUserId =
    normalizeObjectId(session.blackPlayerId || session.black?.userId) || blackUserId;
  sessionInitialFen = String(session.initialFen || "").trim();

  return { whiteUserId, blackUserId, sessionInitialFen };
}

function normalizeHistoryDocForVariant(historyDoc) {
  if (!UNRATED_VARIANTS.has(historyDoc?.variant)) return historyDoc;

  // Unrated variants are stored without rating metadata.
  historyDoc.rated = false;
  historyDoc.isProvisional = false;
  historyDoc.opponentIsProvisional = false;
  historyDoc.ratingPool = undefined;
  for (const field of CHESS960_STRIPPED_FIELDS) {
    historyDoc[field] = undefined;
  }

  if (historyDoc.variant === "chess960") {
    historyDoc.eco = "";
    historyDoc.ecoUrl = "";
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
      clientSaveKey,
    } = req.body;

    const normalizedMoves = normalizeMoves(moves);
    const normalizedLink = String(link || "").trim();
    const normalizedClientSaveKey = normalizeSaveKey(clientSaveKey);

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
    if (resolvedVariant === "fourPlayer") {
      return res.status(400).json({
        error: "4-player games are excluded from rating and history.",
      });
    }
    const preferredModel =
      resolvedVariant === "chess960" ? History960 : History;

    if (normalizedClientSaveKey || normalizedLink) {
      const dedupeQuery = { userId: requestUserId };
      if (normalizedClientSaveKey) dedupeQuery.clientSaveKey = normalizedClientSaveKey;
      if (!normalizedClientSaveKey) dedupeQuery.link = normalizedLink;

      let existing = await preferredModel
        .findOne(dedupeQuery)
        .select("_id")
        .sort({ createdAt: -1 })
        .lean();

      if (!existing && resolvedVariant === "chess960") {
        existing = await History.findOne(dedupeQuery)
          .select("_id")
          .sort({ createdAt: -1 })
          .lean();
      }

      if (existing?._id) {
        return res.json({ success: true, historyId: existing._id, deduplicated: true });
      }
    }

    const { whiteUserId, blackUserId, sessionInitialFen } =
      await resolveHistoryPlayerLinks(
      requestUserId,
      playAs,
      normalizedLink,
    );
    const normalizedStartingFen = String(startingFen || "").trim();
    const effectiveStartingFen =
      resolvedVariant === "chess960"
        ? sessionInitialFen || normalizedStartingFen
        : normalizedStartingFen || sessionInitialFen;

    const historyDoc = {
      userId: requestUserId,
      whiteUserId,
      blackUserId,
      whiteNameSnapshot: white,
      blackNameSnapshot: black,
      event,
      site,
      date,
      round,
      white,
      black,
      result,
      variant: resolvedVariant,
      currentPosition,
      startingFen: effectiveStartingFen,
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
      link: normalizedLink,
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
      clientSaveKey: normalizedClientSaveKey,
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
    const owner = await User.findById(userId)
      .select("_id banned blockedUsers")
      .lean();
    if (!owner || owner.banned) {
      return res.status(404).json({ error: "User not found" });
    }
    const hasBlockedUsersListRelation = await haveBlockedUsersListRelation(
      viewerId,
      owner._id,
      { userBDoc: owner },
    );
    const canAccess =
      !hasBlockedUsersListRelation &&
      (await canViewerAccessUser(viewerId, owner._id));
    if (!canAccess) {
      return res.status(404).json({ error: "User not found" });
    }

    const { limit, skip } = normalizePagination(req.query);
    if (skip > MAX_HISTORY_SKIP) {
      return res.status(400).json({ error: `skip cannot exceed ${MAX_HISTORY_SKIP}` });
    }

    const { games, total } = await loadMergedHistoryPage(userId, limit, skip);
    const normalizedGames = await applyDeletedUserAliasesToGames(games);

    res.json({ games: normalizedGames, total });
  } catch (err) {
    console.error("Get user history error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get game history for current user
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { limit, skip } = normalizePagination(req.query);
    const userId = normalizeObjectId(req.user?.userId);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (skip > MAX_HISTORY_SKIP) {
      return res.status(400).json({ error: `skip cannot exceed ${MAX_HISTORY_SKIP}` });
    }

    const { games, total } = await loadMergedHistoryPage(userId, limit, skip);
    const normalizedGames = await applyDeletedUserAliasesToGames(games);

    res.json({ games: normalizedGames, total });
  } catch (err) {
    console.error("Get history error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get single game by ID
router.get("/:id", optionalAuthMiddleware, async (req, res) => {
  try {
    const gameId = normalizeObjectId(req.params.id);
    const viewerId = normalizeObjectId(req.user?.userId);
    if (!gameId) {
      return res.status(400).json({ error: "Invalid game id" });
    }

    let game = await History.findById(gameId).lean();
    if (!game) {
      game = await History960.findById(gameId).lean();
    }

    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    const ownerId = normalizeObjectId(game.userId);
    if (ownerId) {
      const owner = await User.findById(ownerId)
        .select("_id banned blockedUsers")
        .lean();
      if (!owner || owner.banned) {
        return res.status(404).json({ error: "Game not found" });
      }
      const hasBlockedUsersListRelation = await haveBlockedUsersListRelation(
        viewerId,
        owner._id,
        { userBDoc: owner },
      );
      const canAccess =
        !hasBlockedUsersListRelation &&
        (await canViewerAccessUser(viewerId, owner._id));
      if (!canAccess) {
        return res.status(404).json({ error: "Game not found" });
      }
    }

    const normalizedGame = await applyDeletedUserAliasesToGame(game);
    res.json({ game: normalizedGame });
  } catch (err) {
    console.error("Get game error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
