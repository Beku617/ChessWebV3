import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation, Trans } from "react-i18next";
import {
  CheckCircle,
  Eye,
  EyeOff,
  Key,
  Loader2,
  Save,
  XCircle,
} from "lucide-react";
import AdminSidebar from "../../components/AdminSidebar";
import { adminSupportedLanguages, setAdminLocale } from "../../adminI18n";
import { SegmentedControl } from "../../components/settings";
import { ProfileAvatarUpload } from "../../components/profilePage/ProfileAvatarUpload";
import { useAdminStore } from "../../store/adminStore";

const API_URL = import.meta.env.VITE_API_URL;

interface Stats {
  totalUsers: number;
  totalGames: number;
  newUsersThisWeek: number;
  gamesThisWeek: number;
}

const PASSWORD_FIELD_KEYS = ["current", "next", "confirm"] as const;

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-theme-glass/80 bg-theme-panel/95 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-theme-muted">
            {label}
          </div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-theme-foreground ">
            {typeof value === "number" ? value.toLocaleString() : value}
          </div>
          {sub ? (
            <div className="mt-2 text-sm font-medium text-brand-600">
              {sub}
            </div>
          ) : null}
        </div>
      </div>
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
    const timer = window.setTimeout(onClose, 3200);
    return () => window.clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-5 py-3.5 text-sm font-semibold text-theme-on-accent shadow-xl ${
        type === "success" ? "bg-brand-500" : "bg-red-500"
      }`}
    >
      {type === "success" ? (
        <CheckCircle className="h-4 w-4" />
      ) : (
        <XCircle className="h-4 w-4" />
      )}
      {message}
    </div>
  );
}

export default function AdminProfile() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { admin, isAuthenticated, isLoading, checkAuth, setAdmin } = useAdminStore();
  const activeLocale =
    (i18n.resolvedLanguage || i18n.language || "en").startsWith("mn")
      ? "mn"
      : "en";

  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwFields, setPwFields] = useState({
    current: "",
    next: "",
    confirm: "",
  });
  const [showPw, setShowPw] = useState({
    current: false,
    next: false,
    confirm: false,
  });
  const [pwSaving, setPwSaving] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [isAuthenticated, isLoading, navigate]);

  useEffect(() => {
    if (!isAuthenticated) return;
    setStatsLoading(true);
    fetch(`${API_URL}/api/admin/stats`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load admin stats");
        }
        return response.json();
      })
      .then((data) => setStats(data))
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false));
  }, [isAuthenticated]);

  const handlePersistAvatar = async (avatar: string) => {
    const response = await fetch(`${API_URL}/api/admin/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ avatar }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Failed to update profile picture");
    }
    if (data?.admin) {
      setAdmin(data.admin);
      return data.admin.avatar || "";
    }
    return avatar;
  };

  const handlePasswordChange = async () => {
    if (!pwFields.current || !pwFields.next || !pwFields.confirm) {
      setToast({ type: "error", message: "Please fill in all fields." });
      return;
    }
    if (pwFields.next.length < 6) {
      setToast({
        type: "error",
        message: "New password must be at least 6 characters.",
      });
      return;
    }
    if (pwFields.next !== pwFields.confirm) {
      setToast({ type: "error", message: "New passwords do not match." });
      return;
    }

    setPwSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          currentPassword: pwFields.current,
          newPassword: pwFields.next,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to change password");
      }
      setToast({ type: "success", message: "Password changed successfully!" });
      setPwFields({ current: "", next: "", confirm: "" });
      setPwOpen(false);
    } catch (err) {
      setToast({
        type: "error",
        message:
          err instanceof Error ? err.message : "Failed to change password",
      });
    } finally {
      setPwSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-theme-panel ">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-panel text-theme-foreground transition-colors duration-300">
      <AdminSidebar />

      <main className="ml-72 px-6 py-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="relative overflow-hidden rounded-2xl border border-theme-glass/70 bg-gradient-to-br from-theme-panel via-theme-surface to-theme-base p-4 shadow-[0_12px_35px_rgba(15,23,42,0.08)] lg:p-5">
            <div className="pointer-events-none absolute -left-12 -top-20 h-64 w-64 rounded-full bg-brand-400/15 blur-3xl" />
            <div className="relative z-10 flex flex-col gap-5 xl:flex-row xl:items-start">
              <div className="flex-shrink-0">
                <ProfileAvatarUpload
                  currentAvatar={admin?.avatar}
                  userName={
                    admin?.username ||
                    t("admin.profile.fallback.administrator", "Administrator")
                  }
                  size="xl"
                  editable={true}
                  onPersistAvatar={handlePersistAvatar}
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="min-w-0">
                  <h1 className="text-3xl font-bold tracking-tight text-theme-foreground ">
                    {admin?.username ||
                      t("admin.profile.fallback.administrator", "Administrator")}
                  </h1>
                  <p className="mt-1 text-sm text-theme-muted">
                    {admin?.email ||
                      t("admin.profile.fallback.noEmail", "No email available")}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <div className="space-y-6">
            <section className="rounded-2xl border border-theme-glass/80 bg-theme-panel/95 p-5 shadow-[0_14px_38px_rgba(15,23,42,0.08)]">
              {statsLoading ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {[...Array(4)].map((_, index) => (
                    <div
                      key={index}
                      className="h-32 animate-pulse rounded-2xl border border-theme-glass/80 bg-theme-panel/90"
                    />
                  ))}
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <StatCard
                    label={t("admin.profile.stats.totalUsers", "Total Users")}
                    value={stats?.totalUsers ?? 0}
                    sub={t("admin.profile.stats.thisWeekDelta", {
                      defaultValue: "+{{count}} this week",
                      count: stats?.newUsersThisWeek ?? 0,
                    })}
                  />
                  <StatCard
                    label={t("admin.profile.stats.totalGames", "Total Games")}
                    value={stats?.totalGames ?? 0}
                    sub={t("admin.profile.stats.thisWeekDelta", {
                      defaultValue: "+{{count}} this week",
                      count: stats?.gamesThisWeek ?? 0,
                    })}
                  />
                  <StatCard
                    label={t("admin.profile.stats.newUsers7d", "New Users (7d)")}
                    value={stats?.newUsersThisWeek ?? 0}
                  />
                  <StatCard
                    label={t("admin.profile.stats.gamesThisWeek", "Games This Week")}
                    value={stats?.gamesThisWeek ?? 0}
                  />
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-theme-glass/80 bg-theme-panel/95 shadow-[0_14px_38px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between border-b border-theme-glass/70 px-6 py-5 ">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-500/10">
                    <Key className="h-5 w-5 text-red-500" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-theme-foreground "> <Trans>Credential Security</Trans> </div>
                    <div className="text-xs text-theme-muted"> <Trans>Manage the current admin password.</Trans> </div>
                  </div>
                </div>
                <button
                  onClick={() => setPwOpen((open) => !open)}
                  className="inline-flex items-center gap-2 rounded-xl bg-theme-surface px-4 py-2 text-sm font-semibold text-theme-muted transition-colors hover:bg-theme-surface/80"
                >
                  <Key className="h-4 w-4" />
                  {pwOpen
                    ? t("admin.profile.actions.close", "Close")
                    : t("admin.profile.actions.changePassword", "Change Password")}
                </button>
              </div>

              {pwOpen ? (
                <div className="space-y-4 px-6 py-5">
                  {PASSWORD_FIELD_KEYS.map((field) => {
                    const labels = {
                      current: t("admin.profile.password.current", "Current Password"),
                      next: t("admin.profile.password.new", "New Password"),
                      confirm: t("admin.profile.password.confirm", "Confirm New Password"),
                    };

                    return (
                      <div key={field}>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.2em] text-theme-muted">
                          {labels[field]}
                        </label>
                        <div className="relative">
                          <input
                            type={showPw[field] ? "text" : "password"}
                            value={pwFields[field]}
                            onChange={(event) =>
                              setPwFields((current) => ({
                                ...current,
                                [field]: event.target.value,
                              }))
                            }
                            className="w-full rounded-2xl border border-theme-glass bg-theme-surface px-4 py-3 pr-11 text-sm text-theme-foreground outline-none transition-all focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 "
                            placeholder={`Enter ${labels[field].toLowerCase()}`}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setShowPw((current) => ({
                                ...current,
                                [field]: !current[field],
                              }))
                            }
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted transition-colors hover:text-theme-muted"
                          >
                            {showPw[field] ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      onClick={handlePasswordChange}
                      disabled={pwSaving}
                      className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-theme-on-accent shadow-[0_14px_34px_rgba(13,148,136,0.24)] transition-colors hover:bg-brand-500 disabled:opacity-60"
                    >
                      {pwSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )} <Trans>Update Password</Trans> </button>
                    <button
                      onClick={() => {
                        setPwOpen(false);
                        setPwFields({ current: "", next: "", confirm: "" });
                      }}
                      className="rounded-xl px-4 py-2.5 text-sm font-semibold text-theme-muted transition-colors hover:bg-theme-surface"
                    > <Trans>Cancel</Trans> </button>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col gap-3 border-t border-theme-glass/70 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-theme-foreground ">
                    {t("admin.sidebar.languageLabel")}
                  </div>
                  <div className="text-xs text-theme-muted"> <Trans>Admin interface language</Trans> </div>
                </div>
                <SegmentedControl
                  options={adminSupportedLanguages.map((lang) => ({
                    label: t(`admin.sidebar.localeOption.${lang.code}`),
                    value: lang.code,
                  }))}
                  value={activeLocale}
                  onChange={(value) => {
                    void setAdminLocale(value);
                  }}
                />
              </div>
            </section>
          </div>
        </div>
      </main>

      {toast ? (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      ) : null}
    </div>
  );
}
