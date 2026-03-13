import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shield,
  Mail,
  User,
  Key,
  Loader2,
  CheckCircle,
  XCircle,
  Users,
  Gamepad2,
  TrendingUp,
  Calendar,
  Eye,
  EyeOff,
  Save,
} from "lucide-react";
import AdminSidebar from "../../components/AdminSidebar";
import { useAdminStore } from "../../store/adminStore";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface Stats {
  totalUsers: number;
  totalGames: number;
  newUsersThisWeek: number;
  gamesThisWeek: number;
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
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 flex items-center gap-4">
      <div
        className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}
      >
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900 dark:text-white">
          {typeof value === "number" ? value.toLocaleString() : value}
        </div>
        <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
          {label}
        </div>
        {sub && (
          <div className="text-xs text-teal-600 dark:text-teal-400 mt-0.5">
            {sub}
          </div>
        )}
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
    const t = setTimeout(onClose, 3200);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-xl text-sm font-semibold transition-all ${
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

export default function AdminProfile() {
  const navigate = useNavigate();
  const { admin, isAuthenticated, isLoading, checkAuth } = useAdminStore();

  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Password change state
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
    checkAuth();
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
      .then((r) => r.json())
      .then((d) => setStats(d))
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      </div>
    );
  }

  const initials = admin?.username
    ? admin.username.slice(0, 2).toUpperCase()
    : "AD";

  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 text-gray-900 dark:text-white">
      <AdminSidebar />

      <main className="ml-72 p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <User className="w-7 h-7 text-teal-500" />
            Admin Profile
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Your account information and platform overview
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* ── Left Column ── */}
          <div className="xl:col-span-1 space-y-6">
            {/* Profile Card */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
              {/* Banner */}
              <div className="h-24 bg-gradient-to-r from-teal-500 via-emerald-500 to-cyan-500" />

              <div className="px-6 pb-6 -mt-10">
                {/* Avatar */}
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-lg ring-4 ring-white dark:ring-gray-900">
                  <Shield className="w-9 h-9 text-white" />
                </div>

                <div className="mt-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                      {admin?.username || "Admin"}
                    </h2>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/25">
                      <Shield className="w-3 h-3" />
                      Administrator
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {admin?.email || "—"}
                  </p>
                </div>
              </div>
            </div>

            {/* Account Info */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm uppercase tracking-wider">
                Account Details
              </h3>

              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-teal-500/10 flex items-center justify-center">
                    <User className="w-4 h-4 text-teal-500" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Username
                    </div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">
                      {admin?.username || "—"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Mail className="w-4 h-4 text-blue-500" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Email
                    </div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">
                      {admin?.email || "—"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <Shield className="w-4 h-4 text-purple-500" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Role
                    </div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">
                      Super Admin
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <Calendar className="w-4 h-4 text-amber-500" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Admin ID
                    </div>
                    <div className="text-sm font-semibold font-mono text-gray-900 dark:text-white truncate max-w-[160px]">
                      {admin?.id || "—"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Right Column ── */}
          <div className="xl:col-span-2 space-y-6">
            {/* Platform Stats */}
            <div>
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Platform Overview
              </h3>
              {statsLoading ? (
                <div className="grid grid-cols-2 gap-4">
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 h-20 animate-pulse"
                    />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <StatCard
                    icon={<Users className="w-6 h-6 text-white" />}
                    label="Total Users"
                    value={stats?.totalUsers ?? 0}
                    sub={`+${stats?.newUsersThisWeek ?? 0} this week`}
                    color="bg-teal-500"
                  />
                  <StatCard
                    icon={<Gamepad2 className="w-6 h-6 text-white" />}
                    label="Total Games"
                    value={stats?.totalGames ?? 0}
                    sub={`+${stats?.gamesThisWeek ?? 0} this week`}
                    color="bg-blue-500"
                  />
                  <StatCard
                    icon={<TrendingUp className="w-6 h-6 text-white" />}
                    label="New Users (7d)"
                    value={stats?.newUsersThisWeek ?? 0}
                    color="bg-emerald-500"
                  />
                  <StatCard
                    icon={<Calendar className="w-6 h-6 text-white" />}
                    label="Games This Week"
                    value={stats?.gamesThisWeek ?? 0}
                    color="bg-purple-500"
                  />
                </div>
              )}
            </div>

            {/* Security */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center">
                    <Key className="w-4.5 h-4.5 text-red-500" />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white text-sm">
                      Security
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Manage your credentials
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setPwOpen((o) => !o)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
                >
                  <Key className="w-3.5 h-3.5" />
                  Change Password
                </button>
              </div>

              {pwOpen && (
                <div className="px-6 py-5 space-y-4">
                  {(["current", "next", "confirm"] as const).map((field) => {
                    const labels = {
                      current: "Current Password",
                      next: "New Password",
                      confirm: "Confirm New Password",
                    };
                    return (
                      <div key={field}>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                          {labels[field]}
                        </label>
                        <div className="relative">
                          <input
                            type={showPw[field] ? "text" : "password"}
                            value={pwFields[field]}
                            onChange={(e) =>
                              setPwFields((p) => ({
                                ...p,
                                [field]: e.target.value,
                              }))
                            }
                            className="w-full bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 transition-all"
                            placeholder={`Enter ${labels[field].toLowerCase()}`}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setShowPw((p) => ({ ...p, [field]: !p[field] }))
                            }
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                          >
                            {showPw[field] ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  <div className="flex items-center gap-3 pt-1">
                    <button
                      onClick={handlePasswordChange}
                      disabled={pwSaving}
                      className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-500 text-white shadow-lg shadow-teal-900/20 disabled:opacity-60 transition-all"
                    >
                      {pwSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Update Password
                    </button>
                    <button
                      onClick={() => {
                        setPwOpen(false);
                        setPwFields({ current: "", next: "", confirm: "" });
                      }}
                      className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {!pwOpen && (
                <div className="px-6 py-4">
                  <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      Password is set
                    </span>
                    <span>·</span>
                    <span>Last change: this session</span>
                  </div>
                </div>
              )}
            </div>

            {/* Session Info */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-4 flex items-center gap-2">
                <Eye className="w-4 h-4 text-gray-400" />
                Active Session
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: "Status", value: "Active", dot: "bg-emerald-400" },
                  { label: "Auth Method", value: "Cookie Session", dot: null },
                  {
                    label: "Permissions",
                    value: "Full Access",
                    dot: null,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="bg-gray-50 dark:bg-gray-800/60 rounded-xl px-4 py-3"
                  >
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      {item.label}
                    </div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                      {item.dot && (
                        <span className={`w-2 h-2 rounded-full ${item.dot}`} />
                      )}
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
