import type { SettingsValues } from "../../store/settingsStore";

export interface PasswordFields {
  current: string;
  newPw: string;
  confirm: string;
}

export type UpdateSetting = <K extends keyof SettingsValues>(
  key: K,
  value: SettingsValues[K],
) => void;
