import crypto from "crypto";
import { Router } from "express";
import mongoose from "mongoose";
import { authMiddleware, optionalAuthMiddleware } from "../middleware/index.js";
import {
  Tournament,
  TournamentPlayer,
  TournamentGame,
  TournamentTemplate,
  TournamentEloEvent,
  TournamentStandingSnapshot,
  TournamentTransitionLog,
  User,
} from "../models/index.js";
import {
  buildManualRoundPairings,
  computeRoundsPlanned,
  createPlayerStatsMap,
  generateRoundPairings,
  parseTimeControl,
  resolveWinnerId,
} from "../utils/tournamentEngine.js";
import { calculateTournamentEloPair } from "../modules/elo/tournamentElo.js";
import {
  TOURNAMENT_STATES,
  normalizeTournamentState,
  canApplyTournamentAction,
  resolveTournamentNextState,
} from "../modules/tournaments/stateMachine.js";
import {
  emitPairingsPublished,
  emitRoundBoardAssignments,
  emitResultUpdated,
  emitRoundClosed,
  emitStandingsUpdated,
  emitTournamentFinished,
  emitTournamentStateChanged,
} from "../modules/realtime/tournamentRealtime.js";
import { computeTournamentStandings } from "../modules/standings/tournamentStandings.js";
import { maybeAdvanceTournament } from "../services/tournamentRuntime.js";

const router = Router();

const TOURNAMENT_TYPES = new Set(["swiss"]);
const RESULT_INPUT_MAP = new Map([
  ["1-0", "1-0"],
  ["0-1", "0-1"],
  ["1/2-1/2", "1/2-1/2"],
  ["\u00bd-\u00bd", "1/2-1/2"],
  ["1-0 forfeit", "1-0F"],
  ["0-1 forfeit", "0-1F"],
  ["forfeit black", "1-0F"],
  ["forfeit white", "0-1F"],
  ["1-0f", "1-0F"],
  ["0-1f", "0-1F"],
  ["*", "*"],
]);
const RESULT_VALUES = new Set(["1-0", "0-1", "1/2-1/2", "1-0F", "0-1F"]);

function toId(value) {
  return value ? String(value) : "";
}

function applyDenseRanksByPoints(rows) {
  const nextRows = Array.isArray(rows) ? rows.map((row) => ({ ...row })) : [];
  let currentRank = 0;
  let previousPoints = null;
  for (const row of nextRows) {
    const points = Number(row.points ?? row.score ?? 0);
    if (previousPoints === null || points !== previousPoints) {
      currentRank += 1;
      previousPoints = points;
    }
    row.rank = currentRank;
  }
  return nextRows;
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

function parseNonNegativeInt(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

function parsePositiveInt(value, fallback = null) {
  const parsed = parseNonNegativeInt(value, fallback);
  if (parsed === null) return fallback;
  return parsed <= 0 ? fallback : parsed;
}

function parseOptionalDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed;
}

function parseOptionalRatingValue(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}

function normalizeTournamentType(input) {
  const raw = String(input || "swiss").trim();
  return raw || "swiss";
}

function normalizeResultValue(input) {
  const raw = String(input || "")
    .trim()
    .toLowerCase();
  const mapped = RESULT_INPUT_MAP.get(raw);
  if (!mapped) return "";
  return mapped;
}

function normalizeStatusFilter(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized || normalized === "all") return null;
  if (normalized === "open" || normalized === "registration_open") {
    return TOURNAMENT_STATES.REGISTRATION_OPEN;
  }
  if (normalized === "live") {
    return TOURNAMENT_STATES.LIVE_ROUND;
  }
  if (normalized === "draft") return TOURNAMENT_STATES.DRAFT;
  if (normalized === "finished") return TOURNAMENT_STATES.FINISHED;
  if (normalized === "pairing_preview") return TOURNAMENT_STATES.LIVE_ROUND;
  if (normalized === "round_closed") return TOURNAMENT_STATES.ROUND_CLOSED;
  return null;
}

function normalizeSortMode(value) {
  const raw = String(value || "newest").trim().toLowerCase();
  if (["newest", "starting_soon", "most_players", "my_tournaments"].includes(raw)) {
    return raw;
  }
  if (raw === "starting soon") return "starting_soon";
  if (raw === "most players") return "most_players";
  if (raw === "my tournaments") return "my_tournaments";
  return "newest";
}

function formatTypeLabel(type) {
  return "Swiss";
}

function formatTimeControlLabel(timeControl) {
  if (timeControl?.label) return String(timeControl.label);
  const base = Math.max(1, Math.round(Number(timeControl?.baseMs || 300000) / 60000));
  const inc = Math.max(0, Math.round(Number(timeControl?.incMs || 0) / 1000));
  return `${base}+${inc}`;
}

function formatRatingRequirement(tournament) {
  const { min, max } = normalizeRatingBounds(tournament || {});
  if (min === null && max === null) return "None";
  if (min !== null && max !== null) return `${min}-${max}`;
  if (min !== null) return `${min}+`;
  return `<=${max}`;
}

function ensureTournamentState(tournament) {
  const normalized = normalizeTournamentState(tournament?.status);
  if (tournament && tournament.status !== normalized) {
    tournament.status = normalized;
  }
  return normalized;
}

function isOrganizer(tournament, userId) {
  return toId(tournament?.createdBy) === toId(userId);
}

function makePairKey(a, b) {
  const aa = toId(a);
  const bb = toId(b);
  if (!aa || !bb) return "";
  return aa < bb ? `${aa}:${bb}` : `${bb}:${aa}`;
}

function buildPlayedPairs(games) {
  const set = new Set();
  for (const game of games || []) {
    const whiteId = toId(game.whiteId);
    const blackId = toId(game.blackId);
    if (!whiteId || !blackId) continue;
    set.add(makePairKey(whiteId, blackId));
  }
  return set;
}

function toRoundPairingPayload(game = {}) {
  return {
    gameId: String(game.gameId || ""),
    board: Number(game.boardNumber || game.matchIndex + 1 || 1),
    whiteId: toId(game.whiteId),
    blackId: toId(game.blackId),
    isBye: !!game.isBye,
    result: String(game.result || "*"),
  };
}

function asRoundLabel(roundNumber) {
  const round = Number(roundNumber || 0);
  if (round <= 0) return "OFFICIAL";
  return `OFFICIAL \u2014 ROUND ${round} COMPLETE`;
}

function canTournamentRegister(tournament) {
  const status = normalizeTournamentState(tournament?.status);
  return status === TOURNAMENT_STATES.REGISTRATION_OPEN;
}

function isLiveRoundState(status) {
  const normalized = normalizeTournamentState(status);
  return normalized === TOURNAMENT_STATES.LIVE_ROUND;
}

function getStartTypeValue(input) {
  const raw = String(input || "manual").trim().toLowerCase();
  if (raw === "scheduled") return "scheduled";
  return "manual";
}

function getRatingFilterMode(input, minRating, maxRating) {
  const normalized = String(input || "").trim().toLowerCase();
  if (["none", "min", "max", "range"].includes(normalized)) return normalized;
  if (minRating !== null && maxRating !== null) return "range";
  if (minRating !== null) return "min";
  if (maxRating !== null) return "max";
  return "none";
}

function normalizeRatingBounds(source = {}) {
  const rawMin = parseOptionalRatingValue(source.ratingMin);
  const rawMax = parseOptionalRatingValue(source.ratingMax);
  const requestedMode = getRatingFilterMode(source.ratingFilterMode, rawMin, rawMax);

  if (requestedMode === "none") {
    return { mode: "none", min: null, max: null };
  }

  if (requestedMode === "min") {
    if (rawMin === null) return { mode: "none", min: null, max: null };
    return { mode: "min", min: rawMin, max: null };
  }

  if (requestedMode === "max") {
    if (rawMax === null) return { mode: "none", min: null, max: null };
    return { mode: "max", min: null, max: rawMax };
  }

  if (rawMin === null && rawMax === null) {
    return { mode: "none", min: null, max: null };
  }
  if (rawMin === null) {
    return { mode: "max", min: null, max: rawMax };
  }
  if (rawMax === null) {
    return { mode: "min", min: rawMin, max: null };
  }

  // Backward compatibility for older tournaments created before null-rating fix.
  if (rawMin === 0 && rawMax === 0) {
    return { mode: "none", min: null, max: null };
  }

  return { mode: "range", min: rawMin, max: rawMax };
}

function buildTournamentSummary(tournament, extras = {}) {
  const normalizedStatus = normalizeTournamentState(tournament.status);
  const ratingBounds = normalizeRatingBounds(tournament || {});
  return {
    id: toId(tournament._id),
    name: tournament.name,
    type: tournament.type,
    format: tournament.type,
    formatLabel: formatTypeLabel(tournament.type),
    timeControl: tournament.timeControl,
    timeControlLabel: formatTimeControlLabel(tournament.timeControl),
    ratingMin: ratingBounds.min,
    ratingMax: ratingBounds.max,
    ratingFilterMode: ratingBounds.mode,
    ratingRequirement: formatRatingRequirement(tournament),
    status: normalizedStatus,
    roundsPlanned: Number(tournament.roundsPlanned || 1),
    currentRound: Number(tournament.currentRound || 0),
    latestPublishedRound: Number(tournament.latestPublishedRound || 0),
    minPlayers: Number(tournament.minPlayers || 4),
    maxPlayers:
      Number.isFinite(Number(tournament.maxPlayers)) &&
      Number(tournament.maxPlayers) > 0
        ? Number(tournament.maxPlayers)
        : null,
    registrationDeadline: tournament.registrationDeadline || null,
    startType: tournament.startType || "manual",
    scheduledStartAt: tournament.scheduledStartAt || null,
    description: tournament.description || "",
    createdBy: toId(tournament.createdBy),
    startedAt: tournament.startedAt || null,
    finishedAt: tournament.finishedAt || null,
    createdAt: tournament.createdAt || null,
    updatedAt: tournament.updatedAt || null,
    championUserId: toId(tournament.championUserId),
    ...extras,
  };
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function toCsv(rows) {
  return rows.map((row) => row.map((value) => csvEscape(value)).join(",")).join("\n");
}

function formatGameResultForUi(game) {
  if (game?.isBye) return "BYE";
  const raw = String(game?.result || "*");
  if (raw === "*") return "In Progress";
  if (raw === "1-0F") return "1-0 Forfeit";
  if (raw === "0-1F") return "0-1 Forfeit";
  return raw;
}

async function withMongoTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let output;
    await session.withTransaction(async () => {
      output = await work(session);
    });
    return output;
  } finally {
    await session.endSession();
  }
}

