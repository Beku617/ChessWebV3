import {
  Tournament,
  TournamentGame,
  TournamentPlayer,
  TournamentEloEvent,
  User,
} from "../models/index.js";
import {
  createPlayerStatsMap,
  generateRoundPairings,
  getWinnerFromResult,
} from "../utils/tournamentEngine.js";
import { calculateTournamentEloPair } from "../modules/elo/tournamentElo.js";
import { normalizeTournamentState, TOURNAMENT_STATES } from "../modules/tournaments/stateMachine.js";

function toId(value) {
  return value ? String(value) : "";
}

function normalizeRoundPairingPayload(game = {}) {
  return {
    gameId: String(game.gameId || ""),
    board: Number(game.boardNumber || game.matchIndex + 1 || 1),
    whiteId: toId(game.whiteId),
    blackId: toId(game.blackId),
    result: String(game.result || "*"),
    isBye: !!game.isBye,
  };
}

function sortFinalPlayers(a, b) {
  const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
  if (scoreDiff !== 0) return scoreDiff;
  const buchholzDiff = Number(b.buchholz || 0) - Number(a.buchholz || 0);
  if (buchholzDiff !== 0) return buchholzDiff;
  const winsDiff = Number(b.wins || 0) - Number(a.wins || 0);
  if (winsDiff !== 0) return winsDiff;
  const seedA =
    Number.isFinite(Number(a.seed)) && Number(a.seed) > 0
      ? Number(a.seed)
      : Number.MAX_SAFE_INTEGER;
  const seedB =
    Number.isFinite(Number(b.seed)) && Number(b.seed) > 0
      ? Number(b.seed)
      : Number.MAX_SAFE_INTEGER;
  if (seedA !== seedB) return seedA - seedB;
  return toId(a.userId).localeCompare(toId(b.userId));
}

async function completeTournamentAuto(tournament) {
  await refreshTournamentStats(tournament._id, tournament.type);
  const players = await TournamentPlayer.find({
    tournamentId: tournament._id,
    status: { $ne: "withdrawn" },
  }).lean();

  const ranked = [...players].sort(sortFinalPlayers);
  const top3 = ranked.slice(0, 3).map((player, index) => {
    const eloBefore = Number(player.tournamentEloStart || 1200);
    const eloAfter = Number(player.tournamentEloCurrent || eloBefore);
    return {
      userId: player.userId,
      placement: index + 1,
      score: Number(player.score || 0),
      eloBefore,
      eloAfter,
      eloDelta: eloAfter - eloBefore,
    };
  });

  const finished = await Tournament.findByIdAndUpdate(
    tournament._id,
    {
      $set: {
        status: TOURNAMENT_STATES.FINISHED,
        finishedAt: new Date(),
        championUserId: top3[0]?.userId || null,
        finalTop3: top3,
      },
    },
    { new: true },
  );

  return { tournament: finished, top3 };
}

