import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { ProfileAvatarUpload } from "../../components/profilePage/ProfileAvatarUpload";
import { useAdminStore } from "../../store/adminStore";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface Stats {
  totalUsers: number;
  totalGames: number;
  newUsersThisWeek: number;
  gamesThisWeek: number;
}

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
    <div className="rounded-2xl border border-gray-200/80 bg-white/95 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-900/90">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500 dark:text-gray-400">
            {label}
          </div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            {typeof value === "number" ? value.toLocaleString() : value}
          </div>
          {sub ? (
            <div className="mt-2 text-sm font-medium text-brand-600 dark:text-brand-400">
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
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-5 py-3.5 text-sm font-semibold text-white shadow-xl ${
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
  const { admin, isAuthenticated, isLoading, checkAuth, setAdmin } = useAdminStore();

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
      <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7] dark:bg-gray-950">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-gray-900 dark:bg-gray-950 dark:text-white transition-colors duration-300">
      <AdminSidebar />

      <main className="ml-72 px-6 py-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="relative overflow-hidden rounded-2xl border border-gray-200/70 bg-gradient-to-br from-white via-gray-50 to-slate-100 p-4 shadow-[0_12px_35px_rgba(15,23,42,0.08)] dark:border-white/10 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 dark:shadow-[0_22px_48px_rgba(0,0,0,0.5)] lg:p-5">
            <div className="pointer-events-none absolute -left-12 -top-20 h-64 w-64 rounded-full bg-brand-400/15 blur-3xl" />
            <div className="relative z-10 flex flex-col gap-5 xl:flex-row xl:items-start">
              <div className="flex-shrink-0">
                <ProfileAvatarUpload
                  currentAvatar={admin?.avatar}
                  userName={admin?.username || "Administrator"}
                  size="xl"
                  editable={true}
                  onPersistAvatar={handlePersistAvatar}
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="min-w-0">
                  <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                    {admin?.username || "Administrator"}
                  </h1>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    {admin?.email || "No email available"}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <div className="space-y-6">
            <section className="rounded-2xl border border-gray-200/80 bg-white/95 p-5 shadow-[0_14px_38px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-900/90">
              {statsLoading ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {[...Array(4)].map((_, index) => (
                    <div
                      key={index}
                      className="h-32 animate-pulse rounded-2xl border border-gray-200/80 bg-white/90 dark:border-white/10 dark:bg-white/[0.03]"
                    />
                  ))}
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <StatCard
                    label="Total Users"
                    value={stats?.totalUsers ?? 0}
                    sub={`+${stats?.newUsersThisWeek ?? 0} this week`}
                  />
                  <StatCard
                    label="Total Games"
                    value={stats?.totalGames ?? 0}
                    sub={`+${stats?.gamesThisWeek ?? 0} this week`}
                  />
                  <StatCard
                    label="New Users (7d)"
                    value={stats?.newUsersThisWeek ?? 0}
                  />
                  <StatCard
                    label="Games This Week"
                    value={stats?.gamesThisWeek ?? 0}
                  />
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-gray-200/80 bg-white/95 shadow-[0_14px_38px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-900/90">
              <div className="flex items-center justify-between border-b border-gray-200/70 px-6 py-5 dark:border-white/10">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-500/10">
                    <Key className="h-5 w-5 text-red-500" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">
                      Credential Security
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Manage the current admin password.
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setPwOpen((open) => !open)}
                  className="inline-flex items-center gap-2 rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/20"
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
                            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 pr-11 text-sm text-gray-900 outline-none transition-all focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-white"
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
                      className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white shadow-[0_14px_34px_rgba(13,148,136,0.24)] transition-colors hover:bg-brand-500 disabled:opacity-60"
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
                      className="rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
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
