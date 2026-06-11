import { useEffect, useMemo, useState } from "react";
import Sidebar from "../components/Sidebar";
import { useSettingsStore } from "../store/settingsStore";
import { authApi, useAuthStore } from "../store/authStore";
import { ProfileAvatarUpload } from "../components/profilePage";
import { BOARD_THEME_OPTIONS } from "../config/boardThemes";
import {
  BoardThemePicker,
  Modal,
  SegmentedControl,
  Select,
  SettingRow,
  SettingsCard,
  ThemeOptionsGrid,
  Toast,
  Toggle,
  useToast,
} from "../components/settings";
import { useTranslation } from "react-i18next";
import { supportedLanguages } from "../i18n";
import {
  refreshBlockingCaches,
  unblockUser,
  useBlockedUsers,
} from "../features/blocking/api";
import { fetchAiProviderStatus, getAiProviderStatus } from "../utils/groqApi";
import { useLanguageAvailabilityStore } from "../store/languageAvailabilityStore";

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

const API_URL = import.meta.env.VITE_API_URL;

const SETTINGS_CARD_ACCENT = {
  profile: "bg-brand-500",
  language: "bg-indigo-500",
  appearance: "bg-purple-500",
  gameplay: "bg-brand-500",
  ai: "bg-emerald-500",
  privacy: "bg-blue-500",
} as const;

const SETTINGS_KEY = {
  defaultTimeControl: "defaultTimeControl",
  autoQueen: "autoQueen",
  moveInput: "moveInput",
  showLegalMoves: "showLegalMoves",
  premoves: "premoves",
  enableAiExplanations: "enableAiExplanations",
  explanationLevel: "explanationLevel",
  postGameAnalysis: "postGameAnalysis",
} as const;

const TIME_CONTROL_VALUE = {
  bullet: "bullet",
  blitz: "blitz",
  rapid: "rapid",
  classical: "classical",
  custom: "custom",
} as const;

const MOVE_INPUT_VALUE = {
  click: "click",
  drag: "drag",
  both: "both",
} as const;

const EXPLANATION_LEVEL_VALUE = {
  brief: "brief",
  normal: "normal",
  deep: "deep",
} as const;

function resolveAvatarUrl(avatar?: string) {
  if (!avatar) return "";
  if (
    avatar.startsWith("http://") ||
    avatar.startsWith("https://") ||
    avatar.startsWith("data:") ||
    avatar.startsWith("blob:")
  ) {
    return avatar;
  }
  return `${API_URL}${avatar.startsWith("/") ? "" : "/"}${avatar}`;
}

