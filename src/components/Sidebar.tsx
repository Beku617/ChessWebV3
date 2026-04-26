import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore, authApi } from "../store/authStore";
import { useThemeStore } from "../store/themeStore";
import { useTranslation } from "react-i18next";
import { useFriendStore } from "../store/friendStore";
import { useMessageStore } from "../store/messageStore";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Calendar,
  ListChecks,
  LogOut,
  MessageCircle,
  MessageSquare,
  Radio,
  Settings,
  Users,
} from "lucide-react";

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { isDarkMode } = useThemeStore();
  const { t } = useTranslation();
  const loadAllFriends = useFriendStore((state) => state.loadAll);
  const pendingIncomingCount = useFriendStore((state) => state.pendingIncomingCount());
  const refreshUnread = useMessageStore((state) => state.refreshUnread);
  const unreadCount = useMessageStore((state) => state.unreadCount);
  const isRouteActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);
  const isCompact =
    location.pathname.startsWith("/play/quick") ||
    location.pathname.startsWith("/play/friend") ||
    location.pathname.startsWith("/play/variants") ||
    location.pathname.startsWith("/play/practice");
  const sidebarWidthClass = "w-[60px] md:w-72";

  useEffect(() => {
    void loadAllFriends();
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadAllFriends();
    }, 20000);
    return () => window.clearInterval(id);
  }, [loadAllFriends]);

  useEffect(() => {
    void refreshUnread();
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refreshUnread();
    }, 15000);
    return () => window.clearInterval(id);
  }, [refreshUnread]);

  const handleLogout = async () => {
    try {
      await authApi.logout();
      logout();
      navigate("/login");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const navItems: Array<{ label: string; path: string; Icon: LucideIcon }> = [
    {
      label: t("nav.tournaments", "Tournaments"),
      path: "/tournaments",
      Icon: Calendar,
    },
    {
      label: t("nav.puzzles", "Puzzles"),
      path: "/puzzles",
      Icon: ListChecks,
    },
    {
      label: t("nav.learn", "Learn"),
      path: "/learn",
      Icon: BookOpen,
    },
    { label: t("nav.watch", "Watch"), path: "/watch", Icon: Radio },
    {
      label: t("nav.community", "Community"),
      path: "/community",
      Icon: MessageSquare,
    },
  ];
  const fontSizeGroup = {
    primary: "text-base",
    secondary: "text-sm",
    caption: "text-xs",
  } as const;
  const styleGroup = {
    logoWrapper: isCompact
      ? "px-0 pt-3 pb-2 md:px-5 md:pt-4 md:pb-3"
      : "px-0 pt-4 pb-3 md:px-6 md:pt-5 md:pb-4",
    logoHeight: isCompact ? "h-9 md:h-14" : "h-10 md:h-16",
    navWrapper: isCompact ? "px-1 py-3 md:px-3 md:py-3" : "px-1 py-4 md:px-3 md:py-4",
    navGap: isCompact ? "gap-1" : "gap-1.5",
    rowPadding: isCompact ? "px-2 py-2 md:px-3 md:py-2" : "px-2 py-2 md:px-3.5 md:py-2.5",
    profileRowPadding: isCompact ? "px-2 py-2 md:px-3 md:py-2" : "px-2 py-2 md:px-3 md:py-2.5",
  } as const;
  const logoSrc = isDarkMode ? "/images/Logo.png" : "/images/LightModeLogo.png";
  const formatCount = (value: number) => (value > 99 ? "99+" : value.toString());

  return (
    <div className={`${sidebarWidthClass} h-screen bg-theme-secondary border-r border-theme-glass flex flex-col fixed left-0 top-0 z-50 transition-colors duration-300`}>
      {/* Logo */}
      <Link
        to="/"
        className={`flex items-center justify-center md:justify-start gap-0 md:gap-3 focus:outline-none focus-visible:outline-none ${styleGroup.logoWrapper}`}
      >
        <img
          src={logoSrc}
          alt="NeonGambit"
          className={`object-contain ${styleGroup.logoHeight}`}
        />
        <span
          className={`hidden md:inline text-gray-900 dark:text-white font-bold tracking-tight ${
            isCompact ? "text-xl" : "text-2xl"
          }`}
        >
          NeonGambit
        </span>
      </Link>

      {/* Navigation */}
      <nav className={`flex-1 overflow-y-auto ${styleGroup.navWrapper}`}>
        <div className={`flex flex-col ${styleGroup.navGap}`}>
          {navItems.map((item) => {
            const Icon = item.Icon;

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center justify-center md:justify-start gap-0 md:gap-3 min-h-[44px] ${styleGroup.rowPadding} rounded-xl border border-transparent transition-all duration-200 group ${
                  isRouteActive(item.path)
                    ? "bg-gray-300/75 dark:bg-gray-500/40 text-gray-900 dark:text-gray-100"
                    : "text-gray-500 dark:text-gray-300 hover:bg-white/50 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white"
                }`}
                title={item.label}
              >
                <Icon className="h-4 w-4 shrink-0 md:h-5 md:w-5" aria-hidden="true" />
                <span
                  className={`hidden md:inline font-medium leading-none ${fontSizeGroup.primary}`}
                >
                  {item.label}
                </span>
                <span className="sr-only md:hidden">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Bottom Section */}
      <div
        className={`border-t border-theme-glass flex flex-col ${isCompact ? "px-1 py-3 gap-1 md:px-3" : "px-1 py-4 gap-1.5 md:px-3"}`}
      >
        {/* User Profile & Quick Actions */}
        <div className={`${isCompact ? "pt-1" : "pt-1.5"}`}>
          <div className="flex flex-col md:flex-row items-center gap-1.5 w-full">
            {/* Click avatar/name to go to Profile */}
            <Link
              to="/profile"
              className={`w-full md:flex-1 min-w-0 flex items-center justify-center md:justify-start gap-2.5 rounded-xl border border-transparent transition-colors cursor-pointer group ${styleGroup.profileRowPadding} ${
                isRouteActive("/profile")
                  ? "bg-brand-500/10 border-brand-400/25"
                  : "hover:bg-white/50 dark:hover:bg-white/10"
              }`}
            >
              <div
                className={`flex-shrink-0 rounded-full bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-lg overflow-hidden ${
                  isCompact ? "w-8 h-8" : "w-9 h-9"
                }`}
              >
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.fullName || t("common.user", "User")}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span
                    className={`text-white font-bold ${fontSizeGroup.caption}`}
                  >
                    {user?.fullName?.substring(0, 2).toUpperCase() ||
                      t("common.userInitial", "U")}
                  </span>
                )}
              </div>
              <div className="hidden md:block flex-1 min-w-0">
                <div
                  className={`font-medium text-gray-900 dark:text-white truncate ${fontSizeGroup.secondary}`}
                >
                  {user?.fullName || t("common.user", "User")}
                </div>
              </div>
            </Link>

            <div className="flex flex-col md:flex-row items-center gap-1.5">
              <Link
                to="/messages"
                className={`relative inline-flex items-center justify-center flex-shrink-0 rounded-lg transition-colors ${
                  isRouteActive("/messages")
                    ? "bg-brand-500/10 text-brand-600 dark:text-brand-300"
                    : "text-gray-400 hover:bg-white/50 dark:hover:bg-white/10 hover:text-gray-600 dark:hover:text-gray-200"
                } px-2 py-1.5 md:px-3 md:py-2`}
                title={t("nav.messages", "Messages")}
              >
                <MessageCircle className="h-4 w-4 md:h-5 md:w-5" aria-hidden="true" />
                <span className="sr-only">{t("nav.messages", "Messages")}</span>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-5 px-1.5 rounded-full bg-brand-500 text-[10px] font-bold text-white leading-none flex items-center justify-center shadow-[0_0_0_1px_rgba(0,0,0,0.35)]">
                    {formatCount(unreadCount)}
                  </span>
                )}
              </Link>

              <Link
                to="/friends"
                className={`relative inline-flex items-center justify-center flex-shrink-0 rounded-lg transition-colors ${
                  isRouteActive("/friends")
                    ? "bg-brand-500/10 text-brand-600 dark:text-brand-300"
                    : "text-gray-400 hover:bg-white/50 dark:hover:bg-white/10 hover:text-gray-600 dark:hover:text-gray-200"
                } px-2 py-1.5 md:px-3 md:py-2`}
                title={t("nav.friends", "Friends")}
              >
                <Users className="h-4 w-4 md:h-5 md:w-5" aria-hidden="true" />
                <span className="sr-only">{t("nav.friends", "Friends")}</span>
                {pendingIncomingCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-5 px-1.5 rounded-full bg-brand-500 text-[10px] font-bold text-white leading-none flex items-center justify-center shadow-[0_0_0_1px_rgba(0,0,0,0.35)]">
                    {formatCount(pendingIncomingCount)}
                  </span>
                )}
              </Link>

              <Link
                to="/settings"
                className={`inline-flex items-center justify-center flex-shrink-0 rounded-lg transition-colors ${
                  isRouteActive("/settings")
                    ? "bg-brand-500/10 text-brand-600 dark:text-brand-300"
                    : "text-gray-400 hover:bg-white/50 dark:hover:bg-white/10 hover:text-gray-600 dark:hover:text-gray-200"
                } px-2 py-1.5 md:px-3 md:py-2`}
                title={t("nav.settings", "Settings")}
              >
                <Settings className="h-4 w-4 md:h-5 md:w-5" aria-hidden="true" />
                <span className="sr-only">{t("nav.settings", "Settings")}</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className={`w-full flex items-center justify-center md:justify-start gap-0 md:gap-3 min-h-[44px] ${styleGroup.rowPadding} rounded-xl text-red-500 hover:bg-red-500/10 transition-colors`}
          title={t("nav.logout", "Log Out")}
        >
          <LogOut className="h-4 w-4 shrink-0 md:h-5 md:w-5" aria-hidden="true" />
          <span className={`hidden md:inline font-medium leading-none ${fontSizeGroup.primary}`}>
            {t("nav.logout", "Log Out")}
          </span>
          <span className="sr-only md:hidden">{t("nav.logout", "Log Out")}</span>
        </button>
      </div>
    </div>
  );
}

