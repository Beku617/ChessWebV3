import { Router } from "express";
import mongoose from "mongoose";
import { authMiddleware } from "../middleware/index.js";
import {
  Tournament,
  TournamentPlayer,
  TournamentGame,
  User,
} from "../models/index.js";
import {
  buildManualRoundPairings,
  computeRoundsPlanned,
  createPlayerStatsMap,
  generateRoundPairings,
  getUserRatingForTournament,
  parseTimeControl,
  sortStandings,
} from "../utils/tournamentEngine.js";
import {
  markTournamentGameStarted,
  syncTournamentGameResultByGameId,
} from "../services/tournamentRuntime.js";

const router = Router();

const TOURNAMENT_TYPES = new Set(["swiss"]);
const REPORTABLE_RESULTS = new Set(["1-0", "0-1", "1/2-1/2"]);

function toId(value) {
  return value ? String(value) : "";
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

function toNonNegativeInt(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

function toTournamentSummary(tournament, extras = {}) {
  return {
    id: toId(tournament._id),
    name: tournament.name,
    type: tournament.type,
    timeControl: tournament.timeControl,
    ratingMin: tournament.ratingMin ?? null,
    ratingMax: tournament.ratingMax ?? null,
    status: tournament.status,
    roundsPlanned: tournament.roundsPlanned,
    currentRound: tournament.currentRound,
    createdBy: toId(tournament.createdBy),
    managerIds: Array.isArray(tournament.managerIds)
      ? tournament.managerIds.map((managerId) => toId(managerId)).filter(Boolean)
      : [],
    startedAt: tournament.startedAt ?? null,
    finishedAt: tournament.finishedAt ?? null,
    createdAt: tournament.createdAt ?? null,
    updatedAt: tournament.updatedAt ?? null,
    ...extras,
  };
}

function hasManageAccess(tournament, userId) {
  const normalizedUserId = toId(userId);
  if (!normalizedUserId) return false;
  if (toId(tournament.createdBy) === normalizedUserId) return true;
  if (!Array.isArray(tournament.managerIds)) return false;
  return tournament.managerIds.some(
    (managerId) => toId(managerId) === normalizedUserId,
  );
}

function isOwner(tournament, userId) {
  return toId(tournament?.createdBy) === toId(userId);
}

function uniqueIds(values) {
  return [...new Set((values || []).map((value) => toId(value)).filter(Boolean))];
}

function createTournamentLink(tournamentId) {
  return `/tournaments?selected=${encodeURIComponent(String(tournamentId || ""))}`;
}

async function safeNotifyUser(app, input) {
  void app;
  void input;
}

async function safeNotifyUsers(app, userIds, input) {
  void app;
  void userIds;
  void input;
}

function getTournamentManagerIds(tournament) {
  return uniqueIds([toId(tournament?.createdBy), ...(tournament?.managerIds || [])]);
}

async function getTournamentParticipantIds(tournamentId) {
  const players = await TournamentPlayer.find({ tournamentId })
    .select("userId")
    .lean();
  return uniqueIds(players.map((player) => toId(player.userId)));
}

async function notifyTournamentStarted(app, tournament) {
  const participantIds = await getTournamentParticipantIds(tournament._id);
  if (!participantIds.length) return;

  await safeNotifyUsers(app, participantIds, {
    type: "tournament_started",
    title: "Tournament started",
    message: `${tournament.name} has started.`,
    link: createTournamentLink(tournament._id),
    payload: {
      tournamentId: toId(tournament._id),
      roundNumber: Number(tournament.currentRound || 1),
    },
  });
}

async function notifyTournamentFinished(app, tournament) {
  const participantIds = await getTournamentParticipantIds(tournament._id);
  if (!participantIds.length) return;

  await safeNotifyUsers(app, participantIds, {
    type: "tournament_finished",
    title: "Tournament finished",
    message: `${tournament.name} has finished.`,
    link: createTournamentLink(tournament._id),
    payload: {
      tournamentId: toId(tournament._id),
    },
  });
}

async function notifyRoundPairings(app, tournament, pairings, roundNumber) {
  if (!Array.isArray(pairings) || !pairings.length) return;
  const tournamentId = toId(tournament?._id);
  const round = Number(roundNumber || 0);
  if (!tournamentId || !round) return;

  const participantIds = await getTournamentParticipantIds(tournament._id);
  if (participantIds.length) {
    await safeNotifyUsers(app, participantIds, {
      type: "tournament_round_created",
      title: `Round ${round} paired`,
      message: `${tournament.name}: round ${round} pairings are ready.`,
      link: createTournamentLink(tournament._id),
      payload: {
        tournamentId,
        roundNumber: round,
      },
    });
  }

  const notifyTasks = pairings.map(async (pairing) => {
    const whiteId = toId(pairing.whiteId);
    const blackId = toId(pairing.blackId);
    const gameId = String(pairing.gameId || "");
    const gameLink = gameId
      ? `/play/quick?tournamentGameId=${encodeURIComponent(gameId)}`
      : createTournamentLink(tournament._id);

    if (pairing.isBye || !blackId) {
      if (!whiteId) return;
      await safeNotifyUser(app, {
        userId: whiteId,
        type: "tournament_bye",
        title: `Round ${round} bye`,
        message: `You received a bye in ${tournament.name} round ${round}.`,
        link: createTournamentLink(tournament._id),
        payload: {
          tournamentId,
          roundNumber: round,
        },
      });
      return;
    }

    await Promise.all([
      safeNotifyUser(app, {
        userId: whiteId,
        type: "tournament_game_ready",
        title: `Round ${round} game ready`,
        message: `Your game is ready as White in ${tournament.name}.`,
        link: gameLink,
        payload: {
          tournamentId,
          roundNumber: round,
          gameId,
          color: "white",
          opponentId: blackId,
        },
      }),
      safeNotifyUser(app, {
        userId: blackId,
        type: "tournament_game_ready",
        title: `Round ${round} game ready`,
        message: `Your game is ready as Black in ${tournament.name}.`,
        link: gameLink,
        payload: {
          tournamentId,
          roundNumber: round,
          gameId,
          color: "black",
          opponentId: whiteId,
        },
      }),
    ]);
  });

  await Promise.all(notifyTasks);
}

async function refreshTournamentStats(tournamentId, tournamentType) {
  const players = await TournamentPlayer.find({ tournamentId }).lean();
  if (!players.length) return;

  const games = await TournamentGame.find({ tournamentId }).lean();
  const statsMap = createPlayerStatsMap(players, games, tournamentType);

  const operations = players.map((player) => {
    const stats = statsMap.get(toId(player.userId)) || {
      score: 0,
      buchholz: 0,
      gamesPlayed: 0,
      hadBye: false,
    };
    return {
      updateOne: {
        filter: { _id: player._id },
        update: {
          $set: {
            score: stats.score,
            buchholz: stats.buchholz,
            gamesPlayed: stats.gamesPlayed,
            hadBye: stats.hadBye,
          },
        },
      },
    };
  });

  if (operations.length > 0) {
    await TournamentPlayer.bulkWrite(operations);
  }
}

async function buildTournamentDetail(tournament, viewerId) {
  const tournamentId = tournament._id;

  const [playerDocs, gameDocs] = await Promise.all([
    TournamentPlayer.find({ tournamentId }).sort({ seed: 1, joinedAt: 1 }).lean(),
    TournamentGame.find({ tournamentId })
      .sort({ roundNumber: 1, matchIndex: 1, createdAt: 1 })
      .lean(),
  ]);

  const ownerId = toId(tournament.createdBy);
  const managerIds = Array.isArray(tournament.managerIds)
    ? tournament.managerIds.map((managerId) => toId(managerId)).filter(Boolean)
    : [];
  const userIds = [
    ...new Set(
      [
        ...playerDocs.map((player) => toId(player.userId)),
        ownerId,
        ...managerIds,
      ].filter(Boolean),
    ),
  ];
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } })
        .select(
          "fullName avatar rating bulletRating blitzRating rapidRating classicalRating",
        )
        .lean()
    : [];
  const userMap = new Map(users.map((user) => [toId(user._id), user]));

  const players = playerDocs.map((player) => {
    const user = userMap.get(toId(player.userId));
    return {
      id: toId(player._id),
      userId: toId(player.userId),
      name: user?.fullName || "Player",
      avatar: user?.avatar || "",
      rating: Number(user?.rating || 1200),
      seed: player.seed,
      score: Number(player.score || 0),
      buchholz: Number(player.buchholz || 0),
      gamesPlayed: Number(player.gamesPlayed || 0),
      hadBye: !!player.hadBye,
      joinedAt: player.joinedAt,
    };
  });

  const standings = sortStandings(players).map((player, index) => ({
    rank: index + 1,
    userId: player.userId,
    name: player.name,
    avatar: player.avatar,
    score: player.score,
    buchholz: player.buchholz,
    seed: player.seed,
    rating: player.rating,
    gamesPlayed: player.gamesPlayed,
    hadBye: player.hadBye,
  }));

  const winners = standings.slice(0, 3).map((player, index) => ({
    rank: player.rank,
    userId: player.userId,
    name: player.name,
    avatar: player.avatar,
    score: player.score,
    buchholz: player.buchholz,
    medal: index === 0 ? "gold" : index === 1 ? "silver" : "bronze",
  }));

  const roundsMap = new Map();
  for (const game of gameDocs) {
    const roundNumber = Number(game.roundNumber || 0);
    if (!roundsMap.has(roundNumber)) {
      roundsMap.set(roundNumber, []);
    }

    const whiteId = toId(game.whiteId);
    const blackId = toId(game.blackId);
    const whiteUser = userMap.get(whiteId);
    const blackUser = userMap.get(blackId);

    roundsMap.get(roundNumber).push({
      id: toId(game._id),
      gameId: game.gameId,
      roundNumber,
      matchIndex: Number(game.matchIndex || 0),
      whiteId,
      whiteName: whiteUser?.fullName || "Player",
      blackId: blackId || "",
      blackName: blackId ? blackUser?.fullName || "Player" : "BYE",
      result: game.result,
      winnerId: toId(game.winnerId),
      isBye: !!game.isBye,
      status: game.result === "*" ? "pending" : "complete",
      createdAt: game.createdAt ?? null,
      finishedAt: game.finishedAt ?? null,
    });
  }

  const rounds = [...roundsMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([roundNumber, games]) => ({
      roundNumber,
      games: [...games].sort((a, b) => a.matchIndex - b.matchIndex),
    }));

  const managerOrder = [...new Set([ownerId, ...managerIds].filter(Boolean))];
  const managers = managerOrder.map((managerId) => {
    const user = userMap.get(managerId);
    return {
      userId: managerId,
      name: user?.fullName || "User",
      avatar: user?.avatar || "",
      isOwner: managerId === ownerId,
    };
  });

  const viewerIdString = toId(viewerId);
  const isRegistered = players.some(
    (player) => toId(player.userId) === viewerIdString,
  );
  const canManage = hasManageAccess(tournament, viewerIdString);

  return {
    tournament: toTournamentSummary(tournament, {
      registeredCount: players.length,
      canManage,
      isRegistered,
    }),
    players,
    standings,
    winners,
    rounds,
    managers,
  };
}