async function fetchUsersMap(userIds, session = null) {
  const ids = [...new Set((userIds || []).map((id) => toId(id)).filter(Boolean))];
  if (!ids.length) return new Map();
  let query = User.find({ _id: { $in: ids } })
    .select("fullName avatar rating")
    .lean();
  if (session) query = query.session(session);
  const users = await query;
  return new Map(users.map((user) => [toId(user._id), user]));
}

async function logStateTransition({
  session = null,
  tournamentId,
  fromState,
  toState,
  action,
  actorUserId,
  meta = {},
}) {
  await TournamentTransitionLog.create(
    [
      {
        tournamentId,
        fromState,
        toState,
        action,
        actorUserId,
        meta,
      },
    ],
    session ? { session } : undefined,
  );
}

async function computeAndPersistPlayerStats(tournament, session = null) {
  let playerQuery = TournamentPlayer.find({ tournamentId: tournament._id }).lean();
  let gameQuery = TournamentGame.find({
    tournamentId: tournament._id,
    isPublished: true,
  }).lean();
  if (session) {
    playerQuery = playerQuery.session(session);
    gameQuery = gameQuery.session(session);
  }

  const [players, games] = await Promise.all([playerQuery, gameQuery]);
  const standings = computeTournamentStandings({
    tournamentType: tournament.type,
    players,
    games,
    usersById: new Map(),
  });
  const byUserId = new Map(standings.map((row) => [toId(row.userId), row]));

  const updates = players.map((player) => {
    const row = byUserId.get(toId(player.userId));
    if (!row) {
      return {
        updateOne: {
          filter: { _id: player._id },
          update: {
            $set: {
              score: 0,
              buchholz: 0,
              buchholzCut1: 0,
              directEncounter: 0,
              sonnebornBerger: 0,
              koya: 0,
              colorBalance: 0,
              wins: 0,
              draws: 0,
              losses: 0,
            },
          },
        },
      };
    }
    return {
      updateOne: {
        filter: { _id: player._id },
        update: {
          $set: {
            score: Number(row.points || 0),
            buchholz: Number(row.buchholz || 0),
            buchholzCut1: Number(row.buchholzCut1 || 0),
            directEncounter: Number(row.directEncounter || 0),
            sonnebornBerger: Number(row.sonnebornBerger || 0),
            koya: Number(row.koya || 0),
            colorBalance: Number(row.colorBalance || 0),
            wins: Number(row.wins || 0),
            draws: Number(row.draws || 0),
            losses: Number(row.losses || 0),
            placement: Number(row.rank || 0) || null,
          },
        },
      },
    };
  });

  if (updates.length > 0) {
    if (session) {
      await Promise.all(
        updates.map((operation) =>
          TournamentPlayer.updateOne(
            operation.updateOne.filter,
            operation.updateOne.update,
            { session },
          ),
        ),
      );
    } else {
      await TournamentPlayer.bulkWrite(updates);
    }
  }

  return standings;
}

async function fetchOfficialSnapshot(tournamentId, roundNumber) {
  if (!roundNumber || roundNumber <= 0) return null;
  return TournamentStandingSnapshot.findOne({
    tournamentId,
    roundNumber,
    isOfficial: true,
  })
    .sort({ createdAt: -1 })
    .lean();
}

async function buildTournamentDetail(tournamentDoc, viewerId) {
  const tournament = tournamentDoc.toObject ? tournamentDoc.toObject() : tournamentDoc;
  const normalizedState = ensureTournamentState(tournament);
  if (tournamentDoc.status !== normalizedState) {
    await Tournament.updateOne(
      { _id: tournament._id },
      { $set: { status: normalizedState } },
    );
  }

  const [playerDocs, gameDocs] = await Promise.all([
    TournamentPlayer.find({ tournamentId: tournament._id })
      .sort({ seed: 1, joinedAt: 1 })
      .lean(),
    TournamentGame.find({ tournamentId: tournament._id })
      .sort({ roundNumber: 1, matchIndex: 1, createdAt: 1 })
      .lean(),
  ]);

  const userIds = [
    ...new Set([
      toId(tournament.createdBy),
      ...playerDocs.map((player) => toId(player.userId)),
      ...gameDocs.map((game) => toId(game.whiteId)),
      ...gameDocs.map((game) => toId(game.blackId)),
    ].filter(Boolean)),
  ];
  const usersById = await fetchUsersMap(userIds);

  const organizerUser = usersById.get(toId(tournament.createdBy));
  const canManage = isOrganizer(tournament, viewerId);
  const isRegistered = playerDocs.some(
    (player) =>
      toId(player.userId) === toId(viewerId) &&
      String(player.status || "active") !== "withdrawn",
  );

  const players = playerDocs.map((player, index) => {
    const user = usersById.get(toId(player.userId));
    return {
      id: toId(player._id),
      userId: toId(player.userId),
      rank: index + 1,
      username: user?.fullName || "Player",
      avatar: user?.avatar || "",
      elo: Number(user?.rating || player.tournamentEloCurrent || 1200),
      score: Number(player.score || 0),
      wins: Number(player.wins || 0),
      draws: Number(player.draws || 0),
      losses: Number(player.losses || 0),
      seed: Number(player.seed || 0) || null,
      status: player.status || "active",
      joinedAt: player.joinedAt || null,
      tournamentEloStart: Number(player.tournamentEloStart || 1200),
      tournamentEloCurrent: Number(player.tournamentEloCurrent || 1200),
      tournamentEloDelta: Number(player.tournamentEloDelta || 0),
      buchholz: Number(player.buchholz || 0),
      buchholzCut1: Number(player.buchholzCut1 || 0),
      directEncounter: Number(player.directEncounter || 0),
      sonnebornBerger: Number(player.sonnebornBerger || 0),
      koya: Number(player.koya || 0),
      colorBalance: Number(player.colorBalance || 0),
    };
  });

  const publishedGames = gameDocs.filter((game) => game.isPublished);
  const visibleGames = canManage
    ? gameDocs
    : publishedGames;

  const standingsRows = computeTournamentStandings({
    tournamentType: tournament.type,
    players: playerDocs,
    games: publishedGames,
    usersById,
  });
  const standingsLabel = isLiveRoundState(normalizedState)
    ? "PROVISIONAL"
    : asRoundLabel(tournament.currentRound);
  const snapshot = await fetchOfficialSnapshot(
    tournament._id,
    Number(tournament.currentRound || 0),
  );

  const standings = snapshot && !isLiveRoundState(normalizedState)
    ? (snapshot.rows || []).map((row, index) => {
        const user = usersById.get(toId(row.userId));
        return {
          rank: Number(row.rank || index + 1),
          userId: toId(row.userId),
          username: user?.fullName || "Player",
          avatar: user?.avatar || "",
          elo: Number(user?.rating || 1200),
          points: Number(row.score || 0),
          score: Number(row.score || 0),
          buchholz: Number(row.buchholz || 0),
          buchholzCut1: Number(row.buchholzCut1 || 0),
          wins: Number(row.wins || 0),
          draws: Number(row.draws || 0),
          losses: Number(row.losses || 0),
          directEncounter: Number(row.directEncounter || 0),
          sonnebornBerger: Number(row.sonnebornBerger || 0),
          koya: Number(row.koya || 0),
          colorBalance: Number(row.colorBalance || 0),
          status: row.status || "active",
        };
      })
    : standingsRows.map((row) => ({
        rank: Number(row.rank || 0),
        userId: toId(row.userId),
        username: row.name,
        avatar: row.avatar || "",
        elo: Number(row.elo || 1200),
        points: Number(row.points || 0),
        score: Number(row.points || 0),
        buchholz: Number(row.buchholz || 0),
        buchholzCut1: Number(row.buchholzCut1 || 0),
        wins: Number(row.wins || 0),
        draws: Number(row.draws || 0),
        losses: Number(row.losses || 0),
        directEncounter: Number(row.directEncounter || 0),
        sonnebornBerger: Number(row.sonnebornBerger || 0),
        koya: Number(row.koya || 0),
        colorBalance: Number(row.colorBalance || 0),
        status: row.status || "active",
      }));
  const rankedStandings = applyDenseRanksByPoints(standings);

  const roundMap = new Map();
  for (const game of visibleGames) {
    const roundNumber = Number(game.roundNumber || 0);
    if (!roundMap.has(roundNumber)) {
      roundMap.set(roundNumber, []);
    }
    const whiteUser = usersById.get(toId(game.whiteId));
    const blackUser = usersById.get(toId(game.blackId));
    roundMap.get(roundNumber).push({
      id: toId(game._id),
      gameId: String(game.gameId || ""),
      roundNumber,
      board: Number(game.boardNumber || game.matchIndex + 1 || 1),
      matchIndex: Number(game.matchIndex || 0),
      whiteId: toId(game.whiteId),
      blackId: toId(game.blackId),
      white: whiteUser?.fullName || "Player",
      black: game.blackId ? blackUser?.fullName || "Player" : "BYE",
      result: String(game.result || "*"),
      isBye: !!game.isBye,
      isPublished: !!game.isPublished,
      status: game.result === "*" ? "in_progress" : "completed",
      whiteRatingAtPairing: Number(game.whiteRatingAtPairing || 1200),
      blackRatingAtPairing:
        game.blackRatingAtPairing !== null &&
        game.blackRatingAtPairing !== undefined
          ? Number(game.blackRatingAtPairing)
          : null,
      whiteEloDelta: Number(game.whiteEloDelta || 0),
      blackEloDelta: Number(game.blackEloDelta || 0),
      explanation: game.pairingExplanation || {},
      finishedAt: game.finishedAt || null,
    });
  }

  const rounds = [...roundMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([roundNumber, games]) => ({
      roundNumber,
      games: games.sort((a, b) => a.matchIndex - b.matchIndex),
    }));

  const previewPairings = canManage
    ? gameDocs
        .filter(
          (game) =>
            Number(game.roundNumber || 0) === Number(tournament.currentRound || 0) &&
            !game.isPublished,
        )
        .map((game) => ({
          id: toId(game._id),
          gameId: game.gameId,
          board: Number(game.boardNumber || game.matchIndex + 1 || 1),
          whiteId: toId(game.whiteId),
          blackId: toId(game.blackId),
          white: usersById.get(toId(game.whiteId))?.fullName || "Player",
          black: game.blackId
            ? usersById.get(toId(game.blackId))?.fullName || "Player"
            : "BYE",
          isBye: !!game.isBye,
          explanation: game.pairingExplanation || {},
        }))
    : [];

  const transitions = canManage
    ? await TournamentTransitionLog.find({ tournamentId: tournament._id })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean()
    : [];

  const winners =
    Array.isArray(tournament.finalTop3) && tournament.finalTop3.length > 0
      ? tournament.finalTop3.map((entry) => {
          const user = usersById.get(toId(entry.userId));
          return {
            userId: toId(entry.userId),
            username: user?.fullName || "Player",
            avatar: user?.avatar || "",
            placement: Number(entry.placement || 0),
            score: Number(entry.score || 0),
            eloBefore: Number(entry.eloBefore || 1200),
            eloAfter: Number(entry.eloAfter || 1200),
            eloDelta: Number(entry.eloDelta || 0),
          };
        })
      : rankedStandings.slice(0, 3).map((row) => ({
          userId: row.userId,
          username: row.username,
          avatar: row.avatar,
          placement: row.rank,
          score: row.points,
          eloBefore: row.elo,
          eloAfter: row.elo,
          eloDelta: 0,
        }));

  return {
    tournament: buildTournamentSummary(tournament, {
      organizer: {
        id: toId(tournament.createdBy),
        username: organizerUser?.fullName || "User",
        avatar: organizerUser?.avatar || "",
      },
      registeredCount: players.filter((player) => player.status !== "withdrawn").length,
      totalPlayers: players.length,
      isRegistered,
      canManage,
    }),
    players,
    rounds,
    standings: rankedStandings,
    standingsMeta: {
      isOfficial: !isLiveRoundState(normalizedState),
      label: standingsLabel,
    },
    previewPairings,
    winners,
    transitions: transitions.map((entry) => ({
      id: toId(entry._id),
      fromState: entry.fromState,
      toState: entry.toState,
      action: entry.action,
      actorUserId: toId(entry.actorUserId),
      meta: entry.meta || {},
      createdAt: entry.createdAt || null,
    })),
  };
}

