import {
  applyThemeToDocument,
  readStoredThemeName,
  resolveThemeName,
  type ThemeName,
} from "../config/appThemes";

export function readStoredTheme(): ThemeName {
  return readStoredThemeName();
}

export function applyThemeClass(themeName: string): ThemeName {
  return applyThemeToDocument(resolveThemeName(themeName));
}