export default function Settings() {
  const { settings, update, save, reset, isDirty, selectedTheme, setTheme: setBoardTheme } = useSettingsStore();
  const { user, setUser } = useAuthStore();
  const { t, i18n } = useTranslation();
  const learnMnUnavailable = useLanguageAvailabilityStore(
    (state) => state.learnMnUnavailable,
  );
  const eventsMnUnavailable = useLanguageAvailabilityStore(
    (state) => state.eventsMnUnavailable,
  );
  const clearMnUnavailable = useLanguageAvailabilityStore(
    (state) => state.clearMnUnavailable,
  );
  const showMnUnavailableBadge =
    (i18n.resolvedLanguage || i18n.language || "en") === "mn" &&
    (learnMnUnavailable || eventsMnUnavailable);
  const dirty = useMemo(() => isDirty(), [isDirty, settings]);
  const [aiProviderStatus, setAiProviderStatus] = useState(() =>
    getAiProviderStatus(settings.analysisAiModelId),
  );
  useEffect(() => {
    let cancelled = false;
    fetchAiProviderStatus(settings.analysisAiModelId)
      .then((status) => {
        if (!cancelled) setAiProviderStatus(status);
      })
      .catch(() => {
        if (!cancelled) {
          setAiProviderStatus(getAiProviderStatus(settings.analysisAiModelId));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [settings.analysisAiModelId]);
  const hasConfiguredAiProvider =
    aiProviderStatus.anthropicConfigured ||
    aiProviderStatus.groqConfigured;
  const aiStatusLabel = hasConfiguredAiProvider
    ? t("settings.ai.providerConnected", "AI provider configured")
    : t("settings.ai.providerMissing", "No AI provider configured");
  const aiProviderHelper = hasConfiguredAiProvider
    ? t("settings.ai.providerHelperSelected", {
        defaultValue:
          "Selected model: {{model}}. Change model from Admin > Bots.",
        model: aiProviderStatus.selectedModelName,
      })
    : t(
        "settings.ai.providerHelperSetup",
        "Add AWS_BEARER_TOKEN_BEDROCK or GROQ_API_KEY in the backend environment and restart the app.",
      );

  const [passwordModal, setPasswordModal] = useState(false);
  const [blockedUsersModal, setBlockedUsersModal] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwFields, setPwFields] = useState({
    current: "",
    newPw: "",
    confirm: "",
  });
  const {
    data: blockedUsersData,
    isLoading: blockedUsersLoading,
    mutate: mutateBlockedUsers,
  } = useBlockedUsers();

  const { toast, show: showToast, hide: hideToast } = useToast();
  const linkedProviders = getLinkedProviders(
    user,
    (key: string, fallback: string) => t(key, fallback),
  );
  const localizedBoardThemeOptions = useMemo(
    () =>
      BOARD_THEME_OPTIONS.map((option) => ({
        ...option,
        label: t(
          `settings.appearance.boardThemeNames.${option.value}`,
          option.label,
        ),
      })),
    [t],
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

  const blockedUsers = blockedUsersData?.blocks || [];

  const handleUnblock = async (targetUserId: string) => {
    if (!targetUserId || unblockingId) return;
    const previous = blockedUsersData || { blocks: [] };

    setUnblockingId(targetUserId);
    await mutateBlockedUsers(
      {
        blocks: previous.blocks.filter((entry) => entry.id !== targetUserId),
      },
      false,
    );

    try {
      await unblockUser(targetUserId);
      await mutateBlockedUsers();
      await refreshBlockingCaches(targetUserId);
      showToast(t("settings.toasts.unblocked", "User unblocked."));
    } catch (error) {
      await mutateBlockedUsers(previous, false);
      showToast(
        error instanceof Error
          ? error.message
          : t("settings.errors.unblockFailed", "Unable to unblock user."),
        "error",
      );
    } finally {
      setUnblockingId(null);
    }
  };

  const handlePasswordChange = async () => {
    if (!pwFields.current || !pwFields.newPw || !pwFields.confirm) {
      showToast(
        t("settings.errors.fillPasswordFields", "Fill in all password fields."),
        "error",
      );
      return;
    }

    if (pwFields.newPw.length < 8) {
      showToast(
        t(
          "settings.errors.passwordTooShort",
          "New password must be at least 8 characters.",
        ),
        "error",
      );
      return;
    }

    if (pwFields.newPw !== pwFields.confirm) {
      showToast(
        t("settings.errors.passwordMismatch", "New passwords do not match."),
        "error",
      );
      return;
    }

    setPwSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          currentPassword: pwFields.current,
          newPassword: pwFields.newPw,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          String(
            data?.error ||
              t("settings.errors.changePasswordFailed", "Failed to change password"),
          ),
        );
      }

      showToast(
        t("settings.toasts.passwordChanged", "Password changed successfully!"),
      );
      setPasswordModal(false);
      setPwFields({ current: "", newPw: "", confirm: "" });
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : t("settings.errors.changePasswordFailed", "Failed to change password"),
        "error",
      );
    } finally {
      setPwSaving(false);
    }
  };

  const handleLanguageChange = async (value: string) => {
    const language = value === "mn" ? "mn" : "en";
    await i18n.changeLanguage(language);

    if (typeof window !== "undefined") {
      window.localStorage.setItem("ng_lang", language);
    }

    if (language === "en") {
      clearMnUnavailable();
    }

    if (!user) return;

    try {
      const updatedUser = await authApi.updateProfile({
        preferredLanguage: language,
      });
      setUser(updatedUser);
    } catch {
      // Preserve client language preference even if profile sync fails.
    }
  };

  return (
    <div
      className="min-h-screen bg-transparent text-theme-foreground transition-colors duration-300 "
    >
      <div className="flex min-h-screen">
        <Sidebar />

        <main className="ml-[60px] min-h-screen flex-1 md:ml-72">
          <div className="theme-glass-panel-soft sticky top-0 z-30 rounded-none border-x-0 border-t-0">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
              <h1 className="text-3xl font-bold tracking-tight">
                {t("settings.header.title", "Settings")}
              </h1>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleReset}
                  disabled={!dirty}
                  className="flex items-center gap-2 rounded-xl border border-theme-glass px-4 py-2 text-sm font-semibold text-theme-muted transition-all hover:bg-theme-surface disabled:cursor-not-allowed disabled:text-theme-disabled"
                >
                  {t("settings.actions.reset", "Reset")}
                </button>
                <button
                  onClick={handleSave}
                  disabled={!dirty}
                  className={`flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-bold transition-all shadow-lg ${
                    dirty
                      ? "bg-brand-600 text-theme-on-accent shadow-brand-900/25 hover:bg-brand-500"
                      : "cursor-not-allowed bg-theme-surface text-theme-muted shadow-none"
                  }`}
                >
                  {t("settings.actions.saveChanges", "Save Changes")}
                </button>
              </div>
            </div>
          </div>

          <div className="mx-auto max-w-4xl px-6 py-8">
            <div className="space-y-8">
              <SettingsCard
                title={t("settings.profile.title", "Profile & Account")}
                subtitle={t(
                  "settings.profile.subtitle",
                  "Your personal information and security",
                )}
                accent={SETTINGS_CARD_ACCENT.profile}
              >
                <div className="flex flex-col items-center gap-5 py-3 sm:flex-row sm:items-start">
                  <ProfileAvatarUpload
                    currentAvatar={user?.avatar}
                    userName={user?.fullName}
                    size="md"
                  />
                  <div className="w-full space-y-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-theme-muted">
                        {t("settings.profile.email", "Email")}
                      </label>
                      <input
                        type="email"
                        defaultValue={user?.email || ""}
                        disabled
                        className="w-full cursor-not-allowed rounded-xl border border-theme-glass bg-theme-surface px-4 py-3 text-base text-theme-muted"
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
                    className="flex items-center gap-1.5 rounded-lg bg-theme-surface px-4 py-2 text-sm font-bold text-theme-muted transition-colors hover:bg-theme-surface/80"
                  >
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
                          className="rounded-lg bg-theme-surface px-3 py-2 text-sm font-bold text-theme-muted"
                        >
                          {provider}
                        </span>
                      ))}
                    </div>
                  </SettingRow>
                )}
              </SettingsCard>

              <SettingsCard
                title={t("settingsLang.title", "Language")}
                subtitle={t("settingsLang.helper", "Choose your preferred language")}
                accent={SETTINGS_CARD_ACCENT.language}
              >
                <SettingRow
                  label={t("settingsLang.title", "Language")}
                  helper={t("settingsLang.helper", "Choose your preferred language")}
                  last
                >
                  <div className="flex flex-col items-end gap-1.5">
                    <SegmentedControl
                      options={supportedLanguages.map((language) => ({
                        label: language.name,
                        value: language.code,
                      }))}
                      value={
                        i18n.resolvedLanguage || i18n.language || supportedLanguages[0].code
                      }
                      onChange={(value) => {
                        void handleLanguageChange(value);
                      }}
                    />
                    {showMnUnavailableBadge && (
                      <span
                        className="rounded-full border border-amber-300/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-amber-700"
                        title={t(
                          "settingsLang.mnUnavailableTooltip",
                          "Mongolian translation is unavailable for some content.",
                        )}
                      >
                        {t("settingsLang.mnUnavailable", "MN unavailable")}
                      </span>
                    )}
                  </div>
                </SettingRow>
              </SettingsCard>

              <SettingsCard
                title={t("settings.appearance.title", "Appearance")}
                subtitle={t("settings.appearance.subtitle")}
                accent={SETTINGS_CARD_ACCENT.appearance}
              >
                <SettingRow
                  label={t("settings.appearance.theme", "Theme")}
                  helper={t(
                    "settings.appearance.themeHelper",
                    "Choose your preferred color scheme",
                  )}
                  stacked
                >
                  <div className="theme-glass-panel-soft w-full rounded-2xl p-3 sm:p-4">
                    <ThemeOptionsGrid />
                  </div>
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
                    options={localizedBoardThemeOptions}
                    value={selectedTheme}
                    onChange={setBoardTheme}
                  />
                </SettingRow>
              </SettingsCard>

              <SettingsCard
                title={t("settings.gameplay.title", "Gameplay")}
                subtitle={t("settings.gameplay.subtitle", "Tweak your playing experience")}
                accent={SETTINGS_CARD_ACCENT.gameplay}
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
                    onChange={(value) => update(SETTINGS_KEY.defaultTimeControl, value)}
                    options={[
                      { label: t("settings.gameplay.timeControls.bullet", "Bullet"), value: TIME_CONTROL_VALUE.bullet },
                      { label: t("settings.gameplay.timeControls.blitz", "Blitz"), value: TIME_CONTROL_VALUE.blitz },
                      { label: t("settings.gameplay.timeControls.rapid", "Rapid"), value: TIME_CONTROL_VALUE.rapid },
                      { label: t("settings.gameplay.timeControls.classical", "Classical"), value: TIME_CONTROL_VALUE.classical },
                      { label: t("settings.gameplay.timeControls.custom", "Custom"), value: TIME_CONTROL_VALUE.custom },
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
                    onChange={(value) => update(SETTINGS_KEY.autoQueen, value)}
                    ariaLabel={t("settings.gameplay.autoQueenAria", "Auto-queen")}
                  />
                </SettingRow>

                <SettingRow
                  label={t("settings.gameplay.moveInput", "Move Input")}
                  helper={t("settings.gameplay.moveInputHelper", "How you make moves on the board")}
                >
                  <SegmentedControl
                    options={[
                      { label: t("settings.gameplay.input.click", "Click"), value: MOVE_INPUT_VALUE.click },
                      { label: t("settings.gameplay.input.drag", "Drag"), value: MOVE_INPUT_VALUE.drag },
                      { label: t("settings.gameplay.input.both", "Both"), value: MOVE_INPUT_VALUE.both },
                    ]}
                    value={settings.moveInput}
                    onChange={(value) =>
                      update(
                        SETTINGS_KEY.moveInput,
                        value as
                          | typeof MOVE_INPUT_VALUE.click
                          | typeof MOVE_INPUT_VALUE.drag
                          | typeof MOVE_INPUT_VALUE.both,
                      )
                    }
                  />
                </SettingRow>

                <SettingRow
                  label={t("settings.gameplay.legalMoves", "Show Legal Moves")}
                  helper={t("settings.gameplay.legalMovesHelper", "Highlight available squares")}
                >
                  <Toggle
                    enabled={settings.showLegalMoves}
                    onChange={(value) => update(SETTINGS_KEY.showLegalMoves, value)}
                    ariaLabel={t("settings.gameplay.showLegalMovesAria", "Show legal moves")}
                  />
                </SettingRow>

                <SettingRow
                  label={t("settings.gameplay.premoves", "Premoves")}
                  helper={t("settings.gameplay.premovesHelper", "Queue your next move while waiting")}
                  last
                >
                  <Toggle
                    enabled={settings.premoves}
                    onChange={(value) => update(SETTINGS_KEY.premoves, value)}
                    ariaLabel={t("settings.gameplay.premovesAria", "Premoves")}
                  />
                </SettingRow>
              </SettingsCard>

              <SettingsCard
                title={t("settings.ai.title", "AI & Analysis")}
                subtitle={t(
                  "settings.ai.subtitle",
                  "Configure AI-powered replay explanations",
                )}
                accent={SETTINGS_CARD_ACCENT.ai}
              >
                <SettingRow
                  label={t("settings.ai.explanations", "AI Move Explanations")}
                  helper={t(
                    "settings.ai.explanationsHelper",
                    "Use the admin-selected model. If that provider fails and Groq is configured, Groq is used as fallback.",
                  )}
                >
                  <Toggle
                    enabled={settings.enableAiExplanations}
                    onChange={(value) =>
                      update(SETTINGS_KEY.enableAiExplanations, value)
                    }
                    ariaLabel={t(
                      "settings.ai.explanations",
                      "AI Move Explanations",
                    )}
                  />
                </SettingRow>

                <SettingRow
                  label={t("settings.ai.explanationLevel", "Explanation Level")}
                  helper={t(
                    "settings.ai.explanationLevelHelper",
                    "How detailed AI commentary should be",
                  )}
                >
                  <SegmentedControl
                    options={[
                      {
                        label: t("settings.ai.levels.brief", "Brief"),
                        value: EXPLANATION_LEVEL_VALUE.brief,
                      },
                      {
                        label: t("settings.ai.levels.normal", "Normal"),
                        value: EXPLANATION_LEVEL_VALUE.normal,
                      },
                      {
                        label: t("settings.ai.levels.deep", "Deep"),
                        value: EXPLANATION_LEVEL_VALUE.deep,
                      },
                    ]}
                    value={settings.explanationLevel}
                    onChange={(value) =>
                      update(
                        SETTINGS_KEY.explanationLevel,
                        value as
                          | typeof EXPLANATION_LEVEL_VALUE.brief
                          | typeof EXPLANATION_LEVEL_VALUE.normal
                          | typeof EXPLANATION_LEVEL_VALUE.deep,
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
                    onChange={(value) =>
                      update(SETTINGS_KEY.postGameAnalysis, value)
                    }
                    ariaLabel={t(
                      "settings.ai.postGame",
                      "Post-Game Analysis",
                    )}
                  />
                </SettingRow>

                <SettingRow
                  label={t("settings.ai.providerStatus", "AI Provider Status")}
                  helper={aiProviderHelper}
                  last
                >
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                      hasConfiguredAiProvider
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {aiStatusLabel}
                  </span>
                </SettingRow>
              </SettingsCard>

              <SettingsCard
                title={t("settings.privacy.title", "Privacy & Safety")}
                accent={SETTINGS_CARD_ACCENT.privacy}
              >
                <SettingRow
                  label={t("settings.privacy.blockedUsers", "Blocked Users")}
                  helper={t("settings.privacy.blockedUsersHelper", "Manage your block list")}
                  last
                >
                  <button
                    type="button"
                    onClick={() => setBlockedUsersModal(true)}
                    className="rounded-lg bg-theme-surface px-4 py-2 text-sm font-bold text-theme-muted transition-colors hover:bg-theme-surface/80"
                  >
                    {t("settings.actions.manage", "Manage")} ({blockedUsers.length})
                  </button>
                </SettingRow>
              </SettingsCard>
            </div>
          </div>
        </main>
      </div>

      <Modal
        open={blockedUsersModal}
        onClose={() => setBlockedUsersModal(false)}
        title={t("settings.privacy.blockedUsers", "Blocked Users")}
      >
        <div className="space-y-3">
          {blockedUsersLoading ? (
            <div className="rounded-lg border border-theme-glass bg-theme-surface px-4 py-3 text-sm text-theme-muted">
              {t("settings.errors.blockedUsersLoad", "Loading blocked users...")}
            </div>
          ) : blockedUsers.length === 0 ? (
            <div className="rounded-lg border border-theme-glass bg-theme-surface px-4 py-3 text-sm text-theme-muted">
              {t("settings.errors.noBlockedUsers", "No blocked users.")}
            </div>
          ) : (
            blockedUsers.map((blockedUser) => (
              <div
                key={blockedUser.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-theme-glass bg-theme-surface px-3 py-2.5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-theme-surface shrink-0">
                    {blockedUser.avatar ? (
                      <img
                        src={resolveAvatarUrl(blockedUser.avatar)}
                        alt={blockedUser.fullName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-semibold text-theme-muted ">
                        {blockedUser.fullName?.slice(0, 2).toUpperCase() || "U"}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-theme-foreground truncate">
                      {blockedUser.fullName}
                    </div>
                    <div className="text-xs text-theme-muted">
                      {blockedUser.blockedAt
                        ? t("settings.errors.blockedSince", {
                            defaultValue: "Blocked since {{date}}",
                            date: new Date(blockedUser.blockedAt).toLocaleString(),
                          })
                        : t("settings.errors.blocked", "Blocked")}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleUnblock(blockedUser.id)}
                  disabled={unblockingId === blockedUser.id}
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-theme-on-accent hover:bg-brand-500 disabled:opacity-60"
                >
                  {unblockingId === blockedUser.id
                    ? t("settings.errors.unblocking", "Unblocking...")
                    : t("settings.errors.unblock", "Unblock")}
                </button>
              </div>
            ))
          )}
        </div>
      </Modal>

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
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-theme-muted">
              {t("settings.modals.changePassword.current", "Current Password")}
            </label>
            <input
              type="password"
              value={pwFields.current}
              onChange={(event) => setPwFields((prev) => ({ ...prev, current: event.target.value }))}
              className="w-full rounded-xl border border-theme-glass bg-theme-surface px-4 py-2.5 text-sm transition-all focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              placeholder={t("settings.modals.changePassword.currentPlaceholder", "Enter current password")}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-theme-muted">
              {t("settings.modals.changePassword.new", "New Password")}
            </label>
            <input
              type="password"
              value={pwFields.newPw}
              onChange={(event) => setPwFields((prev) => ({ ...prev, newPw: event.target.value }))}
              className="w-full rounded-xl border border-theme-glass bg-theme-surface px-4 py-2.5 text-sm transition-all focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              placeholder={t("settings.modals.changePassword.newPlaceholder", "Enter new password")}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-theme-muted">
              {t("settings.modals.changePassword.confirm", "Confirm Password")}
            </label>
            <input
              type="password"
              value={pwFields.confirm}
              onChange={(event) => setPwFields((prev) => ({ ...prev, confirm: event.target.value }))}
              className="w-full rounded-xl border border-theme-glass bg-theme-surface px-4 py-2.5 text-sm transition-all focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              placeholder={t("settings.modals.changePassword.confirmPlaceholder", "Confirm new password")}
            />
          </div>
          <button
            disabled={
              pwSaving ||
              !pwFields.current ||
              !pwFields.newPw ||
              pwFields.newPw !== pwFields.confirm
            }
            onClick={() => {
              void handlePasswordChange();
            }}
            className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-bold text-theme-on-accent transition-all hover:bg-brand-500 disabled:bg-theme-surface disabled:text-theme-muted"
          >
            {pwSaving
              ? t("settings.errors.passwordUpdating", "Updating...")
              : t("settings.modals.changePassword.cta", "Update Password")}
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
