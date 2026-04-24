import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, ArrowRight, Palette, ShieldAlert, Check } from "lucide-react";
import { useGoogleLogin, type TokenResponse } from "@react-oauth/google";
import FacebookLogin, {
  type SuccessResponse as FacebookSuccessResponse,
} from "@greatsumini/react-facebook-login";
import { useAuthStore, authApi } from "../store/authStore";
import { useThemeStore } from "../store/themeStore";
import { useAdminStore } from "../store/adminStore";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { useOAuthConfig } from "../hooks/useOAuthConfig";
import { ThemeWindow } from "../components/settings";

type GoogleTokenSuccess = Omit<
  TokenResponse,
  "error" | "error_description" | "error_uri"
>;

interface GoogleSignInButtonProps {
  isLoading: boolean;
  onSuccess: (tokenResponse: GoogleTokenSuccess) => void | Promise<void>;
  onError: () => void;
  label: string;
}

function GoogleSignInButton({
  isLoading,
  onSuccess,
  onError,
  label,
}: GoogleSignInButtonProps) {
  const googleLogin = useGoogleLogin({
    scope: "openid email profile",
    onSuccess: (tokenResponse) => {
      void onSuccess(tokenResponse as GoogleTokenSuccess);
    },
    onError,
  });

  return (
    <button
      type="button"
      onClick={() => googleLogin()}
      disabled={isLoading}
      className="w-full relative flex items-center py-3 px-4 rounded-xl border border-gray-200 dark:border-gray-700/80 bg-white dark:bg-gray-800/60 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200 font-medium text-sm transition-all hover:scale-[1.02] active:scale-[0.98] hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed group"
    >
      <span className="absolute left-4">
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
      </span>
      <span className="flex-1 text-center">{label}</span>
    </button>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const { setUser, setError, banReason, setBanned } = useAuthStore();
  const { login: adminLogin } = useAdminStore();
  const { isDarkMode } = useThemeStore();
  const { t } = useTranslation();
  const logoSrc = isDarkMode ? "/images/Logo.png" : "/images/LightModeLogo.png";
  const { googleClientId, facebookAppId, isLoading: isOAuthConfigLoading } =
    useOAuthConfig();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setLocalError] = useState("");
  const [themeWindowOpen, setThemeWindowOpen] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLocalError("");
    setBanned(""); // Clear any previous ban message

    try {
      // Try regular user login first to avoid unnecessary admin 401 noise.
      const data = await authApi.login(email, password, rememberMe);
      setUser(data.user);
      navigate("/");
    } catch (userLoginError) {
      const isAdmin = await adminLogin(email, password);
      if (isAdmin) {
        navigate("/admin");
        return;
      }

      const message =
        userLoginError instanceof Error
          ? userLoginError.message
          : t("auth.loginFailed", "Login failed");
      setLocalError(message);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSuccess = async (tokenResponse: GoogleTokenSuccess) => {
    if (!tokenResponse.access_token) {
      const message = t("auth.googleLoginFailed", "Google login failed");
      setLocalError(message);
      setError(message);
      return;
    }

    setIsLoading(true);
    setLocalError("");
    setBanned("");

    try {
      const data = await authApi.googleLogin(tokenResponse.access_token, rememberMe);
      setUser(data.user);
      navigate("/");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t("auth.googleLoginFailed", "Google login failed");
      setLocalError(message);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleError = () => {
    const message = t("auth.googleLoginFailed", "Google login failed");
    setLocalError(message);
    setError(message);
  };

  const handleFacebookSuccess = async (response: FacebookSuccessResponse) => {
    if (!response?.accessToken) {
      const message = t("auth.facebookLoginFailed", "Facebook login failed");
      setLocalError(message);
      setError(message);
      return;
    }

    setIsLoading(true);
    setLocalError("");
    setBanned("");

    try {
      const data = await authApi.facebookLogin(response.accessToken, rememberMe);
      setUser(data.user);
      navigate("/");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t("auth.facebookLoginFailed", "Facebook login failed");
      setLocalError(message);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFacebookError = () => {
    const message = t("auth.facebookLoginFailed", "Facebook login failed");
    setLocalError(message);
    setError(message);
  };

  return (
    <div className="h-screen overflow-hidden bg-theme-primary flex items-center justify-center p-4 transition-colors duration-300">
      <div
        className="fixed inset-0 opacity-[0.025] dark:opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            "repeating-conic-gradient(#64748b 0% 25%, transparent 0% 50%)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="fixed top-4 inset-x-4 flex items-center justify-between z-[60] gap-3">
        <LanguageSwitcher compact className="shrink-0 z-[60]" />
        <button
          onClick={() => setThemeWindowOpen(true)}
          aria-label={t("settings.appearance.theme", "Theme")}
          className="theme-glass-panel-strong shrink-0 p-3 rounded-2xl transition-all duration-200 hover:scale-105"
        >
          <Palette className="w-5 h-5 text-brand-400" />
        </button>
      </div>

      <div className="relative max-w-md w-full">
        <div className="absolute -inset-1 rounded-3xl bg-gradient-to-br from-brand-500/20 via-transparent to-brand-600/10 dark:from-brand-500/10 dark:to-brand-600/5 blur-xl pointer-events-none" />

        <div className="theme-glass-panel-strong relative rounded-2xl p-8">
          <div className="text-center mb-7">
            <div className="relative inline-block">
              <div className="absolute inset-0 bg-brand-500/10 dark:bg-brand-400/10 rounded-full blur-xl scale-150" />
              <img
                src={logoSrc}
                alt="NeonGambit"
                className="relative w-28 h-28 object-contain mx-auto"
              />
            </div>
            <h1 className="mt-3 text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
              {t("auth.welcomeBack", "Welcome Back")}
            </h1>
          </div>

          {banReason && (
            <div className="mb-5 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/60">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-semibold mb-1 text-sm">
                <ShieldAlert className="w-4 h-4" />
                {t("auth.accountBannedTitle", "Account Banned")}
              </div>
              <p className="text-red-600 dark:text-red-400 text-sm">
                {t("auth.accountBannedReason", {
                  defaultValue: "Reason: {{reason}}",
                  reason: banReason,
                })}
              </p>
            </div>
          )}

          {error && !banReason && (
            <div className="mb-5 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/60 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {t("auth.email", "Email Address")}
              </label>
              <div className="relative group">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-brand-500 transition-colors w-[18px] h-[18px]" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white pl-10 pr-4 py-3 rounded-xl focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all text-sm placeholder:text-gray-400"
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
              <div className="relative group">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-brand-500 transition-colors w-[18px] h-[18px]" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white pl-10 pr-4 py-3 rounded-xl focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all text-sm placeholder:text-gray-400"
                  placeholder="********"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="flex items-center">
              <label
                htmlFor="rememberMe"
                className="inline-flex items-center gap-3 cursor-pointer select-none"
              >
                <span className="relative inline-flex h-5 w-5 items-center justify-center">
                  <input
                    type="checkbox"
                    id="rememberMe"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="peer sr-only"
                  />
                  <span className="absolute inset-0 rounded-[4px] border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 peer-checked:bg-brand-500 peer-checked:border-brand-500 transition-colors" />
                  <Check className="relative z-10 w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                </span>
                <span className="text-[15px] font-medium text-gray-600 dark:text-gray-400">
                  {t("auth.rememberMe", "Remember me for 30 days")}
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-brand-600 hover:bg-brand-500 disabled:bg-brand-800 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-brand-900/20 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] text-sm"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>{t("auth.signIn", "Sign In")}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="my-6 relative flex items-center">
            <div className="flex-1 border-t border-gray-200 dark:border-gray-700/60" />
            <span className="mx-3 text-xs text-gray-400 dark:text-gray-500 bg-transparent px-1">
              {t("auth.orContinue", "Or continue with")}
            </span>
            <div className="flex-1 border-t border-gray-200 dark:border-gray-700/60" />
          </div>

          <div className="flex flex-col gap-3">
            {googleClientId && (
              <GoogleSignInButton
                isLoading={isLoading}
                onSuccess={handleGoogleSuccess}
                onError={handleGoogleError}
                label={t("auth.continueWithGoogle", "Continue with Google")}
              />
            )}

            {facebookAppId && (
              <FacebookLogin
                appId={facebookAppId}
                scope="public_profile,email"
                onSuccess={handleFacebookSuccess}
                onFail={handleFacebookError}
                render={({ onClick }) => (
                  <button
                    type="button"
                    onClick={onClick}
                    disabled={isLoading}
                    className="w-full relative flex items-center py-3 px-4 rounded-xl border border-[#1877F2]/30 bg-[#1877F2]/10 hover:bg-[#1877F2]/20 dark:bg-[#1877F2]/10 dark:hover:bg-[#1877F2]/20 text-[#1877F2] dark:text-[#4299ff] font-medium text-sm transition-all hover:scale-[1.02] active:scale-[0.98] hover:border-[#1877F2]/50 hover:shadow-md hover:shadow-[#1877F2]/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="absolute left-4">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                      </svg>
                    </span>
                    <span className="flex-1 text-center">
                      {t("auth.continueWithFacebook", "Continue with Facebook")}
                    </span>
                  </button>
                )}
              />
            )}

            {!googleClientId && !facebookAppId && !isOAuthConfigLoading && (
              <p className="text-center text-xs text-amber-600 dark:text-amber-400">
                {t("auth.socialNotConfigured", "Social sign-in is not configured yet.")}
              </p>
            )}
          </div>

          <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
            {t("auth.noAccount", "Don't have an account?")} {" "}
            <Link
              to="/register"
              className="font-semibold text-brand-600 dark:text-brand-400 hover:underline"
            >
              {t("auth.signUp", "Sign up")}
            </Link>
          </p>
        </div>
      </div>

      <ThemeWindow
        open={themeWindowOpen}
        onClose={() => setThemeWindowOpen(false)}
        closeOnSelect
      />
    </div>
  );
}

