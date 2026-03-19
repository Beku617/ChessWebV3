import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  BOARD_THEME_STORAGE_KEY,
  readBoardThemeFromStorage,
  resolveBoardThemeId,
  writeBoardThemeToStorage,
} from "../config/boardThemes";

/* ─── Settings values shape ─── */
export interface SettingsValues {
  // Appearance
  theme: "dark" | "dim" | "amoled";
  accentColor: "teal" | "purple" | "blue";
  boardTheme: string;
  pieceStyle: string;
  reducedMotion: boolean;

  // Gameplay
  defaultTimeControl: string;
  autoQueen: boolean;
  moveInput: "click" | "drag" | "both";
  showLegalMoves: boolean;
  confirmMove: boolean;
  premoves: boolean;

  // Notifications
  emailNotifications: boolean;
  pushNotifications: boolean;
  challengeRequests: boolean;
  tournamentUpdates: boolean;
  soundEffects: boolean;
  soundVolume: number;

  // Privacy
  profileVisibility: "public" | "friends" | "private";
  showOnlineStatus: boolean;
  showLastSeen: boolean;

  // AI / Analysis
  enableAiExplanations: boolean;
  explanationLevel: "brief" | "normal" | "deep";
  postGameAnalysis: boolean;
  engineStrength: number;
}

const initialBoardTheme = readBoardThemeFromStorage();

export const defaultSettings: SettingsValues = {
  theme: "dark",
  accentColor: "teal",
  boardTheme: initialBoardTheme,
  pieceStyle: "neo",
  reducedMotion: false,

  defaultTimeControl: "rapid",
  autoQueen: true,
  moveInput: "both",
  showLegalMoves: true,
  confirmMove: false,
  premoves: true,

  emailNotifications: true,
  pushNotifications: true,
  challengeRequests: true,
  tournamentUpdates: true,
  soundEffects: true,
  soundVolume: 75,

  profileVisibility: "public",
  showOnlineStatus: true,
  showLastSeen: true,

  enableAiExplanations: true,
  explanationLevel: "normal",
  postGameAnalysis: true,
  engineStrength: 10,
};

interface SettingsState {
  settings: SettingsValues;
  savedSettings: SettingsValues;
  selectedTheme: string;
  update: <K extends keyof SettingsValues>(
    key: K,
    value: SettingsValues[K],
  ) => void;
  setTheme: (themeId: string) => void;
  save: () => void;
  reset: () => void;
  isDirty: () => boolean;

  // Legacy compat
  enableAiExplanations: boolean;
  setEnableAiExplanations: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      settings: { ...defaultSettings },
      savedSettings: { ...defaultSettings },
      selectedTheme: initialBoardTheme,

      update: (key, value) =>
        set((state) => {
          if (key === "boardTheme") {
            const nextTheme = resolveBoardThemeId(String(value));
            writeBoardThemeToStorage(nextTheme);
            return {
              settings: { ...state.settings, boardTheme: nextTheme },
              selectedTheme: nextTheme,
            };
          }

          return {
            settings: { ...state.settings, [key]: value },
            enableAiExplanations:
              key === "enableAiExplanations"
                ? (value as boolean)
                : state.enableAiExplanations,
          };
        }),

      setTheme: (themeId) =>
        set((state) => {
          const nextTheme = resolveBoardThemeId(themeId);
          writeBoardThemeToStorage(nextTheme);
          return {
            selectedTheme: nextTheme,
            settings: { ...state.settings, boardTheme: nextTheme },
          };
        }),

      save: () =>
        set((state) => {
          const nextTheme = resolveBoardThemeId(state.settings.boardTheme);
          writeBoardThemeToStorage(nextTheme);
          return {
            selectedTheme: nextTheme,
            savedSettings: { ...state.settings, boardTheme: nextTheme },
          };
        }),

      reset: () =>
        set((state) => {
          const nextTheme = resolveBoardThemeId(state.savedSettings.boardTheme);
          writeBoardThemeToStorage(nextTheme);
          return {
            selectedTheme: nextTheme,
            settings: { ...state.savedSettings, boardTheme: nextTheme },
            enableAiExplanations: state.savedSettings.enableAiExplanations,
          };
        }),

      isDirty: () => {
        const { settings, savedSettings } = get();
        return JSON.stringify(settings) !== JSON.stringify(savedSettings);
      },

      // Legacy compat
      enableAiExplanations: defaultSettings.enableAiExplanations,
      setEnableAiExplanations: (enabled) =>
        set((state) => ({
          enableAiExplanations: enabled,
          settings: { ...state.settings, enableAiExplanations: enabled },
        })),
    }),
    {
      name: "settings-storage",
      partialize: (state) => ({
        settings: state.settings,
        savedSettings: state.savedSettings,
        selectedTheme: state.selectedTheme,
        enableAiExplanations: state.enableAiExplanations,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<SettingsState>;
        const mergedSettings = {
          ...currentState.settings,
          ...(persisted.settings || {}),
        };
        const mergedSavedSettings = {
          ...currentState.savedSettings,
          ...(persisted.savedSettings || {}),
        };

        let storageThemeRaw: string | null = null;
        if (typeof window !== "undefined") {
          try {
            storageThemeRaw = window.localStorage.getItem(
              BOARD_THEME_STORAGE_KEY,
            );
          } catch {
            storageThemeRaw = null;
          }
        }
        const nextTheme = resolveBoardThemeId(
          storageThemeRaw ||
            mergedSettings.boardTheme ||
            mergedSavedSettings.boardTheme ||
            persisted.selectedTheme ||
            currentState.selectedTheme,
        );

        writeBoardThemeToStorage(nextTheme);

        return {
          ...currentState,
          ...persisted,
          settings: { ...mergedSettings, boardTheme: nextTheme },
          savedSettings: { ...mergedSavedSettings, boardTheme: nextTheme },
          selectedTheme: nextTheme,
          enableAiExplanations:
            persisted.enableAiExplanations ?? currentState.enableAiExplanations,
        };
      },
    },
  ),
);
