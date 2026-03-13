import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  Calendar,
  CheckCircle,
  Eye,
  EyeOff,
  Gamepad2,
  Key,
  Loader2,
  Mail,
  Save,
  Shield,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  User,
  Users,
  XCircle,
} from "lucide-react";
import AdminSidebar from "../../components/AdminSidebar";
import { useAdminStore } from "../../store/adminStore";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const SESSION_STORAGE_KEY = "neongambit-admin-session-start";

interface Stats {
  totalUsers: number;
  totalGames: number;
  newUsersThisWeek: number;
  gamesThisWeek: number;
}

function formatDateLabel(
  value?: string,
  options?: Intl.DateTimeFormatOptions,
  fallback = "Unavailable",
) {
  if (!value) return fallback;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return fallback;
  return date.toLocaleDateString("en-US", options);
}

function formatDateTimeLabel(value?: string, fallback = "Unavailable") {
  if (!value) return fallback;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return fallback;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white/95 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)] dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500 dark:text-gray-400">
            {label}
          </div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            {typeof value === "number" ? value.toLocaleString() : value}
          </div>
          {sub ? (
            <div className="mt-2 text-sm font-medium text-teal-600 dark:text-teal-400">
              {sub}
            </div>
          ) : null}
        </div>
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-lg ${color}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function InfoTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200/70 bg-white/90 px-4 py-3 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
        {icon}
        {label}
      </div>
      <div className="text-sm font-semibold text-gray-900 dark:text-white">
        {value}
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
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-5 py-3.5 text-sm font-semibold text-white shadow-xl ${
        type === "success" ? "bg-emerald-500" : "bg-red-500"
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
  const { admin, isAuthenticated, isLoading, checkAuth } = useAdminStore();

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
  const [sessionStartedAt] = useState(() => {
    if (typeof window === "undefined") return new Date().toISOString();
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const now = new Date().toISOString();
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, now);
    return now;
  });

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

  const adminHighlights = useMemo(
    () => [
      {
        label: "Account Created",
        value: formatDateLabel(
          admin?.createdAt,
          { month: "long", day: "numeric", year: "numeric" },
          "Unknown",
        ),
        icon: <Calendar className="h-3.5 w-3.5 text-teal-500" />,
      },
      {
        label: "Last Updated",
        value: formatDateTimeLabel(admin?.updatedAt, "Unknown"),
        icon: <Activity className="h-3.5 w-3.5 text-blue-500" />,
      },
      {
        label: "Puzzle Elo",
        value: String(admin?.puzzleElo ?? 0),
        icon: <Sparkles className="h-3.5 w-3.5 text-amber-500" />,
      },
    ],
    [admin?.createdAt, admin?.puzzleElo, admin?.updatedAt],
  );

  const sessionDetails = useMemo(
    () => [
      {
        label: "Session Status",
        value: isAuthenticated ? "Active" : "Signed out",
        icon: <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />,
      },
      {
        label: "Session Started",
        value: formatDateTimeLabel(sessionStartedAt, "This session"),
        icon: <Calendar className="h-3.5 w-3.5 text-purple-500" />,
      },
      {
        label: "Access Layer",
        value: "Cookie session",
        icon: <Shield className="h-3.5 w-3.5 text-cyan-500" />,
      },
      {
        label: "Permissions",
        value: "Administrator",
        icon: <Key className="h-3.5 w-3.5 text-amber-500" />,
      },
    ],
    [isAuthenticated, sessionStartedAt],
  );

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7] dark:bg-gray-950">
        <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-gray-900 dark:bg-gray-950 dark:text-white">
      <AdminSidebar />

      <main className="ml-72 px-8 py-8">
        <div className="mx-auto max-w-7xl space-y-8">
          <section className="relative overflow-hidden rounded-[32px] border border-gray-200/80 bg-[radial-gradient(circle_at_top_left,_rgba(45,212,191,0.18),_transparent_38%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(241,245,249,0.96))] p-7 shadow-[0_20px_55px_rgba(15,23,42,0.1)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_top_left,_rgba(45,212,191,0.16),_transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,8,23,0.92))] dark:shadow-[0_28px_70px_rgba(0,0,0,0.35)]">
            <div className="pointer-events-none absolute right-0 top-0 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl dark:bg-cyan-400/12" />
            <div className="relative z-10 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-teal-500/20 bg-teal-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
                  <Shield className="h-3.5 w-3.5" />
                  Control Center Identity
                </div>
                <div className="mt-5 flex items-center gap-4">
                  <div className="flex h-20 w-20 items-center justify-center rounded-[24px] bg-gradient-to-br from-teal-500 via-emerald-500 to-cyan-500 text-white shadow-[0_18px_45px_rgba(13,148,136,0.28)]">
                    <Shield className="h-10 w-10" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                      {admin?.username || "Administrator"}
                    </h1>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                      {admin?.email || "No email available"}
                    </p>
                    <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-gray-900/5 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-white/10 dark:text-gray-300">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                      Authenticated administrator session
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 md:grid-cols-3">
                  {adminHighlights.map((item) => (
                    <InfoTile
                      key={item.label}
                      label={item.label}
                      value={item.value}
                      icon={item.icon}
                    />
                  ))}
                </div>
              </div>

              <div className="rounded-[28px] border border-gray-200/80 bg-white/92 p-5 shadow-[0_14px_34px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/[0.04]">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">
                  Profile Snapshot
                </div>
                <div className="mt-4 space-y-4">
                  <div className="rounded-2xl bg-gray-100/90 px-4 py-3 dark:bg-white/[0.04]">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
                      Admin ID
                    </div>
                    <div className="mt-2 truncate font-mono text-sm font-semibold text-gray-900 dark:text-white">
                      {admin?.id || "Unavailable"}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-gray-100/90 px-4 py-3 dark:bg-white/[0.04]">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
                      Role
                    </div>
                    <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                      Platform Administrator
                    </div>
                  </div>
                  <div className="rounded-2xl bg-gray-100/90 px-4 py-3 dark:bg-white/[0.04]">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
                      Workspace
                    </div>
                    <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                      NeonGambit Admin
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-6">
              <section>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Platform Overview
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Live account and activity totals from the admin API.
                    </p>
                  </div>
                </div>

                {statsLoading ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {[...Array(4)].map((_, index) => (
                      <div
                        key={index}
                        className="h-32 animate-pulse rounded-2xl border border-gray-200/80 bg-white/90 dark:border-gray-800 dark:bg-gray-900"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <StatCard
                      icon={<Users className="h-6 w-6" />}
                      label="Total Users"
                      value={stats?.totalUsers ?? 0}
                      sub={`+${stats?.newUsersThisWeek ?? 0} this week`}
                      color="bg-teal-500"
                    />
                    <StatCard
                      icon={<Gamepad2 className="h-6 w-6" />}
                      label="Total Games"
                      value={stats?.totalGames ?? 0}
                      sub={`+${stats?.gamesThisWeek ?? 0} this week`}
                      color="bg-blue-500"
                    />
                    <StatCard
                      icon={<TrendingUp className="h-6 w-6" />}
                      label="New Users (7d)"
                      value={stats?.newUsersThisWeek ?? 0}
                      color="bg-emerald-500"
                    />
                    <StatCard
                      icon={<Sparkles className="h-6 w-6" />}
                      label="Games This Week"
                      value={stats?.gamesThisWeek ?? 0}
                      color="bg-purple-500"
                    />
                  </div>
                )}
              </section>

              <section className="rounded-[28px] border border-gray-200/80 bg-white/95 shadow-[0_14px_38px_rgba(15,23,42,0.08)] dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between border-b border-gray-200/70 px-6 py-5 dark:border-gray-800">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-500/10">
                      <Key className="h-5 w-5 text-red-500" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">
                        Credential Security
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Manage the current admin password without leaving this page.
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setPwOpen((open) => !open)}
                    className="inline-flex items-center gap-2 rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <Key className="h-4 w-4" />
                    {pwOpen ? "Close" : "Change Password"}
                  </button>
                </div>

                {pwOpen ? (
                  <div className="space-y-4 px-6 py-5">
                    {(["current", "next", "confirm"] as const).map((field) => {
                      const labels = {
                        current: "Current Password",
                        next: "New Password",
                        confirm: "Confirm New Password",
                      };

                      return (
                        <div key={field}>
                          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
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
                              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 pr-11 text-sm text-gray-900 outline-none transition-all focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-gray-700 dark:bg-gray-800/80 dark:text-white"
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
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
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
                        className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white shadow-[0_14px_34px_rgba(13,148,136,0.24)] transition-colors hover:bg-teal-500 disabled:opacity-60"
                      >
                        {pwSaving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        Update Password
                      </button>
                      <button
                        onClick={() => {
                          setPwOpen(false);
                          setPwFields({ current: "", next: "", confirm: "" });
                        }}
                        className="rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3 px-6 py-5 text-sm text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-700 dark:text-emerald-300">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      Password protection active
                    </span>
                    <span className="rounded-full bg-gray-100 px-3 py-1 dark:bg-gray-800">
                      Last profile update: {formatDateTimeLabel(admin?.updatedAt, "Unknown")}
                    </span>
                  </div>
                )}
              </section>
            </div>

            <aside className="space-y-6">
              <section className="rounded-[28px] border border-gray-200/80 bg-white/95 p-6 shadow-[0_14px_38px_rgba(15,23,42,0.08)] dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-500/10">
                    <User className="h-5 w-5 text-teal-500" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">
                      Account Details
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Live identity data from the authenticated admin session.
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  <InfoTile
                    label="Username"
                    value={admin?.username || "Unavailable"}
                    icon={<User className="h-3.5 w-3.5 text-teal-500" />}
                  />
                  <InfoTile
                    label="Email"
                    value={admin?.email || "Unavailable"}
                    icon={<Mail className="h-3.5 w-3.5 text-blue-500" />}
                  />
                  <InfoTile
                    label="Admin ID"
                    value={admin?.id || "Unavailable"}
                    icon={<Shield className="h-3.5 w-3.5 text-purple-500" />}
                  />
                </div>
              </section>

              <section className="rounded-[28px] border border-gray-200/80 bg-white/95 p-6 shadow-[0_14px_38px_rgba(15,23,42,0.08)] dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500/10">
                    <ShieldCheck className="h-5 w-5 text-indigo-500" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">
                      Active Session
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Dynamic session metadata for the current admin tab.
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-3">
                  {sessionDetails.map((item) => (
                    <InfoTile
                      key={item.label}
                      label={item.label}
                      value={item.value}
                      icon={item.icon}
                    />
                  ))}
                </div>
              </section>
            </aside>
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