async function ensureOrganizerAccess(req, res, tournamentId) {
  if (!isValidObjectId(tournamentId)) {
    res.status(400).json({ error: "Invalid tournament id" });
    return null;
  }
  const tournament = await Tournament.findOne({ _id: tournamentId, type: "swiss" });
  if (!tournament) {
    res.status(404).json({ error: "Tournament not found" });
    return null;
  }
  if (!isOrganizer(tournament, req.user.userId)) {
    res.status(403).json({ error: "Organizer access required" });
    return null;
  }
  ensureTournamentState(tournament);
  return tournament;
}

async function applyGameResultWithElo({
  tournament,
  game,
  result,
  session,
  source = "organizer",
}) {
  const winnerId = getWinnerByResult(result, game.whiteId, game.blackId);
  const updatePayload = {
    result,
    winnerId: winnerId || null,
    finishedAt: new Date(),
    liveStatus: "completed",
    resultSource: source,
  };

  let eloChanges = null;

  if (!game.isBye && game.blackId) {
    let userQuery = User.find({ _id: { $in: [game.whiteId, game.blackId] } })
      .select("rating")
      .lean();
    if (session) userQuery = userQuery.session(session);
    const users = await userQuery;
    const whiteUser = users.find((user) => toId(user._id) === toId(game.whiteId));
    const blackUser = users.find((user) => toId(user._id) === toId(game.blackId));
    if (whiteUser && blackUser) {
      const computed = calculateTournamentEloPair({
        whiteRating: Number(whiteUser.rating || 1200),
        blackRating: Number(blackUser.rating || 1200),
        result,
      });
      if (computed) {
        eloChanges = {
          white: computed.white.delta,
          black: computed.black.delta,
        };

        await Promise.all([
          User.updateOne(
            { _id: game.whiteId },
            { $set: { rating: computed.white.after } },
            session ? { session } : undefined,
          ),
          User.updateOne(
            { _id: game.blackId },
            { $set: { rating: computed.black.after } },
            session ? { session } : undefined,
          ),
        ]);

        await Promise.all([
          TournamentPlayer.updateOne(
            { tournamentId: tournament._id, userId: game.whiteId },
            {
              $set: { tournamentEloCurrent: computed.white.after },
              $inc: { tournamentEloDelta: computed.white.delta },
            },
            session ? { session } : undefined,
          ),
          TournamentPlayer.updateOne(
            { tournamentId: tournament._id, userId: game.blackId },
            {
              $set: { tournamentEloCurrent: computed.black.after },
              $inc: { tournamentEloDelta: computed.black.delta },
            },
            session ? { session } : undefined,
          ),
        ]);

        const reason =
          result === "1-0F" || result === "0-1F" ? "forfeit" : "result";
        await TournamentEloEvent.insertMany(
          [
            {
              userId: game.whiteId,
              opponentId: game.blackId,
              tournamentId: tournament._id,
              gameId: game.gameId,
              result:
                result === "1-0" || result === "1-0F"
                  ? "W"
                  : result === "0-1" || result === "0-1F"
                    ? "L"
                    : "D",
              reason,
              eloBefore: computed.white.before,
              eloAfter: computed.white.after,
              delta: computed.white.delta,
              kFactor: computed.white.kFactor,
              at: new Date(),
            },
            {
              userId: game.blackId,
              opponentId: game.whiteId,
              tournamentId: tournament._id,
              gameId: game.gameId,
              result:
                result === "0-1" || result === "0-1F"
                  ? "W"
                  : result === "1-0" || result === "1-0F"
                    ? "L"
                    : "D",
              reason,
              eloBefore: computed.black.before,
              eloAfter: computed.black.after,
              delta: computed.black.delta,
              kFactor: computed.black.kFactor,
              at: new Date(),
            },
          ],
          { session },
        );

        updatePayload.whiteEloDelta = computed.white.delta;
        updatePayload.blackEloDelta = computed.black.delta;
      }
    }
  }

  let updateQuery = TournamentGame.updateOne(
    { _id: game._id, result: "*" },
    { $set: updatePayload },
    { session },
  );
  const updated = await updateQuery;
  if (updated.modifiedCount === 0) {
    const fresh = await TournamentGame.findById(game._id).session(session).lean();
    return {
      game: fresh,
      eloChanges: {
        white: Number(fresh?.whiteEloDelta || 0),
        black: Number(fresh?.blackEloDelta || 0),
      },
      alreadyApplied: true,
    };
  }

  const finalGame = await TournamentGame.findById(game._id).session(session).lean();
  return {
    game: finalGame,
    eloChanges,
    alreadyApplied: false,
  };
}

function getWinnerByResult(result, whiteId, blackId) {
  if (result === "1-0" || result === "1-0F") return toId(whiteId);
  if (result === "0-1" || result === "0-1F") return toId(blackId);
  return "";
}

function buildPairingExplanation({
  pairing,
  scoreMap,
  playedPairs,
}) {
  const whiteId = toId(pairing.whiteId);
  const blackId = toId(pairing.blackId);
  const score = Number(scoreMap.get(whiteId)?.score || 0);
  const rematchKey = blackId ? makePairKey(whiteId, blackId) : "";
  return {
    scoreGroup: String(score),
    colorAssignment: blackId
      ? "Balanced by cumulative color history."
      : "Auto-assigned bye color.",
    byeReason: pairing.isBye
      ? "Lowest-ranked eligible player without previous bye in the bottom group."
      : "",
    rematchesAvoided:
      rematchKey && playedPairs.has(rematchKey)
        ? [`Already played ${rematchKey}, fallback applied.`]
        : [],
  };
}

async function generatePairingsPreview({
  tournament,
  actorUserId,
  forceRegenerate = false,
  session,
}) {
  const state = normalizeTournamentState(tournament.status);
  const allowed = new Set([
    TOURNAMENT_STATES.REGISTRATION_OPEN,
    TOURNAMENT_STATES.ROUND_CLOSED,
    TOURNAMENT_STATES.LIVE_ROUND,
  ]);
  if (!allowed.has(state)) {
    throw new Error("Pairings can only be generated from registration, closed round, or live states.");
  }

  let playerQuery = TournamentPlayer.find({
    tournamentId: tournament._id,
    status: { $ne: "withdrawn" },
  }).lean();
  let allGameQuery = TournamentGame.find({ tournamentId: tournament._id }).lean();
  if (session) {
    playerQuery = playerQuery.session(session);
    allGameQuery = allGameQuery.session(session);
  }
  const [players, allGames] = await Promise.all([playerQuery, allGameQuery]);

  const minPlayers = Math.max(2, Number(tournament.minPlayers || 4));
  if (players.length < minPlayers) {
    throw new Error(`At least ${minPlayers} registered players are required.`);
  }

  let targetRound = 1;
  if (state === TOURNAMENT_STATES.ROUND_CLOSED) {
    targetRound = Number(tournament.currentRound || 0) + 1;
  } else if (Number(tournament.currentRound || 0) > 0) {
    targetRound = Number(tournament.currentRound || 0);
  }
  if (targetRound <= 0) targetRound = 1;

  const roundsPlanned = computeRoundsPlanned(
    tournament.type,
    players.length,
    tournament.roundsPlanned,
  );
  if (targetRound > roundsPlanned) {
    throw new Error("No rounds remaining.");
  }

  const existingRoundGames = allGames.filter(
    (game) => Number(game.roundNumber || 0) === targetRound,
  );
  const publishedExists = existingRoundGames.some((game) => game.isPublished);
  if (publishedExists) {
    throw new Error("Round already published.");
  }
  if (!forceRegenerate && existingRoundGames.length > 0) {
    return existingRoundGames;
  }
  if (existingRoundGames.length > 0) {
    let deleteQuery = TournamentGame.deleteMany({
      tournamentId: tournament._id,
      roundNumber: targetRound,
      isPublished: false,
    });
    if (session) deleteQuery = deleteQuery.session(session);
    await deleteQuery;
  }

  const previousPublishedGames = allGames.filter(
    (game) =>
      Number(game.roundNumber || 0) < targetRound && !!game.isPublished,
  );
  const pairings = generateRoundPairings({
    tournamentType: tournament.type,
    players,
    games: previousPublishedGames,
    roundNumber: targetRound,
  });
  if (!pairings.length) {
    throw new Error("Unable to generate pairings for this round.");
  }

  const playerIds = [...new Set(players.map((player) => toId(player.userId)))];
  const usersById = await fetchUsersMap(playerIds, session);
  const scoreMap = createPlayerStatsMap(players, previousPublishedGames, tournament.type);
  const playedPairs = buildPlayedPairs(previousPublishedGames);
  const now = new Date();

  const gameDocs = pairings.map((pairing) => ({
    tournamentId: tournament._id,
    roundNumber: targetRound,
    matchIndex: Number(pairing.matchIndex || 0),
    boardNumber: Number(pairing.matchIndex || 0) + 1,
    whiteId: pairing.whiteId,
    blackId: pairing.blackId || null,
    result: pairing.result || "*",
    resultSource: pairing.result && pairing.result !== "*" ? "system" : null,
    gameId: pairing.gameId || crypto.randomBytes(10).toString("hex"),
    winnerId: pairing.winnerId || null,
    liveStatus: pairing.result && pairing.result !== "*" ? "completed" : "pending",
    startedAt: null,
    isBye: !!pairing.isBye,
    finishedAt: pairing.result && pairing.result !== "*" ? now : null,
    isPublished: false,
    publishedAt: null,
    whiteRatingAtPairing: Number(usersById.get(toId(pairing.whiteId))?.rating || 1200),
    blackRatingAtPairing: pairing.blackId
      ? Number(usersById.get(toId(pairing.blackId))?.rating || 1200)
      : null,
    whiteEloDelta: 0,
    blackEloDelta: 0,
    timeControlSnapshot: {
      baseMs: Number(tournament.timeControl?.baseMs || 300000),
      incMs: Number(tournament.timeControl?.incMs || 0),
      label: formatTimeControlLabel(tournament.timeControl),
    },
    pairingExplanation: buildPairingExplanation({
      pairing,
      scoreMap,
      playedPairs,
    }),
  }));

  let insertQuery = TournamentGame.insertMany(gameDocs, {
    session,
    ordered: true,
  });
  const inserted = await insertQuery;

  let updateQuery = Tournament.updateOne(
    { _id: tournament._id },
    {
      $set: {
        currentRound: targetRound,
        roundsPlanned,
      },
      $inc: { stateVersion: 1 },
    },
    { session },
  );
  await updateQuery;

  return inserted.map((doc) => (doc.toObject ? doc.toObject() : doc));
}

