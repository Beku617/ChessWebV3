interface AccuracyBadgeProps {
  name: string;
  accuracy: number | null;
  highlight?: boolean;
}

export function AccuracyBadge({
  name,
  accuracy,
  highlight,
}: AccuracyBadgeProps) {
  return (
    <div
      className={`w-full min-w-0 min-h-[84px] flex flex-col items-center justify-center gap-1 px-3 py-2.5 rounded-lg border text-sm ${
        highlight
          ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
          : "border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"
      }`}
    >
      <span className="max-w-full truncate text-gray-500 dark:text-gray-400 text-xs text-center">
        {name}
      </span>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">
        {accuracy !== null ? `${accuracy.toFixed(1)}%` : "—"}
      </div>
    </div>
  );
}

