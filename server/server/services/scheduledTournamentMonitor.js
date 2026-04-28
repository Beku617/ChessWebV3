import { Tournament, TournamentPlayer } from "../models/index.js";
import {
  computeAndPersistPlayerStats,
  generateAndPublishPairings,
  toRoundPairingPayload,
  withMongoTransaction,
} from "../controllers/tournamentControllerV2.js";
import {
  emitPairingsPublished,
  emitRoundBoardAssignments,
  emitStandingsUpdated,
  emitTournamentFinished,
  emitTournamentStateChanged,
} from "../modules/realtime/tournamentRealtime.js";
import { normalizeTournamentState, TOURNAMENT_STATES } from "../modules/tournaments/stateMachine.js";
import {
  checkTournamentStartCondition,
  processArenaStartOutcomeEvents,
  processLiveArenaTick,
} from "./arenaPairingRuntime.js";
import { notifyUsers } from "./notify.js";

const DEFAULT_MONITOR_INTERVAL_MS = 5 * 1000;

let monitorTimer = null;
let monitorRunning = false;

function toId(value) {
  return value ? String(value) : "";
}

function buildTournamentLink(tournamentId) {
  const normalizedTournamentId = toId(tournamentId);
  if (!normalizedTournamentId) return "/tournaments?tab=current";
  return `/tournaments?selected=${encodeURIComponent(normalizedTournamentId)}&tab=current`;
}

async function getActiveParticipantIds(tournamentId, session = null) {
  let query = TournamentPlayer.find({
    tournamentId,
    status: { $ne: "withdrawn" },
  })
    .select("userId")
    .lean();
  if (session) {
    query = query.session(session);
  }
  const players = await query;
  return [...new Set(players.map((player) => toId(player.userId)).filter(Boolean))];
}

async function notifyTournamentStarted(app, tournament, participantIds) {
  const recipients = Array.isArray(participantIds) ? participantIds.filter(Boolean) : [];
  if (!recipients.length) return;
  await notifyUsers(app, recipients, {
    type: "tournament_started",
    title: "Tournament started",
    message: `${String(tournament?.name || "Tournament")} has started! Join your game.`,
    link: buildTournamentLink(tournament?._id),
    payload: {
      tournamentId: toId(tournament?._id),
      roundNumber: Number(tournament?.currentRound || 1),
    },
  });
}

function canAutoStartFromState(status) {
  const normalized = normalizeTournamentState(status);
  return (
    normalized === TOURNAMENT_STATES.DRAFT ||
    normalized === TOURNAMENT_STATES.REGISTRATION_OPEN
  );
}

function parseScheduledStartMs(tournament) {
  const parsed = new Date(tournament?.scheduledStartAt || 0).getTime();
  return Number.isFinite(parsed) ? parsed : NaN;
}

async function processOneScheduledTournament(app, tournamentId, nowMs) {
  const outcome = await withMongoTransaction(async (session) => {
    const tournament = await Tournament.findById(tournamentId).session(session);
    if (!tournament) {
      return { outcome: "missing" };
    }

    const normalizedState = normalizeTournamentState(tournament.status);
    if (!canAutoStartFromState(normalizedState)) {
      return { outcome: "skipped_state" };
    }

    const scheduledStartMs = parseScheduledStartMs(tournament);
    if (!Number.isFinite(scheduledStartMs) || nowMs < scheduledStartMs) {
      return { outcome: "not_due" };
    }

    const actorUserId = toId(tournament.createdBy);
    if (!actorUserId) {
      return { outcome: "invalid_actor" };
    }

    const startOutcome = await checkTournamentStartCondition(tournament._id, {
      session,
      now: new Date(nowMs),
      actorUserId,
    });
    if (startOutcome.outcome !== "started") {
      return startOutcome;
    }

    if (String(tournament.type || "").toLowerCase() === "arena") {
      return startOutcome;
    }

    const fresh = await Tournament.findById(tournament._id).session(session);
    const publishResult = await generateAndPublishPairings({
      tournament: fresh,
      actorUserId,
      forceRegenerate: false,
      session,
    });
    const afterPublish = await Tournament.findById(tournament._id).session(session);
    await computeAndPersistPlayerStats(afterPublish, session);
    const startedTournament = await Tournament.findById(tournament._id).session(session);
    if (!startedTournament) {
      return { outcome: "missing" };
    }
    const latestParticipantIds = await getActiveParticipantIds(tournament._id, session);
    return {
      outcome: "started",
      tournament: startedTournament.toObject
        ? startedTournament.toObject()
        : startedTournament,
      published: Array.isArray(publishResult?.published) ? publishResult.published : [],
      participantIds: latestParticipantIds,
    };
  });

  if (outcome.outcome === "started" && outcome.tournament) {
    if (String(outcome.tournament.type || "").toLowerCase() === "arena") {
      await processArenaStartOutcomeEvents(app, outcome);
      return;
    }
    const pairings = (outcome.published || []).map((game) => toRoundPairingPayload(game));
    await processArenaStartOutcomeEvents(app, outcome);
    emitPairingsPublished(
      app,
      outcome.tournament,
      Number(outcome.tournament.currentRound || 0),
      pairings,
    );
    emitRoundBoardAssignments(
      app,
      outcome.tournament,
      Number(outcome.tournament.currentRound || 0),
      pairings,
    );
    emitStandingsUpdated(app, outcome.tournament, []);
    await notifyTournamentStarted(app, outcome.tournament, outcome.participantIds || []);
    return;
  }

  if (outcome.outcome === "cancelled" && outcome.tournament) {
    await processArenaStartOutcomeEvents(app, outcome);
  }
}

