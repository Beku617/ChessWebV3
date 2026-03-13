import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { LineChart as LineChartIcon } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  type RatingPool,
  type RatingRange,
  useRatingTimeline,
} from "../../hooks/useRatingsData";
import { useElementSize } from "../../hooks/useElementSize";

const POOLS: Array<{ id: RatingPool; label: string }> = [
  { id: "bullet", label: "Bullet" },
  { id: "blitz", label: "Blitz" },
  { id: "rapid", label: "Rapid" },
  { id: "classical", label: "Classical" },
];

const RANGES: Array<{ id: RatingRange; label: string }> = [
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
  { id: "90d", label: "90D" },
  { id: "1y", label: "1Y" },
  { id: "all", label: "ALL" },
];

function formatPointDate(value: string, range: RatingRange) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  if (range === "7d" || range === "30d") {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

function formatTooltipDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface RatingTimelineCardProps {
  enabled?: boolean;
  unavailableMessage?: string;
}

export function RatingTimelineCard({
  enabled = true,
  unavailableMessage = "Timeline is only available for the signed-in player.",
}: RatingTimelineCardProps) {
  const [pool, setPool] = useState<RatingPool>("blitz");
  const [range, setRange] = useState<RatingRange>("90d");
  const { points, loading, error } = useRatingTimeline(pool, range, {
    enabled,
  });
  const chartSize = useElementSize<HTMLDivElement>();

  const chart = useMemo(() => {
    if (points.length === 0) {
      return {
        data: [] as Array<{
          idx: number;
          rating: number;
          label: string;
          timestamp: string;
          delta: number;
          rd?: number;
          volatility?: number;
        }>,
        min: 0,
        max: 0,
        first: 0,
        last: 0,
        yMin: 0,
        yMax: 0,
        lastPoint: null as null | {
          idx: number;
          rating: number;
          label: string;
          timestamp: string;
          delta: number;
          rd?: number;
          volatility?: number;
        },
      };
    }

    const data = points.map((point, index) => ({
      idx: index,
      rating: point.rating,
      label: formatPointDate(point.ts, range),
      timestamp: point.ts,
      delta: point.delta,
      rd: point.rd,
      volatility: point.volatility,
    }));
    const values = data.map((point) => point.rating);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = Math.max(8, Math.round((max - min) * 0.12));

    return {
      data,
      min,
      max,
      first: data[0]?.rating ?? 0,
      last: data[data.length - 1]?.rating ?? 0,
      yMin: min - padding,
      yMax: max + padding,
      lastPoint: data[data.length - 1] ?? null,
    };
  }, [points, range]);

  const delta = chart.last - chart.first;
  const deltaLabel = delta > 0 ? `+${delta}` : `${delta}`;

  return (
    <div className="min-w-0 bg-white/85 dark:bg-slate-900/70 rounded-2xl p-6 border border-gray-200/70 dark:border-white/10 shadow-[0_10px_30px_rgba(15,23,42,0.08)] dark:shadow-[0_12px_32px_rgba(0,0,0,0.4)] backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Rating Timeline
        </h3>
        <LineChartIcon className="w-5 h-5 text-teal-500" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {POOLS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setPool(option.id)}
            disabled={!enabled}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              pool === option.id
                ? "bg-teal-500 text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
            } ${!enabled ? "cursor-not-allowed opacity-60" : ""}`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {RANGES.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setRange(option.id)}
            disabled={!enabled}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${
              range === option.id
                ? "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300"
                : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
            } ${!enabled ? "cursor-not-allowed opacity-60" : ""}`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-gray-200/70 dark:border-white/10 bg-gray-50/90 dark:bg-black/20 p-3">
        {!enabled ? (
          <div className="flex h-[190px] items-center justify-center text-center text-sm text-gray-500 dark:text-gray-400">
            {unavailableMessage}
          </div>
        ) : loading ? (
          <div className="h-[190px] flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
            Loading timeline...
          </div>
        ) : error ? (
          <div className="h-[190px] flex items-center justify-center text-sm text-red-500">
            {error}
          </div>
        ) : points.length === 0 ? (
          <div className="h-[190px] flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
            No rated games in this range yet.
          </div>
        ) : (
          <motion.div
            key={`${pool}-${range}-${chart.data.length}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="min-w-0 space-y-2"
          >
            <div className="flex items-center justify-end">
              <span className="text-[12px] font-semibold text-gray-700 dark:text-gray-200">
                Current: {chart.last}
                {typeof chart.lastPoint?.rd === "number"
                  ? ` ± ${Math.round(chart.lastPoint.rd)}`
                  : ""}
              </span>
            </div>
            <div ref={chartSize.ref} className="h-[210px] w-full min-w-0">
              {chartSize.hasSize ? (
                <AreaChart
                  width={chartSize.width}
                  height={chartSize.height}
                  data={chart.data}
                  margin={{ top: 8, right: 6, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="ratingFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.42} />
                      <stop offset="90%" stopColor="#14b8a6" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    vertical={false}
                    strokeDasharray="2 6"
                    stroke="#475569"
                    opacity={0.28}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={42}
                  />
                  <YAxis
                    domain={[chart.yMin, chart.yMax]}
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    width={38}
                    axisLine={false}
                    tickLine={false}
                    tickCount={4}
                    tickFormatter={(value) => `${Math.round(Number(value))}`}
                  />
                  <Tooltip
                    cursor={{
                      stroke: "#0f766e",
                      strokeWidth: 1,
                      strokeDasharray: "4 4",
                    }}
                    contentStyle={{
                      background: "rgba(15, 23, 42, 0.96)",
                      border: "1px solid rgba(100, 116, 139, 0.35)",
                      borderRadius: "12px",
                      color: "#e2e8f0",
                      fontSize: "12px",
                      padding: "8px 10px",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
                    }}
                    labelStyle={{ color: "#cbd5e1", marginBottom: "4px" }}
                    formatter={(value: unknown) => [Number(value), "Rating"]}
                    labelFormatter={(_label: unknown, payload: any) => {
                      const ts = payload?.[0]?.payload?.timestamp;
                      return formatTooltipDate(String(ts || ""));
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="rating"
                    stroke="#14b8a6"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#ratingFill)"
                    isAnimationActive
                    animationDuration={850}
                    animationEasing="ease-out"
                    dot={(props: any) => {
                      if (
                        !chart.lastPoint ||
                        props?.index !== chart.lastPoint.idx ||
                        typeof props?.cx !== "number" ||
                        typeof props?.cy !== "number"
                      ) {
                        return null;
                      }
                      return (
                        <circle
                          cx={props.cx}
                          cy={props.cy}
                          r={4}
                          fill="#14b8a6"
                          stroke="#0f172a"
                          strokeWidth={2}
                        />
                      );
                    }}
                    activeDot={{
                      r: 4,
                      stroke: "#0f766e",
                      strokeWidth: 2,
                      fill: "#14b8a6",
                    }}
                  />
                </AreaChart>
              ) : (
                <div className="h-full w-full animate-pulse rounded-lg bg-slate-200/60 dark:bg-slate-800/50" />
              )}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>Low {chart.min}</span>
              <span
                className={`font-semibold ${
                  delta >= 0 ? "text-emerald-500" : "text-red-500"
                }`}
              >
                {deltaLabel}
              </span>
              <span>High {chart.max}</span>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
