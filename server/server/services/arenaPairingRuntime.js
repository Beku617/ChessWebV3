import crypto from "crypto";
import {
  Tournament,
  TournamentGame,
  TournamentPlayer,
  TournamentTransitionLog,
  User,
} from "../models/index.js";
import {
  TOURNAMENT_STATES,
  normalizeTournamentState,
} from "../modules/tournaments/stateMachine.js";
import {
  emitPairingsPublished,
  emitRoundBoardAssignments,
  emitStandingsUpdated,
  emitTournamentCancelled,
  emitTournamentStateChanged,
} from "../modules/realtime/tournamentRealtime.js";
import { notifyUsers } from "./notify.js";

const MIN_START_PLAYERS = 2;
const ELO_DRIFT_WAIT_TICKS = 1;
const REMATCH_MAX_HOPS = 2;
const ARENA_WIN_POINTS = 2;
const ARENA_DRAW_POINTS = 1;
const ARENA_STREAK_BONUS_POINTS = 4;

function toId(value) {
  return value ? String(value) : "";
}

function withSession(query, session) {
  return session ? query.session(session) : query;
}

function withCreateSessionOptions(session) {
  return session ? { session } : undefined;
}

function playedKey(a, b) {
  const aId = toId(a);
  const bId = toId(b);
  return aId < bId ? `${aId}:${bId}` : `${bId}:${aId}`;
}

function buildTournamentLink(tournamentId) {
  const normalizedTournamentId = toId(tournamentId);
  if (!normalizedTournamentId) return "/tournaments?tab=current";
  return `/tournaments?selected=${encodeURIComponent(normalizedTournamentId)}&tab=current`;
}

function normalizeArenaPairingMode(pairingLogic) {
  const normalized = String(pairingLogic || "")
    .trim()
    .toLowerCase();
  if (
    normalized === "point-based" ||
    normalized === "point_based" ||
    normalized === "points" ||
    normalized === "point"
  ) {
    return "POINT_BASED";
  }
  return "ELO_BASED";
}

function getArenaStartMs(tournament) {
  const startedAtMs = new Date(tournament?.startedAt || 0).getTime();
  if (Number.isFinite(startedAtMs) && startedAtMs > 0) return startedAtMs;

  const scheduledStartAtMs = new Date(tournament?.scheduledStartAt || 0).getTime();
  if (Number.isFinite(scheduledStartAtMs) && scheduledStartAtMs > 0) {
    return scheduledStartAtMs;
  }

  return NaN;
}

export function getArenaEndAt(tournament) {
  const durationMinutes = Number(tournament?.durationMinutes || 0);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;

  const startMs = getArenaStartMs(tournament);
  if (!Number.isFinite(startMs) || startMs <= 0) return null;

  return new Date(startMs + durationMinutes * 60_000);
}

export function isArenaTournamentStillActive(tournament, now = new Date()) {
  const state = normalizeTournamentState(tournament?.status);
  if (
    state === TOURNAMENT_STATES.FINISHED ||
    state === TOURNAMENT_STATES.CANCELLED
  ) {
    return false;
  }

  const endAt = getArenaEndAt(tournament);
  if (!endAt) return true;

  const nowMs = new Date(now).getTime();
  return Number.isFinite(nowMs) && nowMs < endAt.getTime();
}

function getResultOutcome(result) {
  if (result === "1-0" || result === "1-0F") return "white_win";
  if (result === "0-1" || result === "0-1F") return "black_win";
  if (result === "1/2-1/2") return "draw";
  return null;
}

function getBaseArenaPoints(result) {
  const outcome = getResultOutcome(result);
  if (outcome === "white_win") {
    return { white: ARENA_WIN_POINTS, black: 0 };
  }
  if (outcome === "black_win") {
    return { white: 0, black: ARENA_WIN_POINTS };
  }
  if (outcome === "draw") {
    return { white: ARENA_DRAW_POINTS, black: ARENA_DRAW_POINTS };
  }
  return null;
}

function getWinnerFromResult(result, whiteId, blackId) {
  if (result === "1-0" || result === "1-0F") return toId(whiteId);
  if (result === "0-1" || result === "0-1F") return toId(blackId);
  return "";
}