async function publishPairings({ tournament, actorUserId, session }) {
  const state = normalizeTournamentState(tournament.status);
  if (
    ![
      TOURNAMENT_STATES.REGISTRATION_OPEN,
      TOURNAMENT_STATES.ROUND_CLOSED,
      TOURNAMENT_STATES.LIVE_ROUND,
    ].includes(state)
  ) {
    throw new Error("Pairings can only be published from registration, closed round, or live states.");
  }

  let roundNumber = Number(tournament.currentRound || 0);
  if (!roundNumber) {
    roundNumber = Number(tournament.latestPublishedRound || 0) + 1;
  }

  let previewGames = [];
  if (roundNumber > 0) {
    previewGames = await TournamentGame.find({
      tournamentId: tournament._id,
      roundNumber,
      isPublished: false,
    })
      .session(session)
      .lean();
  }

  if (!previewGames.length) {
    const anyPreviewGames = await TournamentGame.find({
      tournamentId: tournament._id,
      isPublished: false,
    })
      .sort({ roundNumber: 1, matchIndex: 1 })
      .session(session)
      .lean();
    if (anyPreviewGames.length > 0) {
      roundNumber = Number(anyPreviewGames[0].roundNumber || 0);
      previewGames = anyPreviewGames.filter(
        (game) => Number(game.roundNumber || 0) === roundNumber,
      );
    }
  }

  if (!previewGames.length) {
    let alreadyPublished = [];
    if (roundNumber > 0) {
      alreadyPublished = await TournamentGame.find({
        tournamentId: tournament._id,
        roundNumber,
        isPublished: true,
      })
        .session(session)
        .lean();
    }
    if (!alreadyPublished.length) {
      const publishedPool = await TournamentGame.find({
        tournamentId: tournament._id,
        isPublished: true,
      })
        .sort({ roundNumber: -1, matchIndex: 1 })
        .session(session)
        .lean();
      if (publishedPool.length > 0) {
        const latestRound = Number(publishedPool[0].roundNumber || 0);
        alreadyPublished = publishedPool.filter(
          (game) => Number(game.roundNumber || 0) === latestRound,
        );
        roundNumber = latestRound;
      }
    }
    if (alreadyPublished.length > 0) {
      if (
        state !== TOURNAMENT_STATES.LIVE_ROUND ||
        Number(tournament.currentRound || 0) !== roundNumber ||
        Number(tournament.latestPublishedRound || 0) < roundNumber
      ) {
        await Tournament.updateOne(
          { _id: tournament._id },
          {
            $set: {
              status: TOURNAMENT_STATES.LIVE_ROUND,
              currentRound: roundNumber,
              latestPublishedRound: roundNumber,
              startedAt: tournament.startedAt || new Date(),
            },
          },
          { session },
        );
      }
      return { published: alreadyPublished, alreadyPublished: true };
    }
    throw new Error("No preview pairings found.");
  }

  await TournamentGame.updateMany(
    {
      tournamentId: tournament._id,
      roundNumber,
      isPublished: false,
    },
    {
      $set: {
        isPublished: true,
        publishedAt: new Date(),
      },
    },
    { session },
  );

  await Tournament.updateOne(
    { _id: tournament._id },
    {
      $set: {
        status: TOURNAMENT_STATES.LIVE_ROUND,
        latestPublishedRound: roundNumber,
        currentRound: roundNumber,
        startedAt: tournament.startedAt || new Date(),
      },
      $inc: { stateVersion: 1 },
    },
    { session },
  );

  await logStateTransition({
    session,
    tournamentId: tournament._id,
    fromState: state,
    toState: TOURNAMENT_STATES.LIVE_ROUND,
    action: "publish_pairings",
    actorUserId,
    meta: { roundNumber },
  });

  const published = await TournamentGame.find({
    tournamentId: tournament._id,
    roundNumber,
    isPublished: true,
  })
    .session(session)
    .lean();
  return { published, alreadyPublished: false };
}

async function generateAndPublishPairings({
  tournament,
  actorUserId,
  forceRegenerate = false,
  session,
}) {
  await generatePairingsPreview({
    tournament,
    actorUserId,
    forceRegenerate,
    session,
  });
  const refreshed = await Tournament.findById(tournament._id).session(session);
  return publishPairings({
    tournament: refreshed,
    actorUserId,
    session,
  });
}

async function completeTournament({
  tournament,
  actorUserId,
  session,
}) {
  const state = normalizeTournamentState(tournament.status);
  if (state === TOURNAMENT_STATES.FINISHED) {
    return tournament;
  }

  const standings = await computeAndPersistPlayerStats(tournament, session);
  const playerDocs = await TournamentPlayer.find({ tournamentId: tournament._id })
    .session(session)
    .lean();
  const playerByUser = new Map(playerDocs.map((player) => [toId(player.userId), player]));
  const top3 = standings.slice(0, 3).map((row, index) => {
    const player = playerByUser.get(toId(row.userId));
    const eloStart = Number(player?.tournamentEloStart || row.elo || 1200);
    const eloCurrent = Number(player?.tournamentEloCurrent || row.elo || 1200);
    return {
      userId: row.userId,
      placement: Number(row.rank || index + 1),
      score: Number(row.points || 0),
      eloBefore: eloStart,
      eloAfter: eloCurrent,
      eloDelta: eloCurrent - eloStart,
    };
  });

  await Tournament.updateOne(
    { _id: tournament._id },
    {
      $set: {
        status: TOURNAMENT_STATES.FINISHED,
        finishedAt: new Date(),
        championUserId: top3[0]?.userId || null,
        finalTop3: top3,
      },
      $inc: { stateVersion: 1 },
    },
    { session },
  );

  await logStateTransition({
    session,
    tournamentId: tournament._id,
    fromState: state,
    toState: TOURNAMENT_STATES.FINISHED,
    action: "finish_tournament",
    actorUserId,
    meta: { finalRound: Number(tournament.currentRound || 0) },
  });

  return { standings, top3 };
}

async function parseTemplatePayload(body = {}) {
  const ratingBounds = normalizeRatingBounds({
    ratingFilterMode: body.ratingFilterMode,
    ratingMin: body.ratingMin,
    ratingMax: body.ratingMax,
  });
  const payload = {
    name: String(body.name || "").trim(),
    type: normalizeTournamentType(body.type || "swiss"),
    timeControl: parseTimeControl(body.timeControl),
    ratingMin: ratingBounds.min,
    ratingMax: ratingBounds.max,
    ratingFilterMode: ratingBounds.mode,
    minPlayers: parsePositiveInt(body.minPlayers, 4) || 4,
    maxPlayers:
      Number.isFinite(Number(body.maxPlayers)) && Number(body.maxPlayers) > 1
        ? Number(body.maxPlayers)
        : null,
    registrationDeadline: parseOptionalDate(body.registrationDeadline),
    startType: getStartTypeValue(body.startType),
    scheduledStartAt: parseOptionalDate(body.scheduledStartAt),
    description: String(body.description || "").trim().slice(0, 2000),
    roundsPlanned: parsePositiveInt(body.roundsPlanned, null),
  };

  if (!payload.name) {
    throw new Error("Tournament name is required.");
  }
  if (!TOURNAMENT_TYPES.has(payload.type)) {
    throw new Error("Invalid tournament format.");
  }
  if (
    payload.ratingMin !== null &&
    payload.ratingMax !== null &&
    payload.ratingMin > payload.ratingMax
  ) {
    throw new Error("ratingMin cannot exceed ratingMax.");
  }
  if (
    payload.maxPlayers !== null &&
    payload.maxPlayers < payload.minPlayers
  ) {
    throw new Error("maxPlayers must be >= minPlayers.");
  }
  if (payload.startType === "scheduled" && !payload.scheduledStartAt) {
    throw new Error("scheduledStartAt is required for scheduled tournaments.");
  }

  return payload;
}

