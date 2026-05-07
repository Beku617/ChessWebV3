import { Link, useLocation, useNavigate } from "react-router-dom";
import { useThemeStore } from "../store/themeStore";
import { useAdminStore } from "../store/adminStore";
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

export default function AdminSidebar() {
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

  const navItems: Array<{ label: string; path: string; Icon: LucideIcon }> = [
    { label: "Users", path: "/admin/users", Icon: Users },
    { label: "Bots", path: "/admin/bots", Icon: Cpu },
    { label: "Puzzles", path: "/admin/puzzles", Icon: ListChecks },
    { label: "Learn", path: "/admin/learn", Icon: BookOpen },
    { label: "Events", path: "/admin/events", Icon: Calendar },
    { label: "Games", path: "/admin/games", Icon: Gamepad2 },
    { label: "Community", path: "/admin/community", Icon: MessageSquare },
    { label: "Groups", path: "/admin/groups", Icon: Folder },
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
      {/* Logo */}
      <Link
        to="/admin"
        className="px-6 py-4 flex items-center gap-3 border-b border-theme-glass"
      >
        <img
          src={logoSrc}
          alt="NeonGambit"
          className="h-12 object-contain shrink-0"
        />
        <div className="min-w-0 pr-2">
          <div className="text-gray-900 dark:text-white font-bold text-[1.72rem] tracking-tight leading-none">
            NeonGambit
          </div>
          <span className="mt-1 inline-flex text-xs bg-brand-500/20 text-brand-600 dark:text-brand-400 px-2 py-0.5 rounded-full font-medium">
            Admin
          </span>
        </div>
      </Link>

      {/* Navigation */}
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
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Profile */}
      <div className="shrink-0 p-4 border-t border-theme-glass space-y-2">
        {/* Admin Profile */}
        <div className="theme-glass-panel-soft flex items-center space-x-3 px-4 py-3 rounded-lg">
          <Link
            to="/admin/profile"
            className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-lg hover:opacity-80 transition-opacity flex-shrink-0 overflow-hidden"
            title="View admin profile"
          >
            {admin?.avatar ? (
              <img
                src={resolveAvatarUrl(admin.avatar)}
                alt={admin?.username || "Admin"}
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
              {admin?.username || "Admin"}
            </div>
            <div className="text-xs text-gray-500 truncate">Administrator</div>
          </Link>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
        >
          <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="font-medium">Log Out</span>
        </button>
      </div>
    </div>
  );
}

