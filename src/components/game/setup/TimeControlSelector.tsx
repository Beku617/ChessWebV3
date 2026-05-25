import { Trans } from "react-i18next";
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
      <label className="text-sm font-medium text-theme-muted mb-2 block"> <Trans>Time Control</Trans> </label>
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
                ? "bg-brand-600 text-theme-on-accent"
                : "bg-theme-surface text-theme-muted hover:bg-theme-surface/80"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