router.get("/", optionalAuthMiddleware, async (req, res) => {
  try {
    const viewerId = req.user?.userId ? String(req.user.userId) : "";
    const search = String(req.query.search || "").trim().toLowerCase();
    const requestedType = normalizeTournamentType(req.query.format || req.query.type);
    const requestedStatus = normalizeStatusFilter(req.query.status);
    const sortMode = normalizeSortMode(req.query.sort);
    const limit = Math.max(1, Math.min(100, parsePositiveInt(req.query.limit, 50) || 50));
    const page = Math.max(1, parsePositiveInt(req.query.page, 1) || 1);

    const query = { type: "swiss" };
    if (TOURNAMENT_TYPES.has(requestedType)) {
      query.type = requestedType;
    }

    const tournaments = await Tournament.find(query).sort({ createdAt: -1 }).lean();
    const normalized = tournaments.map((tournament) => ({
      ...tournament,
      status: normalizeTournamentState(tournament.status),
    }));

    const tournamentIds = normalized.map((tournament) => tournament._id);
    const [countAgg, registrationDocs] = await Promise.all([
      tournamentIds.length
        ? TournamentPlayer.aggregate([
            {
              $match: {
                tournamentId: { $in: tournamentIds },
                status: { $ne: "withdrawn" },
              },
            },
            { $group: { _id: "$tournamentId", count: { $sum: 1 } } },
          ])
        : [],
      viewerId && tournamentIds.length
        ? TournamentPlayer.find({
            tournamentId: { $in: tournamentIds },
            userId: viewerId,
            status: { $ne: "withdrawn" },
          })
            .select("tournamentId")
            .lean()
        : [],
    ]);
    const countMap = new Map(countAgg.map((item) => [toId(item._id), Number(item.count || 0)]));
    const regSet = new Set(registrationDocs.map((doc) => toId(doc.tournamentId)));

    const organizerIds = [...new Set(normalized.map((item) => toId(item.createdBy)).filter(Boolean))];
    const organizersById = await fetchUsersMap(organizerIds);

    let filtered = normalized.filter((tournament) => {
      if (requestedStatus && normalizeTournamentState(tournament.status) !== requestedStatus) {
        return false;
      }
      if (search && !String(tournament.name || "").toLowerCase().includes(search)) {
        return false;
      }
      return true;
    });

    const withSummary = filtered.map((tournament) => {
      const id = toId(tournament._id);
      const organizer = organizersById.get(toId(tournament.createdBy));
      const registeredCount = Number(countMap.get(id) || 0);
      const myTournament = !!viewerId && toId(tournament.createdBy) === toId(viewerId);
      return buildTournamentSummary(tournament, {
        registeredCount,
        isRegistered: viewerId ? regSet.has(id) : false,
        canManage: myTournament,
        myTournament,
        organizer: {
          id: toId(tournament.createdBy),
          username: organizer?.fullName || "User",
          avatar: organizer?.avatar || "",
        },
      });
    });

    withSummary.sort((a, b) => {
      if (sortMode === "starting_soon") {
        const aTime = new Date(a.scheduledStartAt || a.registrationDeadline || a.createdAt || 0).getTime();
        const bTime = new Date(b.scheduledStartAt || b.registrationDeadline || b.createdAt || 0).getTime();
        return aTime - bTime;
      }
      if (sortMode === "most_players") {
        const countDiff = Number(b.registeredCount || 0) - Number(a.registeredCount || 0);
        if (countDiff !== 0) return countDiff;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      }
      if (sortMode === "my_tournaments") {
        const mineDiff = Number(b.myTournament || false) - Number(a.myTournament || false);
        if (mineDiff !== 0) return mineDiff;
        const registeredDiff = Number(b.isRegistered || false) - Number(a.isRegistered || false);
        if (registeredDiff !== 0) return registeredDiff;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      }
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

    const total = withSummary.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, pages);
    const offset = (safePage - 1) * limit;
    const paged = withSummary.slice(offset, offset + limit);

    res.json({
      tournaments: paged,
      pagination: {
        page: safePage,
        limit,
        total,
        pages,
        hasMore: offset + paged.length < total,
      },
    });
  } catch (error) {
    console.error("Tournament list error:", error);
    res.status(500).json({ error: "Failed to fetch tournaments" });
  }
});

router.get("/templates", authMiddleware, async (req, res) => {
  try {
    const templates = await TournamentTemplate.find({ userId: req.user.userId })
      .sort({ updatedAt: -1 })
      .lean();
    res.json({
      templates: templates.map((template) => ({
        id: toId(template._id),
        name: template.name,
        payload: template.payload || {},
        updatedAt: template.updatedAt || template.createdAt || null,
      })),
    });
  } catch (error) {
    console.error("Tournament templates list error:", error);
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

router.post("/templates", authMiddleware, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const payload = req.body?.payload;
    if (!name) {
      return res.status(400).json({ error: "Template name is required" });
    }
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "Template payload is required" });
    }

    const updated = await TournamentTemplate.findOneAndUpdate(
      { userId: req.user.userId, name },
      { $set: { payload } },
      { new: true, upsert: true },
    ).lean();
    res.status(201).json({
      template: {
        id: toId(updated._id),
        name: updated.name,
        payload: updated.payload,
        updatedAt: updated.updatedAt || updated.createdAt || null,
      },
    });
  } catch (error) {
    console.error("Tournament template save error:", error);
    res.status(500).json({ error: "Failed to save template" });
  }
});

router.post("/", authMiddleware, async (req, res) => {
  try {
    const parsed = await parseTemplatePayload(req.body || {});
    const roundsPlanned = parsePositiveInt(parsed.roundsPlanned, null) || 1;

    const tournament = await Tournament.create({
      name: parsed.name,
      type: parsed.type,
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
      createdBy: req.user.userId,
      managerIds: [],
      stateVersion: 0,
    });

    if (req.body?.saveAsTemplate === true) {
      const templateName = String(req.body?.templateName || parsed.name).trim();
      if (templateName) {
        const payload = {
          type: parsed.type,
          timeControl: parsed.timeControl,
          ratingMin: parsed.ratingMin,
          ratingMax: parsed.ratingMax,
          ratingFilterMode: parsed.ratingFilterMode,
          minPlayers: parsed.minPlayers,
          maxPlayers: parsed.maxPlayers,
          registrationDeadline: null,
          startType: parsed.startType,
          scheduledStartAt: null,
          description: parsed.description,
          roundsPlanned: roundsPlanned,
        };
        await TournamentTemplate.findOneAndUpdate(
          { userId: req.user.userId, name: templateName },
          { $set: { payload } },
          { upsert: true, new: true },
        );
      }
    }

    const detail = await buildTournamentDetail(tournament, req.user.userId);
    res.status(201).json(detail);
  } catch (error) {
    console.error("Tournament create error:", error);
    res.status(400).json({ error: error?.message || "Failed to create tournament" });
  }
});

router.get("/by-game/:gameId/context", authMiddleware, async (req, res) => {
  try {
    const externalGameId = String(req.params.gameId || "").trim();
    if (!externalGameId) {
      return res.status(400).json({ error: "Invalid tournament game id" });
    }

    const game = await TournamentGame.findOne({ gameId: externalGameId }).lean();
    if (!game) {
      return res.status(404).json({ error: "Tournament game not found" });
    }

    const tournament = await Tournament.findOne({
      _id: game.tournamentId,
      type: "swiss",
    });
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    const detail = await buildTournamentDetail(tournament, req.user.userId);
    const history = (detail.rounds || [])
      .flatMap((round) =>
        (round.games || []).map((entry) => ({
          id: String(entry.id || ""),
          gameId: String(entry.gameId || ""),
          roundNumber: Number(round.roundNumber || entry.roundNumber || 0),
          board: Number(entry.board || 0),
          white: String(entry.white || "Player"),
          black: String(entry.black || "Player"),
          whiteId: String(entry.whiteId || ""),
          blackId: String(entry.blackId || ""),
          result: formatGameResultForUi(entry),
          rawResult: String(entry.result || "*"),
          isBye: !!entry.isBye,
          status: entry.result === "*" ? "in_progress" : "completed",
          whiteEloDelta: Number(entry.whiteEloDelta || 0),
          blackEloDelta: Number(entry.blackEloDelta || 0),
        })),
      )
      .sort((a, b) => {
        const byRound = Number(a.roundNumber || 0) - Number(b.roundNumber || 0);
        if (byRound !== 0) return byRound;
        return Number(a.board || 0) - Number(b.board || 0);
      });

    res.json({
      tournament: {
        id: String(detail.tournament?.id || ""),
        name: String(detail.tournament?.name || "Tournament"),
        status: String(detail.tournament?.status || ""),
        type: String(detail.tournament?.type || "swiss"),
        currentRound: Number(detail.tournament?.currentRound || 0),
        roundsPlanned: Number(detail.tournament?.roundsPlanned || 1),
      },
      standings: (detail.standings || []).map((row) => ({
        rank: Number(row.rank || 0),
        userId: String(row.userId || ""),
        username: String(row.username || "Player"),
        elo: Number(row.elo || 1200),
        points: Number(row.points || 0),
        status: String(row.status || "active"),
      })),
      history,
    });
  } catch (error) {
    console.error("Tournament game context error:", error);
    res.status(500).json({ error: "Failed to fetch tournament game context" });
  }
});

router.get("/:id", optionalAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid tournament id" });
    }
    const tournament = await Tournament.findOne({ _id: id, type: "swiss" });
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }
    const detail = await buildTournamentDetail(tournament, req.user?.userId || "");
    res.json(detail);
  } catch (error) {
    console.error("Tournament detail error:", error);
    res.status(500).json({ error: "Failed to fetch tournament detail" });
  }
});

router.get("/:id/players", optionalAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid tournament id" });
    }
    const tournament = await Tournament.findOne({ _id: id, type: "swiss" }).lean();
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    const page = Math.max(1, parsePositiveInt(req.query.page, 1) || 1);
    const limit = Math.max(1, Math.min(100, parsePositiveInt(req.query.limit, 50) || 50));
    const sort = String(req.query.sort || "seed").trim().toLowerCase();

    const players = await TournamentPlayer.find({ tournamentId: id }).lean();
    const usersById = await fetchUsersMap(players.map((player) => toId(player.userId)));
    const rows = players.map((player) => {
      const user = usersById.get(toId(player.userId));
      return {
        id: toId(player._id),
        userId: toId(player.userId),
        username: user?.fullName || "Player",
        avatar: user?.avatar || "",
        elo: Number(user?.rating || player.tournamentEloCurrent || 1200),
        score: Number(player.score || 0),
        seed: Number(player.seed || 0) || null,
        status: player.status || "active",
        joinedAt: player.joinedAt || null,
      };
    });

    rows.sort((a, b) => {
      if (sort === "elo") return Number(b.elo || 0) - Number(a.elo || 0);
      if (sort === "score") return Number(b.score || 0) - Number(a.score || 0);
      return Number(a.seed || 999999) - Number(b.seed || 999999);
    });

    const total = rows.length;
    const offset = (page - 1) * limit;
    const pageRows = rows.slice(offset, offset + limit);
    res.json({
      players: pageRows,
      pagination: {
        page,
        limit,
        total,
        hasMore: offset + pageRows.length < total,
      },
    });
  } catch (error) {
    console.error("Tournament players error:", error);
    res.status(500).json({ error: "Failed to fetch tournament players" });
  }
});

