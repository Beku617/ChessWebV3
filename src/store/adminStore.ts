import { create } from "zustand";
import { persist } from "zustand/middleware";
import { API_URL } from "../config/network";

const AUTH_REQUEST_TIMEOUT_MS = 8000;

interface Admin {
  id: string;
  email: string;
  username: string;
  avatar?: string;
  puzzleElo?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface AdminState {
  admin: Admin | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  setAdmin: (admin: Admin | null) => void;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

function createTimeoutSignal(timeoutMs: number) {
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
    return AbortSignal.timeout(timeoutMs);
  }

  const controller = new AbortController();
  window.setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

export const useAdminStore = create<AdminState>()(
  persist(
    (set) => ({
      admin: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,
      setAdmin: (admin) =>
        set({
          admin,
          isAuthenticated: !!admin,
          isLoading: false,
          error: null,
        }),

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const res = await fetch(`${API_URL}/api/admin/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ email, password }),
          });

          const data = await res.json();

          if (!res.ok) {
            set({ error: data.error || "Login failed", isLoading: false });
            return false;
          }

          set({
            admin: data.admin,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
          return true;
        } catch (err) {
          set({ error: "Network error", isLoading: false });
          return false;
        }
      },

      logout: async () => {
        try {
          await fetch(`${API_URL}/api/admin/logout`, {
            method: "POST",
            credentials: "include",
          });
        } catch {
          // Ignore errors
        }
        set({ admin: null, isAuthenticated: false, error: null });
      },

      checkAuth: async () => {
        set({ isLoading: true });
        try {
          const res = await fetch(`${API_URL}/api/admin/me`, {
            credentials: "include",
            signal: createTimeoutSignal(AUTH_REQUEST_TIMEOUT_MS),
          });

          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            set({
              admin: null,
              isAuthenticated: false,
              isLoading: false,
              error:
                res.status === 503
                  ? String(data?.error || "Backend database is unavailable")
                  : null,
            });
            return;
          }

          const data = await res.json();
          set({
            admin: data.admin,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (err) {
          set({
            admin: null,
            isAuthenticated: false,
            isLoading: false,
            error:
              err instanceof DOMException && err.name === "AbortError"
                ? "Admin auth request timed out"
                : "Network error",
          });
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: "admin-storage",
      partialize: (state) => ({
        admin: state.admin,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
