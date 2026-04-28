import { Router } from "express";
import mongoose from "mongoose";
import { adminAuthMiddleware } from "../middleware/index.js";
import {
  Tournament,
  TournamentEloEvent,
  TournamentGame,
  TournamentPlayer,
  TournamentStandingSnapshot,
  TournamentTransitionLog,
  User,
} from "../models/index.js";
import {
  buildTournamentDetail,
  completeTournament,
  computeAndPersistPlayerStats,
  ensureTournamentState,
  generateAndPublishPairings,
  logStateTransition,
  parseTemplatePayload,
  publishPairings,
  toRoundPairingPayload,
  withMongoTransaction,
} from "../controllers/tournamentControllerV2.js";
import {
  canApplyTournamentAction,
  normalizeTournamentState,
  resolveTournamentNextState,
  TOURNAMENT_STATES,
} from "../modules/tournaments/stateMachine.js";
import {
  emitPairingsPublished,
  emitRoundBoardAssignments,
  emitRoundClosed,
  emitStandingsUpdated,
  emitTournamentFinished,
  emitTournamentStateChanged,
} from "../modules/realtime/tournamentRealtime.js";
import {
  checkTournamentStartCondition,
  processArenaStartOutcomeEvents,
  resolveTournamentFinal,
} from "../services/arenaPairingRuntime.js";

const router = Router();
const { ObjectId } = mongoose.Types;
const TOURNAMENT_TYPES = new Set(["swiss", "arena"]);

const STATUS_SORT_WEIGHT = Object.freeze({
  LIVE_ROUND: 0,
  REGISTRATION_OPEN: 1,
  ROUND_CLOSED: 2,
  DRAFT: 3,
  CANCELLED: 4,
  FINISHED: 5,
});

function toId(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "_id" in value) {
    return String(value._id || "");
  }
  return String(value);
}

function isValidObjectId(value) {
  return ObjectId.isValid(String(value || ""));
}

function normalizeTournamentType(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw || raw === "all") return "";
  return TOURNAMENT_TYPES.has(raw) ? raw : "";
}

function normalizeStatusFilter(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw || raw === "all") return "";
  if (raw === "open" || raw === "registration_open") {
    return TOURNAMENT_STATES.REGISTRATION_OPEN;
  }
  if (raw === "live") return TOURNAMENT_STATES.LIVE_ROUND;
  if (raw === "pairing_preview") return TOURNAMENT_STATES.LIVE_ROUND;
  if (raw === "round_closed") return TOURNAMENT_STATES.ROUND_CLOSED;
  if (raw === "draft") return TOURNAMENT_STATES.DRAFT;
  if (raw === "cancelled") return TOURNAMENT_STATES.CANCELLED;
  if (raw === "finished") return TOURNAMENT_STATES.FINISHED;
  return "";
}

function normalizeSortMode(value) {
  const raw = String(value || "newest").trim().toLowerCase();
  if (
    raw === "newest" ||
    raw === "oldest" ||
    raw === "most_players" ||
    raw === "live_first" ||
    raw === "name_az"
  ) {
    return raw;
  }
  return "newest";
}

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
}

function canAdminDeleteTournament(state) {
  return (
    state === TOURNAMENT_STATES.DRAFT ||
    state === TOURNAMENT_STATES.REGISTRATION_OPEN
  );
}

function formatTypeLabel(type) {
  if (String(type || "").toLowerCase() === "arena") return "Arena";
  return "Swiss";
}

