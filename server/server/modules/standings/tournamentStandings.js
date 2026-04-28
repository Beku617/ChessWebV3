import { createPlayerStatsMap } from "../../utils/tournamentEngine.js";

function toId(value) {
  return value ? String(value) : "";
}

function normalizeResultPoints(result) {
  if (result === "1-0" || result === "1-0F") {
    return { white: 1, black: 0 };
  }
  if (result === "0-1" || result === "0-1F") {
    return { white: 0, black: 1 };
  }
  if (result === "1/2-1/2") {
    return { white: 0.5, black: 0.5 };
  }
  return null;
}

function sortWithFallback(rows, compareFn) {
  return [...rows].sort((a, b) => {
    const decided = compareFn(a, b);
    if (decided !== 0) return decided;
    const aSeed = Number.isFinite(Number(a.seed)) ? Number(a.seed) : Number.MAX_SAFE_INTEGER;
    const bSeed = Number.isFinite(Number(b.seed)) ? Number(b.seed) : Number.MAX_SAFE_INTEGER;
    if (aSeed !== bSeed) return aSeed - bSeed;
    const aName = String(a.name || "").toLowerCase();
    const bName = String(b.name || "").toLowerCase();
    return aName.localeCompare(bName);
  });
}

function computeHeadToHeadPoints(games, playerSet) {
  const pointsMap = new Map();
  for (const playerId of playerSet) {
    pointsMap.set(playerId, 0);
  }

  for (const game of games) {
    const whiteId = toId(game.whiteId);
    const blackId = toId(game.blackId);
    if (!whiteId || !blackId) continue;
    if (!playerSet.has(whiteId) || !playerSet.has(blackId)) continue;

    const points = normalizeResultPoints(String(game.result || "*"));
    if (!points) continue;
    pointsMap.set(whiteId, Number(pointsMap.get(whiteId) || 0) + points.white);
    pointsMap.set(blackId, Number(pointsMap.get(blackId) || 0) + points.black);
  }

  return pointsMap;
}

function buildBaseRows(players, usersById = new Map()) {
  return (players || []).map((player) => {
    const userId = toId(player.userId);
    const user = usersById.get(userId);
    const score = Number(player.score || 0);
    const gamesPlayed = Number(
      player.gamesPlayed ??
        Number(player.wins || 0) + Number(player.draws || 0) + Number(player.losses || 0),
    );
    return {
      userId,
      name: user?.fullName || "Player",
      avatar: user?.avatar || "",
      elo: Number(user?.rating || player.tournamentEloCurrent || 1200),
      seed: player.seed,
      score,
      points: score,
      gamesPlayed,
      games: gamesPlayed,
      wins: Number(player.wins || 0),
      draws: Number(player.draws || 0),
      losses: Number(player.losses || 0),
      buchholz: Number(player.buchholz || 0),
      buchholzCut1: Number(player.buchholzCut1 || 0),
      sonnebornBerger: Number(player.sonnebornBerger || 0),
      directEncounter: Number(player.directEncounter || 0),
      koya: Number(player.koya || 0),
      colorBalance: Number(player.colorBalance || 0),
      status: player.status || "active",
      tournamentEloDelta: Number(player.tournamentEloDelta || 0),
    };
  });
}

function computeCommonPlayerMetrics(players, games, tournamentType) {
  const stats = createPlayerStatsMap(players, games, tournamentType);
  const playerMap = new Map();
  for (const player of players) {
    playerMap.set(toId(player.userId), {
      ...player,
      wins: 0,
      draws: 0,
      losses: 0,
      whiteGames: 0,
      blackGames: 0,
      byeCount: 0,
    });
  }

  for (const [userId, stat] of stats.entries()) {
    const player = playerMap.get(userId);
    if (!player) continue;
    player.score = Number(stat.score || 0);
    player.buchholz = Number(stat.buchholz || 0);
    player.gamesPlayed = Number(stat.gamesPlayed || 0);
    player.hadBye = !!stat.hadBye;
  }

  for (const game of games || []) {
    const result = normalizeResultPoints(String(game.result || "*"));
    if (!result) continue;
    const whiteId = toId(game.whiteId);
    const blackId = toId(game.blackId);
    if (game.isBye || !blackId) {
      const only = whiteId || blackId;
      const player = playerMap.get(only);
      if (player) {
        player.wins = Number(player.wins || 0) + 1;
        player.byeCount = Number(player.byeCount || 0) + 1;
      }
      continue;
    }
    const white = playerMap.get(whiteId);
    const black = playerMap.get(blackId);
    if (!white || !black) continue;

    white.whiteGames = Number(white.whiteGames || 0) + 1;
    black.blackGames = Number(black.blackGames || 0) + 1;

    if (result.white === 1) {
      white.wins = Number(white.wins || 0) + 1;
      black.losses = Number(black.losses || 0) + 1;
    } else if (result.black === 1) {
      black.wins = Number(black.wins || 0) + 1;
      white.losses = Number(white.losses || 0) + 1;
    } else {
      white.draws = Number(white.draws || 0) + 1;
      black.draws = Number(black.draws || 0) + 1;
    }
  }

  return [...playerMap.values()].map((player) => {
    const colorBalance =
      Number(player.whiteGames || 0) - Number(player.blackGames || 0);
    return {
      ...player,
      colorBalance,
    };
  });
}

