export const BOARD_THEME_STORAGE_KEY = "board_theme";

export const BOARD_THEMES = {
  classic: {
    label: "Classic",
    light: "#EEEED2",
    dark: "#769656",
  },
  "modern-gray": {
    label: "Modern Gray",
    light: "#E5E7EB",
    dark: "#6B7280",
  },
  "blue-ocean": {
    label: "Blue Ocean",
    light: "#DCEEFF",
    dark: "#3B82F6",
  },
  "warm-wood": {
    label: "Warm Wood",
    light: "#F0D9B5",
    dark: "#B58863",
  },
  "purple-night": {
    label: "Purple Night",
    light: "#EDE9FE",
    dark: "#7C3AED",
  },
  "neon-green": {
    label: "Neon Green",
    light: "#020617",
    dark: "#00FF88",
  },
  "neon-cyber": {
    label: "Neon Cyber",
    light: "#020617",
    dark: "#00E5FF",
  },
  "neon-purple": {
    label: "Neon Purple",
    light: "#020617",
    dark: "#A855F7",
  },
  "soft-dark": {
    label: "Soft Dark",
    light: "#1E293B",
    dark: "#0F172A",
  },
  "high-contrast-minimal": {
    label: "High Contrast Minimal",
    light: "#FFFFFF",
    dark: "#111827",
  },
} as const;

export type BoardThemeId = keyof typeof BOARD_THEMES;

const DEFAULT_BOARD_THEME_ID: BoardThemeId = "classic";

const LEGACY_THEME_MAP: Record<string, BoardThemeId> = {
  green: "classic",
  brown: "warm-wood",
  blue: "blue-ocean",
  purple: "purple-night",
  gray: "modern-gray",
  neon: "neon-cyber",
};

export function resolveBoardThemeId(themeId?: string | null): BoardThemeId {
  const normalized = themeId?.trim().toLowerCase();
  if (!normalized) return DEFAULT_BOARD_THEME_ID;

  if (normalized in BOARD_THEMES) {
    return normalized as BoardThemeId;
  }

  if (normalized in LEGACY_THEME_MAP) {
    return LEGACY_THEME_MAP[normalized];
  }

  return DEFAULT_BOARD_THEME_ID;
}

export function readBoardThemeFromStorage(): BoardThemeId {
  if (typeof window === "undefined") return DEFAULT_BOARD_THEME_ID;

  try {
    const stored = window.localStorage.getItem(BOARD_THEME_STORAGE_KEY);
    return resolveBoardThemeId(stored);
  } catch {
    return DEFAULT_BOARD_THEME_ID;
  }
}

export function writeBoardThemeToStorage(themeId: string) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      BOARD_THEME_STORAGE_KEY,
      resolveBoardThemeId(themeId),
    );
  } catch {
    // Ignore storage failures in private mode or restricted environments.
  }
}

export function getBoardTheme(themeId?: string | null) {
  return BOARD_THEMES[resolveBoardThemeId(themeId)];
}

export const BOARD_THEME_OPTIONS = (
  Object.entries(BOARD_THEMES) as [BoardThemeId, (typeof BOARD_THEMES)[BoardThemeId]][]
).map(([value, theme]) => ({
  value,
  label: theme.label,
  light: theme.light,
  dark: theme.dark,
}));

