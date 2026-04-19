import { useMemo, useState } from "react";
import { Gamepad2, Key, Languages, Palette, RotateCcw, Save, Shield, User } from "lucide-react";
import Sidebar from "../components/Sidebar";
import { useSettingsStore } from "../store/settingsStore";
import { useAuthStore } from "../store/authStore";
import { ProfileAvatarUpload } from "../components/profilePage";
import { BOARD_THEME_OPTIONS } from "../config/boardThemes";
import {
  BoardThemePicker,
  Modal,
  SegmentedControl,
  Select,
  SettingRow,
  SettingsCard,
  Toast,
  Toggle,
  useToast,
} from "../components/settings";
import { useTranslation } from "react-i18next";
import { supportedLanguages } from "../i18n";

function getLinkedProviders(user: ReturnType<typeof useAuthStore.getState>["user"], t: (key: string, fallback: string) => string) {
  const providers: string[] = [];
  if (user?.hasGoogleAuth) {
    providers.push(t("settings.profile.google", "Google"));
  }
  if (user?.hasFacebookAuth) {
    providers.push(t("settings.profile.facebook", "Facebook"));
  }
  if (!providers.length && user?.authProvider === "google") {
    providers.push(t("settings.profile.google", "Google"));
  }
  if (!providers.length && user?.authProvider === "facebook") {
    providers.push(t("settings.profile.facebook", "Facebook"));
  }
  return providers;
}