router.get("/:id/pairings", optionalAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid tournament id" });
    }
    const tournament = await Tournament.findOne({ _id: id, type: "swiss" }).lean();
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }
    const canManage = isOrganizer(tournament, req.user?.userId || "");
    const roundNumber = parsePositiveInt(req.query.round, null);
    const query = {
      tournamentId: tournament._id,
      ...(roundNumber ? { roundNumber } : {}),
      ...(canManage ? {} : { isPublished: true }),
    };
    const games = await TournamentGame.find(query)
      .sort({ roundNumber: 1, matchIndex: 1 })
      .lean();
    const usersById = await fetchUsersMap(
      games.flatMap((game) => [toId(game.whiteId), toId(game.blackId)]),
    );
    res.json({
      pairings: games.map((game) => ({
        id: toId(game._id),
        gameId: String(game.gameId || ""),
        roundNumber: Number(game.roundNumber || 0),
        board: Number(game.boardNumber || game.matchIndex + 1 || 1),
        whiteId: toId(game.whiteId),
        white: usersById.get(toId(game.whiteId))?.fullName || "Player",
        blackId: toId(game.blackId),
        black: game.blackId
          ? usersById.get(toId(game.blackId))?.fullName || "Player"
          : "BYE",
        result: game.result || "*",
        isBye: !!game.isBye,
        isPublished: !!game.isPublished,
        explanation: game.pairingExplanation || {},
      })),
    });
  } catch (error) {
    console.error("Tournament pairings error:", error);
    res.status(500).json({ error: "Failed to fetch pairings" });
  }
});

router.get("/:id/standings", optionalAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid tournament id" });
    }
    const tournament = await Tournament.findOne({ _id: id, type: "swiss" }).lean();
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    const detail = await buildTournamentDetail(tournament, req.user?.userId || "");
    const page = Math.max(1, parsePositiveInt(req.query.page, 1) || 1);
    const limit = Math.max(1, Math.min(100, parsePositiveInt(req.query.limit, 50) || 50));
    const total = detail.standings.length;
    const offset = (page - 1) * limit;
    res.json({
      standings: detail.standings.slice(offset, offset + limit),
      standingsMeta: detail.standingsMeta,
      pagination: {
        page,
        limit,
        total,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error("Tournament standings error:", error);
    res.status(500).json({ error: "Failed to fetch standings" });
  }
});

router.get("/:id/export/players.csv", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid tournament id" });
    }
    const tournament = await Tournament.findOne({ _id: id, type: "swiss" });
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }
    const detail = await buildTournamentDetail(tournament, req.user.userId);
    const rows = [
      ["Rank", "Username", "ELO", "Score", "Status"],
      ...detail.players.map((player) => [
        player.rank,
        player.username,
        player.elo,
        player.score,
        player.status,
      ]),
    ];
    const csv = toCsv(rows);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="tournament-${toId(tournament._id)}-players.csv"`,
    );
    res.send(csv);
  } catch (error) {
    console.error("Export players csv error:", error);
    res.status(500).json({ error: "Failed to export players CSV" });
  }
});

router.get("/:id/export/standings.csv", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid tournament id" });
    }
    const tournament = await Tournament.findOne({ _id: id, type: "swiss" });
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }
    const detail = await buildTournamentDetail(tournament, req.user.userId);
    const rows = [
      [
        "Rank",
        "Username",
        "ELO",
        "Points",
        "Buchholz",
        "BuchholzCut1",
        "Wins",
        "DirectEncounter",
        "SonnebornBerger",
        "Koya",
      ],
      ...detail.standings.map((row) => [
        row.rank,
        row.username,
        row.elo,
        row.points,
        row.buchholz,
        row.buchholzCut1,
        row.wins,
        row.directEncounter,
        row.sonnebornBerger,
        row.koya,
      ]),
    ];
    const csv = toCsv(rows);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="tournament-${toId(tournament._id)}-standings.csv"`,
    );
    res.send(csv);
  } catch (error) {
    console.error("Export standings csv error:", error);
    res.status(500).json({ error: "Failed to export standings CSV" });
  }
});

router.get("/:id/export/games.pgn", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid tournament id" });
    }
    const tournament = await Tournament.findOne({ _id: id, type: "swiss" }).lean();
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }
    const games = await TournamentGame.find({
      tournamentId: tournament._id,
      isPublished: true,
      result: { $ne: "*" },
      isBye: { $ne: true },
    })
      .sort({ roundNumber: 1, matchIndex: 1 })
      .lean();
    const usersById = await fetchUsersMap(
      games.flatMap((game) => [toId(game.whiteId), toId(game.blackId)]),
    );

    const pgn = games
      .map((game) => {
        const white = usersById.get(toId(game.whiteId))?.fullName || "White";
        const black = usersById.get(toId(game.blackId))?.fullName || "Black";
        const result =
          game.result === "1-0F"
            ? "1-0"
            : game.result === "0-1F"
              ? "0-1"
              : game.result;
        return [
          `[Event "${tournament.name}"]`,
          `[Round "${game.roundNumber}"]`,
          `[Board "${game.boardNumber || game.matchIndex + 1}"]`,
          `[White "${white}"]`,
          `[Black "${black}"]`,
          `[Result "${result}"]`,
          "",
          result,
        ].join("\n");
      })
      .join("\n\n");

    res.setHeader("Content-Type", "application/x-chess-pgn; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="tournament-${toId(tournament._id)}-games.pgn"`,
    );
    res.send(pgn);
  } catch (error) {
    console.error("Export games pgn error:", error);
    res.status(500).json({ error: "Failed to export games PGN" });
  }
});

router.post("/:id/register", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid tournament id" });
    }
    const tournament = await Tournament.findOne({ _id: id, type: "swiss" });
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }
    const state = ensureTournamentState(tournament);
    if (!canTournamentRegister(tournament)) {
      return res.status(400).json({ error: "Registration is closed." });
    }
    if (tournament.registrationDeadline) {
      const deadline = new Date(tournament.registrationDeadline).getTime();
      if (Number.isFinite(deadline) && Date.now() > deadline) {
        return res.status(400).json({ error: "Registration deadline has passed." });
      }
    }

    const existing = await TournamentPlayer.findOne({
      tournamentId: tournament._id,
      userId: req.user.userId,
    });
    if (existing && existing.status !== "withdrawn") {
      const detail = await buildTournamentDetail(tournament, req.user.userId);
      return res.json({ success: true, ...detail });
    }

    const activeCount = await TournamentPlayer.countDocuments({
      tournamentId: tournament._id,
      status: { $ne: "withdrawn" },
    });
    if (
      Number.isFinite(Number(tournament.maxPlayers)) &&
      Number(tournament.maxPlayers) > 0 &&
      activeCount >= Number(tournament.maxPlayers)
    ) {
      return res.status(400).json({ error: "Tournament is full." });
    }

    const user = await User.findById(req.user.userId).select("rating").lean();
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const rating = Number(user.rating || 1200);
    const ratingBounds = normalizeRatingBounds(tournament);
    if (ratingBounds.min !== null && rating < ratingBounds.min) {
      return res.status(400).json({ error: "Your rating is below the minimum requirement." });
    }
    if (ratingBounds.max !== null && rating > ratingBounds.max) {
      return res.status(400).json({ error: "Your rating is above the maximum requirement." });
    }

    if (existing && existing.status === "withdrawn") {
      await TournamentPlayer.updateOne(
        { _id: existing._id },
        {
          $set: {
            status: "active",
            withdrawnAt: null,
            withdrawnReason: "",
            joinedAt: new Date(),
          },
        },
      );
    } else {
      await TournamentPlayer.create({
        tournamentId: tournament._id,
        userId: req.user.userId,
        status: "active",
        score: 0,
        buchholz: 0,
        buchholzCut1: 0,
        gamesPlayed: 0,
        hadBye: false,
        tournamentEloStart: rating,
        tournamentEloCurrent: rating,
        tournamentEloDelta: 0,
      });
    }

    const detail = await buildTournamentDetail(tournament, req.user.userId);
    res.json({ success: true, ...detail });
  } catch (error) {
    console.error("Tournament register error:", error);
    res.status(500).json({ error: "Failed to register for tournament" });
  }
});

async function unregisterHandler(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid tournament id" });
    }
    const tournament = await Tournament.findOne({ _id: id, type: "swiss" });
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }
    const state = ensureTournamentState(tournament);
    if (![TOURNAMENT_STATES.DRAFT, TOURNAMENT_STATES.REGISTRATION_OPEN].includes(state)) {
      return res.status(400).json({ error: "Cannot unregister after tournament start." });
    }
    await TournamentPlayer.deleteOne({
      tournamentId: tournament._id,
      userId: req.user.userId,
    });
    const detail = await buildTournamentDetail(tournament, req.user.userId);
    res.json({ success: true, ...detail });
  } catch (error) {
    console.error("Tournament unregister error:", error);
    res.status(500).json({ error: "Failed to unregister" });
  }
}

router.delete("/:id/register", authMiddleware, unregisterHandler);
router.post("/:id/unregister", authMiddleware, unregisterHandler);

