import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Calendar,
  Cpu,
  Folder,
  Gamepad2,
  ListChecks,
  LogOut,
  MessageSquare,
  Users,
} from "lucide-react";

import { useAdminStore } from "../store/adminStore";
import { useThemeStore } from "../store/themeStore";

export default function AdminSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { isDarkMode } = useThemeStore();
  const { admin, logout } = useAdminStore();
  const isActive = (path: string) => location.pathname === path;
  const logoSrc = isDarkMode ? "/images/Logo.png" : "/images/LightModeLogo.png";
  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const navItems: Array<{ labelKey: string; path: string; Icon: LucideIcon }> = [
    { labelKey: "admin.sidebar.nav.users", path: "/admin/users", Icon: Users },
    { labelKey: "admin.sidebar.nav.bots", path: "/admin/bots", Icon: Cpu },
    {
      labelKey: "admin.sidebar.nav.puzzles",
      path: "/admin/puzzles",
      Icon: ListChecks,
    },
    { labelKey: "admin.sidebar.nav.learn", path: "/admin/learn", Icon: BookOpen },
    {
      labelKey: "admin.sidebar.nav.learnMn",
      path: "/admin/learn-mn",
      Icon: BookOpen,
    },
    {
      labelKey: "admin.sidebar.nav.events",
      path: "/admin/events",
      Icon: Calendar,
    },
    {
      labelKey: "admin.sidebar.nav.eventsMn",
      path: "/admin/events-mn",
      Icon: Calendar,
    },
    { labelKey: "admin.sidebar.nav.games", path: "/admin/games", Icon: Gamepad2 },
    {
      labelKey: "admin.sidebar.nav.community",
      path: "/admin/community",
      Icon: MessageSquare,
    },
    { labelKey: "admin.sidebar.nav.groups", path: "/admin/groups", Icon: Folder },
  ];

  const resolveAvatarUrl = (avatar?: string) => {
    if (!avatar) return "";
    if (
      avatar.startsWith("http://") ||
      avatar.startsWith("https://") ||
      avatar.startsWith("data:") ||
      avatar.startsWith("blob:")
    ) {
      return avatar;
    }
    const base = import.meta.env.VITE_API_URL || "http://localhost:3001";
    return `${base}${avatar.startsWith("/") ? "" : "/"}${avatar}`;
  };

  return (
    <div className="w-72 h-screen overflow-hidden bg-theme-secondary border-r border-theme-glass flex flex-col fixed left-0 top-0 z-50 transition-colors duration-300">
      <Link
        to="/admin"
        className="px-6 py-4 flex items-center gap-3 border-b border-theme-glass"
      >
        <img
          src={logoSrc}
          alt={t("admin.sidebar.brandAlt")}
          className="h-12 object-contain shrink-0"
        />
        <div className="min-w-0 pr-2">
          <div className="text-gray-900 dark:text-white font-bold text-[1.72rem] tracking-tight leading-none">
            {t("admin.sidebar.brandName")}
          </div>
          <span className="mt-1 inline-flex text-xs bg-brand-500/20 text-brand-600 dark:text-brand-400 px-2 py-0.5 rounded-full font-medium">
            {t("admin.sidebar.adminBadge")}
          </span>
        </div>
      </Link>

      <nav className="flex-1 min-h-0 overflow-y-auto premium-scrollbar px-4 pr-3 space-y-2 mt-2">
        {navItems.map((item) => {
          const Icon = item.Icon;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group ${
                isActive(item.path)
                  ? "bg-brand-500/10 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500"
                  : "text-gray-500 dark:text-gray-300 hover:bg-white/45 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="font-medium">{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 p-4 border-t border-theme-glass space-y-2">
        <div className="theme-glass-panel-soft flex items-center space-x-3 px-4 py-3 rounded-lg">
          <Link
            to="/admin/profile"
            className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-lg hover:opacity-80 transition-opacity flex-shrink-0 overflow-hidden"
            title={t("admin.actions.viewAdminProfile")}
          >
            {admin?.avatar ? (
              <img
                src={resolveAvatarUrl(admin.avatar)}
                alt={admin?.username || t("admin.sidebar.adminFallbackName")}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-xs font-bold text-white">AD</span>
            )}
          </Link>
          <Link
            to="/admin/profile"
            className="flex-1 min-w-0 hover:opacity-80 transition-opacity"
          >
            <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {admin?.username || t("admin.sidebar.adminFallbackName")}
            </div>
            <div className="text-xs text-gray-500 truncate">
              {t("admin.sidebar.adminRole")}
            </div>
          </Link>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
        >
          <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="font-medium">{t("admin.sidebar.logOut")}</span>
        </button>
      </div>
    </div>
  );
}
