import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Settings,
  Loader2,
  Sun,
  Moon,
  Bell,
  Shield,
  Monitor,
  Save,
  RotateCcw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  Zap,
  Database,
  Globe,
  Lock,
} from "lucide-react";
import AdminSidebar from "../../components/AdminSidebar";
import { useAdminStore } from "../../store/adminStore";
import { useThemeStore } from "../../store/themeStore";

/* ─── Types ─── */
interface AdminSettingsState {
  // Appearance
  compactSidebar: boolean;
  showAnimations: boolean;
  // Notifications
  emailAlerts: boolean;
  securityAlerts: boolean;
  systemAlerts: boolean;
  userReportAlerts: boolean;
  // Security
  sessionTimeout: "30m" | "1h" | "4h" | "8h" | "never";
  requireConfirmDestructive: boolean;
  logAdminActions: boolean;
  // Platform
  maintenanceMode: boolean;
  registrationOpen: boolean;
  allowGuestView: boolean;
  maxGamesPerUser: number;
}

const DEFAULT_SETTINGS: AdminSettingsState = {
  compactSidebar: false,
  showAnimations: true,
  emailAlerts: true,
  securityAlerts: true,
  systemAlerts: true,
  userReportAlerts: true,
  sessionTimeout: "4h",
  requireConfirmDestructive: true,
  logAdminActions: true,
  maintenanceMode: false,
  registrationOpen: true,
  allowGuestView: true,
  maxGamesPerUser: 500,
};

const STORAGE_KEY = "admin-settings-v1";