async function maybeAdvanceTournament(tournamentId, options = {}) {
  const app = options?.app || null;
  let tournament = await Tournament.findOne({ _id: tournamentId, type: "swiss" });
  if (!tournament || tournament.status !== "running") {
    return tournament;
  }

  let guard = 0;
  while (guard < 12 && tournament.status === "running") {
    const pendingGames = await TournamentGame.countDocuments({
      tournamentId,
      roundNumber: tournament.currentRound,
      result: "*",
    });
    if (pendingGames > 0) break;

    if (tournament.currentRound >= Number(tournament.roundsPlanned || 1)) {
      tournament = await Tournament.findByIdAndUpdate(
        tournamentId,
        { $set: { status: "finished", finishedAt: new Date() } },
        { new: true },
      );
      if (tournament) {
        await notifyTournamentFinished(app, tournament);
      }
      break;
    }

    const nextRound = Number(tournament.currentRound || 0) + 1;
    const [players, games] = await Promise.all([
      TournamentPlayer.find({ tournamentId }).lean(),
      TournamentGame.find({ tournamentId }).lean(),
    ]);
    const pairings = generateRoundPairings({
      tournamentType: tournament.type,
      players,
      games,
      roundNumber: nextRound,
    });

    if (!pairings.length) {
      tournament = await Tournament.findByIdAndUpdate(
        tournamentId,
        { $set: { status: "finished", finishedAt: new Date() } },
        { new: true },
      );
      if (tournament) {
        await notifyTournamentFinished(app, tournament);
      }
      break;
    }

    await TournamentGame.insertMany(
      pairings.map((pairing) => ({ ...pairing, tournamentId })),
    );

    tournament = await Tournament.findByIdAndUpdate(
      tournamentId,
      { $set: { currentRound: nextRound } },
      { new: true },
    );
    await refreshTournamentStats(tournamentId, tournament.type);
    if (tournament) {
      await notifyRoundPairings(app, tournament, pairings, nextRound);
    }
    guard += 1;
  }

  return tournament;
}

