import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import http from "http";
import crypto from "crypto";
import { Server } from "socket.io";
import { Chess } from "chess.js";
import {
  FOUR_PLAYER_COLORS,
  createInitialFourPlayerState,
  applyFourPlayerMove,
  eliminateFourPlayerColor,
} from "./utils/fourPlayerEngine.js";
import { connectDB } from "./config/db.js";
import {
  Friend,
  RatingEvent,
  Tournament,
  TournamentGame,
  User,
} from "./models/index.js";
import {
  gamesFieldForPool,
  getRatingPoolForTimeControl,
  ratingFieldForPool,
} from "./utils/elo.js";
import {
  getAbortThresholdMs,
  resolveTerminalReason,
  shouldApplyRatedResult,
} from "./utils/gameLifecyclePolicy.js";
import {
  DEFAULT_GLICKO_RD,
  DEFAULT_GLICKO_VOLATILITY,
  lastRatedAtFieldForPool,
  rdFieldForPool,
  updateGlickoPair,
  volatilityFieldForPool,
} from "./utils/glicko2.js";
import {
  seedPuzzles,
  seedGamePageConfig,
  seedBots,
  seedLearn,
} from "./seeds/index.js";
import {
  markTournamentGameStarted,
  syncTournamentGameResultByGameId,
} from "./services/tournamentRuntime.js";
import {
  authRoutes,
  historyRoutes,
  puzzleRoutes,
  gameConfigRoutes,
  botsRoutes,
  adminRoutes,
  adminUsersRoutes,
  adminGamesRoutes,
  adminPuzzlesRoutes,
  adminBotsRoutes,
  featuredEventsRoutes,
  adminFeaturedEventsRoutes,
  communityRoutes,
  adminCommunityRoutes,
  adminGroupsRoutes,
  mediaRoutes,
  lichessRoutes,
  friendsRoutes,
  ratingsRoutes,
  tournamentRoutes,
  messagesRoutes,
  learnRoutes,
  adminLearnRoutes,
} from "./routes/index.js";
import { authMiddleware, requestSecurityMiddleware } from "./middleware/index.js";
import { migrateLegacyRuntimeMedia } from "./utils/runtimeMediaMigration.js";

const allowedOrigins = [
  "http://localhost:5173",
  "https://neongambit-chesswebv3.vercel.app",
];
const PORT = Number.parseInt(process.env.PORT || "3001", 10);
const BODY_LIMIT = process.env.BODY_LIMIT || "10mb";
const COOKIE_SECRET =
  process.env.COOKIE_SECRET ||
  process.env.COOKIES_SECRET ||
  "change-me-in-production-cookie-secret";

function isAllowedOrigin(origin) {
  return !origin || allowedOrigins.includes(origin);
}

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
  credentials: true,
};

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions,
});
const PUBLIC_API_ROUTES = new Set([
  "POST:/login",
  "POST:/register",
  "POST:/auth/google",
  "POST:/auth/facebook",
  "POST:/logout",
  "GET:/me",
  "GET:/oauth/config",
  "GET:/lichess/tv",
  "GET:/lichess/streamers",
  "POST:/admin/login",
  "POST:/admin/logout",
]);
const DB_STATE_LABELS = Object.freeze({
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
});

// expose socket.io instance for notification helpers
app.set("io", io);

const waitingQueues = new Map(); // key -> [{ socketId, rating, joinedAt, pool }]
const games = new Map(); // gameId -> { room, chess, players, playerUsers, timeControl, variant, chess960, isRated }
const fourPlayerQueues = new Map(); // key -> socket ids
const fourPlayerGames = new Map(); // gameId -> { room, state, playersByColor, socketToColor, timeControl }
const userSockets = new Map(); // userId -> Set<socketId>
const pendingChallenges = new Map(); // challengeId -> challenge metadata
const userPresence = new Map(); // userId -> { status, lastSeenAt, lastActiveAt, lastPersistedAt }
const INITIAL_MATCH_RANGE = 50;
const MATCH_RANGE_STEP = 25;
const MATCH_RANGE_STEP_SECONDS = 5;
const MAX_MATCH_RANGE = 500;
const PRESENCE_DB_WRITE_INTERVAL_MS = 45 * 1000;
const PRESENCE_VALID_STATUSES = new Set([
  "online",
  "offline",
  "searching_match",
  "in_game",
  "away",
]);

if (
  process.env.NODE_ENV === "production" &&
  !process.env.COOKIE_SECRET &&
  !process.env.COOKIES_SECRET
) {
  console.warn(
    "COOKIE_SECRET/COOKIES_SECRET is not set. Configure a strong secret in production.",
  );
}

// Middleware
app.use(helmet());
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));
app.use(cookieParser(COOKIE_SECRET));
app.use(cors(corsOptions));
app.use("/api", requestSecurityMiddleware);
app.use("/api", (req, res, next) => {
  if (req.method === "OPTIONS") return next();

  if (req.path.startsWith("/admin")) {
    return next();
  }

  const routeKey = `${String(req.method || "").toUpperCase()}:${String(req.path || "")}`;
  if (PUBLIC_API_ROUTES.has(routeKey)) {
    return next();
  }

  return authMiddleware(req, res, next);
});

app.get("/healthz", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "neongambit-server",
    db: DB_STATE_LABELS[mongoose.connection.readyState] || "unknown",
    timestamp: new Date().toISOString(),
  });
});

function runPostConnectTasks() {
  seedPuzzles().catch(console.error);
  seedGamePageConfig().catch(console.error);
  seedBots().catch(console.error);
  seedLearn().catch(console.error);
  migrateLegacyRuntimeMedia()
    .then((result) => {
      const summaries = [
        ["community", result?.community],
        ["messages", result?.messages],
        ["bots", result?.bots],
      ];
      summaries.forEach(([label, summary]) => {
        if (Number(summary?.migrated || 0) > 0) {
          console.log(
            `Migrated ${summary.migrated}/${summary.scanned} legacy ${label} media records to persistent storage.`,
          );
        }
      });
    })
    .catch((error) => {
      console.error("Runtime media migration error:", error);
    });
}

// API Routes
app.use("/api", authRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/puzzles", puzzleRoutes);
app.use("/api/game-config", gameConfigRoutes);
app.use("/api/bots", botsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/users", adminUsersRoutes);
app.use("/api/admin/games", adminGamesRoutes);
app.use("/api/admin/puzzles", adminPuzzlesRoutes);
app.use("/api/admin/bots", adminBotsRoutes);
app.use("/api/admin/featured-events", adminFeaturedEventsRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/community", communityRoutes);
app.use("/api/admin/community", adminCommunityRoutes);
app.use("/api/admin/groups", adminGroupsRoutes);
app.use("/api/featured-events", featuredEventsRoutes);
app.use("/api/lichess", lichessRoutes);
app.use("/api/friends", friendsRoutes);
app.use("/api/ratings", ratingsRoutes);
app.use("/api/tournaments", tournamentRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/learn", learnRoutes);
app.use("/api/admin/learn", adminLearnRoutes);

function getQueueKey(timeControl, variant) {
  const initial = Number(timeControl?.initial ?? 300);
  const increment = Number(timeControl?.increment ?? 0);
  const normalizedVariant = normalizeVariant(variant);
  return `${normalizedVariant}:${initial}+${increment}`;
}

function getQueue(key) {
  if (!waitingQueues.has(key)) {
    waitingQueues.set(key, []);
  }
  return waitingQueues.get(key);
}

function getExpandedMatchRange(waitMs) {
  const safeWaitMs = Math.max(0, Number(waitMs) || 0);
  const steps = Math.floor(safeWaitMs / (MATCH_RANGE_STEP_SECONDS * 1000));
  return Math.min(
    MAX_MATCH_RANGE,
    INITIAL_MATCH_RANGE + steps * MATCH_RANGE_STEP,
  );
}

function pruneMatchQueue(queueKey) {
  const queue = getQueue(queueKey);
  const nextQueue = [];

  for (const rawEntry of queue) {
    const entry =
      typeof rawEntry === "string"
        ? { socketId: rawEntry, rating: 1200, joinedAt: Date.now() }
        : rawEntry;
    const socket = io.sockets.sockets.get(entry.socketId);
    if (
      socket &&
      socket.data.inQueue &&
      !socket.data.gameId &&
      !socket.data.fourPlayerGameId &&
      socket.data.queueKey === queueKey
    ) {
      nextQueue.push(entry);
    }
  }

  waitingQueues.set(queueKey, nextQueue);
  return nextQueue;
}

function parseCookies(header = "") {
  return header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const eqIndex = part.indexOf("=");
      if (eqIndex === -1) return acc;
      const key = part.slice(0, eqIndex).trim();
      const value = part.slice(eqIndex + 1).trim();
      acc[key] = value;
      return acc;
    }, {});
}

function getSocketAuth(socket) {
  try {
    const cookieHeader = socket.handshake?.headers?.cookie || "";
    const cookies = parseCookies(cookieHeader);
    const rawToken = cookies.authToken;
    if (!rawToken) return null;

    const decodedToken = decodeURIComponent(rawToken);
    const unsignedToken = cookieParser.signedCookie(decodedToken, COOKIE_SECRET);

    if (unsignedToken === false) {
      return null;
    }

    const tokenPayload =
      typeof unsignedToken === "string" ? unsignedToken : decodedToken;
    return JSON.parse(tokenPayload);
  } catch {
    return null;
  }
}

function normalizeId(value) {
  if (!value) return "";
  return String(value);
}

async function areUsersFriends(userA, userB) {
  const a = normalizeId(userA);
  const b = normalizeId(userB);
  if (!a || !b || a === b) return false;
  const edge = await Friend.findOne({ userId: a, friendId: b })
    .select("_id")
    .lean();
  return !!edge;
}

function getUserRoom(userId) {
  return `user:${userId}`;
}

function normalizePresenceStatus(value) {
  const status = String(value || "offline").trim().toLowerCase();
  return PRESENCE_VALID_STATUSES.has(status) ? status : "offline";
}

function toIsoOrNull(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
}

function ensurePresenceEntry(userId) {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) return null;
  if (!userPresence.has(normalizedUserId)) {
    userPresence.set(normalizedUserId, {
      status: "offline",
      lastSeenAt: null,
      lastActiveAt: null,
      lastPersistedAt: 0,
    });
  }
  return userPresence.get(normalizedUserId);
}

function getPresencePayload(userId) {
  const entry = ensurePresenceEntry(userId);
  if (!entry) {
    return {
      status: "offline",
      lastSeenAt: null,
      lastActiveAt: null,
    };
  }
  return {
    status: normalizePresenceStatus(entry.status),
    lastSeenAt: toIsoOrNull(entry.lastSeenAt),
    lastActiveAt: toIsoOrNull(entry.lastActiveAt),
  };
}

function emitPresenceState(userId) {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) return;
  const socketIds = userSockets.get(normalizedUserId);
  if (!socketIds || socketIds.size === 0) return;

  const payload = getPresencePayload(normalizedUserId);
  for (const socketId of socketIds) {
    io.to(socketId).emit("presenceState", payload);
  }
}

