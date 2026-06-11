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
  getAbortThresholdMs,
  resolveTerminalReason,
  shouldApplyRatedResult,
} from "./utils/gameLifecyclePolicy.js";
import {
  applyMoveClockTransition as applyClockMoveTransition,
  commitClockSnapshot as commitClockStateSnapshot,
  createInitialClockState,
  estimateTimeControlSeconds,
  ensureClockState as ensureServerClockState,
  freezeGameClock,
  getTurnTimeoutDelayMs,
  materializeClock,
  normalizeTimeControl as normalizeServerTimeControl,
} from "./utils/gameClock.js";
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
import { startScheduledTournamentMonitor } from "./services/scheduledTournamentMonitor.js";
import { deletePendingUsersByIds } from "./services/userDeletion.js";
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
  pgnRoutes,
  adminRoutes,
  adminUsersRoutes,
  adminGamesRoutes,
  adminPuzzlesRoutes,
  adminBotsRoutes,
  eventsRoutes,
  eventsMnRoutes,
  adminEventsRoutes,
  adminEventsMnRoutes,
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
  learnMnRoutes,
  adminLearnRoutes,
  adminLearnMnRoutes,
  analysisAiRoutes,
} from "./routes/index.js";
import {
  authMiddleware,
  requestSecurityMiddleware,
} from "./middleware/index.js";
import { migrateLegacyRuntimeMedia } from "./utils/runtimeMediaMigration.js";
import { areUsersBlocked } from "./utils/visibility.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const allowedOrigins = [
  ...new Set(
    String(process.env.CLIENT_ORIGINS || process.env.CORS_ORIGINS || "")
      .split(",")
      .map((origin) => String(origin || "").trim())
      .filter(Boolean),
  ),
];
const PORT = Number.parseInt(process.env.PORT || "3001", 10);
const BODY_LIMIT = process.env.BODY_LIMIT || "10mb";
const COOKIE_SECRET =
  process.env.COOKIE_SECRET ||
  process.env.COOKIES_SECRET ||
  "change-me-in-production-cookie-secret";

if (allowedOrigins.length === 0) {
  console.warn(
    "CLIENT_ORIGINS is not set. Browser requests with an Origin header will be rejected by CORS.",
  );
}

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
  transports: ["websocket", "polling"],
  pingInterval: 25000,
  pingTimeout: 60000,
  maxHttpBufferSize: 1e6,
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
  "GET:/ai/status",
  "POST:/ai/explanations",
  "POST:/admin/login",
  "POST:/admin/logout",
]);
const DB_OPTIONAL_API_ROUTES = new Set([
  "GET:/oauth/config",
  "GET:/lichess/tv",
  "GET:/lichess/streamers",
]);
const DB_STATE_LABELS = Object.freeze({
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
});
const DB_READY_STATES = new Set([1, 2]);

// expose socket.io instance for notification helpers
app.set("io", io);

// Add Socket.IO error handlers
io.engine.on("connection_error", (err) => {
  console.error("[socket.io] engine connection error:", err?.message || err);
});

io.on("error", (err) => {
  console.error("[socket.io] server error:", err?.message || err);
});

