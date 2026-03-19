import {
  Users,
  Gamepad2,
  Settings,
  Sun,
  Moon,
  LogOut,
  Shield,
  BarChart3,
  Brain,
  Bot,
  Trophy,
  MessageSquare,
  UserCircle,
  BookOpen,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useThemeStore } from "../store/themeStore";
import { useAdminStore } from "../store/adminStore";

export default function AdminSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isDarkMode, toggleTheme } = useThemeStore();
  const { admin, logout } = useAdminStore();
  const isActive = (path: string) => location.pathname === path;
  const logoSrc = isDarkMode ? "/images/Logo.png" : "/images/LightModeLogo.png";

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const navItems = [
    { icon: Users, label: "Users", path: "/admin/users" },
    { icon: Bot, label: "Bots", path: "/admin/bots" },
    { icon: Brain, label: "Puzzles", path: "/admin/puzzles" },
    { icon: BookOpen, label: "Learn", path: "/admin/learn" },
    { icon: Trophy, label: "Events", path: "/admin/events" },
    { icon: Gamepad2, label: "Games", path: "/admin/games" },
    { icon: MessageSquare, label: "Community", path: "/admin/community" },
    { icon: Users, label: "Groups", path: "/admin/groups" },
    { icon: UserCircle, label: "Profile", path: "/admin/profile" },
    { icon: Settings, label: "Settings", path: "/admin/settings" },
  ];

  return (
    <div className="w-72 h-screen bg-[#ebebed] dark:bg-gray-900 border-r border-gray-200/60 dark:border-gray-800 flex flex-col fixed left-0 top-0 z-50 transition-colors duration-300">
      {/* Logo */}
      <Link
        to="/admin"
        className="px-6 py-4 flex items-center gap-3 border-b border-gray-200/70 dark:border-gray-800"
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
          <span className="mt-1 inline-flex text-xs bg-teal-500/20 text-teal-600 dark:text-teal-400 px-2 py-0.5 rounded-full font-medium">
            Admin
          </span>
        </div>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-2 mt-2">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 group ${
              isActive(item.path)
                ? "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-l-4 border-teal-500"
                : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            <item.icon
              className={`w-5 h-5 ${isActive(item.path) ? "text-teal-600 dark:text-teal-400" : "text-gray-400 dark:text-gray-500 group-hover:text-gray-900 dark:group-hover:text-white"}`}
            />
            <span className="font-medium">{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Theme Toggle & Profile */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-800 space-y-2">
        <button
          onClick={toggleTheme}
          className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          {isDarkMode ? (
            <Sun className="w-5 h-5" />
          ) : (
            <Moon className="w-5 h-5" />
          )}
          <span className="font-medium">
            {isDarkMode ? "Light Mode" : "Dark Mode"}
          </span>
        </button>

        {/* Admin Profile */}
        <div className="flex items-center space-x-3 px-4 py-3 rounded-lg bg-gray-100 dark:bg-gray-800">
          <Link
            to="/admin/profile"
            className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-lg hover:opacity-80 transition-opacity flex-shrink-0"
            title="View admin profile"
          >
            <Shield className="w-5 h-5 text-white" />
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
          <Link
            to="/messages"
            className="flex-shrink-0 p-2 rounded-lg text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="Messages"
          >
            <MessageSquare className="w-5 h-5" />
          </Link>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">Log Out</span>
        </button>
      </div>
    </div>
  );
}
