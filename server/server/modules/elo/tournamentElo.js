function clampElo(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1200;
  return Math.max(100, Math.min(4000, Math.round(parsed)));
}

export function getTournamentKFactor(rating) {
  const safeRating = clampElo(rating);
  if (safeRating < 2100) return 32;
  if (safeRating < 2400) return 16;
  return 10;
}

export function expectedScore(playerRating, opponentRating) {
  const player = clampElo(playerRating);
  const opponent = clampElo(opponentRating);
  return 1 / (1 + 10 ** ((opponent - player) / 400));
}

export function resultToScores(result) {
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

export function calculateTournamentEloPair({
  whiteRating,
  blackRating,
  result,
}) {
  const normalizedWhite = clampElo(whiteRating);
  const normalizedBlack = clampElo(blackRating);
  const scores = resultToScores(result);
  if (!scores) {
    return null;
  }

  const expectedWhite = expectedScore(normalizedWhite, normalizedBlack);
  const expectedBlack = 1 - expectedWhite;
  const whiteK = getTournamentKFactor(normalizedWhite);
  const blackK = getTournamentKFactor(normalizedBlack);

  const whiteDelta = Math.round(whiteK * (scores.white - expectedWhite));
  const blackDelta = Math.round(blackK * (scores.black - expectedBlack));

  const whiteAfter = clampElo(normalizedWhite + whiteDelta);
  const blackAfter = clampElo(normalizedBlack + blackDelta);

  return {
    white: {
      before: normalizedWhite,
      after: whiteAfter,
      delta: whiteAfter - normalizedWhite,
      expected: expectedWhite,
      score: scores.white,
      kFactor: whiteK,
    },
    black: {
      before: normalizedBlack,
      after: blackAfter,
      delta: blackAfter - normalizedBlack,
      expected: expectedBlack,
      score: scores.black,
      kFactor: blackK,
    },
  };
}
