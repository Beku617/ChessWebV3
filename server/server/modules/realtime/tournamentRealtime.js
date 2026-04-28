function toId(value) {
  return value ? String(value) : "";
}

function getTournamentRoom(tournamentId) {
  return `tournament:${toId(tournamentId)}`;
}

function getUserRoom(userId) {
  return `user:${toId(userId)}`;
}

export function emitTournamentEvent(app, tournamentId, eventName, payload) {
  const io = app?.get?.("io");
  if (!io) return;
  const room = getTournamentRoom(tournamentId);
  io.to(room).emit(eventName, payload);
}

export function emitUserEvent(app, userId, eventName, payload) {
  const io = app?.get?.("io");
  const normalizedUserId = toId(userId);
  if (!io || !normalizedUserId) return;
  io.to(getUserRoom(normalizedUserId)).emit(eventName, payload);
}

export function emitTournamentStateChanged(app, tournament, newState) {
  emitTournamentEvent(
    app,
    tournament?._id,
    "tournament:stateChanged",
    {
      tournamentId: toId(tournament?._id),
      newState,
    },
  );
}

export function emitPairingsPublished(app, tournament, roundNumber, pairings) {
  emitTournamentEvent(
    app,
    tournament?._id,
    "pairings:published",
    {
      tournamentId: toId(tournament?._id),
      round: Number(roundNumber || 0),
      pairings: pairings || [],
    },
  );
}

export function emitResultUpdated(app, tournament, game, eloChanges) {
  emitTournamentEvent(
    app,
    tournament?._id,
    "result:updated",
    {
      tournamentId: toId(tournament?._id),
      gameId: String(game?.gameId || ""),
      result: game?.result || "*",
      eloChanges: eloChanges || null,
    },
  );
}

export function emitStandingsUpdated(app, tournament, standings) {
  emitTournamentEvent(
    app,
    tournament?._id,
    "standings:updated",
    {
      tournamentId: toId(tournament?._id),
      standings: standings || [],
    },
  );
}

export function emitRoundClosed(app, tournament, roundNumber, officialStandings) {
  emitTournamentEvent(
    app,
    tournament?._id,
    "round:closed",
    {
      tournamentId: toId(tournament?._id),
      roundNumber: Number(roundNumber || 0),
      officialStandings: officialStandings || [],
    },
  );
}

export function emitTournamentFinished(app, tournament, champion, top3, finalStandings) {
  emitTournamentEvent(
    app,
    tournament?._id,
    "tournament:finished",
    {
      tournamentId: toId(tournament?._id),
      champion: champion || null,
      top3: top3 || [],
      finalStandings: finalStandings || [],
    },
  );
}

export function emitTournamentCancelled(app, tournament, reason = "") {
  emitTournamentEvent(
    app,
    tournament?._id,
    "tournament:cancelled",
    {
      tournamentId: toId(tournament?._id),
      reason: String(reason || "").trim() || "insufficient_participants",
    },
  );
}

export function emitRoundBoardAssignments(
  app,
  tournament,
  roundNumber,
  pairings = [],
) {
  const tournamentId = toId(tournament?._id);
  const round = Number(roundNumber || 0);
  for (const pairing of pairings || []) {
    const gameId = String(pairing?.gameId || "").trim();
    if (!gameId || pairing?.isBye) continue;
    const whiteId = toId(pairing?.whiteId);
    const blackId = toId(pairing?.blackId);
    const board = Number(pairing?.board || 0) || 1;
    if (whiteId) {
      emitUserEvent(app, whiteId, "tournament:boardAssigned", {
        tournamentId,
        round,
        board,
        gameId,
        color: "w",
        opponentId: blackId || null,
        autoStart: true,
      });
    }
    if (blackId) {
      emitUserEvent(app, blackId, "tournament:boardAssigned", {
        tournamentId,
        round,
        board,
        gameId,
        color: "b",
        opponentId: whiteId || null,
        autoStart: true,
      });
    }
  }
}
