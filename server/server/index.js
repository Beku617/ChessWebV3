import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import http from "http";
import crypto from "crypto";
import path from "path";
import { Server } from "socket.io";
import { Chess } from "chess.js";
import { fileURLToPath } from "url";
import {
  FOUR_PLAYER_COLORS,
  createInitialFourPlayerState,
  applyFourPlayerMove,
  eliminateFourPlayerColor,
} from "./utils/fourPlayerEngine.js";
import { connectDB } from "./config/db.js";
import {
  ActiveGameSession,
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
  ABORT_TIMEOUT_MS_DEFAULT,
  getAbortThresholdMs,
  MIN_REAL_GAME_PLIES,
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
  normalizeTournamentState,
  TOURNAMENT_STATES,
} from "./modules/tournaments/stateMachine.js";
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
  adminTournamentsRoutes,
  mediaRoutes,
  lichessRoutes,
  friendsRoutes,
  ratingsRoutes,
  tournamentRoutes,
  messagesRoutes,
  learnRoutes,
  adminLearnRoutes,
} from "./routes/index.js";
import {
  authMiddleware,
  requestSecurityMiddleware,
} from "./middleware/index.js";
import { migrateLegacyRuntimeMedia } from "./utils/runtimeMediaMigration.js";
import { areUsersBlocked, isBlocked } from "./utils/visibility.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
const LEGACY_UPLOAD_DIRS = [
  path.resolve(__dirname, "./uploads"),
  path.resolve(__dirname, "../uploads"),
];
const PUBLIC_API_ROUTES = new Set([
  "POST:/login",
  "POST:/register",
  "POST:/verify-email",
  "POST:/resend-verification-code",
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
const userActiveGames = new Map(); // userId -> gameId
const userActiveFourPlayerGames = new Map(); // userId -> gameId
const pendingChallenges = new Map(); // challengeId -> challenge metadata
const userPresence = new Map(); // userId -> { status, lastSeenAt, lastActiveAt, lastPersistedAt }
const INITIAL_MATCH_RANGE = 50;
const MATCH_RANGE_STEP = 25;
const MATCH_RANGE_STEP_SECONDS = 5;
const MAX_MATCH_RANGE = 500;
const RECONNECT_GRACE_MS_BY_POOL = Object.freeze({
  bullet: 10 * 1000,
  blitz: 30 * 1000,
  rapid: 60 * 1000,
  classical: 60 * 1000,
});
const ACTIVE_SESSION_STATUSES = Object.freeze([
  "active",
  "temporarily_disconnected",
]);
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
app.use(
  helmet({
    // Local media is served from :3001 and embedded by the Vite app on :5173.
    // Keep CORP permissive for these development cross-origin media loads.
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));
app.use(cookieParser(COOKIE_SECRET));
app.use(cors(corsOptions));
LEGACY_UPLOAD_DIRS.forEach((uploadDir) => {
  app.use(
    "/uploads",
    (_req, res, next) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      next();
    },
    express.static(uploadDir),
  );
});
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
app.use("/api/admin/tournaments", adminTournamentsRoutes);
app.use("/api/featured-events", featuredEventsRoutes);
app.use("/api/lichess", lichessRoutes);
app.use("/api/friends", friendsRoutes);
app.use("/api/ratings", ratingsRoutes);
app.use("/api/tournaments", tournamentRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/learn", learnRoutes);
app.use("/api/admin/learn", adminLearnRoutes);

app.get("/api/active-game", async (req, res) => {
  const userId = normalizeId(req.user?.userId);
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const session = await ensurePersistedActiveSessionForUser(userId);
  if (!session) {
    return res.status(200).json({ active: false, session: null });
  }

  if (
    session.status === "temporarily_disconnected" &&
    session.reconnectDeadlineAt &&
    new Date(session.reconnectDeadlineAt).getTime() <= Date.now()
  ) {
    const disconnectedColor = String(session.disconnectedColor || "") === "b" ? "b" : "w";
    const winner = session.kind === "classic" ? (disconnectedColor === "w" ? "b" : "w") : "";
    await completeSessionRecord(session.gameId, {
      status: "completed",
      terminalReason: session.kind === "classic" ? "opponent_left" : "disconnect_timeout",
      winner,
    });
    return res.status(200).json({ active: false, session: null });
  }

  return res.status(200).json({
    active: true,
    session: buildActiveSessionResponse(session, userId),
  });
});

app.post("/api/active-game/resign", async (req, res) => {
  const userId = normalizeId(req.user?.userId);
  const requestedGameId = String(req.body?.gameId || "").trim();
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if (!requestedGameId) {
    return res.status(400).json({ error: "Game id is required." });
  }

  const classicGame = games.get(requestedGameId);
  if (classicGame) {
    const winner =
      normalizeId(classicGame?.playerUsers?.white) === userId
        ? "b"
        : normalizeId(classicGame?.playerUsers?.black) === userId
          ? "w"
          : null;
    if (!winner) {
      return res.status(403).json({ error: "You are not a participant in this game." });
    }
    await emitGameOver(requestedGameId, "resign", winner, {
      preserveEarlyResult: true,
    });
    return res.status(200).json({ success: true });
  }

  const fourPlayerGame = fourPlayerGames.get(requestedGameId);
  if (fourPlayerGame) {
    const color = getFourPlayerColorByUserId(fourPlayerGame, userId);
    if (!color) {
      return res.status(403).json({ error: "You are not a participant in this game." });
    }
    fourPlayerGame.state = eliminateFourPlayerColor(fourPlayerGame.state, color);
    await persistFourPlayerGameSession(requestedGameId, {
      status: "completed",
      terminalReason: "player_left",
      winner: String(fourPlayerGame.state?.winner || ""),
      completedAt: new Date(),
    });
    maybeFinishFourPlayerGame(fourPlayerGame, "player_left");
    return res.status(200).json({ success: true });
  }

  const session = await ActiveGameSession.findOne({
    gameId: requestedGameId,
    participantUserIds: userId,
  }).lean();
  if (!session) {
    return res.status(404).json({ error: "Active game not found." });
  }

  await completeSessionRecord(requestedGameId, {
    status: "completed",
    terminalReason: "resign",
  });
  return res.status(200).json({ success: true });
});

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
    const unsignedToken = cookieParser.signedCookie(
      decodedToken,
      COOKIE_SECRET,
    );

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

function setUserActiveGame(userId, gameId) {
  const normalizedUserId = normalizeId(userId);
  const normalizedGameId = String(gameId || "").trim();
  if (!normalizedUserId || !normalizedGameId) return;
  userActiveGames.set(normalizedUserId, normalizedGameId);
}

function clearUserActiveGame(userId, gameId = null) {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) return;
  if (!userActiveGames.has(normalizedUserId)) return;
  if (gameId) {
    const current = userActiveGames.get(normalizedUserId);
    if (String(current || "") !== String(gameId || "")) return;
  }
  userActiveGames.delete(normalizedUserId);
}

function setUserActiveFourPlayerGame(userId, gameId) {
  const normalizedUserId = normalizeId(userId);
  const normalizedGameId = String(gameId || "").trim();
  if (!normalizedUserId || !normalizedGameId) return;
  userActiveFourPlayerGames.set(normalizedUserId, normalizedGameId);
}

function clearUserActiveFourPlayerGame(userId, gameId = null) {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) return;
  if (!userActiveFourPlayerGames.has(normalizedUserId)) return;
  if (gameId) {
    const current = userActiveFourPlayerGames.get(normalizedUserId);
    if (String(current || "") !== String(gameId || "")) return;
  }
  userActiveFourPlayerGames.delete(normalizedUserId);
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

function emitTournamentBoardAssignments(
  tournamentId,
  roundNumber,
  pairings = [],
) {
  const normalizedTournamentId = normalizeId(tournamentId);
  if (!normalizedTournamentId) return;
  const round = Number(roundNumber || 0);
  for (const pairing of pairings || []) {
    const gameId = String(pairing?.gameId || "").trim();
    if (!gameId || pairing?.isBye) continue;
    const whiteId = normalizeId(pairing?.whiteId);
    const blackId = normalizeId(pairing?.blackId);
    const board = Number(pairing?.board || 0) || 1;
    if (whiteId) {
      io.to(getUserRoom(whiteId)).emit("tournament:boardAssigned", {
        tournamentId: normalizedTournamentId,
        round,
        gameId,
        board,
        color: "w",
        opponentId: blackId || null,
        autoStart: true,
      });
    }
    if (blackId) {
      io.to(getUserRoom(blackId)).emit("tournament:boardAssigned", {
        tournamentId: normalizedTournamentId,
        round,
        gameId,
        board,
        color: "b",
        opponentId: whiteId || null,
        autoStart: true,
      });
    }
  }
}

function normalizePresenceStatus(value) {
  const status = String(value || "offline")
    .trim()
    .toLowerCase();
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

function getReconnectGraceMsForTimeControl(timeControl) {
  const normalizedTimeControl = normalizeTimeControl(timeControl);
  const estimatedSeconds =
    normalizedTimeControl.initial + normalizedTimeControl.increment * 40;

  if (estimatedSeconds < 180) {
    return RECONNECT_GRACE_MS_BY_POOL.bullet;
  }
  if (estimatedSeconds < 600) {
    return RECONNECT_GRACE_MS_BY_POOL.blitz;
  }
  if (estimatedSeconds < 1800) {
    return RECONNECT_GRACE_MS_BY_POOL.rapid;
  }
  return RECONNECT_GRACE_MS_BY_POOL.classical;
}

function getClassicGameMoves(game) {
  if (Array.isArray(game?.persistedMoves)) {
    return game.persistedMoves
      .map((move) => String(move || "").trim())
      .filter(Boolean);
  }
  if (game?.chess && typeof game.chess.history === "function") {
    const history = game.chess.history();
    if (Array.isArray(history)) {
      return history
        .map((move) => String(move || "").trim())
        .filter(Boolean);
    }
  }
  return [];
}

function setClassicGameMoves(game, moves) {
  if (!game) return;
  game.persistedMoves = Array.isArray(moves)
    ? moves.map((move) => String(move || "").trim()).filter(Boolean)
    : [];
}

function buildClassicPlayerConnection(game, colorKey) {
  const socketId = String(game?.players?.[colorKey] || "").trim();
  const isWhite = colorKey === "white";
  const color = isWhite ? "w" : "b";
  const userId = normalizeId(game?.playerUsers?.[colorKey]);
  return {
    userId,
    name: String(game?.playerNames?.[colorKey] || "Player"),
    connected: !!socketId,
    disconnectedAt: game?.disconnectedAt?.[color] || null,
    socketId,
  };
}

function buildClassicSessionUpdate(game, overrides = {}) {
  const moves = getClassicGameMoves(game);
  const clock = getClockSnapshot(game);
  const disconnectColor =
    typeof overrides.disconnectedColor === "string" && overrides.disconnectedColor
      ? overrides.disconnectedColor
      : "";
  const reconnectGraceMs =
    Number(overrides.reconnectGraceMs) ||
    Number(game?.reconnectGraceMs) ||
    getReconnectGraceMsForTimeControl(game?.timeControl);

  return {
    gameId: String(game?.id || overrides.gameId || "").trim(),
    kind: "classic",
    mode:
      overrides.mode ||
      (game?.mode === "friend" || game?.mode === "tournament"
        ? game.mode
        : "quick"),
    status: overrides.status || "active",
    participantUserIds: [
      normalizeId(game?.playerUsers?.white),
      normalizeId(game?.playerUsers?.black),
    ].filter(Boolean),
    variant: normalizeVariant(overrides.variant || game?.variant),
    timeControl: normalizeTimeControl(overrides.timeControl || game?.timeControl),
    rated: overrides.rated ?? game?.isRated === true,
    white: buildClassicPlayerConnection(game, "white"),
    black: buildClassicPlayerConnection(game, "black"),
    fen: String(overrides.fen || game?.chess?.fen?.() || "start"),
    moves,
    moveCount: Number.isFinite(Number(overrides.moveCount))
      ? Number(overrides.moveCount)
      : moves.length,
    turn: String(overrides.turn || game?.chess?.turn?.() || "w") === "b" ? "b" : "w",
    chess960: game?.chess960 || undefined,
    whiteCheckCount: Number(game?.whiteCheckCount || 0),
    blackCheckCount: Number(game?.blackCheckCount || 0),
    clockState: {
      ...clock,
      pausedAt: game?.clockState?.pausedAt || null,
      pausedForDisconnect: game?.clockState?.pausedForDisconnect || null,
    },
    ratingByColor: game?.ratingByColor || undefined,
    disconnectedColor: disconnectColor,
    disconnectedAt: overrides.disconnectedAt || game?.disconnectedAt?.[disconnectColor] || null,
    reconnectDeadlineAt: overrides.reconnectDeadlineAt || null,
    reconnectGraceMs,
    terminalReason: overrides.terminalReason || "",
    winner: overrides.winner || "",
    startedAt: overrides.startedAt || game?.startedAt || new Date(),
    completedAt: overrides.completedAt || null,
  };
}

function buildFourPlayerSessionUpdate(game, overrides = {}) {
  const participants = [];
  const playersByColor = {};
  FOUR_PLAYER_COLORS.forEach((color) => {
    const player = game?.playersByColor?.[color];
    const userId = normalizeId(player?.userId);
    if (userId) {
      participants.push(userId);
    }
    playersByColor[color] = {
      userId,
      name: String(player?.name || color.toUpperCase()),
      connected: !!player?.socketId,
      disconnectedAt: game?.disconnectedAt?.[color] || null,
      socketId: String(player?.socketId || ""),
    };
  });

  const disconnectedColor =
    typeof overrides.disconnectedColor === "string" && overrides.disconnectedColor
      ? overrides.disconnectedColor
      : "";
  const reconnectGraceMs =
    Number(overrides.reconnectGraceMs) ||
    Number(game?.reconnectGraceMs) ||
    getReconnectGraceMsForTimeControl(game?.timeControl);

  return {
    gameId: String(game?.id || overrides.gameId || "").trim(),
    kind: "fourPlayer",
    mode: "fourPlayer",
    status: overrides.status || "active",
    participantUserIds: participants,
    variant: "fourPlayer",
    timeControl: normalizeTimeControl(overrides.timeControl || game?.timeControl),
    rated: false,
    playersByColor,
    state: game?.state || undefined,
    moveCount: Array.isArray(game?.state?.moves) ? game.state.moves.length : 0,
    disconnectedColor,
    disconnectedAt: overrides.disconnectedAt || game?.disconnectedAt?.[disconnectedColor] || null,
    reconnectDeadlineAt: overrides.reconnectDeadlineAt || null,
    reconnectGraceMs,
    terminalReason: overrides.terminalReason || "",
    winner: overrides.winner || String(game?.state?.winner || ""),
    startedAt: overrides.startedAt || game?.startedAt || new Date(),
    completedAt: overrides.completedAt || null,
  };
}

async function persistClassicGameSession(gameId, overrides = {}) {
  const normalizedGameId = String(gameId || "").trim();
  if (!normalizedGameId) return null;
  const game = games.get(normalizedGameId);
  if (!game) return null;
  const update = buildClassicSessionUpdate(game, overrides);
  return ActiveGameSession.findOneAndUpdate(
    { gameId: normalizedGameId },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch((error) => {
    console.error("Active game session sync error:", error);
    return null;
  });
}

async function persistFourPlayerGameSession(gameId, overrides = {}) {
  const normalizedGameId = String(gameId || "").trim();
  if (!normalizedGameId) return null;
  const game = fourPlayerGames.get(normalizedGameId);
  if (!game) return null;
  const update = buildFourPlayerSessionUpdate(game, overrides);
  return ActiveGameSession.findOneAndUpdate(
    { gameId: normalizedGameId },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch((error) => {
    console.error("Active 4-player session sync error:", error);
    return null;
  });
}

async function persistSessionDisconnected(gameId, disconnectedColor) {
  const normalizedGameId = String(gameId || "").trim();
  if (!normalizedGameId) return null;
  const game = games.get(normalizedGameId);
  if (!game) return null;

  const graceMs = getReconnectGraceMsForTimeControl(game.timeControl);
  const deadline = new Date(Date.now() + graceMs);
  game.reconnectGraceMs = graceMs;
  return persistClassicGameSession(normalizedGameId, {
    status: "temporarily_disconnected",
    disconnectedColor,
    disconnectedAt: new Date(),
    reconnectDeadlineAt: deadline,
    reconnectGraceMs: graceMs,
  });
}

async function persistFourPlayerSessionDisconnected(gameId, disconnectedColor) {
  const normalizedGameId = String(gameId || "").trim();
  if (!normalizedGameId) return null;
  const game = fourPlayerGames.get(normalizedGameId);
  if (!game) return null;

  const graceMs = getReconnectGraceMsForTimeControl(game.timeControl);
  const deadline = new Date(Date.now() + graceMs);
  game.reconnectGraceMs = graceMs;
  return persistFourPlayerGameSession(normalizedGameId, {
    status: "temporarily_disconnected",
    disconnectedColor,
    disconnectedAt: new Date(),
    reconnectDeadlineAt: deadline,
    reconnectGraceMs: graceMs,
  });
}

async function completeSessionRecord(gameId, values = {}) {
  const normalizedGameId = String(gameId || "").trim();
  if (!normalizedGameId) return null;
  return ActiveGameSession.findOneAndUpdate(
    { gameId: normalizedGameId },
    {
      $set: {
        status:
          values.status ||
          (values.terminalReason === "aborted" ? "aborted" : "completed"),
        terminalReason: values.terminalReason || "",
        winner: values.winner || "",
        completedAt: values.completedAt || new Date(),
        reconnectDeadlineAt: null,
        disconnectedAt: null,
        disconnectedColor: "",
      },
    },
    { new: true },
  ).catch((error) => {
    console.error("Active session completion error:", error);
    return null;
  });
}

function buildActiveSessionResponse(session, userId) {
  if (!session?.gameId) return null;
  const normalizedUserId = normalizeId(userId);

  let opponentName = "";
  if (session.kind === "classic") {
    const whiteUserId = normalizeId(session.white?.userId);
    const blackUserId = normalizeId(session.black?.userId);
    opponentName =
      normalizedUserId && normalizedUserId === whiteUserId
        ? String(session.black?.name || "Opponent")
        : String(session.white?.name || "Opponent");
  }

  return {
    gameId: String(session.gameId),
    kind: session.kind === "fourPlayer" ? "fourPlayer" : "classic",
    mode:
      session.mode === "friend" ||
      session.mode === "tournament" ||
      session.mode === "fourPlayer"
        ? session.mode
        : "quick",
    variant: normalizeVariant(session.variant),
    opponentName,
    timeControl: normalizeTimeControl(session.timeControl),
    reconnectGraceMs: Number(session.reconnectGraceMs || 0),
    reconnectDeadlineAt: session.reconnectDeadlineAt || null,
    status: String(session.status || "active"),
  };
}

async function findPersistedActiveSessionForUser(userId) {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) return null;
  return ActiveGameSession.findOne({
    participantUserIds: normalizedUserId,
    status: { $in: ACTIVE_SESSION_STATUSES },
  })
    .sort({ updatedAt: -1 })
    .lean()
    .catch((error) => {
      console.error("Active session lookup error:", error);
      return null;
    });
}

async function ensurePersistedActiveSessionForUser(userId) {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) return null;

  const classicGameId = String(userActiveGames.get(normalizedUserId) || "").trim();
  if (classicGameId && games.has(classicGameId)) {
    await persistClassicGameSession(classicGameId);
    return ActiveGameSession.findOne({ gameId: classicGameId }).lean();
  }

  const fourPlayerGameId = String(
    userActiveFourPlayerGames.get(normalizedUserId) || "",
  ).trim();
  if (fourPlayerGameId && fourPlayerGames.has(fourPlayerGameId)) {
    await persistFourPlayerGameSession(fourPlayerGameId);
    return ActiveGameSession.findOne({ gameId: fourPlayerGameId }).lean();
  }

  return findPersistedActiveSessionForUser(normalizedUserId);
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
  mode = "quick",
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
  if (
    !isSocketReadyForGame(whiteSocket) ||
    !isSocketReadyForGame(blackSocket)
  ) {
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
  const isTournamentGame = !!(
    (tournamentId && normalizeId(tournamentId)) ||
    (tournamentGameId && normalizeId(tournamentGameId))
  );

  const socketToUser = {
    [whiteSocket.id]: normalizeId(whiteSocket.data.userId),
    [blackSocket.id]: normalizeId(blackSocket.data.userId),
  };

  games.set(safeGameId, {
    id: safeGameId,
    room,
    chess,
    players: { white: whiteSocket.id, black: blackSocket.id },
    playerUsers: {
      white: socketToUser[whiteSocket.id] || "",
      black: socketToUser[blackSocket.id] || "",
    },
    playerNames: {
      white: String(whiteSocket?.data?.name || "Player"),
      black: String(blackSocket?.data?.name || "Player"),
    },
    timeControl: normalizedTimeControl,
    variant: normalizedVariant,
    whiteCheckCount: 0,
    blackCheckCount: 0,
    chess960: initialPosition.chess960,
    mode:
      mode === "friend" || mode === "tournament" ? mode : "quick",
    isRated,
    tournamentId: tournamentId ? normalizeId(tournamentId) : null,
    tournamentGameId: tournamentGameId ? normalizeId(tournamentGameId) : null,
    firstTurnMoves: isTournamentGame ? { w: false, b: false } : null,
    clockState: {
      white: normalizedTimeControl.initial,
      black: normalizedTimeControl.initial,
      activeColor: "w",
      lastTickAt: Date.now(),
    },
    disconnectGraceTimers: { w: null, b: null },
    disconnectedAt: { w: null, b: null },
    reconnectGraceMs: getReconnectGraceMsForTimeControl(normalizedTimeControl),
    startedAt: new Date(),
    persistedMoves: [],
    ratingByColor: {
      white: normalizeLiveRating(whiteRating),
      black: normalizeLiveRating(blackRating),
    },
  });
  const createdGame = games.get(safeGameId);
  scheduleFirstMoveAbortTimer(safeGameId);

  whiteSocket.data.gameId = safeGameId;
  blackSocket.data.gameId = safeGameId;
  setUserActiveGame(normalizeId(whiteSocket.data.userId), safeGameId);
  setUserActiveGame(normalizeId(blackSocket.data.userId), safeGameId);
  syncUserPresenceFromSockets(normalizeId(whiteSocket.data.userId));
  syncUserPresenceFromSockets(normalizeId(blackSocket.data.userId));
  void persistClassicGameSession(safeGameId);
  whiteSocket.join(room);
  blackSocket.join(room);

  io.to(whiteSocket.id).emit(
    "matchFound",
    buildRealtimeStatePayload(createdGame, "w", {
      gameId: safeGameId,
      opponentName: blackSocket.data.name || "Opponent",
      rated: ratedForDisplay,
      playerRating: normalizeLiveRating(whiteRating),
      opponentRating: normalizeLiveRating(blackRating),
    }),
  );

  io.to(blackSocket.id).emit(
    "matchFound",
    buildRealtimeStatePayload(createdGame, "b", {
      gameId: safeGameId,
      opponentName: whiteSocket.data.name || "Opponent",
      rated: ratedForDisplay,
      playerRating: normalizeLiveRating(blackRating),
      opponentRating: normalizeLiveRating(whiteRating),
    }),
  );

  io.to(whiteSocket.id).emit("game_state_restored", {
    gameId: safeGameId,
    color: "w",
    fen: createdGame.chess.fen(),
    moves: getClassicGameMoves(createdGame),
    whiteTimeLeft: createdGame.clockState.white,
    blackTimeLeft: createdGame.clockState.black,
    playerClock: createdGame.clockState.white,
    opponentClock: createdGame.clockState.black,
    clockPaused: !!createdGame?.clockState?.pausedAt,
  });
  io.to(blackSocket.id).emit("game_state_restored", {
    gameId: safeGameId,
    color: "b",
    fen: createdGame.chess.fen(),
    moves: getClassicGameMoves(createdGame),
    whiteTimeLeft: createdGame.clockState.white,
    blackTimeLeft: createdGame.clockState.black,
    playerClock: createdGame.clockState.black,
    opponentClock: createdGame.clockState.white,
    clockPaused: !!createdGame?.clockState?.pausedAt,
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
  if (
    file < 0 ||
    !Number.isFinite(rankNumber) ||
    rankNumber < 1 ||
    rankNumber > 8
  ) {
    return null;
  }
  const rankIndex = 8 - rankNumber;
  return { file, rank: rankIndex };
}

function coordsToSquare(file, rank) {
  if (file < 0 || file >= BOARD_SIZE || rank < 0 || rank >= BOARD_SIZE) {
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
  const [
    placement,
    activeColor = "w",
    castling = "-",
    enPassant = "-",
    halfmove = "0",
    fullmove = "1",
  ] = String(fen || "")
    .trim()
    .split(/\s+/);

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
    return {
      handled: true,
      success: false,
      reason: "Castling is no longer available.",
    };
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
    return {
      handled: true,
      success: false,
      reason: "Invalid castling targets.",
    };
  }

  const rank = kingCoords.rank;
  const kingFile = kingCoords.file;
  const rookFile = rookCoords.file;
  const kingToFile = kingToCoords.file;
  const rookToFile = rookToCoords.file;

  const betweenKingAndRookStart = Math.min(kingFile, rookFile) + 1;
  const betweenKingAndRookEnd = Math.max(kingFile, rookFile) - 1;
  for (
    let file = betweenKingAndRookStart;
    file <= betweenKingAndRookEnd;
    file += 1
  ) {
    const square = coordsToSquare(file, rank);
    if (!square) continue;
    if (square === from || square === to) continue;
    if (getPiece(board, square)) {
      return {
        handled: true,
        success: false,
        reason: "Pieces block castling.",
      };
    }
  }

  const kingStep = kingToFile > kingFile ? 1 : kingToFile < kingFile ? -1 : 0;
  if (kingStep !== 0) {
    for (
      let file = kingFile + kingStep;
      file !== kingToFile + kingStep;
      file += kingStep
    ) {
      const square = coordsToSquare(file, rank);
      if (!square) continue;
      if (square === to) continue;
      if (file !== kingToFile && getPiece(board, square)) {
        return {
          handled: true,
          success: false,
          reason: "King path is blocked.",
        };
      }
      if (file === kingToFile) {
        const occupant = getPiece(board, square);
        if (occupant && square !== to) {
          return {
            handled: true,
            success: false,
            reason: "King destination is blocked.",
          };
        }
      }
    }
  } else {
    const occupant = getPiece(board, kingTo);
    // In Chess960 the king can already be on its castling destination square.
    if (occupant && kingTo !== to && kingTo !== from) {
      return {
        handled: true,
        success: false,
        reason: "King destination is blocked.",
      };
    }
  }

  const rookStep = rookToFile > rookFile ? 1 : rookToFile < rookFile ? -1 : 0;
  if (rookStep !== 0) {
    for (
      let file = rookFile + rookStep;
      file !== rookToFile + rookStep;
      file += rookStep
    ) {
      const square = coordsToSquare(file, rank);
      if (!square) continue;
      if (square === from) continue;
      if (file !== rookToFile && getPiece(board, square)) {
        return {
          handled: true,
          success: false,
          reason: "Rook path is blocked.",
        };
      }
      if (file === rookToFile) {
        const occupant = getPiece(board, square);
        if (occupant && square !== from) {
          return {
            handled: true,
            success: false,
            reason: "Rook destination is blocked.",
          };
        }
      }
    }
  } else {
    const occupant = getPiece(board, rookTo);
    if (occupant && rookTo !== from) {
      return {
        handled: true,
        success: false,
        reason: "Rook destination is blocked.",
      };
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
    for (
      let file = kingFile + kingStep;
      file !== kingToFile;
      file += kingStep
    ) {
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

function clearFourPlayerReconnectGraceTimer(game, color) {
  if (!game || !color) return;
  if (!game.disconnectGraceTimers || typeof game.disconnectGraceTimers !== "object") {
    game.disconnectGraceTimers = {};
  }
  if (!game.disconnectedAt || typeof game.disconnectedAt !== "object") {
    game.disconnectedAt = {};
  }
  const timerId = game.disconnectGraceTimers[color];
  if (timerId) {
    clearTimeout(timerId);
    game.disconnectGraceTimers[color] = null;
  }
  game.disconnectedAt[color] = null;
}

function scheduleFourPlayerReconnectGraceTimer(gameId, disconnectedColor) {
  const game = fourPlayerGames.get(gameId);
  if (!game) return;
  const color = FOUR_PLAYER_COLORS.includes(disconnectedColor)
    ? disconnectedColor
    : null;
  if (!color) return;

  if (!game.disconnectGraceTimers || typeof game.disconnectGraceTimers !== "object") {
    game.disconnectGraceTimers = {};
  }
  if (!game.disconnectedAt || typeof game.disconnectedAt !== "object") {
    game.disconnectedAt = {};
  }

  clearFourPlayerReconnectGraceTimer(game, color);
  game.disconnectedAt[color] = Date.now();
  const graceMs = getReconnectGraceMsForTimeControl(game.timeControl);
  game.reconnectGraceMs = graceMs;
  void persistFourPlayerSessionDisconnected(gameId, color);
  game.disconnectGraceTimers[color] = setTimeout(() => {
    const latestGame = fourPlayerGames.get(gameId);
    if (!latestGame) return;

    const participant = latestGame.playersByColor?.[color];
    if (participant?.socketId) return;
    if (latestGame.state?.eliminated?.includes(color)) return;

    latestGame.state = eliminateFourPlayerColor(latestGame.state, color);
    clearUserActiveFourPlayerGame(normalizeId(participant?.userId), gameId);
    emitFourPlayerState(latestGame, {
      systemMessage: `${color.toUpperCase()} disconnected and forfeited.`,
      forfeitedColor: color,
      forfeitReason: "disconnect_timeout",
    });
    void persistFourPlayerGameSession(gameId, {
      status: latestGame.state?.winner ? "completed" : "active",
      terminalReason: latestGame.state?.winner ? "disconnect_timeout" : "",
      winner: String(latestGame.state?.winner || ""),
      completedAt: latestGame.state?.winner ? new Date() : null,
    });
    maybeFinishFourPlayerGame(latestGame, "disconnect_timeout");
  }, graceMs);
}

function getFourPlayerColorByUserId(game, userId) {
  const normalizedUserId = normalizeId(userId);
  if (!game || !normalizedUserId) return null;
  for (const color of FOUR_PLAYER_COLORS) {
    const participantUserId = normalizeId(game.playersByColor?.[color]?.userId);
    if (participantUserId && participantUserId === normalizedUserId) {
      return color;
    }
  }
  return null;
}

function handleFourPlayerSocketDisconnect(socket) {
  const gameId = String(socket?.data?.fourPlayerGameId || "").trim();
  if (!gameId) return;

  const game = fourPlayerGames.get(gameId);
  socket.data.fourPlayerGameId = null;
  socket.data.inFourPlayerQueue = false;
  socket.data.fourPlayerQueueKey = null;
  const userId = normalizeId(socket?.data?.userId);
  syncUserPresenceFromSockets(userId);

  if (!game) {
    clearUserActiveFourPlayerGame(userId, gameId);
    return;
  }

  const disconnectedColor = game.socketToColor[socket.id];
  if (!disconnectedColor) return;

  delete game.socketToColor[socket.id];
  if (game.playersByColor?.[disconnectedColor]) {
    game.playersByColor[disconnectedColor].socketId = null;
  }
  socket.leave(game.room);

  emitFourPlayerState(game, {
    systemMessage: `${disconnectedColor.toUpperCase()} disconnected. Waiting for reconnect...`,
  });
  io.to(game.room).emit("fourPlayerParticipantDisconnected", {
    gameId,
    color: disconnectedColor,
    graceMs: getReconnectGraceMsForTimeControl(game.timeControl),
  });
  scheduleFourPlayerReconnectGraceTimer(gameId, disconnectedColor);
}

function clearFourPlayerGameForPlayers(game) {
  FOUR_PLAYER_COLORS.forEach((color) => {
    const player = game.playersByColor[color];
    const playerUserId = normalizeId(player?.userId);
    clearUserActiveFourPlayerGame(playerUserId, game?.id || null);
    clearFourPlayerReconnectGraceTimer(game, color);
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
  void persistFourPlayerGameSession(game.id);
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
  void persistFourPlayerGameSession(game.id, {
    status: "completed",
    terminalReason: reason,
    winner: String(game.state.winner || ""),
    completedAt: new Date(),
  });
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
  clearUserActiveFourPlayerGame(userId, gameId);
  syncUserPresenceFromSockets(userId);
  if (!game) return;

  const color = game.socketToColor[socket.id];
  if (!color) return;

  clearFourPlayerReconnectGraceTimer(game, color);
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
  clearReconnectGraceTimers(game);

  const whiteSocket = io.sockets.sockets.get(game.players.white);
  const blackSocket = io.sockets.sockets.get(game.players.black);
  const whiteUserId = normalizeId(game?.playerUsers?.white);
  const blackUserId = normalizeId(game?.playerUsers?.black);
  const gameId = String(game?.id || "");
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
  clearUserActiveGame(whiteUserId, gameId);
  clearUserActiveGame(blackUserId, gameId);
  syncUserPresenceFromSockets(whiteUserId);
  syncUserPresenceFromSockets(blackUserId);
}

function gamePlies(game) {
  return getClassicGameMoves(game).length;
}

function clearFirstMoveAbortTimer(game) {
  if (!game?.firstMoveAbortTimer) return;
  clearTimeout(game.firstMoveAbortTimer);
  game.firstMoveAbortTimer = null;
}

function ensureGameClockState(game) {
  const initial = Math.max(0, Number(game?.timeControl?.initial || 0));
  if (!game.clockState || typeof game.clockState !== "object") {
    game.clockState = {
      white: initial,
      black: initial,
      activeColor: "w",
      lastTickAt: Date.now(),
      pausedAt: null,
      pausedForDisconnect: null,
    };
  }
  if (!Number.isFinite(Number(game.clockState.white))) {
    game.clockState.white = initial;
  }
  if (!Number.isFinite(Number(game.clockState.black))) {
    game.clockState.black = initial;
  }
  if (
    game.clockState.activeColor !== "w" &&
    game.clockState.activeColor !== "b"
  ) {
    game.clockState.activeColor = "w";
  }
  if (!Number.isFinite(Number(game.clockState.lastTickAt))) {
    game.clockState.lastTickAt = Date.now();
  }
  if (
    game.clockState.pausedAt !== null &&
    !Number.isFinite(Number(game.clockState.pausedAt))
  ) {
    game.clockState.pausedAt = null;
  }
  if (
    game.clockState.pausedForDisconnect !== null &&
    game.clockState.pausedForDisconnect !== "w" &&
    game.clockState.pausedForDisconnect !== "b"
  ) {
    game.clockState.pausedForDisconnect = null;
  }
  return game.clockState;
}

function getClockSnapshot(game, now = Date.now()) {
  const state = ensureGameClockState(game);
  let white = Math.max(0, Number(state.white || 0));
  let black = Math.max(0, Number(state.black || 0));
  const activeColor = state.activeColor === "b" ? "b" : "w";
  const lastTickAt = Number(state.lastTickAt || now);
  const pausedAt = Number.isFinite(Number(state.pausedAt))
    ? Number(state.pausedAt)
    : null;
  const effectiveNow = pausedAt !== null ? pausedAt : now;
  const elapsedSeconds = Math.max(0, (effectiveNow - lastTickAt) / 1000);
  if (activeColor === "w") {
    white = Math.max(0, white - elapsedSeconds);
  } else {
    black = Math.max(0, black - elapsedSeconds);
  }
  return {
    white: Math.round(white * 100) / 100,
    black: Math.round(black * 100) / 100,
    activeColor,
    asOf: now,
  };
}

function commitClockSnapshot(game, snapshot, nextActiveColor) {
  game.clockState = {
    white: Math.max(0, Number(snapshot.white || 0)),
    black: Math.max(0, Number(snapshot.black || 0)),
    activeColor: nextActiveColor === "b" ? "b" : "w",
    lastTickAt: Date.now(),
    pausedAt: null,
    pausedForDisconnect: null,
  };
}

function pauseGameClockForDisconnect(game, disconnectedColor) {
  if (!game) return getClockSnapshot(game);
  const snapshot = getClockSnapshot(game);
  game.clockState = {
    white: snapshot.white,
    black: snapshot.black,
    activeColor: snapshot.activeColor,
    lastTickAt: snapshot.asOf,
    pausedAt: snapshot.asOf,
    pausedForDisconnect: disconnectedColor === "b" ? "b" : "w",
  };
  return snapshot;
}

function resumeGameClockAfterReconnect(game) {
  if (!game) return getClockSnapshot(game);
  const snapshot = getClockSnapshot(game);
  game.clockState = {
    white: snapshot.white,
    black: snapshot.black,
    activeColor: snapshot.activeColor,
    lastTickAt: Date.now(),
    pausedAt: null,
    pausedForDisconnect: null,
  };
  return getClockSnapshot(game);
}

function applyMoveClockTransition(
  game,
  moverColor,
  nextTurnColor,
  clockBeforeMove = null,
) {
  const before = clockBeforeMove || getClockSnapshot(game);
  let white = Math.max(0, Number(before.white || 0));
  let black = Math.max(0, Number(before.black || 0));
  const increment = Math.max(0, Number(game?.timeControl?.increment || 0));
  if (moverColor === "w") {
    white += increment;
  } else {
    black += increment;
  }
  const committed = {
    white: Math.round(white * 100) / 100,
    black: Math.round(black * 100) / 100,
  };
  commitClockSnapshot(game, committed, nextTurnColor);
  return getClockSnapshot(game);
}

function buildRealtimeStatePayload(game, color, options = {}) {
  const normalizedColor = color === "b" ? "b" : "w";
  const ownKey = normalizedColor === "w" ? "white" : "black";
  const opponentKey = normalizedColor === "w" ? "black" : "white";
  const clock = getClockSnapshot(game);
  const ownClock = normalizedColor === "w" ? clock.white : clock.black;
  const opponentClock = normalizedColor === "w" ? clock.black : clock.white;
  const opponentSocket = io.sockets.sockets.get(game.players[opponentKey]);
  const opponentUserId =
    normalizedColor === "w"
      ? normalizeId(game?.playerUsers?.black)
      : normalizeId(game?.playerUsers?.white);
  const fallbackOpponentName =
    normalizedColor === "w"
      ? game?.playerNames?.black
      : game?.playerNames?.white;
  return {
    gameId: options.gameId || game.id,
    color: normalizedColor,
    fen: game.chess.fen(),
    opponentName:
      options.opponentName ||
      opponentSocket?.data?.name ||
      fallbackOpponentName ||
      "Opponent",
    opponentUserId: opponentUserId || null,
    rated: options.rated ?? false,
    playerRating: options.playerRating ?? null,
    opponentRating: options.opponentRating ?? null,
    timeControl: game.timeControl,
    variant: game.variant,
    whiteCheckCount: Number(game.whiteCheckCount || 0),
    blackCheckCount: Number(game.blackCheckCount || 0),
    restored: options.restored === true,
    moves: getClassicGameMoves(game),
    whiteTimeLeft: clock.white,
    blackTimeLeft: clock.black,
    playerClock: ownClock,
    opponentClock: opponentClock,
    clockPaused: !!game?.clockState?.pausedAt,
  };
}

function clearReconnectGraceTimer(game, color) {
  if (!game?.disconnectGraceTimers) return;
  const key = color === "b" ? "b" : "w";
  const timerId = game.disconnectGraceTimers[key];
  if (timerId) {
    clearTimeout(timerId);
    game.disconnectGraceTimers[key] = null;
  }
  if (
    game.disconnectedAt &&
    Object.prototype.hasOwnProperty.call(game.disconnectedAt, key)
  ) {
    game.disconnectedAt[key] = null;
  }
}

function clearReconnectGraceTimers(game) {
  clearReconnectGraceTimer(game, "w");
  clearReconnectGraceTimer(game, "b");
}

function scheduleReconnectGraceTimer(gameId, disconnectedColor) {
  const game = games.get(gameId);
  if (!game) return;
  const color = disconnectedColor === "b" ? "b" : "w";
  if (
    !game.disconnectGraceTimers ||
    typeof game.disconnectGraceTimers !== "object"
  ) {
    game.disconnectGraceTimers = { w: null, b: null };
  }
  if (!game.disconnectedAt || typeof game.disconnectedAt !== "object") {
    game.disconnectedAt = { w: null, b: null };
  }
  clearReconnectGraceTimer(game, color);
  game.disconnectedAt[color] = Date.now();
  const graceMs = getReconnectGraceMsForTimeControl(game.timeControl);
  game.reconnectGraceMs = graceMs;
  pauseGameClockForDisconnect(game, color);
  void persistSessionDisconnected(gameId, color);
  game.disconnectGraceTimers[color] = setTimeout(() => {
    const latestGame = games.get(gameId);
    if (!latestGame) return;
    const sideKey = color === "w" ? "white" : "black";
    if (latestGame.players?.[sideKey]) return;

    const winnerColor = color === "w" ? "b" : "w";
    const bothDisconnected =
      !latestGame.players?.white && !latestGame.players?.black;
    if (bothDisconnected && gamePlies(latestGame) < MIN_REAL_GAME_PLIES) {
      emitGameOver(gameId, "aborted", null, { preserveEarlyResult: true });
      return;
    }

    const winnerSideKey = winnerColor === "w" ? "white" : "black";
    const winnerSocketId = latestGame.players?.[winnerSideKey] || null;
    if (winnerSocketId) {
      io.to(winnerSocketId).emit("opponent_abandoned", {
        gameId,
        winner: winnerColor,
        reason: "disconnect_timeout",
      });
    }
    emitGameOver(gameId, "opponent_left", winnerColor, {
      preserveEarlyResult: true,
    });
  }, graceMs);
}

function isTournamentRealtimeGame(game) {
  return !!(game?.tournamentId || game?.tournamentGameId);
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

async function hydrateClassicGameFromSession(gameId) {
  const normalizedGameId = String(gameId || "").trim();
  if (!normalizedGameId) return null;
  if (games.has(normalizedGameId)) {
    return games.get(normalizedGameId);
  }

  const session = await ActiveGameSession.findOne({
    gameId: normalizedGameId,
    kind: "classic",
    status: { $in: ACTIVE_SESSION_STATUSES },
  }).lean();
  if (!session) return null;

  let chess;
  try {
    const persistedFen = String(session.fen || "").trim();
    chess =
      persistedFen && persistedFen !== "start"
        ? new Chess(persistedFen)
        : new Chess();
  } catch {
    chess = new Chess();
  }

  const hydratedGame = {
    id: normalizedGameId,
    room: `game:${normalizedGameId}`,
    chess,
    players: {
      white: session.white?.connected ? String(session.white?.socketId || "") : null,
      black: session.black?.connected ? String(session.black?.socketId || "") : null,
    },
    playerUsers: {
      white: normalizeId(session.white?.userId),
      black: normalizeId(session.black?.userId),
    },
    playerNames: {
      white: String(session.white?.name || "Player"),
      black: String(session.black?.name || "Player"),
    },
    timeControl: normalizeTimeControl(session.timeControl),
    variant: normalizeVariant(session.variant),
    whiteCheckCount: Number(session.whiteCheckCount || 0),
    blackCheckCount: Number(session.blackCheckCount || 0),
    chess960: session.chess960 || undefined,
    mode:
      session.mode === "friend" || session.mode === "tournament"
        ? session.mode
        : "quick",
    isRated: session.rated === true,
    tournamentId: null,
    tournamentGameId: null,
    firstTurnMoves: null,
    clockState: {
      white: Number(session.clockState?.white || session.timeControl?.initial || 300),
      black: Number(session.clockState?.black || session.timeControl?.initial || 300),
      activeColor: session.clockState?.activeColor === "b" ? "b" : "w",
      lastTickAt: Date.now(),
      pausedAt: session.clockState?.pausedAt || null,
      pausedForDisconnect: session.clockState?.pausedForDisconnect || null,
    },
    disconnectGraceTimers: { w: null, b: null },
    disconnectedAt: {
      w: session.white?.disconnectedAt ? new Date(session.white.disconnectedAt).getTime() : null,
      b: session.black?.disconnectedAt ? new Date(session.black.disconnectedAt).getTime() : null,
    },
    reconnectGraceMs: Number(session.reconnectGraceMs || 0),
    startedAt: session.startedAt ? new Date(session.startedAt) : new Date(),
    persistedMoves: Array.isArray(session.moves) ? session.moves : [],
    ratingByColor: session.ratingByColor || {
      white: null,
      black: null,
    },
  };

  games.set(normalizedGameId, hydratedGame);
  setUserActiveGame(hydratedGame.playerUsers.white, normalizedGameId);
  setUserActiveGame(hydratedGame.playerUsers.black, normalizedGameId);
  return hydratedGame;
}

async function hydrateFourPlayerGameFromSession(gameId) {
  const normalizedGameId = String(gameId || "").trim();
  if (!normalizedGameId) return null;
  if (fourPlayerGames.has(normalizedGameId)) {
    return fourPlayerGames.get(normalizedGameId);
  }

  const session = await ActiveGameSession.findOne({
    gameId: normalizedGameId,
    kind: "fourPlayer",
    status: { $in: ACTIVE_SESSION_STATUSES },
  }).lean();
  if (!session) return null;

  const playersByColor = {};
  const socketToColor = {};
  FOUR_PLAYER_COLORS.forEach((color) => {
    const player = session.playersByColor?.[color] || {};
    const socketId = player.connected ? String(player.socketId || "") : null;
    playersByColor[color] = {
      socketId,
      userId: normalizeId(player.userId),
      name: String(player.name || color.toUpperCase()),
    };
    if (socketId) {
      socketToColor[socketId] = color;
    }
  });

  const hydratedGame = {
    id: normalizedGameId,
    room: `four-player:${normalizedGameId}`,
    state: session.state || createInitialFourPlayerState(),
    playersByColor,
    socketToColor,
    timeControl: normalizeTimeControl(session.timeControl),
    reconnectGraceMs: Number(session.reconnectGraceMs || 0),
    startedAt: session.startedAt ? new Date(session.startedAt) : new Date(),
    disconnectGraceTimers: {},
    disconnectedAt: {},
  };

  FOUR_PLAYER_COLORS.forEach((color) => {
    hydratedGame.disconnectedAt[color] = playersByColor[color]?.connected
      ? null
      : session.playersByColor?.[color]?.disconnectedAt
        ? new Date(session.playersByColor[color].disconnectedAt).getTime()
        : null;
    setUserActiveFourPlayerGame(playersByColor[color]?.userId, normalizedGameId);
  });

  fourPlayerGames.set(normalizedGameId, hydratedGame);
  return hydratedGame;
}

function scheduleFirstMoveAbortTimer(gameId) {
  const game = games.get(gameId);
  if (!game) return;
  clearFirstMoveAbortTimer(game);
  const isTournamentGame = isTournamentRealtimeGame(game);
  const thresholdMs = isTournamentGame
    ? ABORT_TIMEOUT_MS_DEFAULT
    : getAbortThresholdMs(game.timeControl);
  game.startedAt = Date.now();
  game.firstMoveAbortTimer = setTimeout(() => {
    const latestGame = games.get(gameId);
    if (!latestGame) return;

    if (isTournamentRealtimeGame(latestGame)) {
      const firstTurnMoves =
        latestGame.firstTurnMoves &&
        typeof latestGame.firstTurnMoves === "object"
          ? latestGame.firstTurnMoves
          : { w: false, b: false };
      latestGame.firstTurnMoves = firstTurnMoves;

      const turnColor = latestGame.chess?.turn?.() === "b" ? "b" : "w";
      if (firstTurnMoves[turnColor] === true) return;

      const winner = turnColor === "w" ? "b" : "w";
      emitGameSystemMessage(
        gameId,
        `Tournament forfeit: ${turnColor === "w" ? "White" : "Black"} did not move within 60 seconds.`,
        turnColor,
      );
      emitGameOver(gameId, "timeout", winner, { preserveEarlyResult: true });
      return;
    }

    if (gamePlies(latestGame) > 0) return;

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

async function applyGameRatingUpdates(
  gameId,
  game,
  reason,
  winner,
  options = {},
) {
  const allowEarlyRatedResult = options?.allowEarlyRatedResult === true;
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
  if (!allowEarlyRatedResult && !shouldApplyRatedResult(reason, plies)) {
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

async function emitGameOver(gameId, reason, winner, options = {}) {
  const game = games.get(gameId);
  if (!game) return;
  if (game.isEnding) return;
  game.isEnding = true;
  clearFirstMoveAbortTimer(game);

  const plies = gamePlies(game);
  const preserveEarlyResult = options?.preserveEarlyResult === true;
  const resolvedReason = preserveEarlyResult
    ? reason
    : resolveTerminalReason(reason, plies);
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
      { allowEarlyRatedResult: preserveEarlyResult },
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
      const syncResult = await syncTournamentGameResultByGameId(
        gameId,
        tournamentResult,
      );
      const tournamentId = normalizeId(
        syncResult?.tournamentId || game.tournamentId,
      );
      if (tournamentId) {
        io.to(`tournament:${tournamentId}`).emit("result:updated", {
          tournamentId,
          gameId,
          result: tournamentResult,
          eloChanges: syncResult?.eloChanges || null,
        });
        io.to(`tournament:${tournamentId}`).emit("standings:updated", {
          tournamentId,
        });

        const closedRounds = syncResult?.progression?.roundsClosed || [];
        for (const closedRound of closedRounds) {
          io.to(`tournament:${tournamentId}`).emit("round:closed", {
            tournamentId,
            roundNumber: Number(closedRound || 0),
          });
        }

        const startedRounds = syncResult?.progression?.roundsStarted || [];
        for (const roundMeta of startedRounds) {
          const roundNumber = Number(roundMeta?.roundNumber || 0);
          const pairings = Array.isArray(roundMeta?.pairings)
            ? roundMeta.pairings
            : [];
          io.to(`tournament:${tournamentId}`).emit("tournament:stateChanged", {
            tournamentId,
            newState: TOURNAMENT_STATES.LIVE_ROUND,
          });
          io.to(`tournament:${tournamentId}`).emit("pairings:published", {
            tournamentId,
            round: roundNumber,
            pairings,
          });
          emitTournamentBoardAssignments(tournamentId, roundNumber, pairings);
        }

        if (syncResult?.progression?.finished) {
          io.to(`tournament:${tournamentId}`).emit("tournament:stateChanged", {
            tournamentId,
            newState: TOURNAMENT_STATES.FINISHED,
          });
          io.to(`tournament:${tournamentId}`).emit("tournament:finished", {
            tournamentId,
            top3: syncResult?.progression?.top3 || [],
          });
        }
      }
    } catch (error) {
      console.error("Tournament result sync error:", error);
    }
  }

  await persistClassicGameSession(gameId, {
    status: resolvedReason === "aborted" ? "aborted" : "completed",
    terminalReason: resolvedReason,
    winner: resolvedWinner || "",
    completedAt: new Date(),
    reconnectDeadlineAt: null,
    disconnectedAt: null,
    disconnectedColor: "",
  });
  await completeSessionRecord(gameId, {
    status: resolvedReason === "aborted" ? "aborted" : "completed",
    terminalReason: resolvedReason,
    winner: resolvedWinner || "",
    completedAt: new Date(),
  });

  io.to(game.room).emit("gameOver", {
    gameId,
    reason: resolvedReason,
    winner: resolvedWinner,
    ...getThreeCheckPayload(game),
    elo,
  });
  clearGameForPlayers(game);
  games.delete(gameId);
}

function isCheck(chess) {
  return typeof chess.inCheck === "function"
    ? chess.inCheck()
    : chess.in_check();
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

const KING_OF_HILL_CENTER_SQUARES = new Set(["d4", "e4", "d5", "e5"]);

function findKingSquare(chess, color) {
  if (!chess || typeof chess.board !== "function") return null;
  const board = chess.board();
  if (!Array.isArray(board)) return null;

  for (let rankIndex = 0; rankIndex < board.length; rankIndex += 1) {
    const rank = board[rankIndex];
    if (!Array.isArray(rank)) continue;
    for (let fileIndex = 0; fileIndex < rank.length; fileIndex += 1) {
      const piece = rank[fileIndex];
      if (!piece || piece.type !== "k" || piece.color !== color) continue;
      return `${FILES[fileIndex]}${8 - rankIndex}`;
    }
  }
  return null;
}

function applyKingOfHillAfterMove(game, moverColor) {
  if (!game || game.variant !== "kingOfHill") {
    return { isKingOfHillWin: false };
  }

  const kingSquare = findKingSquare(game.chess, moverColor);
  return {
    isKingOfHillWin: KING_OF_HILL_CENTER_SQUARES.has(kingSquare || ""),
  };
}

function isAtomicKingCaptureAttempt(chess, from, to, moverColor) {
  if (!chess || typeof chess.get !== "function") return false;
  const movingPiece = chess.get(from);
  if (!movingPiece || movingPiece.color !== moverColor || movingPiece.type !== "k") {
    return false;
  }
  const targetPiece = chess.get(to);
  return !!targetPiece && targetPiece.color !== moverColor;
}

function resolveAtomicCapturedSquare(move) {
  if (!move || !move.captured) return null;
  const from = typeof move.from === "string" ? move.from : "";
  const to = typeof move.to === "string" ? move.to : "";
  if (!to) return null;
  if (typeof move.flags === "string" && move.flags.includes("e") && from.length === 2) {
    return `${to[0]}${from[1]}`;
  }
  return to;
}

function getAtomicExplosionSquares(centerSquare) {
  const centerCoords = squareToCoords(centerSquare);
  if (!centerCoords) return [];
  const squares = [];

  for (let rank = centerCoords.rank - 1; rank <= centerCoords.rank + 1; rank += 1) {
    for (let file = centerCoords.file - 1; file <= centerCoords.file + 1; file += 1) {
      const square = coordsToSquare(file, rank);
      if (square) {
        squares.push(square);
      }
    }
  }

  return squares;
}

function applyAtomicExplosion(chess, move) {
  const defaultResult = {
    explodedSquares: [],
    whiteKingMissing: false,
    blackKingMissing: false,
  };
  if (!chess || !move?.captured) return defaultResult;

  const capturedSquare = resolveAtomicCapturedSquare(move);
  if (!capturedSquare) return defaultResult;

  const exploded = new Set();
  const toSquare = typeof move.to === "string" ? move.to : null;
  if (toSquare) exploded.add(toSquare);
  exploded.add(capturedSquare);

  for (const square of getAtomicExplosionSquares(capturedSquare)) {
    if (square === capturedSquare) {
      exploded.add(square);
      continue;
    }
    const piece = chess.get(square);
    if (!piece || piece.type === "p") continue;
    exploded.add(square);
  }

  const explodedSquares = [];

  for (const square of exploded) {
    const piece = chess.get(square);
    if (!piece) continue;
    explodedSquares.push(square);
  }

  for (const square of exploded) {
    chess.remove(square);
  }

  return {
    explodedSquares,
    whiteKingMissing: !findKingSquare(chess, "w"),
    blackKingMissing: !findKingSquare(chess, "b"),
  };
}

function getAtomicExplosionWinner(chess, moverColor) {
  const whiteKingMissing = !findKingSquare(chess, "w");
  const blackKingMissing = !findKingSquare(chess, "b");

  if (whiteKingMissing && blackKingMissing) {
    return moverColor === "w" ? "b" : "w";
  }
  if (whiteKingMissing) return "b";
  if (blackKingMissing) return "w";
  return null;
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

  socket.on("tournament:join", (payload = {}) => {
    const tournamentId = normalizeId(payload?.tournamentId);
    if (!tournamentId) return;
    socket.join(`tournament:${tournamentId}`);
  });

  socket.on("tournament:leave", (payload = {}) => {
    const tournamentId = normalizeId(payload?.tournamentId);
    if (!tournamentId) return;
    socket.leave(`tournament:${tournamentId}`);
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
      const activeFourPlayerGameId = userActiveFourPlayerGames.get(userId);
      if (activeFourPlayerGameId && fourPlayerGames.has(activeFourPlayerGameId)) {
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
      if (
        !tournament ||
        normalizeTournamentState(tournament.status) !==
          TOURNAMENT_STATES.LIVE_ROUND
      ) {
        safeAck(ack, { success: false, error: "Tournament is not running." });
        return;
      }

      const userColor = userId === whiteUserId ? "w" : "b";
      const ownColorKey = userColor === "w" ? "white" : "black";
      const opponentColorKey = userColor === "w" ? "black" : "white";
      const userExistingGameId = userActiveGames.get(userId);
      if (
        userExistingGameId &&
        userExistingGameId !== gameId &&
        games.has(userExistingGameId)
      ) {
        safeAck(ack, {
          success: false,
          error: "You already have another active game. Rejoin it first.",
        });
        return;
      }

      const activeGame = games.get(gameId) || (await hydrateClassicGameFromSession(gameId));
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
        if (!activeGame.playerNames || typeof activeGame.playerNames !== "object") {
          activeGame.playerNames = { white: "Player", black: "Player" };
        }
        activeGame.playerNames[ownColorKey] = String(socket.data.name || "Player");
        clearReconnectGraceTimer(activeGame, userColor);
        resumeGameClockAfterReconnect(activeGame);
        socket.data.gameId = gameId;
        setUserActiveGame(userId, gameId);
        socket.join(activeGame.room);
        syncUserPresenceFromSockets(userId);
        void persistClassicGameSession(gameId, {
          status: "active",
          disconnectedColor: "",
          disconnectedAt: null,
          reconnectDeadlineAt: null,
        });

        const opponentSocket = io.sockets.sockets.get(
          activeGame.players[opponentColorKey],
        );
        const opponentName = opponentSocket?.data?.name || "Opponent";
        const ratedForDisplay = activeGame.isRated === true;
        const playerRating =
          userColor === "w"
            ? normalizeLiveRating(activeGame.ratingByColor?.white)
            : normalizeLiveRating(activeGame.ratingByColor?.black);
        const opponentRating =
          userColor === "w"
            ? normalizeLiveRating(activeGame.ratingByColor?.black)
            : normalizeLiveRating(activeGame.ratingByColor?.white);

        io.to(socket.id).emit(
          "matchFound",
          buildRealtimeStatePayload(activeGame, userColor, {
            gameId,
            opponentName,
            rated: ratedForDisplay,
            playerRating,
            opponentRating,
            restored: true,
          }),
        );
        const clockSnapshot = getClockSnapshot(activeGame);
        io.to(socket.id).emit("game_state_restored", {
          gameId,
          color: userColor,
          fen: activeGame.chess.fen(),
          moves: getClassicGameMoves(activeGame),
          ...clockSnapshot,
          playerClock:
            userColor === "w" ? clockSnapshot.white : clockSnapshot.black,
          opponentClock:
            userColor === "w" ? clockSnapshot.black : clockSnapshot.white,
          clockPaused: !!activeGame?.clockState?.pausedAt,
        });
        io.to(activeGame.room).emit("opponent_reconnected", {
          gameId,
          color: userColor,
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
        userId === whiteUserId
          ? socket
          : getQuickGameSocketForUser(whiteUserId);
      const blackSocket =
        userId === blackUserId
          ? socket
          : getQuickGameSocketForUser(blackUserId);
      const whiteActiveGameId = userActiveGames.get(whiteUserId);
      const blackActiveGameId = userActiveGames.get(blackUserId);
      if (
        (whiteActiveGameId &&
          whiteActiveGameId !== gameId &&
          games.has(whiteActiveGameId)) ||
        (blackActiveGameId &&
          blackActiveGameId !== gameId &&
          games.has(blackActiveGameId))
      ) {
        safeAck(ack, {
          success: false,
          error: "A player is already in another active game. Rejoining...",
        });
        return;
      }
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
            User.findById(whiteUserId).select(`${ratingField} rating`).lean(),
            User.findById(blackUserId).select(`${ratingField} rating`).lean(),
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
          mode: "tournament",
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

  socket.on("rejoinGame", async (payload = {}, ack) => {
    try {
      const userId = normalizeId(socket.data.userId);
      if (!userId) {
        safeAck(ack, { success: false, error: "Not authenticated." });
        return;
      }
      const requestedGameId = String(payload?.gameId || "").trim();
      const activeGameId = userActiveGames.get(userId);
      const gameId = requestedGameId || activeGameId || "";
      if (!gameId) {
        safeAck(ack, { success: false, error: "No active game found." });
        return;
      }
      const game = games.get(gameId) || (await hydrateClassicGameFromSession(gameId));
      if (!game) {
        clearUserActiveGame(userId, gameId);
        safeAck(ack, { success: false, error: "Active game not found." });
        return;
      }

      const userColor =
        normalizeId(game?.playerUsers?.white) === userId
          ? "w"
          : normalizeId(game?.playerUsers?.black) === userId
            ? "b"
            : null;
      if (!userColor) {
        safeAck(ack, {
          success: false,
          error: "You are not a participant in this game.",
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

      const ownSideKey = userColor === "w" ? "white" : "black";
      const opponentSideKey = userColor === "w" ? "black" : "white";
      const previousSocketId = game.players[ownSideKey];
      if (previousSocketId && previousSocketId !== socket.id) {
        const previousSocket = io.sockets.sockets.get(previousSocketId);
        if (previousSocket) {
          previousSocket.data.gameId = null;
        }
      }

      game.players[ownSideKey] = socket.id;
      game.playerUsers[ownSideKey] = userId;
      if (!game.playerNames || typeof game.playerNames !== "object") {
        game.playerNames = { white: "Player", black: "Player" };
      }
      game.playerNames[ownSideKey] = String(socket.data.name || "Player");
      clearReconnectGraceTimer(game, userColor);
      resumeGameClockAfterReconnect(game);
      socket.data.gameId = gameId;
      socket.join(game.room);
      setUserActiveGame(userId, gameId);
      syncUserPresenceFromSockets(userId);
      void persistClassicGameSession(gameId, {
        status: "active",
        disconnectedColor: "",
        disconnectedAt: null,
        reconnectDeadlineAt: null,
      });

      const opponentSocket = io.sockets.sockets.get(
        game.players[opponentSideKey],
      );
      const opponentName = opponentSocket?.data?.name || "Opponent";
      const ratedForDisplay = game.isRated === true;
      const playerRating =
        userColor === "w"
          ? normalizeLiveRating(game.ratingByColor?.white)
          : normalizeLiveRating(game.ratingByColor?.black);
      const opponentRating =
        userColor === "w"
          ? normalizeLiveRating(game.ratingByColor?.black)
          : normalizeLiveRating(game.ratingByColor?.white);

      io.to(socket.id).emit(
        "matchFound",
        buildRealtimeStatePayload(game, userColor, {
          gameId,
          opponentName,
          rated: ratedForDisplay,
          playerRating,
          opponentRating,
          restored: true,
        }),
      );
      const clockSnapshot = getClockSnapshot(game);
      io.to(socket.id).emit("game_state_restored", {
        gameId,
        color: userColor,
        fen: game.chess.fen(),
        moves: getClassicGameMoves(game),
        ...clockSnapshot,
        playerClock:
          userColor === "w" ? clockSnapshot.white : clockSnapshot.black,
        opponentClock:
          userColor === "w" ? clockSnapshot.black : clockSnapshot.white,
        clockPaused: !!game?.clockState?.pausedAt,
      });
      io.to(game.room).emit("opponent_reconnected", {
        gameId,
        color: userColor,
      });

      safeAck(ack, {
        success: true,
        status: "started",
        gameId,
        rejoined: true,
      });
    } catch (error) {
      console.error("rejoinGame error:", error);
      safeAck(ack, { success: false, error: "Failed to rejoin active game." });
    }
  });

  socket.on("findMatch", async ({ name, timeControl, variant } = {}) => {
    if (socket.data.gameId || socket.data.fourPlayerGameId) return;
    const currentUserId = normalizeId(socket.data.userId);
    const persistedSession = await ensurePersistedActiveSessionForUser(
      currentUserId,
    );
    if (
      persistedSession &&
      ACTIVE_SESSION_STATUSES.includes(String(persistedSession.status || ""))
    ) {
      socket.emit("moveRejected", {
        reason: "You already have an active game. Rejoin it first.",
      });
      return;
    }
    const activeGameId = userActiveGames.get(currentUserId);
    if (activeGameId) {
      if (games.has(activeGameId)) {
        socket.emit("moveRejected", {
          reason: "You already have an active game. Rejoin it first.",
        });
        return;
      }
      clearUserActiveGame(currentUserId, activeGameId);
    }
    const activeFourPlayerGameId = userActiveFourPlayerGames.get(currentUserId);
    if (activeFourPlayerGameId && fourPlayerGames.has(activeFourPlayerGameId)) {
      socket.emit("moveRejected", {
        reason: "You already have an active 4-player game. Rejoin it first.",
      });
      return;
    }
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
    const isRandomQueue = !pool;
    const ratingField = pool ? ratingFieldForPool(pool) : null;

    let seekerRating = 1200;
    const seekerUserId = normalizeId(socket.data.userId);
    if (seekerUserId && !isRandomQueue) {
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
    const seekerRange = isRandomQueue ? null : getExpandedMatchRange(0);

    let selectedIndex = -1;
    let selectedOpponentRating = null;
    if (isRandomQueue) {
      for (let i = 0; i < queue.length; i += 1) {
        const candidateEntry = queue[i];
        if (!candidateEntry || candidateEntry.socketId === socket.id) continue;
        const candidateSocket = io.sockets.sockets.get(candidateEntry.socketId);
        if (!candidateSocket) continue;
        selectedIndex = i;
        break;
      }
    } else {
      let bestRatingDiff = Infinity;
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
            selectedIndex = i;
          }
        }
      }
    }

    if (selectedIndex !== -1) {
      const [selected] = queue.splice(selectedIndex, 1);
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
      const whiteSocket = Math.random() < 0.5 ? socket : opponentSocket;
      const blackSocket = whiteSocket.id === socket.id ? opponentSocket : socket;
      createRealtimeGameRoom({
        gameId,
        whiteSocket,
        blackSocket,
        timeControl: normalizedTimeControl,
        variant: normalizedVariant,
        mode: "quick",
        isRated: !!pool,
        whiteRating:
          whiteSocket.id === socket.id
            ? seekerRating
            : selectedOpponentRating ?? opponentSocket?.data?.queueRating,
        blackRating:
          blackSocket.id === socket.id
            ? seekerRating
            : selectedOpponentRating ?? opponentSocket?.data?.queueRating,
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

  socket.on("findFourPlayerMatch", async ({ name, timeControl } = {}) => {
    if (socket.data.gameId || socket.data.fourPlayerGameId) return;
    if (socket.data.inFourPlayerQueue) return;
    const userId = normalizeId(socket.data.userId);
    const persistedSession = await ensurePersistedActiveSessionForUser(userId);
    if (
      persistedSession &&
      ACTIVE_SESSION_STATUSES.includes(String(persistedSession.status || ""))
    ) {
      socket.emit("fourPlayerMoveRejected", {
        reason: "You already have an active game. Rejoin it first.",
      });
      return;
    }
    const existingClassicGameId = userActiveGames.get(userId);
    if (existingClassicGameId) {
      if (games.has(existingClassicGameId)) {
        socket.emit("fourPlayerMoveRejected", {
          reason: "You already have an active game. Rejoin it first.",
        });
        return;
      }
      clearUserActiveGame(userId, existingClassicGameId);
    }
    const existingGameId = userActiveFourPlayerGames.get(userId);
    if (existingGameId) {
      if (fourPlayerGames.has(existingGameId)) {
        socket.emit("fourPlayerMoveRejected", {
          reason: "You already have an active 4-player game. Rejoin it first.",
        });
        return;
      }
      clearUserActiveFourPlayerGame(userId, existingGameId);
    }

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
    const shuffledColors = [...FOUR_PLAYER_COLORS].sort(
      () => Math.random() - 0.5,
    );
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
      setUserActiveFourPlayerGame(
        normalizeId(playerSocket.data.userId),
        gameId,
      );
      syncUserPresenceFromSockets(normalizeId(playerSocket.data.userId));
    });

    const game = {
      id: gameId,
      room,
      state: createInitialFourPlayerState(),
      playersByColor,
      socketToColor,
      timeControl: normalizedTimeControl,
      reconnectGraceMs: getReconnectGraceMsForTimeControl(normalizedTimeControl),
      startedAt: new Date(),
      disconnectGraceTimers: {},
      disconnectedAt: {},
    };
    fourPlayerGames.set(gameId, game);
    void persistFourPlayerGameSession(gameId);

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
      socket.emit("fourPlayerMoveRejected", {
        reason: "Not part of this game.",
      });
      return;
    }

    const normalizedFrom = normalizeFourPlayerSquare(from);
    const normalizedTo = normalizeFourPlayerSquare(to);
    if (!normalizedFrom || !normalizedTo) {
      socket.emit("fourPlayerMoveRejected", {
        reason: "Invalid move payload.",
      });
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
      socket.emit("fourPlayerMoveRejected", {
        reason: "Not part of this game.",
      });
      return;
    }

    emitFourPlayerState(game, { systemMessage: "Resynced game state." });
  });

  socket.on("rejoinFourPlayerGame", async ({ gameId } = {}, ack) => {
    try {
      const userId = normalizeId(socket.data.userId);
      if (!userId) {
        safeAck(ack, { success: false, error: "Not authenticated." });
        return;
      }

      const requestedGameId = String(gameId || "").trim();
      const activeGameId = userActiveFourPlayerGames.get(userId);
      const resolvedGameId = requestedGameId || activeGameId || "";
      if (!resolvedGameId) {
        safeAck(ack, { success: false, error: "No active game found." });
        return;
      }

      const game =
        fourPlayerGames.get(resolvedGameId) ||
        (await hydrateFourPlayerGameFromSession(resolvedGameId));
      if (!game) {
        clearUserActiveFourPlayerGame(userId, resolvedGameId);
        safeAck(ack, { success: false, error: "Active game not found." });
        return;
      }

      if (socket.data.gameId) {
        safeAck(ack, {
          success: false,
          error: "Leave your current game first.",
        });
        return;
      }
      if (
        socket.data.fourPlayerGameId &&
        socket.data.fourPlayerGameId !== resolvedGameId
      ) {
        safeAck(ack, {
          success: false,
          error: "Leave your current game first.",
        });
        return;
      }

      const color = getFourPlayerColorByUserId(game, userId);
      if (!color) {
        clearUserActiveFourPlayerGame(userId, resolvedGameId);
        safeAck(ack, {
          success: false,
          error: "You are not a participant in this game.",
        });
        return;
      }
      if (
        Array.isArray(game.state?.eliminated) &&
        game.state.eliminated.includes(color)
      ) {
        safeAck(ack, {
          success: false,
          error: "You are eliminated from this game.",
        });
        return;
      }

      const previousSocketId = game.playersByColor?.[color]?.socketId;
      if (previousSocketId && previousSocketId !== socket.id) {
        const previousSocket = io.sockets.sockets.get(previousSocketId);
        if (previousSocket) {
          previousSocket.data.fourPlayerGameId = null;
          previousSocket.leave(game.room);
        }
        delete game.socketToColor[previousSocketId];
      }

      if (!game.playersByColor[color]) {
        game.playersByColor[color] = {
          socketId: socket.id,
          userId,
          name: socket.data.name || "Player",
        };
      } else {
        game.playersByColor[color].socketId = socket.id;
        game.playersByColor[color].userId = userId;
        game.playersByColor[color].name =
          game.playersByColor[color].name || socket.data.name || "Player";
      }

      game.socketToColor[socket.id] = color;
      socket.data.fourPlayerGameId = resolvedGameId;
      socket.data.inFourPlayerQueue = false;
      socket.data.fourPlayerQueueKey = null;
      socket.join(game.room);
      setUserActiveFourPlayerGame(userId, resolvedGameId);
      clearFourPlayerReconnectGraceTimer(game, color);
      syncUserPresenceFromSockets(userId);
      void persistFourPlayerGameSession(resolvedGameId, {
        status: "active",
        disconnectedColor: "",
        disconnectedAt: null,
        reconnectDeadlineAt: null,
      });

      const playersPayload = serializeFourPlayerPlayers(game.playersByColor);
      io.to(socket.id).emit("fourPlayerMatchFound", {
        gameId: resolvedGameId,
        color,
        state: game.state,
        players: playersPayload,
        timeControl: game.timeControl,
        restored: true,
      });
      io.to(game.room).emit("fourPlayerParticipantReconnected", {
        gameId: resolvedGameId,
        color,
      });
      emitFourPlayerState(game, {
        systemMessage: `${color.toUpperCase()} reconnected.`,
      });
      safeAck(ack, {
        success: true,
        status: "started",
        gameId: resolvedGameId,
        color,
        rejoined: true,
      });
    } catch (error) {
      console.error("rejoinFourPlayerGame error:", error);
      safeAck(ack, {
        success: false,
        error: "Failed to rejoin active game.",
      });
    }
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
        safeAck(ack, {
          success: false,
          error: "You cannot challenge yourself.",
        });
        return;
      }

      if (socket.data.gameId || socket.data.fourPlayerGameId) {
        safeAck(ack, { success: false, error: "You are already in a game." });
        return;
      }
      const persistedOwnSession = await ensurePersistedActiveSessionForUser(
        fromUserId,
      );
      if (
        persistedOwnSession &&
        ACTIVE_SESSION_STATUSES.includes(String(persistedOwnSession.status || ""))
      ) {
        safeAck(ack, {
          success: false,
          error: "You already have an active game.",
        });
        return;
      }
      const activeGameId = userActiveGames.get(fromUserId);
      if (activeGameId) {
        if (games.has(activeGameId)) {
          safeAck(ack, {
            success: false,
            error: "You already have an active game.",
          });
          return;
        }
        clearUserActiveGame(fromUserId, activeGameId);
      }
      const activeFourPlayerGameId = userActiveFourPlayerGames.get(fromUserId);
      if (activeFourPlayerGameId && fourPlayerGames.has(activeFourPlayerGameId)) {
        safeAck(ack, {
          success: false,
          error: "You already have an active 4-player game.",
        });
        return;
      }
      if (activeFourPlayerGameId) {
        clearUserActiveFourPlayerGame(fromUserId, activeFourPlayerGameId);
      }

      const persistedTargetSession = await ensurePersistedActiveSessionForUser(
        toUserId,
      );
      if (
        persistedTargetSession &&
        ACTIVE_SESSION_STATUSES.includes(String(persistedTargetSession.status || ""))
      ) {
        safeAck(ack, {
          success: false,
          error: "Friend is already in a game.",
        });
        return;
      }
      const targetActiveGameId = userActiveGames.get(toUserId);
      if (targetActiveGameId) {
        if (games.has(targetActiveGameId)) {
          safeAck(ack, {
            success: false,
            error: "Friend is already in a game.",
          });
          return;
        }
        clearUserActiveGame(toUserId, targetActiveGameId);
      }
      const targetActiveFourPlayerGameId = userActiveFourPlayerGames.get(toUserId);
      if (targetActiveFourPlayerGameId) {
        if (fourPlayerGames.has(targetActiveFourPlayerGameId)) {
          safeAck(ack, {
            success: false,
            error: "Friend is already in a game.",
          });
          return;
        }
        clearUserActiveFourPlayerGame(toUserId, targetActiveFourPlayerGameId);
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

      if (await isBlocked(fromUserId, toUserId)) {
        safeAck(ack, {
          success: false,
          error: "You cannot challenge this player.",
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
        // Friend challenges are always casual and never affect ratings.
        rated: false,
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
        safeAck(ack, {
          success: false,
          error: "Challenge no longer available.",
        });
        return;
      }

      const challenge = pendingChallenges.get(challengeId);
      if (challenge.toUserId !== userId) {
        safeAck(ack, {
          success: false,
          error: "Not authorized for challenge.",
        });
        return;
      }

      pendingChallenges.delete(challengeId);

      if (!accept) {
        io.to(getUserRoom(challenge.fromUserId)).emit(
          "friendChallengeDeclined",
          {
            challengeId,
            byUserId: userId,
            byName: socket.data.name || "Friend",
          },
        );
        safeAck(ack, { success: true, status: "declined" });
        return;
      }

      const challengerSocket = getSocketForUser(
        io,
        challenge.fromUserId,
        challenge.fromSocketId,
      );
      const receiverSocket = socket;
      const challengerUserId = normalizeId(challenge.fromUserId);
      const receiverUserId = normalizeId(challenge.toUserId);

      if (await areUsersBlocked(challengerUserId, receiverUserId)) {
        io.to(getUserRoom(challenge.fromUserId)).emit("friendChallengeDeclined", {
          challengeId,
          byUserId: userId,
          byName: socket.data.name || "Friend",
          reason: "You cannot challenge this player.",
        });
        safeAck(ack, {
          success: false,
          error: "You cannot challenge this player.",
        });
        return;
      }

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
        io.to(getUserRoom(challenge.fromUserId)).emit(
          "friendChallengeDeclined",
          {
            challengeId,
            byUserId: userId,
            byName: "System",
            reason: "One of the players is already in a game.",
          },
        );
        safeAck(ack, {
          success: false,
          error: "One of the players is already in a game.",
        });
        return;
      }
      const challengerActiveClassicGameId = userActiveGames.get(challengerUserId);
      const receiverActiveClassicGameId = userActiveGames.get(receiverUserId);
      if (
        (challengerActiveClassicGameId &&
          games.has(challengerActiveClassicGameId)) ||
        (receiverActiveClassicGameId && games.has(receiverActiveClassicGameId))
      ) {
        io.to(getUserRoom(challenge.fromUserId)).emit(
          "friendChallengeDeclined",
          {
            challengeId,
            byUserId: userId,
            byName: "System",
            reason: "One of the players is already in a game.",
          },
        );
        safeAck(ack, {
          success: false,
          error: "One of the players is already in a game.",
        });
        return;
      }
      if (challengerActiveClassicGameId) {
        clearUserActiveGame(challengerUserId, challengerActiveClassicGameId);
      }
      if (receiverActiveClassicGameId) {
        clearUserActiveGame(receiverUserId, receiverActiveClassicGameId);
      }

      const challengerActiveFourPlayerGameId =
        userActiveFourPlayerGames.get(challengerUserId);
      const receiverActiveFourPlayerGameId =
        userActiveFourPlayerGames.get(receiverUserId);
      if (
        (challengerActiveFourPlayerGameId &&
          fourPlayerGames.has(challengerActiveFourPlayerGameId)) ||
        (receiverActiveFourPlayerGameId &&
          fourPlayerGames.has(receiverActiveFourPlayerGameId))
      ) {
        io.to(getUserRoom(challenge.fromUserId)).emit(
          "friendChallengeDeclined",
          {
            challengeId,
            byUserId: userId,
            byName: "System",
            reason: "One of the players is already in a game.",
          },
        );
        safeAck(ack, {
          success: false,
          error: "One of the players is already in a game.",
        });
        return;
      }
      if (challengerActiveFourPlayerGameId) {
        clearUserActiveFourPlayerGame(
          challengerUserId,
          challengerActiveFourPlayerGameId,
        );
      }
      if (receiverActiveFourPlayerGameId) {
        clearUserActiveFourPlayerGame(
          receiverUserId,
          receiverActiveFourPlayerGameId,
        );
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
      const ratedForDisplay = false;
      const challengerRating = null;
      const receiverRating = null;

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
        id: gameId,
        room,
        chess,
        players: { white: whiteSocketId, black: blackSocketId },
        playerUsers: {
          white: socketToUser[whiteSocketId] || "",
          black: socketToUser[blackSocketId] || "",
        },
        playerNames: {
          white:
            whiteSocketId === challengerSocket.id
              ? String(challenge.fromName || challengerSocket.data.name || "Player")
              : String(challenge.toName || receiverSocket.data.name || "Player"),
          black:
            blackSocketId === challengerSocket.id
              ? String(challenge.fromName || challengerSocket.data.name || "Player")
              : String(challenge.toName || receiverSocket.data.name || "Player"),
        },
        timeControl: normalizedTimeControl,
        variant: normalizedVariant,
        whiteCheckCount: 0,
        blackCheckCount: 0,
        chess960: initialPosition.chess960,
        mode: "friend",
        isRated: false,
        clockState: {
          white: normalizedTimeControl.initial,
          black: normalizedTimeControl.initial,
          activeColor: "w",
          lastTickAt: Date.now(),
        },
        disconnectGraceTimers: { w: null, b: null },
        disconnectedAt: { w: null, b: null },
        reconnectGraceMs: getReconnectGraceMsForTimeControl(normalizedTimeControl),
        startedAt: new Date(),
        persistedMoves: [],
        ratingByColor: {
          white: whiteSocketId === challengerSocket.id ? challengerRating : receiverRating,
          black: blackSocketId === challengerSocket.id ? challengerRating : receiverRating,
        },
      });
      scheduleFirstMoveAbortTimer(gameId);

      challengerSocket.data.gameId = gameId;
      receiverSocket.data.gameId = gameId;
      setUserActiveGame(normalizeId(challengerSocket.data.userId), gameId);
      setUserActiveGame(normalizeId(receiverSocket.data.userId), gameId);
      syncUserPresenceFromSockets(normalizeId(challengerSocket.data.userId));
      syncUserPresenceFromSockets(normalizeId(receiverSocket.data.userId));
      void persistClassicGameSession(gameId);
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
    const isAtomic = game.variant === "atomic";
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
    const preMoveClock = getClockSnapshot(game);
    const moverClockBefore =
      moverColor === "w" ? preMoveClock.white : preMoveClock.black;
    if (moverClockBefore <= 0) {
      const winner = moverColor === "w" ? "b" : "w";
      emitGameOver(gameId, "timeout", winner);
      return;
    }

    if (isAtomic && isAtomicKingCaptureAttempt(chess, from, to, moverColor)) {
      return socket.emit("moveRejected", {
        reason: "King captures are not allowed in Atomic Chess",
      });
    }

    const castlingResult = tryHandleChess960Castling(
      game,
      moverColor,
      from,
      to,
    );
    if (castlingResult.handled) {
      if (!castlingResult.success) {
        return socket.emit("moveRejected", {
          reason: castlingResult.reason || "Illegal castling move",
        });
      }

      const nextChess = castlingResult.game.chess;
      if (pliesBeforeMove === 0) {
        game.firstMoveAt = Date.now();
      }
      if (isTournamentRealtimeGame(game)) {
        const firstTurnMoves =
          game.firstTurnMoves && typeof game.firstTurnMoves === "object"
            ? game.firstTurnMoves
            : { w: false, b: false };
        firstTurnMoves[moverColor] = true;
        game.firstTurnMoves = firstTurnMoves;
        scheduleFirstMoveAbortTimer(gameId);
      } else if (pliesBeforeMove === 0) {
        clearFirstMoveAbortTimer(game);
      }
      const postMoveClock = applyMoveClockTransition(
        game,
        moverColor,
        nextChess.turn(),
        preMoveClock,
      );
      setClassicGameMoves(game, [
        ...getClassicGameMoves(game),
        String(castlingResult.move?.san || "").trim(),
      ]);
      void persistClassicGameSession(gameId, { status: "active" });
      const threeCheckResult = applyThreeCheckAfterMove(game, moverColor);
      const kingOfHillResult = applyKingOfHillAfterMove(game, moverColor);
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
        whiteTimeLeft: postMoveClock.white,
        blackTimeLeft: postMoveClock.black,
      });

      if (kingOfHillResult.isKingOfHillWin) {
        emitGameOver(gameId, "king_of_the_hill", moverColor);
      } else if (threeCheckResult.isThreeCheckWin) {
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
    }
    if (isTournamentRealtimeGame(game)) {
      const firstTurnMoves =
        game.firstTurnMoves && typeof game.firstTurnMoves === "object"
          ? game.firstTurnMoves
          : { w: false, b: false };
      firstTurnMoves[moverColor] = true;
      game.firstTurnMoves = firstTurnMoves;
      scheduleFirstMoveAbortTimer(gameId);
    } else if (pliesBeforeMove === 0) {
      clearFirstMoveAbortTimer(game);
    }
    const postMoveClock = applyMoveClockTransition(
      game,
      moverColor,
      chess.turn(),
      preMoveClock,
    );
    setClassicGameMoves(game, [
      ...getClassicGameMoves(game),
      String(move?.san || "").trim(),
    ]);
    void persistClassicGameSession(gameId, { status: "active" });

    updateChess960RightsForNormalMove(game, move, moverColor);

    if (isAtomic) {
      const atomicResult = move.captured ? applyAtomicExplosion(chess, move) : null;

      io.to(room).emit("moveApplied", {
        gameId,
        move,
        fen: chess.fen(),
        turn: chess.turn(),
        isCheck: false,
        isCheckmate: false,
        isDraw: false,
        isStalemate: false,
        whiteTimeLeft: postMoveClock.white,
        blackTimeLeft: postMoveClock.black,
      });

      if (atomicResult) {
        const atomicWinner = getAtomicExplosionWinner(chess, moverColor);
        if (atomicWinner) {
          emitGameOver(gameId, "atomic_explosion", atomicWinner);
          return;
        }
      }
      return;
    }

    const threeCheckResult = applyThreeCheckAfterMove(game, moverColor);
    const kingOfHillResult = applyKingOfHillAfterMove(game, moverColor);

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
      whiteTimeLeft: postMoveClock.white,
      blackTimeLeft: postMoveClock.black,
    });

    if (kingOfHillResult.isKingOfHillWin) {
      emitGameOver(gameId, "king_of_the_hill", moverColor);
    } else if (threeCheckResult.isThreeCheckWin) {
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
      handleFourPlayerSocketDisconnect(socket);
    }

    const userId = normalizeId(socket.data.userId);
    unregisterUserSocket(userId, socket.id);
    syncUserPresenceFromSockets(userId, { forcePersist: true });

    if (userId && !userSockets.has(userId)) {
      for (const [challengeId, challenge] of pendingChallenges.entries()) {
        if (challenge.fromUserId === userId) {
          pendingChallenges.delete(challengeId);
          io.to(getUserRoom(challenge.toUserId)).emit(
            "friendChallengeCancelled",
            {
              challengeId,
              reason: "Challenger disconnected.",
            },
          );
        }
      }
    }

    const gameId = socket.data.gameId;
    if (gameId) {
      const game = games.get(gameId);
      if (game) {
        const disconnectedColor =
          socket.id === game.players.white
            ? "w"
            : socket.id === game.players.black
              ? "b"
              : null;
        if (disconnectedColor === "w") {
          game.players.white = null;
        } else if (disconnectedColor === "b") {
          game.players.black = null;
        }
        if (disconnectedColor) {
          const waitingColor = disconnectedColor === "w" ? "b" : "w";
          const waitingSocketId =
            waitingColor === "w" ? game.players.white : game.players.black;
          if (waitingSocketId) {
            io.to(waitingSocketId).emit("opponent_disconnected", {
              gameId,
              opponentColor: disconnectedColor,
              graceMs: getReconnectGraceMsForTimeControl(game.timeControl),
            });
          }
          emitGameSystemMessage(
            gameId,
            "Opponent disconnected. Waiting for reconnect...",
            waitingColor,
          );
          scheduleReconnectGraceTimer(gameId, disconnectedColor);
        }
      }
    }
  });
});

async function bootstrapServer() {
  await connectDB();
  runPostConnectTasks();

  server.listen(PORT, () => {
    console.log(`[server] running on port ${PORT}`);
    console.log(`[server] allowed origins: ${allowedOrigins.join(", ")}`);
  });
}

bootstrapServer().catch((error) => {
  console.error("[server] bootstrap error:", error);
  process.exit(1);
});

server.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    console.error(
      `[server] port ${PORT} is already in use. Stop the other process and restart.`,
    );
    return;
  }
  console.error("[server] HTTP server error:", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("[server] unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[server] uncaught exception:", error);
});
