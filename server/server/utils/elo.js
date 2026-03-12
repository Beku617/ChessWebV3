const MIN_RATING = 100;
const MAX_RATING = 4000;
const DEFAULT_TIME_CONTROL = { initial: 300, increment: 0 };

function normalizeSeconds(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function clampRating(value) {
  if (!Number.isFinite(value)) return 1200;
  if (value < MIN_RATING) return MIN_RATING;
  if (value > MAX_RATING) return MAX_RATING;
  return value;
}

export function expectedScore(ratingA, ratingB) {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

export function kFactor(rating, gamesPlayed) {
  if (gamesPlayed < 10) return 40;
  if (rating < 2000) return 20;
  return 10;
}

export function normalizeResult(winnerColor) {
  if (winnerColor === "w") {
    return { white: 1, black: 0 };
  }
  if (winnerColor === "b") {
    return { white: 0, black: 1 };
  }
  return { white: 0.5, black: 0.5 };
}

export function getRatingPoolForTimeControl(timeControl) {
  const initial = normalizeSeconds(
    timeControl?.initial,
    DEFAULT_TIME_CONTROL.initial,
  );
  const increment = normalizeSeconds(
    timeControl?.increment,
    DEFAULT_TIME_CONTROL.increment,
  );

  // Approximate total think time for a 40-move game.
  const estimatedSeconds = initial + increment * 40;
  if (estimatedSeconds < 180) return "bullet";
  if (estimatedSeconds < 600) return "blitz";
  if (estimatedSeconds < 1800) return "rapid";
  return "classical";
}

export function ratingFieldForPool(pool) {
  if (pool === "bullet") return "bulletRating";
  if (pool === "blitz") return "blitzRating";
  if (pool === "rapid") return "rapidRating";
  return "classicalRating";
}

export function gamesFieldForPool(pool) {
  if (pool === "bullet") return "bulletGames";
  if (pool === "blitz") return "blitzGames";
  if (pool === "rapid") return "rapidGames";
  return "classicalGames";
}

export function updateEloPair({
  whiteRating,
  whiteGamesPlayed,
  blackRating,
  blackGamesPlayed,
  winnerColor,
}) {
  const currentWhiteRating = clampRating(Number(whiteRating));
  const currentBlackRating = clampRating(Number(blackRating));
  const currentWhiteGames = Math.max(0, Number(whiteGamesPlayed) || 0);
  const currentBlackGames = Math.max(0, Number(blackGamesPlayed) || 0);

  const expectedWhite = expectedScore(currentWhiteRating, currentBlackRating);
  const expectedBlack = 1 - expectedWhite;
  const actual = normalizeResult(winnerColor);

  const whiteK = kFactor(currentWhiteRating, currentWhiteGames);
  const blackK = kFactor(currentBlackRating, currentBlackGames);

  const newWhiteRating = clampRating(
    Math.round(currentWhiteRating + whiteK * (actual.white - expectedWhite)),
  );
  const newBlackRating = clampRating(
    Math.round(currentBlackRating + blackK * (actual.black - expectedBlack)),
  );

  return {
    white: {
      oldRating: currentWhiteRating,
      newRating: newWhiteRating,
      delta: newWhiteRating - currentWhiteRating,
      expected: expectedWhite,
      score: actual.white,
      kFactor: whiteK,
    },
    black: {
      oldRating: currentBlackRating,
      newRating: newBlackRating,
      delta: newBlackRating - currentBlackRating,
      expected: expectedBlack,
      score: actual.black,
      kFactor: blackK,
    },
  };
}