router.get("/", authMiddleware, async (req, res) => {
  try {
    const { type, status } = req.query;
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));

    const query = { type: "swiss" };
    if (type && TOURNAMENT_TYPES.has(String(type))) {
      query.type = String(type);
    }
    if (status) {
      query.status = String(status);
    }

    const tournaments = await Tournament.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const tournamentIds = tournaments.map((tournament) => tournament._id);
    const countAgg = tournamentIds.length
      ? await TournamentPlayer.aggregate([
          { $match: { tournamentId: { $in: tournamentIds } } },
          { $group: { _id: "$tournamentId", count: { $sum: 1 } } },
        ])
      : [];
    const countMap = new Map(
      countAgg.map((item) => [toId(item._id), Number(item.count || 0)]),
    );

    const viewerTournamentRegs = tournamentIds.length
      ? await TournamentPlayer.find({
          tournamentId: { $in: tournamentIds },
          userId: req.user.userId,
        })
          .select("tournamentId")
          .lean()
      : [];
    const regSet = new Set(
      viewerTournamentRegs.map((registration) => toId(registration.tournamentId)),
    );

    res.json({
      tournaments: tournaments.map((tournament) =>
        toTournamentSummary(tournament, {
          registeredCount: countMap.get(toId(tournament._id)) || 0,
          isRegistered: regSet.has(toId(tournament._id)),
          canManage: hasManageAccess(tournament, req.user.userId),
        }),
      ),
    });
  } catch (error) {
    console.error("Tournament list error:", error);
    res.status(500).json({ error: "Failed to fetch tournaments" });
  }
});

