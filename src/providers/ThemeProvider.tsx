import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import { applyThemeToDocument } from "../config/appThemes";
import { useThemeStore } from "../store/themeStore";

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const themeName = useThemeStore((state) => state.themeName);
  const syncFromStorage = useThemeStore((state) => state.syncFromStorage);
  const didHydrateRef = useRef(false);

  useEffect(() => {
    if (didHydrateRef.current) return;
    didHydrateRef.current = true;
    syncFromStorage();
  }, [syncFromStorage]);

  useLayoutEffect(() => {
    applyThemeToDocument(themeName);
  }, [themeName]);

  return <>{children}</>;
}
