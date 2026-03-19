import { useSettingsStore } from "../store/settingsStore";
import { getBoardTheme, resolveBoardThemeId } from "../config/boardThemes";

export function useBoardTheme() {
  const selectedTheme = useSettingsStore((state) =>
    resolveBoardThemeId(state.selectedTheme || state.settings.boardTheme),
  );
  const setTheme = useSettingsStore((state) => state.setTheme);
  const colors = getBoardTheme(selectedTheme);

  return { selectedTheme, setTheme, colors };
}

