const GLICKO2_SCALE = 173.7178;
const DEFAULT_RATING = 1200;
const DEFAULT_RD = 350;
const DEFAULT_VOLATILITY = 0.06;
const MIN_RATING = 100;
const MAX_RATING = 4000;
const MIN_RD = 30;
const MAX_RD = 350;
const MIN_VOLATILITY = 0.01;
const MAX_VOLATILITY = 1.2;
const VOLATILITY_TAU = 0.5;
const CONVERGENCE_EPSILON = 0.000001;
const RATING_PERIOD_MS = 24 * 60 * 60 * 1000; // 1 day

function clamp(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function clampRating(value) {
  return clamp(value, MIN_RATING, MAX_RATING, DEFAULT_RATING);
}

function clampRd(value) {
  return clamp(value, MIN_RD, MAX_RD, DEFAULT_RD);
}

function clampVolatility(value) {
  return clamp(value, MIN_VOLATILITY, MAX_VOLATILITY, DEFAULT_VOLATILITY);
}

function toMu(rating) {
  return (rating - 1500) / GLICKO2_SCALE;
}

function fromMu(mu) {
  return mu * GLICKO2_SCALE + 1500;
}

function toPhi(rd) {
  return rd / GLICKO2_SCALE;
}

function fromPhi(phi) {
  return phi * GLICKO2_SCALE;
}

function g(phi) {
  const phiSquared = phi ** 2;
  return 1 / Math.sqrt(1 + (3 * phiSquared) / (Math.PI ** 2));
}

function expectedScore(mu, opponentMu, opponentPhi) {
  const gOpponent = g(opponentPhi);
  return 1 / (1 + Math.exp(-gOpponent * (mu - opponentMu)));
}

function normalizeScoreForColor(winnerColor, color) {
  if (winnerColor === "w") return color === "w" ? 1 : 0;
  if (winnerColor === "b") return color === "b" ? 1 : 0;
  return 0.5;
}

function getRatingPeriodsSince(lastRatedAt, nowDate) {
  const nowMs = nowDate.getTime();
  if (!lastRatedAt) return 1;

  const parsedLast = new Date(lastRatedAt);
  const lastMs = parsedLast.getTime();
  if (!Number.isFinite(lastMs)) return 1;

  const elapsedMs = Math.max(0, nowMs - lastMs);
  return Math.max(1, elapsedMs / RATING_PERIOD_MS);
}

function volatilityObjective(x, delta, phi, v, a, tau) {
  const expX = Math.exp(x);
  const phiSquared = phi ** 2;
  const numerator = expX * (delta ** 2 - phiSquared - v - expX);
  const denominator = 2 * (phiSquared + v + expX) ** 2;
  return numerator / denominator - (x - a) / (tau ** 2);
}

function solveNewVolatility(phi, sigma, delta, v, tau = VOLATILITY_TAU) {
  const safeSigma = clampVolatility(sigma);
  const a = Math.log(safeSigma ** 2);
  const deltaSquared = delta ** 2;
  const phiSquared = phi ** 2;

  let A = a;
  let B;
  if (deltaSquared > phiSquared + v) {
    B = Math.log(deltaSquared - phiSquared - v);
  } else {
    let k = 1;
    B = a - k * tau;
    while (
      volatilityObjective(B, delta, phi, v, a, tau) < 0 &&
      k < 1000
    ) {
      k += 1;
      B = a - k * tau;
    }
  }

  let fA = volatilityObjective(A, delta, phi, v, a, tau);
  let fB = volatilityObjective(B, delta, phi, v, a, tau);

  if (!Number.isFinite(fA) || !Number.isFinite(fB)) {
    return safeSigma;
  }

  let iterations = 0;
  while (Math.abs(B - A) > CONVERGENCE_EPSILON && iterations < 1000) {
    iterations += 1;
    const denominator = fB - fA;
    if (!Number.isFinite(denominator) || denominator === 0) break;

    const C = A + ((A - B) * fA) / denominator;
    const fC = volatilityObjective(C, delta, phi, v, a, tau);

    if (!Number.isFinite(fC)) break;

    if (fC * fB < 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }

    B = C;
    fB = fC;
  }

  const sigmaPrime = Math.exp(A / 2);
  return clampVolatility(sigmaPrime);
}

function normalizeNow(now) {
  if (now instanceof Date && Number.isFinite(now.getTime())) return now;
  const parsed = new Date(now || Date.now());
  if (Number.isFinite(parsed.getTime())) return parsed;
  return new Date();
}

function updateGlickoPlayer({
  rating,
  rd,
  volatility,
  opponentRating,
  opponentRd,
  score,
  lastRatedAt,
  now,
}) {
  const safeNow = normalizeNow(now);
  const oldRating = clampRating(rating);
  const oldRd = clampRd(rd);
  const oldVolatility = clampVolatility(volatility);
  const oppRating = clampRating(opponentRating);
  const oppRd = clampRd(opponentRd);
  const safeScore = clamp(score, 0, 1, 0.5);

  const mu = toMu(oldRating);
  const opponentMu = toMu(oppRating);
  const opponentPhi = toPhi(oppRd);
  const periods = getRatingPeriodsSince(lastRatedAt, safeNow);
  const phi = Math.min(
    toPhi(MAX_RD),
    Math.sqrt(toPhi(oldRd) ** 2 + periods * oldVolatility ** 2),
  );

  const gOpponent = g(opponentPhi);
  const expected = expectedScore(mu, opponentMu, opponentPhi);
  const variance = 1 / (gOpponent ** 2 * expected * (1 - expected));
  const delta = variance * gOpponent * (safeScore - expected);
  const newVolatility = solveNewVolatility(
    phi,
    oldVolatility,
    delta,
    variance,
  );

  const phiStar = Math.min(
    toPhi(MAX_RD),
    Math.sqrt(phi ** 2 + newVolatility ** 2),
  );
  const newPhi = 1 / Math.sqrt(1 / (phiStar ** 2) + 1 / variance);
  const newMu = mu + newPhi ** 2 * gOpponent * (safeScore - expected);

  const newRating = clampRating(Math.round(fromMu(newMu)));
  const rdBefore = clampRd(Math.round(fromPhi(phi)));
  const newRd = clampRd(Math.round(fromPhi(newPhi)));

  return {
    oldRating,
    newRating,
    delta: newRating - oldRating,
    oldRd,
    rdBefore,
    newRd,
    oldVolatility,
    newVolatility,
    expected,
    score: safeScore,
    periodsSinceLast: periods,
  };
}

export function updateGlickoPair({
  whiteRating,
  whiteRd,
  whiteVolatility,
  whiteLastRatedAt,
  blackRating,
  blackRd,
  blackVolatility,
  blackLastRatedAt,
  winnerColor,
  now,
}) {
  const whiteScore = normalizeScoreForColor(winnerColor, "w");
  const blackScore = normalizeScoreForColor(winnerColor, "b");

  const white = updateGlickoPlayer({
    rating: whiteRating,
    rd: whiteRd,
    volatility: whiteVolatility,
    opponentRating: blackRating,
    opponentRd: blackRd,
    score: whiteScore,
    lastRatedAt: whiteLastRatedAt,
    now,
  });

  const black = updateGlickoPlayer({
    rating: blackRating,
    rd: blackRd,
    volatility: blackVolatility,
    opponentRating: whiteRating,
    opponentRd: whiteRd,
    score: blackScore,
    lastRatedAt: blackLastRatedAt,
    now,
  });

  return { white, black };
}

export function rdFieldForPool(pool) {
  if (pool === "bullet") return "bulletRd";
  if (pool === "blitz") return "blitzRd";
  if (pool === "rapid") return "rapidRd";
  return "classicalRd";
}

export function volatilityFieldForPool(pool) {
  if (pool === "bullet") return "bulletVolatility";
  if (pool === "blitz") return "blitzVolatility";
  if (pool === "rapid") return "rapidVolatility";
  return "classicalVolatility";
}

export function lastRatedAtFieldForPool(pool) {
  if (pool === "bullet") return "bulletLastRatedAt";
  if (pool === "blitz") return "blitzLastRatedAt";
  if (pool === "rapid") return "rapidLastRatedAt";
  return "classicalLastRatedAt";
}

export const DEFAULT_GLICKO_RD = DEFAULT_RD;
export const DEFAULT_GLICKO_VOLATILITY = DEFAULT_VOLATILITY;