function enrichSwissTiebreaks(players, games) {
  const byUserId = new Map(players.map((player) => [toId(player.userId), player]));
  const opponentScores = new Map();
  const opponentSet = new Map();
  for (const player of players) {
    opponentScores.set(toId(player.userId), []);
    opponentSet.set(toId(player.userId), new Set());
  }

  for (const game of games || []) {
    const result = normalizeResultPoints(String(game.result || "*"));
    if (!result) continue;
    const whiteId = toId(game.whiteId);
    const blackId = toId(game.blackId);
    if (!whiteId || !blackId) continue;
    if (!byUserId.has(whiteId) || !byUserId.has(blackId)) continue;
    opponentSet.get(whiteId).add(blackId);
    opponentSet.get(blackId).add(whiteId);
  }

  for (const [playerId, set] of opponentSet.entries()) {
    const scores = [...set].map((oppId) => Number(byUserId.get(oppId)?.score || 0));
    opponentScores.set(playerId, scores);
  }

  for (const player of players) {
    const playerId = toId(player.userId);
    const scores = opponentScores.get(playerId) || [];
    const buchholz = scores.reduce((sum, value) => sum + value, 0);
    const cut1 = scores.length > 1 ? buchholz - Math.min(...scores) : buchholz;
    player.buchholz = Math.round(buchholz * 100) / 100;
    player.buchholzCut1 = Math.round(cut1 * 100) / 100;
  }

  const scoreGroups = new Map();
  for (const player of players) {
    const key = String(player.score || 0);
    if (!scoreGroups.has(key)) scoreGroups.set(key, []);
    scoreGroups.get(key).push(toId(player.userId));
  }

  for (const ids of scoreGroups.values()) {
    if (ids.length < 2) continue;
    const playerSet = new Set(ids);
    const h2h = computeHeadToHeadPoints(games, playerSet);
    for (const id of ids) {
      const player = byUserId.get(id);
      if (!player) continue;
      player.directEncounter = Number(h2h.get(id) || 0);
    }
  }

  return players;
}

function sortSwissStandings(rows) {
  return sortWithFallback(rows, (a, b) => {
    const pointsDiff = Number(b.points || 0) - Number(a.points || 0);
    if (pointsDiff !== 0) return pointsDiff;
    const buchholzDiff = Number(b.buchholz || 0) - Number(a.buchholz || 0);
    if (buchholzDiff !== 0) return buchholzDiff;
    const cut1Diff = Number(b.buchholzCut1 || 0) - Number(a.buchholzCut1 || 0);
    if (cut1Diff !== 0) return cut1Diff;
    const winsDiff = Number(b.wins || 0) - Number(a.wins || 0);
    if (winsDiff !== 0) return winsDiff;
    return Number(b.directEncounter || 0) - Number(a.directEncounter || 0);
  });
}

function applyDenseRanksByPoints(rows) {
  const sortedRows = [...rows];
  let currentRank = 0;
  let previousPoints = null;
  for (const row of sortedRows) {
    const points = Number(row.points || 0);
    if (previousPoints === null || points !== previousPoints) {
      currentRank += 1;
      previousPoints = points;
    }
    row.rank = currentRank;
  }
  return sortedRows;
}

export function computeTournamentStandings({
  tournamentType,
  players,
  games,
  usersById = new Map(),
}) {
  const enrichedPlayers = computeCommonPlayerMetrics(players || [], games || [], tournamentType);
  const rows = sortSwissStandings(
    buildBaseRows(enrichSwissTiebreaks(enrichedPlayers, games || []), usersById),
  );

  return applyDenseRanksByPoints(rows).map((row) => ({ ...row }));
}