export async function refreshTournamentStats(tournamentId, tournamentType) {
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

export async function maybeAdvanceTournament(tournamentId, options = {}) {
  let tournament = await Tournament.findById(tournamentId);
  const progression = {
    roundsClosed: [],
    roundsStarted: [],
    finished: false,
    top3: [],
    tournament: tournament || null,
  };
  if (!tournament) {
    return options.returnMeta ? progression : tournament;
  }
  if (normalizeTournamentState(tournament.status) !== TOURNAMENT_STATES.LIVE_ROUND) {
    return options.returnMeta ? progression : tournament;
  }

  let guard = 0;
  while (
    guard < 12 &&
    normalizeTournamentState(tournament.status) === TOURNAMENT_STATES.LIVE_ROUND
  ) {
    const currentRound = Number(tournament.currentRound || 0);
    if (currentRound <= 0) break;

    const pendingGames = await TournamentGame.countDocuments({
      tournamentId,
      roundNumber: currentRound,
      isPublished: true,
      result: "*",
    });
    if (pendingGames > 0) break;
    progression.roundsClosed.push(currentRound);

    if (currentRound >= Number(tournament.roundsPlanned || 1)) {
      const completed = await completeTournamentAuto(tournament);
      tournament = completed.tournament;
      progression.finished = true;
      progression.top3 = completed.top3 || [];
      break;
    }

    const nextRound = currentRound + 1;
    const [players, games] = await Promise.all([
      TournamentPlayer.find({ tournamentId, status: { $ne: "withdrawn" } }).lean(),
      TournamentGame.find({ tournamentId, isPublished: true }).lean(),
    ]);
    const pairings = generateRoundPairings({
      tournamentType: tournament.type,
      players,
      games,
      roundNumber: nextRound,
    });

    if (!pairings.length) {
      const completed = await completeTournamentAuto(tournament);
      tournament = completed.tournament;
      progression.finished = true;
      progression.top3 = completed.top3 || [];
      break;
    }

    const pairingUserIds = [
      ...new Set(
        pairings
          .flatMap((pairing) => [toId(pairing.whiteId), toId(pairing.blackId)])
          .filter(Boolean),
      ),
    ];
    const users = pairingUserIds.length
      ? await User.find({ _id: { $in: pairingUserIds } }).select("rating").lean()
      : [];
    const usersById = new Map(users.map((user) => [toId(user._id), user]));

    await TournamentGame.insertMany(
      pairings.map((pairing) => ({
        ...pairing,
        tournamentId,
        boardNumber: Number(pairing.matchIndex || 0) + 1,
        isPublished: true,
        publishedAt: new Date(),
        whiteRatingAtPairing: Number(usersById.get(toId(pairing.whiteId))?.rating || 1200),
        blackRatingAtPairing: pairing.blackId
          ? Number(usersById.get(toId(pairing.blackId))?.rating || 1200)
          : null,
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
      })),
    );

    const startedRoundGames = await TournamentGame.find({
      tournamentId,
      roundNumber: nextRound,
      isPublished: true,
    })
      .sort({ matchIndex: 1 })
      .lean();
    progression.roundsStarted.push({
      roundNumber: nextRound,
      pairings: startedRoundGames.map((game) => normalizeRoundPairingPayload(game)),
    });

    tournament = await Tournament.findByIdAndUpdate(
      tournamentId,
      {
        $set: {
          currentRound: nextRound,
          latestPublishedRound: nextRound,
          status: TOURNAMENT_STATES.LIVE_ROUND,
          startedAt: tournament.startedAt || new Date(),
        },
      },
      { new: true },
    );
    await refreshTournamentStats(tournamentId, tournament.type);
    guard += 1;
  }

  progression.tournament = tournament || null;
  return options.returnMeta ? progression : tournament;
}

export async function syncTournamentGameResultByGameId(
  externalGameId,
  result,
  options = {},
) {
  const gameId = String(externalGameId || "").trim();
  if (!gameId) {
    return { matched: false, updated: false, reason: "missing_game_id" };
  }

  const normalizedResult = String(result || "").trim();
  if (!["1-0", "0-1", "1/2-1/2", "1-0F", "0-1F"].includes(normalizedResult)) {
    return { matched: false, updated: false, reason: "invalid_result" };
  }

  const game = await TournamentGame.findOne({ gameId });
  if (!game) {
    return { matched: false, updated: false, reason: "tournament_game_not_found" };
  }
  if (game.result !== "*") {
    return { matched: true, updated: false, reason: "already_reported" };
  }

  const tournament = await Tournament.findById(game.tournamentId);
  if (!tournament) {
    return { matched: true, updated: false, reason: "tournament_not_found" };
  }
  const normalizedState = normalizeTournamentState(tournament.status);
  if (
    normalizedState !== TOURNAMENT_STATES.LIVE_ROUND &&
    normalizedState !== "running"
  ) {
    return { matched: true, updated: false, reason: "tournament_not_running" };
  }
  if (game.isBye) {
    return { matched: true, updated: false, reason: "bye_game" };
  }

  const winnerId = getWinnerFromResult(normalizedResult, game.whiteId, game.blackId);

  const eloChanges = { white: 0, black: 0 };
  if (!game.isBye && game.blackId) {
    const [whiteUser, blackUser] = await Promise.all([
      User.findById(game.whiteId).select("rating").lean(),
      User.findById(game.blackId).select("rating").lean(),
    ]);
    if (whiteUser && blackUser) {
      const computed = calculateTournamentEloPair({
        whiteRating: Number(whiteUser.rating || 1200),
        blackRating: Number(blackUser.rating || 1200),
        result: normalizedResult,
      });
      if (computed) {
        eloChanges.white = computed.white.delta;
        eloChanges.black = computed.black.delta;
        await Promise.all([
          User.updateOne(
            { _id: game.whiteId },
            { $set: { rating: computed.white.after } },
          ),
          User.updateOne(
            { _id: game.blackId },
            { $set: { rating: computed.black.after } },
          ),
          TournamentPlayer.updateOne(
            { tournamentId: game.tournamentId, userId: game.whiteId },
            {
              $set: { tournamentEloCurrent: computed.white.after },
              $inc: { tournamentEloDelta: computed.white.delta },
            },
          ),
          TournamentPlayer.updateOne(
            { tournamentId: game.tournamentId, userId: game.blackId },
            {
              $set: { tournamentEloCurrent: computed.black.after },
              $inc: { tournamentEloDelta: computed.black.delta },
            },
          ),
        ]);
        const reason =
          normalizedResult === "1-0F" || normalizedResult === "0-1F"
            ? "forfeit"
            : "result";
        await TournamentEloEvent.insertMany([
          {
            userId: game.whiteId,
            opponentId: game.blackId,
            tournamentId: game.tournamentId,
            gameId: game.gameId,
            result:
              normalizedResult === "1-0" || normalizedResult === "1-0F"
                ? "W"
                : normalizedResult === "0-1" || normalizedResult === "0-1F"
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
            tournamentId: game.tournamentId,
            gameId: game.gameId,
            result:
              normalizedResult === "0-1" || normalizedResult === "0-1F"
                ? "W"
                : normalizedResult === "1-0" || normalizedResult === "1-0F"
                  ? "L"
                  : "D",
            reason,
            eloBefore: computed.black.before,
            eloAfter: computed.black.after,
            delta: computed.black.delta,
            kFactor: computed.black.kFactor,
            at: new Date(),
          },
        ]);
      }
    }
  }

  await TournamentGame.updateOne(
    { _id: game._id, result: "*" },
    {
      $set: {
        result: normalizedResult,
        winnerId: winnerId || null,
        finishedAt: new Date(),
        liveStatus: "completed",
        whiteEloDelta: eloChanges.white,
        blackEloDelta: eloChanges.black,
        resultSource: options.source || "runtime",
      },
    },
  );

  await refreshTournamentStats(tournament._id, tournament.type);
  const progression = await maybeAdvanceTournament(tournament._id, {
    returnMeta: true,
  });
  const updatedTournament = progression?.tournament
    ? (progression.tournament.toObject
        ? progression.tournament.toObject()
        : progression.tournament)
    : await Tournament.findById(tournament._id).lean();

  return {
    matched: true,
    updated: true,
    tournamentId: toId(tournament._id),
    tournamentStatus: updatedTournament?.status || tournament.status,
    gameId: String(game.gameId || gameId),
    gameResult: normalizedResult,
    roundNumber: Number(game.roundNumber || 0),
    progression: progression
      ? {
          roundsClosed: progression.roundsClosed || [],
          roundsStarted: progression.roundsStarted || [],
          finished: progression.finished === true,
          top3: progression.top3 || [],
        }
      : null,
    eloChanges,
  };
}

export async function markTournamentGameStarted(externalGameId) {
  const gameId = String(externalGameId || "").trim();
  if (!gameId) return false;
  const update = await TournamentGame.updateOne(
    { gameId, liveStatus: "pending", result: "*" },
    {
      $set: {
        liveStatus: "started",
        startedAt: new Date(),
      },
    },
  );
  return update.modifiedCount > 0;
}
