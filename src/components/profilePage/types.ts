import { GameHistory } from "../../historyTypes";

export const API_URL = import.meta.env.VITE_API_URL;

export type FilterType = "all" | "wins" | "losses" | "draws";
export type TabType = "overview" | "games";

export interface TournamentHistoryEntry {
  tournamentId: string;
  tournamentName: string;
  format: string;
  placement: number | null;
  score: number;
  eloChange: number;
  date: string | null;
  status: string;
}

export interface ProfileStats {
  total: number;
  wins: number;
  losses: number;
  draws: number;
  whiteWinRate: number;
  blackWinRate: number;
  avgMoves: number;
  favOpening: string;
  currentStreak: number;
  maxStreak: number;
  avgDuration: number;
  winRate: number;
}

export function formatDuration(ms?: number): string {
  if (!ms) return "-";
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function formatMemberSinceDate(
  value?: string | Date | null,
  locale?: string,
): string | null {
  if (!value) return null;
  const parsedDate = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsedDate.getTime())) return null;
  return parsedDate.toLocaleDateString(locale || undefined, {
    month: "long",
    year: "numeric",
  });
}

export function formatMemberSince(
  primaryDate?: string | Date | null,
  fallbackDate?: string | Date | null,
  locale?: string,
  unknownLabel = "Unknown",
): string {
  return (
    formatMemberSinceDate(primaryDate, locale) ||
    formatMemberSinceDate(fallbackDate, locale) ||
    unknownLabel
  );
}

export function calculateStats(games: GameHistory[]): ProfileStats | null {
  const total = games.length;
  if (total === 0) return null;

  const wins = games.filter((g) => {
    const isWhite = g.playAs === "white";
    return (g.result === "1-0" && isWhite) || (g.result === "0-1" && !isWhite);
  }).length;

  const losses = games.filter((g) => {
    const isWhite = g.playAs === "white";
    return (g.result === "0-1" && isWhite) || (g.result === "1-0" && !isWhite);
  }).length;

  const draws = games.filter((g) => g.result === "1/2-1/2").length;

  const whiteGames = games.filter((g) => g.playAs === "white");
  const whiteWins = whiteGames.filter((g) => g.result === "1-0").length;
  const whiteWinRate = whiteGames.length
    ? Math.round((whiteWins / whiteGames.length) * 100)
    : 0;

  const blackGames = games.filter((g) => g.playAs === "black");
  const blackWins = blackGames.filter((g) => g.result === "0-1").length;
  const blackWinRate = blackGames.length
    ? Math.round((blackWins / blackGames.length) * 100)
    : 0;

  const avgMoves = Math.round(
    games.reduce((acc, g) => acc + g.moves.length, 0) / total,
  );

  const openings: Record<string, number> = {};
  games.forEach((g) => {
    if (g.eco) openings[g.eco] = (openings[g.eco] || 0) + 1;
  });
  const favOpening =
    Object.entries(openings).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";

  let currentStreak = 0;
  let maxStreak = 0;
  const sortedGames = [...games].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  for (const g of sortedGames) {
    const isWhite = g.playAs === "white";
    const isWin =
      (g.result === "1-0" && isWhite) || (g.result === "0-1" && !isWhite);
    if (isWin) {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      break;
    }
  }

  const gamesWithDuration = games.filter((g) => g.durationMs);
  const avgDuration = gamesWithDuration.length
    ? Math.round(
        gamesWithDuration.reduce((acc, g) => acc + (g.durationMs || 0), 0) /
          gamesWithDuration.length,
      )
    : 0;

  const winRate = Math.round((wins / total) * 100);

  return {
    total,
    wins,
    losses,
    draws,
    whiteWinRate,
    blackWinRate,
    avgMoves,
    favOpening,
    currentStreak,
    maxStreak,
    avgDuration,
    winRate,
  };
}

export function filterGames(
  games: GameHistory[],
  filter: FilterType,
): GameHistory[] {
  return games.filter((g) => {
    if (filter === "all") return true;
    const isWhite = g.playAs === "white";
    if (filter === "wins")
      return (
        (g.result === "1-0" && isWhite) || (g.result === "0-1" && !isWhite)
      );
    if (filter === "losses")
      return (
        (g.result === "0-1" && isWhite) || (g.result === "1-0" && !isWhite)
      );
    if (filter === "draws") return g.result === "1/2-1/2";
    return true;
  });
}
