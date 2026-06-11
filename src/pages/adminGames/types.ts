export const API_URL = import.meta.env.VITE_API_URL;

export type GameVariant = "standard" | "chess960";
export type GamePlayAs = "white" | "black";

export interface AdminGameOwner {
  _id: string;
  fullName: string;
  email: string;
}

export interface AdminGame {
  _id: string;
  userId: string | AdminGameOwner;
  event: string;
  site: string;
  date: string;
  white: string;
  black: string;
  result: string;
  variant: GameVariant;
  rated: boolean;
  playAs: GamePlayAs;
  eco?: string;
  timeControl?: string;
  termination?: string;
  moves: string[];
  moveText?: string;
  pgn?: string;
  opponent?: string;
  opponentLevel?: number;
  whiteElo?: number;
  blackElo?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminGamesResponse {
  games: AdminGame[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  total?: number;
}

export interface AdminGameStats {
  total: number;
  rated: number;
  unrated: number;
  byVariant: {
    standard: number;
    chess960: number;
  };
  byResult: {
    "1-0": number;
    "0-1": number;
    "1/2-1/2": number;
    other: number;
  };
  recent24h: number;
}

export interface AdminUserOption {
  _id: string;
  fullName: string;
  email: string;
}

export interface GameFormData {
  userId: string;
  event: string;
  site: string;
  date: string;
  white: string;
  black: string;
  result: string;
  variant: GameVariant;
  playAs: GamePlayAs;
  rated: boolean;
  timeControl: string;
  whiteElo: number | "";
  blackElo: number | "";
  opponent: string;
  opponentLevel: number | "";
  termination: string;
  movesText: string;
  moveText: string;
  pgn: string;
}

export const GAME_RESULT_OPTIONS = [
  { value: "1-0", label: "White Won (1-0)" },
  { value: "0-1", label: "Black Won (0-1)" },
  { value: "1/2-1/2", label: "Draw (1/2-1/2)" },
  { value: "*", label: "Unfinished (*)" },
];

export const DEFAULT_GAME_FORM: GameFormData = {
  userId: "",
  event: "NeonGambit Game",
  site: "NeonGambit",
  date: "",
  white: "",
  black: "",
  result: "1/2-1/2",
  variant: "standard",
  playAs: "white",
  rated: false,
  timeControl: "",
  whiteElo: "",
  blackElo: "",
  opponent: "",
  opponentLevel: "",
  termination: "",
  movesText: "",
  moveText: "",
  pgn: "",
};

export function resolveOwnerId(userRef: string | AdminGameOwner): string {
  return typeof userRef === "string" ? userRef : userRef?._id || "";
}

export function gameToForm(game: AdminGame): GameFormData {
  return {
    userId: resolveOwnerId(game.userId),
    event: game.event || "NeonGambit Game",
    site: game.site || "NeonGambit",
    date: game.date || "",
    white: game.white || "",
    black: game.black || "",
    result: game.result || "1/2-1/2",
    variant: game.variant || "standard",
    playAs: game.playAs || "white",
    rated: !!game.rated,
    timeControl: game.timeControl || "",
    whiteElo:
      typeof game.whiteElo === "number" ? Math.round(game.whiteElo) : "",
    blackElo:
      typeof game.blackElo === "number" ? Math.round(game.blackElo) : "",
    opponent: game.opponent || "",
    opponentLevel:
      typeof game.opponentLevel === "number" ? Math.round(game.opponentLevel) : "",
    termination: game.termination || "",
    movesText: Array.isArray(game.moves) ? game.moves.join(" ") : "",
    moveText: game.moveText || "",
    pgn: game.pgn || "",
  };
}