router.patch("/:id/state", authMiddleware, async (req, res) => {
  try {
    const tournament = await ensureOrganizerAccess(req, res, req.params.id);
    if (!tournament) return;

    const action = String(req.body?.action || "").trim().toLowerCase();
    if (!action) {
      return res.status(400).json({ error: "Action is required" });
    }

    if (action === "open_registration") {
      const state = normalizeTournamentState(tournament.status);
      if (state === TOURNAMENT_STATES.REGISTRATION_OPEN) {
        const detail = await buildTournamentDetail(tournament, req.user.userId);
        return res.json({ success: true, ...detail });
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
        actorUserId: req.user.userId,
      });
      const refreshed = await Tournament.findById(tournament._id);
      emitTournamentStateChanged(req.app, refreshed, nextState);
      const detail = await buildTournamentDetail(refreshed, req.user.userId);
      return res.json({ success: true, ...detail });
    }

    if (action === "close_registration" || action === "next_round") {
      const out = await withMongoTransaction(async (session) => {
        const doc = await Tournament.findById(tournament._id).session(session);
        const result = await generateAndPublishPairings({
          tournament: doc,
          actorUserId: req.user.userId,
          forceRegenerate: false,
          session,
        });
        const refreshed = await Tournament.findById(tournament._id).session(session);
        await computeAndPersistPlayerStats(refreshed, session);
        const detail = await buildTournamentDetail(refreshed, req.user.userId);
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
      return res.json({ success: true, ...out.detail });
    }

    if (action === "start_round" || action === "publish_pairings") {
      const out = await withMongoTransaction(async (session) => {
        const doc = await Tournament.findById(tournament._id).session(session);
        const result = await publishPairings({
          tournament: doc,
          actorUserId: req.user.userId,
          session,
        });
        await computeAndPersistPlayerStats(doc, session);
        const refreshed = await Tournament.findById(tournament._id).session(session);
        const detail = await buildTournamentDetail(refreshed, req.user.userId);
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
      return res.json({ success: true, ...out.detail });
    }

    if (action === "finish_tournament") {
      const out = await withMongoTransaction(async (session) => {
        const doc = await Tournament.findById(tournament._id).session(session);
        const done = await completeTournament({
          tournament: doc,
          actorUserId: req.user.userId,
          session,
        });
        const refreshed = await Tournament.findById(tournament._id).session(session);
        const detail = await buildTournamentDetail(refreshed, req.user.userId);
        return { done, detail, refreshed };
      });

      emitTournamentStateChanged(req.app, out.refreshed, TOURNAMENT_STATES.FINISHED);
      emitTournamentFinished(
        req.app,
        out.refreshed,
        out.detail.winners?.[0] || null,
        out.detail.winners || [],
        out.detail.standings || [],
      );
      return res.json({ success: true, ...out.detail });
    }

    return res.status(400).json({ error: "Unsupported action." });
  } catch (error) {
    console.error("Tournament state transition error:", error);
    res.status(500).json({ error: error?.message || "Failed to transition state" });
  }
});

router.post("/:id/pairings/generate", authMiddleware, async (req, res) => {
  try {
    const tournament = await ensureOrganizerAccess(req, res, req.params.id);
    if (!tournament) return;

    const forceRegenerate =
      req.body?.forceRegenerate === true || req.body?.regenerate === true;

    const out = await withMongoTransaction(async (session) => {
      const doc = await Tournament.findById(tournament._id).session(session);
      const result = await generateAndPublishPairings({
        tournament: doc,
        actorUserId: req.user.userId,
        forceRegenerate,
        session,
      });
      const refreshed = await Tournament.findById(tournament._id).session(session);
      await computeAndPersistPlayerStats(refreshed, session);
      const detail = await buildTournamentDetail(refreshed, req.user.userId);
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
    res.json({ success: true, ...out.detail });
  } catch (error) {
    console.error("Generate pairings error:", error);
    res.status(400).json({ error: error?.message || "Failed to generate pairings" });
  }
});

router.post("/:id/pairings/publish", authMiddleware, async (req, res) => {
  try {
    const tournament = await ensureOrganizerAccess(req, res, req.params.id);
    if (!tournament) return;

    const out = await withMongoTransaction(async (session) => {
      const doc = await Tournament.findById(tournament._id).session(session);
      const result = await publishPairings({
        tournament: doc,
        actorUserId: req.user.userId,
        session,
      });
      await computeAndPersistPlayerStats(doc, session);
      const refreshed = await Tournament.findById(tournament._id).session(session);
      const detail = await buildTournamentDetail(refreshed, req.user.userId);
      return { detail, published: result.published, refreshed };
    });

    emitTournamentStateChanged(req.app, out.refreshed, TOURNAMENT_STATES.LIVE_ROUND);
    emitPairingsPublished(
      req.app,
      out.refreshed,
      Number(out.refreshed.currentRound || 0),
      (out.published || []).map((game) => toRoundPairingPayload(game)),
    );
    emitRoundBoardAssignments(
      req.app,
      out.refreshed,
      Number(out.refreshed.currentRound || 0),
      (out.published || []).map((game) => toRoundPairingPayload(game)),
    );
    emitStandingsUpdated(req.app, out.refreshed, out.detail.standings || []);
    res.json({ success: true, ...out.detail });
  } catch (error) {
    console.error("Publish pairings error:", error);
    res.status(400).json({ error: error?.message || "Failed to publish pairings" });
  }
});

async function submitResultHandler(req, res) {
  return res.status(410).json({
    error:
      "Manual result entry is disabled. Results are recorded automatically when board games finish.",
  });
}

router.patch("/:id/games/:gameId/result", authMiddleware, submitResultHandler);
router.post("/:id/games/:gameId/result", authMiddleware, submitResultHandler);

router.post("/:id/rounds/:roundId/close", authMiddleware, async (req, res) => {
  try {
    const tournament = await ensureOrganizerAccess(req, res, req.params.id);
    if (!tournament) return;
    const roundNumber = Number(req.params.roundId || 0);
    if (!Number.isInteger(roundNumber) || roundNumber <= 0) {
      return res.status(400).json({ error: "Invalid round id" });
    }
    const state = ensureTournamentState(tournament);
    if (!isLiveRoundState(state)) {
      return res.status(400).json({ error: "Round can only be closed from LIVE_ROUND state." });
    }
    if (roundNumber !== Number(tournament.currentRound || 0)) {
      return res.status(400).json({ error: "Only the current round can be closed." });
    }

    const pending = await TournamentGame.countDocuments({
      tournamentId: tournament._id,
      roundNumber,
      isPublished: true,
      result: "*",
    });
    if (pending > 0) {
      return res.status(400).json({ error: "All results must be entered before closing the round." });
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
            label: asRoundLabel(roundNumber),
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
        actorUserId: req.user.userId,
        meta: { roundNumber },
      });

      const refreshed = await Tournament.findById(doc._id).session(session);
      const detail = await buildTournamentDetail(refreshed, req.user.userId);
      return { standings, detail, refreshed };
    });

    emitTournamentStateChanged(req.app, out.refreshed, TOURNAMENT_STATES.ROUND_CLOSED);
    emitRoundClosed(req.app, out.refreshed, roundNumber, out.detail.standings || []);
    emitStandingsUpdated(req.app, out.refreshed, out.detail.standings || []);
    res.json({ success: true, ...out.detail });
  } catch (error) {
    console.error("Round close error:", error);
    res.status(500).json({ error: error?.message || "Failed to close round" });
  }
});

router.post("/:id/players/:playerId/withdraw", authMiddleware, async (req, res) => {
  try {
    const tournament = await ensureOrganizerAccess(req, res, req.params.id);
    if (!tournament) return;
    const state = ensureTournamentState(tournament);
    if (state === TOURNAMENT_STATES.FINISHED) {
      return res.status(400).json({ error: "Tournament is already finished." });
    }

    const reason = String(req.body?.reason || "").trim().slice(0, 300);
    const playerFilter = isValidObjectId(req.params.playerId)
      ? { _id: req.params.playerId, tournamentId: tournament._id }
      : { userId: req.params.playerId, tournamentId: tournament._id };
    const player = await TournamentPlayer.findOne(playerFilter);
    if (!player) {
      return res.status(404).json({ error: "Player not found in tournament." });
    }
    if (player.status === "withdrawn") {
      const detail = await buildTournamentDetail(tournament, req.user.userId);
      return res.json({ success: true, ...detail });
    }

    const out = await withMongoTransaction(async (session) => {
      const doc = await Tournament.findById(tournament._id).session(session);
      await TournamentPlayer.updateOne(
        { _id: player._id },
        {
          $set: {
            status: "withdrawn",
            withdrawnAt: new Date(),
            withdrawnReason: reason,
          },
        },
        { session },
      );

      if (isLiveRoundState(doc.status)) {
        const pendingGames = await TournamentGame.find({
          tournamentId: doc._id,
          roundNumber: Number(doc.currentRound || 0),
          isPublished: true,
          result: "*",
          $or: [{ whiteId: player.userId }, { blackId: player.userId }],
        })
          .session(session)
          .lean();

        for (const pendingGame of pendingGames) {
          const forfeitResult =
            toId(pendingGame.whiteId) === toId(player.userId) ? "0-1F" : "1-0F";
          await applyGameResultWithElo({
            tournament: doc,
            game: pendingGame,
            result: forfeitResult,
            session,
            source: "system",
          });
        }
      }

      await computeAndPersistPlayerStats(doc, session);
      const refreshed = await Tournament.findById(doc._id).session(session);
      const detail = await buildTournamentDetail(refreshed, req.user.userId);
      return { detail, refreshed };
    });

    const progression = await maybeAdvanceTournament(out.refreshed._id, {
      returnMeta: true,
    });
    const progressedTournament = progression?.tournament || out.refreshed;
    const responseDetail = await buildTournamentDetail(progressedTournament, req.user.userId);

    emitStandingsUpdated(req.app, progressedTournament, responseDetail.standings || []);
    for (const closedRound of progression?.roundsClosed || []) {
      emitRoundClosed(
        req.app,
        progressedTournament,
        Number(closedRound || 0),
        responseDetail.standings || [],
      );
    }
    for (const roundMeta of progression?.roundsStarted || []) {
      const roundNumber = Number(roundMeta?.roundNumber || 0);
      const pairings = Array.isArray(roundMeta?.pairings) ? roundMeta.pairings : [];
      emitTournamentStateChanged(req.app, progressedTournament, TOURNAMENT_STATES.LIVE_ROUND);
      emitPairingsPublished(req.app, progressedTournament, roundNumber, pairings);
      emitRoundBoardAssignments(req.app, progressedTournament, roundNumber, pairings);
    }
    if (progression?.finished) {
      emitTournamentStateChanged(req.app, progressedTournament, TOURNAMENT_STATES.FINISHED);
      emitTournamentFinished(
        req.app,
        progressedTournament,
        responseDetail.winners?.[0] || null,
        responseDetail.winners || [],
        responseDetail.standings || [],
      );
    }

    res.json({ success: true, ...responseDetail });
  } catch (error) {
    console.error("Withdraw player error:", error);
    res.status(500).json({ error: error?.message || "Failed to withdraw player" });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const tournament = await ensureOrganizerAccess(req, res, req.params.id);
    if (!tournament) return;
    const state = ensureTournamentState(tournament);
    if (state !== TOURNAMENT_STATES.DRAFT) {
      return res.status(400).json({ error: "Only DRAFT tournaments can be deleted." });
    }
    await Promise.all([
      TournamentGame.deleteMany({ tournamentId: tournament._id }),
      TournamentPlayer.deleteMany({ tournamentId: tournament._id }),
      TournamentStandingSnapshot.deleteMany({ tournamentId: tournament._id }),
      TournamentTransitionLog.deleteMany({ tournamentId: tournament._id }),
      Tournament.deleteOne({ _id: tournament._id }),
    ]);
    res.json({ success: true, id: toId(tournament._id) });
  } catch (error) {
    console.error("Tournament delete error:", error);
    res.status(500).json({ error: "Failed to delete tournament" });
  }
});

router.post("/:id/start", authMiddleware, async (req, res) => {
  try {
    const tournament = await ensureOrganizerAccess(req, res, req.params.id);
    if (!tournament) return;

    const out = await withMongoTransaction(async (session) => {
      const doc = await Tournament.findById(tournament._id).session(session);
      const state = normalizeTournamentState(doc.status);
      if (state === TOURNAMENT_STATES.DRAFT) {
        await Tournament.updateOne(
          { _id: doc._id },
          { $set: { status: TOURNAMENT_STATES.REGISTRATION_OPEN }, $inc: { stateVersion: 1 } },
          { session },
        );
        await logStateTransition({
          session,
          tournamentId: doc._id,
          fromState: TOURNAMENT_STATES.DRAFT,
          toState: TOURNAMENT_STATES.REGISTRATION_OPEN,
          action: "open_registration",
          actorUserId: req.user.userId,
        });
      }
      const refreshed = await Tournament.findById(doc._id).session(session);
      await generatePairingsPreview({
        tournament: refreshed,
        actorUserId: req.user.userId,
        forceRegenerate: false,
        session,
      });
      const latest = await Tournament.findById(doc._id).session(session);
      const publishOut = await publishPairings({
        tournament: latest,
        actorUserId: req.user.userId,
        session,
      });
      await computeAndPersistPlayerStats(latest, session);
      const finalDoc = await Tournament.findById(doc._id).session(session);
      const detail = await buildTournamentDetail(finalDoc, req.user.userId);
      return { detail, finalDoc, publishOut };
    });

    emitTournamentStateChanged(req.app, out.finalDoc, TOURNAMENT_STATES.LIVE_ROUND);
    emitPairingsPublished(
      req.app,
      out.finalDoc,
      Number(out.finalDoc.currentRound || 0),
      (out.publishOut.published || []).map((game) => toRoundPairingPayload(game)),
    );
    emitRoundBoardAssignments(
      req.app,
      out.finalDoc,
      Number(out.finalDoc.currentRound || 0),
      (out.publishOut.published || []).map((game) => toRoundPairingPayload(game)),
    );
    emitStandingsUpdated(req.app, out.finalDoc, out.detail.standings || []);
    res.json({ success: true, ...out.detail });
  } catch (error) {
    console.error("Legacy start error:", error);
    res.status(500).json({ error: error?.message || "Failed to start tournament" });
  }
});

router.post("/:id/rounds/:round/pair", authMiddleware, async (req, res) => {
  try {
    const tournament = await ensureOrganizerAccess(req, res, req.params.id);
    if (!tournament) return;
    const out = await withMongoTransaction(async (session) => {
      const doc = await Tournament.findById(tournament._id).session(session);
      await generatePairingsPreview({
        tournament: doc,
        actorUserId: req.user.userId,
        forceRegenerate: false,
        session,
      });
      const fresh = await Tournament.findById(tournament._id).session(session);
      const publishOut = await publishPairings({
        tournament: fresh,
        actorUserId: req.user.userId,
        session,
      });
      await computeAndPersistPlayerStats(fresh, session);
      const latest = await Tournament.findById(tournament._id).session(session);
      const detail = await buildTournamentDetail(latest, req.user.userId);
      return { detail, latest, publishOut };
    });
    emitTournamentStateChanged(req.app, out.latest, TOURNAMENT_STATES.LIVE_ROUND);
    emitPairingsPublished(
      req.app,
      out.latest,
      Number(out.latest.currentRound || 0),
      (out.publishOut.published || []).map((game) => toRoundPairingPayload(game)),
    );
    emitRoundBoardAssignments(
      req.app,
      out.latest,
      Number(out.latest.currentRound || 0),
      (out.publishOut.published || []).map((game) => toRoundPairingPayload(game)),
    );
    emitStandingsUpdated(req.app, out.latest, out.detail.standings || []);
    res.json({ success: true, ...out.detail });
  } catch (error) {
    console.error("Legacy pair round error:", error);
    res.status(500).json({ error: error?.message || "Failed to pair round" });
  }
});

router.post("/:id/rounds/:round/repair", authMiddleware, async (req, res) => {
  try {
    const tournament = await ensureOrganizerAccess(req, res, req.params.id);
    if (!tournament) return;
    const targetRound = Number(req.params.round || 0);
    if (!Number.isInteger(targetRound) || targetRound <= 0) {
      return res.status(400).json({ error: "Invalid round number" });
    }

    if (targetRound !== Number(tournament.currentRound || 0)) {
      return res.status(400).json({ error: "Only the current round can be repaired." });
    }
    const publishedInRound = await TournamentGame.countDocuments({
      tournamentId: tournament._id,
      roundNumber: targetRound,
      isPublished: true,
    });
    if (publishedInRound > 0) {
      return res.status(400).json({
        error: "Round repair is only available before pairings are published.",
      });
    }

    const out = await withMongoTransaction(async (session) => {
      const registeredPlayers = await TournamentPlayer.find({
        tournamentId: tournament._id,
        status: { $ne: "withdrawn" },
      })
        .select("userId")
        .session(session)
        .lean();
      const registeredIds = registeredPlayers.map((player) => toId(player.userId));
      const existingGames = await TournamentGame.find({
        tournamentId: tournament._id,
        roundNumber: { $lt: targetRound },
      })
        .session(session)
        .lean();

      const repaired = buildManualRoundPairings({
        roundNumber: targetRound,
        pairings: req.body?.pairings,
        registeredIds,
        existingGames,
        tournamentType: tournament.type,
        allowRematch: req.body?.allowRematch === true,
      });

      await TournamentGame.deleteMany({
        tournamentId: tournament._id,
        roundNumber: targetRound,
        isPublished: false,
      }).session(session);

      const usersById = await fetchUsersMap(registeredIds, session);
      const games = repaired.map((pairing) => ({
        tournamentId: tournament._id,
        roundNumber: targetRound,
        matchIndex: Number(pairing.matchIndex || 0),
        boardNumber: Number(pairing.matchIndex || 0) + 1,
        whiteId: pairing.whiteId,
        blackId: pairing.blackId || null,
        result: pairing.result || "*",
        gameId: pairing.gameId || crypto.randomBytes(10).toString("hex"),
        winnerId: pairing.winnerId || null,
        liveStatus: pairing.result && pairing.result !== "*" ? "completed" : "pending",
        startedAt: null,
        isBye: !!pairing.isBye,
        finishedAt: pairing.result && pairing.result !== "*" ? new Date() : null,
        isPublished: false,
        whiteRatingAtPairing: Number(usersById.get(toId(pairing.whiteId))?.rating || 1200),
        blackRatingAtPairing: pairing.blackId
          ? Number(usersById.get(toId(pairing.blackId))?.rating || 1200)
          : null,
        whiteEloDelta: 0,
        blackEloDelta: 0,
        timeControlSnapshot: {
          baseMs: Number(tournament.timeControl?.baseMs || 300000),
          incMs: Number(tournament.timeControl?.incMs || 0),
          label: formatTimeControlLabel(tournament.timeControl),
        },
      }));
      await TournamentGame.insertMany(games, { session });

      const refreshed = await Tournament.findById(tournament._id).session(session);
      const detail = await buildTournamentDetail(refreshed, req.user.userId);
      return { detail, refreshed };
    });

    res.json({ success: true, ...out.detail });
  } catch (error) {
    console.error("Repair round error:", error);
    res.status(400).json({ error: error?.message || "Failed to repair round" });
  }
});

router.post("/:id/finish", authMiddleware, async (req, res) => {
  try {
    const tournament = await ensureOrganizerAccess(req, res, req.params.id);
    if (!tournament) return;
    const out = await withMongoTransaction(async (session) => {
      const doc = await Tournament.findById(tournament._id).session(session);
      await completeTournament({
        tournament: doc,
        actorUserId: req.user.userId,
        session,
      });
      const refreshed = await Tournament.findById(doc._id).session(session);
      const detail = await buildTournamentDetail(refreshed, req.user.userId);
      return { refreshed, detail };
    });
    emitTournamentStateChanged(req.app, out.refreshed, TOURNAMENT_STATES.FINISHED);
    emitTournamentFinished(
      req.app,
      out.refreshed,
      out.detail.winners?.[0] || null,
      out.detail.winners || [],
      out.detail.standings || [],
    );
    res.json({ success: true, ...out.detail });
  } catch (error) {
    console.error("Finish tournament error:", error);
    res.status(500).json({ error: error?.message || "Failed to finish tournament" });
  }
});

router.post("/:id/stop", authMiddleware, async (req, res) => {
  try {
    const tournament = await ensureOrganizerAccess(req, res, req.params.id);
    if (!tournament) return;
    const out = await withMongoTransaction(async (session) => {
      const doc = await Tournament.findById(tournament._id).session(session);
      await completeTournament({
        tournament: doc,
        actorUserId: req.user.userId,
        session,
      });
      const refreshed = await Tournament.findById(doc._id).session(session);
      const detail = await buildTournamentDetail(refreshed, req.user.userId);
      return { refreshed, detail };
    });
    emitTournamentStateChanged(req.app, out.refreshed, TOURNAMENT_STATES.FINISHED);
    emitTournamentFinished(
      req.app,
      out.refreshed,
      out.detail.winners?.[0] || null,
      out.detail.winners || [],
      out.detail.standings || [],
    );
    res.json({ success: true, ...out.detail });
  } catch (error) {
    console.error("Stop tournament error:", error);
    res.status(500).json({ error: error?.message || "Failed to stop tournament" });
  }
});

export {
  buildTournamentDetail,
  completeTournament,
  computeAndPersistPlayerStats,
  ensureTournamentState,
  generateAndPublishPairings,
  generatePairingsPreview,
  logStateTransition,
  parseTemplatePayload,
  publishPairings,
  toRoundPairingPayload,
  withMongoTransaction,
};

export default router;