function persistPresence(userId, force = false) {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) return;
  const entry = ensurePresenceEntry(normalizedUserId);
  if (!entry) return;

  const now = Date.now();
  if (
    !force &&
    now - Number(entry.lastPersistedAt || 0) < PRESENCE_DB_WRITE_INTERVAL_MS
  ) {
    return;
  }

  entry.lastPersistedAt = now;
  const update = {
    presenceStatus: normalizePresenceStatus(entry.status),
    lastActiveAt: entry.lastActiveAt || null,
  };
  if (entry.lastSeenAt) {
    update.lastSeenAt = entry.lastSeenAt;
  }
  if (update.presenceStatus === "offline" && !update.lastSeenAt) {
    update.lastSeenAt = new Date();
  }

  User.updateOne({ _id: normalizedUserId }, { $set: update }).catch((error) => {
    console.error("Presence update error:", error);
  });
}

function setUserPresence(
  userId,
  status,
  { markSeen = false, forcePersist = false } = {},
) {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) return;

  const entry = ensurePresenceEntry(normalizedUserId);
  if (!entry) return;
  const now = new Date();

  entry.status = normalizePresenceStatus(status);
  entry.lastActiveAt = now;
  if (markSeen) {
    entry.lastSeenAt = now;
  }

  emitPresenceState(normalizedUserId);
  persistPresence(normalizedUserId, forcePersist);
}

function socketPresenceStatus(socket) {
  if (socket?.data?.gameId || socket?.data?.fourPlayerGameId) {
    return "in_game";
  }
  if (socket?.data?.inQueue || socket?.data?.inFourPlayerQueue) {
    return "searching_match";
  }
  return "online";
}

function syncUserPresenceFromSockets(userId, { forcePersist = false } = {}) {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) return;

  const socketIds = userSockets.get(normalizedUserId);
  if (!socketIds || socketIds.size === 0) {
    setUserPresence(normalizedUserId, "offline", {
      markSeen: true,
      forcePersist: true,
    });
    return;
  }

  let nextStatus = "online";
  const toDelete = [];
  for (const socketId of socketIds) {
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) {
      toDelete.push(socketId);
      continue;
    }

    const status = socketPresenceStatus(socket);
    if (status === "in_game") {
      nextStatus = "in_game";
      break;
    }
    if (status === "searching_match") {
      nextStatus = "searching_match";
    }
  }

  if (toDelete.length > 0) {
    toDelete.forEach((socketId) => socketIds.delete(socketId));
    if (socketIds.size === 0) {
      userSockets.delete(normalizedUserId);
      setUserPresence(normalizedUserId, "offline", {
        markSeen: true,
        forcePersist: true,
      });
      return;
    }
  }

  setUserPresence(normalizedUserId, nextStatus, { forcePersist });
}

function registerUserSocket(userId, socketId) {
  if (!userId) return;
  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId).add(socketId);
}

function unregisterUserSocket(userId, socketId) {
  if (!userId) return;
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size === 0) {
    userSockets.delete(userId);
  }
}

function isSocketReadyForGame(socket) {
  return !!socket && !socket.data?.gameId && !socket.data?.fourPlayerGameId;
}

function getSocketForUser(io, userId, preferredSocketId = null) {
  if (preferredSocketId) {
    const preferred = io.sockets.sockets.get(preferredSocketId);
    if (
      preferred &&
      normalizeId(preferred.data?.userId) === normalizeId(userId) &&
      isSocketReadyForGame(preferred)
    ) {
      return preferred;
    }
  }

  const socketIds = userSockets.get(normalizeId(userId));
  if (!socketIds) return null;

  for (const socketId of socketIds) {
    const candidate = io.sockets.sockets.get(socketId);
    if (
      candidate &&
      normalizeId(candidate.data?.userId) === normalizeId(userId) &&
      isSocketReadyForGame(candidate)
    ) {
      return candidate;
    }
  }

  return null;
}

function normalizeTimeControl(timeControl) {
  const initial = Number(timeControl?.initial);
  const increment = Number(timeControl?.increment);

  return {
    initial: Number.isFinite(initial) && initial >= 0 ? initial : 300,
    increment: Number.isFinite(increment) && increment >= 0 ? increment : 0,
  };
}

function tournamentTimeControlToSocketTimeControl(timeControl) {
  return {
    initial: Math.max(
      1,
      Math.round(Number(timeControl?.baseMs || 300000) / 1000),
    ),
    increment: Math.max(0, Math.round(Number(timeControl?.incMs || 0) / 1000)),
  };
}

function normalizePlayAs(playAs) {
  if (playAs === "white" || playAs === "black" || playAs === "random") {
    return playAs;
  }
  return "random";
}

function normalizeGameType(gameType) {
  if (!gameType) return "standard";
  return String(gameType).trim().toLowerCase() || "standard";
}

function normalizeLiveRating(value, fallback = null) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return Math.round(parsed);
  return fallback;
}

function getRatingFromUserDoc(userDoc, ratingField, fallback = 1200) {
  if (!userDoc) return normalizeLiveRating(fallback, 1200);
  const value = ratingField ? userDoc?.[ratingField] : undefined;
  return normalizeLiveRating(value ?? userDoc?.rating ?? fallback, 1200);
}

function normalizeVariant(variant) {
  if (!variant) return "standard";
  const normalized = String(variant).trim().toLowerCase();
  if (normalized === "chess960") return "chess960";
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
  if (normalized === "standard") return "standard";
  return normalized;
}

function getQuickGameSocketForUser(userId) {
  return getSocketForUser(io, normalizeId(userId));
}

function createRealtimeGameRoom({
  gameId,
  whiteSocket,
  blackSocket,
  timeControl,
  variant = "standard",
  isRated = true,
  whiteRating = null,
  blackRating = null,
  tournamentId = null,
  tournamentGameId = null,
}) {
  const normalizedVariant = normalizeVariant(variant);
  if (normalizedVariant === "fourPlayer") return false;
  if (!whiteSocket || !blackSocket) return false;
  if (whiteSocket.id === blackSocket.id) return false;
  if (!isSocketReadyForGame(whiteSocket) || !isSocketReadyForGame(blackSocket)) {
    return false;
  }

  const safeGameId =
    String(gameId || "").trim() || crypto.randomBytes(8).toString("hex");
  if (games.has(safeGameId)) return false;

  const normalizedTimeControl = normalizeTimeControl(timeControl);
  const ratingPool = getRatingPoolForTimeControl(
    normalizedTimeControl,
    normalizedVariant,
  );
  const ratedForDisplay = isRated === true && !!ratingPool;
  const initialPosition = createInitialPosition(normalizedVariant);
  const chess =
    initialPosition.fen === "start"
      ? new Chess()
      : new Chess(initialPosition.fen);
  const room = `game:${safeGameId}`;

  const socketToUser = {
    [whiteSocket.id]: normalizeId(whiteSocket.data.userId),
    [blackSocket.id]: normalizeId(blackSocket.data.userId),
  };

  games.set(safeGameId, {
    room,
    chess,
    players: { white: whiteSocket.id, black: blackSocket.id },
    playerUsers: {
      white: socketToUser[whiteSocket.id] || "",
      black: socketToUser[blackSocket.id] || "",
    },
    timeControl: normalizedTimeControl,
    variant: normalizedVariant,
    whiteCheckCount: 0,
    blackCheckCount: 0,
    chess960: initialPosition.chess960,
    isRated,
    tournamentId: tournamentId ? normalizeId(tournamentId) : null,
    tournamentGameId: tournamentGameId ? normalizeId(tournamentGameId) : null,
  });
  scheduleFirstMoveAbortTimer(safeGameId);

  whiteSocket.data.gameId = safeGameId;
  blackSocket.data.gameId = safeGameId;
  syncUserPresenceFromSockets(normalizeId(whiteSocket.data.userId));
  syncUserPresenceFromSockets(normalizeId(blackSocket.data.userId));
  whiteSocket.join(room);
  blackSocket.join(room);

  io.to(whiteSocket.id).emit("matchFound", {
    gameId: safeGameId,
    color: "w",
    fen: chess.fen(),
    opponentName: blackSocket.data.name || "Opponent",
    rated: ratedForDisplay,
    playerRating: normalizeLiveRating(whiteRating),
    opponentRating: normalizeLiveRating(blackRating),
    timeControl: normalizedTimeControl,
    variant: normalizedVariant,
    whiteCheckCount: 0,
    blackCheckCount: 0,
  });

  io.to(blackSocket.id).emit("matchFound", {
    gameId: safeGameId,
    color: "b",
    fen: chess.fen(),
    opponentName: whiteSocket.data.name || "Opponent",
    rated: ratedForDisplay,
    playerRating: normalizeLiveRating(blackRating),
    opponentRating: normalizeLiveRating(whiteRating),
    timeControl: normalizedTimeControl,
    variant: normalizedVariant,
    whiteCheckCount: 0,
    blackCheckCount: 0,
  });

  return true;
}

function normalizeFourPlayerSquare(square) {
  if (!square || typeof square !== "object") return null;
  const row = Number(square.row);
  const col = Number(square.col);
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null;
  return { row, col };
}

function pickRandomIndex(indexes) {
  const random = Math.floor(Math.random() * indexes.length);
  return indexes[random];
}

function generateChess960BackRank() {
  const backRank = Array(8).fill("");
  const evenSquares = [0, 2, 4, 6];
  const oddSquares = [1, 3, 5, 7];

  const darkBishopSquare = pickRandomIndex(evenSquares);
  const lightBishopSquare = pickRandomIndex(oddSquares);
  backRank[darkBishopSquare] = "b";
  backRank[lightBishopSquare] = "b";

  const emptySquares = [];
  for (let i = 0; i < 8; i += 1) {
    if (!backRank[i]) emptySquares.push(i);
  }

  const queenSquare = pickRandomIndex(emptySquares);
  backRank[queenSquare] = "q";

  const remainingAfterQueen = emptySquares.filter((idx) => idx !== queenSquare);
  const knightOneSquare = pickRandomIndex(remainingAfterQueen);
  backRank[knightOneSquare] = "n";

  const remainingAfterKnightOne = remainingAfterQueen.filter(
    (idx) => idx !== knightOneSquare,
  );
  const knightTwoSquare = pickRandomIndex(remainingAfterKnightOne);
  backRank[knightTwoSquare] = "n";

  const finalSquares = remainingAfterKnightOne
    .filter((idx) => idx !== knightTwoSquare)
    .sort((a, b) => a - b);
  backRank[finalSquares[0]] = "r";
  backRank[finalSquares[1]] = "k";
  backRank[finalSquares[2]] = "r";

  return backRank.join("");
}

const FILES = "abcdefgh";
const BOARD_SIZE = 8;

function fileIndexToSquare(fileIndex, rank) {
  return `${FILES[fileIndex]}${rank}`;
}

function squareToCoords(square) {
  if (typeof square !== "string" || square.length !== 2) return null;
  const file = FILES.indexOf(square[0]);
  const rankNumber = Number(square[1]);
  if (file < 0 || !Number.isFinite(rankNumber) || rankNumber < 1 || rankNumber > 8) {
    return null;
  }
  const rankIndex = 8 - rankNumber;
  return { file, rank: rankIndex };
}

function coordsToSquare(file, rank) {
  if (
    file < 0 ||
    file >= BOARD_SIZE ||
    rank < 0 ||
    rank >= BOARD_SIZE
  ) {
    return null;
  }
  const rankNumber = 8 - rank;
  return `${FILES[file]}${rankNumber}`;
}

