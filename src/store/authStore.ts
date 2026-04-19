import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface User {
  id: string;
  email: string;
  fullName: string;
  avatar?: string;
  authProvider?: "local" | "google" | "facebook";
  hasGoogleAuth?: boolean;
  hasFacebookAuth?: boolean;
  rating?: number;
  bulletRating?: number;
  blitzRating?: number;
  rapidRating?: number;
  classicalRating?: number;
  chess960BulletRating?: number;
  chess960BlitzRating?: number;
  chess960RapidRating?: number;
  chess960ClassicalRating?: number;
  bulletRd?: number;
  blitzRd?: number;
  rapidRd?: number;
  classicalRd?: number;
  chess960BulletRd?: number;
  chess960BlitzRd?: number;
  chess960RapidRd?: number;
  chess960ClassicalRd?: number;
  bulletVolatility?: number;
  blitzVolatility?: number;
  rapidVolatility?: number;
  classicalVolatility?: number;
  chess960BulletVolatility?: number;
  chess960BlitzVolatility?: number;
  chess960RapidVolatility?: number;
  chess960ClassicalVolatility?: number;
  bulletGames?: number;
  blitzGames?: number;
  rapidGames?: number;
  classicalGames?: number;
  chess960BulletGames?: number;
  chess960BlitzGames?: number;
  chess960RapidGames?: number;
  chess960ClassicalGames?: number;
  gamesPlayed?: number;
  gamesWon?: number;
  presenceStatus?: "online" | "offline" | "searching_match" | "in_game" | "away";
  lastSeenAt?: string | null;
  lastActiveAt?: string | null;
  puzzleElo?: number;
  puzzleBestElo?: number;
  puzzleAttempts?: number;
  puzzleSolved?: number;
  puzzleFailed?: number;
  puzzleSkipped?: number;
  puzzleLastAttemptAt?: string | null;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  banReason: string | null;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setBanned: (reason: string) => void;
  logout: () => void;
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,
      banReason: null,
      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
          isLoading: false,
          banReason: null,
        }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error, isLoading: false }),
      setBanned: (banReason) =>
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          banReason,
        }),
      logout: () =>
        set({ user: null, isAuthenticated: false, banReason: null }),
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);

// API Functions
export const authApi = {
  async login(email: string, password: string, rememberMe = false) {
    const res = await fetch(`${API_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password, rememberMe }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");
    return data;
  },

  async googleLogin(token: string, rememberMe = false) {
    const res = await fetch(`${API_URL}/api/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token, rememberMe }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Google login failed");
    return data;
  },

  async facebookLogin(token: string, rememberMe = false) {
    const res = await fetch(`${API_URL}/api/auth/facebook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token, rememberMe }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Facebook login failed");
    return data;
  },

  async register(fullName: string, email: string, password: string) {
    const res = await fetch(`${API_URL}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ fullName, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Registration failed");
    return data;
  },

  async logout() {
    const res = await fetch(`${API_URL}/api/logout`, {
      method: "POST",
      credentials: "include",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Logout failed");
    return data;
  },

  async getMe() {
    const res = await fetch(`${API_URL}/api/me`, {
      credentials: "include",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.banned) {
        throw {
          banned: true,
          banReason: data.banReason || "No reason provided",
        };
      }
      return null;
    }
    const data = await res.json();
    return data.user;
  },

  async updateProfile(data: { fullName?: string; avatar?: string }) {
    const res = await fetch(`${API_URL}/api/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Failed to update profile");
    return result.user;
  },
};