function chooseBalancedColors(playerA, playerB, ratingsById) {
  const aId = toId(playerA.userId);
  const bId = toId(playerB.userId);
  const aBalance = Number(playerA.whiteGames || 0) - Number(playerA.blackGames || 0);
  const bBalance = Number(playerB.whiteGames || 0) - Number(playerB.blackGames || 0);

  if (aBalance > bBalance) {
    return { whiteId: bId, blackId: aId };
  }
  if (bBalance > aBalance) {
    return { whiteId: aId, blackId: bId };
  }

  const aRating = Number(ratingsById.get(aId) || 1200);
  const bRating = Number(ratingsById.get(bId) || 1200);
  if (aRating >= bRating) {
    return { whiteId: bId, blackId: aId };
  }
  return { whiteId: aId, blackId: bId };
}

function toRoundPairingPayload(game = {}) {
  return {
    gameId: String(game.gameId || ""),
    board: Number(game.boardNumber || game.matchIndex + 1 || 1),
    whiteId: toId(game.whiteId),
    blackId: toId(game.blackId),
    result: String(game.result || "*"),
    isBye: !!game.isBye,
  };
}

async function getActiveParticipantIds(tournamentId, session = null) {
  const players = await withSession(
    TournamentPlayer.find({
      tournamentId,
      status: { $ne: "withdrawn" },
    })
      .select("userId")
      .lean(),
    session,
  );
  return [...new Set(players.map((player) => toId(player.userId)).filter(Boolean))];
}

export async function getActiveArenaGameCount(tournamentId, options = {}) {
  const session = options?.session || null;
  const normalizedTournamentId = toId(tournamentId);
  if (!normalizedTournamentId) return 0;
  return withSession(
    TournamentGame.countDocuments({
      tournamentId: normalizedTournamentId,
      isPublished: true,
      isBye: { $ne: true },
      result: "*",
    }),
    session,
  );
}

async function notifyTournamentCancelledForInsufficientPlayers(
  app,
  tournament,
  participantIds,
  minimumPlayers,
) {
  const recipients = Array.isArray(participantIds) ? participantIds.filter(Boolean) : [];
  if (!recipients.length) return;
  await notifyUsers(app, recipients, {
    type: "tournament_cancelled",
    title: "Tournament cancelled",
    message: "Tournament cancelled due to insufficient players",
    link: buildTournamentLink(tournament?._id),
    payload: {
      tournamentId: toId(tournament?._id),
      reason: "insufficient_players",
      minimumPlayers: Number(minimumPlayers || MIN_START_PLAYERS),
    },
  });
}

async function notifyArenaTournamentStarted(app, tournament, participantIds) {
  const recipients = Array.isArray(participantIds) ? participantIds.filter(Boolean) : [];
  if (!recipients.length) return;
  await notifyUsers(app, recipients, {
    type: "tournament_started",
    title: "Tournament started",
    message: `${String(
      tournament?.name || "Tournament",
    )} is now active. Click Start Game to join the pairing pool.`,
    link: buildTournamentLink(tournament?._id),
    payload: {
      tournamentId: toId(tournament?._id),
      action: "start_game_ready_pool",
    },
  });
}

function buildCandidateIndexes(remainingCount, leadWaitTicks, mode) {
  if (mode === "ELO_BASED" && Number(leadWaitTicks || 0) >= ELO_DRIFT_WAIT_TICKS) {
    return Array.from({ length: remainingCount }, (_, index) => index);
  }
  const maxIndex = Math.min(remainingCount - 1, REMATCH_MAX_HOPS);
  return Array.from({ length: maxIndex + 1 }, (_, index) => index);
}

function pickOpponent({
  leadPlayer,
  remainingPlayers,
  mode,
  playedPairs,
}) {
  if (!leadPlayer || !remainingPlayers.length) {
    return { index: -1, forcedRematch: false };
  }

  const leadId = toId(leadPlayer.userId);
  const candidateIndexes = buildCandidateIndexes(
    remainingPlayers.length,
    Number(leadPlayer.waitTicks || 0),
    mode,
  );

  for (const index of candidateIndexes) {
    const candidate = remainingPlayers[index];
    if (!candidate) continue;
    const candidateId = toId(candidate.userId);
    if (!playedPairs.has(playedKey(leadId, candidateId))) {
      return { index, forcedRematch: false };
    }
  }

  const allPlayed = remainingPlayers.every((candidate) =>
    playedPairs.has(playedKey(leadId, toId(candidate.userId))),
  );
  if (allPlayed && candidateIndexes.length > 0) {
    return { index: candidateIndexes[0], forcedRematch: true };
  }

  return { index: -1, forcedRematch: false };
}