function createChess960MetadataFromBackRank(backRank) {
  const kingFile = backRank.indexOf("k");
  const rookFiles = [];

  for (let i = 0; i < backRank.length; i += 1) {
    if (backRank[i] === "r") {
      rookFiles.push(i);
    }
  }

  const queenSideRookFile = rookFiles.find((file) => file < kingFile);
  const kingSideRookFile = rookFiles.find((file) => file > kingFile);

  if (
    kingFile < 0 ||
    queenSideRookFile === undefined ||
    kingSideRookFile === undefined
  ) {
    return null;
  }

  return {
    starts: {
      w: {
        king: fileIndexToSquare(kingFile, 1),
        rooks: {
          q: fileIndexToSquare(queenSideRookFile, 1),
          k: fileIndexToSquare(kingSideRookFile, 1),
        },
      },
      b: {
        king: fileIndexToSquare(kingFile, 8),
        rooks: {
          q: fileIndexToSquare(queenSideRookFile, 8),
          k: fileIndexToSquare(kingSideRookFile, 8),
        },
      },
    },
    rights: {
      w: { q: true, k: true },
      b: { q: true, k: true },
    },
  };
}

function createInitialPosition(variant) {
  if (normalizeVariant(variant) !== "chess960") {
    return { fen: "start", chess960: null };
  }

  const blackBackRank = generateChess960BackRank();
  const whiteBackRank = blackBackRank.toUpperCase();
  const chess960 = createChess960MetadataFromBackRank(blackBackRank);

  // chess.js 0.13.x does not support Chess960 castling semantics.
  return {
    fen: `${blackBackRank}/pppppppp/8/8/8/8/PPPPPPPP/${whiteBackRank} w - - 0 1`,
    chess960,
  };
}

function parseFenPosition(fen) {
  const [placement, activeColor = "w", castling = "-", enPassant = "-", halfmove = "0", fullmove = "1"] =
    String(fen || "").trim().split(/\s+/);

  const rows = placement.split("/");
  if (rows.length !== 8) return null;

  const board = [];
  for (const row of rows) {
    const parsedRow = [];
    for (const char of row) {
      const num = Number(char);
      if (Number.isInteger(num) && num > 0) {
        for (let i = 0; i < num; i += 1) parsedRow.push(null);
      } else {
        parsedRow.push(char);
      }
    }
    if (parsedRow.length !== 8) return null;
    board.push(parsedRow);
  }

  return {
    board,
    activeColor,
    castling,
    enPassant,
    halfmove: Number.isFinite(Number(halfmove)) ? Number(halfmove) : 0,
    fullmove: Number.isFinite(Number(fullmove)) ? Number(fullmove) : 1,
  };
}

function serializeFenBoard(board) {
  return board
    .map((row) => {
      let rowFen = "";
      let emptyCount = 0;
      for (const piece of row) {
        if (!piece) {
          emptyCount += 1;
        } else {
          if (emptyCount > 0) {
            rowFen += String(emptyCount);
            emptyCount = 0;
          }
          rowFen += piece;
        }
      }
      if (emptyCount > 0) {
        rowFen += String(emptyCount);
      }
      return rowFen;
    })
    .join("/");
}

function cloneBoard(board) {
  return board.map((row) => row.slice());
}

function getPiece(board, square) {
  const coords = squareToCoords(square);
  if (!coords) return null;
  return board[coords.rank]?.[coords.file] || null;
}

function setPiece(board, square, piece) {
  const coords = squareToCoords(square);
  if (!coords) return false;
  if (!board[coords.rank]) return false;
  board[coords.rank][coords.file] = piece;
  return true;
}

function isSquareUnderAttack(board, square, attackerColor) {
  const coords = squareToCoords(square);
  if (!coords) return false;
  const { file, rank } = coords;
  const pawn = attackerColor === "w" ? "P" : "p";
  const knight = attackerColor === "w" ? "N" : "n";
  const bishop = attackerColor === "w" ? "B" : "b";
  const rook = attackerColor === "w" ? "R" : "r";
  const queen = attackerColor === "w" ? "Q" : "q";
  const king = attackerColor === "w" ? "K" : "k";

  const pawnAttackers =
    attackerColor === "w"
      ? [
          { file: file - 1, rank: rank + 1 },
          { file: file + 1, rank: rank + 1 },
        ]
      : [
          { file: file - 1, rank: rank - 1 },
          { file: file + 1, rank: rank - 1 },
        ];

  for (const pos of pawnAttackers) {
    const piece = board[pos.rank]?.[pos.file];
    if (piece === pawn) return true;
  }

  const knightOffsets = [
    { df: -2, dr: -1 },
    { df: -2, dr: 1 },
    { df: -1, dr: -2 },
    { df: -1, dr: 2 },
    { df: 1, dr: -2 },
    { df: 1, dr: 2 },
    { df: 2, dr: -1 },
    { df: 2, dr: 1 },
  ];
  for (const { df, dr } of knightOffsets) {
    const piece = board[rank + dr]?.[file + df];
    if (piece === knight) return true;
  }

  const kingOffsets = [
    { df: -1, dr: -1 },
    { df: -1, dr: 0 },
    { df: -1, dr: 1 },
    { df: 0, dr: -1 },
    { df: 0, dr: 1 },
    { df: 1, dr: -1 },
    { df: 1, dr: 0 },
    { df: 1, dr: 1 },
  ];
  for (const { df, dr } of kingOffsets) {
    const piece = board[rank + dr]?.[file + df];
    if (piece === king) return true;
  }

  const bishopDirections = [
    { df: -1, dr: -1 },
    { df: -1, dr: 1 },
    { df: 1, dr: -1 },
    { df: 1, dr: 1 },
  ];
  for (const { df, dr } of bishopDirections) {
    let nextFile = file + df;
    let nextRank = rank + dr;
    while (
      nextFile >= 0 &&
      nextFile < BOARD_SIZE &&
      nextRank >= 0 &&
      nextRank < BOARD_SIZE
    ) {
      const piece = board[nextRank][nextFile];
      if (piece) {
        if (piece === bishop || piece === queen) {
          return true;
        }
        break;
      }
      nextFile += df;
      nextRank += dr;
    }
  }

  const rookDirections = [
    { df: -1, dr: 0 },
    { df: 1, dr: 0 },
    { df: 0, dr: -1 },
    { df: 0, dr: 1 },
  ];
  for (const { df, dr } of rookDirections) {
    let nextFile = file + df;
    let nextRank = rank + dr;
    while (
      nextFile >= 0 &&
      nextFile < BOARD_SIZE &&
      nextRank >= 0 &&
      nextRank < BOARD_SIZE
    ) {
      const piece = board[nextRank][nextFile];
      if (piece) {
        if (piece === rook || piece === queen) {
          return true;
        }
        break;
      }
      nextFile += df;
      nextRank += dr;
    }
  }

  return false;
}

function getChess960CastlingTargets(color, side) {
  if (color === "w") {
    return side === "k"
      ? { kingTo: "g1", rookTo: "f1" }
      : { kingTo: "c1", rookTo: "d1" };
  }
  return side === "k"
    ? { kingTo: "g8", rookTo: "f8" }
    : { kingTo: "c8", rookTo: "d8" };
}

function updateChess960RightsForNormalMove(game, move, moverColor) {
  if (!game?.chess960) return;

  const metadata = game.chess960;
  const opponentColor = moverColor === "w" ? "b" : "w";

  if (move.piece === "k") {
    metadata.rights[moverColor].k = false;
    metadata.rights[moverColor].q = false;
  }

  if (move.piece === "r") {
    if (move.from === metadata.starts[moverColor].rooks.k) {
      metadata.rights[moverColor].k = false;
    }
    if (move.from === metadata.starts[moverColor].rooks.q) {
      metadata.rights[moverColor].q = false;
    }
  }

  if (move.captured === "r") {
    if (move.to === metadata.starts[opponentColor].rooks.k) {
      metadata.rights[opponentColor].k = false;
    }
    if (move.to === metadata.starts[opponentColor].rooks.q) {
      metadata.rights[opponentColor].q = false;
    }
  }
}

function tryHandleChess960Castling(game, moverColor, from, to) {
  if (!game?.chess960 || game.variant !== "chess960") {
    return { handled: false };
  }

  const currentFen = game.chess.fen();
  const parsed = parseFenPosition(currentFen);
  if (!parsed) {
    return { handled: true, success: false, reason: "Invalid board state." };
  }

  const board = parsed.board;
  const kingStart = game.chess960.starts[moverColor].king;
  const rookStarts = game.chess960.starts[moverColor].rooks;
  const kingPiece = moverColor === "w" ? "K" : "k";
  const rookPiece = moverColor === "w" ? "R" : "r";

  const pieceFrom = getPiece(board, from);
  const pieceTo = getPiece(board, to);

  if (pieceFrom !== kingPiece || pieceTo !== rookPiece) {
    return { handled: false };
  }

  if (from !== kingStart) {
    return { handled: true, success: false, reason: "King has already moved." };
  }

  let side = null;
  if (to === rookStarts.k) side = "k";
  if (to === rookStarts.q) side = "q";
  if (!side) {
    return {
      handled: true,
      success: false,
      reason: "Select your castling rook to castle in Chess960.",
    };
  }

  if (!game.chess960.rights[moverColor][side]) {
    return { handled: true, success: false, reason: "Castling is no longer available." };
  }

  const kingCoords = squareToCoords(from);
  const rookCoords = squareToCoords(to);
  if (!kingCoords || !rookCoords || kingCoords.rank !== rookCoords.rank) {
    return { handled: true, success: false, reason: "Invalid castling move." };
  }

  const { kingTo, rookTo } = getChess960CastlingTargets(moverColor, side);
  const kingToCoords = squareToCoords(kingTo);
  const rookToCoords = squareToCoords(rookTo);
  if (!kingToCoords || !rookToCoords) {
    return { handled: true, success: false, reason: "Invalid castling targets." };
  }

  const rank = kingCoords.rank;
  const kingFile = kingCoords.file;
  const rookFile = rookCoords.file;
  const kingToFile = kingToCoords.file;
  const rookToFile = rookToCoords.file;

  const betweenKingAndRookStart = Math.min(kingFile, rookFile) + 1;
  const betweenKingAndRookEnd = Math.max(kingFile, rookFile) - 1;
  for (let file = betweenKingAndRookStart; file <= betweenKingAndRookEnd; file += 1) {
    const square = coordsToSquare(file, rank);
    if (!square) continue;
    if (square === from || square === to) continue;
    if (getPiece(board, square)) {
      return { handled: true, success: false, reason: "Pieces block castling." };
    }
  }

  const kingStep = kingToFile > kingFile ? 1 : kingToFile < kingFile ? -1 : 0;
  if (kingStep !== 0) {
    for (let file = kingFile + kingStep; file !== kingToFile + kingStep; file += kingStep) {
      const square = coordsToSquare(file, rank);
      if (!square) continue;
      if (square === to) continue;
      if (file !== kingToFile && getPiece(board, square)) {
        return { handled: true, success: false, reason: "King path is blocked." };
      }
      if (file === kingToFile) {
        const occupant = getPiece(board, square);
        if (occupant && square !== to) {
          return { handled: true, success: false, reason: "King destination is blocked." };
        }
      }
    }
  } else {
    const occupant = getPiece(board, kingTo);
    // In Chess960 the king can already be on its castling destination square.
    if (occupant && kingTo !== to && kingTo !== from) {
      return { handled: true, success: false, reason: "King destination is blocked." };
    }
  }

  const rookStep = rookToFile > rookFile ? 1 : rookToFile < rookFile ? -1 : 0;
  if (rookStep !== 0) {
    for (let file = rookFile + rookStep; file !== rookToFile + rookStep; file += rookStep) {
      const square = coordsToSquare(file, rank);
      if (!square) continue;
      if (square === from) continue;
      if (file !== rookToFile && getPiece(board, square)) {
        return { handled: true, success: false, reason: "Rook path is blocked." };
      }
      if (file === rookToFile) {
        const occupant = getPiece(board, square);
        if (occupant && square !== from) {
          return { handled: true, success: false, reason: "Rook destination is blocked." };
        }
      }
    }
  } else {
    const occupant = getPiece(board, rookTo);
    if (occupant && rookTo !== from) {
      return { handled: true, success: false, reason: "Rook destination is blocked." };
    }
  }

  const opponentColor = moverColor === "w" ? "b" : "w";
  if (isSquareUnderAttack(board, from, opponentColor)) {
    return { handled: true, success: false, reason: "King is in check." };
  }

  const travelBoard = cloneBoard(board);
  setPiece(travelBoard, from, null);
  setPiece(travelBoard, to, null);
  if (kingStep !== 0) {
    // Validate only transit squares here; final king safety is checked on the final board.
    for (let file = kingFile + kingStep; file !== kingToFile; file += kingStep) {
      const travelSquare = coordsToSquare(file, rank);
      if (!travelSquare) continue;
      setPiece(travelBoard, travelSquare, kingPiece);
      if (isSquareUnderAttack(travelBoard, travelSquare, opponentColor)) {
        return {
          handled: true,
          success: false,
          reason: "King cannot castle through check.",
        };
      }
      setPiece(travelBoard, travelSquare, null);
    }
  }

  const nextBoard = cloneBoard(board);
  setPiece(nextBoard, from, null);
  setPiece(nextBoard, to, null);
  setPiece(nextBoard, kingTo, kingPiece);
  setPiece(nextBoard, rookTo, rookPiece);

  const placement = serializeFenBoard(nextBoard);
  const nextTurn = opponentColor;
  const nextHalfmove = parsed.halfmove + 1;
  const nextFullmove = parsed.fullmove + (moverColor === "b" ? 1 : 0);
  const nextFen = `${placement} ${nextTurn} - - ${nextHalfmove} ${nextFullmove}`;

  if (isSquareUnderAttack(nextBoard, kingTo, opponentColor)) {
    return {
      handled: true,
      success: false,
      reason: "King destination is under attack.",
    };
  }

  let nextChess;
  try {
    nextChess = new Chess(nextFen);
  } catch {
    return { handled: true, success: false, reason: "Illegal castling move." };
  }

  game.chess = nextChess;
  game.chess960.rights[moverColor].k = false;
  game.chess960.rights[moverColor].q = false;

  return {
    handled: true,
    success: true,
    game,
    move: {
      from,
      to: kingTo,
      san: side === "k" ? "O-O" : "O-O-O",
    },
  };
}

