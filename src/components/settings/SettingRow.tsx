import type { ReactNode } from "react";

interface SettingRowProps {
  label: string;
  helper?: string;
  children: ReactNode;
  last?: boolean;
  stacked?: boolean;
}

export function SettingRow({
  label,
  helper,
  children,
  last,
  stacked = false,
}: SettingRowProps) {
  return (
    <div
      className={`py-3.5 ${!last ? "border-b border-gray-100 dark:border-gray-800/50" : ""}`}
    >
      <div
        className={
          stacked
            ? "flex flex-col items-start gap-3"
            : "flex items-center justify-between gap-4"
        }
      >
        <div className={stacked ? "w-full min-w-0" : "min-w-0 flex-1"}>
          <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
            {label}
          </div>
          {helper && (
            <div className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-500">
              {helper}
            </div>
          )}
        </div>
        <div className={stacked ? "w-full" : "flex shrink-0 items-center"}>
          {children}
        </div>
      </div>
    </div>
  );
}