function sortReadyPlayers(readyPlayers, ratingsById, mode) {
  return [...readyPlayers].sort((a, b) => {
    const scoreA = Number(a.score || 0);
    const scoreB = Number(b.score || 0);
    const ratingA = Number(ratingsById.get(toId(a.userId)) || 1200);
    const ratingB = Number(ratingsById.get(toId(b.userId)) || 1200);

    if (mode === "POINT_BASED") {
      if (scoreA !== scoreB) return scoreB - scoreA;
      if (ratingA !== ratingB) return ratingB - ratingA;
    } else {
      if (ratingA !== ratingB) return ratingB - ratingA;
      if (scoreA !== scoreB) return scoreB - scoreA;
    }

    const waitA = Number(a.waitTicks || 0);
    const waitB = Number(b.waitTicks || 0);
    if (waitA !== waitB) return waitB - waitA;
    return toId(a.userId).localeCompare(toId(b.userId));
  });
}

function computeArenaStatsMap(players, games) {
  const statsMap = new Map();
  for (const player of players || []) {
    statsMap.set(toId(player.userId), {
      score: 0,
      buchholz: 0,
      gamesPlayed: 0,
      hadBye: false,
      wins: 0,
      draws: 0,
      losses: 0,
      whiteGames: 0,
      blackGames: 0,
      consecutiveWins: 0,
      opponents: [],
    });
  }

  const applyWin = (stats) => {
    const earned =
      Number(stats.consecutiveWins || 0) >= 2
        ? ARENA_STREAK_BONUS_POINTS
        : ARENA_WIN_POINTS;
    stats.score += earned;
    stats.gamesPlayed += 1;
    stats.wins += 1;
    stats.consecutiveWins = Number(stats.consecutiveWins || 0) + 1;
  };

  const applyDraw = (stats) => {
    stats.score += ARENA_DRAW_POINTS;
    stats.gamesPlayed += 1;
    stats.draws += 1;
    stats.consecutiveWins = 0;
  };

  const applyLoss = (stats) => {
    stats.gamesPlayed += 1;
    stats.losses += 1;
    stats.consecutiveWins = 0;
  };

  const orderedGames = [...(games || [])].sort((a, b) => {
    const byRound = Number(a.roundNumber || 0) - Number(b.roundNumber || 0);
    if (byRound !== 0) return byRound;
    const byMatch = Number(a.matchIndex || 0) - Number(b.matchIndex || 0);
    if (byMatch !== 0) return byMatch;
    const byFinishedAt =
      new Date(a.finishedAt || 0).getTime() - new Date(b.finishedAt || 0).getTime();
    if (byFinishedAt !== 0) return byFinishedAt;
    return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
  });

  for (const game of orderedGames) {
    const result = String(game.result || "*");
    const outcome = getResultOutcome(result);
    if (!outcome) continue;

    const whiteId = toId(game.whiteId);
    const blackId = toId(game.blackId);
    if (!whiteId || !statsMap.has(whiteId)) continue;

    if (game.isBye || !blackId || !statsMap.has(blackId)) {
      const winnerId = getWinnerFromResult(result, whiteId, blackId) || whiteId;
      const winnerStats = statsMap.get(winnerId);
      if (!winnerStats) continue;
      applyWin(winnerStats);
      winnerStats.hadBye = true;
      continue;
    }

    const whiteStats = statsMap.get(whiteId);
    const blackStats = statsMap.get(blackId);
    if (!whiteStats || !blackStats) continue;

    whiteStats.whiteGames += 1;
    blackStats.blackGames += 1;
    whiteStats.opponents.push(blackId);
    blackStats.opponents.push(whiteId);

    if (outcome === "white_win") {
      applyWin(whiteStats);
      applyLoss(blackStats);
    } else if (outcome === "black_win") {
      applyLoss(whiteStats);
      applyWin(blackStats);
    } else {
      applyDraw(whiteStats);
      applyDraw(blackStats);
    }
  }

  for (const [userId, stats] of statsMap.entries()) {
    let buchholz = 0;
    for (const opponentId of stats.opponents) {
      const opponentStats = statsMap.get(opponentId);
      if (!opponentStats) continue;
      buchholz += Number(opponentStats.score || 0);
    }
    stats.buchholz = Math.round(buchholz * 100) / 100;
    stats.score = Math.round(Number(stats.score || 0) * 100) / 100;
    delete stats.consecutiveWins;
    statsMap.set(userId, stats);
  }

  return statsMap;
}

