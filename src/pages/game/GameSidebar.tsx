import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Gamepad2 } from "lucide-react";
import { QUICK_ACTIONS, iconMap } from "./types";

interface GameSidebarProps {
  onStartMatch: () => void;
}

export function GameSidebar({ onStartMatch }: GameSidebarProps) {
  const navigate = useNavigate();

  // Build quick actions with resolved icons and handlers
  const quickActions = useMemo(() => {
    return QUICK_ACTIONS.map((action) => {
      const IconComponent = iconMap[action.icon] || Gamepad2;

      let onClick: (() => void) | undefined;
      if (action.action === "startMatch") {
        onClick = onStartMatch;
      } else if (action.route) {
        onClick = () => navigate(action.route);
      }

      return {
        ...action,
        IconComponent,
        onClick,
      };
    });
  }, [navigate, onStartMatch]);

  return (
    <div className="w-full lg:flex-1 lg:self-stretch min-h-0 flex flex-col">
      <div className="theme-glass-panel-strong flex-1 rounded-3xl px-5 py-6 lg:p-6 flex flex-col overflow-hidden">
        <div className="flex items-center justify-center flex-shrink-0 mb-5">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Play Chess
            </h2>
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-2.5 px-0.5 sm:px-1">
          {quickActions.map((action) => (
            <button
              key={action.id}
              onClick={action.onClick}
              className={`w-full text-left rounded-xl border border-white/5 bg-gradient-to-r ${action.accent} p-[1px] shadow-md transition-all duration-200 hover:shadow-lg hover:-translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0`}
            >
              <div className="theme-glass-panel-soft h-full rounded-[12px] px-3.5 py-3 flex items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-theme-glass bg-white/35 text-gray-700 shadow-sm dark:bg-white/5 dark:text-gray-200">
                  <action.IconComponent className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm sm:text-base font-semibold leading-snug text-gray-800 dark:text-white">
                    {action.title}
                  </div>
                  <div className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">
                    {action.description}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
