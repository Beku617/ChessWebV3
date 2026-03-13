type PersistedThemeState = {
  state?: {
    isDarkMode?: boolean;
  };
};

const THEME_STORAGE_KEY = "theme-storage";

export function readStoredTheme(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return true;
    const parsed = JSON.parse(raw) as PersistedThemeState;
    return parsed?.state?.isDarkMode ?? true;
  } catch {
    return true;
  }
}

export function applyThemeClass(isDarkMode: boolean) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", isDarkMode);
  root.dataset.theme = isDarkMode ? "dark" : "light";
  root.style.colorScheme = isDarkMode ? "dark" : "light";
  if (document.body) {
    document.body.classList.toggle("dark", isDarkMode);
  }
}
