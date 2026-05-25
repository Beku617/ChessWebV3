import { useMemo } from "react";
import { evalToExpectedPoints } from "../../utils/moveQuality";

type Point = { x: number; y: number };

interface AdvantageGraphProps {
  cps: Array<{ cp?: number; mate?: number } | undefined>;
  width?: number;
  height?: number;
}

export function AdvantageGraph({
  cps,
  width = 360,
  height = 120,
}: AdvantageGraphProps) {
  const points: Point[] = useMemo(() => {
    if (!cps || cps.length === 0) return [];
    return cps.map((entry, idx) => ({
      x: idx,
      y: 1 - evalToExpectedPoints(entry?.cp, entry?.mate, "w"), // invert so White up = positive
    }));
  }, [cps]);

  if (points.length === 0) {
    return (
      <div className="h-24 flex items-center justify-center text-sm text-gray-400">
        No engine data yet
      </div>
    );
  }

  const maxX = points[points.length - 1]?.x || 1;
  const d = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${(p.x / Math.max(1, maxX)) * width} ${
          p.y * height
        }`,
    )
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full h-32 rounded-lg bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800"
    >
      <defs>
        <linearGradient id="advantageFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0.25" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={width} height={height} fill="url(#advantageFill)" />
      <path
        d={d}
        fill="none"
        strokeWidth="2.5"
        stroke="#0ea5e9"
        strokeLinejoin="round"
      />
      <line
        x1="0"
        y1={height / 2}
        x2={width}
        y2={height / 2}
        stroke="rgba(148,163,184,0.5)"
        strokeDasharray="4 4"
        strokeWidth="1"
      />
    </svg>
  );
}
