import {
  Bell,
  CheckCircle,
  Gamepad2,
  Key,
  Languages,
  Palette,
  Shield,
  Sparkles,
  User,
  XCircle,
} from "lucide-react";
import type { TFunction, i18n as I18n } from "i18next";
import { ProfileAvatarUpload } from "../../components/profilePage";
import {
  BoardThemePicker,
  ColorSwatchPicker,
  SegmentedControl,
  Select,
  SettingRow,
  SettingsCard,
  Slider,
  Toggle,
} from "../../components/settings";
import { BOARD_THEME_OPTIONS } from "../../config/boardThemes";
import { supportedLanguages } from "../../i18n";
import type { User as AuthUser } from "../../store/authStore";
import type { SettingsValues } from "../../store/settingsStore";
import type { UpdateSetting } from "./types";

interface SettingsMainContentProps {
  user: AuthUser | null;
  settings: SettingsValues;
  update: UpdateSetting;
  t: TFunction;
  i18n: I18n;
  groqConfigured: boolean;
  onOpenPasswordModal: () => void;
}

export function SettingsMainContent({
  user,
  settings,
  update,
  t,
  i18n,
  groqConfigured,
  onOpenPasswordModal,
}: SettingsMainContentProps) {
  const boardThemes = BOARD_THEME_OPTIONS;

  const accentOptions = [
    { value: "teal", bg: "bg-brand-500", label: t("settings.appearance.accent.teal", "Teal") },
    { value: "purple", bg: "bg-purple-500", label: t("settings.appearance.accent.purple", "Purple") },
    { value: "blue", bg: "bg-blue-500", label: t("settings.appearance.accent.blue", "Blue") },
  ];

  return (
    <div className="flex-1 min-w-0 space-y-6">
      <SettingsCard
        icon={<User className="h-5 w-5 text-brand-500" />}
        title={t("settings.profile.title", "Profile & Account")}
        subtitle={t("settings.profile.subtitle", "Your personal information and security")}
        accent="bg-brand-500"
      >
        <div className="flex items-start gap-6 py-2">
          <ProfileAvatarUpload currentAvatar={user?.avatar} userName={user?.fullName} size="md" />
          <div className="flex-1 space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {t("settings.profile.username", "Username")}
                </label>
                <input
                  type="text"
                  defaultValue={user?.fullName || ""}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium transition-all focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 dark:border-gray-700 dark:bg-gray-800/80"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {t("settings.profile.email", "Email")}
                </label>
                <input
                  type="email"
                  defaultValue={user?.email || ""}
                  disabled
                  className="w-full cursor-not-allowed rounded-xl border border-gray-200 bg-gray-100 px-4 py-2.5 text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-800/50"
                />
              </div>
            </div>
          </div>
        </div>

        <SettingRow
          label={t("settings.profile.changePassword", "Change Password")}
          helper={t("settings.profile.changePasswordHelper", "Update your account password")}
        >
          <button
            onClick={onOpenPasswordModal}
            className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3.5 py-1.5 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <Key className="h-3.5 w-3.5" />
            {t("settings.actions.change", "Change")}
          </button>
        </SettingRow>

        <SettingRow
          label={t("settings.profile.linkedAccounts", "Linked Accounts")}
          helper={t("settings.profile.linkedAccountsHelper", "Connect third-party services")}
          last
        >
          <div className="flex gap-2">
            <button className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700">
              {t("settings.profile.google", "Google")}
            </button>
            <button className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700">
              {t("settings.profile.github", "GitHub")}
            </button>
          </div>
        </SettingRow>
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
            options={supportedLanguages.map((language) => ({ label: language.name, value: language.code }))}
            value={i18n.resolvedLanguage || i18n.language || supportedLanguages[0].code}
            onChange={(value) => i18n.changeLanguage(value)}
          />
        </SettingRow>
      </SettingsCard>

      <SettingsCard
        icon={<Palette className="h-5 w-5 text-purple-500" />}
        title={t("settings.appearance.title", "Appearance")}
        subtitle={t("settings.appearance.subtitle", "Customize how NeonGambit looks")}
        accent="bg-purple-500"
      >
        <SettingRow
          label={t("settings.appearance.theme", "Theme")}
          helper={t("settings.appearance.themeHelper", "Choose your preferred color scheme")}
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
          label={t("settings.appearance.accentColor", "Accent Color")}
          helper={t("settings.appearance.accentHelper", "Primary highlight color")}
        >
          <ColorSwatchPicker
            options={accentOptions}
            value={settings.accentColor}
            onChange={(value) => update("accentColor", value as "teal" | "purple" | "blue")}
          />
        </SettingRow>

        <SettingRow
          label={t("settings.appearance.boardTheme", "Board Theme")}
          helper={t("settings.appearance.boardThemeHelper", "Choose board color scheme")}
        >
          <BoardThemePicker
            options={boardThemes}
            value={settings.boardTheme}
            onChange={(value) => update("boardTheme", value)}
          />
        </SettingRow>

        <SettingRow
          label={t("settings.appearance.reducedMotion", "Reduced Motion")}
          helper={t("settings.appearance.reducedMotionHelper", "Minimize animations")}
          last
        >
          <Toggle enabled={settings.reducedMotion} onChange={(value) => update("reducedMotion", value)} ariaLabel="Reduced motion" />
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
          helper={t("settings.gameplay.defaultTimeHelper", "Starting time format for new games")}
        >
          <Select
            value={settings.defaultTimeControl}
            onChange={(value) => update("defaultTimeControl", value)}
            options={[
              { label: t("settings.gameplay.timeControls.bullet", "⚡ Bullet"), value: "bullet" },
              { label: t("settings.gameplay.timeControls.blitz", "🔥 Blitz"), value: "blitz" },
              { label: t("settings.gameplay.timeControls.rapid", "🚀 Rapid"), value: "rapid" },
              { label: t("settings.gameplay.timeControls.classical", "🏛️ Classical"), value: "classical" },
              { label: t("settings.gameplay.timeControls.custom", "⚙️ Custom"), value: "custom" },
            ]}
          />
        </SettingRow>

        <SettingRow
          label={t("settings.gameplay.autoQueen", "Auto-Queen")}
          helper={t("settings.gameplay.autoQueenHelper", "Automatically promote pawns to queen")}
        >
          <Toggle enabled={settings.autoQueen} onChange={(value) => update("autoQueen", value)} ariaLabel="Auto-queen" />
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
          <Toggle enabled={settings.showLegalMoves} onChange={(value) => update("showLegalMoves", value)} ariaLabel="Show legal moves" />
        </SettingRow>

        <SettingRow
          label={t("settings.gameplay.confirmMove", "Confirm Move")}
          helper={t("settings.gameplay.confirmMoveHelper", "Require explicit confirmation before moving")}
        >
          <Toggle enabled={settings.confirmMove} onChange={(value) => update("confirmMove", value)} ariaLabel="Confirm move" />
        </SettingRow>

        <SettingRow
          label={t("settings.gameplay.premoves", "Premoves")}
          helper={t("settings.gameplay.premovesHelper", "Queue your next move while waiting")}
          last
        >
          <Toggle enabled={settings.premoves} onChange={(value) => update("premoves", value)} ariaLabel="Premoves" />
        </SettingRow>
      </SettingsCard>

      <SettingsCard
        icon={<Bell className="h-5 w-5 text-amber-500" />}
        title={t("settings.notifications.title", "Notifications")}
        subtitle={t("settings.notifications.subtitle", "Control what alerts you receive")}
        accent="bg-amber-500"
      >
        <SettingRow label={t("settings.notifications.email", "Email Notifications")} helper={t("settings.notifications.emailHelper", "Receive emails about activity")}>
          <Toggle enabled={settings.emailNotifications} onChange={(value) => update("emailNotifications", value)} ariaLabel="Email notifications" />
        </SettingRow>
        <SettingRow label={t("settings.notifications.push", "Push Notifications")} helper={t("settings.notifications.pushHelper", "Browser push alerts")}>
          <Toggle enabled={settings.pushNotifications} onChange={(value) => update("pushNotifications", value)} ariaLabel="Push notifications" />
        </SettingRow>
        <SettingRow label={t("settings.notifications.challengeRequests", "Challenge Requests")} helper={t("settings.notifications.challengeHelper", "Get notified when someone challenges you")}>
          <Toggle enabled={settings.challengeRequests} onChange={(value) => update("challengeRequests", value)} ariaLabel="Challenge requests" />
        </SettingRow>
        <SettingRow label={t("settings.notifications.tournamentUpdates", "Tournament Updates")} helper={t("settings.notifications.tournamentHelper", "Upcoming events and results")}>
          <Toggle enabled={settings.tournamentUpdates} onChange={(value) => update("tournamentUpdates", value)} ariaLabel="Tournament updates" />
        </SettingRow>
        <SettingRow label={t("settings.notifications.soundEffects", "Sound Effects")} helper={t("settings.notifications.soundEffectsHelper", "In-game sounds and alerts")}>
          <Toggle enabled={settings.soundEffects} onChange={(value) => update("soundEffects", value)} ariaLabel="Sound effects" />
        </SettingRow>
        <SettingRow label={t("settings.notifications.soundVolume", "Sound Volume")} helper={t("settings.notifications.soundVolumeHelper", "Adjust effect volume")} last>
          <Slider min={0} max={100} value={settings.soundVolume} onChange={(value) => update("soundVolume", value)} label={`${settings.soundVolume}%`} />
        </SettingRow>
      </SettingsCard>

      <SettingsCard
        icon={<Shield className="h-5 w-5 text-blue-500" />}
        title={t("settings.privacy.title", "Privacy & Safety")}
        subtitle={t("settings.privacy.subtitle", "Control who sees your information")}
        accent="bg-blue-500"
      >
        <SettingRow label={t("settings.privacy.visibility", "Profile Visibility")} helper={t("settings.privacy.visibilityHelper", "Who can see your profile")}>
          <SegmentedControl
            options={[
              { label: t("settings.privacy.options.public", "Public"), value: "public" },
              { label: t("settings.privacy.options.friends", "Friends"), value: "friends" },
              { label: t("settings.privacy.options.private", "Private"), value: "private" },
            ]}
            value={settings.profileVisibility}
            onChange={(value) => update("profileVisibility", value as "public" | "friends" | "private")}
          />
        </SettingRow>
        <SettingRow label={t("settings.privacy.onlineStatus", "Show Online Status")} helper={t("settings.privacy.onlineStatusHelper", "Let others see when you're online")}>
          <Toggle enabled={settings.showOnlineStatus} onChange={(value) => update("showOnlineStatus", value)} ariaLabel="Show online status" />
        </SettingRow>
        <SettingRow label={t("settings.privacy.lastSeen", "Show Last Seen")} helper={t("settings.privacy.lastSeenHelper", "Display when you were last active")}>
          <Toggle enabled={settings.showLastSeen} onChange={(value) => update("showLastSeen", value)} ariaLabel="Show last seen" />
        </SettingRow>
        <SettingRow label={t("settings.privacy.blockedUsers", "Blocked Users")} helper={t("settings.privacy.blockedUsersHelper", "Manage your block list")} last>
          <button className="rounded-lg bg-gray-100 px-3.5 py-1.5 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
            {t("settings.actions.manage", "Manage")}
          </button>
        </SettingRow>
      </SettingsCard>

      <SettingsCard
        icon={<Sparkles className="h-5 w-5 text-violet-500" />}
        title={t("settings.ai.title", "AI & Analysis")}
        subtitle={t("settings.ai.subtitle", "Configure AI-powered features")}
        accent="bg-violet-500"
      >
        <SettingRow label={t("settings.ai.explanations", "AI Move Explanations")} helper={t("settings.ai.explanationsHelper", "Get detailed move analysis powered by Llama 3")}>
          <Toggle enabled={settings.enableAiExplanations} onChange={(value) => update("enableAiExplanations", value)} color="bg-violet-500" ariaLabel="AI explanations" />
        </SettingRow>

        <div className="py-2">
          <div className="flex items-center gap-2.5 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800/60">
            {groqConfigured ? (
              <>
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-xs font-medium text-green-600 dark:text-green-400">
                  {t("settings.ai.groqConnected", "Groq API connected")}
                </span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-red-400" />
                <span className="text-xs font-medium text-red-500 dark:text-red-400">
                  {t("settings.ai.groqMissing", "VITE_GROQ_API_KEY missing — add it to .env")}
                </span>
              </>
            )}
          </div>
        </div>

        <SettingRow label={t("settings.ai.explanationLevel", "Explanation Level")} helper={t("settings.ai.explanationLevelHelper", "How detailed AI commentary should be")}>
          <SegmentedControl
            options={[
              { label: t("settings.ai.levels.brief", "Brief"), value: "brief" },
              { label: t("settings.ai.levels.normal", "Normal"), value: "normal" },
              { label: t("settings.ai.levels.deep", "Deep"), value: "deep" },
            ]}
            value={settings.explanationLevel}
            onChange={(value) => update("explanationLevel", value as "brief" | "normal" | "deep")}
          />
        </SettingRow>
        <SettingRow label={t("settings.ai.postGame", "Post-Game Analysis")} helper={t("settings.ai.postGameHelper", "Allow engine analysis after games")}>
          <Toggle enabled={settings.postGameAnalysis} onChange={(value) => update("postGameAnalysis", value)} color="bg-violet-500" ariaLabel="Post-game analysis" />
        </SettingRow>
        <SettingRow label={t("settings.ai.engineStrength", "Engine Strength")} helper={t("settings.ai.engineStrengthHelper", "Stockfish difficulty level")} last>
          <Slider min={1} max={20} value={settings.engineStrength} onChange={(value) => update("engineStrength", value)} label={`${t("settings.ai.levelLabel", "Lvl")} ${settings.engineStrength}`} />
        </SettingRow>
      </SettingsCard>
    </div>
  );
}

