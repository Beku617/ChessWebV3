import { useState, useMemo } from "react";
import {
  User,
  Bell,
  Save,
  Sparkles,
  CheckCircle,
  XCircle,
  Shield,
  Gamepad2,
  Palette,
  RotateCcw,
  Key,
  Download,
  FileText,
  AlertTriangle,
  Trash2,
  LogOut,
  Zap,
  Languages,
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import { useThemeStore } from "../store/themeStore";
import { useSettingsStore } from "../store/settingsStore";
import { useAuthStore } from "../store/authStore";
import { ProfileAvatarUpload } from "../components/profilePage";
import { isGroqConfigured } from "../utils/groqApi";
import { BOARD_THEME_OPTIONS } from "../config/boardThemes";
import {
  Toggle,
  SegmentedControl,
  SettingsCard,
  SettingRow,
  Select,
  Slider,
  ColorSwatchPicker,
  BoardThemePicker,
  Modal,
  Toast,
  useToast,
} from "../components/settings";
import { useTranslation } from "react-i18next";
import { supportedLanguages } from "../i18n";

/* ═══════════════════════════════════════════════════════
   SETTINGS PAGE — Premium Redesign
   ═══════════════════════════════════════════════════════ */

export default function Settings() {
  const { isDarkMode } = useThemeStore();
  const { settings, update, save, reset, isDirty, selectedTheme, setTheme } =
    useSettingsStore();
  const { user } = useAuthStore();
  const groqConfigured = isGroqConfigured();
  const { t, i18n } = useTranslation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dirty = useMemo(() => isDirty(), [settings]);

  // Modal states
  const [passwordModal, setPasswordModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [pwFields, setPwFields] = useState({
    current: "",
    newPw: "",
    confirm: "",
  });
  const deleteConfirmTarget =
    user?.fullName || t("settings.modals.delete.username", "username");

  // Toast
  const { toast, show: showToast, hide: hideToast } = useToast();

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

  const boardThemes = BOARD_THEME_OPTIONS;

  const accentOptions = [
    {
      value: "teal",
      bg: "bg-brand-500",
      label: t("settings.appearance.accent.teal", "Teal"),
    },
    {
      value: "purple",
      bg: "bg-purple-500",
      label: t("settings.appearance.accent.purple", "Purple"),
    },
    {
      value: "blue",
      bg: "bg-blue-500",
      label: t("settings.appearance.accent.blue", "Blue"),
    },
  ];

  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 text-gray-900 dark:text-white flex transition-colors duration-300">
      <Sidebar />

      <main className="flex-1 ml-72 min-h-screen">
        {/* ── Sticky Header ────────────────────────────── */}
        <div className="sticky top-0 z-30 backdrop-blur-xl bg-[#f5f5f7]/80 dark:bg-gray-950/80 border-b border-gray-200/50 dark:border-gray-800/50">
          <div className="max-w-7xl mx-auto px-8 py-5 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {t("settings.header.title", "Settings")}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {t(
                  "settings.header.subtitle",
                  "Manage your account & preferences",
                )}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleReset}
                disabled={!dirty}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {t("settings.actions.reset", "Reset")}
              </button>
              <button
                onClick={handleSave}
                disabled={!dirty}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all shadow-lg ${
                  dirty
                    ? "bg-brand-600 hover:bg-brand-500 text-white shadow-brand-900/25"
                    : "bg-gray-300 dark:bg-gray-800 text-gray-500 cursor-not-allowed shadow-none"
                }`}
              >
                <Save className="w-4 h-4" />
                {t("settings.actions.saveChanges", "Save Changes")}
              </button>
            </div>
          </div>
        </div>

        {/* ── Two-Column Layout ────────────────────────── */}
        <div className="max-w-7xl mx-auto px-8 py-8">
          <div className="flex flex-col lg:flex-row gap-6">
            {/* ======= LEFT (wide) ======= */}
            <div className="flex-1 min-w-0 space-y-6">
              {/* ─── Profile & Account ─── */}
              <SettingsCard
                icon={<User className="w-5 h-5 text-brand-500" />}
                title={t("settings.profile.title", "Profile & Account")}
                subtitle={t(
                  "settings.profile.subtitle",
                  "Your personal information and security",
                )}
                accent="bg-brand-500"
              >
                {/* Avatar + fields row */}
                <div className="flex items-start gap-6 py-2">
                  <ProfileAvatarUpload
                    currentAvatar={user?.avatar}
                    userName={user?.fullName}
                    size="md"
                  />
                  <div className="flex-1 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                          {t("settings.profile.username", "Username")}
                        </label>
                        <input
                          type="text"
                          defaultValue={user?.fullName || ""}
                          className="w-full bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                          {t("settings.profile.email", "Email")}
                        </label>
                        <input
                          type="email"
                          defaultValue={user?.email || ""}
                          disabled
                          className="w-full bg-gray-100 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-400 cursor-not-allowed"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <SettingRow
                  label={t("settings.profile.changePassword", "Change Password")}
                  helper={t(
                    "settings.profile.changePasswordHelper",
                    "Update your account password",
                  )}
                >
                  <button
                    onClick={() => setPasswordModal(true)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
                  >
                    <Key className="w-3.5 h-3.5" />
                    {t("settings.actions.change", "Change")}
                  </button>
                </SettingRow>

                <SettingRow
                  label={t("settings.profile.linkedAccounts", "Linked Accounts")}
                  helper={t(
                    "settings.profile.linkedAccountsHelper",
                    "Connect third-party services",
                  )}
                  last
                >
                  <div className="flex gap-2">
                    <button className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors">
                      {t("settings.profile.google", "Google")}
                    </button>
                    <button className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors">
                      {t("settings.profile.github", "GitHub")}
                    </button>
                  </div>
                </SettingRow>
              </SettingsCard>

              {/* ─── Language ─── */}
              <SettingsCard
                icon={<Languages className="w-5 h-5 text-indigo-500" />}
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
                    options={supportedLanguages.map((l) => ({ label: l.name, value: l.code }))}
                    value={i18n.resolvedLanguage || i18n.language || supportedLanguages[0].code}
                    onChange={(v) => i18n.changeLanguage(v)}
                  />
                </SettingRow>
              </SettingsCard>

              {/* ─── Appearance ─── */}
              <SettingsCard
                icon={<Palette className="w-5 h-5 text-purple-500" />}
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
                      {
                        label: t("settings.appearance.themes.amoled", "AMOLED"),
                        value: "amoled",
                      },
                    ]}
                    value={settings.theme}
                    onChange={(v) =>
                      update("theme", v as "dark" | "dim" | "amoled")
                    }
                  />
                </SettingRow>

                <SettingRow
                  label={t("settings.appearance.accentColor", "Accent Color")}
                  helper={t(
                    "settings.appearance.accentHelper",
                    "Primary highlight color",
                  )}
                >
                  <ColorSwatchPicker
                    options={accentOptions}
                    value={settings.accentColor}
                    onChange={(v) =>
                      update("accentColor", v as "teal" | "purple" | "blue")
                    }
                  />
                </SettingRow>

                <SettingRow
                  label={t("settings.appearance.boardTheme", "Board Theme")}
                  helper={t(
                    "settings.appearance.boardThemeHelper",
                    "Choose board color scheme",
                  )}
                >
                  <BoardThemePicker
                    options={boardThemes}
                    value={selectedTheme}
                    onChange={setTheme}
                  />
                </SettingRow>

                <SettingRow
                  label={t("settings.appearance.reducedMotion", "Reduced Motion")}
                  helper={t(
                    "settings.appearance.reducedMotionHelper",
                    "Minimize animations",
                  )}
                  last
                >
                  <Toggle
                    enabled={settings.reducedMotion}
                    onChange={(v) => update("reducedMotion", v)}
                    ariaLabel="Reduced motion"
                  />
                </SettingRow>
              </SettingsCard>

              {/* ─── Gameplay ─── */}
              <SettingsCard
                icon={<Gamepad2 className="w-5 h-5 text-brand-500" />}
                title={t("settings.gameplay.title", "Gameplay")}
                subtitle={t(
                  "settings.gameplay.subtitle",
                  "Tweak your playing experience",
                )}
                accent="bg-brand-500"
              >
                <SettingRow
                  label={t(
                    "settings.gameplay.defaultTime",
                    "Default Time Control",
                  )}
                  helper={t(
                    "settings.gameplay.defaultTimeHelper",
                    "Starting time format for new games",
                  )}
                >
                  <Select
                    value={settings.defaultTimeControl}
                    onChange={(v) => update("defaultTimeControl", v)}
                    options={[
                      {
                        label: t(
                          "settings.gameplay.timeControls.bullet",
                          "⚡ Bullet",
                        ),
                        value: "bullet",
                      },
                      {
                        label: t(
                          "settings.gameplay.timeControls.blitz",
                          "🔥 Blitz",
                        ),
                        value: "blitz",
                      },
                      {
                        label: t(
                          "settings.gameplay.timeControls.rapid",
                          "🚀 Rapid",
                        ),
                        value: "rapid",
                      },
                      {
                        label: t(
                          "settings.gameplay.timeControls.classical",
                          "🏛️ Classical",
                        ),
                        value: "classical",
                      },
                      {
                        label: t(
                          "settings.gameplay.timeControls.custom",
                          "⚙️ Custom",
                        ),
                        value: "custom",
                      },
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
                    onChange={(v) => update("autoQueen", v)}
                    ariaLabel="Auto-queen"
                />
              </SettingRow>

              <SettingRow
                  label={t("settings.gameplay.moveInput", "Move Input")}
                  helper={t(
                    "settings.gameplay.moveInputHelper",
                    "How you make moves on the board",
                  )}
                >
                  <SegmentedControl
                    options={[
                      { label: t("settings.gameplay.input.click", "Click"), value: "click" },
                      { label: t("settings.gameplay.input.drag", "Drag"), value: "drag" },
                      { label: t("settings.gameplay.input.both", "Both"), value: "both" },
                    ]}
                    value={settings.moveInput}
                    onChange={(v) =>
                      update("moveInput", v as "click" | "drag" | "both")
                    }
                  />
                </SettingRow>

                <SettingRow
                  label={t("settings.gameplay.legalMoves", "Show Legal Moves")}
                  helper={t(
                    "settings.gameplay.legalMovesHelper",
                    "Highlight available squares",
                  )}
                >
                  <Toggle
                    enabled={settings.showLegalMoves}
                    onChange={(v) => update("showLegalMoves", v)}
                    ariaLabel="Show legal moves"
                  />
                </SettingRow>

                <SettingRow
                  label={t("settings.gameplay.confirmMove", "Confirm Move")}
                  helper={t(
                    "settings.gameplay.confirmMoveHelper",
                    "Require explicit confirmation before moving",
                  )}
                >
                  <Toggle
                    enabled={settings.confirmMove}
                    onChange={(v) => update("confirmMove", v)}
                    ariaLabel="Confirm move"
                  />
                </SettingRow>

                <SettingRow
                  label={t("settings.gameplay.premoves", "Premoves")}
                  helper={t(
                    "settings.gameplay.premovesHelper",
                    "Queue your next move while waiting",
                  )}
                  last
                >
                  <Toggle
                    enabled={settings.premoves}
                    onChange={(v) => update("premoves", v)}
                    ariaLabel="Premoves"
                  />
                </SettingRow>
              </SettingsCard>

              {/* ─── Notifications ─── */}
              <SettingsCard
                icon={<Bell className="w-5 h-5 text-amber-500" />}
                title={t("settings.notifications.title", "Notifications")}
                subtitle={t(
                  "settings.notifications.subtitle",
                  "Control what alerts you receive",
                )}
                accent="bg-amber-500"
              >
                <SettingRow
                  label={t(
                    "settings.notifications.email",
                    "Email Notifications",
                  )}
                  helper={t(
                    "settings.notifications.emailHelper",
                    "Receive emails about activity",
                  )}
                >
                  <Toggle
                    enabled={settings.emailNotifications}
                    onChange={(v) => update("emailNotifications", v)}
                    ariaLabel="Email notifications"
                  />
                </SettingRow>

                <SettingRow
                  label={t("settings.notifications.push", "Push Notifications")}
                  helper={t(
                    "settings.notifications.pushHelper",
                    "Browser push alerts",
                  )}
                >
                  <Toggle
                    enabled={settings.pushNotifications}
                    onChange={(v) => update("pushNotifications", v)}
                    ariaLabel="Push notifications"
                  />
                </SettingRow>

                <SettingRow
                  label={t(
                    "settings.notifications.challengeRequests",
                    "Challenge Requests",
                  )}
                  helper={t(
                    "settings.notifications.challengeHelper",
                    "Get notified when someone challenges you",
                  )}
                >
                  <Toggle
                    enabled={settings.challengeRequests}
                    onChange={(v) => update("challengeRequests", v)}
                    ariaLabel="Challenge requests"
                  />
                </SettingRow>

                <SettingRow
                  label={t(
                    "settings.notifications.tournamentUpdates",
                    "Tournament Updates",
                  )}
                  helper={t(
                    "settings.notifications.tournamentHelper",
                    "Upcoming events and results",
                  )}
                >
                  <Toggle
                    enabled={settings.tournamentUpdates}
                    onChange={(v) => update("tournamentUpdates", v)}
                    ariaLabel="Tournament updates"
                  />
                </SettingRow>

                <SettingRow
                  label={t(
                    "settings.notifications.soundEffects",
                    "Sound Effects",
                  )}
                  helper={t(
                    "settings.notifications.soundEffectsHelper",
                    "In-game sounds and alerts",
                  )}
                >
                  <Toggle
                    enabled={settings.soundEffects}
                    onChange={(v) => update("soundEffects", v)}
                    ariaLabel="Sound effects"
                  />
                </SettingRow>

                <SettingRow
                  label={t("settings.notifications.soundVolume", "Sound Volume")}
                  helper={t(
                    "settings.notifications.soundVolumeHelper",
                    "Adjust effect volume",
                  )}
                  last
                >
                  <Slider
                    min={0}
                    max={100}
                    value={settings.soundVolume}
                    onChange={(v) => update("soundVolume", v)}
                    label={`${settings.soundVolume}%`}
                  />
                </SettingRow>
              </SettingsCard>

              {/* ─── Privacy & Safety ─── */}
              <SettingsCard
                icon={<Shield className="w-5 h-5 text-blue-500" />}
                title={t("settings.privacy.title", "Privacy & Safety")}
                subtitle={t(
                  "settings.privacy.subtitle",
                  "Control who sees your information",
                )}
                accent="bg-blue-500"
              >
                <SettingRow
                  label={t("settings.privacy.visibility", "Profile Visibility")}
                  helper={t(
                    "settings.privacy.visibilityHelper",
                    "Who can see your profile",
                  )}
                >
                  <SegmentedControl
                    options={[
                      { label: t("settings.privacy.options.public", "Public"), value: "public" },
                      { label: t("settings.privacy.options.friends", "Friends"), value: "friends" },
                      { label: t("settings.privacy.options.private", "Private"), value: "private" },
                    ]}
                    value={settings.profileVisibility}
                    onChange={(v) =>
                      update(
                        "profileVisibility",
                        v as "public" | "friends" | "private",
                      )
                    }
                  />
                </SettingRow>

                <SettingRow
                  label={t("settings.privacy.onlineStatus", "Show Online Status")}
                  helper={t(
                    "settings.privacy.onlineStatusHelper",
                    "Let others see when you're online",
                  )}
                >
                  <Toggle
                    enabled={settings.showOnlineStatus}
                    onChange={(v) => update("showOnlineStatus", v)}
                    ariaLabel="Show online status"
                  />
                </SettingRow>

                <SettingRow
                  label={t("settings.privacy.lastSeen", "Show Last Seen")}
                  helper={t(
                    "settings.privacy.lastSeenHelper",
                    "Display when you were last active",
                  )}
                >
                  <Toggle
                    enabled={settings.showLastSeen}
                    onChange={(v) => update("showLastSeen", v)}
                    ariaLabel="Show last seen"
                  />
                </SettingRow>

                <SettingRow
                  label={t("settings.privacy.blockedUsers", "Blocked Users")}
                  helper={t(
                    "settings.privacy.blockedUsersHelper",
                    "Manage your block list",
                  )}
                  last
                >
                  <button className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">
                    {t("settings.actions.manage", "Manage")}
                  </button>
                </SettingRow>
              </SettingsCard>

              {/* ─── AI / Analysis ─── */}
              <SettingsCard
                icon={<Sparkles className="w-5 h-5 text-violet-500" />}
                title={t("settings.ai.title", "AI & Analysis")}
                subtitle={t(
                  "settings.ai.subtitle",
                  "Configure AI-powered features",
                )}
                accent="bg-violet-500"
              >
                <SettingRow
                  label={t("settings.ai.explanations", "AI Move Explanations")}
                  helper={t(
                    "settings.ai.explanationsHelper",
                    "Get detailed move analysis powered by Llama 3",
                  )}
                >
                  <Toggle
                    enabled={settings.enableAiExplanations}
                    onChange={(v) => update("enableAiExplanations", v)}
                    color="bg-violet-500"
                    ariaLabel="AI explanations"
                  />
                </SettingRow>

                {/* API status indicator */}
                <div className="py-2">
                  <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/60">
                    {groqConfigured ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        <span className="text-xs font-medium text-green-600 dark:text-green-400">
                          {t("settings.ai.groqConnected", "Groq API connected")}
                        </span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 text-red-400" />
                        <span className="text-xs font-medium text-red-500 dark:text-red-400">
                          {t(
                            "settings.ai.groqMissing",
                            "VITE_GROQ_API_KEY missing — add it to .env",
                          )}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <SettingRow
                  label={t("settings.ai.explanationLevel", "Explanation Level")}
                  helper={t(
                    "settings.ai.explanationLevelHelper",
                    "How detailed AI commentary should be",
                  )}
                >
                  <SegmentedControl
                    options={[
                      { label: t("settings.ai.levels.brief", "Brief"), value: "brief" },
                      { label: t("settings.ai.levels.normal", "Normal"), value: "normal" },
                      { label: t("settings.ai.levels.deep", "Deep"), value: "deep" },
                    ]}
                    value={settings.explanationLevel}
                    onChange={(v) =>
                      update(
                        "explanationLevel",
                        v as "brief" | "normal" | "deep",
                      )
                    }
                  />
                </SettingRow>

                <SettingRow
                  label={t("settings.ai.postGame", "Post-Game Analysis")}
                  helper={t(
                    "settings.ai.postGameHelper",
                    "Allow engine analysis after games",
                  )}
                >
                  <Toggle
                    enabled={settings.postGameAnalysis}
                    onChange={(v) => update("postGameAnalysis", v)}
                    color="bg-violet-500"
                    ariaLabel="Post-game analysis"
                  />
                </SettingRow>

                <SettingRow
                  label={t("settings.ai.engineStrength", "Engine Strength")}
                  helper={t(
                    "settings.ai.engineStrengthHelper",
                    "Stockfish difficulty level",
                  )}
                  last
                >
                  <Slider
                    min={1}
                    max={20}
                    value={settings.engineStrength}
                    onChange={(v) => update("engineStrength", v)}
                    label={`${t("settings.ai.levelLabel", "Lvl")} ${settings.engineStrength}`}
                  />
                </SettingRow>
              </SettingsCard>
            </div>

            {/* ======= RIGHT (narrow sidebar) ======= */}
            <div className="w-full lg:w-80 shrink-0 space-y-6">
              {/* ─── Account Summary ─── */}
              <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/80 bg-white/70 dark:bg-gray-900/60 backdrop-blur-xl shadow-sm overflow-hidden">
                <div className="relative p-6 text-center">
                  {/* Glow */}
                  <div className="absolute inset-0 bg-gradient-to-b from-brand-500/5 to-transparent pointer-events-none" />
                  <div className="relative">
                    <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-900/20 ring-4 ring-white dark:ring-gray-900 overflow-hidden">
                      {user?.avatar ? (
                        <img
                          src={user.avatar}
                          alt={user.fullName || t("common.user", "User")}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-white font-bold text-2xl">
                          {user?.fullName?.substring(0, 2).toUpperCase() ||
                            t("common.userInitial", "U")}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-4 text-lg font-bold">
                      {user?.fullName || t("common.user", "User")}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {user?.email || ""}
                    </p>

                    {/* Rating badges */}
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {[
                        {
                          label: t("settings.stats.bullet", "Bullet"),
                          value: user?.bulletRating ?? 1500,
                          icon: "⚡",
                        },
                        {
                          label: t("settings.stats.blitz", "Blitz"),
                          value: user?.blitzRating ?? 1500,
                          icon: "🔥",
                        },
                        {
                          label: t("settings.stats.rapid", "Rapid"),
                          value: user?.rapidRating ?? 1500,
                          icon: "🚀",
                        },
                        {
                          label: t("settings.stats.classical", "Classical"),
                          value: user?.classicalRating ?? 1500,
                          icon: "🏛️",
                        },
                      ].map((r) => (
                        <div
                          key={r.label}
                          className="px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800/60 text-center"
                        >
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {r.icon} {r.label}
                          </span>
                          <div className="text-sm font-bold mt-0.5">
                            {r.value}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800/60 text-xs text-gray-500 dark:text-gray-400">
                      <div className="flex justify-between">
                        <span>
                          {t("settings.stats.gamesPlayed", "Games Played")}
                        </span>
                        <span className="font-semibold text-gray-700 dark:text-gray-300">
                          {user?.gamesPlayed ?? 0}
                        </span>
                      </div>
                      <div className="flex justify-between mt-1.5">
                        <span>{t("settings.stats.gamesWon", "Games Won")}</span>
                        <span className="font-semibold text-gray-700 dark:text-gray-300">
                          {user?.gamesWon ?? 0}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ─── Quick Actions ─── */}
              <SettingsCard
                icon={<Zap className="w-5 h-5 text-amber-500" />}
                title={t("settings.quickActions.title", "Quick Actions")}
              >
                <div className="space-y-2 py-1">
                  <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors text-left">
                    <FileText className="w-4 h-4 text-gray-500" />
                    <span>
                      {t("settings.quickActions.exportPgn", "Export Games (PGN)")}
                    </span>
                  </button>
                  <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors text-left">
                    <Download className="w-4 h-4 text-gray-500" />
                    <span>
                      {t(
                        "settings.quickActions.downloadData",
                        "Download Account Data",
                      )}
                    </span>
                  </button>
                </div>
              </SettingsCard>

              {/* ─── Danger Zone ─── */}
              <div className="rounded-2xl border border-red-200/40 dark:border-red-900/30 bg-white/70 dark:bg-gray-900/60 backdrop-blur-xl shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-6 pt-5 pb-4 border-b border-red-100/60 dark:border-red-900/20">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                  <div>
                    <h3 className="text-base font-bold text-red-600 dark:text-red-400 leading-tight">
                      {t("settings.danger.title", "Danger Zone")}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {t("settings.danger.subtitle", "Irreversible actions")}
                    </p>
                  </div>
                </div>
                <div className="px-6 py-4 space-y-2.5">
                  <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium bg-red-50/60 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors text-left">
                    <LogOut className="w-4 h-4" />
                    <span>
                      {t("settings.danger.signOutAll", "Sign Out All Devices")}
                    </span>
                  </button>
                  <button
                    onClick={() => setDeleteModal(true)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold bg-red-50/60 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors text-left"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{t("settings.danger.deleteAccount", "Delete Account")}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── Change Password Modal ────────────────────── */}
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
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
              {t("settings.modals.changePassword.current", "Current Password")}
            </label>
            <input
              type="password"
              value={pwFields.current}
              onChange={(e) =>
                setPwFields((p) => ({ ...p, current: e.target.value }))
              }
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
              placeholder={t(
                "settings.modals.changePassword.currentPlaceholder",
                "Enter current password",
              )}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
              {t("settings.modals.changePassword.new", "New Password")}
            </label>
            <input
              type="password"
              value={pwFields.newPw}
              onChange={(e) =>
                setPwFields((p) => ({ ...p, newPw: e.target.value }))
              }
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
              placeholder={t(
                "settings.modals.changePassword.newPlaceholder",
                "Enter new password",
              )}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
              {t("settings.modals.changePassword.confirm", "Confirm Password")}
            </label>
            <input
              type="password"
              value={pwFields.confirm}
              onChange={(e) =>
                setPwFields((p) => ({ ...p, confirm: e.target.value }))
              }
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
              placeholder={t(
                "settings.modals.changePassword.confirmPlaceholder",
                "Confirm new password",
              )}
            />
          </div>
          <button
            disabled={
              !pwFields.current ||
              !pwFields.newPw ||
              pwFields.newPw !== pwFields.confirm
            }
            onClick={() => {
              showToast(
                t(
                  "settings.toasts.passwordChanged",
                  "Password changed successfully!",
                ),
              );
              setPasswordModal(false);
              setPwFields({ current: "", newPw: "", confirm: "" });
            }}
            className="w-full py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:bg-gray-300 dark:disabled:bg-gray-800 disabled:text-gray-500 text-white font-bold text-sm transition-all"
          >
            {t("settings.modals.changePassword.cta", "Update Password")}
          </button>
        </div>
      </Modal>

      {/* ── Delete Account Modal ─────────────────────── */}
      <Modal
        open={deleteModal}
        onClose={() => {
          setDeleteModal(false);
          setDeleteConfirmText("");
        }}
        title={t("settings.modals.delete.title", "Delete Account")}
      >
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40">
            <p className="text-sm text-red-600 dark:text-red-400 font-medium">
              {t(
                "settings.modals.delete.warning",
                "This action is permanent and cannot be undone. All your games, ratings, and data will be lost.",
              )}
            </p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
              {t("settings.modals.delete.confirmLabel", {
                defaultValue: "Type {{name}} to confirm",
                name: deleteConfirmTarget,
              })}
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="w-full bg-gray-50 dark:bg-gray-800 border border-red-200 dark:border-red-800/40 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/40 transition-all"
              placeholder={deleteConfirmTarget}
            />
          </div>
          <button
            disabled={deleteConfirmText !== deleteConfirmTarget}
            onClick={() => {
              showToast(
                t(
                  "settings.toasts.deletionRequested",
                  "Account deletion requested",
                ),
                "error",
              );
              setDeleteModal(false);
              setDeleteConfirmText("");
            }}
            className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:bg-gray-300 dark:disabled:bg-gray-800 disabled:text-gray-500 text-white font-bold text-sm transition-all"
          >
            {t("settings.modals.delete.cta", "Permanently Delete Account")}
          </button>
        </div>
      </Modal>

      {/* Toast */}
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onClose={hideToast}
      />
    </div>
  );
}