function computeHeadToHeadMap(groupRows, games) {
  const ids = new Set((groupRows || []).map((row) => toId(row.userId)).filter(Boolean));
  const pointsMap = new Map();
  for (const id of ids) {
    pointsMap.set(id, 0);
  }

  for (const game of games || []) {
    const result = String(game.result || "*");
    const points = getBaseArenaPoints(result);
    if (!points) continue;

    const whiteId = toId(game.whiteId);
    const blackId = toId(game.blackId);
    if (!ids.has(whiteId) || !ids.has(blackId)) continue;

    pointsMap.set(whiteId, Number(pointsMap.get(whiteId) || 0) + points.white);
    pointsMap.set(blackId, Number(pointsMap.get(blackId) || 0) + points.black);
  }

  return pointsMap;
}

function rankFinalRows(rows) {
  const ordered = [...rows].sort((a, b) => {
    const scoreDiff = Number(b.points || 0) - Number(a.points || 0);
    if (scoreDiff !== 0) return scoreDiff;
    const buchholzDiff = Number(b.buchholz || 0) - Number(a.buchholz || 0);
    if (buchholzDiff !== 0) return buchholzDiff;
    const h2hDiff = Number(b.headToHead || 0) - Number(a.headToHead || 0);
    if (h2hDiff !== 0) return h2hDiff;
    const eloDiff = Number(b.elo || 0) - Number(a.elo || 0);
    if (eloDiff !== 0) return eloDiff;
    return toId(a.userId).localeCompare(toId(b.userId));
  });

  let previousKey = "";
  let previousRank = 0;
  return ordered.map((row, index) => {
    const key = [
      Number(row.points || 0),
      Number(row.buchholz || 0),
      Number(row.headToHead || 0),
      Number(row.elo || 0),
    ].join("|");
    const rank = key === previousKey ? previousRank : index + 1;
    previousKey = key;
    previousRank = rank;
    return { ...row, rank };
  });
}