export async function processDueScheduledTournaments(app, now = new Date()) {
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(nowMs)) return;

  const candidates = await Tournament.find({
    startType: "scheduled",
    scheduledStartAt: { $ne: null, $lte: new Date(nowMs) },
    status: {
      $in: [
        TOURNAMENT_STATES.DRAFT,
        TOURNAMENT_STATES.REGISTRATION_OPEN,
        "draft",
        "registering",
      ],
    },
  })
    .select("_id")
    .sort({ scheduledStartAt: 1 })
    .limit(200)
    .lean();

  for (const candidate of candidates) {
    const tournamentId = toId(candidate?._id);
    if (!tournamentId) continue;
    try {
      await processOneScheduledTournament(app, tournamentId, nowMs);
    } catch (error) {
      console.error("Scheduled tournament monitor error:", error);
    }
  }

  const liveArenaTournaments = await Tournament.find({
    type: "arena",
    status: {
      $in: [TOURNAMENT_STATES.LIVE_ROUND, "running"],
    },
  })
    .select("_id createdBy durationMinutes startedAt status")
    .lean();

  for (const tournament of liveArenaTournaments) {
    const tournamentId = toId(tournament?._id);
    if (!tournamentId) continue;
    try {
      const tickOutcome = await processLiveArenaTick(app, tournament, new Date(nowMs));
      if (tickOutcome?.outcome === "finished" && tickOutcome.tournament) {
        const participantIds = await getActiveParticipantIds(tournamentId);
        if (participantIds.length > 0) {
          await notifyUsers(app, participantIds, {
            type: "tournament_finished",
            title: "Tournament finished",
            message: `${String(
              tickOutcome.tournament?.name || "Tournament",
            )} has finished.`,
            link: buildTournamentLink(tournamentId),
            payload: {
              tournamentId,
            },
          });
        }
        emitTournamentStateChanged(
          app,
          tickOutcome.tournament,
          TOURNAMENT_STATES.FINISHED,
        );
        emitTournamentFinished(
          app,
          tickOutcome.tournament,
          tickOutcome.top3?.[0] || null,
          tickOutcome.top3 || [],
          tickOutcome.standings || [],
        );
      }
    } catch (error) {
      console.error("Arena pairing tick error:", error);
    }
  }
}

export function startScheduledTournamentMonitor(app, options = {}) {
  const intervalMs = Math.max(
    5_000,
    Number(options.intervalMs || DEFAULT_MONITOR_INTERVAL_MS),
  );
  if (monitorTimer) {
    return () => {};
  }

  const run = async () => {
    if (monitorRunning) return;
    monitorRunning = true;
    try {
      await processDueScheduledTournaments(app, new Date());
    } finally {
      monitorRunning = false;
    }
  };

  monitorTimer = setInterval(() => {
    void run();
  }, intervalMs);
  void run();

  return () => {
    if (monitorTimer) {
      clearInterval(monitorTimer);
      monitorTimer = null;
    }
  };
}
