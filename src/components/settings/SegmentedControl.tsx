interface SegmentedControlProps {
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
}

export function SegmentedControl({
  options,
  value,
  onChange,
}: SegmentedControlProps) {
  return (
    <div className="inline-flex rounded-lg bg-theme-surface p-0.5 gap-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-150 ${
            value === opt.value
              ? "bg-theme-panel text-theme-foreground shadow-sm"
              : "text-theme-muted hover:text-theme-muted"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