export async function checkTournamentStartCondition(tournamentId, options = {}) {
  const session = options?.session || null;
  const now = options?.now ? new Date(options.now) : new Date();
  const nowDate = Number.isFinite(now.getTime()) ? now : new Date();

  const tournament = await withSession(Tournament.findById(tournamentId), session);
  if (!tournament) {
    return { outcome: "missing" };
  }

  const currentState = normalizeTournamentState(tournament.status);
  if (
    currentState === TOURNAMENT_STATES.FINISHED ||
    currentState === TOURNAMENT_STATES.CANCELLED
  ) {
    return {
      outcome: "skipped_state",
      tournament: tournament.toObject ? tournament.toObject() : tournament,
    };
  }

  const canStartFromState =
    currentState === TOURNAMENT_STATES.DRAFT ||
    currentState === TOURNAMENT_STATES.REGISTRATION_OPEN;
  if (!canStartFromState) {
    return {
      outcome: "skipped_state",
      tournament: tournament.toObject ? tournament.toObject() : tournament,
    };
  }

  const participantIds = await getActiveParticipantIds(tournament._id, session);
  const minimumPlayers = Math.max(
    MIN_START_PLAYERS,
    Number(tournament.minPlayers || MIN_START_PLAYERS),
  );
  const actorUserId = toId(options?.actorUserId || tournament.createdBy);

  if (participantIds.length < minimumPlayers) {
    await withSession(
      Tournament.updateOne(
        { _id: tournament._id },
        {
          $set: {
            status: TOURNAMENT_STATES.CANCELLED,
            cancelledAt: nowDate,
            cancellationReason: "insufficient_players",
            autoStartGraceEndsAt: null,
            startedAt: null,
          },
          $inc: { stateVersion: 1 },
        },
        withCreateSessionOptions(session),
      ),
      session,
    );
    await withSession(
      TournamentPlayer.updateMany(
        { tournamentId: tournament._id },
        {
          $set: {
            arenaReady: false,
            arenaReadyAt: null,
            waitTicks: 0,
          },
        },
        withCreateSessionOptions(session),
      ),
      session,
    );

    if (actorUserId) {
      await TournamentTransitionLog.create(
        [
          {
            tournamentId: tournament._id,
            fromState: currentState,
            toState: TOURNAMENT_STATES.CANCELLED,
            action: "auto_cancel_insufficient_players",
            actorUserId,
            meta: {
              reason: "insufficient_players",
              minimumPlayers,
              participantCount: participantIds.length,
            },
          },
        ],
        withCreateSessionOptions(session),
      );
    }

    const cancelledTournament = await withSession(
      Tournament.findById(tournament._id),
      session,
    );
    return {
      outcome: "cancelled",
      tournament: cancelledTournament?.toObject
        ? cancelledTournament.toObject()
        : cancelledTournament,
      participantIds,
      minimumPlayers,
    };
  }

  await withSession(
    Tournament.updateOne(
      { _id: tournament._id },
      {
        $set: {
          status: TOURNAMENT_STATES.LIVE_ROUND,
          startedAt: tournament.startedAt || nowDate,
          cancelledAt: null,
          cancellationReason: "",
          autoStartGraceEndsAt: null,
        },
        $inc: { stateVersion: 1 },
      },
      withCreateSessionOptions(session),
    ),
    session,
  );

  if (actorUserId) {
    await TournamentTransitionLog.create(
      [
        {
          tournamentId: tournament._id,
          fromState: currentState,
          toState: TOURNAMENT_STATES.LIVE_ROUND,
          action: "check_start_condition",
          actorUserId,
          meta: {
            participantCount: participantIds.length,
            minimumPlayers,
          },
        },
      ],
      withCreateSessionOptions(session),
    );
  }

  const startedTournament = await withSession(Tournament.findById(tournament._id), session);
  return {
    outcome: "started",
    tournament: startedTournament?.toObject
      ? startedTournament.toObject()
      : startedTournament,
    participantIds,
    minimumPlayers,
  };
}

