import { normalizeTimeControl } from "./gameClock.js";

export const ABORT_TIMEOUT_MS_DEFAULT = 60 * 1000;
export const ABORT_TIMEOUT_MS_BULLET = 10 * 1000;
export const MIN_REAL_GAME_PLIES = 2;

function normalizeSeconds(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.round(parsed);
}

export function normalizeTimeControlSeconds(timeControl) {
  const normalized = normalizeTimeControl(timeControl);
  return {
    initial: normalizeSeconds(normalized?.initial, 300),
    increment: normalizeSeconds(normalized?.increment, 0),
  };
}

export function isBulletAbortTimeControl(timeControl) {
  const normalized = normalizeTimeControlSeconds(timeControl);
  return normalized.initial > 0 && normalized.initial < 180;
}

export function getAbortThresholdMs(timeControl) {
  return isBulletAbortTimeControl(timeControl)
    ? ABORT_TIMEOUT_MS_BULLET
    : ABORT_TIMEOUT_MS_DEFAULT;
}

export function isRealGameByPlies(plies) {
  const normalized = Number(plies);
  return Number.isFinite(normalized) && normalized >= MIN_REAL_GAME_PLIES;
}

export function shouldConvertToAborted(reason, plies) {
  const normalizedReason = String(reason || "").trim().toLowerCase();
  if (normalizedReason === "aborted") return true;
  return false;
}

export function resolveTerminalReason(reason, plies) {
  return shouldConvertToAborted(reason, plies) ? "aborted" : reason;
}

export function shouldApplyRatedResult(reason, plies) {
  const resolvedReason = resolveTerminalReason(reason, plies);
  return resolvedReason !== "aborted" && isRealGameByPlies(plies);
}

export function shouldPersistHistoryByPlies(plies) {
  return isRealGameByPlies(plies);
}