export default function Settings() {
  const { settings, update, save, reset, isDirty, selectedTheme, setTheme } = useSettingsStore();
  const { user } = useAuthStore();
  const { t, i18n } = useTranslation();
  const dirty = useMemo(() => isDirty(), [isDirty, settings]);

  const [passwordModal, setPasswordModal] = useState(false);
  const [pwFields, setPwFields] = useState({
    current: "",
    newPw: "",
    confirm: "",
  });

  const { toast, show: showToast, hide: hideToast } = useToast();
  const linkedProviders = getLinkedProviders(
    user,
    (key: string, fallback: string) => t(key, fallback),
  );

  const handleSave = () => {
    save();
    showToast(t("settings.toasts.saved", "Settings saved successfully!"));
  };

  const handleReset = () => {
    reset();
    showToast(
      t("settings.toasts.reset", "Settings reset to last saved state"),
      "success",
    );
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-gray-900 transition-colors duration-300 dark:bg-gray-950 dark:text-white">
      <div className="flex min-h-screen">
        <Sidebar />

        <main className="ml-[60px] min-h-screen flex-1 md:ml-72">
          <div className="sticky top-0 z-30 border-b border-gray-200/50 bg-[#f5f5f7]/80 backdrop-blur-xl dark:border-gray-800/50 dark:bg-gray-950/80">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
              <h1 className="text-3xl font-bold tracking-tight">
                {t("settings.header.title", "Settings")}
              </h1>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleReset}
                  disabled={!dirty}
                  className="flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 transition-all hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t("settings.actions.reset", "Reset")}
                </button>
                <button
                  onClick={handleSave}
                  disabled={!dirty}
                  className={`flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-bold transition-all shadow-lg ${
                    dirty
                      ? "bg-brand-600 text-white shadow-brand-900/25 hover:bg-brand-500"
                      : "cursor-not-allowed bg-gray-300 text-gray-500 shadow-none dark:bg-gray-800"
                  }`}
                >
                  <Save className="h-4 w-4" />
                  {t("settings.actions.saveChanges", "Save Changes")}
                </button>
              </div>
            </div>
          </div>

          <div className="mx-auto max-w-4xl px-6 py-8">
            <div className="space-y-8">
              <SettingsCard
                icon={<User className="h-5 w-5 text-brand-500" />}
                title={t("settings.profile.title", "Profile & Account")}
                subtitle={t(
                  "settings.profile.subtitle",
                  "Your personal information and security",
                )}
                accent="bg-brand-500"
              >
                <div className="flex flex-col items-center gap-5 py-3 sm:flex-row sm:items-start">
                  <ProfileAvatarUpload
                    currentAvatar={user?.avatar}
                    userName={user?.fullName}
                    size="md"
                  />
                  <div className="w-full space-y-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {t("settings.profile.email", "Email")}
                      </label>
                      <input
                        type="email"
                        defaultValue={user?.email || ""}
                        disabled
                        className="w-full cursor-not-allowed rounded-xl border border-gray-200 bg-gray-100 px-4 py-3 text-base text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400"
                      />
                    </div>
                  </div>
                </div>

                <SettingRow
                  label={t("settings.profile.changePassword", "Change Password")}
                  helper={t(
                    "settings.profile.changePasswordHelper",
                    "Update your account password",
                  )}
                  last={linkedProviders.length === 0}
                >
                  <button
                    onClick={() => setPasswordModal(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-4 py-2 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <Key className="h-4 w-4" />
                    {t("settings.actions.change", "Change")}
                  </button>
                </SettingRow>

                {linkedProviders.length > 0 && (
                  <SettingRow
                    label={t("settings.profile.linkedAccounts", "Linked Accounts")}
                    helper=""
                    last
                  >
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {linkedProviders.map((provider) => (
                        <span
                          key={provider}
                          className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-bold text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                        >
                          {provider}
                        </span>
                      ))}
                    </div>
                  </SettingRow>
                )}
              </SettingsCard>

              <SettingsCard
                icon={<Languages className="h-5 w-5 text-indigo-500" />}
                title={t("settingsLang.title", "Language")}
                subtitle={t("settingsLang.helper", "Choose your preferred language")}
                accent="bg-indigo-500"
              >
                <SettingRow
                  label={t("settingsLang.title", "Language")}
                  helper={t("settingsLang.helper", "Choose your preferred language")}
                  last
                >
                  <SegmentedControl
                    options={supportedLanguages.map((language) => ({
                      label: language.name,
                      value: language.code,
                    }))}
                    value={
                      i18n.resolvedLanguage || i18n.language || supportedLanguages[0].code
                    }
                    onChange={(value) => i18n.changeLanguage(value)}
                  />
                </SettingRow>
              </SettingsCard>

              <SettingsCard
                icon={<Palette className="h-5 w-5 text-purple-500" />}
                title={t("settings.appearance.title", "Appearance")}
                subtitle={t(
                  "settings.appearance.subtitle",
                  "Customize how NeonGambit looks",
                )}
                accent="bg-purple-500"
              >
                <SettingRow
                  label={t("settings.appearance.theme", "Theme")}
                  helper={t(
                    "settings.appearance.themeHelper",
                    "Choose your preferred color scheme",
                  )}
                >
                  <SegmentedControl
                    options={[
                      { label: t("settings.appearance.themes.dark", "Dark"), value: "dark" },
                      { label: t("settings.appearance.themes.dim", "Dim"), value: "dim" },
                      { label: t("settings.appearance.themes.amoled", "AMOLED"), value: "amoled" },
                    ]}
                    value={settings.theme}
                    onChange={(value) => update("theme", value as "dark" | "dim" | "amoled")}
                  />
                </SettingRow>

                <SettingRow
                  label={t("settings.appearance.boardTheme", "Board Theme")}
                  helper={t(
                    "settings.appearance.boardThemeHelper",
                    "Choose board color scheme",
                  )}
                  last
                >
                  <BoardThemePicker
                    options={BOARD_THEME_OPTIONS}
                    value={selectedTheme}
                    onChange={setTheme}
                  />
                </SettingRow>
              </SettingsCard>

              <SettingsCard
                icon={<Gamepad2 className="h-5 w-5 text-brand-500" />}
                title={t("settings.gameplay.title", "Gameplay")}
                subtitle={t("settings.gameplay.subtitle", "Tweak your playing experience")}
                accent="bg-brand-500"
              >
                <SettingRow
                  label={t("settings.gameplay.defaultTime", "Default Time Control")}
                  helper={t(
                    "settings.gameplay.defaultTimeHelper",
                    "Starting time format for new games",
                  )}
                >
                  <Select
                    value={settings.defaultTimeControl}
                    onChange={(value) => update("defaultTimeControl", value)}
                    options={[
                      { label: t("settings.gameplay.timeControls.bullet", "Bullet"), value: "bullet" },
                      { label: t("settings.gameplay.timeControls.blitz", "Blitz"), value: "blitz" },
                      { label: t("settings.gameplay.timeControls.rapid", "Rapid"), value: "rapid" },
                      { label: t("settings.gameplay.timeControls.classical", "Classical"), value: "classical" },
                      { label: t("settings.gameplay.timeControls.custom", "Custom"), value: "custom" },
                    ]}
                  />
                </SettingRow>

                <SettingRow
                  label={t("settings.gameplay.autoQueen", "Auto-Queen")}
                  helper={t(
                    "settings.gameplay.autoQueenHelper",
                    "Automatically promote pawns to queen",
                  )}
                >
                  <Toggle
                    enabled={settings.autoQueen}
                    onChange={(value) => update("autoQueen", value)}
                    ariaLabel="Auto-queen"
                  />
                </SettingRow>

                <SettingRow
                  label={t("settings.gameplay.moveInput", "Move Input")}
                  helper={t("settings.gameplay.moveInputHelper", "How you make moves on the board")}
                >
                  <SegmentedControl
                    options={[
                      { label: t("settings.gameplay.input.click", "Click"), value: "click" },
                      { label: t("settings.gameplay.input.drag", "Drag"), value: "drag" },
                      { label: t("settings.gameplay.input.both", "Both"), value: "both" },
                    ]}
                    value={settings.moveInput}
                    onChange={(value) => update("moveInput", value as "click" | "drag" | "both")}
                  />
                </SettingRow>

                <SettingRow
                  label={t("settings.gameplay.legalMoves", "Show Legal Moves")}
                  helper={t("settings.gameplay.legalMovesHelper", "Highlight available squares")}
                >
                  <Toggle
                    enabled={settings.showLegalMoves}
                    onChange={(value) => update("showLegalMoves", value)}
                    ariaLabel="Show legal moves"
                  />
                </SettingRow>

                <SettingRow
                  label={t("settings.gameplay.premoves", "Premoves")}
                  helper={t("settings.gameplay.premovesHelper", "Queue your next move while waiting")}
                  last
                >
                  <Toggle
                    enabled={settings.premoves}
                    onChange={(value) => update("premoves", value)}
                    ariaLabel="Premoves"
                  />
                </SettingRow>
              </SettingsCard>

              <SettingsCard
                icon={<Shield className="h-5 w-5 text-blue-500" />}
                title={t("settings.privacy.title", "Privacy & Safety")}
                accent="bg-blue-500"
              >
                <SettingRow
                  label={t("settings.privacy.blockedUsers", "Blocked Users")}
                  helper={t("settings.privacy.blockedUsersHelper", "Manage your block list")}
                  last
                >
                  <button className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
                    {t("settings.actions.manage", "Manage")}
                  </button>
                </SettingRow>
              </SettingsCard>
            </div>
          </div>
        </main>
      </div>

      <Modal
        open={passwordModal}
        onClose={() => {
          setPasswordModal(false);
          setPwFields({ current: "", newPw: "", confirm: "" });
        }}
        title={t("settings.modals.changePassword.title", "Change Password")}
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {t("settings.modals.changePassword.current", "Current Password")}
            </label>
            <input
              type="password"
              value={pwFields.current}
              onChange={(event) => setPwFields((prev) => ({ ...prev, current: event.target.value }))}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition-all focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 dark:border-gray-700 dark:bg-gray-800"
              placeholder={t("settings.modals.changePassword.currentPlaceholder", "Enter current password")}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {t("settings.modals.changePassword.new", "New Password")}
            </label>
            <input
              type="password"
              value={pwFields.newPw}
              onChange={(event) => setPwFields((prev) => ({ ...prev, newPw: event.target.value }))}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition-all focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 dark:border-gray-700 dark:bg-gray-800"
              placeholder={t("settings.modals.changePassword.newPlaceholder", "Enter new password")}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {t("settings.modals.changePassword.confirm", "Confirm Password")}
            </label>
            <input
              type="password"
              value={pwFields.confirm}
              onChange={(event) => setPwFields((prev) => ({ ...prev, confirm: event.target.value }))}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition-all focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 dark:border-gray-700 dark:bg-gray-800"
              placeholder={t("settings.modals.changePassword.confirmPlaceholder", "Confirm new password")}
            />
          </div>
          <button
            disabled={!pwFields.current || !pwFields.newPw || pwFields.newPw !== pwFields.confirm}
            onClick={() => {
              showToast(t("settings.toasts.passwordChanged", "Password changed successfully!"));
              setPasswordModal(false);
              setPwFields({ current: "", newPw: "", confirm: "" });
            }}
            className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-bold text-white transition-all hover:bg-brand-500 disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-gray-800"
          >
            {t("settings.modals.changePassword.cta", "Update Password")}
          </button>
        </div>
      </Modal>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onClose={hideToast}
      />
    </div>
  );
}