export async function runPairingTick(tournamentId, options = {}) {
  const app = options?.app || null;
  const now = options?.now ? new Date(options.now) : new Date();
  const nowDate = Number.isFinite(now.getTime()) ? now : new Date();

  const tournament = await Tournament.findById(tournamentId).lean();
  if (!tournament) {
    return { outcome: "missing" };
  }
  if (String(tournament.type || "").toLowerCase() !== "arena") {
    return { outcome: "not_arena", tournament };
  }
  if (normalizeTournamentState(tournament.status) !== TOURNAMENT_STATES.LIVE_ROUND) {
    return { outcome: "not_live", tournament };
  }
  if (!isArenaTournamentStillActive(tournament, nowDate)) {
    return { outcome: "duration_elapsed", tournament };
  }

  const mode = normalizeArenaPairingMode(tournament.pairingLogic);
  const readyPool = await TournamentPlayer.find({
    tournamentId: tournament._id,
    status: "active",
    arenaReady: true,
  }).lean();
  if (!readyPool.length) {
    return { outcome: "idle", pairedCount: 0, waitingCount: 0 };
  }

  const pendingGames = await TournamentGame.find({
    tournamentId: tournament._id,
    isPublished: true,
    isBye: { $ne: true },
    result: "*",
  })
    .select("whiteId blackId")
    .lean();
  const busyUserIds = new Set(
    pendingGames
      .flatMap((game) => [toId(game.whiteId), toId(game.blackId)])
      .filter(Boolean),
  );

  const eligibleReady = readyPool.filter(
    (player) => !busyUserIds.has(toId(player.userId)),
  );
  if (eligibleReady.length < 2) {
    if (eligibleReady.length === 1) {
      await TournamentPlayer.updateOne(
        { _id: eligibleReady[0]._id },
        { $inc: { waitTicks: 1 } },
      );
    }
    return {
      outcome: "idle",
      pairedCount: 0,
      waitingCount: eligibleReady.length,
    };
  }

  const readyUserIds = eligibleReady.map((player) => toId(player.userId));
  const users = await User.find({ _id: { $in: readyUserIds } })
    .select("rating")
    .lean();
  const ratingsById = new Map(
    users.map((user) => [toId(user._id), Number(user.rating || 1200)]),
  );

  const allGames = await TournamentGame.find({
    tournamentId: tournament._id,
    isBye: { $ne: true },
    blackId: { $ne: null },
  })
    .select("whiteId blackId")
    .lean();
  const playedPairs = new Set();
  for (const game of allGames) {
    const whiteId = toId(game.whiteId);
    const blackId = toId(game.blackId);
    if (!whiteId || !blackId) continue;
    playedPairs.add(playedKey(whiteId, blackId));
  }

  const sortedPool = sortReadyPlayers(eligibleReady, ratingsById, mode);
  const remaining = [...sortedPool];
  const pairings = [];
  const leftoverIds = [];

  while (remaining.length > 1) {
    const lead = remaining.shift();
    if (!lead) break;

    const picked = pickOpponent({
      leadPlayer: lead,
      remainingPlayers: remaining,
      mode,
      playedPairs,
    });
    if (picked.index < 0) {
      leftoverIds.push(toId(lead.userId));
      continue;
    }

    const [opponent] = remaining.splice(picked.index, 1);
    if (!opponent) {
      leftoverIds.push(toId(lead.userId));
      continue;
    }

    const leadId = toId(lead.userId);
    const opponentId = toId(opponent.userId);
    const colors = chooseBalancedColors(lead, opponent, ratingsById);
    pairings.push({
      whiteId: colors.whiteId,
      blackId: colors.blackId,
      leadId,
      opponentId,
      forcedRematch: picked.forcedRematch,
    });
    playedPairs.add(playedKey(leadId, opponentId));
  }

  for (const player of remaining) {
    leftoverIds.push(toId(player.userId));
  }

  if (!pairings.length) {
    if (leftoverIds.length > 0) {
      await TournamentPlayer.updateMany(
        {
          tournamentId: tournament._id,
          userId: { $in: leftoverIds },
        },
        { $inc: { waitTicks: 1 } },
      );
    }
    return {
      outcome: "idle",
      pairedCount: 0,
      waitingCount: leftoverIds.length,
    };
  }

  const nextRound = Number(tournament.currentRound || 0) + 1;
  const insertedGames = pairings.map((pairing, index) => ({
    tournamentId: tournament._id,
    roundNumber: nextRound,
    matchIndex: index,
    boardNumber: index + 1,
    whiteId: pairing.whiteId,
    blackId: pairing.blackId,
    result: "*",
    resultSource: null,
    gameId: crypto.randomBytes(10).toString("hex"),
    winnerId: null,
    liveStatus: "pending",
    startedAt: null,
    isBye: false,
    finishedAt: null,
    publishedAt: nowDate,
    isPublished: true,
    whiteRatingAtPairing: Number(ratingsById.get(toId(pairing.whiteId)) || 1200),
    blackRatingAtPairing: Number(ratingsById.get(toId(pairing.blackId)) || 1200),
    whiteEloDelta: 0,
    blackEloDelta: 0,
    timeControlSnapshot: {
      baseMs: Number(tournament.timeControl?.baseMs || 300000),
      incMs: Number(tournament.timeControl?.incMs || 0),
      label:
        tournament.timeControl?.label ||
        `${Math.round(Number(tournament.timeControl?.baseMs || 300000) / 60000)}+${Math.round(
          Number(tournament.timeControl?.incMs || 0) / 1000,
        )}`,
    },
    pairingExplanation: {
      scoreGroup: mode === "POINT_BASED" ? "arena_points" : "arena_elo",
      colorAssignment: "balanced",
      byeReason: "",
      rematchesAvoided: pairing.forcedRematch
        ? ["All possible opponents already played; rematch fallback used."]
        : [],
    },
  }));

  const persistedGames = await TournamentGame.insertMany(insertedGames);
  const pairedUserIds = [
    ...new Set(
      pairings
        .flatMap((pairing) => [toId(pairing.whiteId), toId(pairing.blackId)])
        .filter(Boolean),
    ),
  ];

  if (pairedUserIds.length > 0) {
    await TournamentPlayer.updateMany(
      {
        tournamentId: tournament._id,
        userId: { $in: pairedUserIds },
      },
      {
        $set: {
          arenaReady: false,
          arenaReadyAt: null,
          waitTicks: 0,
        },
      },
    );
  }

  if (leftoverIds.length > 0) {
    await TournamentPlayer.updateMany(
      {
        tournamentId: tournament._id,
        userId: { $in: leftoverIds },
      },
      { $inc: { waitTicks: 1 } },
    );
  }

  const updatedTournament = await Tournament.findByIdAndUpdate(
    tournament._id,
    {
      $set: {
        currentRound: nextRound,
        latestPublishedRound: nextRound,
        startedAt: tournament.startedAt || nowDate,
      },
    },
    { new: true },
  ).lean();

  const pairingPayload = persistedGames.map((game) => toRoundPairingPayload(game));
  if (app && updatedTournament) {
    emitPairingsPublished(app, updatedTournament, nextRound, pairingPayload);
    emitRoundBoardAssignments(app, updatedTournament, nextRound, pairingPayload);
    emitStandingsUpdated(app, updatedTournament, []);
  }

  return {
    outcome: "paired",
    tournament: updatedTournament,
    roundNumber: nextRound,
    pairedCount: pairings.length,
    waitingCount: leftoverIds.length,
    pairings: pairingPayload,
  };
}