function loadSettings(): AdminSettingsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(s: AdminSettingsState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

/* ─── Sub-Components ─── */
function Toggle({
  enabled,
  onChange,
  disabled,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
        enabled ? "bg-teal-500" : "bg-gray-300 dark:bg-gray-600"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          enabled ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function SettingRow({
  label,
  helper,
  children,
  last,
  warn,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
  last?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-4 ${
        !last ? "border-b border-gray-100 dark:border-gray-800" : ""
      }`}
    >
      <div className="min-w-0">
        <div
          className={`text-sm font-medium flex items-center gap-1.5 ${
            warn
              ? "text-amber-600 dark:text-amber-400"
              : "text-gray-900 dark:text-white"
          }`}
        >
          {warn && <AlertTriangle className="w-3.5 h-3.5" />}
          {label}
        </div>
        {helper && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {helper}
          </div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SectionCard({
  icon,
  title,
  subtitle,
  accent,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      <div className={`h-1 ${accent}`} />
      <div className="px-6 pt-5 pb-1 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          {icon}
        </div>
        <div>
          <div className="text-sm font-semibold text-gray-900 dark:text-white">
            {title}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {subtitle}
          </div>
        </div>
      </div>
      <div className="px-6 pb-4">{children}</div>
    </div>
  );
}

function Toast({
  type,
  message,
  onClose,
}: {
  type: "success" | "error";
  message: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 3200);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-xl text-sm font-semibold ${
        type === "success"
          ? "bg-emerald-500 text-white"
          : "bg-red-500 text-white"
      }`}
    >
      {type === "success" ? (
        <CheckCircle className="w-4 h-4" />
      ) : (
        <XCircle className="w-4 h-4" />
      )}
      {message}
    </div>
  );
}

/* ─── Page ─── */
export default function AdminSettings() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, checkAuth } = useAdminStore();
  const { isDarkMode, toggleTheme } = useThemeStore();

  const [settings, setSettings] = useState<AdminSettingsState>(loadSettings);
  const [saved, setSaved] = useState<AdminSettingsState>(loadSettings);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [maintainConfirm, setMaintainConfirm] = useState(false);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [isAuthenticated, isLoading, navigate]);

  const isDirty = JSON.stringify(settings) !== JSON.stringify(saved);

  const update = <K extends keyof AdminSettingsState>(
    key: K,
    value: AdminSettingsState[K],
  ) => {
    setSettings((s) => ({ ...s, [key]: value }));
  };

  const handleSave = () => {
    saveSettings(settings);
    setSaved({ ...settings });
    setToast({ type: "success", message: "Settings saved successfully!" });
  };

  const handleReset = () => {
    setSettings({ ...saved });
    setToast({ type: "success", message: "Changes discarded." });
  };

  const handleMaintenanceToggle = (v: boolean) => {
    if (v && !maintainConfirm) {
      setMaintainConfirm(true);
      return;
    }
    update("maintenanceMode", v);
    setMaintainConfirm(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 text-gray-900 dark:text-white">
      <AdminSidebar />

      <main className="ml-72 min-h-screen">
        {/* Sticky Header */}
        <div className="sticky top-0 z-30 backdrop-blur-xl bg-[#f5f5f7]/80 dark:bg-gray-950/80 border-b border-gray-200/50 dark:border-gray-800/50">
          <div className="px-8 py-5 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-3">
                <Settings className="w-7 h-7 text-teal-500" />
                Admin Settings
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Configure platform behaviour and admin preferences
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleReset}
                disabled={!isDirty}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
              <button
                onClick={handleSave}
                disabled={!isDirty}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all shadow-lg ${
                  isDirty
                    ? "bg-teal-600 hover:bg-teal-500 text-white shadow-teal-900/25"
                    : "bg-gray-300 dark:bg-gray-800 text-gray-500 cursor-not-allowed shadow-none"
                }`}
              >
                <Save className="w-4 h-4" />
                Save Changes
              </button>
            </div>
          </div>
        </div>

        <div className="px-8 py-8">
          <div className="max-w-4xl space-y-6">
            {/* ─── Appearance ─── */}
            <SectionCard
              icon={<Monitor className="w-4.5 h-4.5 text-purple-500" />}
              title="Appearance"
              subtitle="Visual preferences for the admin panel"
              accent="bg-gradient-to-r from-purple-500 to-violet-500"
            >
              <SettingRow
                label="Dark Mode"
                helper="Toggle between dark and light admin interface"
              >
                <button
                  onClick={toggleTheme}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
                >
                  {isDarkMode ? (
                    <>
                      <Sun className="w-4 h-4 text-amber-500" />
                      Light Mode
                    </>
                  ) : (
                    <>
                      <Moon className="w-4 h-4 text-blue-500" />
                      Dark Mode
                    </>
                  )}
                </button>
              </SettingRow>

              <SettingRow
                label="Show Animations"
                helper="Enable transitions and micro-animations"
              >
                <Toggle
                  enabled={settings.showAnimations}
                  onChange={(v) => update("showAnimations", v)}
                />
              </SettingRow>

              <SettingRow
                label="Compact Sidebar"
                helper="Show icon-only sidebar navigation"
                last
              >
                <Toggle
                  enabled={settings.compactSidebar}
                  onChange={(v) => update("compactSidebar", v)}
                />
              </SettingRow>
            </SectionCard>

            {/* ─── Notifications ─── */}
            <SectionCard
              icon={<Bell className="w-4.5 h-4.5 text-amber-500" />}
              title="Notifications"
              subtitle="Control which alerts you receive"
              accent="bg-gradient-to-r from-amber-500 to-orange-500"
            >
              <SettingRow
                label="Email Alerts"
                helper="Receive platform summary emails"
              >
                <Toggle
                  enabled={settings.emailAlerts}
                  onChange={(v) => update("emailAlerts", v)}
                />
              </SettingRow>

              <SettingRow
                label="Security Alerts"
                helper="Notify on suspicious logins or activities"
              >
                <Toggle
                  enabled={settings.securityAlerts}
                  onChange={(v) => update("securityAlerts", v)}
                />
              </SettingRow>

              <SettingRow
                label="System Alerts"
                helper="Database, API, and server error notifications"
              >
                <Toggle
                  enabled={settings.systemAlerts}
                  onChange={(v) => update("systemAlerts", v)}
                />
              </SettingRow>

              <SettingRow
                label="User Reports"
                helper="Get notified when users submit reports"
                last
              >
                <Toggle
                  enabled={settings.userReportAlerts}
                  onChange={(v) => update("userReportAlerts", v)}
                />
              </SettingRow>
            </SectionCard>

            {/* ─── Security ─── */}
            <SectionCard
              icon={<Lock className="w-4.5 h-4.5 text-red-500" />}
              title="Security"
              subtitle="Admin session and access controls"
              accent="bg-gradient-to-r from-red-500 to-rose-500"
            >
              <SettingRow
                label="Session Timeout"
                helper="Automatically log out after inactivity"
              >
                <select
                  value={settings.sessionTimeout}
                  onChange={(e) =>
                    update(
                      "sessionTimeout",
                      e.target.value as AdminSettingsState["sessionTimeout"],
                    )
                  }
                  className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition-all"
                >
                  <option value="30m">30 Minutes</option>
                  <option value="1h">1 Hour</option>
                  <option value="4h">4 Hours</option>
                  <option value="8h">8 Hours</option>
                  <option value="never">Never</option>
                </select>
              </SettingRow>

              <SettingRow
                label="Confirm Destructive Actions"
                helper="Require confirmation before deleting or banning"
              >
                <Toggle
                  enabled={settings.requireConfirmDestructive}
                  onChange={(v) => update("requireConfirmDestructive", v)}
                />
              </SettingRow>

              <SettingRow
                label="Log Admin Actions"
                helper="Record all admin operations in the audit log"
                last
              >
                <Toggle
                  enabled={settings.logAdminActions}
                  onChange={(v) => update("logAdminActions", v)}
                />
              </SettingRow>
            </SectionCard>

            {/* ─── Platform ─── */}
            <SectionCard
              icon={<Globe className="w-4.5 h-4.5 text-teal-500" />}
              title="Platform"
              subtitle="Global platform configuration"
              accent="bg-gradient-to-r from-teal-500 to-emerald-500"
            >
              <SettingRow
                label="Maintenance Mode"
                helper="Takes the platform offline for users"
                warn={settings.maintenanceMode}
              >
                <div className="flex items-center gap-2">
                  {maintainConfirm && !settings.maintenanceMode && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                        Sure?
                      </span>
                      <button
                        onClick={() => {
                          update("maintenanceMode", true);
                          setMaintainConfirm(false);
                        }}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500 text-white hover:bg-amber-600"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setMaintainConfirm(false)}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                      >
                        No
                      </button>
                    </div>
                  )}
                  {!maintainConfirm && (
                    <Toggle
                      enabled={settings.maintenanceMode}
                      onChange={handleMaintenanceToggle}
                    />
                  )}
                </div>
              </SettingRow>

              <SettingRow
                label="Open Registration"
                helper="Allow new users to create accounts"
              >
                <Toggle
                  enabled={settings.registrationOpen}
                  onChange={(v) => update("registrationOpen", v)}
                />
              </SettingRow>

              <SettingRow
                label="Guest View Access"
                helper="Let non-logged-in users browse public content"
              >
                <Toggle
                  enabled={settings.allowGuestView}
                  onChange={(v) => update("allowGuestView", v)}
                />
              </SettingRow>

              <SettingRow
                label="Max Games per User"
                helper="History entries retained per user account"
                last
              >
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={50}
                    max={5000}
                    step={50}
                    value={settings.maxGamesPerUser}
                    onChange={(e) =>
                      update(
                        "maxGamesPerUser",
                        Math.max(50, Math.min(5000, Number(e.target.value))),
                      )
                    }
                    className="w-24 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-1.5 text-sm font-medium text-center focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition-all"
                  />
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    games
                  </span>
                </div>
              </SettingRow>
            </SectionCard>

            {/* ─── Performance ─── */}
            <SectionCard
              icon={<Zap className="w-4.5 h-4.5 text-yellow-500" />}
              title="Performance"
              subtitle="Caching and data management"
              accent="bg-gradient-to-r from-yellow-400 to-amber-500"
            >
              <SettingRow
                label="Clear Cache"
                helper="Remove locally cached admin data"
                last
              >
                <button
                  onClick={() => {
                    try {
                      const keys = Object.keys(localStorage).filter(
                        (k) => k.startsWith("admin-") && k !== "admin-storage",
                      );
                      keys.forEach((k) => localStorage.removeItem(k));
                      setToast({ type: "success", message: "Cache cleared." });
                    } catch {
                      setToast({
                        type: "error",
                        message: "Failed to clear cache.",
                      });
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
                >
                  <Database className="w-4 h-4" />
                  Clear Cache
                </button>
              </SettingRow>
            </SectionCard>
          </div>
        </div>
      </main>

      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