router.post("/", authMiddleware, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const type = String(req.body?.type || "swiss").trim();
    if (!name) {
      return res.status(400).json({ error: "Tournament name is required" });
    }
    if (!TOURNAMENT_TYPES.has(type)) {
      return res.status(400).json({ error: "Invalid tournament type" });
    }

    const timeControl = parseTimeControl(req.body?.timeControl);

    const noRatingFilter = req.body?.noRatingFilter === true;
    const ratingMin = noRatingFilter
      ? null
      : toNonNegativeInt(req.body?.ratingMin, null);
    const ratingMax = noRatingFilter
      ? null
      : toNonNegativeInt(req.body?.ratingMax, null);
    if (
      ratingMin !== null &&
      ratingMax !== null &&
      Number(ratingMin) > Number(ratingMax)
    ) {
      return res
        .status(400)
        .json({ error: "ratingMin cannot be greater than ratingMax" });
    }

    const roundsRequested = toNonNegativeInt(req.body?.roundsPlanned, null);
    const roundsPlanned =
      type === "swiss" && roundsRequested && roundsRequested > 0
        ? roundsRequested
        : 1;

    const tournament = await Tournament.create({
      name,
      type,
      timeControl,
      ratingMin,
      ratingMax,
      roundsPlanned,
      status: "registering",
      currentRound: 0,
      createdBy: req.user.userId,
      managerIds: [],
    });

    res.status(201).json({
      tournament: toTournamentSummary(tournament, {
        registeredCount: 0,
        isRegistered: false,
        canManage: true,
      }),
    });
  } catch (error) {
    console.error("Tournament create error:", error);
    res.status(500).json({ error: "Failed to create tournament" });
  }
});

router.post("/:id/managers", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid tournament id" });
    }

    const managerId = String(req.body?.managerId || "").trim();
    if (!isValidObjectId(managerId)) {
      return res.status(400).json({ error: "Invalid manager user id" });
    }

    const tournament = await Tournament.findOne({ _id: id, type: "swiss" });
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    if (toId(tournament.createdBy) !== toId(req.user.userId)) {
      return res
        .status(403)
        .json({ error: "Only the owner can manage tournament managers" });
    }

    if (toId(tournament.createdBy) === toId(managerId)) {
      return res.status(400).json({ error: "Owner is already a manager" });
    }

    await Tournament.updateOne(
      { _id: tournament._id },
      { $addToSet: { managerIds: managerId } },
    );

    const refreshed = await Tournament.findOne({ _id: id, type: "swiss" });
    const detail = await buildTournamentDetail(refreshed, req.user.userId);
    res.json({ success: true, ...detail });
  } catch (error) {
    console.error("Tournament add manager error:", error);
    res.status(500).json({ error: "Failed to add manager" });
  }
});