function removeFromQueues(socketId) {
  for (const queue of waitingQueues.values()) {
    const idx = queue.findIndex((entry) => {
      if (typeof entry === "string") return entry === socketId;
      return entry.socketId === socketId;
    });
    if (idx !== -1) queue.splice(idx, 1);
  }
}

function removeFromFourPlayerQueues(socketId) {
  for (const queue of fourPlayerQueues.values()) {
    const idx = queue.indexOf(socketId);
    if (idx !== -1) queue.splice(idx, 1);
  }
}

function getFourPlayerQueueKey(timeControl) {
  const initial = Number(timeControl?.initial ?? 300);
  const increment = Number(timeControl?.increment ?? 0);
  return `fourPlayer:${initial}+${increment}`;
}

function getFourPlayerQueue(queueKey) {
  if (!fourPlayerQueues.has(queueKey)) {
    fourPlayerQueues.set(queueKey, []);
  }
  return fourPlayerQueues.get(queueKey);
}

function serializeFourPlayerPlayers(playersByColor) {
  const payload = {};
  FOUR_PLAYER_COLORS.forEach((color) => {
    const player = playersByColor[color];
    payload[color] = {
      userId: player?.userId || null,
      name: player?.name || color.toUpperCase(),
    };
  });
  return payload;
}

function clearFourPlayerGameForPlayers(game) {
  FOUR_PLAYER_COLORS.forEach((color) => {
    const player = game.playersByColor[color];
    const playerUserId = normalizeId(player?.userId);
    if (!player?.socketId) {
      syncUserPresenceFromSockets(playerUserId);
      return;
    }
    const sock = io.sockets.sockets.get(player.socketId);
    if (!sock) {
      syncUserPresenceFromSockets(playerUserId);
      return;
    }
    sock.leave(game.room);
    sock.data.fourPlayerGameId = null;
    sock.data.inFourPlayerQueue = false;
    sock.data.fourPlayerQueueKey = null;
    syncUserPresenceFromSockets(playerUserId);
  });
}

function emitFourPlayerState(game, extra = {}) {
  io.to(game.room).emit("fourPlayerState", {
    gameId: game.id,
    state: game.state,
    players: serializeFourPlayerPlayers(game.playersByColor),
    timeControl: game.timeControl,
    ...extra,
  });
}

function maybeFinishFourPlayerGame(game, reason = "game_over") {
  if (!game?.state?.winner) return false;
  io.to(game.room).emit("fourPlayerGameOver", {
    gameId: game.id,
    reason,
    winner: game.state.winner,
    state: game.state,
    players: serializeFourPlayerPlayers(game.playersByColor),
  });
  clearFourPlayerGameForPlayers(game);
  fourPlayerGames.delete(game.id);
  return true;
}

function forfeitFourPlayerSocket(socket, reason = "player_left") {
  const gameId = socket.data.fourPlayerGameId;
  if (!gameId) return;

  const game = fourPlayerGames.get(gameId);
  socket.data.fourPlayerGameId = null;
  socket.data.inFourPlayerQueue = false;
  socket.data.fourPlayerQueueKey = null;
  const userId = normalizeId(socket.data.userId);
  syncUserPresenceFromSockets(userId);
  if (!game) return;

  const color = game.socketToColor[socket.id];
  if (!color) return;

  delete game.socketToColor[socket.id];
  if (game.playersByColor[color]) {
    game.playersByColor[color].socketId = null;
  }
  socket.leave(game.room);

  game.state = eliminateFourPlayerColor(game.state, color);

  emitFourPlayerState(game, {
    systemMessage: `${color.toUpperCase()} left the game.`,
    forfeitedColor: color,
    forfeitReason: reason,
  });

  maybeFinishFourPlayerGame(game, reason);
}

function queueFourPlayerStatus(socket, queueKey) {
  const queue = getFourPlayerQueue(queueKey);
  let activeCount = 0;
  for (const socketId of queue) {
    const candidate = io.sockets.sockets.get(socketId);
    if (
      candidate &&
      candidate.data.inFourPlayerQueue &&
      !candidate.data.gameId &&
      !candidate.data.fourPlayerGameId &&
      candidate.data.fourPlayerQueueKey === queueKey
    ) {
      activeCount += 1;
    }
  }

  socket.emit("fourPlayerQueued", {
    queueKey,
    waitingCount: activeCount,
  });
}

function clearGameForPlayers(game) {
  clearFirstMoveAbortTimer(game);

  const whiteSocket = io.sockets.sockets.get(game.players.white);
  const blackSocket = io.sockets.sockets.get(game.players.black);
  const whiteUserId = normalizeId(game?.playerUsers?.white);
  const blackUserId = normalizeId(game?.playerUsers?.black);
  if (whiteSocket) {
    whiteSocket.data.gameId = null;
    whiteSocket.data.inQueue = false;
    whiteSocket.data.queueKey = null;
  }
  if (blackSocket) {
    blackSocket.data.gameId = null;
    blackSocket.data.inQueue = false;
    blackSocket.data.queueKey = null;
  }
  syncUserPresenceFromSockets(whiteUserId);
  syncUserPresenceFromSockets(blackUserId);
}

function gamePlies(game) {
  if (!game?.chess || typeof game.chess.history !== "function") return 0;
  const history = game.chess.history();
  return Array.isArray(history) ? history.length : 0;
}

function clearFirstMoveAbortTimer(game) {
  if (!game?.firstMoveAbortTimer) return;
  clearTimeout(game.firstMoveAbortTimer);
  game.firstMoveAbortTimer = null;
}

function emitGameSystemMessage(gameId, message, targetColor = null) {
  const game = games.get(gameId);
  if (!game || !message) return;

  io.to(game.room).emit("gameSystemMessage", {
    gameId,
    message,
    targetColor,
  });
}

function scheduleFirstMoveAbortTimer(gameId) {
  const game = games.get(gameId);
  if (!game) return;

  clearFirstMoveAbortTimer(game);
  const thresholdMs = getAbortThresholdMs(game.timeControl);
  game.startedAt = Date.now();
  game.firstMoveAbortTimer = setTimeout(() => {
    const latestGame = games.get(gameId);
    if (!latestGame || gamePlies(latestGame) > 0) return;

    emitGameSystemMessage(
      gameId,
      "Game aborted: no first move was made in time.",
      "w",
    );
    emitGameOver(gameId, "aborted", null);
  }, thresholdMs);
}

function ratingResultForColor(winnerColor, color) {
  if (winnerColor !== "w" && winnerColor !== "b") return "D";
  return winnerColor === color ? "W" : "L";
}

