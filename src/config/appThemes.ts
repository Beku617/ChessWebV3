export type ThemeName =
  | "default"
  | "light-classic";

export interface AppTheme {
  name: ThemeName;
  label: string;
  bgPrimary: string;
  bgSecondary: string;
  accent: string;
  mode: "dark" | "light";
  backgroundImage?: string;
  border?: string;
  description?: string;
  extraSwatch?: string;
  glow?: string;
  gradient?: string;
  swatches?: string[];
  tag?: string;
}

export const THEME_STORAGE_KEY = "neonGambit_theme";
const LEGACY_THEME_STORAGE_KEY = "theme-storage";

export const DEFAULT_THEME_NAME: ThemeName = "default";
export const LIGHT_THEME_NAME: ThemeName = "light-classic";
export const TOGGLE_DARK_THEME_NAME: ThemeName = "default";

export const APP_THEMES: AppTheme[] = [
  {
    name: "default",
    label: "Default",
    description: "Signature NeonGambit dark theme with crisp cyan accents",
    bgPrimary: "#0a0f1f",
    bgSecondary: "#141c32",
    accent: "#22d3ee",
    mode: "dark",
    backgroundImage: "/images/theme/BlueSky.png",
  },
  {
    name: "light-classic",
    label: "Light Classic",
    description: "Clean light layout with classic tournament clarity",
    bgPrimary: "#f5f5f7",
    bgSecondary: "#ffffff",
    accent: "#2563eb",
    mode: "light",
    backgroundImage: "/images/theme/Nature.png",
  },
];

const LEGACY_THEME_ALIASES: Record<string, ThemeName> = {
  "dark-neon": "default",
  "midnight-blue": "default",
  "violet-storm": "default",
  violet_storm: "default",
  "forest-green": "default",
  aurora: "default",
  solar_gold: "default",
  arctic_ice: "default",
  ember: "default",
  sakura: "default",
  toxic_lime: "default",
  obsidian_rose: "default",
};

const THEME_NAME_SET = new Set<ThemeName>(APP_THEMES.map((theme) => theme.name));
const THEME_BY_NAME = new Map<ThemeName, AppTheme>(
  APP_THEMES.map((theme) => [theme.name, theme]),
);

type LegacyThemeState = {
  state?: {
    isDarkMode?: boolean;
  };
};

function isThemeName(value: string): value is ThemeName {
  return THEME_NAME_SET.has(value as ThemeName);
}

export function resolveThemeName(name?: string | null): ThemeName {
  if (!name) return DEFAULT_THEME_NAME;
  if (isThemeName(name)) return name;
  return LEGACY_THEME_ALIASES[name] ?? DEFAULT_THEME_NAME;
}

export function getThemeDefinition(name: string): AppTheme {
  const resolvedName = resolveThemeName(name);
  return THEME_BY_NAME.get(resolvedName) ?? THEME_BY_NAME.get(DEFAULT_THEME_NAME)!;
}

export function isDarkTheme(name: string): boolean {
  return getThemeDefinition(name).mode === "dark";
}

function readLegacyDarkModeFlag(): boolean | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as LegacyThemeState;
    if (typeof parsed?.state?.isDarkMode !== "boolean") return null;
    return parsed.state.isDarkMode;
  } catch {
    return null;
  }
}

export function readStoredThemeName(): ThemeName {
  if (typeof window === "undefined") return DEFAULT_THEME_NAME;

  try {
    const directTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (directTheme && isThemeName(directTheme)) {
      return directTheme;
    }

    if (directTheme && LEGACY_THEME_ALIASES[directTheme]) {
      const migratedTheme = LEGACY_THEME_ALIASES[directTheme];
      window.localStorage.setItem(THEME_STORAGE_KEY, migratedTheme);
      return migratedTheme;
    }

    const legacyDarkMode = readLegacyDarkModeFlag();
    if (legacyDarkMode === null) {
      return DEFAULT_THEME_NAME;
    }

    const migratedTheme = legacyDarkMode
      ? DEFAULT_THEME_NAME
      : LIGHT_THEME_NAME;

    window.localStorage.setItem(THEME_STORAGE_KEY, migratedTheme);
    return migratedTheme;
  } catch {
    return DEFAULT_THEME_NAME;
  }
}

export function writeStoredThemeName(themeName: string): ThemeName {
  const resolvedTheme = resolveThemeName(themeName);

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, resolvedTheme);
    } catch {
      // Swallow storage write failures and still return the resolved theme.
    }
  }

  return resolvedTheme;
}

export function applyThemeToDocument(themeName: string): ThemeName {
  const resolvedTheme = resolveThemeName(themeName);
  const themeDefinition = getThemeDefinition(resolvedTheme);

  if (typeof document === "undefined") {
    return resolvedTheme;
  }

  const root = document.documentElement;
  root.dataset.theme = themeDefinition.name;
  root.classList.toggle("dark", themeDefinition.mode === "dark");
  root.style.colorScheme = themeDefinition.mode;
  if (themeDefinition.backgroundImage) {
    root.style.setProperty(
      "--theme-background-image",
      `url("${themeDefinition.backgroundImage}")`,
    );
  } else {
    root.style.removeProperty("--theme-background-image");
  }

  return resolvedTheme;
}