router.delete("/:id/managers/:managerId", authMiddleware, async (req, res) => {
  try {
    const { id, managerId } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid tournament id" });
    }
    if (!isValidObjectId(managerId)) {
      return res.status(400).json({ error: "Invalid manager user id" });
    }

    const tournament = await Tournament.findOne({ _id: id, type: "swiss" });
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }
    if (toId(tournament.createdBy) !== toId(req.user.userId)) {
      return res
        .status(403)
        .json({ error: "Only the owner can manage tournament managers" });
    }

    await Tournament.updateOne(
      { _id: tournament._id },
      { $pull: { managerIds: managerId } },
    );

    const refreshed = await Tournament.findOne({ _id: id, type: "swiss" });
    const detail = await buildTournamentDetail(refreshed, req.user.userId);
    res.json({ success: true, ...detail });
  } catch (error) {
    console.error("Tournament remove manager error:", error);
    res.status(500).json({ error: "Failed to remove manager" });
  }
});

router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid tournament id" });
    }

    const tournament = await Tournament.findOne({ _id: id, type: "swiss" });
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    await refreshTournamentStats(tournament._id, tournament.type);
    const refreshed = await Tournament.findOne({ _id: tournament._id, type: "swiss" });
    const detail = await buildTournamentDetail(refreshed, req.user.userId);
    res.json(detail);
  } catch (error) {
    console.error("Tournament detail error:", error);
    res.status(500).json({ error: "Failed to fetch tournament detail" });
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
    if (tournament.status !== "registering") {
      return res
        .status(400)
        .json({ error: "Tournament is not open for registration" });
    }

    const user = await User.findById(req.user.userId)
      .select("fullName rating bulletRating blitzRating rapidRating classicalRating")
      .lean();
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const playerRating = getUserRatingForTournament(user, tournament.timeControl);
    if (
      tournament.ratingMin !== null &&
      Number.isFinite(Number(tournament.ratingMin)) &&
      playerRating < Number(tournament.ratingMin)
    ) {
      return res
        .status(400)
        .json({ error: "Your rating is below the minimum requirement" });
    }
    if (
      tournament.ratingMax !== null &&
      Number.isFinite(Number(tournament.ratingMax)) &&
      playerRating > Number(tournament.ratingMax)
    ) {
      return res
        .status(400)
        .json({ error: "Your rating is above the maximum requirement" });
    }

    try {
      await TournamentPlayer.create({
        tournamentId: tournament._id,
        userId: req.user.userId,
        score: 0,
        buchholz: 0,
        gamesPlayed: 0,
        hadBye: false,
      });
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({ error: "Already registered" });
      }
      throw error;
    }

    void safeNotifyUser(req.app, {
      userId: req.user.userId,
      type: "tournament_registered",
      title: "Tournament registration confirmed",
      message: `You are registered for ${tournament.name}.`,
      link: createTournamentLink(tournament._id),
      payload: {
        tournamentId: toId(tournament._id),
      },
    });

    const managerIds = getTournamentManagerIds(tournament).filter(
      (managerId) => managerId !== toId(req.user.userId),
    );
    if (managerIds.length) {
      void safeNotifyUsers(req.app, managerIds, {
        type: "tournament_registration",
        title: "New tournament registration",
        message: `${user.fullName || "A player"} joined ${tournament.name}.`,
        link: createTournamentLink(tournament._id),
        payload: {
          tournamentId: toId(tournament._id),
          userId: toId(req.user.userId),
        },
      });
    }

    const detail = await buildTournamentDetail(tournament, req.user.userId);
    res.json({ success: true, ...detail });
  } catch (error) {
    console.error("Tournament register error:", error);
    res.status(500).json({ error: "Failed to register for tournament" });
  }
});

router.post("/:id/unregister", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid tournament id" });
    }

    const tournament = await Tournament.findOne({ _id: id, type: "swiss" });
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }
    if (tournament.status !== "registering") {
      return res
        .status(400)
        .json({ error: "Cannot unregister after tournament start" });
    }

    await TournamentPlayer.deleteOne({
      tournamentId: tournament._id,
      userId: req.user.userId,
    });

    const detail = await buildTournamentDetail(tournament, req.user.userId);
    res.json({ success: true, ...detail });
  } catch (error) {
    console.error("Tournament unregister error:", error);
    res.status(500).json({ error: "Failed to unregister from tournament" });
  }
});