async function applyGameRatingUpdates(gameId, game, reason, winner) {
  if (!game?.isRated) {
    return {
      rated: false,
      applied: false,
      pool: undefined,
      skippedReason: "not_rated",
    };
  }

  const pool = getRatingPoolForTimeControl(game?.timeControl, game?.variant);
  if (!pool) {
    return {
      rated: true,
      applied: false,
      pool: undefined,
      skippedReason: "unsupported_variant",
    };
  }
  const ratingField = ratingFieldForPool(pool);
  const gamesField = gamesFieldForPool(pool);
  const rdField = rdFieldForPool(pool);
  const volatilityField = volatilityFieldForPool(pool);
  const lastRatedAtField = lastRatedAtFieldForPool(pool);

  const whiteUserId = normalizeId(game?.playerUsers?.white);
  const blackUserId = normalizeId(game?.playerUsers?.black);
  if (!whiteUserId || !blackUserId || whiteUserId === blackUserId) {
    return {
      rated: true,
      applied: false,
      pool,
      skippedReason: "invalid_players",
    };
  }

  const plies = gamePlies(game);
  if (!shouldApplyRatedResult(reason, plies)) {
    return {
      rated: true,
      applied: false,
      pool,
      skippedReason: reason === "aborted" ? "aborted" : "minimum_2_plies",
    };
  }

  const [whiteUser, blackUser] = await Promise.all([
    User.findById(whiteUserId),
    User.findById(blackUserId),
  ]);
  if (!whiteUser || !blackUser) {
    return {
      rated: true,
      applied: false,
      pool,
      skippedReason: "player_not_found",
    };
  }

  const winnerColor = winner === "w" || winner === "b" ? winner : null;
  const whitePoolRating = whiteUser[ratingField] ?? whiteUser.rating ?? 1200;
  const blackPoolRating = blackUser[ratingField] ?? blackUser.rating ?? 1200;
  const whitePoolRd = whiteUser[rdField] ?? DEFAULT_GLICKO_RD;
  const blackPoolRd = blackUser[rdField] ?? DEFAULT_GLICKO_RD;
  const whitePoolVolatility =
    whiteUser[volatilityField] ?? DEFAULT_GLICKO_VOLATILITY;
  const blackPoolVolatility =
    blackUser[volatilityField] ?? DEFAULT_GLICKO_VOLATILITY;
  const whiteLastRatedAt = whiteUser[lastRatedAtField] ?? null;
  const blackLastRatedAt = blackUser[lastRatedAtField] ?? null;
  const whiteLegacyGames = Number(whiteUser.gamesPlayed ?? 0);
  const blackLegacyGames = Number(blackUser.gamesPlayed ?? 0);
  const whitePoolGames = Number.isFinite(Number(whiteUser[gamesField]))
    ? Number(whiteUser[gamesField])
    : Math.min(10, Math.max(0, whiteLegacyGames));
  const blackPoolGames = Number.isFinite(Number(blackUser[gamesField]))
    ? Number(blackUser[gamesField])
    : Math.min(10, Math.max(0, blackLegacyGames));
  const whiteWasProvisional = whitePoolGames < 10;
  const blackWasProvisional = blackPoolGames < 10;
  const playedAt = new Date();
  const glicko = updateGlickoPair({
    whiteRating: whitePoolRating,
    whiteRd: whitePoolRd,
    whiteVolatility: whitePoolVolatility,
    whiteLastRatedAt,
    blackRating: blackPoolRating,
    blackRd: blackPoolRd,
    blackVolatility: blackPoolVolatility,
    blackLastRatedAt,
    winnerColor,
    now: playedAt,
  });

  whiteUser[ratingField] = glicko.white.newRating;
  blackUser[ratingField] = glicko.black.newRating;
  whiteUser[rdField] = glicko.white.newRd;
  blackUser[rdField] = glicko.black.newRd;
  whiteUser[volatilityField] = glicko.white.newVolatility;
  blackUser[volatilityField] = glicko.black.newVolatility;
  whiteUser[lastRatedAtField] = playedAt;
  blackUser[lastRatedAtField] = playedAt;
  whiteUser[gamesField] = whitePoolGames + 1;
  blackUser[gamesField] = blackPoolGames + 1;
  const isStandardPool =
    pool === "bullet" ||
    pool === "blitz" ||
    pool === "rapid" ||
    pool === "classical";
  if (isStandardPool) {
    whiteUser.rating = glicko.white.newRating;
    blackUser.rating = glicko.black.newRating;
  }
  whiteUser.gamesPlayed = (whiteUser.gamesPlayed ?? 0) + 1;
  blackUser.gamesPlayed = (blackUser.gamesPlayed ?? 0) + 1;
  if (winnerColor === "w") {
    whiteUser.gamesWon = (whiteUser.gamesWon ?? 0) + 1;
  } else if (winnerColor === "b") {
    blackUser.gamesWon = (blackUser.gamesWon ?? 0) + 1;
  }

  await Promise.all([whiteUser.save(), blackUser.save()]);

  try {
    await RatingEvent.insertMany([
      {
        userId: whiteUser._id,
        opponentId: blackUser._id,
        pool,
        gameId,
        ts: playedAt,
        result: ratingResultForColor(winnerColor, "w"),
        reason,
        ratingBefore: glicko.white.oldRating,
        ratingAfter: glicko.white.newRating,
        delta: glicko.white.delta,
        rdBefore: glicko.white.rdBefore,
        rdAfter: glicko.white.newRd,
        volBefore: glicko.white.oldVolatility,
        volAfter: glicko.white.newVolatility,
        opponentRating: glicko.black.oldRating,
        opponentRd: glicko.black.rdBefore,
        isProvisional: whiteWasProvisional,
        poolGamesBefore: whitePoolGames,
        poolGamesAfter: whiteUser[gamesField],
      },
      {
        userId: blackUser._id,
        opponentId: whiteUser._id,
        pool,
        gameId,
        ts: playedAt,
        result: ratingResultForColor(winnerColor, "b"),
        reason,
        ratingBefore: glicko.black.oldRating,
        ratingAfter: glicko.black.newRating,
        delta: glicko.black.delta,
        rdBefore: glicko.black.rdBefore,
        rdAfter: glicko.black.newRd,
        volBefore: glicko.black.oldVolatility,
        volAfter: glicko.black.newVolatility,
        opponentRating: glicko.white.oldRating,
        opponentRd: glicko.white.rdBefore,
        isProvisional: blackWasProvisional,
        poolGamesBefore: blackPoolGames,
        poolGamesAfter: blackUser[gamesField],
      },
    ]);
  } catch (error) {
    console.error("RatingEvent insert error:", error);
  }

  return {
    rated: true,
    applied: true,
    pool,
    white: {
      userId: normalizeId(whiteUser._id),
      oldRating: glicko.white.oldRating,
      newRating: glicko.white.newRating,
      delta: glicko.white.delta,
      oldRd: glicko.white.rdBefore,
      newRd: glicko.white.newRd,
      oldVolatility: glicko.white.oldVolatility,
      newVolatility: glicko.white.newVolatility,
      gamesPlayed: whiteUser.gamesPlayed,
      gamesWon: whiteUser.gamesWon ?? 0,
      poolGamesPlayed: whiteUser[gamesField],
      isProvisional: (whiteUser[gamesField] ?? 0) < 10,
      wasProvisional: whiteWasProvisional,
    },
    black: {
      userId: normalizeId(blackUser._id),
      oldRating: glicko.black.oldRating,
      newRating: glicko.black.newRating,
      delta: glicko.black.delta,
      oldRd: glicko.black.rdBefore,
      newRd: glicko.black.newRd,
      oldVolatility: glicko.black.oldVolatility,
      newVolatility: glicko.black.newVolatility,
      gamesPlayed: blackUser.gamesPlayed,
      gamesWon: blackUser.gamesWon ?? 0,
      poolGamesPlayed: blackUser[gamesField],
      isProvisional: (blackUser[gamesField] ?? 0) < 10,
      wasProvisional: blackWasProvisional,
    },
  };
}

async function emitGameOver(gameId, reason, winner) {
  const game = games.get(gameId);
  if (!game) return;
  if (game.isEnding) return;
  game.isEnding = true;
  clearFirstMoveAbortTimer(game);

  const plies = gamePlies(game);
  const resolvedReason = resolveTerminalReason(reason, plies);
  const resolvedWinner = resolvedReason === "aborted" ? null : winner;

  if (resolvedReason === "aborted" && reason !== "aborted") {
    const nonMoverColor =
      winner === "w" ? "b" : winner === "b" ? "w" : game.chess.turn();
    emitGameSystemMessage(
      gameId,
      "Game aborted before first move. No rating changes were applied.",
      nonMoverColor === "w" || nonMoverColor === "b" ? nonMoverColor : "w",
    );
  }

  let elo = { rated: false, applied: false, skippedReason: "error" };
  try {
    elo = await applyGameRatingUpdates(
      gameId,
      game,
      resolvedReason,
      resolvedWinner,
    );
  } catch (error) {
    console.error("Elo update error:", error);
  }

  if (game.tournamentId) {
    const tournamentResult =
      resolvedWinner === "w"
        ? "1-0"
        : resolvedWinner === "b"
          ? "0-1"
          : "1/2-1/2";
    try {
      await syncTournamentGameResultByGameId(gameId, tournamentResult);
    } catch (error) {
      console.error("Tournament result sync error:", error);
    }
  }

  io.to(game.room).emit("gameOver", {
    gameId,
    reason: resolvedReason,
    winner: resolvedWinner,
    elo,
  });
  clearGameForPlayers(game);
  games.delete(gameId);
}

function isCheck(chess) {
  return typeof chess.inCheck === "function" ? chess.inCheck() : chess.in_check();
}

function isCheckmate(chess) {
  return typeof chess.isCheckmate === "function"
    ? chess.isCheckmate()
    : chess.in_checkmate();
}

function isDraw(chess) {
  return typeof chess.isDraw === "function" ? chess.isDraw() : chess.in_draw();
}

function isStalemate(chess) {
  return typeof chess.isStalemate === "function"
    ? chess.isStalemate()
    : chess.in_stalemate();
}

function isInsufficientMaterial(chess) {
  return typeof chess.isInsufficientMaterial === "function"
    ? chess.isInsufficientMaterial()
    : chess.insufficient_material();
}

function isThreefoldRepetition(chess) {
  return typeof chess.isThreefoldRepetition === "function"
    ? chess.isThreefoldRepetition()
    : chess.in_threefold_repetition();
}

function normalizeThreeCheckCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function getThreeCheckCounts(game) {
  return {
    whiteCheckCount: normalizeThreeCheckCount(game?.whiteCheckCount),
    blackCheckCount: normalizeThreeCheckCount(game?.blackCheckCount),
  };
}

function getThreeCheckPayload(game) {
  if (!game || game.variant !== "threeCheck") return {};
  return getThreeCheckCounts(game);
}

function applyThreeCheckAfterMove(game, moverColor) {
  if (!game || game.variant !== "threeCheck") {
    return { isThreeCheckWin: false, checkAwarded: null };
  }

  if (!isCheck(game.chess)) {
    return { isThreeCheckWin: false, checkAwarded: null };
  }

  const checkedColor = game.chess.turn();
  const counts = getThreeCheckCounts(game);

  if (checkedColor === "w") {
    game.whiteCheckCount = counts.whiteCheckCount + 1;
  } else {
    game.blackCheckCount = counts.blackCheckCount + 1;
  }

  const updated = getThreeCheckCounts(game);
  const checkedSideCount =
    checkedColor === "w" ? updated.whiteCheckCount : updated.blackCheckCount;

  return {
    isThreeCheckWin: checkedSideCount >= 3,
    checkAwarded: checkedColor,
  };
}

