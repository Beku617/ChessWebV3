import { create } from "zustand";

export interface TimeOption {
  label: string;
  initial: number; // seconds
  increment: number; // seconds
}

export interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: string; // icon name like "Gamepad2", "Bot", etc.
  accent: string; // tailwind gradient classes
  route: string; // navigation route
  action: string; // special action like "startMatch"
  disabled: boolean;
}

export interface GamePageConfig {
  timeOptions: TimeOption[];
  quickActions: QuickAction[];
}

interface GameConfigState {
  config: GamePageConfig | null;
  isLoading: boolean;
  error: string | null;
  fetchConfig: () => Promise<void>;
}

const API_URL = import.meta.env.VITE_API_URL;

export const useGameConfigStore = create<GameConfigState>((set) => ({
  config: null,
  isLoading: false,
  error: null,

  fetchConfig: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${API_URL}/api/game-config`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to fetch game config");
      }
      const data = await res.json();
      set({ config: data.config, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        isLoading: false,
      });
    }
  },
}));
