import { useCallback, useMemo } from "react";
import {
  APP_THEMES,
  getThemeDefinition,
  resolveThemeName,
} from "../config/appThemes";
import { useThemeStore } from "../store/themeStore";

export function useTheme() {
  const themeName = useThemeStore((state) => state.themeName);
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const setThemeInStore = useThemeStore((state) => state.setTheme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  const setTheme = useCallback(
    (name: string) => {
      setThemeInStore(resolveThemeName(name));
    },
    [setThemeInStore],
  );

  return useMemo(
    () => ({
      themeName,
      setTheme,
      toggleTheme,
      isDarkMode,
      activeTheme: getThemeDefinition(themeName),
      themes: APP_THEMES,
    }),
    [themeName, setTheme, toggleTheme, isDarkMode],
  );
}