io.on("connection", (socket) => {
  const auth = getSocketAuth(socket);
  if (auth?.userId) {
    const userId = normalizeId(auth.userId);
    socket.data.userId = userId;
    socket.data.name = auth.fullName || socket.data.name || "Player";
    registerUserSocket(userId, socket.id);
    socket.join(getUserRoom(userId));
    syncUserPresenceFromSockets(userId, { forcePersist: true });

    // Deliver account-level pending challenges when user comes online.
    for (const challenge of pendingChallenges.values()) {
      if (challenge.toUserId === userId) {
        socket.emit("friendChallengeReceived", challenge);
      }
    }
  }

  const safeAck = (ack, payload) => {
    if (typeof ack === "function") {
      ack(payload);
    }
  };

  socket.on("presence:ping", () => {
    const userId = normalizeId(socket.data.userId);
    if (!userId) return;
    syncUserPresenceFromSockets(userId);
  });

  socket.on("joinTournamentGame", async (payload = {}, ack) => {
    try {
      const gameId = String(payload?.gameId || "").trim();
      const userId = normalizeId(socket.data.userId);
      const name = String(payload?.name || socket.data.name || "Player").trim();
      socket.data.name = name || "Player";

      if (!userId) {
        safeAck(ack, { success: false, error: "Not authenticated." });
        return;
      }
      if (!gameId) {
        safeAck(ack, { success: false, error: "Game id is required." });
        return;
      }
      if (socket.data.fourPlayerGameId) {
        safeAck(ack, {
          success: false,
          error: "Leave your current game first.",
        });
        return;
      }
      if (socket.data.gameId && socket.data.gameId !== gameId) {
        safeAck(ack, {
          success: false,
          error: "Leave your current game first.",
        });
        return;
      }

      socket.data.inQueue = false;
      socket.data.queueKey = null;
      removeFromQueues(socket.id);
      socket.data.inFourPlayerQueue = false;
      socket.data.fourPlayerQueueKey = null;
      removeFromFourPlayerQueues(socket.id);

      const tournamentGame = await TournamentGame.findOne({ gameId }).lean();
      if (!tournamentGame) {
        safeAck(ack, { success: false, error: "Tournament game not found." });
        return;
      }
      if (tournamentGame.isBye) {
        safeAck(ack, { success: false, error: "This is a bye round." });
        return;
      }
      if (String(tournamentGame.result || "*") !== "*") {
        safeAck(ack, {
          success: false,
          error: "This game is already finished.",
        });
        return;
      }

      const whiteUserId = normalizeId(tournamentGame.whiteId);
      const blackUserId = normalizeId(tournamentGame.blackId);
      if (userId !== whiteUserId && userId !== blackUserId) {
        safeAck(ack, {
          success: false,
          error: "You are not a player in this game.",
        });
        return;
      }

      const tournament = await Tournament.findById(tournamentGame.tournamentId)
        .select("status timeControl")
        .lean();
      if (!tournament || tournament.status !== "running") {
        safeAck(ack, { success: false, error: "Tournament is not running." });
        return;
      }

      const userColor = userId === whiteUserId ? "w" : "b";
      const ownColorKey = userColor === "w" ? "white" : "black";
      const opponentColorKey = userColor === "w" ? "black" : "white";

      const activeGame = games.get(gameId);
      if (activeGame) {
        const previousSocketId = activeGame.players[ownColorKey];
        if (previousSocketId && previousSocketId !== socket.id) {
          const previousSocket = io.sockets.sockets.get(previousSocketId);
          if (previousSocket) {
            previousSocket.data.gameId = null;
          }
        }

        activeGame.players[ownColorKey] = socket.id;
        activeGame.playerUsers[ownColorKey] = userId;
        socket.data.gameId = gameId;
        socket.join(activeGame.room);
        syncUserPresenceFromSockets(userId);

        const opponentSocket = io.sockets.sockets.get(
          activeGame.players[opponentColorKey],
        );
        const opponentName = opponentSocket?.data?.name || "Opponent";
        const activeVariant = normalizeVariant(activeGame.variant || "standard");
        const activeTimeControl = normalizeTimeControl(activeGame.timeControl);
        const activeRatingPool = getRatingPoolForTimeControl(
          activeTimeControl,
          activeVariant,
        );
        const ratedForDisplay =
          activeGame.isRated === true && !!activeRatingPool;
        let playerRating = null;
        let opponentRating = null;
        if (ratedForDisplay && activeRatingPool) {
          try {
            const ratingField = ratingFieldForPool(activeRatingPool);
            const playerUserId = normalizeId(activeGame.playerUsers?.[ownColorKey]);
            const opponentUserId = normalizeId(
              activeGame.playerUsers?.[opponentColorKey],
            );
            const [playerUser, opponentUser] = await Promise.all([
              playerUserId
                ? User.findById(playerUserId).select(`${ratingField} rating`).lean()
                : null,
              opponentUserId
                ? User.findById(opponentUserId)
                    .select(`${ratingField} rating`)
                    .lean()
                : null,
            ]);
            playerRating = getRatingFromUserDoc(playerUser, ratingField);
            opponentRating = getRatingFromUserDoc(opponentUser, ratingField);
          } catch (error) {
            console.error("joinTournamentGame rejoin rating lookup error:", error);
          }
        }

        io.to(socket.id).emit("matchFound", {
          gameId,
          color: userColor,
          fen: activeGame.chess.fen(),
          opponentName,
          rated: ratedForDisplay,
          playerRating,
          opponentRating,
          timeControl: activeTimeControl,
          variant: activeVariant,
          ...getThreeCheckPayload(activeGame),
        });

        safeAck(ack, {
          success: true,
          status: "started",
          gameId,
          rejoined: true,
        });
        return;
      }

      // Prefer the calling socket for the current player to avoid picking a different tab/socket.
      const whiteSocket =
        userId === whiteUserId ? socket : getQuickGameSocketForUser(whiteUserId);
      const blackSocket =
        userId === blackUserId ? socket : getQuickGameSocketForUser(blackUserId);
      if (whiteSocket && blackSocket) {
        const socketTimeControl = tournamentTimeControlToSocketTimeControl(
          tournament.timeControl,
        );
        const ratingPool = getRatingPoolForTimeControl(
          socketTimeControl,
          "standard",
        );
        let whiteRating = null;
        let blackRating = null;
        if (ratingPool) {
          const ratingField = ratingFieldForPool(ratingPool);
          const [whiteUser, blackUser] = await Promise.all([
            User.findById(whiteUserId)
              .select(`${ratingField} rating`)
              .lean(),
            User.findById(blackUserId)
              .select(`${ratingField} rating`)
              .lean(),
          ]);
          whiteRating = getRatingFromUserDoc(whiteUser, ratingField);
          blackRating = getRatingFromUserDoc(blackUser, ratingField);
        }
        const created = createRealtimeGameRoom({
          gameId,
          whiteSocket,
          blackSocket,
          timeControl: socketTimeControl,
          variant: "standard",
          isRated: true,
          whiteRating,
          blackRating,
          tournamentId: normalizeId(tournamentGame.tournamentId),
          tournamentGameId: normalizeId(tournamentGame._id),
        });
        if (created) {
          await markTournamentGameStarted(gameId);
          safeAck(ack, { success: true, status: "started", gameId });
          return;
        }
      }

      syncUserPresenceFromSockets(userId);
      safeAck(ack, { success: true, status: "waiting", gameId });
    } catch (error) {
      console.error("joinTournamentGame error:", error);
      safeAck(ack, {
        success: false,
        error: "Failed to join tournament game.",
      });
    }
  });

  socket.on("findMatch", async ({ name, timeControl, variant } = {}) => {
    if (socket.data.gameId || socket.data.fourPlayerGameId) return;
    socket.data.name = name || "Player";
    socket.data.inFourPlayerQueue = false;
    socket.data.fourPlayerQueueKey = null;
    removeFromFourPlayerQueues(socket.id);
    if (socket.data.inQueue) return;

    const normalizedTimeControl = normalizeTimeControl(timeControl);
    const requestedVariant = normalizeVariant(variant);
    const normalizedVariant =
      requestedVariant === "fourPlayer" ? "standard" : requestedVariant;
    const queueKey = getQueueKey(normalizedTimeControl, normalizedVariant);
    const pool = getRatingPoolForTimeControl(
      normalizedTimeControl,
      normalizedVariant,
    );
    const ratingField = pool ? ratingFieldForPool(pool) : null;

    let seekerRating = 1200;
    const seekerUserId = normalizeId(socket.data.userId);
    if (seekerUserId) {
      try {
        const selectFields = ratingField ? `${ratingField} rating` : "rating";
        const seekerUser = await User.findById(seekerUserId)
          .select(selectFields)
          .lean();
        const parsedRating = Number(
          (ratingField ? seekerUser?.[ratingField] : undefined) ??
            seekerUser?.rating ??
            1200,
        );
        if (Number.isFinite(parsedRating)) {
          seekerRating = parsedRating;
        }
      } catch (error) {
        console.error("findMatch rating lookup error:", error);
      }
    }

    removeFromQueues(socket.id);
    socket.data.inQueue = true;
    socket.data.queueKey = queueKey;
    socket.data.queuePool = pool || null;
    socket.data.queueRating = seekerRating;
    syncUserPresenceFromSockets(seekerUserId);

    const queue = pruneMatchQueue(queueKey);
    let opponentSocket = null;
    const now = Date.now();
    const seekerRange = getExpandedMatchRange(0);

    let bestIndex = -1;
    let bestRatingDiff = Infinity;
    let selectedOpponentRating = null;
    for (let i = 0; i < queue.length; i += 1) {
      const candidateEntry = queue[i];
      if (!candidateEntry || candidateEntry.socketId === socket.id) continue;

      const candidateSocket = io.sockets.sockets.get(candidateEntry.socketId);
      if (!candidateSocket) continue;

      const candidateRating = Number(candidateEntry.rating);
      if (!Number.isFinite(candidateRating)) continue;

      const candidateWaitMs = Math.max(
        0,
        now - Number(candidateEntry.joinedAt || now),
      );
      const candidateRange = getExpandedMatchRange(candidateWaitMs);
      const ratingDiff = Math.abs(candidateRating - seekerRating);

      if (ratingDiff <= seekerRange && ratingDiff <= candidateRange) {
        if (ratingDiff < bestRatingDiff) {
          bestRatingDiff = ratingDiff;
          bestIndex = i;
        }
      }
    }

    if (bestIndex !== -1) {
      const [selected] = queue.splice(bestIndex, 1);
      waitingQueues.set(queueKey, queue);
      opponentSocket = io.sockets.sockets.get(selected.socketId);
      selectedOpponentRating = normalizeLiveRating(selected?.rating);
    }

    if (opponentSocket) {
      removeFromQueues(socket.id);
      removeFromQueues(opponentSocket.id);
      opponentSocket.data.inQueue = false;
      opponentSocket.data.queueKey = null;
      socket.data.inQueue = false;
      socket.data.queueKey = null;

      const gameId = crypto.randomBytes(8).toString("hex");
      const room = `game:${gameId}`;
      const initialPosition = createInitialPosition(normalizedVariant);
      const chess =
        initialPosition.fen === "start"
          ? new Chess()
          : new Chess(initialPosition.fen);
      const white = Math.random() < 0.5 ? socket.id : opponentSocket.id;
      const black = white === socket.id ? opponentSocket.id : socket.id;
      const socketToUser = {
        [socket.id]: normalizeId(socket.data.userId),
        [opponentSocket.id]: normalizeId(opponentSocket.data.userId),
      };

      games.set(gameId, {
        room,
        chess,
        players: { white, black },
        playerUsers: {
          white: socketToUser[white] || "",
          black: socketToUser[black] || "",
        },
        timeControl: normalizedTimeControl,
        variant: normalizedVariant,
        whiteCheckCount: 0,
        blackCheckCount: 0,
        chess960: initialPosition.chess960,
        isRated: true,
      });
      scheduleFirstMoveAbortTimer(gameId);

      socket.data.gameId = gameId;
      opponentSocket.data.gameId = gameId;
      const opponentUserId = normalizeId(opponentSocket.data.userId);
      syncUserPresenceFromSockets(seekerUserId);
      syncUserPresenceFromSockets(opponentUserId);

      socket.join(room);
      opponentSocket.join(room);
      const ratedForDisplay = !!pool;
      const seekerLiveRating = normalizeLiveRating(seekerRating);
      const opponentLiveRating = normalizeLiveRating(
        selectedOpponentRating ?? opponentSocket?.data?.queueRating,
      );

      io.to(socket.id).emit("matchFound", {
        gameId,
        color: socket.id === white ? "w" : "b",
        fen: chess.fen(),
        opponentName: opponentSocket.data.name || "Opponent",
        rated: ratedForDisplay,
        playerRating: seekerLiveRating,
        opponentRating: opponentLiveRating,
        timeControl: normalizedTimeControl,
        variant: normalizedVariant,
        whiteCheckCount: 0,
        blackCheckCount: 0,
      });

      io.to(opponentSocket.id).emit("matchFound", {
        gameId,
        color: opponentSocket.id === white ? "w" : "b",
        fen: chess.fen(),
        opponentName: socket.data.name || "Opponent",
        rated: ratedForDisplay,
        playerRating: opponentLiveRating,
        opponentRating: seekerLiveRating,
        timeControl: normalizedTimeControl,
        variant: normalizedVariant,
        whiteCheckCount: 0,
        blackCheckCount: 0,
      });
    } else {
      if (!queue.some((entry) => entry.socketId === socket.id)) {
        queue.push({
          socketId: socket.id,
          rating: seekerRating,
          joinedAt: now,
          pool,
        });
      }
      waitingQueues.set(queueKey, queue);
      socket.emit("queued", {
        timeControl: normalizedTimeControl,
        variant: normalizedVariant,
        pool,
        ratingRange: seekerRange,
        playerRating: seekerRating,
      });
    }
  });

  socket.on("findFourPlayerMatch", ({ name, timeControl } = {}) => {
    if (socket.data.gameId || socket.data.fourPlayerGameId) return;
    if (socket.data.inFourPlayerQueue) return;

    socket.data.name = name || socket.data.name || "Player";
    socket.data.inQueue = false;
    socket.data.queueKey = null;
    removeFromQueues(socket.id);

    const normalizedTimeControl = normalizeTimeControl(timeControl);
    const queueKey = getFourPlayerQueueKey(normalizedTimeControl);

    removeFromFourPlayerQueues(socket.id);
    socket.data.inFourPlayerQueue = true;
    socket.data.fourPlayerQueueKey = queueKey;
    syncUserPresenceFromSockets(normalizeId(socket.data.userId));

    const queue = getFourPlayerQueue(queueKey);
    if (!queue.includes(socket.id)) {
      queue.push(socket.id);
    }

    const validQueue = [];
    for (const queuedId of queue) {
      const candidate = io.sockets.sockets.get(queuedId);
      if (
        candidate &&
        candidate.data.inFourPlayerQueue &&
        !candidate.data.gameId &&
        !candidate.data.fourPlayerGameId &&
        candidate.data.fourPlayerQueueKey === queueKey
      ) {
        validQueue.push(queuedId);
      }
    }
    fourPlayerQueues.set(queueKey, validQueue);

    if (validQueue.length < 4) {
      queueFourPlayerStatus(socket, queueKey);
      return;
    }

    const selectedSocketIds = validQueue.slice(0, 4);
    const remaining = validQueue.slice(4);
    fourPlayerQueues.set(queueKey, remaining);

    const selectedSockets = selectedSocketIds
      .map((socketId) => io.sockets.sockets.get(socketId))
      .filter(Boolean);

    if (selectedSockets.length < 4) {
      const repairedQueue = [...remaining, ...selectedSockets.map((s) => s.id)];
      fourPlayerQueues.set(queueKey, repairedQueue);
      selectedSockets.forEach((s) => queueFourPlayerStatus(s, queueKey));
      return;
    }

    const gameId = crypto.randomBytes(8).toString("hex");
    const room = `four-player:${gameId}`;
    const shuffledColors = [...FOUR_PLAYER_COLORS].sort(() => Math.random() - 0.5);
    const playersByColor = {};
    const socketToColor = {};

    selectedSockets.forEach((playerSocket, index) => {
      const color = shuffledColors[index];
      playersByColor[color] = {
        socketId: playerSocket.id,
        userId: normalizeId(playerSocket.data.userId),
        name: playerSocket.data.name || "Player",
      };
      socketToColor[playerSocket.id] = color;

      playerSocket.data.fourPlayerGameId = gameId;
      playerSocket.data.inFourPlayerQueue = false;
      playerSocket.data.fourPlayerQueueKey = null;
      playerSocket.join(room);
    });
    selectedSockets.forEach((playerSocket) => {
      syncUserPresenceFromSockets(normalizeId(playerSocket.data.userId));
    });

    const game = {
      id: gameId,
      room,
      state: createInitialFourPlayerState(),
      playersByColor,
      socketToColor,
      timeControl: normalizedTimeControl,
    };
    fourPlayerGames.set(gameId, game);

    const playersPayload = serializeFourPlayerPlayers(playersByColor);
    selectedSockets.forEach((playerSocket) => {
      io.to(playerSocket.id).emit("fourPlayerMatchFound", {
        gameId,
        color: socketToColor[playerSocket.id],
        state: game.state,
        players: playersPayload,
        timeControl: normalizedTimeControl,
      });
    });
  });

  socket.on("cancelFourPlayerFind", () => {
    socket.data.inFourPlayerQueue = false;
    socket.data.fourPlayerQueueKey = null;
    removeFromFourPlayerQueues(socket.id);
    syncUserPresenceFromSockets(normalizeId(socket.data.userId));
    socket.emit("fourPlayerQueueCancelled");
  });

  socket.on("fourPlayerMove", ({ gameId, from, to } = {}) => {
    const resolvedGameId = gameId || socket.data.fourPlayerGameId;
    if (!resolvedGameId) return;

    const game = fourPlayerGames.get(resolvedGameId);
    if (!game) return;

    const moverColor = game.socketToColor[socket.id];
    if (!moverColor) {
      socket.emit("fourPlayerMoveRejected", { reason: "Not part of this game." });
      return;
    }

    const normalizedFrom = normalizeFourPlayerSquare(from);
    const normalizedTo = normalizeFourPlayerSquare(to);
    if (!normalizedFrom || !normalizedTo) {
      socket.emit("fourPlayerMoveRejected", { reason: "Invalid move payload." });
      return;
    }

    const result = applyFourPlayerMove(
      game.state,
      normalizedFrom,
      normalizedTo,
      moverColor,
    );
    if (!result.ok) {
      socket.emit("fourPlayerMoveRejected", {
        reason: result.reason || "Illegal move.",
      });
      return;
    }

    game.state = result.state;
    emitFourPlayerState(game, {
      lastMove: result.move,
      moverColor,
    });
    maybeFinishFourPlayerGame(game, "elimination");
  });

  socket.on("fourPlayerLeaveGame", ({ gameId } = {}) => {
    const resolvedGameId = gameId || socket.data.fourPlayerGameId;
    if (!resolvedGameId) return;
    if (socket.data.fourPlayerGameId !== resolvedGameId) return;
    forfeitFourPlayerSocket(socket, "player_left");
  });

  socket.on("fourPlayerResync", ({ gameId } = {}) => {
    const resolvedGameId = gameId || socket.data.fourPlayerGameId;
    if (!resolvedGameId) return;

    const game = fourPlayerGames.get(resolvedGameId);
    if (!game) return;

    const moverColor = game.socketToColor[socket.id];
    if (!moverColor) {
      socket.emit("fourPlayerMoveRejected", { reason: "Not part of this game." });
      return;
    }

    emitFourPlayerState(game, { systemMessage: "Resynced game state." });
  });

  socket.on("sendFriendChallenge", async (payload = {}, ack) => {
    try {
      const fromUserId = normalizeId(socket.data.userId);
      const fromName = socket.data.name || "Player";
      const toUserId = normalizeId(payload.toUserId);
      const toName = String(payload.toName || "Friend");

      if (!fromUserId) {
        safeAck(ack, { success: false, error: "Not authenticated." });
        return;
      }

      if (!toUserId) {
        safeAck(ack, { success: false, error: "Invalid friend target." });
        return;
      }

      if (fromUserId === toUserId) {
        safeAck(ack, { success: false, error: "You cannot challenge yourself." });
        return;
      }

      if (socket.data.gameId || socket.data.fourPlayerGameId) {
        safeAck(ack, { success: false, error: "You are already in a game." });
        return;
      }

      const isFriend = await Friend.findOne({
        userId: fromUserId,
        friendId: toUserId,
      })
        .select("_id")
        .lean();

      if (!isFriend) {
        safeAck(ack, {
          success: false,
          error: "Challenge failed: player is not in your friends list.",
        });
        return;
      }

      const challengeId = crypto.randomBytes(12).toString("hex");
      const challenge = {
        id: challengeId,
        fromUserId,
        fromName,
        fromRating:
          Number.isFinite(Number(payload.fromRating)) &&
          Number(payload.fromRating) > 0
            ? Number(payload.fromRating)
            : 1200,
        toUserId,
        toName,
        gameType: normalizeGameType(payload.gameType),
        rated: !!payload.rated,
        playAs: normalizePlayAs(payload.playAs),
        timeControl: normalizeTimeControl(payload.timeControl),
        createdAt: Date.now(),
        fromSocketId: socket.id,
      };

      pendingChallenges.set(challengeId, challenge);

      io.to(getUserRoom(toUserId)).emit("friendChallengeReceived", challenge);
      io.to(getUserRoom(fromUserId)).emit("friendChallengeSent", {
        challengeId,
        toUserId,
        toName,
      });

      safeAck(ack, { success: true, challengeId, challenge });
    } catch (error) {
      console.error("sendFriendChallenge error:", error);
      safeAck(ack, { success: false, error: "Failed to send challenge." });
    }
  });

  socket.on("respondFriendChallenge", async (payload = {}, ack) => {
    try {
      const userId = normalizeId(socket.data.userId);
      const challengeId = String(payload.challengeId || "");
      const accept = payload.accept === true;

      if (!userId) {
        safeAck(ack, { success: false, error: "Not authenticated." });
        return;
      }

      if (!challengeId || !pendingChallenges.has(challengeId)) {
        safeAck(ack, { success: false, error: "Challenge no longer available." });
        return;
      }

      const challenge = pendingChallenges.get(challengeId);
      if (challenge.toUserId !== userId) {
        safeAck(ack, { success: false, error: "Not authorized for challenge." });
        return;
      }

      pendingChallenges.delete(challengeId);

      if (!accept) {
        io.to(getUserRoom(challenge.fromUserId)).emit("friendChallengeDeclined", {
          challengeId,
          byUserId: userId,
          byName: socket.data.name || "Friend",
        });
        safeAck(ack, { success: true, status: "declined" });
        return;
      }

      const challengerSocket = getSocketForUser(
        io,
        challenge.fromUserId,
        challenge.fromSocketId,
      );
      const receiverSocket = socket;

      if (!challengerSocket) {
        io.to(getUserRoom(userId)).emit("friendChallengeError", {
          challengeId,
          error: "Challenger went offline.",
        });
        safeAck(ack, { success: false, error: "Challenger is offline." });
        return;
      }

      if (
        challengerSocket.data.gameId ||
        challengerSocket.data.fourPlayerGameId ||
        receiverSocket.data.gameId ||
        receiverSocket.data.fourPlayerGameId
      ) {
        io.to(getUserRoom(challenge.fromUserId)).emit("friendChallengeDeclined", {
          challengeId,
          byUserId: userId,
          byName: "System",
          reason: "One of the players is already in a game.",
        });
        safeAck(ack, {
          success: false,
          error: "One of the players is already in a game.",
        });
        return;
      }

      removeFromQueues(challengerSocket.id);
      removeFromQueues(receiverSocket.id);
      removeFromFourPlayerQueues(challengerSocket.id);
      removeFromFourPlayerQueues(receiverSocket.id);
      challengerSocket.data.inQueue = false;
      challengerSocket.data.queueKey = null;
      challengerSocket.data.inFourPlayerQueue = false;
      challengerSocket.data.fourPlayerQueueKey = null;
      receiverSocket.data.inQueue = false;
      receiverSocket.data.queueKey = null;
      receiverSocket.data.inFourPlayerQueue = false;
      receiverSocket.data.fourPlayerQueueKey = null;

      const gameId = crypto.randomBytes(8).toString("hex");
      const room = `game:${gameId}`;
      const normalizedVariant = normalizeVariant(challenge.gameType);
      const initialPosition = createInitialPosition(normalizedVariant);
      const chess =
        initialPosition.fen === "start"
          ? new Chess()
          : new Chess(initialPosition.fen);
      const normalizedTimeControl = normalizeTimeControl(challenge.timeControl);
      const ratingPool = getRatingPoolForTimeControl(
        normalizedTimeControl,
        normalizedVariant,
      );
      const ratedForDisplay = challenge.rated === true && !!ratingPool;
      let challengerRating = null;
      let receiverRating = null;
      if (ratedForDisplay && ratingPool) {
        try {
          const ratingField = ratingFieldForPool(ratingPool);
          const [challengerUser, receiverUser] = await Promise.all([
            User.findById(challenge.fromUserId)
              .select(`${ratingField} rating`)
              .lean(),
            User.findById(challenge.toUserId)
              .select(`${ratingField} rating`)
              .lean(),
          ]);
          challengerRating = getRatingFromUserDoc(challengerUser, ratingField);
          receiverRating = getRatingFromUserDoc(receiverUser, ratingField);
        } catch (error) {
          console.error("respondFriendChallenge rating lookup error:", error);
        }
      }

      let whiteSocketId = challengerSocket.id;
      let blackSocketId = receiverSocket.id;
      if (challenge.playAs === "black") {
        whiteSocketId = receiverSocket.id;
        blackSocketId = challengerSocket.id;
      } else if (challenge.playAs === "random") {
        if (Math.random() < 0.5) {
          whiteSocketId = receiverSocket.id;
          blackSocketId = challengerSocket.id;
        }
      }
      const socketToUser = {
        [challengerSocket.id]: normalizeId(challenge.fromUserId),
        [receiverSocket.id]: normalizeId(challenge.toUserId),
      };

      games.set(gameId, {
        room,
        chess,
        players: { white: whiteSocketId, black: blackSocketId },
        playerUsers: {
          white: socketToUser[whiteSocketId] || "",
          black: socketToUser[blackSocketId] || "",
        },
        timeControl: normalizedTimeControl,
        variant: normalizedVariant,
        whiteCheckCount: 0,
        blackCheckCount: 0,
        chess960: initialPosition.chess960,
        isRated: challenge.rated === true,
      });
      scheduleFirstMoveAbortTimer(gameId);

      challengerSocket.data.gameId = gameId;
      receiverSocket.data.gameId = gameId;
      syncUserPresenceFromSockets(normalizeId(challengerSocket.data.userId));
      syncUserPresenceFromSockets(normalizeId(receiverSocket.data.userId));
      challengerSocket.join(room);
      receiverSocket.join(room);

      const challengerColor = challengerSocket.id === whiteSocketId ? "w" : "b";
      const receiverColor = receiverSocket.id === whiteSocketId ? "w" : "b";

      const challengerPayload = {
        challengeId,
        gameId,
        color: challengerColor,
        fen: chess.fen(),
        opponentUserId: challenge.toUserId,
        opponentName: challenge.toName || receiverSocket.data.name || "Friend",
        timeControl: normalizedTimeControl,
        gameType: challenge.gameType,
        variant: normalizedVariant,
        whiteCheckCount: 0,
        blackCheckCount: 0,
        rated: ratedForDisplay,
        playerRating: challengerRating,
        opponentRating: receiverRating,
      };

      const receiverPayload = {
        challengeId,
        gameId,
        color: receiverColor,
        fen: chess.fen(),
        opponentUserId: challenge.fromUserId,
        opponentName:
          challenge.fromName || challengerSocket.data.name || "Friend",
        timeControl: normalizedTimeControl,
        gameType: challenge.gameType,
        variant: normalizedVariant,
        whiteCheckCount: 0,
        blackCheckCount: 0,
        rated: ratedForDisplay,
        playerRating: receiverRating,
        opponentRating: challengerRating,
      };

      io.to(challengerSocket.id).emit("friendGameStarted", challengerPayload);
      io.to(receiverSocket.id).emit("friendGameStarted", receiverPayload);

      safeAck(ack, {
        success: true,
        status: "accepted",
        gameId,
        game: receiverPayload,
      });
    } catch (error) {
      console.error("respondFriendChallenge error:", error);
      safeAck(ack, { success: false, error: "Failed to process challenge." });
    }
  });

  socket.on("cancelFind", () => {
    socket.data.inQueue = false;
    socket.data.queueKey = null;
    removeFromQueues(socket.id);
    syncUserPresenceFromSockets(normalizeId(socket.data.userId));
    socket.emit("queueCancelled");
  });

  socket.on("makeMove", ({ gameId, from, to, promotion }) => {
    const game = games.get(gameId);
    if (!game) return;

    const { room, players } = game;
    const chess = game.chess;
    const moverColor =
      socket.id === players.white
        ? "w"
        : socket.id === players.black
          ? "b"
          : null;

    if (!moverColor) return;
    if (chess.turn() !== moverColor) {
      return socket.emit("moveRejected", { reason: "Not your turn" });
    }
    const pliesBeforeMove = gamePlies(game);

    const castlingResult = tryHandleChess960Castling(game, moverColor, from, to);
    if (castlingResult.handled) {
      if (!castlingResult.success) {
        return socket.emit("moveRejected", {
          reason: castlingResult.reason || "Illegal castling move",
        });
      }

      const nextChess = castlingResult.game.chess;
      if (pliesBeforeMove === 0) {
        game.firstMoveAt = Date.now();
        clearFirstMoveAbortTimer(game);
      }
      const threeCheckResult = applyThreeCheckAfterMove(game, moverColor);
      io.to(room).emit("moveApplied", {
        gameId,
        move: castlingResult.move,
        fen: nextChess.fen(),
        turn: nextChess.turn(),
        isChess960Castle: true,
        isCheck: isCheck(nextChess),
        isCheckmate: isCheckmate(nextChess),
        isDraw: isDraw(nextChess),
        isStalemate: isStalemate(nextChess),
        ...getThreeCheckPayload(game),
        checkAwarded: threeCheckResult.checkAwarded,
      });

      if (threeCheckResult.isThreeCheckWin) {
        emitGameOver(gameId, "three_check", moverColor);
      } else if (isCheckmate(nextChess)) {
        const winner = nextChess.turn() === "w" ? "b" : "w";
        emitGameOver(gameId, "checkmate", winner);
      } else if (
        isDraw(nextChess) ||
        isStalemate(nextChess) ||
        isInsufficientMaterial(nextChess) ||
        isThreefoldRepetition(nextChess)
      ) {
        emitGameOver(gameId, "draw", null);
      }
      return;
    }

    const move = chess.move({
      from,
      to,
      promotion: promotion || "q",
    });

    if (!move) {
      return socket.emit("moveRejected", { reason: "Illegal move" });
    }

    if (pliesBeforeMove === 0) {
      game.firstMoveAt = Date.now();
      clearFirstMoveAbortTimer(game);
    }

    updateChess960RightsForNormalMove(game, move, moverColor);
    const threeCheckResult = applyThreeCheckAfterMove(game, moverColor);

    io.to(room).emit("moveApplied", {
      gameId,
      move,
      fen: chess.fen(),
      turn: chess.turn(),
      isCheck: isCheck(chess),
      isCheckmate: isCheckmate(chess),
      isDraw: isDraw(chess),
      isStalemate: isStalemate(chess),
      ...getThreeCheckPayload(game),
      checkAwarded: threeCheckResult.checkAwarded,
    });

    if (threeCheckResult.isThreeCheckWin) {
      emitGameOver(gameId, "three_check", moverColor);
    } else if (isCheckmate(chess)) {
      const winner = chess.turn() === "w" ? "b" : "w";
      emitGameOver(gameId, "checkmate", winner);
    } else if (
      isDraw(chess) ||
      isStalemate(chess) ||
      isInsufficientMaterial(chess) ||
      isThreefoldRepetition(chess)
    ) {
      emitGameOver(gameId, "draw", null);
    }
  });

  socket.on("resign", ({ gameId } = {}) => {
    const game = games.get(gameId || socket.data.gameId);
    if (!game) return;
    const winner =
      socket.id === game.players.white
        ? "b"
        : socket.id === game.players.black
          ? "w"
          : null;
    if (!winner) return;
    emitGameOver(gameId || socket.data.gameId, "resign", winner);
  });

  socket.on("timeout", ({ gameId } = {}) => {
    const game = games.get(gameId || socket.data.gameId);
    if (!game) return;
    const winner =
      socket.id === game.players.white
        ? "b"
        : socket.id === game.players.black
          ? "w"
          : null;
    if (!winner) return;
    emitGameOver(gameId || socket.data.gameId, "timeout", winner);
  });

  socket.on("leaveGame", ({ gameId } = {}) => {
    const game = games.get(gameId || socket.data.gameId);
    if (!game) return;
    const winner =
      socket.id === game.players.white
        ? "b"
        : socket.id === game.players.black
          ? "w"
          : null;
    if (!winner) return;
    emitGameOver(gameId || socket.data.gameId, "opponent_left", winner);
  });

  socket.on("disconnect", () => {
    socket.data.inQueue = false;
    socket.data.queueKey = null;
    socket.data.inFourPlayerQueue = false;
    socket.data.fourPlayerQueueKey = null;
    removeFromQueues(socket.id);
    removeFromFourPlayerQueues(socket.id);

    if (socket.data.fourPlayerGameId) {
      forfeitFourPlayerSocket(socket, "disconnect");
    }

    const userId = normalizeId(socket.data.userId);
    unregisterUserSocket(userId, socket.id);
    syncUserPresenceFromSockets(userId, { forcePersist: true });

    if (userId && !userSockets.has(userId)) {
      for (const [challengeId, challenge] of pendingChallenges.entries()) {
        if (challenge.fromUserId === userId) {
          pendingChallenges.delete(challengeId);
          io.to(getUserRoom(challenge.toUserId)).emit("friendChallengeCancelled", {
            challengeId,
            reason: "Challenger disconnected.",
          });
        }
      }
    }

    const gameId = socket.data.gameId;
    if (gameId) {
      const game = games.get(gameId);
      if (game) {
        const winner =
          socket.id === game.players.white
            ? "b"
            : socket.id === game.players.black
              ? "w"
              : null;
        if (winner) emitGameOver(gameId, "opponent_left", winner);
      }
    }
  });
});

async function bootstrapServer() {
  await connectDB();
  runPostConnectTasks();

  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Allowed origins: ${allowedOrigins.join(", ")}`);
  });
}

bootstrapServer().catch((error) => {
  console.error("❌ Server bootstrap error:", error);
  process.exit(1);
});
