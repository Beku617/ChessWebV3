import { Check } from "lucide-react";

interface ColorSwatchPickerProps {
  options: { value: string; bg: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}

export function ColorSwatchPicker({
  options,
  value,
  onChange,
}: ColorSwatchPickerProps) {
  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={opt.label}
          onClick={() => onChange(opt.value)}
          className={`w-7 h-7 rounded-full ${opt.bg} transition-all duration-150 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ${
            value === opt.value
              ? "ring-2 ring-brand-400 scale-110"
              : "hover:scale-105 opacity-70 hover:opacity-100"
          }`}
        >
          {value === opt.value && (
            <Check className="w-3.5 h-3.5 mx-auto text-white drop-shadow" />
          )}
        </button>
      ))}
    </div>
  );
}

