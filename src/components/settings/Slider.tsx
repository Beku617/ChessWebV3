interface SliderProps {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  label?: string;
}

export function Slider({
  min,
  max,
  step = 1,
  value,
  onChange,
  label,
}: SliderProps) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-28 h-1.5 bg-gray-300 dark:bg-gray-700 rounded-full appearance-none cursor-pointer accent-brand-500 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-md"
      />
      {label && (
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 min-w-[2.5rem] text-right">
          {label}
        </span>
      )}
    </div>
  );
}

