import { useSettingsStore } from "../store/settingsStore";
import {
  isClickMoveEnabled,
  isDragMoveEnabled,
} from "../utils/gameplaySettings";

export function useGameplayPreferences() {
  const {
    autoQueen,
    moveInput,
    showLegalMoves,
    premoves,
    defaultTimeControl,
  } = useSettingsStore((state) => state.settings);

  return {
    autoQueen,
    moveInput,
    showLegalMoves,
    premoves,
    defaultTimeControl,
    allowClickInput: isClickMoveEnabled(moveInput),
    allowDragInput: isDragMoveEnabled(moveInput),
  };
}
