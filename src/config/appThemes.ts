export type ThemeName =
  | "dark-neon"
  | "midnight-blue"
  | "forest-green"
  | "light-classic"
  | "violet_storm"
  | "aurora"
  | "solar_gold"
  | "arctic_ice"
  | "ember"
  | "sakura"
  | "toxic_lime"
  | "obsidian_rose";

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

export const DEFAULT_THEME_NAME: ThemeName = "dark-neon";
export const LIGHT_THEME_NAME: ThemeName = "light-classic";
export const TOGGLE_DARK_THEME_NAME: ThemeName = "dark-neon";

export const APP_THEMES: AppTheme[] = [
  {
    name: "dark-neon",
    label: "Default",
    description: "Signature NeonGambit dark theme with crisp cyan accents",
    bgPrimary: "#0a0f1f",
    bgSecondary: "#141c32",
    accent: "#22d3ee",
    mode: "dark",
    backgroundImage: "/images/theme/BlueSky.png",
  },
  {
    name: "midnight-blue",
    label: "Midnight Blue",
    description: "Deep navy surfaces with cool blue highlights",
    bgPrimary: "#0b1324",
    bgSecondary: "#16213c",
    accent: "#60a5fa",
    mode: "dark",
    backgroundImage: "/images/theme/BlueSky.png",
  },
  {
    name: "forest-green",
    label: "Forest Green",
    description: "Dark botanical tones with fresh green contrast",
    bgPrimary: "#07150f",
    bgSecondary: "#10271d",
    accent: "#34d399",
    mode: "dark",
    backgroundImage: "/images/theme/NatureDarker.png",
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
  {
    name: "violet_storm",
    label: "Violet Storm",
    tag: "Electric",
    description: "Deep space with electric violet strikes",
    bgPrimary: "#0a0812",
    bgSecondary: "#110f1f",
    border: "#7c3aed",
    accent: "#a855f7",
    swatches: ["#0a0812", "#1e1035", "#a855f7"],
    glow: "rgba(168,85,247,0.35)",
    gradient: "linear-gradient(135deg, #0a0812 0%, #1e1035 60%, #2d1a5e 100%)",
    mode: "dark",
    backgroundImage: "/images/theme/BlueSky.png",
  },
  {
    name: "aurora",
    label: "Aurora Borealis",
    tag: "Ethereal",
    description: "Northern lights dance across dark skies",
    bgPrimary: "#050e12",
    bgSecondary: "#0a1a20",
    border: "#06b6d4",
    accent: "#34d399",
    swatches: ["#050e12", "#06b6d4", "#34d399"],
    extraSwatch: "#a78bfa",
    glow: "rgba(6,182,212,0.3)",
    gradient: "linear-gradient(135deg, #050e12 0%, #0a1a20 40%, #0d2a1f 100%)",
    mode: "dark",
    backgroundImage: "/images/theme/NatureDarker.png",
  },
  {
    name: "solar_gold",
    label: "Solar Gold",
    tag: "Luxury",
    description: "Premium dark with molten gold accents",
    bgPrimary: "#0c0a05",
    bgSecondary: "#1a1508",
    border: "#d97706",
    accent: "#fbbf24",
    swatches: ["#0c0a05", "#d97706", "#fbbf24"],
    glow: "rgba(251,191,36,0.3)",
    gradient: "linear-gradient(135deg, #0c0a05 0%, #1a1508 60%, #2a2000 100%)",
    mode: "dark",
    backgroundImage: "/images/theme/Ocean.png",
  },
  {
    name: "arctic_ice",
    label: "Arctic Ice",
    tag: "Frostcore",
    description: "Razor sharp whites on absolute zero dark",
    bgPrimary: "#020509",
    bgSecondary: "#070e17",
    border: "#38bdf8",
    accent: "#e0f2fe",
    swatches: ["#020509", "#38bdf8", "#e0f2fe"],
    glow: "rgba(56,189,248,0.25)",
    gradient: "linear-gradient(135deg, #020509 0%, #071220 60%, #061525 100%)",
    mode: "dark",
    backgroundImage: "/images/theme/BlueSky.png",
  },
  {
    name: "ember",
    label: "Ember & Ash",
    tag: "Intense",
    description: "Volcanic dark with smoldering orange fire",
    bgPrimary: "#0d0503",
    bgSecondary: "#1a0c06",
    border: "#ea580c",
    accent: "#fb923c",
    swatches: ["#0d0503", "#ea580c", "#fb923c"],
    glow: "rgba(251,146,60,0.35)",
    gradient: "linear-gradient(135deg, #0d0503 0%, #1a0c06 60%, #2d1004 100%)",
    mode: "dark",
    backgroundImage: "/images/theme/Ocean.png",
  },
  {
    name: "sakura",
    label: "Sakura Night",
    tag: "Soft & Bold",
    description: "Cherry blossoms glowing in the dark",
    bgPrimary: "#0d070c",
    bgSecondary: "#1a0e17",
    border: "#ec4899",
    accent: "#f9a8d4",
    swatches: ["#0d070c", "#ec4899", "#f9a8d4"],
    glow: "rgba(236,72,153,0.3)",
    gradient: "linear-gradient(135deg, #0d070c 0%, #1a0e17 60%, #2a0e24 100%)",
    mode: "dark",
    backgroundImage: "/images/theme/Ocean.png",
  },
  {
    name: "toxic_lime",
    label: "Toxic Lime",
    tag: "Hacker",
    description: "Terminal green on pitch black with raw power",
    bgPrimary: "#020602",
    bgSecondary: "#060e06",
    border: "#22c55e",
    accent: "#86efac",
    swatches: ["#020602", "#22c55e", "#86efac"],
    glow: "rgba(34,197,94,0.35)",
    gradient: "linear-gradient(135deg, #020602 0%, #060e06 60%, #0a1a0a 100%)",
    mode: "dark",
    backgroundImage: "/images/theme/NatureDarker.png",
  },
  {
    name: "obsidian_rose",
    label: "Obsidian Rose",
    tag: "Gothic",
    description: "Dark opulence with deep rose undertones",
    bgPrimary: "#08040a",
    bgSecondary: "#120818",
    border: "#be123c",
    accent: "#fb7185",
    swatches: ["#08040a", "#be123c", "#fb7185"],
    glow: "rgba(251,113,133,0.3)",
    gradient: "linear-gradient(135deg, #08040a 0%, #120818 60%, #1a0520 100%)",
    mode: "dark",
    backgroundImage: "/images/theme/BlueSky.png",
  },
];

const LEGACY_THEME_ALIASES: Record<string, ThemeName> = {
  crimson: "obsidian_rose",
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

  if (document.body) {
    document.body.classList.toggle("dark", themeDefinition.mode === "dark");
  }

  return resolvedTheme;
}
