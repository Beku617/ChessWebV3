import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { FilterOption } from "../types";

type FilterDropdownProps = {
  ariaLabel: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  value: string;
};

export function FilterDropdown({
  ariaLabel,
  onChange,
  options,
  value,
}: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [isOpen]);

  const selected =
    options.find((option) => option.value === value) || options[0] || null;

  return (
    <div ref={containerRef} className="relative min-w-[140px] z-[140]">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="w-full inline-flex items-center justify-between gap-2 rounded-lg bg-white/[0.06] px-4 py-3 text-sm text-white hover:bg-white/[0.1] focus:outline-none focus:ring-2 focus:ring-brand-500/30 transition-colors"
      >
        <span className="truncate">{selected?.label || "Select"}</span>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-[180] mt-2 w-full rounded-xl border border-gray-200 dark:border-white/10 bg-[#0f1a2d] shadow-[0_18px_48px_rgba(0,0,0,0.35)] p-1">
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={`${ariaLabel}-${option.value || "all"}`}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-brand-500/20 text-brand-100"
                    : "text-gray-200 hover:bg-white/[0.08]"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

