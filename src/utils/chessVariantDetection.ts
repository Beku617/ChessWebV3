const STANDARD_START_PLACEMENT = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";

function normalizeVariantToken(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function hasNonStandardStartingFen(startingFen: unknown): boolean {
  const normalizedFen = String(startingFen || "").trim();
  if (!normalizedFen) return false;
  if (normalizedFen.toLowerCase() === "start") return false;

  const placement = normalizedFen.split(/\s+/)[0] || "";
  if (!placement) return false;
  return placement !== STANDARD_START_PLACEMENT;
}

export function isLikelyChess960Game(input: {
  variant?: unknown;
  event?: unknown;
  startingFen?: unknown;
}): boolean {
  const variant = normalizeVariantToken(input?.variant);
  if (variant === "chess960" || variant === "960") {
    return true;
  }

  const eventText = String(input?.event || "");
  if (/960|chess960/i.test(eventText)) {
    return true;
  }

  return hasNonStandardStartingFen(input?.startingFen);
}