router.post("/:id/start", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid tournament id" });
    }

    const tournament = await Tournament.findOne({ _id: id, type: "swiss" });
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }
    if (!hasManageAccess(tournament, req.user.userId)) {
      return res.status(403).json({ error: "Only a tournament manager can start this tournament" });
    }
    if (tournament.status !== "registering") {
      return res
        .status(400)
        .json({ error: "Tournament cannot be started from current status" });
    }

    const players = await TournamentPlayer.find({ tournamentId: tournament._id }).lean();
    if (players.length < 2) {
      return res
        .status(400)
        .json({ error: "At least 2 registered players are required" });
    }

    const users = await User.find({
      _id: { $in: players.map((player) => player.userId) },
    })
      .select("rating bulletRating blitzRating rapidRating classicalRating")
      .lean();
    const userMap = new Map(users.map((user) => [toId(user._id), user]));

    const seededPlayers = [...players].sort((a, b) => {
      const ratingA = getUserRatingForTournament(
        userMap.get(toId(a.userId)),
        tournament.timeControl,
      );
      const ratingB = getUserRatingForTournament(
        userMap.get(toId(b.userId)),
        tournament.timeControl,
      );
      if (ratingB !== ratingA) return ratingB - ratingA;
      const joinedA = new Date(a.joinedAt || 0).getTime();
      const joinedB = new Date(b.joinedAt || 0).getTime();
      return joinedA - joinedB;
    });

    const seedOps = seededPlayers.map((player, index) => ({
      updateOne: {
        filter: { _id: player._id },
        update: {
          $set: {
            seed: index + 1,
            score: 0,
            buchholz: 0,
            gamesPlayed: 0,
            hadBye: false,
          },
        },
      },
    }));
    if (seedOps.length > 0) {
      await TournamentPlayer.bulkWrite(seedOps);
    }

    await TournamentGame.deleteMany({ tournamentId: tournament._id });

    const roundsPlanned = computeRoundsPlanned(
      tournament.type,
      seededPlayers.length,
      tournament.roundsPlanned,
    );

    let runningTournament = await Tournament.findByIdAndUpdate(
      tournament._id,
      {
        $set: {
          status: "running",
          currentRound: 1,
          roundsPlanned,
          startedAt: new Date(),
          finishedAt: null,
        },
      },
      { new: true },
    );

    const latestPlayers = await TournamentPlayer.find({
      tournamentId: tournament._id,
    }).lean();
    const pairings = generateRoundPairings({
      tournamentType: tournament.type,
      players: latestPlayers,
      games: [],
      roundNumber: 1,
    });

    await TournamentGame.insertMany(
      pairings.map((pairing) => ({
        ...pairing,
        tournamentId: tournament._id,
      })),
    );

    await refreshTournamentStats(tournament._id, tournament.type);
    void notifyTournamentStarted(req.app, runningTournament);
    void notifyRoundPairings(req.app, runningTournament, pairings, 1);
    runningTournament = await maybeAdvanceTournament(tournament._id, {
      app: req.app,
    });
    const detail = await buildTournamentDetail(runningTournament, req.user.userId);

    res.json({ success: true, ...detail });
  } catch (error) {
    console.error("Tournament start error:", error);
    res.status(500).json({ error: "Failed to start tournament" });
  }
});

