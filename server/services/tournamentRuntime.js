import { Tournament, TournamentGame, TournamentPlayer } from "../models/index.js";
import {
  createPlayerStatsMap,
  generateRoundPairings,
  getWinnerFromResult,
  resolveWinnerId,
} from "../utils/tournamentEngine.js";

function toId(value) {
  return value ? String(value) : "";
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

export async function maybeAdvanceTournament(tournamentId) {
  let tournament = await Tournament.findById(tournamentId);
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

    if (tournament.type === "knockout") {
      const currentRoundGames = await TournamentGame.find({
        tournamentId,
        roundNumber: tournament.currentRound,
      }).lean();
      const winners = [
        ...new Set(currentRoundGames.map((game) => resolveWinnerId(game)).filter(Boolean)),
      ];
      if (
        winners.length <= 1 ||
        tournament.currentRound >= Number(tournament.roundsPlanned || 1)
      ) {
        tournament = await Tournament.findByIdAndUpdate(
          tournamentId,
          { $set: { status: "finished", finishedAt: new Date() } },
          { new: true },
        );
        break;
      }
    } else if (tournament.currentRound >= Number(tournament.roundsPlanned || 1)) {
      tournament = await Tournament.findByIdAndUpdate(
        tournamentId,
        { $set: { status: "finished", finishedAt: new Date() } },
        { new: true },
      );
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
    guard += 1;
  }

  return tournament;
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
  if (!["1-0", "0-1", "1/2-1/2"].includes(normalizedResult)) {
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
  if (tournament.status !== "running") {
    return { matched: true, updated: false, reason: "tournament_not_running" };
  }
  if (game.isBye) {
    return { matched: true, updated: false, reason: "bye_game" };
  }

  if (
    tournament.type === "knockout" &&
    normalizedResult === "1/2-1/2" &&
    options.allowKnockoutDraw !== true
  ) {
    return { matched: true, updated: false, reason: "knockout_draw_not_allowed" };
  }

  const winnerId = getWinnerFromResult(normalizedResult, game.whiteId, game.blackId);
  if (
    tournament.type === "knockout" &&
    !winnerId &&
    options.allowKnockoutDraw !== true
  ) {
    return {
      matched: true,
      updated: false,
      reason: "knockout_winner_required",
    };
  }

  await TournamentGame.updateOne(
    { _id: game._id, result: "*" },
    {
      $set: {
        result: normalizedResult,
        winnerId: winnerId || null,
        finishedAt: new Date(),
        liveStatus: "completed",
      },
    },
  );

  await refreshTournamentStats(tournament._id, tournament.type);
  const updatedTournament = await maybeAdvanceTournament(tournament._id);

  return {
    matched: true,
    updated: true,
    tournamentId: toId(tournament._id),
    tournamentStatus: updatedTournament?.status || tournament.status,
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
