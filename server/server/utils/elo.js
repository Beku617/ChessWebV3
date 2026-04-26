import { normalizeTimeControl } from "./gameClock.js";

const MIN_RATING = 100;
const MAX_RATING = 4000;
const DEFAULT_TIME_CONTROL = { initial: 300, increment: 0 };
const SUPPORTED_RATED_VARIANTS = new Set(["standard", "chess960"]);
const BASE_POOLS = new Set(["bullet", "blitz", "rapid", "classical"]);

function normalizeSeconds(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function normalizeVariantForRatings(variant) {
  if (!variant) return "standard";
  const normalized = String(variant).trim().toLowerCase();
  if (normalized === "standard") return "standard";
  if (normalized === "chess960") return "chess960";
  return normalized;
}

function capitalize(value) {
  const safe = String(value || "");
  if (!safe) return "";
  return safe[0].toUpperCase() + safe.slice(1);
}

function variantPoolFromBasePool(basePool, variant) {
  if (!BASE_POOLS.has(basePool)) return null;
  const normalizedVariant = normalizeVariantForRatings(variant);
  if (!SUPPORTED_RATED_VARIANTS.has(normalizedVariant)) return null;
  if (normalizedVariant === "standard") return basePool;
  return `chess960${capitalize(basePool)}`;
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

export function getRatingPoolForTimeControl(timeControl, variant = "standard") {
  const normalizedTimeControl = normalizeTimeControl(timeControl);
  const initial = normalizeSeconds(
    normalizedTimeControl?.initial,
    DEFAULT_TIME_CONTROL.initial,
  );
  const increment = normalizeSeconds(
    normalizedTimeControl?.increment,
    DEFAULT_TIME_CONTROL.increment,
  );

  // Approximate total think time for a 40-move game.
  const estimatedSeconds = initial + increment * 40;
  if (estimatedSeconds < 180) {
    return variantPoolFromBasePool("bullet", variant);
  }
  if (estimatedSeconds < 600) {
    return variantPoolFromBasePool("blitz", variant);
  }
  if (estimatedSeconds < 1800) {
    return variantPoolFromBasePool("rapid", variant);
  }
  return variantPoolFromBasePool("classical", variant);
}

export function ratingFieldForPool(pool) {
  if (pool === "chess960Bullet") return "chess960BulletRating";
  if (pool === "chess960Blitz") return "chess960BlitzRating";
  if (pool === "chess960Rapid") return "chess960RapidRating";
  if (pool === "chess960Classical") return "chess960ClassicalRating";
  if (pool === "bullet") return "bulletRating";
  if (pool === "blitz") return "blitzRating";
  if (pool === "rapid") return "rapidRating";
  return "classicalRating";
}

export function gamesFieldForPool(pool) {
  if (pool === "chess960Bullet") return "chess960BulletGames";
  if (pool === "chess960Blitz") return "chess960BlitzGames";
  if (pool === "chess960Rapid") return "chess960RapidGames";
  if (pool === "chess960Classical") return "chess960ClassicalGames";
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