router.post("/:id/rounds/:round/pair", authMiddleware, async (req, res) => {
  try {
    const { id, round } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid tournament id" });
    }

    const targetRound = Number(round);
    if (!Number.isInteger(targetRound) || targetRound <= 0) {
      return res.status(400).json({ error: "Invalid round number" });
    }

    const tournament = await Tournament.findOne({ _id: id, type: "swiss" });
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }
    if (!hasManageAccess(tournament, req.user.userId)) {
      return res.status(403).json({ error: "Only a tournament manager can pair rounds" });
    }
    if (tournament.status !== "running") {
      return res.status(400).json({ error: "Tournament is not running" });
    }
    if (targetRound !== Number(tournament.currentRound || 0) + 1) {
      return res.status(400).json({
        error: `Next pairable round is ${Number(tournament.currentRound || 0) + 1}`,
      });
    }

    const pendingGames = await TournamentGame.countDocuments({
      tournamentId: tournament._id,
      roundNumber: tournament.currentRound,
      result: "*",
    });
    if (pendingGames > 0) {
      return res.status(400).json({ error: "Current round is not complete yet" });
    }

    const [players, games] = await Promise.all([
      TournamentPlayer.find({ tournamentId: tournament._id }).lean(),
      TournamentGame.find({ tournamentId: tournament._id }).lean(),
    ]);
    const pairings = generateRoundPairings({
      tournamentType: tournament.type,
      players,
      games,
      roundNumber: targetRound,
    });

    if (!pairings.length) {
      const finishedTournament = await Tournament.findByIdAndUpdate(
        tournament._id,
        { $set: { status: "finished", finishedAt: new Date() } },
        { new: true },
      );
      const detail = await buildTournamentDetail(
        finishedTournament,
        req.user.userId,
      );
      return res.json({ success: true, ...detail });
    }

    await TournamentGame.insertMany(
      pairings.map((pairing) => ({
        ...pairing,
        tournamentId: tournament._id,
      })),
    );
    await Tournament.findByIdAndUpdate(tournament._id, {
      $set: { currentRound: targetRound },
    });

    await refreshTournamentStats(tournament._id, tournament.type);
    void notifyRoundPairings(req.app, tournament, pairings, targetRound);
    const advancedTournament = await maybeAdvanceTournament(tournament._id, {
      app: req.app,
    });
    const detail = await buildTournamentDetail(advancedTournament, req.user.userId);

    res.json({ success: true, ...detail });
  } catch (error) {
    console.error("Tournament pair round error:", error);
    res.status(500).json({ error: "Failed to pair round" });
  }
});

router.post("/:id/rounds/:round/repair", authMiddleware, async (req, res) => {
  try {
    const { id, round } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid tournament id" });
    }

    const targetRound = Number(round);
    if (!Number.isInteger(targetRound) || targetRound <= 0) {
      return res.status(400).json({ error: "Invalid round number" });
    }

    const tournament = await Tournament.findOne({ _id: id, type: "swiss" });
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }
    if (!hasManageAccess(tournament, req.user.userId)) {
      return res
        .status(403)
        .json({ error: "Only a tournament manager can repair pairings" });
    }
    if (tournament.status !== "running") {
      return res.status(400).json({ error: "Tournament is not running" });
    }
    if (targetRound !== Number(tournament.currentRound || 0)) {
      return res.status(400).json({
        error: `Only current round (${Number(
          tournament.currentRound || 0,
        )}) pairings can be repaired`,
      });
    }

    const currentRoundGames = await TournamentGame.find({
      tournamentId: tournament._id,
      roundNumber: targetRound,
    }).lean();
    if (!currentRoundGames.length) {
      return res.status(404).json({ error: "Round pairings not found" });
    }

    const nonPendingGame = currentRoundGames.find(
      (game) => game.result !== "*" || game.liveStatus !== "pending",
    );
    if (nonPendingGame) {
      return res.status(400).json({
        error: "Round cannot be repaired after any game has started or finished",
      });
    }

    const players = await TournamentPlayer.find({
      tournamentId: tournament._id,
    })
      .select("userId")
      .lean();
    const registeredIds = players.map((player) => toId(player.userId));
    const previousGames = await TournamentGame.find({
      tournamentId: tournament._id,
      roundNumber: { $lt: targetRound },
    }).lean();

    let repairedPairings = [];
    try {
      repairedPairings = buildManualRoundPairings({
        roundNumber: targetRound,
        pairings: req.body?.pairings,
        registeredIds,
        existingGames: previousGames,
        tournamentType: tournament.type,
        allowRematch: req.body?.allowRematch === true,
      });
    } catch (error) {
      return res.status(400).json({
        error:
          error instanceof Error ? error.message : "Invalid manual pairing payload",
      });
    }

    await TournamentGame.deleteMany({
      tournamentId: tournament._id,
      roundNumber: targetRound,
    });
    await TournamentGame.insertMany(
      repairedPairings.map((pairing) => ({
        ...pairing,
        tournamentId: tournament._id,
      })),
    );

    await refreshTournamentStats(tournament._id, tournament.type);
    void notifyRoundPairings(req.app, tournament, repairedPairings, targetRound);
    const refreshed = await Tournament.findOne({ _id: tournament._id, type: "swiss" });
    const detail = await buildTournamentDetail(refreshed, req.user.userId);
    res.json({ success: true, ...detail });
  } catch (error) {
    console.error("Tournament repair pairing error:", error);
    res.status(500).json({ error: "Failed to repair round pairings" });
  }
});