function parseBoolean(input, fallback = true) {
  if (typeof input === "boolean") return input;
  if (typeof input === "number") return input !== 0;
  const normalized = String(input || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function normalizeGameType(input) {
  const normalized = String(input || "standard").trim().toLowerCase();
  if (normalized === "chess960" || normalized === "960") return "chess960";
  return "standard";
}

function normalizeSetupValue(input) {
  const normalized = String(input || "standard").trim();
  return normalized || "standard";
}

function formatTimeControlLabel(timeControl) {
  if (timeControl?.label) return String(timeControl.label);
  const base = Math.max(
    1,
    Math.round(Number(timeControl?.baseMs || 300000) / 60000),
  );
  const inc = Math.max(
    0,
    Math.round(Number(timeControl?.incMs || 0) / 1000),
  );
  return `${base}+${inc}`;
}

function formatRatingRequirement(tournament) {
  const min =
    Number.isFinite(Number(tournament?.ratingMin)) &&
    Number(tournament.ratingMin) >= 0
      ? Number(tournament.ratingMin)
      : null;
  const max =
    Number.isFinite(Number(tournament?.ratingMax)) &&
    Number(tournament.ratingMax) >= 0
      ? Number(tournament.ratingMax)
      : null;
  if (min === null && max === null) return "None";
  if (min !== null && max !== null) return `${min}-${max}`;
  if (min !== null) return `${min}+`;
  return `<=${max}`;
}

function withAdminDetail(detail) {
  if (!detail?.tournament) return detail;
  return {
    ...detail,
    tournament: {
      ...detail.tournament,
      canManage: true,
      myTournament: true,
    },
  };
}

function getActionActorUserId(tournament) {
  return toId(tournament?.createdBy);
}

function isArenaTournament(tournament) {
  return String(tournament?.type || "").toLowerCase() === "arena";
}

async function getTournamentOrNull(tournamentId) {
  if (!isValidObjectId(tournamentId)) return null;
  return Tournament.findOne({ _id: tournamentId });
}

async function getTournamentOr404(req, res, tournamentId) {
  if (!isValidObjectId(tournamentId)) {
    res.status(400).json({ error: "Invalid tournament id" });
    return null;
  }
  const tournament = await Tournament.findOne({ _id: tournamentId });
  if (!tournament) {
    res.status(404).json({ error: "Tournament not found" });
    return null;
  }
  ensureTournamentState(tournament);
  return tournament;
}

async function ensureOrganizerUser(userId) {
  if (!isValidObjectId(userId)) {
    throw new Error("A valid organizer user is required.");
  }
  const user = await User.findById(userId).select("_id").lean();
  if (!user) {
    throw new Error("Organizer user not found.");
  }
  return String(user._id);
}

function summarizeTournaments(tournaments, playerMap, gameMap) {
  return (tournaments || []).map((tournament) => {
    const id = toId(tournament._id);
    const normalizedStatus = normalizeTournamentState(tournament.status);
    const playerStats = playerMap.get(id) || {
      registeredCount: 0,
      activeCount: 0,
      withdrawnCount: 0,
    };
    const gameStats = gameMap.get(id) || {
      totalGames: 0,
      publishedGames: 0,
      completedGames: 0,
    };
    const organizer =
      tournament?.createdBy &&
      typeof tournament.createdBy === "object" &&
      tournament.createdBy !== null &&
      "_id" in tournament.createdBy
        ? {
            _id: toId(tournament.createdBy._id),
            fullName: String(tournament.createdBy.fullName || ""),
            email: String(tournament.createdBy.email || ""),
            avatar: String(tournament.createdBy.avatar || ""),
          }
        : null;

    return {
      id,
      name: String(tournament.name || ""),
      type: tournament.type || "swiss",
      format: tournament.type || "swiss",
      formatLabel: formatTypeLabel(tournament.type),
      rated: parseBoolean(tournament.rated, true),
      gameType: normalizeGameType(tournament.gameType),
      setup: normalizeSetupValue(tournament.setup),
      pairingLogic: String(tournament.pairingLogic || ""),
      durationMinutes:
        Number.isFinite(Number(tournament.durationMinutes)) &&
        Number(tournament.durationMinutes) > 0
          ? Number(tournament.durationMinutes)
          : null,
      timezone: String(tournament.timezone || ""),
      timeControl: tournament.timeControl || {
        baseMs: 300000,
        incMs: 0,
        label: "5+0",
      },
      timeControlLabel: formatTimeControlLabel(tournament.timeControl),
      ratingMin:
        Number.isFinite(Number(tournament.ratingMin)) &&
        Number(tournament.ratingMin) >= 0
          ? Number(tournament.ratingMin)
          : null,
      ratingMax:
        Number.isFinite(Number(tournament.ratingMax)) &&
        Number(tournament.ratingMax) >= 0
          ? Number(tournament.ratingMax)
          : null,
      ratingFilterMode: String(tournament.ratingFilterMode || "none"),
      ratingRequirement: formatRatingRequirement(tournament),
      status: normalizedStatus,
      roundsPlanned: Number(tournament.roundsPlanned || 1),
      currentRound: Number(tournament.currentRound || 0),
      latestPublishedRound: Number(tournament.latestPublishedRound || 0),
      minPlayers: Number(tournament.minPlayers || 2),
      maxPlayers:
        Number.isFinite(Number(tournament.maxPlayers)) &&
        Number(tournament.maxPlayers) > 0
          ? Number(tournament.maxPlayers)
          : null,
      registeredCount: Number(playerStats.registeredCount || 0),
      activeCount: Number(playerStats.activeCount || 0),
      withdrawnCount: Number(playerStats.withdrawnCount || 0),
      totalGames: Number(gameStats.totalGames || 0),
      publishedGames: Number(gameStats.publishedGames || 0),
      completedGames: Number(gameStats.completedGames || 0),
      organizer,
      registrationDeadline: tournament.registrationDeadline || null,
      startType: String(tournament.startType || "manual"),
      scheduledStartAt: tournament.scheduledStartAt || null,
      description: String(tournament.description || ""),
      startedAt: tournament.startedAt || null,
      finishedAt: tournament.finishedAt || null,
      createdAt: tournament.createdAt || null,
      updatedAt: tournament.updatedAt || null,
      championUserId: toId(tournament.championUserId),
    };
  });
}

function filterTournamentSummary(summary, search, typeFilter, statusFilter) {
  if (typeFilter && summary.type !== typeFilter) return false;
  if (statusFilter && summary.status !== statusFilter) return false;
  if (!search) return true;

  const haystack = [
    summary.name,
    summary.description,
    summary.formatLabel,
    summary.status,
    summary.timeControlLabel,
    summary.ratingRequirement,
    summary.organizer?.fullName,
    summary.organizer?.email,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

  return haystack.includes(search);
}

function sortTournaments(summaries, sortMode) {
  const rows = [...summaries];
  rows.sort((left, right) => {
    if (sortMode === "oldest") {
      return (
        new Date(left.createdAt || 0).getTime() -
        new Date(right.createdAt || 0).getTime()
      );
    }
    if (sortMode === "most_players") {
      if (right.registeredCount !== left.registeredCount) {
        return right.registeredCount - left.registeredCount;
      }
      return (
        new Date(right.createdAt || 0).getTime() -
        new Date(left.createdAt || 0).getTime()
      );
    }
    if (sortMode === "live_first") {
      const leftWeight = STATUS_SORT_WEIGHT[left.status] ?? 99;
      const rightWeight = STATUS_SORT_WEIGHT[right.status] ?? 99;
      if (leftWeight !== rightWeight) return leftWeight - rightWeight;
      return (
        new Date(right.createdAt || 0).getTime() -
        new Date(left.createdAt || 0).getTime()
      );
    }
    if (sortMode === "name_az") {
      return String(left.name || "").localeCompare(String(right.name || ""));
    }
    return (
      new Date(right.createdAt || 0).getTime() -
      new Date(left.createdAt || 0).getTime()
    );
  });
  return rows;
}

router.get("/", adminAuthMiddleware, async (req, res) => {
  try {
    const search = String(req.query.search || "").trim().toLowerCase();
    const typeFilter = normalizeTournamentType(req.query.type || req.query.format);
    const statusFilter = normalizeStatusFilter(req.query.status);
    const sortMode = normalizeSortMode(req.query.sort);
    const limit = Math.min(24, Math.max(1, parsePositiveInt(req.query.limit, 12)));
    const requestedPage = Math.max(1, parsePositiveInt(req.query.page, 1));

    const query = {};
    if (typeFilter) query.type = typeFilter;

    const tournaments = await Tournament.find(query)
      .populate("createdBy", "fullName email avatar")
      .sort({ createdAt: -1 })
      .lean();

    const tournamentIds = tournaments.map((tournament) => tournament._id);
    const [playerAgg, gameAgg] = await Promise.all([
      tournamentIds.length
        ? TournamentPlayer.aggregate([
            {
              $match: {
                tournamentId: { $in: tournamentIds },
              },
            },
            {
              $group: {
                _id: "$tournamentId",
                registeredCount: { $sum: 1 },
                activeCount: {
                  $sum: {
                    $cond: [{ $eq: ["$status", "active"] }, 1, 0],
                  },
                },
                withdrawnCount: {
                  $sum: {
                    $cond: [{ $eq: ["$status", "withdrawn"] }, 1, 0],
                  },
                },
              },
            },
          ])
        : [],
      tournamentIds.length
        ? TournamentGame.aggregate([
            {
              $match: {
                tournamentId: { $in: tournamentIds },
              },
            },
            {
              $group: {
                _id: "$tournamentId",
                totalGames: { $sum: 1 },
                publishedGames: {
                  $sum: {
                    $cond: ["$isPublished", 1, 0],
                  },
                },
                completedGames: {
                  $sum: {
                    $cond: [{ $ne: ["$result", "*"] }, 1, 0],
                  },
                },
              },
            },
          ])
        : [],
    ]);

    const playerMap = new Map(
      (playerAgg || []).map((row) => [
        toId(row._id),
        {
          registeredCount: Number(row.registeredCount || 0),
          activeCount: Number(row.activeCount || 0),
          withdrawnCount: Number(row.withdrawnCount || 0),
        },
      ]),
    );
    const gameMap = new Map(
      (gameAgg || []).map((row) => [
        toId(row._id),
        {
          totalGames: Number(row.totalGames || 0),
          publishedGames: Number(row.publishedGames || 0),
          completedGames: Number(row.completedGames || 0),
        },
      ]),
    );

    const summaries = summarizeTournaments(tournaments, playerMap, gameMap);
    const filtered = sortTournaments(
      summaries.filter((summary) =>
        filterTournamentSummary(summary, search, typeFilter, statusFilter),
      ),
      sortMode,
    );
    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(requestedPage, pages);
    const offset = (page - 1) * limit;
    const paged = filtered.slice(offset, offset + limit);

    const stats = summaries.reduce(
      (accumulator, tournament) => {
        accumulator.total += 1;
        accumulator.totalPlayers += tournament.activeCount;
        accumulator.totalGames += tournament.totalGames;
        if (tournament.status === TOURNAMENT_STATES.DRAFT) accumulator.draft += 1;
        if (tournament.status === TOURNAMENT_STATES.REGISTRATION_OPEN) {
          accumulator.registrationOpen += 1;
        }
        if (tournament.status === TOURNAMENT_STATES.LIVE_ROUND) {
          accumulator.live += 1;
        }
        if (tournament.status === TOURNAMENT_STATES.ROUND_CLOSED) {
          accumulator.roundClosed += 1;
        }
        if (tournament.status === TOURNAMENT_STATES.CANCELLED) {
          accumulator.cancelled += 1;
        }
        if (tournament.status === TOURNAMENT_STATES.FINISHED) {
          accumulator.finished += 1;
        }
        return accumulator;
      },
      {
        total: 0,
        draft: 0,
        registrationOpen: 0,
        live: 0,
        roundClosed: 0,
        cancelled: 0,
        finished: 0,
        totalPlayers: 0,
        totalGames: 0,
      },
    );

    res.json({
      tournaments: paged,
      stats: {
        ...stats,
        active: stats.registrationOpen + stats.live + stats.roundClosed,
      },
      pagination: {
        page,
        limit,
        total,
        pages,
      },
    });
  } catch (error) {
    console.error("Admin get tournaments error:", error);
    res.status(500).json({ error: "Failed to fetch tournaments" });
  }
});

router.get("/:id", adminAuthMiddleware, async (req, res) => {
  try {
    const tournament = await getTournamentOr404(req, res, req.params.id);
    if (!tournament) return;

    const detail = await buildTournamentDetail(
      tournament,
      getActionActorUserId(tournament),
    );

    res.json(withAdminDetail(detail));
  } catch (error) {
    console.error("Admin get tournament detail error:", error);
    res.status(500).json({ error: "Failed to fetch tournament detail" });
  }
});

router.post("/", adminAuthMiddleware, async (req, res) => {
  try {
    const organizerUserId = await ensureOrganizerUser(req.body?.organizerUserId);
    const parsed = await parseTemplatePayload(req.body || {});
    const roundsPlanned =
      parsed.type === "swiss" ? Number(parsed.roundsPlanned || 1) : 1;

    const tournament = await Tournament.create({
      name: parsed.name,
      type: parsed.type,
      rated: parsed.rated,
      gameType: parsed.gameType,
      setup: parsed.setup,
      pairingLogic: parsed.pairingLogic,
      durationMinutes: parsed.durationMinutes,
      timezone: parsed.timezone,
      timeControl: parsed.timeControl,
      ratingMin: parsed.ratingMin,
      ratingMax: parsed.ratingMax,
      ratingFilterMode: parsed.ratingFilterMode,
      status: TOURNAMENT_STATES.DRAFT,
      roundsPlanned,
      currentRound: 0,
      latestPublishedRound: 0,
      minPlayers: parsed.minPlayers,
      maxPlayers: parsed.maxPlayers,
      registrationDeadline: parsed.registrationDeadline,
      startType: parsed.startType,
      scheduledStartAt: parsed.scheduledStartAt,
      description: parsed.description,
      createdBy: organizerUserId,
      managerIds: [],
    });

    const detail = await buildTournamentDetail(tournament, organizerUserId);
    res.status(201).json({ success: true, ...withAdminDetail(detail) });
  } catch (error) {
    console.error("Admin create tournament error:", error);
    res.status(400).json({
      error: error?.message || "Failed to create tournament",
    });
  }
});

router.put("/:id", adminAuthMiddleware, async (req, res) => {
  try {
    const tournament = await getTournamentOr404(req, res, req.params.id);
    if (!tournament) return;

    const state = normalizeTournamentState(tournament.status);
    if (state !== TOURNAMENT_STATES.DRAFT) {
      return res.status(400).json({
        error: "Only draft tournaments can be edited from admin.",
      });
    }

    const organizerUserId = await ensureOrganizerUser(
      req.body?.organizerUserId || tournament.createdBy,
    );
    const parsed = await parseTemplatePayload(req.body || {});
    const roundsPlanned =
      parsed.type === "swiss" ? Number(parsed.roundsPlanned || 1) : 1;

    await Tournament.updateOne(
      { _id: tournament._id },
      {
        $set: {
          name: parsed.name,
          type: parsed.type,
          rated: parsed.rated,
          gameType: parsed.gameType,
          setup: parsed.setup,
          pairingLogic: parsed.pairingLogic,
          durationMinutes: parsed.durationMinutes,
          timezone: parsed.timezone,
          timeControl: parsed.timeControl,
          ratingMin: parsed.ratingMin,
          ratingMax: parsed.ratingMax,
          ratingFilterMode: parsed.ratingFilterMode,
          roundsPlanned,
          minPlayers: parsed.minPlayers,
          maxPlayers: parsed.maxPlayers,
          registrationDeadline: parsed.registrationDeadline,
          startType: parsed.startType,
          scheduledStartAt: parsed.scheduledStartAt,
          description: parsed.description,
          createdBy: organizerUserId,
        },
      },
    );

    const refreshed = await getTournamentOrNull(tournament._id);
    const detail = await buildTournamentDetail(refreshed, organizerUserId);
    res.json({ success: true, ...withAdminDetail(detail) });
  } catch (error) {
    console.error("Admin update tournament error:", error);
    res.status(400).json({
      error: error?.message || "Failed to update tournament",
    });
  }
});

router.patch("/:id/state", adminAuthMiddleware, async (req, res) => {
  try {
    const tournament = await getTournamentOr404(req, res, req.params.id);
    if (!tournament) return;

    const actorUserId = getActionActorUserId(tournament);
    if (!isValidObjectId(actorUserId)) {
      return res.status(400).json({
        error: "Tournament organizer is invalid.",
      });
    }

    const action = String(req.body?.action || "").trim().toLowerCase();
    if (!action) {
      return res.status(400).json({ error: "Action is required" });
    }

    if (action === "open_registration") {
      const state = normalizeTournamentState(tournament.status);
      if (state === TOURNAMENT_STATES.REGISTRATION_OPEN) {
        const detail = await buildTournamentDetail(tournament, actorUserId);
        return res.json({ success: true, ...withAdminDetail(detail) });
      }
      if (!canApplyTournamentAction(state, action)) {
        return res.status(400).json({ error: "Invalid state transition." });
      }
      const nextState = resolveTournamentNextState(state, action);
      await Tournament.updateOne(
        { _id: tournament._id },
        { $set: { status: nextState }, $inc: { stateVersion: 1 } },
      );
      await logStateTransition({
        tournamentId: tournament._id,
        fromState: state,
        toState: nextState,
        action,
        actorUserId,
      });
      const refreshed = await getTournamentOrNull(tournament._id);
      emitTournamentStateChanged(req.app, refreshed, nextState);
      const detail = await buildTournamentDetail(refreshed, actorUserId);
      return res.json({ success: true, ...withAdminDetail(detail) });
    }

    if (
      isArenaTournament(tournament) &&
      (action === "close_registration" || action === "next_round")
    ) {
      const outcome = await withMongoTransaction((session) =>
        checkTournamentStartCondition(tournament._id, {
          session,
          actorUserId,
          now: new Date(),
        }),
      );

      await processArenaStartOutcomeEvents(req.app, outcome);
      const refreshed = await getTournamentOrNull(tournament._id);
      const detail = await buildTournamentDetail(refreshed, actorUserId);
      return res.json({ success: true, ...withAdminDetail(detail) });
    }

    if (action === "close_registration" || action === "next_round") {
      const out = await withMongoTransaction(async (session) => {
        const doc = await Tournament.findById(tournament._id).session(session);
        const result = await generateAndPublishPairings({
          tournament: doc,
          actorUserId,
          forceRegenerate: false,
          session,
        });
        const refreshed = await Tournament.findById(tournament._id).session(session);
        await computeAndPersistPlayerStats(refreshed, session);
        const detail = await buildTournamentDetail(refreshed, actorUserId);
        return { detail, refreshed, published: result.published };
      });

      const publishedPairings = (out.published || []).map((game) =>
        toRoundPairingPayload(game),
      );
      emitTournamentStateChanged(req.app, out.refreshed, TOURNAMENT_STATES.LIVE_ROUND);
      emitPairingsPublished(
        req.app,
        out.refreshed,
        Number(out.refreshed.currentRound || 0),
        publishedPairings,
      );
      emitRoundBoardAssignments(
        req.app,
        out.refreshed,
        Number(out.refreshed.currentRound || 0),
        publishedPairings,
      );
      emitStandingsUpdated(req.app, out.refreshed, out.detail.standings || []);
      return res.json({ success: true, ...withAdminDetail(out.detail) });
    }

    if (action === "start_round" || action === "publish_pairings") {
      const out = await withMongoTransaction(async (session) => {
        const doc = await Tournament.findById(tournament._id).session(session);
        const result = await publishPairings({
          tournament: doc,
          actorUserId,
          session,
        });
        await computeAndPersistPlayerStats(doc, session);
        const refreshed = await Tournament.findById(tournament._id).session(session);
        const detail = await buildTournamentDetail(refreshed, actorUserId);
        return { detail, refreshed, published: result.published };
      });

      const publishedPairings = (out.published || []).map((game) =>
        toRoundPairingPayload(game),
      );
      emitTournamentStateChanged(req.app, out.refreshed, TOURNAMENT_STATES.LIVE_ROUND);
      emitPairingsPublished(
        req.app,
        out.refreshed,
        Number(out.refreshed.currentRound || 0),
        publishedPairings,
      );
      emitRoundBoardAssignments(
        req.app,
        out.refreshed,
        Number(out.refreshed.currentRound || 0),
        publishedPairings,
      );
      emitStandingsUpdated(req.app, out.refreshed, out.detail.standings || []);
      return res.json({ success: true, ...withAdminDetail(out.detail) });
    }

    if (action === "finish_tournament" && isArenaTournament(tournament)) {
      const out = await withMongoTransaction(async (session) => {
        await resolveTournamentFinal(tournament._id, {
          actorUserId,
          session,
          now: new Date(),
        });
        const refreshed = await Tournament.findById(tournament._id).session(session);
        const detail = await buildTournamentDetail(refreshed, actorUserId);
        return { detail, refreshed };
      });

      emitTournamentStateChanged(req.app, out.refreshed, TOURNAMENT_STATES.FINISHED);
      emitTournamentFinished(
        req.app,
        out.refreshed,
        out.detail.winners?.[0] || null,
        out.detail.winners || [],
        out.detail.standings || [],
      );
      return res.json({ success: true, ...withAdminDetail(out.detail) });
    }

    if (action === "finish_tournament") {
      const out = await withMongoTransaction(async (session) => {
        const doc = await Tournament.findById(tournament._id).session(session);
        await completeTournament({
          tournament: doc,
          actorUserId,
          session,
        });
        const refreshed = await Tournament.findById(tournament._id).session(session);
        const detail = await buildTournamentDetail(refreshed, actorUserId);
        return { detail, refreshed };
      });

      emitTournamentStateChanged(req.app, out.refreshed, TOURNAMENT_STATES.FINISHED);
      emitTournamentFinished(
        req.app,
        out.refreshed,
        out.detail.winners?.[0] || null,
        out.detail.winners || [],
        out.detail.standings || [],
      );
      return res.json({ success: true, ...withAdminDetail(out.detail) });
    }

    return res.status(400).json({ error: "Unsupported action." });
  } catch (error) {
    console.error("Admin tournament state transition error:", error);
    res.status(500).json({
      error: error?.message || "Failed to transition tournament state",
    });
  }
});

router.post("/:id/rounds/:roundId/close", adminAuthMiddleware, async (req, res) => {
  try {
    const tournament = await getTournamentOr404(req, res, req.params.id);
    if (!tournament) return;

    const actorUserId = getActionActorUserId(tournament);
    if (!isValidObjectId(actorUserId)) {
      return res.status(400).json({
        error: "Tournament organizer is invalid.",
      });
    }

    const roundNumber = Number(req.params.roundId || 0);
    if (!Number.isInteger(roundNumber) || roundNumber <= 0) {
      return res.status(400).json({ error: "Invalid round id" });
    }

    const state = ensureTournamentState(tournament);
    if (state !== TOURNAMENT_STATES.LIVE_ROUND) {
      return res.status(400).json({
        error: "Round can only be closed from LIVE_ROUND state.",
      });
    }
    if (roundNumber !== Number(tournament.currentRound || 0)) {
      return res.status(400).json({
        error: "Only the current round can be closed.",
      });
    }

    const pending = await TournamentGame.countDocuments({
      tournamentId: tournament._id,
      roundNumber,
      isPublished: true,
      result: "*",
    });
    if (pending > 0) {
      return res.status(400).json({
        error: "All results must be entered before closing the round.",
      });
    }

    const out = await withMongoTransaction(async (session) => {
      const doc = await Tournament.findById(tournament._id).session(session);
      const standings = await computeAndPersistPlayerStats(doc, session);
      await TournamentStandingSnapshot.findOneAndUpdate(
        {
          tournamentId: doc._id,
          roundNumber,
          isOfficial: true,
        },
        {
          $set: {
            rows: standings.map((row) => ({
              rank: row.rank,
              userId: row.userId,
              score: row.points,
              buchholz: row.buchholz || 0,
              buchholzCut1: row.buchholzCut1 || 0,
              wins: row.wins || 0,
              draws: row.draws || 0,
              losses: row.losses || 0,
              directEncounter: row.directEncounter || 0,
              sonnebornBerger: row.sonnebornBerger || 0,
              koya: row.koya || 0,
              colorBalance: row.colorBalance || 0,
              status: row.status || "active",
            })),
            label: `OFFICIAL - ROUND ${roundNumber} COMPLETE`,
          },
        },
        { upsert: true, new: true, session },
      );

      await Tournament.updateOne(
        { _id: doc._id },
        {
          $set: { status: TOURNAMENT_STATES.ROUND_CLOSED },
          $inc: { stateVersion: 1 },
        },
        { session },
      );

      await logStateTransition({
        session,
        tournamentId: doc._id,
        fromState: state,
        toState: TOURNAMENT_STATES.ROUND_CLOSED,
        action: "close_round",
        actorUserId,
        meta: { roundNumber, performedBy: "admin", adminId: req.admin.adminId },
      });

      const refreshed = await Tournament.findById(doc._id).session(session);
      const detail = await buildTournamentDetail(refreshed, actorUserId);
      return { detail, refreshed };
    });

    emitTournamentStateChanged(req.app, out.refreshed, TOURNAMENT_STATES.ROUND_CLOSED);
    emitRoundClosed(req.app, out.refreshed, roundNumber, out.detail.standings || []);
    emitStandingsUpdated(req.app, out.refreshed, out.detail.standings || []);
    res.json({ success: true, ...withAdminDetail(out.detail) });
  } catch (error) {
    console.error("Admin close round error:", error);
    res.status(500).json({
      error: error?.message || "Failed to close tournament round",
    });
  }
});

router.delete("/:id", adminAuthMiddleware, async (req, res) => {
  try {
    const tournament = await getTournamentOr404(req, res, req.params.id);
    if (!tournament) return;

    const state = normalizeTournamentState(tournament.status);
    if (!canAdminDeleteTournament(state)) {
      return res.status(400).json({
        error:
          "Only tournaments that have not gone live can be deleted from admin.",
      });
    }

    await Promise.all([
      TournamentGame.deleteMany({ tournamentId: tournament._id }),
      TournamentPlayer.deleteMany({ tournamentId: tournament._id }),
      TournamentEloEvent.deleteMany({ tournamentId: tournament._id }),
      TournamentStandingSnapshot.deleteMany({ tournamentId: tournament._id }),
      TournamentTransitionLog.deleteMany({ tournamentId: tournament._id }),
      Tournament.deleteOne({ _id: tournament._id }),
    ]);

    res.json({ success: true, id: toId(tournament._id) });
  } catch (error) {
    console.error("Admin delete tournament error:", error);
    res.status(500).json({ error: "Failed to delete tournament" });
  }
});

export default router;