const waitingQueues = new Map(); // key -> [{ socketId, rating, joinedAt, pool }]
const games = new Map(); // gameId -> { room, chess, players, playerUsers, timeControl, variant, chess960, isRated }
const gameSpectators = new Map(); // gameId -> Set<socketId>
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
const DRAW_OFFER_TIMEOUT_MS = 30 * 1000;
const RECONNECT_GRACE_MS_BY_POOL = Object.freeze({
  bullet: 10 * 1000,
  blitz: 60 * 1000,
  rapid: 60 * 1000,
  classical: 60 * 1000,
});
// Clock timeout/abort timers are process-local. This runtime currently assumes a
// single active backend instance for authoritative timer scheduling.
const MAX_TIMEOUT_DELAY_MS = 2_147_000_000;
const ACTIVE_SESSION_STATUSES = Object.freeze([
  "active",
  "temporarily_disconnected",
]);
const PRESENCE_DB_WRITE_INTERVAL_MS = 45 * 1000;
const WATCH_CLOCK_TICK_INTERVAL_MS = 1000;
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

  // Treat "connecting" as available: Mongoose can buffer operations while
  // reconnecting, which avoids transient 503s during short network blips.
  if (DB_READY_STATES.has(mongoose.connection.readyState)) {
    return next();
  }

  const routeKey = `${String(req.method || "").toUpperCase()}:${String(req.path || "")}`;
  if (DB_OPTIONAL_API_ROUTES.has(routeKey)) {
    return next();
  }

  return res.status(503).json({
    error:
      "Database connection is not ready. Check MONGODB_URL or network access, then restart the backend.",
    db: DB_STATE_LABELS[mongoose.connection.readyState] || "unknown",
  });
});
app.use("/api", (req, res, next) => {
  if (req.method === "OPTIONS") return next();

  if (req.path.startsWith("/admin")) {
    return next();
  }

  // Tournament list/detail endpoints are designed to support optional auth.
  if (
    String(req.method || "").toUpperCase() === "GET" &&
    String(req.path || "").startsWith("/tournaments")
  ) {
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
  restoreActiveClassicSessionsOnStartup().catch((error) => {
    console.error("Active classic game restore error:", error);
  });
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
  startScheduledTournamentMonitor(app);
}

// API Routes
app.use("/api", authRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/puzzles", puzzleRoutes);
app.use("/api/game-config", gameConfigRoutes);
app.use("/api/bots", botsRoutes);
app.use("/api/pgn", pgnRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/users", adminUsersRoutes);
app.use("/api/admin/games", adminGamesRoutes);
app.use("/api/admin/puzzles", adminPuzzlesRoutes);
app.use("/api/admin/bots", adminBotsRoutes);
app.use("/api/admin/events", adminEventsRoutes);
app.use("/api/admin/events-mn", adminEventsMnRoutes);
app.use("/api/admin/featured-events", adminFeaturedEventsRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/community", communityRoutes);
app.use("/api/admin/community", adminCommunityRoutes);
app.use("/api/admin/groups", adminGroupsRoutes);
app.use("/api/admin/tournaments", adminTournamentsRoutes);
app.use("/api/events", eventsRoutes);
app.use("/api/events-mn", eventsMnRoutes);
app.use("/api/featured-events", featuredEventsRoutes);
app.use("/api/lichess", lichessRoutes);
app.use("/api/friends", friendsRoutes);
app.use("/api/ratings", ratingsRoutes);
app.use("/api/tournaments", tournamentRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/learn", learnRoutes);
app.use("/api/learn-mn", learnMnRoutes);
app.use("/api/ai", analysisAiRoutes);
app.use("/api/admin/learn", adminLearnRoutes);
app.use("/api/admin/learn-mn", adminLearnMnRoutes);

app.get("/api/active-game", async (req, res) => {
  const userId = normalizeId(req.user?.userId);
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  let session = await ensurePersistedActiveSessionForUser(userId);
  if (!session) {
    return res.status(200).json({ active: false, session: null });
  }

  if (session.kind === "fourPlayer") {
    const sessionPlayers = session.playersByColor || {};
    const playerColor = FOUR_PLAYER_COLORS.find((color) => {
      const participantUserId = normalizeId(sessionPlayers?.[color]?.userId);
      return !!participantUserId && participantUserId === userId;
    });
    const isEliminated =
      !!playerColor &&
      Array.isArray(session.state?.eliminated) &&
      session.state.eliminated.includes(playerColor);
    const hasWinner = !!session.state?.winner;
    if (isEliminated || hasWinner) {
      clearUserActiveFourPlayerGame(userId, session.gameId);
      if (hasWinner) {
        await completeSessionRecord(session.gameId, {
          status: "completed",
          terminalReason: session.terminalReason || "game_over",
          winner: String(session.state?.winner || session.winner || ""),
          completedAt: session.completedAt || new Date(),
        });
      }
      return res.status(200).json({ active: false, session: null });
    }
  }

  if (session.kind === "classic") {
    const activeGame = await hydrateClassicGameFromSession(session.gameId);
    if (activeGame) {
      await persistClassicGameSession(session.gameId);
      session =
        (await ActiveGameSession.findOne({ gameId: session.gameId }).lean()) ||
        session;
    }
  }

  return res.status(200).json({
    active: true,
    session: buildActiveSessionResponse(session, userId),
  });
});

app.get("/api/watch/live-games", (_req, res) => {
  return res.status(200).json({
    games: buildWatchLiveGameList(),
    updatedAt: new Date().toISOString(),
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
  const normalizedTimeControl = normalizeTimeControl(timeControl);
  const initial = Number(normalizedTimeControl?.initial ?? 300);
  const increment = Number(normalizedTimeControl?.increment ?? 0);
  const delay = Number(normalizedTimeControl?.delay ?? 0);
  const kind = String(normalizedTimeControl?.kind || "sudden_death");
  const stageSignature =
    kind === "staged" && Array.isArray(normalizedTimeControl?.stages)
      ? normalizedTimeControl.stages
          .map((stage) => {
            const start = Number(stage?.startsOnMoveNumber || 1);
            const extra = Number(stage?.extraBank || 0);
            const inc = Number(stage?.increment || 0);
            const stageDelay = Number(stage?.delay || 0);
            const stageDelayType = String(stage?.delayType || "none");
            return `${start}:${extra}:${inc}:${stageDelay}:${stageDelayType}`;
          })
          .join("|")
      : "";
  const normalizedVariant = normalizeVariant(variant);
  return `${normalizedVariant}:${kind}:${initial}+${increment}:d${delay}:s${stageSignature}`;
}

function getQueue(key) {
  if (!waitingQueues.has(key)) {
    waitingQueues.set(key, []);
  }
  return waitingQueues.get(key);
}

function getSpectatorSet(gameId, createIfMissing = false) {
  const normalizedGameId = String(gameId || "").trim();
  if (!normalizedGameId) return null;
  if (!gameSpectators.has(normalizedGameId) && createIfMissing) {
    gameSpectators.set(normalizedGameId, new Set());
  }
  return gameSpectators.get(normalizedGameId) || null;
}

function getSpectatorCountForGame(gameId) {
  const spectators = getSpectatorSet(gameId);
  return spectators ? spectators.size : 0;
}

function formatWatchTimeControl(timeControl) {
  const normalized = normalizeTimeControl(timeControl);
  const initialSeconds = Math.max(
    0,
    Number(normalized?.initial ?? normalized?.initialSeconds ?? 0),
  );
  const incrementSeconds = Math.max(
    0,
    Number(normalized?.increment ?? normalized?.incrementSeconds ?? 0),
  );
  const baseMinutes = initialSeconds / 60;
  const baseLabel = Number.isInteger(baseMinutes)
    ? String(baseMinutes)
    : baseMinutes.toFixed(1).replace(/\.0$/, "");
  return `${baseLabel}+${Math.round(incrementSeconds)}`;
}

function getWatchCategoryFromTimeControl(timeControl) {
  const normalized = normalizeTimeControl(timeControl);
  const initialSeconds = Math.max(
    0,
    Number(normalized?.initial ?? normalized?.initialSeconds ?? 0),
  );
  const incrementSeconds = Math.max(
    0,
    Number(normalized?.increment ?? normalized?.incrementSeconds ?? 0),
  );
  const totalSeconds = initialSeconds + incrementSeconds * 40;
  if (totalSeconds <= 8 * 60) return "Blitz";
  if (totalSeconds <= 25 * 60) return "Rapid";
  return "Classical";
}

function toWatchSpeedFromCategory(category) {
  const normalized = String(category || "").toLowerCase();
  if (normalized === "rapid") return "rapid";
  if (normalized === "classical") return "classical";
  return "blitz";
}

function buildWatchLiveGamePayload(game) {
  if (!game || game.isEnding) return null;
  const gameId = String(game.id || "").trim();
  if (!gameId) return null;

  const whiteName = String(game?.playerNames?.white || "White");
  const blackName = String(game?.playerNames?.black || "Black");
  const whiteRating = normalizeLiveRating(game?.ratingByColor?.white, 1200);
  const blackRating = normalizeLiveRating(game?.ratingByColor?.black, 1200);
  const category = getWatchCategoryFromTimeControl(game?.timeControl);
  const viewers = getSpectatorCountForGame(gameId);

  return {
    id: gameId,
    white: whiteName,
    whiteRating,
    black: blackName,
    blackRating,
    viewers,
    time: formatWatchTimeControl(game?.timeControl),
    type: category,
    category,
    speed: toWatchSpeedFromCategory(category),
    gameUrl: `/watch/${encodeURIComponent(gameId)}`,
  };
}

function buildWatchLiveGameList() {
  const list = [];
  for (const game of games.values()) {
    const item = buildWatchLiveGamePayload(game);
    if (item) {
      list.push(item);
    }
  }
  list.sort((a, b) => {
    const viewerDiff = Number(b.viewers || 0) - Number(a.viewers || 0);
    if (viewerDiff !== 0) return viewerDiff;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
  return list;
}

function emitWatchLiveGamesUpdated() {
  io.emit("watchLiveGamesUpdated", {
    games: buildWatchLiveGameList(),
    updatedAt: Date.now(),
  });
}

function buildWatchStatePayload(game) {
  const gameId = String(game?.id || "").trim();
  const clock = getClockSnapshot(game);
  const fenHistory = getClassicFenHistory(game);
  return {
    gameId,
    fen: String(game?.chess?.fen?.() || "start"),
    initialFen: String(game?.initialFen || fenHistory[0] || "start"),
    fenHistory,
    moves: getClassicGameMoves(game),
    timeControl: normalizeTimeControl(game?.timeControl),
    variant: normalizeVariant(game?.variant),
    white: {
      name: String(game?.playerNames?.white || "White"),
      rating: normalizeLiveRating(game?.ratingByColor?.white, 1200),
    },
    black: {
      name: String(game?.playerNames?.black || "Black"),
      rating: normalizeLiveRating(game?.ratingByColor?.black, 1200),
    },
    whiteTimeLeft: Number(clock.white || 0),
    blackTimeLeft: Number(clock.black || 0),
    activeColor: clock.activeColor === "b" ? "b" : "w",
    clockAsOf: Number(clock.asOf || Date.now()),
    viewers: getSpectatorCountForGame(gameId),
    status: "active",
  };
}

function emitWatchViewerCount(gameId) {
  const normalizedGameId = String(gameId || "").trim();
  if (!normalizedGameId) return;
  const game = games.get(normalizedGameId);
  if (!game) return;
  io.to(game.room).emit("watchViewerCount", {
    gameId: normalizedGameId,
    viewers: getSpectatorCountForGame(normalizedGameId),
  });
}

function addGameSpectator(gameId, socketId) {
  const normalizedGameId = String(gameId || "").trim();
  const normalizedSocketId = String(socketId || "").trim();
  if (!normalizedGameId || !normalizedSocketId) return;
  const spectators = getSpectatorSet(normalizedGameId, true);
  spectators.add(normalizedSocketId);
  emitWatchViewerCount(normalizedGameId);
  emitWatchLiveGamesUpdated();
}

function removeGameSpectator(gameId, socketId, options = {}) {
  const normalizedGameId = String(gameId || "").trim();
  const normalizedSocketId = String(socketId || "").trim();
  if (!normalizedGameId || !normalizedSocketId) return;
  const spectators = getSpectatorSet(normalizedGameId);
  if (!spectators) return;
  spectators.delete(normalizedSocketId);
  if (spectators.size === 0) {
    gameSpectators.delete(normalizedGameId);
  }
  if (options.emitUpdate !== false) {
    emitWatchViewerCount(normalizedGameId);
    emitWatchLiveGamesUpdated();
  }
}

function removeSpectatorSocketFromAllGames(socketId) {
  const normalizedSocketId = String(socketId || "").trim();
  if (!normalizedSocketId) return;
  const gameIds = Array.from(gameSpectators.keys());
  for (const gameId of gameIds) {
    removeGameSpectator(gameId, normalizedSocketId, { emitUpdate: false });
  }
  emitWatchLiveGamesUpdated();
}

setInterval(() => {
  for (const [gameId, spectators] of gameSpectators.entries()) {
    const game = games.get(gameId);
    if (!game || !spectators || spectators.size === 0) {
      gameSpectators.delete(gameId);
      continue;
    }

    const clock = getClockSnapshot(game);
    const payload = {
      gameId,
      whiteTimeLeft: Number(clock.white || 0),
      blackTimeLeft: Number(clock.black || 0),
      activeColor: clock.activeColor === "b" ? "b" : "w",
      clockAsOf: Number(clock.asOf || Date.now()),
    };

    for (const socketId of Array.from(spectators)) {
      if (!io.sockets.sockets.has(socketId)) {
        spectators.delete(socketId);
        continue;
      }
      io.to(socketId).emit("watchClock", payload);
    }

    if (spectators.size === 0) {
      gameSpectators.delete(gameId);
      emitWatchLiveGamesUpdated();
    }
  }
}, WATCH_CLOCK_TICK_INTERVAL_MS);

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

function getMatchmakingPairBlockCache(cache) {
  if (cache instanceof Map) return cache;
  return cache?.pairs instanceof Map ? cache.pairs : null;
}

function getMatchmakingProfileBlockCache(cache) {
  return cache?.profiles instanceof Map ? cache.profiles : null;
}

function normalizeBlockedUserIdSet(blockedUsers) {
  const ids = new Set();
  if (!Array.isArray(blockedUsers)) return ids;
  for (const blockedUserId of blockedUsers) {
    const normalizedBlockedUserId = normalizeId(blockedUserId);
    if (normalizedBlockedUserId) {
      ids.add(normalizedBlockedUserId);
    }
  }
  return ids;
}

async function loadMatchmakingBlockProfile(userId, cache = null) {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) return null;
  if (cache?.has(normalizedUserId)) {
    return cache.get(normalizedUserId);
  }

  let profile = null;
  try {
    const user = await User.findById(normalizedUserId)
      .select("_id blockedUsers banned")
      .lean();
    if (user && !user.banned) {
      profile = {
        id: normalizeId(user._id),
        blockedUsers: normalizeBlockedUserIdSet(user.blockedUsers),
        lookupFailed: false,
      };
    }
  } catch (error) {
    console.error("Matchmaking block profile lookup error:", error);
    profile = {
      id: normalizedUserId,
      blockedUsers: new Set(),
      lookupFailed: true,
    };
  }

  if (cache) {
    cache.set(normalizedUserId, profile);
  }
  return profile;
}

async function areSocketUsersBlocked(socketA, socketB, cache = null) {
  const userA = normalizeId(socketA?.data?.userId);
  const userB = normalizeId(socketB?.data?.userId);
  if (!userA || !userB || userA === userB) {
    return false;
  }

  const key = userA < userB ? `${userA}:${userB}` : `${userB}:${userA}`;
  const pairCache = getMatchmakingPairBlockCache(cache);
  if (pairCache?.has(key)) {
    return pairCache.get(key);
  }

  const profileCache = getMatchmakingProfileBlockCache(cache);
  const [profileA, profileB] = await Promise.all([
    loadMatchmakingBlockProfile(userA, profileCache),
    loadMatchmakingBlockProfile(userB, profileCache),
  ]);

  let blocked =
    !profileA ||
    !profileB ||
    profileA.lookupFailed ||
    profileB.lookupFailed ||
    profileA.blockedUsers.has(profileB.id) ||
    profileB.blockedUsers.has(profileA.id);

  if (!blocked) {
    try {
      blocked = await areUsersBlocked(userA, userB);
    } catch (error) {
      console.error("Block status lookup error:", error);
      blocked = true;
    }
  }

  if (pairCache) {
    pairCache.set(key, blocked);
  }
  return blocked;
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

function deriveAccountStatusFromPresence(status) {
  const normalizedStatus = normalizePresenceStatus(status);
  if (normalizedStatus === "in_game") return "playing";
  if (normalizedStatus === "offline") return "offline";
  return "active";
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
    accountStatus: deriveAccountStatusFromPresence(entry.status),
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
  const previousStatus = normalizePresenceStatus(entry.status);
  const nextStatus = normalizePresenceStatus(status);

  entry.status = nextStatus;
  entry.lastActiveAt = now;
  if (markSeen) {
    entry.lastSeenAt = now;
  }

  emitPresenceState(normalizedUserId);
  persistPresence(normalizedUserId, forcePersist || previousStatus !== nextStatus);
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
  return normalizeServerTimeControl(timeControl);
}

function getReconnectGraceMsForTimeControl(timeControl) {
  const normalizedTimeControl = normalizeTimeControl(timeControl);
  const estimatedSeconds = estimateTimeControlSeconds(normalizedTimeControl);

  if (estimatedSeconds < 180) {
    return RECONNECT_GRACE_MS_BY_POOL.bullet;
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
  game.moveCount = game.persistedMoves.length;
  if (game.clockState && typeof game.clockState === "object") {
    game.clockState.moveCount = game.moveCount;
  }
}

function normalizeClassicChatMessageEntry(game, entry) {
  const matchId = String(entry?.matchId || game?.id || "").trim();
  const senderId = normalizeId(entry?.senderId);
  const senderUsername = String(entry?.senderUsername || "").trim().slice(0, 60);
  const message = String(entry?.message || "").trim().slice(0, 500);
  if (!matchId || !senderId || !senderUsername || !message) return null;

  const parsedTimestamp = new Date(entry?.timestamp || "");
  const timestamp = Number.isFinite(parsedTimestamp.getTime())
    ? parsedTimestamp.toISOString()
    : new Date().toISOString();

  return {
    matchId,
    senderId,
    senderUsername,
    message,
    timestamp,
  };
}

function getClassicChatMessages(game) {
  if (!Array.isArray(game?.chatMessages)) return [];
  return game.chatMessages
    .map((entry) => normalizeClassicChatMessageEntry(game, entry))
    .filter(Boolean);
}

function appendClassicChatMessage(game, entry) {
  if (!game) return null;
  const normalized = normalizeClassicChatMessageEntry(game, entry);
  if (!normalized) return null;
  const nextMessages = [...getClassicChatMessages(game), normalized];
  if (nextMessages.length > 200) {
    nextMessages.splice(0, nextMessages.length - 200);
  }
  game.chatMessages = nextMessages;
  return normalized;
}

function getClassicFenHistory(game) {
  if (Array.isArray(game?.fenHistory)) {
    const normalized = game.fenHistory
      .map((fen) => String(fen || "").trim())
      .filter(Boolean);
    if (normalized.length > 0) return normalized;
  }
  const initialFen = String(game?.initialFen || "start").trim() || "start";
  const currentFen = String(game?.chess?.fen?.() || initialFen).trim() || initialFen;
  return currentFen === initialFen ? [initialFen] : [initialFen, currentFen];
}

function setClassicFenHistory(game, fenHistory) {
  if (!game) return;
  const normalized = Array.isArray(fenHistory)
    ? fenHistory.map((fen) => String(fen || "").trim()).filter(Boolean)
    : [];
  if (normalized.length === 0) {
    const fallbackInitial = String(game?.initialFen || "start").trim() || "start";
    game.fenHistory = [fallbackInitial];
    return;
  }
  game.fenHistory = normalized;
}

function appendClassicFen(game, fen) {
  if (!game) return;
  const normalizedFen = String(fen || "").trim();
  if (!normalizedFen) return;
  const history = getClassicFenHistory(game);
  const lastFen = history[history.length - 1];
  if (lastFen === normalizedFen) {
    setClassicFenHistory(game, history);
    return;
  }
  setClassicFenHistory(game, [...history, normalizedFen]);
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

function toTimestamp(value, fallback = Date.now()) {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : fallback;
  }
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  const dateParsed = new Date(value || "").getTime();
  return Number.isFinite(dateParsed) && dateParsed > 0 ? dateParsed : fallback;
}

function getClassicGamePgn(game, moves = getClassicGameMoves(game)) {
  try {
    const historyMoves = Array.isArray(moves) ? moves : getClassicGameMoves(game);
    const normalizedMoves = historyMoves
      .map((move) => String(move || "").trim())
      .filter(Boolean);
    const initialFen = String(game?.initialFen || "").trim();
    const pgnChess = initialFen && initialFen !== "start" ? new Chess(initialFen) : new Chess();

    normalizedMoves.forEach((move) => {
      const replayedMove = pgnChess.move(move);
      if (!replayedMove) {
        throw new Error(`Invalid move while rebuilding PGN: ${move}`);
      }
    });

    return String(pgnChess.pgn() || "").trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("Failed to build classic PGN from isolated history:", message);
    return null;
  }
}

function resultForWinner(winner) {
  if (winner === "w") return "white";
  if (winner === "b") return "black";
  if (winner === "draw") return "draw";
  return null;
}

function buildClassicSessionUpdate(game, overrides = {}) {
  const moves = getClassicGameMoves(game);
  const fenHistory = getClassicFenHistory(game);
  const initialFen =
    String(overrides.initialFen || game?.initialFen || fenHistory[0] || "start").trim() ||
    "start";
  const clock = getClockSnapshot(game);
  const normalizedStatus = String(overrides.status || "active");
  const shouldRebaselineActiveClock =
    ACTIVE_SESSION_STATUSES.includes(normalizedStatus) && clock.running !== false;
  const persistedClockAsOfMs = Math.max(
    0,
    Math.round(Number(clock.asOf || Date.now())),
  );
  const persistedTurnStartedAtMs = shouldRebaselineActiveClock
    ? persistedClockAsOfMs
    : Math.max(0, Math.round(Number(clock.turnStartedAtMs || Date.now())));
  const persistedWhiteBankMs = Math.max(
    0,
    Math.round(Number(clock.whiteMs || 0)),
  );
  const persistedBlackBankMs = Math.max(
    0,
    Math.round(Number(clock.blackMs || 0)),
  );
  const whiteUserId = normalizeId(game?.playerUsers?.white);
  const blackUserId = normalizeId(game?.playerUsers?.black);
  const activeColor = clock.activeColor === "b" ? "b" : "w";
  const terminalReason = String(overrides.terminalReason || "").trim();
  const winner = String(overrides.winner || "").trim();
  const result =
    overrides.result !== undefined
      ? overrides.result
      : terminalReason === "draw"
        ? "draw"
        : terminalReason
          ? resultForWinner(winner)
          : null;
  const disconnectColor =
    typeof overrides.disconnectedColor === "string" && overrides.disconnectedColor
      ? overrides.disconnectedColor
      : "";
  const reconnectGraceMs =
    Number(overrides.reconnectGraceMs) ||
    Number(game?.reconnectGraceMs) ||
    getReconnectGraceMsForTimeControl(game?.timeControl);
  const hasPgnOverride = Object.prototype.hasOwnProperty.call(overrides, "pgn");
  let sessionPgn = "";
  if (hasPgnOverride) {
    sessionPgn = String(overrides.pgn || "");
  } else {
    const rebuiltPgn = getClassicGamePgn(game, moves);
    if (typeof rebuiltPgn === "string") {
      sessionPgn = rebuiltPgn;
    } else {
      console.warn("Failed to generate classic session PGN. Persisting empty PGN.");
      sessionPgn = "";
    }
  }

  return {
    gameId: String(game?.id || overrides.gameId || "").trim(),
    kind: "classic",
    mode:
      overrides.mode ||
      (game?.mode === "friend" || game?.mode === "tournament"
        ? game.mode
        : "quick"),
    status: normalizedStatus,
    participantUserIds: [whiteUserId, blackUserId].filter(Boolean),
    whitePlayerId: whiteUserId,
    blackPlayerId: blackUserId,
    variant: normalizeVariant(overrides.variant || game?.variant),
    timeControl: normalizeTimeControl(overrides.timeControl || game?.timeControl),
    rated: overrides.rated ?? game?.isRated === true,
    white: buildClassicPlayerConnection(game, "white"),
    black: buildClassicPlayerConnection(game, "black"),
    fen: String(overrides.fen || game?.chess?.fen?.() || "start"),
    initialFen,
    pgn: sessionPgn,
    moves,
    fenHistory,
    moveCount: Number.isFinite(Number(overrides.moveCount))
      ? Number(overrides.moveCount)
      : Number(clock.moveCount ?? moves.length),
    turn: activeColor,
    whoseTurn: activeColor === "b" ? "black" : "white",
    chess960: game?.chess960 || undefined,
    whiteCheckCount: Number(game?.whiteCheckCount || 0),
    blackCheckCount: Number(game?.blackCheckCount || 0),
    clockState: {
      whiteBankMs: persistedWhiteBankMs,
      blackBankMs: persistedBlackBankMs,
      activeColor,
      turnStartedAtMs: persistedTurnStartedAtMs,
      moveCount: Number(clock.moveCount || 0),
      running: shouldRebaselineActiveClock,
    },
    whiteTimeRemainingMs: persistedWhiteBankMs,
    blackTimeRemainingMs: persistedBlackBankMs,
    turnStartedAt: overrides.turnStartedAt || new Date(persistedTurnStartedAtMs),
    lastMoveAt: overrides.lastMoveAt || new Date(Number(clock.asOf || Date.now())),
    ratingByColor: game?.ratingByColor || undefined,
    disconnectedColor: disconnectColor,
    disconnectedAt: overrides.disconnectedAt || game?.disconnectedAt?.[disconnectColor] || null,
    reconnectDeadlineAt: overrides.reconnectDeadlineAt || null,
    reconnectGraceMs,
    terminalReason,
    winner,
    result,
    resultReason: terminalReason || null,
    startedAt: overrides.startedAt || game?.startedAt || new Date(),
    completedAt: overrides.completedAt || null,
  };
}

function buildFourPlayerSessionUpdate(game, overrides = {}) {
  const participants = [];
  const playersByColor = {};
  const eliminatedColors = new Set(
    Array.isArray(game?.state?.eliminated) ? game.state.eliminated : [],
  );
  FOUR_PLAYER_COLORS.forEach((color) => {
    const player = game?.playersByColor?.[color];
    const userId = normalizeId(player?.userId);
    if (userId && !eliminatedColors.has(color)) {
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
    chatMessages: getFourPlayerChatMessages(game),
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
  let update;
  try {
    update = buildClassicSessionUpdate(game, overrides);
  } catch (error) {
    console.warn(
      "Failed to build classic session update. Retrying with empty PGN.",
      error,
    );
    try {
      update = buildClassicSessionUpdate(game, { ...overrides, pgn: "" });
    } catch (retryError) {
      console.error("Active game session sync build error:", retryError);
      return null;
    }
  }
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
  const terminalReason = values.terminalReason || "";
  const winner = values.winner || "";
  const result =
    terminalReason === "draw"
      ? "draw"
      : terminalReason === "aborted"
        ? null
        : resultForWinner(winner);
  return ActiveGameSession.findOneAndUpdate(
    { gameId: normalizedGameId },
    {
      $set: {
        status:
          values.status ||
          (terminalReason === "aborted" ? "aborted" : "completed"),
        terminalReason,
        winner,
        result,
        resultReason: terminalReason || null,
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
    fen: session.fen || null,
    initialFen: session.initialFen || "start",
    pgn: session.pgn || "",
    moves: Array.isArray(session.moves) ? session.moves : [],
    fenHistory: Array.isArray(session.fenHistory) ? session.fenHistory : [],
    whiteTimeRemainingMs: Number(session.whiteTimeRemainingMs || 0),
    blackTimeRemainingMs: Number(session.blackTimeRemainingMs || 0),
    whiteTimeLeft: Math.max(0, Number(session.whiteTimeRemainingMs || 0) / 1000),
    blackTimeLeft: Math.max(0, Number(session.blackTimeRemainingMs || 0) / 1000),
    whoseTurn:
      session.whoseTurn === "black" || session.turn === "b"
        ? "black"
        : "white",
    gameStatus: String(session.status || "active"),
    result: session.result || null,
    resultReason: session.resultReason || session.terminalReason || null,
    lastMoveAt: session.lastMoveAt || null,
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
    isRated: ratedForDisplay,
    tournamentId: tournamentId ? normalizeId(tournamentId) : null,
    tournamentGameId: tournamentGameId ? normalizeId(tournamentGameId) : null,
    firstTurnMoves: isTournamentGame ? { w: false, b: false } : null,
    moveCount: 0,
    clockState: createInitialClockState(normalizedTimeControl, Date.now(), {
      activeColor: "w",
      moveCount: 0,
      running: true,
    }),
    disconnectGraceTimers: { w: null, b: null },
    disconnectedAt: { w: null, b: null },
    reconnectGraceMs: getReconnectGraceMsForTimeControl(normalizedTimeControl),
    startedAt: new Date(),
    initialFen: chess.fen(),
    persistedMoves: [],
    fenHistory: [chess.fen()],
    chatMessages: [],
    timeoutTimer: null,
    drawOffer: null,
    drawOfferTimer: null,
    ratingByColor: {
      white: normalizeLiveRating(whiteRating),
      black: normalizeLiveRating(blackRating),
    },
  });
  const createdGame = games.get(safeGameId);
  scheduleFirstMoveAbortTimer(safeGameId);
  scheduleGameTimeoutTimer(safeGameId);

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

  const initialClockSnapshot = getClockSnapshot(createdGame);

  io.to(whiteSocket.id).emit("game_state_restored", {
    gameId: safeGameId,
    color: "w",
    fen: createdGame.chess.fen(),
    initialFen:
      String(createdGame?.initialFen || createdGame?.chess?.fen?.() || "start").trim() ||
      "start",
    moves: getClassicGameMoves(createdGame),
    chatMessages: getClassicChatMessages(createdGame),
    ...initialClockSnapshot,
    whiteTimeLeft: initialClockSnapshot.white,
    blackTimeLeft: initialClockSnapshot.black,
    playerClock: initialClockSnapshot.white,
    opponentClock: initialClockSnapshot.black,
    clockPaused: false,
  });
  io.to(blackSocket.id).emit("game_state_restored", {
    gameId: safeGameId,
    color: "b",
    fen: createdGame.chess.fen(),
    initialFen:
      String(createdGame?.initialFen || createdGame?.chess?.fen?.() || "start").trim() ||
      "start",
    moves: getClassicGameMoves(createdGame),
    chatMessages: getClassicChatMessages(createdGame),
    ...initialClockSnapshot,
    whiteTimeLeft: initialClockSnapshot.white,
    blackTimeLeft: initialClockSnapshot.black,
    playerClock: initialClockSnapshot.black,
    opponentClock: initialClockSnapshot.white,
    clockPaused: false,
  });

  emitWatchLiveGamesUpdated();

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
  const normalizedTimeControl = normalizeTimeControl(timeControl);
  const initial = Number(normalizedTimeControl?.initial ?? 300);
  const increment = Number(normalizedTimeControl?.increment ?? 0);
  const delay = Number(normalizedTimeControl?.delay ?? 0);
  const kind = String(normalizedTimeControl?.kind || "sudden_death");
  return `fourPlayer:${kind}:${initial}+${increment}:d${delay}`;
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

function normalizeFourPlayerChatEntry(game, entry = {}) {
  const gameId = String(game?.id || entry?.gameId || "").trim();
  const senderId = normalizeId(entry?.senderId);
  const senderUsername = String(entry?.senderUsername || "").trim().slice(0, 60);
  const message = String(entry?.message || "").trim().slice(0, 500);
  if (!gameId || !senderId || !senderUsername || !message) return null;
  const timestamp = new Date(
    entry?.timestamp || entry?.createdAt || Date.now(),
  ).toISOString();
  return {
    gameId,
    senderId,
    senderUsername,
    message,
    timestamp,
  };
}

function getFourPlayerChatMessages(game) {
  if (!Array.isArray(game?.chatMessages)) return [];
  return game.chatMessages
    .map((entry) => normalizeFourPlayerChatEntry(game, entry))
    .filter(Boolean);
}

function appendFourPlayerChatMessage(game, entry = {}) {
  const normalized = normalizeFourPlayerChatEntry(game, entry);
  if (!normalized) return null;
  const nextMessages = [...getFourPlayerChatMessages(game), normalized];
  if (nextMessages.length > 200) {
    nextMessages.splice(0, nextMessages.length - 200);
  }
  game.chatMessages = nextMessages;
  return normalized;
}

function clearEliminatedFourPlayerParticipants(game) {
  if (!game) return;
  const eliminated = Array.isArray(game.state?.eliminated) ? game.state.eliminated : [];
  for (const color of eliminated) {
    if (!FOUR_PLAYER_COLORS.includes(color)) continue;
    const participantUserId = normalizeId(game.playersByColor?.[color]?.userId);
    clearUserActiveFourPlayerGame(participantUserId, game.id);
  }
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
  clearGameTimeoutTimer(game);
  clearReconnectGraceTimers(game);
  clearDrawOffer(game);

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

function getClassicColorForSocket(game, socketId) {
  if (!game || !socketId) return null;
  if (socketId === game.players?.white) return "w";
  if (socketId === game.players?.black) return "b";
  return null;
}

function getClassicSocketIdForColor(game, color) {
  if (!game) return "";
  return color === "b" ? game.players?.black : game.players?.white;
}

function getClassicUserIdForColor(game, color) {
  if (!game) return "";
  return color === "b"
    ? normalizeId(game.playerUsers?.black)
    : normalizeId(game.playerUsers?.white);
}

function getClassicColorForUser(game, userId) {
  const normalizedUserId = normalizeId(userId);
  if (!game || !normalizedUserId) return null;
  if (getClassicUserIdForColor(game, "w") === normalizedUserId) return "w";
  if (getClassicUserIdForColor(game, "b") === normalizedUserId) return "b";
  return null;
}

function emitClassicColorEvent(game, color, eventName, payload, options = {}) {
  const targetSocketIds = new Set();
  const primarySocketId = getClassicSocketIdForColor(game, color);
  const excludedSocketId = String(options.excludeSocketId || "").trim();

  if (primarySocketId) {
    targetSocketIds.add(primarySocketId);
  }

  const targetUserId = getClassicUserIdForColor(game, color);
  const userSocketIds = targetUserId ? userSockets.get(targetUserId) : null;
  if (userSocketIds) {
    for (const socketId of userSocketIds) {
      targetSocketIds.add(socketId);
    }
  }

  let deliveredCount = 0;
  for (const socketId of targetSocketIds) {
    if (!socketId || socketId === excludedSocketId) continue;
    const targetSocket = io.sockets.sockets.get(socketId);
    if (!targetSocket) continue;
    targetSocket.emit(eventName, payload);
    deliveredCount += 1;
  }
  return deliveredCount;
}

function clearDrawOffer(game) {
  if (!game) return;
  if (game.drawOfferTimer) {
    clearTimeout(game.drawOfferTimer);
  }
  game.drawOfferTimer = null;
  game.drawOffer = null;
}

function expireDrawOffer(gameId) {
  const normalizedGameId = String(gameId || "").trim();
  const game = games.get(normalizedGameId);
  if (!game || !game.drawOffer) return;
  clearDrawOffer(game);
  io.to(game.room).emit("drawOfferExpired", { gameId: normalizedGameId });
}

function declineDrawOfferForMove(gameId, moverColor) {
  const game = games.get(String(gameId || "").trim());
  if (!game?.drawOffer || game.drawOffer.by === moverColor) return;
  clearDrawOffer(game);
  io.to(game.room).emit("drawOfferDeclined", {
    gameId,
    declinedBy: moverColor,
    reason: "move",
  });
}

function emitPendingDrawOfferForSocket(game, color, socketId) {
  const offer = game?.drawOffer;
  const normalizedGameId = String(game?.id || "").trim();
  if (!offer?.by || !normalizedGameId || !socketId) return;
  const expiresAt = Number(offer.expiresAt || 0);
  if (expiresAt && expiresAt <= Date.now()) {
    expireDrawOffer(normalizedGameId);
    return;
  }

  io.to(socketId).emit(offer.by === color ? "drawOfferPending" : "drawOfferReceived", {
    gameId: normalizedGameId,
    offeredBy: offer.by,
    expiresAt: Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : null,
  });
}

function gamePlies(game) {
  return getClassicGameMoves(game).length;
}

function clearFirstMoveAbortTimer(game) {
  if (!game?.firstMoveAbortTimer) return;
  clearTimeout(game.firstMoveAbortTimer);
  game.firstMoveAbortTimer = null;
}

function clearGameTimeoutTimer(game) {
  if (!game?.timeoutTimer) return;
  clearTimeout(game.timeoutTimer);
  game.timeoutTimer = null;
}

function ensureGameClockState(game) {
  return ensureServerClockState(game, Date.now());
}

function getClockSnapshot(game, now = Date.now()) {
  return materializeClock(game, now);
}

function commitClockSnapshot(game, snapshot, nextActiveColor, options = {}) {
  return commitClockStateSnapshot(game, snapshot, nextActiveColor, Date.now(), {
    moveCount: options.moveCount,
    running: options.running,
  });
}

function pauseGameClockForDisconnect(game, disconnectedColor) {
  void disconnectedColor;
  return getClockSnapshot(game);
}

function resumeGameClockAfterReconnect(game) {
  return getClockSnapshot(game);
}

function applyMoveClockTransition(
  game,
  moverColor,
  nextTurnColor,
  clockBeforeMove = null,
) {
  void clockBeforeMove;
  return applyClockMoveTransition(game, moverColor, nextTurnColor, Date.now());
}

function scheduleGameTimeoutTimer(gameId) {
  const normalizedGameId = String(gameId || "").trim();
  const game = games.get(normalizedGameId);
  if (!game || game.isEnding) return;
  if (Number(game?.timeControl?.initial || 0) <= 0) return;
  clearGameTimeoutTimer(game);

  const finishOnTimeout = () => {
    const latestGame = games.get(normalizedGameId);
    if (!latestGame || latestGame.isEnding) return;
    const latestClock = getClockSnapshot(latestGame);
    const latestActiveColor = latestClock.activeColor === "b" ? "b" : "w";
    const latestRemaining =
      latestActiveColor === "w" ? latestClock.whiteMs : latestClock.blackMs;
    if (latestRemaining > 0) {
      scheduleGameTimeoutTimer(normalizedGameId);
      return;
    }
    const winner = latestActiveColor === "w" ? "b" : "w";
    void emitGameOver(normalizedGameId, "timeout", winner, {
      preserveEarlyResult: true,
    });
  };

  const remainingMs = getTurnTimeoutDelayMs(game, Date.now());
  if (remainingMs <= 0) {
    finishOnTimeout();
    return;
  }

  const delayMs = Math.min(
    MAX_TIMEOUT_DELAY_MS,
    Math.max(1, Math.ceil(remainingMs)),
  );
  game.timeoutTimer = setTimeout(finishOnTimeout, delayMs);
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
  const gameId = options.gameId || game.id;
  const fenHistory = getClassicFenHistory(game);
  return {
    gameId,
    color: normalizedColor,
    fen: game.chess.fen(),
    initialFen: String(game?.initialFen || fenHistory[0] || "start"),
    fenHistory,
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
    activeColor: clock.activeColor,
    turnStartedAtMs: clock.turnStartedAtMs,
    clockAsOf: clock.asOf,
    whiteTimeLeft: clock.white,
    blackTimeLeft: clock.black,
    playerClock: ownClock,
    opponentClock: opponentClock,
    chatMessages: getClassicChatMessages(game),
    viewers: getSpectatorCountForGame(gameId),
    clockPaused: false,
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
  scheduleGameTimeoutTimer(gameId);
  game.disconnectGraceTimers[color] = setTimeout(() => {
    const latestGame = games.get(gameId);
    if (!latestGame || latestGame.isEnding) return;

    const disconnectedSideKey = color === "w" ? "white" : "black";
    const disconnectedSocketId = latestGame.players?.[disconnectedSideKey];
    if (disconnectedSocketId) return;

    const waitingColor = color === "w" ? "b" : "w";
    clearReconnectGraceTimer(latestGame, color);
    emitGameSystemMessage(
      gameId,
      "Opponent did not reconnect in time and forfeited.",
      waitingColor,
    );
    void emitGameOver(gameId, "opponent_left", waitingColor, {
      preserveEarlyResult: true,
    });
  }, graceMs);
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

  const normalizedTimeControl = normalizeTimeControl(session.timeControl);
  const storedClock = session.clockState || {};
  const whiteBankMs = Number.isFinite(Number(session.whiteTimeRemainingMs))
    ? Math.max(0, Math.round(Number(session.whiteTimeRemainingMs)))
    : Number.isFinite(Number(storedClock.whiteBankMs))
      ? Math.max(0, Math.round(Number(storedClock.whiteBankMs)))
      : Number.isFinite(Number(storedClock.white))
        ? Math.max(0, Math.round(Number(storedClock.white) * 1000))
        : Math.max(0, Math.round(Number(normalizedTimeControl.initialMs || 300_000)));
  const blackBankMs = Number.isFinite(Number(session.blackTimeRemainingMs))
    ? Math.max(0, Math.round(Number(session.blackTimeRemainingMs)))
    : Number.isFinite(Number(storedClock.blackBankMs))
      ? Math.max(0, Math.round(Number(storedClock.blackBankMs)))
      : Number.isFinite(Number(storedClock.black))
        ? Math.max(0, Math.round(Number(storedClock.black) * 1000))
        : Math.max(0, Math.round(Number(normalizedTimeControl.initialMs || 300_000)));
  const activeColor =
    session.whoseTurn === "black"
      ? "b"
      : session.whoseTurn === "white"
        ? "w"
        : storedClock.activeColor === "b" || session.turn === "b"
          ? "b"
          : "w";
  const turnStartedAtMs = toTimestamp(
    session.turnStartedAt ||
      storedClock.turnStartedAtMs ||
      storedClock.turnStartedAt ||
      session.lastMoveAt ||
      session.updatedAt ||
      session.startedAt,
  );
  const moveCount = Number.isFinite(Number(session.moveCount))
    ? Math.max(0, Math.floor(Number(session.moveCount)))
    : Array.isArray(session.moves)
      ? session.moves.length
      : 0;
  const whiteSocketId = String(session.white?.socketId || "").trim();
  const blackSocketId = String(session.black?.socketId || "").trim();

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

  const hydratedVariant = normalizeVariant(session.variant);
  const hydratedRatingPool = getRatingPoolForTimeControl(
    normalizedTimeControl,
    hydratedVariant,
  );

  const hydratedGame = {
    id: normalizedGameId,
    room: `game:${normalizedGameId}`,
    chess,
    players: {
      white:
        session.white?.connected && io.sockets.sockets.has(whiteSocketId)
          ? whiteSocketId
          : null,
      black:
        session.black?.connected && io.sockets.sockets.has(blackSocketId)
          ? blackSocketId
          : null,
    },
    playerUsers: {
      white: normalizeId(session.whitePlayerId || session.white?.userId),
      black: normalizeId(session.blackPlayerId || session.black?.userId),
    },
    playerNames: {
      white: String(session.white?.name || "Player"),
      black: String(session.black?.name || "Player"),
    },
    timeControl: normalizedTimeControl,
    variant: hydratedVariant,
    whiteCheckCount: Number(session.whiteCheckCount || 0),
    blackCheckCount: Number(session.blackCheckCount || 0),
    chess960: session.chess960 || undefined,
    mode:
      session.mode === "friend" || session.mode === "tournament"
        ? session.mode
        : "quick",
    isRated: session.rated === true && !!hydratedRatingPool,
    tournamentId: null,
    tournamentGameId: null,
    firstTurnMoves: null,
    moveCount,
    clockState: {
      whiteBankMs,
      blackBankMs,
      activeColor,
      turnStartedAtMs,
      moveCount,
      running: String(session.status || "active") !== "completed",
    },
    disconnectGraceTimers: { w: null, b: null },
    disconnectedAt: {
      w: session.white?.disconnectedAt ? new Date(session.white.disconnectedAt).getTime() : null,
      b: session.black?.disconnectedAt ? new Date(session.black.disconnectedAt).getTime() : null,
    },
    reconnectGraceMs: Number(session.reconnectGraceMs || 0),
    startedAt: session.startedAt ? new Date(session.startedAt) : new Date(),
    initialFen: String(session.initialFen || "start").trim() || "start",
    persistedMoves: Array.isArray(session.moves) ? session.moves : [],
    fenHistory: Array.isArray(session.fenHistory) ? session.fenHistory : [],
    chatMessages: [],
    timeoutTimer: null,
    drawOffer: null,
    drawOfferTimer: null,
    ratingByColor: session.ratingByColor || {
      white: null,
      black: null,
    },
  };
  if (!Array.isArray(hydratedGame.fenHistory) || hydratedGame.fenHistory.length === 0) {
    hydratedGame.fenHistory = [hydratedGame.initialFen];
    const currentFen = String(hydratedGame.chess.fen() || "").trim();
    if (currentFen && currentFen !== hydratedGame.initialFen) {
      hydratedGame.fenHistory.push(currentFen);
    }
  }
  ensureGameClockState(hydratedGame);

  games.set(normalizedGameId, hydratedGame);
  setUserActiveGame(hydratedGame.playerUsers.white, normalizedGameId);
  setUserActiveGame(hydratedGame.playerUsers.black, normalizedGameId);
  if (gamePlies(hydratedGame) === 0) {
    scheduleFirstMoveAbortTimer(normalizedGameId);
  }
  scheduleGameTimeoutTimer(normalizedGameId);
  return hydratedGame;
}

async function restoreActiveClassicSessionsOnStartup() {
  const sessions = await ActiveGameSession.find({
    kind: "classic",
    status: { $in: ACTIVE_SESSION_STATUSES },
  })
    .select("gameId")
    .lean();
  for (const session of sessions) {
    await hydrateClassicGameFromSession(session.gameId);
  }
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
    chatMessages: Array.isArray(session.chatMessages) ? session.chatMessages : [],
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

function scheduleFirstMoveAbortTimer(gameId, options = {}) {
  const game = games.get(gameId);
  if (!game) return;
  clearFirstMoveAbortTimer(game);
  const thresholdMs = getAbortThresholdMs(game.timeControl);
  if (options.resetStartedAt === true || !game.startedAt) {
    game.startedAt = Date.now();
  }
  const startedAt = toTimestamp(game.startedAt, Date.now());
  const elapsedMs = Math.max(0, Date.now() - startedAt);
  const delayMs = Math.max(1, thresholdMs - elapsedMs);
  game.firstMoveAbortTimer = setTimeout(() => {
    const latestGame = games.get(gameId);
    if (!latestGame) return;

    if (gamePlies(latestGame) > 0) return;

    emitGameSystemMessage(
      gameId,
      "Game aborted: no first move was made in time.",
      "w",
    );
    emitGameOver(gameId, "aborted", null);
  }, delayMs);
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
  clearGameTimeoutTimer(game);
  clearDrawOffer(game);
  freezeGameClock(game, Date.now());

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
      const syncResult = await syncTournamentGameResultByGameId(gameId, tournamentResult, {
        source: "runtime",
        ratingHandledByRealtime: true,
        elo,
      });
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
  const spectators = getSpectatorSet(gameId);
  if (spectators) {
    for (const socketId of spectators) {
      const spectatorSocket = io.sockets.sockets.get(socketId);
      if (spectatorSocket) {
        spectatorSocket.leave(game.room);
        if (String(spectatorSocket.data.watchingGameId || "") === String(gameId)) {
          spectatorSocket.data.watchingGameId = null;
        }
      }
    }
    gameSpectators.delete(gameId);
  }
  clearGameForPlayers(game);
  games.delete(gameId);
  await deletePendingUsersByIds([
    normalizeId(game?.playerUsers?.white),
    normalizeId(game?.playerUsers?.black),
  ]);
  emitWatchLiveGamesUpdated();
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

function applyKingOfHillAfterMove(game, moverColor, move) {
  if (!game || normalizeVariant(game.variant) !== "kingOfHill") {
    return { isKingOfHillWin: false };
  }

  if (moverColor !== "w" && moverColor !== "b") {
    return { isKingOfHillWin: false };
  }

  if (!move || move.piece !== "k" || move.color !== moverColor) {
    return { isKingOfHillWin: false };
  }

  const destinationSquare =
    typeof move.to === "string" ? move.to.trim().toLowerCase() : "";
  if (!KING_OF_HILL_CENTER_SQUARES.has(destinationSquare)) {
    return { isKingOfHillWin: false };
  }

  return {
    isKingOfHillWin: true,
    winner: moverColor,
  };
}

function tryApplyKingOfHillArrivalMove(game, moverColor, from, to) {
  if (!game || normalizeVariant(game.variant) !== "kingOfHill") {
    return { success: false };
  }
  if (moverColor !== "w" && moverColor !== "b") {
    return { success: false };
  }

  const sourceSquare = String(from || "").trim().toLowerCase();
  const destinationSquare = String(to || "").trim().toLowerCase();
  if (!KING_OF_HILL_CENTER_SQUARES.has(destinationSquare)) {
    return { success: false };
  }

  const sourceCoords = squareToCoords(sourceSquare);
  const destinationCoords = squareToCoords(destinationSquare);
  if (!sourceCoords || !destinationCoords) {
    return { success: false };
  }

  const fileDelta = Math.abs(sourceCoords.file - destinationCoords.file);
  const rankDelta = Math.abs(sourceCoords.rank - destinationCoords.rank);
  if (Math.max(fileDelta, rankDelta) !== 1) {
    return { success: false };
  }

  const movingPiece = game.chess.get(sourceSquare);
  if (!movingPiece || movingPiece.color !== moverColor || movingPiece.type !== "k") {
    return { success: false };
  }

  const targetPiece = game.chess.get(destinationSquare);
  if (
    targetPiece &&
    (targetPiece.color === moverColor || targetPiece.type === "k")
  ) {
    return { success: false };
  }

  const parsed = parseFenPosition(game.chess.fen());
  if (!parsed) {
    return { success: false };
  }

  const board = cloneBoard(parsed.board);
  const kingPiece = moverColor === "w" ? "K" : "k";
  setPiece(board, sourceSquare, null);
  setPiece(board, destinationSquare, kingPiece);

  const nextTurn = moverColor === "w" ? "b" : "w";
  const nextHalfmove = targetPiece ? 0 : parsed.halfmove + 1;
  const nextFullmove = parsed.fullmove + (moverColor === "b" ? 1 : 0);
  const nextFen = `${serializeFenBoard(board)} ${nextTurn} - - ${nextHalfmove} ${nextFullmove}`;
  let nextChess;
  try {
    nextChess = new Chess(nextFen);
  } catch {
    return { success: false };
  }

  const move = {
    color: moverColor,
    from: sourceSquare,
    to: destinationSquare,
    flags: targetPiece ? "c" : "n",
    piece: "k",
    san: `${targetPiece ? "Kx" : "K"}${destinationSquare}`,
  };
  if (targetPiece) {
    move.captured = targetPiece.type;
  }

  game.chess = nextChess;
  return { success: true, chess: nextChess, move };
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

  // Add error handling to prevent connection aborts from crashing
  socket.on("error", (err) => {
    console.error("[socket.io] socket error:", err?.message || err);
  });

  socket.on("disconnect", (reason) => {
    if (socket.data.userId) {
      syncUserPresenceFromSockets(socket.data.userId);
    }
  });

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

  socket.on("watchGame", async (payload = {}, ack) => {
    try {
      const gameId = String(payload?.gameId || "").trim();
      if (!gameId) {
        safeAck(ack, { success: false, error: "Game id is required." });
        return;
      }

      const activeGame =
        games.get(gameId) || (await hydrateClassicGameFromSession(gameId));
      if (!activeGame || activeGame.isEnding) {
        safeAck(ack, {
          success: false,
          error: "This game is no longer available for watching.",
        });
        return;
      }

      const previousWatchGameId = String(socket.data.watchingGameId || "").trim();
      if (previousWatchGameId && previousWatchGameId !== gameId) {
        removeGameSpectator(previousWatchGameId, socket.id);
        socket.leave(`game:${previousWatchGameId}`);
      }

      socket.data.watchingGameId = gameId;
      socket.join(activeGame.room);
      addGameSpectator(gameId, socket.id);

      const state = buildWatchStatePayload(activeGame);
      io.to(socket.id).emit("watchState", state);
      safeAck(ack, { success: true, state });
    } catch (error) {
      console.error("watchGame error:", error);
      safeAck(ack, { success: false, error: "Unable to watch this game." });
    }
  });

  socket.on("unwatchGame", (payload = {}, ack) => {
    const requestedGameId = String(payload?.gameId || "").trim();
    const activeWatchGameId = String(socket.data.watchingGameId || "").trim();
    const gameId = requestedGameId || activeWatchGameId;
    if (!gameId) {
      safeAck(ack, { success: true });
      return;
    }

    removeGameSpectator(gameId, socket.id);
    socket.leave(`game:${gameId}`);
    if (activeWatchGameId === gameId) {
      socket.data.watchingGameId = null;
    }
    safeAck(ack, { success: true });
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
      const socketGameId = String(socket.data.gameId || "").trim();
      if (socketGameId && socketGameId !== gameId) {
        const socketGame = games.get(socketGameId);
        if (socketGame?.isEnding) {
          safeAck(ack, {
            success: false,
            error: "Waiting for previous game to finish.",
          });
          return;
        }
        if (socketGame) {
          safeAck(ack, {
            success: false,
            error: "Leave your current game first.",
          });
          return;
        }
        socket.data.gameId = null;
        clearUserActiveGame(userId, socketGameId);
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
        .select("status timeControl gameType rated")
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
        const existingGame = games.get(userExistingGameId);
        if (existingGame?.isEnding) {
          safeAck(ack, {
            success: false,
            error: "Waiting for previous game to finish.",
          });
          return;
        }
        if (existingGame) {
          safeAck(ack, {
            success: false,
            error: "You already have another active game. Rejoin it first.",
          });
          return;
        }
        clearUserActiveGame(userId, userExistingGameId);
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
        scheduleGameTimeoutTimer(gameId);
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
          initialFen:
            String(activeGame?.initialFen || activeGame?.chess?.fen?.() || "start").trim() ||
            "start",
          moves: getClassicGameMoves(activeGame),
          chatMessages: getClassicChatMessages(activeGame),
          ...clockSnapshot,
          whiteTimeLeft: clockSnapshot.white,
          blackTimeLeft: clockSnapshot.black,
          playerClock:
            userColor === "w" ? clockSnapshot.white : clockSnapshot.black,
          opponentClock:
            userColor === "w" ? clockSnapshot.black : clockSnapshot.white,
          clockPaused: false,
        });
        if (opponentSocket?.id) {
          io.to(opponentSocket.id).emit("opponent_reconnected", {
            gameId,
            color: userColor,
          });
        }
        emitPendingDrawOfferForSocket(activeGame, userColor, socket.id);

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
      const whiteEndingGame =
        whiteActiveGameId &&
        whiteActiveGameId !== gameId &&
        games.get(whiteActiveGameId)?.isEnding;
      const blackEndingGame =
        blackActiveGameId &&
        blackActiveGameId !== gameId &&
        games.get(blackActiveGameId)?.isEnding;
      if (whiteEndingGame || blackEndingGame) {
        safeAck(ack, {
          success: false,
          error: "Waiting for previous game to finish.",
        });
        return;
      }
      const whiteBlockingGame =
        whiteActiveGameId &&
        whiteActiveGameId !== gameId &&
        games.has(whiteActiveGameId) &&
        !games.get(whiteActiveGameId)?.isEnding;
      const blackBlockingGame =
        blackActiveGameId &&
        blackActiveGameId !== gameId &&
        games.has(blackActiveGameId) &&
        !games.get(blackActiveGameId)?.isEnding;
      if (whiteActiveGameId && whiteActiveGameId !== gameId && !whiteBlockingGame) {
        clearUserActiveGame(whiteUserId, whiteActiveGameId);
      }
      if (blackActiveGameId && blackActiveGameId !== gameId && !blackBlockingGame) {
        clearUserActiveGame(blackUserId, blackActiveGameId);
      }
      if (whiteBlockingGame || blackBlockingGame) {
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
        const tournamentVariant = normalizeVariant(tournament.gameType);
        const ratingPool = getRatingPoolForTimeControl(
          socketTimeControl,
          tournamentVariant,
        );
        const isRatedTournamentGame =
          tournament?.rated === true &&
          tournamentVariant !== "chess960" &&
          !!ratingPool;
        let whiteRating = null;
        let blackRating = null;
        if (isRatedTournamentGame && ratingPool) {
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
          variant: tournamentVariant,
          mode: "tournament",
          isRated: isRatedTournamentGame,
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
      scheduleGameTimeoutTimer(gameId);
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
        initialFen:
          String(game?.initialFen || game?.chess?.fen?.() || "start").trim() || "start",
        moves: getClassicGameMoves(game),
        chatMessages: getClassicChatMessages(game),
        ...clockSnapshot,
        whiteTimeLeft: clockSnapshot.white,
        blackTimeLeft: clockSnapshot.black,
        playerClock:
          userColor === "w" ? clockSnapshot.white : clockSnapshot.black,
        opponentClock:
          userColor === "w" ? clockSnapshot.black : clockSnapshot.white,
        clockPaused: false,
      });
      if (opponentSocket?.id) {
        io.to(opponentSocket.id).emit("opponent_reconnected", {
          gameId,
          color: userColor,
        });
      }
      emitPendingDrawOfferForSocket(game, userColor, socket.id);

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

  socket.on("findMatch", async ({ name, timeControl, variant } = {}, ack) => {
    if (socket.data.gameId || socket.data.fourPlayerGameId) {
      safeAck(ack, {
        success: true,
        matched: false,
        reason: "active_game_in_progress",
      });
      return;
    }
    const currentUserId = normalizeId(socket.data.userId);
    if (!currentUserId) {
      socket.emit("moveRejected", { reason: "Not authenticated." });
      safeAck(ack, {
        success: false,
        matched: false,
        reason: "not_authenticated",
      });
      return;
    }
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
      safeAck(ack, {
        success: true,
        matched: false,
        reason: "active_game_in_progress",
      });
      return;
    }
    const activeGameId = userActiveGames.get(currentUserId);
    if (activeGameId) {
      if (games.has(activeGameId)) {
        socket.emit("moveRejected", {
          reason: "You already have an active game. Rejoin it first.",
        });
        safeAck(ack, {
          success: true,
          matched: false,
          reason: "active_game_in_progress",
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
      safeAck(ack, {
        success: true,
        matched: false,
        reason: "active_game_in_progress",
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
    let selectedEntry = null;
    const blockCache = { pairs: new Map(), profiles: new Map() };
    if (isRandomQueue) {
      for (let i = 0; i < queue.length; i += 1) {
        const candidateEntry = queue[i];
        if (!candidateEntry || candidateEntry.socketId === socket.id) continue;
        const candidateSocket = io.sockets.sockets.get(candidateEntry.socketId);
        if (!candidateSocket) continue;
        if (await areSocketUsersBlocked(socket, candidateSocket, blockCache)) continue;
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
        if (await areSocketUsersBlocked(socket, candidateSocket, blockCache)) continue;

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
      selectedEntry = selected || null;
      waitingQueues.set(queueKey, queue);
      opponentSocket = io.sockets.sockets.get(selected.socketId);
      selectedOpponentRating = normalizeLiveRating(selected?.rating);
    }

    if (opponentSocket) {
      const finalBlockCache = { pairs: new Map(), profiles: new Map() };
      if (await areSocketUsersBlocked(socket, opponentSocket, finalBlockCache)) {
        if (
          selectedEntry &&
          !queue.some((entry) => entry.socketId === selectedEntry.socketId)
        ) {
          queue.push(selectedEntry);
          waitingQueues.set(queueKey, queue);
        }
        opponentSocket = null;
      }
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
      safeAck(ack, { success: true, matched: true, gameId });
    } else {
      if (!queue.some((entry) => entry.socketId === socket.id)) {
        queue.push({
          socketId: socket.id,
          rating: seekerRating,
          joinedAt: now,
          pool,
          userId: seekerUserId,
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
      safeAck(ack, {
        success: true,
        matched: false,
        reason: "no_eligible_opponents",
      });
    }
  });

  socket.on("findFourPlayerMatch", async ({ name, timeControl } = {}) => {
    if (socket.data.gameId || socket.data.fourPlayerGameId) return;
    if (socket.data.inFourPlayerQueue) return;
    const userId = normalizeId(socket.data.userId);
    if (!userId) {
      socket.emit("fourPlayerMoveRejected", { reason: "Not authenticated." });
      return;
    }
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

    const selectedSocketIds = [];
    const blockCache = { pairs: new Map(), profiles: new Map() };

    for (const queuedId of validQueue) {
      const candidateSocket = io.sockets.sockets.get(queuedId);
      if (!candidateSocket) continue;

      let canJoinGroup = true;
      for (const selectedSocketId of selectedSocketIds) {
        const selectedSocket = io.sockets.sockets.get(selectedSocketId);
        if (!selectedSocket) {
          canJoinGroup = false;
          break;
        }
        if (
          await areSocketUsersBlocked(candidateSocket, selectedSocket, blockCache)
        ) {
          canJoinGroup = false;
          break;
        }
      }

      if (!canJoinGroup) continue;
      selectedSocketIds.push(queuedId);
      if (selectedSocketIds.length >= 4) break;
    }

    if (selectedSocketIds.length < 4) {
      fourPlayerQueues.set(queueKey, validQueue);
      queueFourPlayerStatus(socket, queueKey);
      return;
    }

    const selectedSocketIdSet = new Set(selectedSocketIds);
    const remaining = validQueue.filter((queuedId) => !selectedSocketIdSet.has(queuedId));
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
      chatMessages: [],
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
        chatMessages: getFourPlayerChatMessages(game),
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
    clearEliminatedFourPlayerParticipants(game);
    emitFourPlayerState(game, {
      lastMove: result.move,
      moverColor,
    });
    maybeFinishFourPlayerGame(game, "elimination");
  });

  socket.on("fourPlayerChatMessage", (payload = {}) => {
    const resolvedGameId = String(
      payload.gameId || socket.data.fourPlayerGameId || "",
    ).trim();
    if (!resolvedGameId) return;
    const game = fourPlayerGames.get(resolvedGameId);
    if (!game) return;

    const senderColor = game.socketToColor[socket.id];
    if (!senderColor) return;

    const authenticatedSenderId = normalizeId(socket.data.userId);
    if (!authenticatedSenderId) return;

    const requestedSenderId = normalizeId(payload.senderId);
    if (requestedSenderId && requestedSenderId !== authenticatedSenderId) {
      return;
    }

    const rawMessage = String(payload.message || "").trim();
    if (!rawMessage) return;

    const senderUsername = String(
      payload.senderUsername ||
        game.playersByColor?.[senderColor]?.name ||
        socket.data.name ||
        "Player",
    )
      .trim()
      .slice(0, 60);
    if (!senderUsername) return;

    const chatPayload = appendFourPlayerChatMessage(game, {
      gameId: resolvedGameId,
      senderId: authenticatedSenderId,
      senderUsername,
      message: rawMessage.slice(0, 500),
      timestamp: payload.timestamp || new Date().toISOString(),
    });
    if (!chatPayload) return;

    io.to(game.room).emit("fourPlayerChatMessage", chatPayload);
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
        chatMessages: getFourPlayerChatMessages(game),
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

      if (await areUsersBlocked(fromUserId, toUserId)) {
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
        moveCount: 0,
        clockState: createInitialClockState(normalizedTimeControl, Date.now(), {
          activeColor: "w",
          moveCount: 0,
          running: true,
        }),
        disconnectGraceTimers: { w: null, b: null },
        disconnectedAt: { w: null, b: null },
        reconnectGraceMs: getReconnectGraceMsForTimeControl(normalizedTimeControl),
        startedAt: new Date(),
        persistedMoves: [],
        chatMessages: [],
        timeoutTimer: null,
        ratingByColor: {
          white: whiteSocketId === challengerSocket.id ? challengerRating : receiverRating,
          black: blackSocketId === challengerSocket.id ? challengerRating : receiverRating,
        },
      });
      scheduleFirstMoveAbortTimer(gameId);
      scheduleGameTimeoutTimer(gameId);

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
      const createdGame = games.get(gameId);
      const initialClock = getClockSnapshot(createdGame);

      const challengerPayload = {
        challengeId,
        gameId,
        color: challengerColor,
        fen: chess.fen(),
        initialFen: chess.fen(),
        opponentUserId: challenge.toUserId,
        opponentName: challenge.toName || receiverSocket.data.name || "Friend",
        timeControl: normalizedTimeControl,
        gameType: challenge.gameType,
        variant: normalizedVariant,
        whiteCheckCount: 0,
        blackCheckCount: 0,
        whiteTimeLeft: initialClock.white,
        blackTimeLeft: initialClock.black,
        playerClock: challengerColor === "w" ? initialClock.white : initialClock.black,
        opponentClock: challengerColor === "w" ? initialClock.black : initialClock.white,
        clockPaused: false,
        rated: ratedForDisplay,
        playerRating: challengerRating,
        opponentRating: receiverRating,
      };

      const receiverPayload = {
        challengeId,
        gameId,
        color: receiverColor,
        fen: chess.fen(),
        initialFen: chess.fen(),
        opponentUserId: challenge.fromUserId,
        opponentName:
          challenge.fromName || challengerSocket.data.name || "Friend",
        timeControl: normalizedTimeControl,
        gameType: challenge.gameType,
        variant: normalizedVariant,
        whiteCheckCount: 0,
        blackCheckCount: 0,
        whiteTimeLeft: initialClock.white,
        blackTimeLeft: initialClock.black,
        playerClock: receiverColor === "w" ? initialClock.white : initialClock.black,
        opponentClock: receiverColor === "w" ? initialClock.black : initialClock.white,
        clockPaused: false,
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
    let chess = game.chess;
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
        clearFirstMoveAbortTimer(game);
      }
      const postMoveClock = applyMoveClockTransition(
        game,
        moverColor,
        nextChess.turn(),
        preMoveClock,
      );
      scheduleGameTimeoutTimer(gameId);
      setClassicGameMoves(game, [
        ...getClassicGameMoves(game),
        String(castlingResult.move?.san || "").trim(),
      ]);
      appendClassicFen(game, nextChess.fen());
      declineDrawOfferForMove(gameId, moverColor);
      void persistClassicGameSession(gameId, { status: "active" });
      const threeCheckResult = applyThreeCheckAfterMove(game, moverColor);
      const kingOfHillResult = applyKingOfHillAfterMove(
        game,
        moverColor,
        castlingResult.move,
      );
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
        emitGameOver(
          gameId,
          "king_of_the_hill",
          kingOfHillResult.winner || moverColor,
        );
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

    let move = chess.move({
      from,
      to,
      promotion: promotion || "q",
    });

    if (!move) {
      const kingOfHillArrival = tryApplyKingOfHillArrivalMove(
        game,
        moverColor,
        from,
        to,
      );
      if (!kingOfHillArrival.success) {
        return socket.emit("moveRejected", { reason: "Illegal move" });
      }
      chess = kingOfHillArrival.chess;
      move = kingOfHillArrival.move;
    }

    if (pliesBeforeMove === 0) {
      game.firstMoveAt = Date.now();
      clearFirstMoveAbortTimer(game);
    }
    const postMoveClock = applyMoveClockTransition(
      game,
      moverColor,
      chess.turn(),
      preMoveClock,
    );
    scheduleGameTimeoutTimer(gameId);
    setClassicGameMoves(game, [
      ...getClassicGameMoves(game),
      String(move?.san || "").trim(),
    ]);
    appendClassicFen(game, chess.fen());
    declineDrawOfferForMove(gameId, moverColor);
    void persistClassicGameSession(gameId, { status: "active" });

    updateChess960RightsForNormalMove(game, move, moverColor);

    if (isAtomic) {
      if (move.captured) {
        applyAtomicExplosion(chess, move);
      }
      const atomicWinner = getAtomicExplosionWinner(chess, moverColor);

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

      if (atomicWinner) {
        emitGameOver(gameId, "atomic_explosion", atomicWinner);
        return;
      }

      return;
    }

    const threeCheckResult = applyThreeCheckAfterMove(game, moverColor);
    const kingOfHillResult = applyKingOfHillAfterMove(game, moverColor, move);

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
      emitGameOver(
        gameId,
        "king_of_the_hill",
        kingOfHillResult.winner || moverColor,
      );
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

  socket.on("offerDraw", ({ gameId } = {}, ack) => {
    const normalizedGameId = String(gameId || socket.data.gameId || "").trim();
    const game = games.get(normalizedGameId);
    if (!game) {
      safeAck(ack, { success: false, error: "Active game not found." });
      return;
    }

    const offeredBy = getClassicColorForSocket(game, socket.id);
    if (!offeredBy) {
      safeAck(ack, { success: false, error: "You are not a player in this game." });
      return;
    }
    if (game.drawOffer?.by === offeredBy) {
      safeAck(ack, { success: true, status: "pending" });
      return;
    }
    if (game.drawOffer?.by && game.drawOffer.by !== offeredBy) {
      safeAck(ack, {
        success: false,
        error: "Respond to the existing draw offer first.",
      });
      return;
    }

    clearDrawOffer(game);
    const expiresAt = Date.now() + DRAW_OFFER_TIMEOUT_MS;
    game.drawOffer = { by: offeredBy, expiresAt };
    game.drawOfferTimer = setTimeout(
      () => expireDrawOffer(normalizedGameId),
      DRAW_OFFER_TIMEOUT_MS,
    );

    const opponentColor = offeredBy === "w" ? "b" : "w";
    io.to(socket.id).emit("drawOfferPending", {
      gameId: normalizedGameId,
      offeredBy,
      expiresAt,
    });
    const deliveredCount = emitClassicColorEvent(
      game,
      opponentColor,
      "drawOfferReceived",
      {
        gameId: normalizedGameId,
        offeredBy,
        expiresAt,
      },
      { excludeSocketId: socket.id },
    );
    safeAck(ack, {
      success: true,
      status: "pending",
      expiresAt,
      delivered: deliveredCount > 0,
    });
  });

  socket.on("respondDrawOffer", ({ gameId, accept } = {}, ack) => {
    const normalizedGameId = String(gameId || socket.data.gameId || "").trim();
    const game = games.get(normalizedGameId);
    if (!game) {
      safeAck(ack, { success: false, error: "Active game not found." });
      return;
    }

    const responderColor = getClassicColorForSocket(game, socket.id);
    if (!responderColor) {
      safeAck(ack, { success: false, error: "You are not a player in this game." });
      return;
    }

    const offer = game.drawOffer;
    if (!offer?.by || offer.by === responderColor) {
      safeAck(ack, { success: false, error: "No draw offer to respond to." });
      return;
    }

    clearDrawOffer(game);
    if (accept === true) {
      io.to(game.room).emit("drawOfferAccepted", {
        gameId: normalizedGameId,
        acceptedBy: responderColor,
      });
      safeAck(ack, { success: true, status: "accepted" });
      void emitGameOver(normalizedGameId, "draw", null, {
        preserveEarlyResult: true,
      });
      return;
    }

    io.to(game.room).emit("drawOfferDeclined", {
      gameId: normalizedGameId,
      declinedBy: responderColor,
      reason: "declined",
    });
    safeAck(ack, { success: true, status: "declined" });
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
    emitGameOver(gameId || socket.data.gameId, "resign", winner, {
      preserveEarlyResult: true,
    });
  });

  socket.on("timeout", ({ gameId } = {}) => {
    const normalizedGameId = gameId || socket.data.gameId;
    const game = games.get(normalizedGameId);
    if (!game) return;
    const requesterColor =
      socket.id === game.players.white
        ? "w"
        : socket.id === game.players.black
          ? "b"
          : null;
    if (!requesterColor) return;

    const clock = getClockSnapshot(game);
    const activeColor = clock.activeColor === "b" ? "b" : "w";
    const remaining =
      activeColor === "w" ? Number(clock.white || 0) : Number(clock.black || 0);
    if (requesterColor !== activeColor || remaining > 0) {
      socket.emit("game_state_restored", {
        gameId: normalizedGameId,
        color: requesterColor,
        fen: game.chess.fen(),
        initialFen:
          String(game?.initialFen || game?.chess?.fen?.() || "start").trim() || "start",
        moves: getClassicGameMoves(game),
        chatMessages: getClassicChatMessages(game),
        ...clock,
        whiteTimeLeft: clock.white,
        blackTimeLeft: clock.black,
        playerClock:
          requesterColor === "w" ? clock.white : clock.black,
        opponentClock:
          requesterColor === "w" ? clock.black : clock.white,
        clockPaused: false,
      });
      return;
    }

    const winner = activeColor === "w" ? "b" : "w";
    emitGameOver(normalizedGameId, "timeout", winner, {
      preserveEarlyResult: true,
    });
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
    emitGameOver(gameId || socket.data.gameId, "resign", winner, {
      preserveEarlyResult: true,
    });
  });

  socket.on("chatMessage", (payload = {}) => {
    const normalizedMatchId = String(
      payload.matchId || payload.gameId || socket.data.gameId || "",
    ).trim();
    if (!normalizedMatchId) return;

    const game = games.get(normalizedMatchId);
    if (!game) return;

    const authenticatedSenderId = normalizeId(socket.data.userId);
    if (!authenticatedSenderId) return;

    const senderColor =
      getClassicColorForSocket(game, socket.id) ||
      getClassicColorForUser(game, authenticatedSenderId);
    if (!senderColor) return;

    const requestedSenderId = normalizeId(payload.senderId);
    if (requestedSenderId && requestedSenderId !== authenticatedSenderId) {
      return;
    }

    const rawMessage = String(payload.message || "").trim();
    if (!rawMessage) return;
    const message = rawMessage.slice(0, 500);

    const senderKey = senderColor === "w" ? "white" : "black";
    const senderUsername = String(
      payload.senderUsername ||
        socket.data.name ||
        game?.playerNames?.[senderKey] ||
        "Player",
    )
      .trim()
      .slice(0, 60);
    const parsedTimestamp = new Date(payload.timestamp || "");
    const timestamp = Number.isFinite(parsedTimestamp.getTime())
      ? parsedTimestamp.toISOString()
      : new Date().toISOString();

    const chatPayload = appendClassicChatMessage(game, {
      matchId: normalizedMatchId,
      senderId: authenticatedSenderId,
      senderUsername: senderUsername || "Player",
      message,
      timestamp,
    });
    if (!chatPayload) return;

    emitClassicColorEvent(game, senderColor, "chatMessage", chatPayload);
    emitClassicColorEvent(
      game,
      senderColor === "w" ? "b" : "w",
      "chatMessage",
      chatPayload,
    );
  });

  socket.on("disconnect", () => {
    socket.data.inQueue = false;
    socket.data.queueKey = null;
    socket.data.inFourPlayerQueue = false;
    socket.data.fourPlayerQueueKey = null;
    removeFromQueues(socket.id);
    removeFromFourPlayerQueues(socket.id);
    removeSpectatorSocketFromAllGames(socket.id);

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
            "Opponent disconnected. Their clock is still running.",
            waitingColor,
          );
          scheduleReconnectGraceTimer(gameId, disconnectedColor);
        }
      }
    }
  });
});

function startHttpServer() {
  server.listen(PORT, () => {
    console.log(`[server] running on port ${PORT}`);
    console.log(`[server] allowed origins: ${allowedOrigins.join(", ")}`);
  });
}

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
    process.exit(1);
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
