import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Mail,
  Lock,
  ArrowRight,
  Github,
  Sun,
  Moon,
  ShieldAlert,
} from "lucide-react";
import { useAuthStore, authApi } from "../store/authStore";
import { useThemeStore } from "../store/themeStore";
import { useAdminStore } from "../store/adminStore";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../components/LanguageSwitcher";

export default function Login() {
  const navigate = useNavigate();
  const { setUser, setError, banReason, setBanned } = useAuthStore();
  const { login: adminLogin } = useAdminStore();
  const { isDarkMode, toggleTheme } = useThemeStore();
  const { t } = useTranslation();
  const logoSrc = isDarkMode ? "/images/Logo.png" : "/images/LightModeLogo.png";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setLocalError] = useState("");

  // Clear ban reason after showing it
  useEffect(() => {
    if (banReason) {
      // Keep showing it, user will see it on login page
    }
  }, [banReason]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLocalError("");
    setBanned(""); // Clear any previous ban message

    try {
      // Try admin login first
      const isAdmin = await adminLogin(email, password);
      if (isAdmin) {
        navigate("/admin");
        return;
      }

      // If not admin, try regular user login
      const data = await authApi.login(email, password, rememberMe);
      setUser(data.user);
      navigate("/");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("auth.loginFailed", "Login failed");
      setLocalError(message);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen overflow-hidden bg-gradient-to-b from-[#fbfcfe] to-[#f1f4f8] dark:from-[#020617] dark:to-[#0b1220] flex items-center justify-center p-4 transition-colors duration-300">
      {/* Theme Toggle - Top Right */}
      <div className="fixed top-4 inset-x-4 flex items-center justify-between z-[60] gap-3">
        <LanguageSwitcher compact className="shrink-0 z-[60]" />
        <button
          onClick={toggleTheme}
          aria-label={t("common.toggleTheme", "Toggle theme")}
          className="shrink-0 p-3 rounded-2xl border border-gray-200/80 dark:border-slate-700/80 bg-white/88 dark:bg-slate-900/88 shadow-[0_14px_30px_rgba(15,23,42,0.08)] dark:shadow-[0_16px_30px_rgba(0,0,0,0.26)] backdrop-blur-md transition-all duration-200 hover:border-brand-300/70 dark:hover:border-brand-700/70 hover:bg-white dark:hover:bg-slate-900 hover:scale-105"
        >
          {isDarkMode ? (
            <Sun className="w-5 h-5 text-yellow-500" />
          ) : (
            <Moon className="w-5 h-5 text-gray-700" />
          )}
        </button>
      </div>

      <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-gray-800">
        <div className="text-center mb-8">
          <img
            src={logoSrc}
            alt="NeonGambit"
            className="w-36 h-36 object-contain mx-auto mb-4"
          />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {t("auth.welcomeBack", "Welcome Back")}
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            {t("auth.signInSubtitle", "Sign in to continue your chess journey")}
          </p>
        </div>

        {/* Banned notice */}
        {banReason && (
          <div className="mb-4 p-4 rounded-lg bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-800">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-semibold mb-1">
              <ShieldAlert className="w-5 h-5" />
              {t("auth.accountBannedTitle", "Account Banned")}
            </div>
            <p className="text-red-600 dark:text-red-400 text-sm">
              {t("auth.accountBannedReason", {
                defaultValue: "Your account has been banned. Reason: {{reason}}",
                reason: banReason,
              })}
            </p>
          </div>
        )}

        {error && !banReason && (
          <div className="mb-4 p-3 rounded-lg bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {t("auth.email", "Email Address")}
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white pl-10 pr-4 py-3 rounded-xl focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
                placeholder={t("auth.emailPlaceholder", "you@example.com")}
                required
                disabled={isLoading}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("auth.password", "Password")}
              </label>
              <a
                href="#"
                className="text-sm text-brand-600 dark:text-brand-500 hover:underline font-medium"
              >
                {t("auth.forgotPassword", "Forgot password?")}
              </a>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white pl-10 pr-4 py-3 rounded-xl focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
                placeholder="••••••••"
                required
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="rememberMe"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500"
            />
            <label
              htmlFor="rememberMe"
              className="ml-2 text-sm text-gray-600 dark:text-gray-400"
            >
              {t("auth.rememberMe", "Remember me for 30 days")}
            </label>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-brand-600 hover:bg-brand-500 disabled:bg-brand-800 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-brand-900/20 flex items-center justify-center space-x-2 hover:scale-[1.02] active:scale-[0.98]"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>{t("auth.signIn", "Sign In")}</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-gray-800"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white dark:bg-gray-900 text-gray-500">
                {t("auth.orContinue", "Or continue with")}
              </span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <button className="flex items-center justify-center px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <Github className="w-5 h-5 text-gray-900 dark:text-white" />
            </button>
            <button className="flex items-center justify-center px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <span className="font-bold text-xl text-gray-900 dark:text-white">
                G
              </span>
            </button>
          </div>
        </div>

        <p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
          {t("auth.noAccount", "Don't have an account?")}{" "}
          <Link
            to="/register"
            className="font-bold text-brand-600 dark:text-brand-500 hover:underline"
          >
            {t("auth.signUp", "Sign up")}
          </Link>
        </p>
      </div>
    </div>
  );
}

