import mongoose from "mongoose";
import { History, History960 } from "../models/index.js";

const COMMUNITY_GAME_SELECT = [
  "_id",
  "variant",
  "startingFen",
  "currentPosition",
  "moves",
  "result",
  "timeControl",
  "eco",
  "event",
  "white",
  "black",
  "whiteElo",
  "blackElo",
  "playAs",
  "opponent",
  "rated",
  "createdAt",
].join(" ");

function normalizeObjectId(value) {
  const text = String(value || "").trim();
  return mongoose.Types.ObjectId.isValid(text) ? text : null;
}

function normalizeVariant(value) {
  const normalized = String(value || "").trim().toLowerCase();
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
    normalized === "kingofhill" ||
    normalized === "king-of-hill" ||
    normalized === "king_of_hill"
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
  return "standard";
}

function normalizeMoves(moves) {
  if (!Array.isArray(moves)) return [];
  return moves.map((move) => String(move || "").trim()).filter(Boolean);
}

function toIsoOrNull(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
}

function toPerspectiveResult(result, playAs) {
  const normalizedResult = String(result || "").trim();
  const side = playAs === "black" ? "black" : "white";

  if (normalizedResult === "1-0") {
    return side === "white" ? "win" : "loss";
  }
  if (normalizedResult === "0-1") {
    return side === "black" ? "win" : "loss";
  }
  if (normalizedResult === "1/2-1/2") {
    return "draw";
  }
  return "unknown";
}

function buildSearchQuery(userId, search) {
  const query = { userId };
  const text = String(search || "").trim();
  if (!text) return query;

  const regex = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  query.$or = [
    { opponent: regex },
    { white: regex },
    { black: regex },
    { eco: regex },
    { event: regex },
    { timeControl: regex },
    { result: regex },
  ];
  return query;
}

export function buildCommunityGameSnapshot(gameDoc) {
  if (!gameDoc) return null;

  const moves = normalizeMoves(gameDoc.moves);
  const playAs = String(gameDoc.playAs || "").trim().toLowerCase() === "black"
    ? "black"
    : "white";

  return {
    sourceGameId: String(gameDoc._id || gameDoc.id || ""),
    variant: normalizeVariant(gameDoc.variant),
    startingFen: String(gameDoc.startingFen || ""),
    currentPosition: String(gameDoc.currentPosition || ""),
    moves,
    result: String(gameDoc.result || "*"),
    timeControl: String(gameDoc.timeControl || ""),
    eco: String(gameDoc.eco || ""),
    event: String(gameDoc.event || "NeonGambit Game"),
    white: String(gameDoc.white || "White"),
    black: String(gameDoc.black || "Black"),
    whiteElo: Number(gameDoc.whiteElo || 1200),
    blackElo: Number(gameDoc.blackElo || 1200),
    playAs,
    opponent: String(
      gameDoc.opponent || (playAs === "white" ? gameDoc.black : gameDoc.white) || "Opponent",
    ),
    rated: Boolean(gameDoc.rated),
    totalMoves: moves.length,
    playedAt: toIsoOrNull(gameDoc.createdAt),
  };
}

export function buildCommunityShareableGameDTO(gameDoc) {
  const snapshot = buildCommunityGameSnapshot(gameDoc);
  if (!snapshot) return null;

  return {
    id: snapshot.sourceGameId,
    opponent: snapshot.opponent,
    result: snapshot.result,
    perspectiveResult: toPerspectiveResult(snapshot.result, snapshot.playAs),
    playedAt: snapshot.playedAt,
    timeControl: snapshot.timeControl,
    eco: snapshot.eco,
    event: snapshot.event,
    white: snapshot.white,
    black: snapshot.black,
    whiteElo: snapshot.whiteElo,
    blackElo: snapshot.blackElo,
    playAs: snapshot.playAs,
    rated: snapshot.rated,
    totalMoves: snapshot.totalMoves,
    variant: snapshot.variant,
  };
}

export async function findShareableCommunityGameForUser(userId, gameId) {
  const normalizedUserId = normalizeObjectId(userId);
  const normalizedGameId = normalizeObjectId(gameId);
  if (!normalizedUserId || !normalizedGameId) return null;

  const query = { _id: normalizedGameId, userId: normalizedUserId };
  let game = await History.findOne(query).select(COMMUNITY_GAME_SELECT).lean();
  if (!game) {
    game = await History960.findOne(query).select(COMMUNITY_GAME_SELECT).lean();
  }
  return game || null;
}

export async function listShareableCommunityGamesForUser(
  userId,
  { search = "", limit = 24 } = {},
) {
  const normalizedUserId = normalizeObjectId(userId);
  if (!normalizedUserId) return [];

  const safeLimit = Math.min(48, Math.max(1, Number(limit) || 24));
  const query = buildSearchQuery(normalizedUserId, search);

  const [standardGames, chess960Games] = await Promise.all([
    History.find(query)
      .select(COMMUNITY_GAME_SELECT)
      .sort({ createdAt: -1, _id: -1 })
      .limit(safeLimit)
      .lean(),
    History960.find(query)
      .select(COMMUNITY_GAME_SELECT)
      .sort({ createdAt: -1, _id: -1 })
      .limit(safeLimit)
      .lean(),
  ]);

  return [...standardGames, ...chess960Games]
    .sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    })
    .slice(0, safeLimit)
    .map(buildCommunityShareableGameDTO)
    .filter(Boolean);
}
