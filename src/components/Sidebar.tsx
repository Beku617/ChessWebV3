import { useEffect } from "react";
import {
  Puzzle,
  GraduationCap,
  Eye,
  Users,
  Settings,
  MessageSquare,
  LogOut,
  Trophy,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore, authApi } from "../store/authStore";
import { useThemeStore } from "../store/themeStore";
import { useTranslation } from "react-i18next";
import { useFriendStore } from "../store/friendStore";
import { useMessageStore } from "../store/messageStore";

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
  const isActive = (path: string) => location.pathname === path;
  const isLearnLessonPage = /^\/learn\/[^/]+\/[^/]+$/.test(location.pathname);
  const isCompact =
    isLearnLessonPage ||
    location.pathname.startsWith("/play/quick") ||
    location.pathname.startsWith("/play/friend") ||
    location.pathname.startsWith("/play/variants") ||
    location.pathname.startsWith("/play/practice");
  const sidebarWidthClass = isLearnLessonPage ? "w-56" : "w-72";

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

  const navItems = [
    {
      icon: Trophy,
      label: t("nav.tournaments", "Tournaments"),
      path: "/tournaments",
    },
    {
      icon: Puzzle,
      label: t("nav.puzzles", "Puzzles"),
      path: "/puzzles",
    },
    {
      icon: GraduationCap,
      label: t("nav.learn", "Learn"),
      path: "/learn",
    },
    { icon: Eye, label: t("nav.watch", "Watch"), path: "/watch" },
    {
      icon: Users,
      label: t("nav.community", "Community"),
      path: "/community",
    },
  ];
  const fontSizeGroup = {
    primary: "text-base",
    secondary: "text-sm",
    caption: "text-xs",
  } as const;
  const styleGroup = {
    logoWrapper: isCompact ? "px-5 pt-4 pb-3" : "px-6 pt-5 pb-4",
    logoHeight: isCompact ? "h-14" : "h-16",
    navWrapper: isCompact ? "px-3 py-3" : "px-3 py-4",
    navGap: isCompact ? "gap-1" : "gap-1.5",
    rowPadding: isCompact ? "px-3 py-2" : "px-3.5 py-2.5",
    rowIcon: isCompact ? "w-4 h-4" : "w-5 h-5",
    profileRowPadding: isCompact ? "px-3 py-2" : "px-3 py-2.5",
    iconButtonPadding: isCompact ? "p-1.5" : "p-2",
  } as const;
  const logoSrc = isDarkMode ? "/images/Logo.png" : "/images/LightModeLogo.png";
  const formatCount = (value: number) => (value > 99 ? "99+" : value.toString());

  return (
    <div className={`${sidebarWidthClass} h-screen bg-[#ebebed] dark:bg-gray-900 flex flex-col fixed left-0 top-0 z-50 transition-colors duration-300`}>
      {/* Logo */}
      <Link
        to="/"
        className={`flex items-center gap-3 border-b border-gray-200/70 dark:border-gray-800 ${styleGroup.logoWrapper}`}
      >
        <img
          src={logoSrc}
          alt="NeonGambit"
          className={`object-contain ${styleGroup.logoHeight}`}
        />
        <span
          className={`text-gray-900 dark:text-white font-bold tracking-tight ${
            isCompact ? "text-xl" : "text-2xl"
          }`}
        >
          NeonGambit
        </span>
      </Link>

      {/* Navigation */}
      <nav className={`flex-1 overflow-y-auto ${styleGroup.navWrapper}`}>
        <div className={`flex flex-col ${styleGroup.navGap}`}>
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-2.5 min-h-[44px] ${styleGroup.rowPadding} rounded-xl border border-transparent transition-all duration-200 group ${
                isActive(item.path)
                  ? "bg-teal-500/14 border-teal-400/35 text-teal-700 dark:text-teal-300 shadow-[0_8px_18px_rgba(20,184,166,0.16)]"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/80 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <item.icon
                className={`shrink-0 ${styleGroup.rowIcon} ${
                  isActive(item.path)
                    ? "text-teal-700 dark:text-teal-300"
                    : "text-gray-400 dark:text-gray-500 group-hover:text-gray-900 dark:group-hover:text-white"
                }`}
              />
              <span
                className={`font-medium leading-none ${fontSizeGroup.primary}`}
              >
                {item.label}
              </span>
            </Link>
          ))}
        </div>
      </nav>

      {/* Bottom Section */}
      <div
        className={`border-t border-gray-200/70 dark:border-gray-800/90 flex flex-col ${isCompact ? "px-3 py-3 gap-1" : "px-3 py-4 gap-1.5"}`}
      >
        {/* User Profile & Quick Actions */}
        <div className={`${isCompact ? "pt-1" : "pt-1.5"}`}>
          <div className="flex items-center gap-1.5 w-full">
            {/* Click avatar/name to go to Profile */}
            <Link
              to="/profile"
              className={`flex-1 min-w-0 flex items-center gap-2.5 ${styleGroup.profileRowPadding} rounded-xl border border-transparent transition-colors cursor-pointer group ${
                isActive("/profile")
                  ? "bg-teal-500/10 border-teal-400/25"
                  : "hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              <div
                className={`flex-shrink-0 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-lg overflow-hidden ${
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
              <div className="flex-1 min-w-0">
                <div
                  className={`font-medium text-gray-900 dark:text-white truncate ${fontSizeGroup.secondary}`}
                >
                  {user?.fullName || t("common.user", "User")}
                </div>
                <div
                  className={`text-gray-500 truncate ${fontSizeGroup.caption}`}
                >
                  {t("nav.viewProfile", "View Profile")}
                </div>
              </div>
            </Link>

            {/* Messages Icon Button */}
            <Link
              to="/messages"
              className={`relative inline-flex items-center justify-center flex-shrink-0 rounded-lg transition-colors ${
                isActive("/messages")
                  ? "bg-teal-500/10 text-teal-600 dark:text-teal-300"
                  : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300"
              } ${styleGroup.iconButtonPadding}`}
              title={t("nav.messages", "Messages")}
            >
              <MessageSquare className={styleGroup.rowIcon} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-5 px-1.5 rounded-full bg-cyan-500 text-[10px] font-bold text-white leading-none flex items-center justify-center shadow-[0_0_0_1px_rgba(0,0,0,0.35)]">
                  {formatCount(unreadCount)}
                </span>
              )}
            </Link>

            {/* Friends Icon Button */}
            <Link
              to="/friends"
              className={`relative inline-flex items-center justify-center flex-shrink-0 rounded-lg transition-colors ${
                isActive("/friends")
                  ? "bg-teal-500/10 text-teal-600 dark:text-teal-300"
                  : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300"
              } ${styleGroup.iconButtonPadding}`}
              title={t("nav.friends", "Friends")}
            >
              <Users className={styleGroup.rowIcon} />
              {pendingIncomingCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-5 px-1.5 rounded-full bg-teal-500 text-[10px] font-bold text-white leading-none flex items-center justify-center shadow-[0_0_0_1px_rgba(0,0,0,0.35)]">
                  {formatCount(pendingIncomingCount)}
                </span>
              )}
            </Link>

            {/* Settings Icon Button */}
            <Link
              to="/settings"
              className={`flex-shrink-0 rounded-lg transition-colors ${
                isActive("/settings")
                  ? "bg-teal-500/10 text-teal-600 dark:text-teal-300"
                  : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300"
              } ${styleGroup.iconButtonPadding}`}
              title={t("nav.settings", "Settings")}
            >
              <Settings className={styleGroup.rowIcon} />
            </Link>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className={`w-full flex items-center gap-3 min-h-[44px] ${styleGroup.rowPadding} rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors`}
        >
          <LogOut className={styleGroup.rowIcon} />
          <span className={`font-medium leading-none ${fontSizeGroup.primary}`}>
            {t("nav.logout", "Log Out")}
          </span>
        </button>
      </div>
    </div>
  );
}
