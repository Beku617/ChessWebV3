import type { NavigateFunction } from "react-router-dom";

type SupportedVariant = "standard" | "chess960" | "threeCheck";

export type GameOverMode = "bot" | "quick" | "friend" | "local";

export interface GameOverTimeControl {
  initial: number;
  increment: number;
}

export interface NewGameRouteInput {
  mode: GameOverMode;
  variant?: string | null;
  timeControl?: GameOverTimeControl | null;
}

interface ResolvedNewGameRoute {
  pathname: string;
  search: string;
  state?: Record<string, unknown>;
}

function normalizeVariant(variant?: string | null): SupportedVariant {
  if (typeof variant !== "string") return "standard";
  const normalized = variant.trim().toLowerCase();
  if (normalized === "chess960") return "chess960";
  if (
    normalized === "threecheck" ||
    normalized === "three-check" ||
    normalized === "three_check"
  ) {
    return "threeCheck";
  }
  return "standard";
}

function normalizeTimeControl(
  timeControl?: GameOverTimeControl | null,
): GameOverTimeControl | null {
  if (!timeControl) return null;
  const initial = Number(timeControl.initial);
  const increment = Number(timeControl.increment);

  if (
    !Number.isFinite(initial) ||
    !Number.isFinite(increment) ||
    initial < 0 ||
    increment < 0
  ) {
    return null;
  }

  return {
    initial: Math.round(initial),
    increment: Math.round(increment),
  };
}

function buildTimeControlSearch(
  timeControl: GameOverTimeControl | null,
  variant: SupportedVariant,
) {
  const params = new URLSearchParams();
  if (timeControl) {
    params.set("initial", String(timeControl.initial));
    params.set("increment", String(timeControl.increment));
  }
  if (variant !== "standard") {
    params.set("variant", variant);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function resolveNewGameRoute(input: NewGameRouteInput): ResolvedNewGameRoute {
  const variant = normalizeVariant(input.variant);
  const timeControl = normalizeTimeControl(input.timeControl);

  if (input.mode === "bot") {
    return { pathname: "/play/bot", search: "" };
  }

  if (input.mode === "friend") {
    return { pathname: "/play/friend", search: "" };
  }

  if (input.mode === "local") {
    return { pathname: "/play", search: "" };
  }

  if (variant !== "standard") {
    const search = buildTimeControlSearch(timeControl, variant);
    return {
      pathname: "/play/variants",
      search,
      state: timeControl
        ? {
            initial: timeControl.initial,
            increment: timeControl.increment,
            variant,
          }
        : { variant },
    };
  }

  const search = buildTimeControlSearch(timeControl, "standard");
  return {
    pathname: "/play/quick",
    search,
    state: timeControl
      ? {
          initial: timeControl.initial,
          increment: timeControl.increment,
          variant: "standard",
        }
      : undefined,
  };
}

export function navigateToNewGameRoute(
  navigate: NavigateFunction,
  input: NewGameRouteInput,
) {
  const destination = resolveNewGameRoute(input);
  if (destination.state) {
    navigate(
      {
        pathname: destination.pathname,
        search: destination.search,
      },
      { state: destination.state },
    );
    return;
  }

  navigate({
    pathname: destination.pathname,
    search: destination.search,
  });
}
