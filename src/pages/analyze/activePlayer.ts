type PlayerSide = "white" | "black";

interface ActivePlayerInput {
  viewerUserId?: unknown;
  gameUserId?: unknown;
  playAs?: string | null;
}

function normalizeId(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    const maybeId = (value as { _id?: unknown })._id;
    if (typeof maybeId === "string") return maybeId.trim();
    if (maybeId && typeof maybeId === "object" && "toString" in maybeId) {
      const normalized = String(maybeId).trim();
      return normalized === "[object Object]" ? "" : normalized;
    }
  }
  if (value && typeof value === "object" && "toString" in value) {
    const normalized = String(value).trim();
    return normalized === "[object Object]" ? "" : normalized;
  }
  return "";
}

export function getAnalyzeActivePlayerSide(
  input: ActivePlayerInput,
): PlayerSide | null {
  const viewerUserId = normalizeId(input.viewerUserId);
  const gameUserId = normalizeId(input.gameUserId);
  const playAs = typeof input.playAs === "string" ? input.playAs : "";

  if (!viewerUserId || !gameUserId || viewerUserId !== gameUserId) {
    return null;
  }

  if (playAs === "white" || playAs === "black") {
    return playAs;
  }

  return null;
}
