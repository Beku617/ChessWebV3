import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";
import { ThemeOptionsGrid } from "./ThemeOptionsGrid";

interface ThemeWindowProps {
  open: boolean;
  onClose: () => void;
  closeOnSelect?: boolean;
}

export function ThemeWindow({
  open,
  onClose,
  closeOnSelect = false,
}: ThemeWindowProps) {
  const { t } = useTranslation();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("settings.appearance.theme", "Theme")}
      maxWidth="max-w-2xl"
    >
      <p className="mb-4 text-sm text-theme-muted">
        {t("settings.appearance.themeHelper", "Choose your preferred color scheme")}
      </p>
      <ThemeOptionsGrid onThemeSelect={closeOnSelect ? onClose : undefined} />
    </Modal>
  );
}