router.post("/:id/games/:gameId/result", authMiddleware, async (req, res) => {
  try {
    const { id, gameId } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid tournament id" });
    }

    const result = String(req.body?.result || "").trim();
    if (!REPORTABLE_RESULTS.has(result)) {
      return res.status(400).json({ error: "Invalid game result" });
    }

    const tournament = await Tournament.findOne({ _id: id, type: "swiss" });
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }
    if (!hasManageAccess(tournament, req.user.userId)) {
      return res.status(403).json({ error: "Only a tournament manager can report results" });
    }
    if (tournament.status !== "running") {
      return res.status(400).json({ error: "Tournament is not running" });
    }

    const game = await TournamentGame.findOne({
      tournamentId: tournament._id,
      gameId,
    });
    if (!game) {
      return res.status(404).json({ error: "Tournament game not found" });
    }
    if (game.result !== "*") {
      return res.status(409).json({ error: "Result already reported" });
    }
    if (Number(game.roundNumber) !== Number(tournament.currentRound || 0)) {
      return res
        .status(400)
        .json({ error: "Only current round games can be reported" });
    }
    if (game.isBye) {
      return res.status(400).json({ error: "Bye results are automatic" });
    }

    await markTournamentGameStarted(gameId);

    const syncResult = await syncTournamentGameResultByGameId(gameId, result);
    if (!syncResult.updated) {
      if (syncResult.reason === "already_reported") {
        return res.status(409).json({ error: "Result already reported" });
      }
      return res.status(400).json({ error: "Failed to sync game result" });
    }

    const advancedTournament = await maybeAdvanceTournament(tournament._id, {
      app: req.app,
    });
    const detail = await buildTournamentDetail(advancedTournament, req.user.userId);

    res.json({ success: true, ...detail });
  } catch (error) {
    console.error("Tournament report result error:", error);
    res.status(500).json({ error: "Failed to report result" });
  }
});

router.post("/:id/finish", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid tournament id" });
    }

    const tournament = await Tournament.findOne({ _id: id, type: "swiss" });
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }
    if (!hasManageAccess(tournament, req.user.userId)) {
      return res.status(403).json({ error: "Only a tournament manager can finish this tournament" });
    }

    const finishedTournament = await Tournament.findByIdAndUpdate(
      tournament._id,
      { $set: { status: "finished", finishedAt: new Date() } },
      { new: true },
    );
    await refreshTournamentStats(finishedTournament._id, finishedTournament.type);
    void notifyTournamentFinished(req.app, finishedTournament);
    const detail = await buildTournamentDetail(
      finishedTournament,
      req.user.userId,
    );
    res.json({ success: true, ...detail });
  } catch (error) {
    console.error("Tournament finish error:", error);
    res.status(500).json({ error: "Failed to finish tournament" });
  }
});

router.post("/:id/stop", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid tournament id" });
    }

    const tournament = await Tournament.findOne({ _id: id, type: "swiss" });
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }
    if (!hasManageAccess(tournament, req.user.userId)) {
      return res
        .status(403)
        .json({ error: "Only a tournament manager can stop this tournament" });
    }

    const stoppedTournament = await Tournament.findByIdAndUpdate(
      tournament._id,
      { $set: { status: "finished", finishedAt: new Date() } },
      { new: true },
    );
    await refreshTournamentStats(stoppedTournament._id, stoppedTournament.type);
    void notifyTournamentFinished(req.app, stoppedTournament);
    const detail = await buildTournamentDetail(stoppedTournament, req.user.userId);
    res.json({ success: true, ...detail });
  } catch (error) {
    console.error("Tournament stop error:", error);
    res.status(500).json({ error: "Failed to stop tournament" });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid tournament id" });
    }

    const tournament = await Tournament.findOne({ _id: id, type: "swiss" });
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }
    if (!isOwner(tournament, req.user.userId)) {
      return res
        .status(403)
        .json({ error: "Only the tournament owner can delete this tournament" });
    }
    if (tournament.status === "running") {
      return res.status(400).json({ error: "Stop tournament before deleting" });
    }

    await Promise.all([
      TournamentGame.deleteMany({ tournamentId: tournament._id }),
      TournamentPlayer.deleteMany({ tournamentId: tournament._id }),
      Tournament.deleteOne({ _id: tournament._id }),
    ]);

    res.json({ success: true, id: toId(tournament._id) });
  } catch (error) {
    console.error("Tournament delete error:", error);
    res.status(500).json({ error: "Failed to delete tournament" });
  }
});

export default router;
