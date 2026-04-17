export const MIN_STORED_MOVES = 2;

export type HistoryPersistenceStatus =
  | "idle"
  | "saving"
  | "saved"
  | "skipped_short_game"
  | "failed";

export function canPersistHistoryByMoveCount(moveCount: number): boolean {
  return Number.isFinite(moveCount) && moveCount >= MIN_STORED_MOVES;
}

export function canAnalyzeSavedGame(savedGameId: string | null): boolean {
  return typeof savedGameId === "string" && savedGameId.trim().length > 0;
}

export function getHistoryStatusNote(
  status: HistoryPersistenceStatus,
): string | null {
  if (status === "saving") return "Saving game to history...";
  if (status === "skipped_short_game")
    return "Game analyze is unavailable for very short games.";
  if (status === "failed")
    return "Game analyze is unavailable because this game was not saved.";
  return null;
}
