import mongoose from "../config/db.js";
import { connectDB } from "../config/db.js";
import { Tournament, TournamentPlayer } from "../models/index.js";
import { normalizeTournamentState, TOURNAMENT_STATES } from "../modules/tournaments/stateMachine.js";

const DEFAULT_STALE_HOURS = 24;

function toId(value) {
  return value ? String(value) : "";
}

async function run() {
  await connectDB();

  const staleHours = Math.max(
    1,
    Number.parseInt(process.env.STALE_HOURS || `${DEFAULT_STALE_HOURS}`, 10) ||
      DEFAULT_STALE_HOURS,
  );
  const staleBeforeMs = Date.now() - staleHours * 60 * 60 * 1000;

  const tournaments = await Tournament.find({})
    .select("_id name status startType scheduledStartAt createdAt")
    .lean();

  const tournamentIds = tournaments.map((item) => item._id);
  const activeCounts = tournamentIds.length
    ? await TournamentPlayer.aggregate([
        {
          $match: {
            tournamentId: { $in: tournamentIds },
            status: { $ne: "withdrawn" },
          },
        },
        { $group: { _id: "$tournamentId", count: { $sum: 1 } } },
      ])
    : [];
  const activeCountMap = new Map(
    activeCounts.map((row) => [toId(row._id), Number(row.count || 0)]),
  );

  const candidates = tournaments.filter((tournament) => {
    const state = normalizeTournamentState(tournament.status);
    if (
      state !== TOURNAMENT_STATES.DRAFT &&
      state !== TOURNAMENT_STATES.REGISTRATION_OPEN
    ) {
      return false;
    }
    const activeCount = activeCountMap.get(toId(tournament._id)) || 0;
    if (activeCount !== 0) return false;

    const createdAtMs = new Date(tournament.createdAt || 0).getTime();
    const scheduledMs = new Date(tournament.scheduledStartAt || 0).getTime();
    const isScheduledPastGrace =
      Number.isFinite(scheduledMs) && scheduledMs + 5 * 60 * 1000 <= Date.now();
    const isStaleByAge = Number.isFinite(createdAtMs) && createdAtMs <= staleBeforeMs;

    return isScheduledPastGrace || isStaleByAge;
  });

  if (!candidates.length) {
    console.log(
      JSON.stringify(
        {
          updated: 0,
          staleHours,
          message: "No zero-player stale tournaments to cancel.",
        },
        null,
        2,
      ),
    );
    await mongoose.disconnect();
    return;
  }

  const candidateIds = candidates.map((tournament) => tournament._id);
  const now = new Date();

  const updateResult = await Tournament.updateMany(
    { _id: { $in: candidateIds } },
    {
      $set: {
        status: TOURNAMENT_STATES.CANCELLED,
        cancelledAt: now,
        cancellationReason: "insufficient_participants",
        autoStartGraceEndsAt: null,
      },
      $inc: { stateVersion: 1 },
    },
  );

  console.log(
    JSON.stringify(
      {
        staleHours,
        considered: tournaments.length,
        cancelled: Number(updateResult.modifiedCount || 0),
        ids: candidates.map((tournament) => toId(tournament._id)),
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error("cancelZeroPlayerTournaments error:", error);
  try {
    await mongoose.disconnect();
  } catch {
    // no-op
  }
  process.exit(1);
});
