import type { ReactNode } from "react";

interface SettingsCardProps {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  accent?: string; // gradient from color
}

export function SettingsCard({
  title,
  subtitle,
  children,
  className = "",
  accent,
}: SettingsCardProps) {
  return (
    <section
      className={`theme-glass-panel relative overflow-hidden rounded-2xl transition-colors duration-300 ${className}`}
    >
      {/* Subtle glow accent */}
      {accent && (
        <div
          className={`absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-[0.07] blur-2xl pointer-events-none ${accent}`}
        />
      )}
      <div className="relative">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-5 pb-4 border-b border-theme-glass">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white leading-tight">
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {/* Body */}
        <div className="px-6 py-4 space-y-1">{children}</div>
      </div>
    </section>
  );
}