export async function resolveTournamentFinal(tournamentId, options = {}) {
  const session = options?.session || null;
  const now = options?.now ? new Date(options.now) : new Date();
  const nowDate = Number.isFinite(now.getTime()) ? now : new Date();

  const tournament = await withSession(Tournament.findById(tournamentId), session);
  if (!tournament) {
    return { outcome: "missing" };
  }

  const state = normalizeTournamentState(tournament.status);
  if (state === TOURNAMENT_STATES.FINISHED) {
    const existingTop3 = Array.isArray(tournament.finalTop3) ? tournament.finalTop3 : [];
    return {
      outcome: "already_finished",
      tournament: tournament.toObject ? tournament.toObject() : tournament,
      standings: [],
      top3: existingTop3,
    };
  }

  const [players, games] = await Promise.all([
    withSession(
      TournamentPlayer.find({
        tournamentId: tournament._id,
        status: { $ne: "withdrawn" },
      }).lean(),
      session,
    ),
    withSession(
      TournamentGame.find({
        tournamentId: tournament._id,
        isPublished: true,
      }).lean(),
      session,
    ),
  ]);

  const userIds = players.map((player) => toId(player.userId)).filter(Boolean);
  const users = userIds.length
    ? await withSession(
        User.find({ _id: { $in: userIds } }).select("rating").lean(),
        session,
      )
    : [];
  const ratingsById = new Map(users.map((user) => [toId(user._id), Number(user.rating || 1200)]));

  const statsMap = computeArenaStatsMap(players, games);
  const baseRows = players.map((player) => {
    const userId = toId(player.userId);
    const stats = statsMap.get(userId) || {};
    return {
      userId,
      points: Number(stats.score || 0),
      buchholz: Number(stats.buchholz || 0),
      headToHead: 0,
      elo: Number(ratingsById.get(userId) || player.tournamentEloCurrent || 1200),
      wins: Number(stats.wins || 0),
      draws: Number(stats.draws || 0),
      losses: Number(stats.losses || 0),
      gamesPlayed: Number(stats.gamesPlayed || 0),
      whiteGames: Number(stats.whiteGames || 0),
      blackGames: Number(stats.blackGames || 0),
      hadBye: !!stats.hadBye,
    };
  });

  const groupedByPointsAndBuchholz = new Map();
  for (const row of baseRows) {
    const key = `${Number(row.points || 0)}|${Number(row.buchholz || 0)}`;
    if (!groupedByPointsAndBuchholz.has(key)) {
      groupedByPointsAndBuchholz.set(key, []);
    }
    groupedByPointsAndBuchholz.get(key).push(row);
  }

  for (const rows of groupedByPointsAndBuchholz.values()) {
    if (!rows || rows.length < 2) continue;
    const h2hMap = computeHeadToHeadMap(rows, games);
    for (const row of rows) {
      row.headToHead = Number(h2hMap.get(toId(row.userId)) || 0);
    }
  }

  const ranked = rankFinalRows(baseRows);
  const finalTop3 = ranked
    .filter((row) => Number(row.rank || 0) >= 1 && Number(row.rank || 0) <= 3)
    .map((row) => {
      const playerDoc = players.find(
        (candidate) => toId(candidate.userId) === toId(row.userId),
      );
      const eloBefore = Number(playerDoc?.tournamentEloStart || row.elo || 1200);
      const eloAfter = Number(playerDoc?.tournamentEloCurrent || row.elo || 1200);
      return {
        userId: row.userId,
        placement: Number(row.rank || 0),
        score: Number(row.points || 0),
        eloBefore,
        eloAfter,
        eloDelta: eloAfter - eloBefore,
      };
    });

  const playerOperations = ranked.map((row) => {
    const userId = toId(row.userId);
    const stats = statsMap.get(userId) || {};
    return {
      updateOne: {
        filter: {
          tournamentId: tournament._id,
          userId: row.userId,
        },
        update: {
          $set: {
            placement: Number(row.rank || null),
            score: Number(row.points || 0),
            buchholz: Number(row.buchholz || 0),
            directEncounter: Number(row.headToHead || 0),
            wins: Number(stats.wins || 0),
            draws: Number(stats.draws || 0),
            losses: Number(stats.losses || 0),
            gamesPlayed: Number(stats.gamesPlayed || 0),
            whiteGames: Number(stats.whiteGames || 0),
            blackGames: Number(stats.blackGames || 0),
            colorBalance:
              Number(stats.whiteGames || 0) - Number(stats.blackGames || 0),
            hadBye: !!stats.hadBye,
            arenaReady: false,
            arenaReadyAt: null,
            waitTicks: 0,
          },
        },
      },
    };
  });
  if (playerOperations.length > 0) {
    await TournamentPlayer.bulkWrite(playerOperations, withCreateSessionOptions(session));
  }

  await withSession(
    Tournament.updateOne(
      { _id: tournament._id },
      {
        $set: {
          status: TOURNAMENT_STATES.FINISHED,
          finishedAt: nowDate,
          championUserId: finalTop3[0]?.userId || null,
          finalTop3,
          cancellationReason: "",
          cancelledAt: null,
        },
        $inc: { stateVersion: 1 },
      },
      withCreateSessionOptions(session),
    ),
    session,
  );

  const actorUserId = toId(options?.actorUserId || tournament.createdBy);
  if (actorUserId) {
    await TournamentTransitionLog.create(
      [
        {
          tournamentId: tournament._id,
          fromState: state,
          toState: TOURNAMENT_STATES.FINISHED,
          action: "resolve_tournament_final",
          actorUserId,
          meta: {
            tiebreakers: ["buchholz", "head_to_head", "elo"],
          },
        },
      ],
      withCreateSessionOptions(session),
    );
  }

  const finishedTournament = await withSession(Tournament.findById(tournament._id), session);
  return {
    outcome: "finished",
    tournament: finishedTournament?.toObject
      ? finishedTournament.toObject()
      : finishedTournament,
    standings: ranked,
    top3: finalTop3,
  };
}

