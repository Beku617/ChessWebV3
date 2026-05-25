/* ═══════════════════════════════════════════════════════
   Community Filter Tabs — smooth underline animation
   ═══════════════════════════════════════════════════════ */
import { useRef, useState, useLayoutEffect } from "react";
import { type CommunityTab, COMMUNITY_TABS } from "../../data/communityData";

interface FilterTabsProps {
  active: CommunityTab;
  onChange: (tab: CommunityTab) => void;
}

export function FilterTabs({ active, onChange }: FilterTabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const activeEl = container.querySelector<HTMLButtonElement>(
      `[data-tab="${active}"]`,
    );
    if (activeEl) {
      setIndicator({
        left: activeEl.offsetLeft,
        width: activeEl.offsetWidth,
      });
    }
  }, [active]);

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex gap-1 overflow-x-auto scrollbar-hide px-1">
        {COMMUNITY_TABS.map((tab) => (
          <button
            key={tab}
            data-tab={tab}
            onClick={() => onChange(tab)}
            className={`relative px-4 py-4 text-sm font-semibold whitespace-nowrap transition-colors duration-200 rounded-lg ${
              active === tab
                ? "text-brand-600"
                : "text-theme-muted hover:text-theme-muted hover:bg-theme-surface/60"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      {/* Animated underline */}
      <div
        className="absolute bottom-0 h-0.5 bg-brand-500 rounded-full transition-all duration-300 ease-out"
        style={{ left: indicator.left, width: indicator.width }}
      />
    </div>
  );
}

