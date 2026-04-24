import { create } from "zustand";
import {
  LIGHT_THEME_NAME,
  TOGGLE_DARK_THEME_NAME,
  applyThemeToDocument,
  isDarkTheme,
  readStoredThemeName,
  resolveThemeName,
  writeStoredThemeName,
  type ThemeName,
} from "../config/appThemes";

interface ThemeState {
  themeName: ThemeName;
  isDarkMode: boolean;
  setTheme: (themeName: string) => void;
  toggleTheme: () => void;
  syncFromStorage: () => void;
}

const initialThemeName = readStoredThemeName();

function commitTheme(setter: (partial: Partial<ThemeState>) => void, themeName: string) {
  const resolvedTheme = resolveThemeName(themeName);
  writeStoredThemeName(resolvedTheme);
  applyThemeToDocument(resolvedTheme);

  setter({
    themeName: resolvedTheme,
    isDarkMode: isDarkTheme(resolvedTheme),
  });
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  themeName: initialThemeName,
  isDarkMode: isDarkTheme(initialThemeName),

  setTheme: (themeName) => {
    commitTheme((partial) => set(() => partial), themeName);
  },

  toggleTheme: () => {
    const nextTheme =
      get().themeName === LIGHT_THEME_NAME
        ? TOGGLE_DARK_THEME_NAME
        : LIGHT_THEME_NAME;
    commitTheme((partial) => set(() => partial), nextTheme);
  },

  syncFromStorage: () => {
    const storedTheme = readStoredThemeName();
    applyThemeToDocument(storedTheme);
    set(() => ({
      themeName: storedTheme,
      isDarkMode: isDarkTheme(storedTheme),
    }));
  },
}));