export async function processLiveArenaTick(app, tournament, now = new Date()) {
  void app;
  if (isArenaTournamentStillActive(tournament, now)) {
    return runPairingTick(toId(tournament._id), { app, now });
  }

  const activeGames = await getActiveArenaGameCount(toId(tournament._id));
  if (activeGames > 0) {
    return {
      outcome: "awaiting_active_games",
      tournament: tournament?.toObject ? tournament.toObject() : tournament,
      activeGames,
      acceptingPairings: false,
    };
  }

  return resolveTournamentFinal(toId(tournament._id), {
    now,
    actorUserId: toId(tournament.createdBy),
  });
}

export async function processArenaStartOutcomeEvents(app, outcome) {
  if (!outcome || !outcome.tournament) return;
  if (outcome.outcome === "cancelled") {
    emitTournamentStateChanged(app, outcome.tournament, TOURNAMENT_STATES.CANCELLED);
    emitTournamentCancelled(app, outcome.tournament, "insufficient_players");
    await notifyTournamentCancelledForInsufficientPlayers(
      app,
      outcome.tournament,
      outcome.participantIds || [],
      outcome.minimumPlayers || MIN_START_PLAYERS,
    );
    return;
  }
  if (outcome.outcome === "started") {
    emitTournamentStateChanged(app, outcome.tournament, TOURNAMENT_STATES.LIVE_ROUND);
    if (String(outcome.tournament.type || "").toLowerCase() === "arena") {
      await notifyArenaTournamentStarted(
        app,
        outcome.tournament,
        outcome.participantIds || [],
      );
    }
  }
}
