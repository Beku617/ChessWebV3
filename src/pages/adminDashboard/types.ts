export const API_URL = import.meta.env.VITE_API_URL;
export const LIMIT = 10;

export interface User {
  _id: string;
  fullName: string;
  email: string;
  rating: number;
  gamesPlayed: number;
  gamesWon: number;
  createdAt: string;
}

export interface Stats {
  totalUsers: number;
  totalGames: number;
  newUsersThisWeek: number;
  gamesThisWeek: number;
}
