import type { SettingsValues } from "../store/settingsStore";

export interface TimeControlValue {
  initial: number;
  increment: number;
}

export function isClickMoveEnabled(
  moveInput: SettingsValues["moveInput"],
): boolean {
  return moveInput !== "drag";
}

export function isDragMoveEnabled(
  moveInput: SettingsValues["moveInput"],
): boolean {
  return moveInput !== "click";
}

const QUICK_MATCH_DEFAULTS: Record<
  SettingsValues["defaultTimeControl"],
  TimeControlValue
> = {
  bullet: { initial: 60, increment: 0 },
  blitz: { initial: 180, increment: 0 },
  rapid: { initial: 600, increment: 0 },
  classical: { initial: 1800, increment: 20 },
  custom: { initial: 600, increment: 0 },
};

export function resolveQuickMatchDefaultTimeControl(
  defaultTimeControl: SettingsValues["defaultTimeControl"],
  customFallback?: TimeControlValue | null,
): TimeControlValue {
  if (defaultTimeControl === "custom") {
    return customFallback ?? QUICK_MATCH_DEFAULTS.rapid;
  }

  return (
    QUICK_MATCH_DEFAULTS[defaultTimeControl] ?? QUICK_MATCH_DEFAULTS.rapid
  );
}
