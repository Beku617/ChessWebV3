import type { User } from "../store/authStore";

export type MatchVariant =
  | "standard"
  | "chess960"
  | "threeCheck"
  | "kingOfHill"
  | "atomic";
export type RatingPool =
  | "bullet"
  | "blitz"
  | "rapid"
  | "classical"
  | "chess960Bullet"
  | "chess960Blitz"
  | "chess960Rapid"
  | "chess960Classical";

function normalizeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

export function getRatingPoolForMatch(
  timeControl: { initial?: number; increment?: number } | null | undefined,
  variant: MatchVariant | string | null | undefined,
): RatingPool | null {
  const initial = normalizeNumber(timeControl?.initial, 300);
  const increment = normalizeNumber(timeControl?.increment, 0);
  const normalizedVariant = variant === "standard" ? "standard" : null;

  if (!normalizedVariant) return null;

  const estimatedSeconds = initial + increment * 40;
  const basePool =
    estimatedSeconds < 180
      ? "bullet"
      : estimatedSeconds < 600
        ? "blitz"
        : estimatedSeconds < 1800
          ? "rapid"
          : "classical";

  if (normalizedVariant === "standard") return basePool;
  if (basePool === "bullet") return "chess960Bullet";
  if (basePool === "blitz") return "chess960Blitz";
  if (basePool === "rapid") return "chess960Rapid";
  return "chess960Classical";
}

export function getUserRatingForPool(
  user: User | null | undefined,
  pool: RatingPool | null | undefined,
): number | null {
  if (!user || !pool) return null;

  const value =
    pool === "bullet"
      ? user.bulletRating
      : pool === "blitz"
        ? user.blitzRating
        : pool === "rapid"
          ? user.rapidRating
          : pool === "classical"
            ? user.classicalRating
            : pool === "chess960Bullet"
              ? user.chess960BulletRating
              : pool === "chess960Blitz"
                ? user.chess960BlitzRating
                : pool === "chess960Rapid"
                  ? user.chess960RapidRating
                  : user.chess960ClassicalRating;

  const parsed = Number(value ?? user.rating ?? 1200);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}
