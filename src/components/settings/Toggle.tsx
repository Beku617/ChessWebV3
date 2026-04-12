import { Check } from "lucide-react";

interface ToggleProps {
  enabled: boolean;
  onChange: (v: boolean) => void;
  color?: string; // tailwind bg class like "bg-brand-500"
  disabled?: boolean;
  ariaLabel?: string;
}

export function Toggle({
  enabled,
  onChange,
  color = "bg-brand-500",
  disabled = false,
  ariaLabel,
}: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:opacity-40 disabled:cursor-not-allowed ${
        enabled ? color : "bg-gray-600"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${
          enabled ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

