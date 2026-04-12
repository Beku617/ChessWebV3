import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, User, ArrowRight, Github, Sun, Moon } from "lucide-react";
import { useAuthStore, authApi } from "../store/authStore";
import { useThemeStore } from "../store/themeStore";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../components/LanguageSwitcher";

export default function Register() {
  const navigate = useNavigate();
  const { setUser, setError } = useAuthStore();
  const { isDarkMode, toggleTheme } = useThemeStore();
  const { t } = useTranslation();
  const logoSrc = isDarkMode ? "/images/Logo.png" : "/images/LightModeLogo.png";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setLocalError] = useState("");

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLocalError("");

    try {
      const data = await authApi.register(name, email, password);
      setUser(data.user);
      navigate("/");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t("auth.registrationFailed", "Registration failed");
      setLocalError(message);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 flex items-center justify-center p-4 transition-colors duration-300">
      {/* Theme Toggle - Top Right */}
      <div className="fixed top-4 inset-x-4 flex items-center justify-between z-[60] gap-3">
        <LanguageSwitcher compact className="shadow-lg z-[60]" />
        <button
          onClick={toggleTheme}
          aria-label={t("common.toggleTheme", "Toggle theme")}
          className="p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg hover:scale-105 transition-transform"
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
            {t("auth.createAccount", "Create Account")}
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            {t("auth.registerSubtitle", "Join the community of chess masters")}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {t("auth.fullName", "Full Name")}
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white pl-10 pr-4 py-3 rounded-xl focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
                placeholder={t("auth.namePlaceholder", "John Doe")}
                required
                disabled={isLoading}
              />
            </div>
          </div>

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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {t("auth.password", "Password")}
            </label>
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
                minLength={6}
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {t("auth.minimumChars", "Minimum 6 characters")}
            </p>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-brand-600 hover:bg-brand-500 disabled:bg-brand-800 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-brand-900/20 flex items-center justify-center space-x-2 hover:scale-[1.02] active:scale-[0.98] mt-2"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>{t("auth.createAccount", "Create Account")}</span>
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
                {t("auth.orSignup", "Or sign up with")}
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
          {t("auth.haveAccount", "Already have an account?")}{" "}
          <Link
            to="/login"
            className="font-bold text-brand-600 dark:text-brand-500 hover:underline"
          >
            {t("auth.signInCta", "Sign in")}
          </Link>
        </p>
      </div>
    </div>
  );
}

