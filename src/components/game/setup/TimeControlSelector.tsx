import { timeOptions } from "./constants";

interface TimeControlSelectorProps {
  timeControl: { initial: number; increment: number };
  setTimeControl: (tc: { initial: number; increment: number }) => void;
}

export function TimeControlSelector({
  timeControl,
  setTimeControl,
}: TimeControlSelectorProps) {
  return (
    <div className="mb-6">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
        Time Control
      </label>
      <div className="grid grid-cols-4 gap-2">
        {timeOptions.map((opt) => (
          <button
            key={opt.label}
            onClick={() =>
              setTimeControl({
                initial: opt.initial,
                increment: opt.increment,
              })
            }
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              timeControl.initial === opt.initial &&
              timeControl.increment === opt.increment
                ? "bg-brand-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

