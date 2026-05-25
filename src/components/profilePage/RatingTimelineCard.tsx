import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { LineChart as LineChartIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
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

type TimelineChartPoint = {
  idx: number;
  x: string;
  rating: number;
  displayLabel: string;
  timestamp: string;
  delta: number;
  rd?: number;
  volatility?: number;
};

/**
 * Recharts needs at least 2 data points to draw line/area.
 * If only one point exists, duplicate it with an empty label so XAxis does
 * not render duplicate tick text.
 */
function buildRenderableData(
  data: TimelineChartPoint[],
): { points: TimelineChartPoint[]; lastRenderIdx: number } {
  if (data.length !== 1) {
    return { points: data, lastRenderIdx: data.length - 1 };
  }

  const only = data[0];
  const maybeTs = Date.parse(only.timestamp);
  const syntheticTimestamp = Number.isFinite(maybeTs)
    ? new Date(maybeTs + 1000).toISOString()
    : `${only.timestamp}__duplicate`;
  return {
    points: [
      only,
      {
        ...only,
        idx: only.idx + 1,
        x: `${only.x}__duplicate`,
        timestamp: syntheticTimestamp,
        displayLabel: "",
      },
    ],
    lastRenderIdx: 1,
  };
}

function formatPointDate(value: string, range: RatingRange, locale?: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;

  if (range === "7d" || range === "30d") {
    return date.toLocaleDateString(locale || undefined, {
      month: "short",
      day: "numeric",
    });
  }

  return date.toLocaleDateString(locale || undefined, {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

function formatTooltipDate(value: string, locale?: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;

  return date.toLocaleString(locale || undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeRating(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

type TooltipPayloadEntry = {
  payload?: TimelineChartPoint;
};

interface RatingTimelineCardProps {
  enabled?: boolean;
  unavailableMessage?: string;
}

export function RatingTimelineCard({
  enabled = true,
  unavailableMessage,
}: RatingTimelineCardProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language || "en";
  const [pool, setPool] = useState<RatingPool>("blitz");
  const [range, setRange] = useState<RatingRange>("90d");
  const { points, loading, error } = useRatingTimeline(pool, range, { enabled });
  const chartSize = useElementSize<HTMLDivElement>();

  const chart = useMemo(() => {
    if (points.length === 0) {
      return {
        data: [] as TimelineChartPoint[],
        renderData: [] as TimelineChartPoint[],
        lastRenderIdx: -1,
        min: 0,
        max: 0,
        first: 0,
        last: 0,
        yMin: 0,
        yMax: 0,
        lastPoint: null as TimelineChartPoint | null,
      };
    }

    const data: TimelineChartPoint[] = points.map((point, index) => ({
      idx: index,
      x: `${point.ts}#${index}`,
      rating: normalizeRating(point.rating),
      displayLabel: formatPointDate(point.ts, range, locale),
      timestamp: point.ts,
      delta: point.delta,
      rd: point.rd,
      volatility: point.volatility,
    }));

    const { points: renderData, lastRenderIdx } = buildRenderableData(data);
    const values = data.map((p) => p.rating);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = Math.max(8, Math.round((max - min) * 0.12));

    return {
      data,
      renderData,
      lastRenderIdx,
      min,
      max,
      first: data[0]?.rating ?? 0,
      last: data[data.length - 1]?.rating ?? 0,
      yMin: min - padding,
      yMax: max + padding,
      lastPoint: data[data.length - 1] ?? null,
    };
  }, [locale, points, range]);

  const delta = chart.last - chart.first;
  const isSinglePoint = chart.data.length <= 1;
  const deltaLabel = isSinglePoint ? "--" : delta > 0 ? `+${delta}` : `${delta}`;
  const selectedPoolLabel = t(
    `profileGames.pools.${pool}`,
    POOLS.find((option) => option.id === pool)?.label ?? pool,
  );
  const selectedRangeLabel =
    RANGES.find((option) => option.id === range)?.label ?? range.toUpperCase();

  return (
    <div className="h-full min-w-0 bg-theme-panel/85 rounded-2xl p-6 border border-theme-glass/70 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-theme-foreground ">
          {t("profileWidgets.ratingTimelineTitle", "Rating Timeline")}
        </h3>
        <LineChartIcon className="w-5 h-5 text-brand-500" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-theme-glass/70 bg-theme-panel/60 p-1.5">
        {POOLS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setPool(option.id)}
            disabled={!enabled}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
              pool === option.id
                ? "bg-brand-500 text-theme-on-accent shadow-[0_8px_20px_rgba(20,184,166,0.35)]"
                : "bg-theme-surface text-theme-muted hover:bg-theme-surface/80"
            } ${!enabled ? "cursor-not-allowed opacity-60" : ""}`}
          >
            {t(`profileGames.pools.${option.id}`, option.label)}
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-theme-glass/70 bg-theme-panel/60 p-1.5">
        {RANGES.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setRange(option.id)}
            disabled={!enabled}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all duration-150 ${
              range === option.id
                ? "bg-brand-100 text-brand-700"
                : "bg-theme-surface text-theme-muted hover:bg-theme-surface/80"
            } ${!enabled ? "cursor-not-allowed opacity-60" : ""}`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-theme-glass/70 bg-theme-surface/90 p-3 flex-1 flex flex-col">
        {!enabled ? (
          <div className="flex min-h-[190px] flex-1 items-center justify-center text-center text-sm text-theme-muted">
            {unavailableMessage ||
              t(
                "profileWidgets.timelineUnavailable",
                "Timeline is only available for the signed-in player.",
              )}
          </div>
        ) : loading ? (
          <div className="min-h-[190px] flex-1 flex items-center justify-center text-sm text-theme-muted">
            {t("profileWidgets.loadingTimeline", "Loading timeline...")}
          </div>
        ) : error ? (
          <div className="min-h-[190px] flex-1 flex items-center justify-center text-sm text-theme-muted">
            {error}
          </div>
        ) : points.length === 0 ? (
          <div className="min-h-[190px] flex-1 flex items-center justify-center text-sm text-theme-muted">
            {t(
              "profileWidgets.noRatedGamesInRange",
              "No rated games in this range yet.",
            )}
          </div>
        ) : (
          <motion.div
            key={`${pool}-${range}-${chart.renderData.length}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="min-w-0 space-y-2 flex-1 flex flex-col"
          >
            <div className="flex items-center justify-between gap-2 rounded-lg border border-theme-glass/70 bg-theme-panel/55 px-3 py-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-theme-muted">
                {selectedPoolLabel} | {selectedRangeLabel}
              </span>
              <span className="text-[12px] font-semibold text-theme-muted ">
                {t("profileWidgets.current", "Current")}: {chart.last}
                {typeof chart.lastPoint?.rd === "number"
                  ? ` ${t("profileWidgets.plusMinus", "+/-")} ${Math.round(chart.lastPoint.rd)}`
                  : ""}
              </span>
            </div>

            <div ref={chartSize.ref} className="h-[210px] w-full min-w-0">
              {chartSize.hasSize ? (
                <AreaChart
                  width={chartSize.width}
                  height={chartSize.height}
                  data={chart.renderData}
                  margin={{ top: 8, right: 6, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="ratingFill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="rgb(var(--accent-rgb))"
                        stopOpacity={0.42}
                      />
                      <stop
                        offset="90%"
                        stopColor="rgb(var(--accent-rgb))"
                        stopOpacity={0.04}
                      />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    vertical={false}
                    strokeDasharray="2 6"
                    stroke="rgba(var(--border-color-rgb), 0.52)"
                    opacity={0.28}
                  />
                  <XAxis
                    dataKey="x"
                    tick={{ fill: "rgb(var(--text-secondary-rgb))", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={42}
                    tickFormatter={(value: string) => {
                      const separatorIndex = value.lastIndexOf("#");
                      const ts =
                        separatorIndex >= 0 ? value.slice(0, separatorIndex) : value;
                      return formatPointDate(ts, range, locale);
                    }}
                  />
                  <YAxis
                    domain={[chart.yMin, chart.yMax]}
                    tick={{ fill: "rgb(var(--text-secondary-rgb))", fontSize: 11 }}
                    width={38}
                    axisLine={false}
                    tickLine={false}
                    tickCount={4}
                    tickFormatter={(value: number) => `${Math.round(value)}`}
                  />
                  <Tooltip
                    cursor={{
                      stroke: "var(--accent-hover)",
                      strokeWidth: 1,
                      strokeDasharray: "4 4",
                    }}
                    contentStyle={{
                      background: "rgba(var(--bg-base-rgb), 0.96)",
                      border: "1px solid rgba(var(--border-color-rgb), 0.35)",
                      borderRadius: "12px",
                      color: "rgb(var(--text-primary-rgb))",
                      fontSize: "12px",
                      padding: "8px 10px",
                      boxShadow: "0 8px 24px var(--shadow-color)",
                    }}
                    labelStyle={{
                      color: "rgb(var(--text-secondary-rgb))",
                      marginBottom: "4px",
                    }}
                    formatter={(value: number) =>
                      [value, t("profileWidgets.rating", "Rating")] as [number, string]
                    }
                    labelFormatter={(_label: string, payload: TooltipPayloadEntry[]) => {
                      const ts = payload?.[0]?.payload?.timestamp;
                      return ts ? formatTooltipDate(ts, locale) : "";
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="rating"
                    stroke="rgb(var(--accent-rgb))"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#ratingFill)"
                    isAnimationActive
                    animationDuration={850}
                    animationEasing="ease-out"
                    dot={(
                      props: {
                        index?: number;
                        cx?: number;
                        cy?: number;
                        key?: string;
                      },
                    ) => {
                      const isLast =
                        typeof props.index === "number" &&
                        props.index === chart.lastRenderIdx &&
                        typeof props.cx === "number" &&
                        typeof props.cy === "number";

                      if (!isLast) return <g key={props.key} />;

                      return (
                        <circle
                          key={props.key}
                          cx={props.cx}
                          cy={props.cy}
                          r={4}
                          fill="rgb(var(--accent-rgb))"
                          stroke="rgb(var(--bg-base-rgb))"
                          strokeWidth={2}
                        />
                      );
                    }}
                    activeDot={{
                      r: 4,
                      stroke: "var(--accent-hover)",
                      strokeWidth: 2,
                      fill: "rgb(var(--accent-rgb))",
                    }}
                  />
                </AreaChart>
              ) : (
                <div className="h-full w-full animate-pulse rounded-lg bg-theme-surface/60" />
              )}
            </div>

            <div className="mt-2 flex items-center justify-between text-xs text-theme-muted">
              <span>{t("profileWidgets.low", "Low")} {chart.min}</span>
              <span
                className={`rounded-md px-2 py-0.5 font-semibold ${
                  isSinglePoint
                    ? "text-theme-muted"
                    : delta >= 0
                      ? "text-brand-500"
                      : "text-theme-muted"
                }`}
              >
                {deltaLabel}
              </span>
              <span>{t("profileWidgets.high", "High")} {chart.max}</span>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
