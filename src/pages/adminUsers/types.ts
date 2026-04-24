export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export interface User {
  _id: string;
  fullName: string;
  email: string;
  rating: number;
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  gamesDraw: number;
  createdAt: string;
  banned?: boolean;
  bannedAt?: string;
  banReason?: string;
}

export interface UserStats {
  totalUsers: number;
  totalGames: number;
  newUsersThisWeek: number;
  bannedUsers: number;
  topRating: number;
}

export type SortField = "createdAt" | "rating" | "gamesPlayed";
export type SortOrder = "asc" | "desc";

export const LIMIT = 15;
