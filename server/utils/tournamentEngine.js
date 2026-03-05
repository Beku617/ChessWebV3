import crypto from "crypto";

const RESULT_POINTS = {
  "1-0": { white: 1, black: 0 },
  "0-1": { white: 0, black: 1 },
  "1/2-1/2": { white: 0.5, black: 0.5 },
};

const SUPPORTED_RESULTS = new Set(["1-0", "0-1", "1/2-1/2", "*"]);
const MAX_SWISS_ROUNDS = 20;

function shuffleArray(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function toId(value) {
  return value ? String(value) : "";
}

function toRoundNumber(value) {
  return Math.round(Number(value) * 100) / 100;
}

function playedKey(a, b) {
  const aId = toId(a);
  const bId = toId(b);
  return aId < bId ? `${aId}:${bId}` : `${bId}:${aId}`;
}

function buildPlayedSet(games) {
  const set = new Set();
  for (const game of games) {
    const whiteId = toId(game.whiteId);
    const blackId = toId(game.blackId);
    if (!whiteId || !blackId) continue;
    set.add(playedKey(whiteId, blackId));
  }
  return set;
}

function buildColorHistory(games) {
  const history = new Map();
  const ordered = [...games].sort((a, b) => {
    const roundDiff = Number(a.roundNumber || 0) - Number(b.roundNumber || 0);
    if (roundDiff !== 0) return roundDiff;
    return Number(a.matchIndex || 0) - Number(b.matchIndex || 0);
  });

  const ensure = (playerId) => {
    if (!history.has(playerId)) {
      history.set(playerId, {
        whiteCount: 0,
        blackCount: 0,
        lastColor: null,
        opponents: new Set(),
        hadBye: false,
      });
    }
  };

  for (const game of ordered) {
    const whiteId = toId(game.whiteId);
    const blackId = toId(game.blackId);

    if (game.isBye || !blackId) {
      if (whiteId) {
        ensure(whiteId);
        history.get(whiteId).hadBye = true;
      }
      continue;
    }

    if (!whiteId || !blackId) continue;
    ensure(whiteId);
    ensure(blackId);

    const white = history.get(whiteId);
    const black = history.get(blackId);
    white.whiteCount += 1;
    white.lastColor = "W";
    white.opponents.add(blackId);
    black.blackCount += 1;
    black.lastColor = "B";
    black.opponents.add(whiteId);
  }

  return history;
}

function chooseByeCandidate(players, statsMap) {
  if (!players.length) return null;
  const ranked = [...players].sort((a, b) => {
    const statsA = statsMap.get(toId(a.userId)) || {};
    const statsB = statsMap.get(toId(b.userId)) || {};

    if (!!statsA.hadBye !== !!statsB.hadBye) return statsA.hadBye ? 1 : -1;

    const scoreDiff = Number(statsA.score || a.score || 0) - Number(statsB.score || b.score || 0);
    if (scoreDiff !== 0) return scoreDiff;

    const gamesDiff =
      Number(statsA.gamesPlayed || a.gamesPlayed || 0) -
      Number(statsB.gamesPlayed || b.gamesPlayed || 0);
    if (gamesDiff !== 0) return gamesDiff;

    const seedA = Number.isFinite(Number(a.seed)) ? Number(a.seed) : Number.MAX_SAFE_INTEGER;
    const seedB = Number.isFinite(Number(b.seed)) ? Number(b.seed) : Number.MAX_SAFE_INTEGER;
    if (seedA !== seedB) return seedB - seedA;

    const joinedA = new Date(a.joinedAt || 0).getTime();
    const joinedB = new Date(b.joinedAt || 0).getTime();
    return joinedB - joinedA;
  });

  return ranked[0] || null;
}

function stableSortBySeed(players) {
  return [...players].sort((a, b) => {
    const aSeed = Number.isFinite(Number(a.seed)) ? Number(a.seed) : Number.MAX_SAFE_INTEGER;
    const bSeed = Number.isFinite(Number(b.seed)) ? Number(b.seed) : Number.MAX_SAFE_INTEGER;
    if (aSeed !== bSeed) return aSeed - bSeed;
    const aJoined = new Date(a.joinedAt || 0).getTime();
    const bJoined = new Date(b.joinedAt || 0).getTime();
    return aJoined - bJoined;
  });
}

function createBasePairing({
  roundNumber,
  matchIndex,
  whiteId,
  blackId = null,
  result = "*",
  isBye = false,
  winnerId = null,
}) {
  return {
    roundNumber,
    matchIndex,
    whiteId,
    blackId,
    result,
    winnerId,
    isBye,
    gameId: crypto.randomBytes(10).toString("hex"),
    finishedAt: result === "*" ? null : new Date(),
    liveStatus: result === "*" ? "pending" : "completed",
    startedAt: result === "*" ? null : new Date(),
  };
}

function createByePairing(roundNumber, matchIndex, playerId) {
  return createBasePairing({
    roundNumber,
    matchIndex,
    whiteId: playerId,
    blackId: null,
    result: "1-0",
    winnerId: playerId,
    isBye: true,
  });
}

function pairGroupGreedy(group, playedSet, roundNumber, startMatchIndex) {
  const remaining = [...group];
  const pairings = [];
  let matchIndex = startMatchIndex;

  while (remaining.length >= 2) {
    const playerA = remaining.shift();
    const aId = toId(playerA.userId);

    let opponentIndex = remaining.findIndex(
      (candidate) => !playedSet.has(playedKey(aId, toId(candidate.userId))),
    );
    if (opponentIndex < 0) opponentIndex = 0;

    const [playerB] = remaining.splice(opponentIndex, 1);
    const bId = toId(playerB.userId);

    const swapColors = roundNumber % 2 === 0;
    const whiteId = swapColors ? bId : aId;
    const blackId = swapColors ? aId : bId;

    pairings.push(
      createBasePairing({
        roundNumber,
        matchIndex,
        whiteId,
        blackId,
      }),
    );
    matchIndex += 1;
    playedSet.add(playedKey(aId, bId));
  }

  return { pairings, nextMatchIndex: matchIndex };
}

function pickNearestScoreOpponent(player, candidates, playedSet) {
  if (!candidates.length) return null;
  const pid = toId(player.userId);

  const notPlayed = candidates.filter(
    (candidate) => !playedSet.has(playedKey(pid, toId(candidate.userId))),
  );
  const pool = notPlayed.length ? notPlayed : candidates;

  const scored = pool.map((candidate) => ({
    candidate,
    diff: Math.abs(Number(candidate.score || 0) - Number(player.score || 0)),
  }));

  const minDiff = Math.min(...scored.map((item) => item.diff));
  const nearest = scored.filter((item) => item.diff === minDiff).map((item) => item.candidate);
  if (!nearest.length) return null;
  return nearest[Math.floor(Math.random() * nearest.length)] || null;
}

function assignBalancedColors(playerA, playerB, history) {
  const aId = toId(playerA.userId);
  const bId = toId(playerB.userId);
  const aInfo = history.get(aId) || { whiteCount: 0, blackCount: 0, lastColor: null };
  const bInfo = history.get(bId) || { whiteCount: 0, blackCount: 0, lastColor: null };

  const aBalance = aInfo.whiteCount - aInfo.blackCount;
  const bBalance = bInfo.whiteCount - bInfo.blackCount;

  let whiteId = aId;
  let blackId = bId;

  if (aBalance > bBalance) {
    whiteId = bId;
    blackId = aId;
  } else if (aBalance === bBalance) {
    if (aInfo.lastColor === "W" && bInfo.lastColor !== "W") {
      whiteId = bId;
      blackId = aId;
    } else if (bInfo.lastColor === "W" && aInfo.lastColor !== "W") {
      whiteId = aId;
      blackId = bId;
    } else if (Math.random() < 0.5) {
      whiteId = bId;
      blackId = aId;
    }
  }

  return { whiteId, blackId };
}

function findBestOpponentIndex(player, candidates, playedSet) {
  if (!candidates.length) return -1;
  const pid = toId(player.userId);
  const withIndex = candidates.map((candidate, index) => ({
    candidate,
    index,
    played: playedSet.has(playedKey(pid, toId(candidate.userId))),
    diff: Math.abs(Number(candidate.score || 0) - Number(player.score || 0)),
  }));

  const unplayed = withIndex.filter((item) => !item.played);
  const pool = unplayed.length ? unplayed : withIndex;

  const minDiff = Math.min(...pool.map((item) => item.diff));
  const nearest = pool.filter((item) => item.diff === minDiff);
  if (!nearest.length) return -1;

  const chosen = nearest[Math.floor(Math.random() * nearest.length)];
  return chosen?.index ?? -1;
}

function pairGroupAdvanced({
  group,
  unpaired,
  playedSet,
  history,
  roundNumber,
  startMatchIndex,
}) {
  const remaining = group.filter((player) => unpaired.has(toId(player.userId)));
  const pairings = [];
  let matchIndex = startMatchIndex;
  let guard = 0;

  while (remaining.length > 1 && guard < group.length * 3) {
    const playerA = remaining.shift();
    if (!playerA || !unpaired.has(toId(playerA.userId))) {
      guard += 1;
      continue;
    }

    const opponentIndex = findBestOpponentIndex(playerA, remaining, playedSet);
    if (opponentIndex < 0) {
      remaining.push(playerA);
      guard += 1;
      continue;
    }

    const [playerB] = remaining.splice(opponentIndex, 1);
    if (!playerB || !unpaired.has(toId(playerB.userId))) {
      remaining.push(playerA);
      guard += 1;
      continue;
    }

    const colors = assignBalancedColors(playerA, playerB, history);
    pairings.push(
      createBasePairing({
        roundNumber,
        matchIndex,
        whiteId: colors.whiteId,
        blackId: colors.blackId,
      }),
    );
    matchIndex += 1;
    unpaired.delete(toId(playerA.userId));
    unpaired.delete(toId(playerB.userId));
    playedSet.add(playedKey(playerA.userId, playerB.userId));
  }

  const leftover = remaining.find((player) => unpaired.has(toId(player.userId))) || null;
  return { pairings, leftover, nextMatchIndex: matchIndex };
}

function generateSwissPairings({ players, games, roundNumber }) {
  if (!Array.isArray(players) || players.length === 0) return [];

  const statsMap = createPlayerStatsMap(players, games, "swiss");
  const history = buildColorHistory(games);
  const playedSet = buildPlayedSet(games);

  const hydratedPlayers = players.map((player) => {
    const userId = toId(player.userId);
    const stats = statsMap.get(userId) || {};
    return {
      ...player,
      userId,
      score: Number(stats.score ?? player.score ?? 0),
      buchholz: Number(stats.buchholz ?? player.buchholz ?? 0),
      gamesPlayed: Number(stats.gamesPlayed ?? player.gamesPlayed ?? 0),
      hadBye: !!(stats.hadBye ?? player.hadBye),
    };
  });

  if (roundNumber === 1) {
    const shuffled = shuffleArray(hydratedPlayers);
    const pairings = [];
    let matchIndex = 0;
    let working = [...shuffled];

    if (working.length % 2 === 1) {
      const byePlayer = chooseByeCandidate(working, statsMap);
      if (byePlayer) {
        working = working.filter((p) => toId(p.userId) !== toId(byePlayer.userId));
        pairings.push(
          createByePairing(roundNumber, matchIndex, toId(byePlayer.userId)),
        );
        matchIndex += 1;
      }
    }

    while (working.length >= 2) {
      const a = working.shift();
      const b = working.shift();
      if (!a || !b) break;
      const swap = Math.random() < 0.5;
      pairings.push(
        createBasePairing({
          roundNumber,
          matchIndex,
          whiteId: swap ? toId(b.userId) : toId(a.userId),
          blackId: swap ? toId(a.userId) : toId(b.userId),
        }),
      );
      matchIndex += 1;
    }

    return pairings;
  }

  const standings = sortStandings(hydratedPlayers);
  let playerPool = [...standings];
  let byePlayer = null;

  if (playerPool.length % 2 === 1) {
    byePlayer = chooseByeCandidate(playerPool, statsMap);
    if (byePlayer) {
      playerPool = playerPool.filter((player) => toId(player.userId) !== toId(byePlayer.userId));
    }
  }

  const groupedByScore = new Map();
  for (const player of playerPool) {
    const key = String(toRoundNumber(player.score || 0));
    if (!groupedByScore.has(key)) groupedByScore.set(key, []);
    groupedByScore.get(key).push(player);
  }

  const scoreKeys = [...groupedByScore.keys()].sort((a, b) => Number(b) - Number(a));
  let matchIndex = 0;
  const pairings = [];
  const unpaired = new Set(playerPool.map((player) => toId(player.userId)));
  let carry = null;

  for (const scoreKey of scoreKeys) {
    let group = groupedByScore.get(scoreKey) || [];
    group = shuffleArray(group);
    if (carry) {
      group = [carry, ...group];
      carry = null;
    }

    const result = pairGroupAdvanced({
      group,
      unpaired,
      playedSet,
      history,
      roundNumber,
      startMatchIndex: matchIndex,
    });

    pairings.push(...result.pairings);
    matchIndex = result.nextMatchIndex;
    carry = result.leftover;
  }

  if (carry && unpaired.has(toId(carry.userId))) {
    const candidates = playerPool.filter(
      (player) => toId(player.userId) !== toId(carry.userId) && unpaired.has(toId(player.userId)),
    );
    const opponent = pickNearestScoreOpponent(carry, candidates, playedSet);
    if (opponent) {
      const colors = assignBalancedColors(carry, opponent, history);
      pairings.push(
        createBasePairing({
          roundNumber,
          matchIndex,
          whiteId: colors.whiteId,
          blackId: colors.blackId,
        }),
      );
      matchIndex += 1;
      unpaired.delete(toId(carry.userId));
      unpaired.delete(toId(opponent.userId));
    }
  }

  const remaining = playerPool.filter((player) => unpaired.has(toId(player.userId)));
  while (remaining.length >= 2) {
    const playerA = remaining.shift();
    const opponent = remaining.shift();
    if (!playerA || !opponent) break;
    const colors = assignBalancedColors(playerA, opponent, history);
    pairings.push(
      createBasePairing({
        roundNumber,
        matchIndex,
        whiteId: colors.whiteId,
        blackId: colors.blackId,
      }),
    );
    matchIndex += 1;
    unpaired.delete(toId(playerA.userId));
    unpaired.delete(toId(opponent.userId));
  }

  const leftoverIds = [...unpaired];
  if (!byePlayer && leftoverIds.length === 1) {
    byePlayer = playerPool.find((player) => toId(player.userId) === leftoverIds[0]) || null;
  }

  if (byePlayer) {
    pairings.push(createByePairing(roundNumber, matchIndex, toId(byePlayer.userId)));
  }

  return pairings;
}

function rotateRoundRobin(players) {
  if (players.length <= 2) return [...players];
  const fixed = players[0];
  const movable = players.slice(1);
  const last = movable.pop();
  return [fixed, last, ...movable];
}

function generateRoundRobinPairings({ players, roundNumber }) {
  const seeded = stableSortBySeed(players);
  const participantIds = seeded.map((player) => toId(player.userId));

  if (participantIds.length % 2 === 1) {
    participantIds.push(null);
  }

  const roundsCount = Math.max(1, participantIds.length - 1);
  if (roundNumber > roundsCount) return [];

  let arrangement = [...participantIds];
  for (let i = 1; i < roundNumber; i += 1) {
    arrangement = rotateRoundRobin(arrangement);
  }

  const pairings = [];
  const half = arrangement.length / 2;
  let matchIndex = 0;

  for (let i = 0; i < half; i += 1) {
    const playerA = arrangement[i];
    const playerB = arrangement[arrangement.length - 1 - i];

    if (!playerA && !playerB) continue;
    if (!playerA || !playerB) {
      pairings.push(createByePairing(roundNumber, matchIndex, playerA || playerB));
      matchIndex += 1;
      continue;
    }

    const swapColors = (roundNumber + i) % 2 === 0;
    pairings.push(
      createBasePairing({
        roundNumber,
        matchIndex,
        whiteId: swapColors ? playerB : playerA,
        blackId: swapColors ? playerA : playerB,
      }),
    );
    matchIndex += 1;
  }

  return pairings;
}

function nextPowerOfTwo(value) {
  let power = 1;
  while (power < value) power *= 2;
  return power;
}

export function resolveWinnerId(game) {
  if (!game) return "";
  if (game.winnerId) return toId(game.winnerId);

  if (game.isBye) {
    return toId(game.whiteId || game.blackId);
  }

  if (game.result === "1-0") return toId(game.whiteId);
  if (game.result === "0-1") return toId(game.blackId);
  return "";
}

function generateKnockoutPairings({ players, games, roundNumber }) {
  const seeded = stableSortBySeed(players);

  if (roundNumber === 1) {
    const slots = seeded.map((player) => toId(player.userId));
    const bracketSize = nextPowerOfTwo(Math.max(2, slots.length));
    while (slots.length < bracketSize) slots.push(null);

    const pairings = [];
    let matchIndex = 0;
    for (let i = 0; i < bracketSize / 2; i += 1) {
      const playerA = slots[i];
      const playerB = slots[bracketSize - 1 - i];
      if (!playerA && !playerB) continue;
      if (!playerA || !playerB) {
        pairings.push(createByePairing(roundNumber, matchIndex, playerA || playerB));
      } else {
        pairings.push(
          createBasePairing({
            roundNumber,
            matchIndex,
            whiteId: i % 2 === 0 ? playerA : playerB,
            blackId: i % 2 === 0 ? playerB : playerA,
          }),
        );
      }
      matchIndex += 1;
    }
    return pairings;
  }

  const previousRoundGames = [...games]
    .filter((game) => Number(game.roundNumber) === Number(roundNumber) - 1)
    .sort((a, b) => Number(a.matchIndex || 0) - Number(b.matchIndex || 0));

  const winners = previousRoundGames
    .map((game) => resolveWinnerId(game))
    .filter(Boolean);
  if (winners.length <= 1) return [];

  const pairings = [];
  let matchIndex = 0;
  for (let i = 0; i < winners.length; i += 2) {
    const playerA = winners[i];
    const playerB = winners[i + 1] || null;
    if (!playerB) {
      pairings.push(createByePairing(roundNumber, matchIndex, playerA));
    } else {
      pairings.push(
        createBasePairing({
          roundNumber,
          matchIndex,
          whiteId: i % 4 === 0 ? playerA : playerB,
          blackId: i % 4 === 0 ? playerB : playerA,
        }),
      );
    }
    matchIndex += 1;
  }
  return pairings;
}

export function generateRoundPairings({ tournamentType, players, games, roundNumber }) {
  if (!Array.isArray(players) || players.length === 0) return [];

  if (tournamentType === "swiss") {
    return generateSwissPairings({ players, games, roundNumber });
  }
  if (tournamentType === "roundRobin") {
    return generateRoundRobinPairings({ players, roundNumber });
  }
  if (tournamentType === "knockout") {
    return generateKnockoutPairings({ players, games, roundNumber });
  }
  return [];
}

export function parseTimeControl(input) {
  if (typeof input === "string") {
    const match = input.trim().match(/^(\d+)\s*\+\s*(\d+)$/);
    if (match) {
      const minutes = Number(match[1]);
      const incrementSeconds = Number(match[2]);
      return {
        baseMs: Math.max(60_000, minutes * 60_000),
        incMs: Math.max(0, incrementSeconds * 1000),
        label: `${minutes}+${incrementSeconds}`,
      };
    }
  }

  const baseMsRaw =
    Number(input?.baseMs) ||
    (Number.isFinite(Number(input?.initial))
      ? Number(input.initial) * 1000
      : 300_000);
  const incMsRaw =
    Number(input?.incMs) ||
    (Number.isFinite(Number(input?.increment))
      ? Number(input.increment) * 1000
      : 0);

  const baseMs = Math.max(1_000, Math.round(baseMsRaw));
  const incMs = Math.max(0, Math.round(incMsRaw));
  const label = `${Math.round(baseMs / 60_000)}+${Math.round(incMs / 1000)}`;

  return { baseMs, incMs, label };
}

export function getRatingFieldForTimeControl(timeControl) {
  const baseMs = Number(timeControl?.baseMs || 0);
  const baseMinutes = baseMs / 60_000;

  if (baseMinutes <= 2) return "bulletRating";
  if (baseMinutes <= 8) return "blitzRating";
  if (baseMinutes <= 25) return "rapidRating";
  return "classicalRating";
}

export function getUserRatingForTournament(user, timeControl) {
  const ratingField = getRatingFieldForTimeControl(timeControl);
  const fromField = Number(user?.[ratingField]);
  const fallback = Number(user?.rating);

  if (Number.isFinite(fromField) && fromField > 0) return fromField;
  if (Number.isFinite(fallback) && fallback > 0) return fallback;
  return 1200;
}

export function computeRoundsPlanned(tournamentType, playerCount, requestedRounds) {
  const count = Math.max(2, Number(playerCount) || 2);
  const requested = Number(requestedRounds);
  const hasRequested = Number.isInteger(requested) && requested > 0;

  if (tournamentType === "swiss") {
    if (hasRequested) {
      // Respect explicit requests (e.g., 2 players but 4 rounds for color balance),
      // while keeping an upper safety cap.
      return Math.max(1, Math.min(MAX_SWISS_ROUNDS, requested));
    }
    const suggested = Math.max(3, Math.ceil(Math.log2(count)) + 1);
    return Math.max(1, Math.min(Math.max(1, count - 1), suggested, MAX_SWISS_ROUNDS));
  }

  if (tournamentType === "roundRobin") {
    return count % 2 === 0 ? count - 1 : count;
  }

  if (tournamentType === "knockout") {
    return Math.max(1, Math.ceil(Math.log2(count)));
  }

  return hasRequested ? requested : 1;
}

export function getWinnerFromResult(result, whiteId, blackId) {
  if (result === "1-0") return toId(whiteId);
  if (result === "0-1") return toId(blackId);
  return "";
}

export function createPlayerStatsMap(players, games, tournamentType) {
  const statsMap = new Map();

  for (const player of players) {
    const userId = toId(player.userId);
    statsMap.set(userId, {
      score: 0,
      buchholz: 0,
      gamesPlayed: 0,
      hadBye: false,
      opponents: [],
    });
  }

  for (const game of games) {
    const result = String(game.result || "*");
    if (!SUPPORTED_RESULTS.has(result) || result === "*") continue;

    const whiteId = toId(game.whiteId);
    const blackId = toId(game.blackId);

    if (game.isBye || !blackId) {
      const byeWinner = resolveWinnerId(game) || whiteId || blackId;
      if (!byeWinner || !statsMap.has(byeWinner)) continue;
      const stats = statsMap.get(byeWinner);
      stats.score += 1;
      stats.gamesPlayed += 1;
      stats.hadBye = true;
      continue;
    }

    if (!statsMap.has(whiteId) || !statsMap.has(blackId)) continue;
    const points = RESULT_POINTS[result];
    if (!points) continue;

    const whiteStats = statsMap.get(whiteId);
    const blackStats = statsMap.get(blackId);

    whiteStats.score += points.white;
    blackStats.score += points.black;
    whiteStats.gamesPlayed += 1;
    blackStats.gamesPlayed += 1;
    whiteStats.opponents.push(blackId);
    blackStats.opponents.push(whiteId);
  }

  if (tournamentType === "swiss") {
    for (const [userId, stats] of statsMap.entries()) {
      let buchholz = 0;
      for (const opponentId of stats.opponents) {
        const opponentStats = statsMap.get(opponentId);
        if (opponentStats) {
          buchholz += opponentStats.score;
        }
      }
      stats.buchholz = toRoundNumber(buchholz);
      statsMap.set(userId, stats);
    }
  }

  for (const [userId, stats] of statsMap.entries()) {
    statsMap.set(userId, {
      score: toRoundNumber(stats.score),
      buchholz: tournamentType === "swiss" ? toRoundNumber(stats.buchholz) : 0,
      gamesPlayed: stats.gamesPlayed,
      hadBye: !!stats.hadBye,
    });
  }

  return statsMap;
}

export function sortStandings(players) {
  return [...players].sort((a, b) => {
    const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
    if (scoreDiff !== 0) return scoreDiff;

    const buchholzDiff = Number(b.buchholz || 0) - Number(a.buchholz || 0);
    if (buchholzDiff !== 0) return buchholzDiff;

    const aSeed = Number.isFinite(Number(a.seed)) ? Number(a.seed) : Number.MAX_SAFE_INTEGER;
    const bSeed = Number.isFinite(Number(b.seed)) ? Number(b.seed) : Number.MAX_SAFE_INTEGER;
    if (aSeed !== bSeed) return aSeed - bSeed;

    const ratingDiff = Number(b.rating || 0) - Number(a.rating || 0);
    if (ratingDiff !== 0) return ratingDiff;

    const aJoined = new Date(a.joinedAt || 0).getTime();
    const bJoined = new Date(b.joinedAt || 0).getTime();
    return aJoined - bJoined;
  });
}

export function buildManualRoundPairings({
  roundNumber,
  pairings,
  registeredIds,
  existingGames = [],
  tournamentType = "swiss",
  allowRematch = false,
}) {
  if (!Number.isInteger(Number(roundNumber)) || Number(roundNumber) <= 0) {
    throw new Error("Invalid round number");
  }
  if (!Array.isArray(pairings) || pairings.length === 0) {
    throw new Error("pairings is required");
  }

  const normalizedRegisteredIds = new Set(
    (registeredIds || []).map((id) => toId(id)).filter(Boolean),
  );
  if (normalizedRegisteredIds.size < 2) {
    throw new Error("At least 2 registered players are required");
  }

  const previousGames = (existingGames || []).filter(
    (game) => Number(game.roundNumber || 0) < Number(roundNumber),
  );
  const playedSet = buildPlayedSet(previousGames);

  const seenPlayers = new Set();
  let byeCount = 0;
  const built = [];

  for (let i = 0; i < pairings.length; i += 1) {
    const raw = pairings[i] || {};
    const whiteId = toId(raw.whiteId);
    const blackId = toId(raw.blackId);

    if (!whiteId) {
      throw new Error(`pairings[${i}].whiteId is required`);
    }
    if (!normalizedRegisteredIds.has(whiteId)) {
      throw new Error(`pairings[${i}].whiteId is not a registered player`);
    }
    if (seenPlayers.has(whiteId)) {
      throw new Error(`Player ${whiteId} appears more than once`);
    }
    seenPlayers.add(whiteId);

    if (!blackId) {
      byeCount += 1;
      if (byeCount > 1) {
        throw new Error("Only one bye is allowed per round");
      }

      built.push(
        createByePairing(Number(roundNumber), i, whiteId),
      );
      continue;
    }

    if (!normalizedRegisteredIds.has(blackId)) {
      throw new Error(`pairings[${i}].blackId is not a registered player`);
    }
    if (whiteId === blackId) {
      throw new Error(`pairings[${i}] cannot pair a player against themselves`);
    }
    if (seenPlayers.has(blackId)) {
      throw new Error(`Player ${blackId} appears more than once`);
    }
    seenPlayers.add(blackId);

    const rematchKey = playedKey(whiteId, blackId);
    if (!allowRematch && playedSet.has(rematchKey)) {
      throw new Error(`pairings[${i}] is a rematch (${whiteId} vs ${blackId})`);
    }

    built.push(
      createBasePairing({
        roundNumber: Number(roundNumber),
        matchIndex: i,
        whiteId,
        blackId,
      }),
    );
  }

  if (seenPlayers.size !== normalizedRegisteredIds.size) {
    throw new Error("Manual pairings must include every registered player exactly once");
  }

  if (tournamentType === "knockout") {
    for (const game of built) {
      if (!game.isBye && !game.blackId) {
        throw new Error("Invalid knockout pairing");
      }
    }
  }

  return built;
}
