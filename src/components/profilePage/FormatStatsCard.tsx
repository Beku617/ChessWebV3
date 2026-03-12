import { useMemo, type ComponentType } from "react";
import {
  Area,
  AreaChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDown,
  ArrowUp,
  Clock3,
  Landmark,
  Shield,
  TimerReset,
  Zap,
} from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { type RatingPool, type RatingTimelinePoint, useRatingTimeline } from "../../hooks/useRatingsData";
import { useElementSize } from "../../hooks/useElementSize";

const CARD_THEME: Record<
  RatingPool,
  {
    label: string;
    icon: ComponentType<{ className?: string }>;
    iconColor: string;
    lineColor: string;
  }
> = {
  rapid: {
    label: "Rapid",
    icon: Clock3,
    iconColor: "text-lime-400",
    lineColor: "#7dd3fc",
  },
  blitz: {
    label: "Blitz",
    icon: Zap,
    iconColor: "text-amber-400",
    lineColor: "#7dd3fc",
  },
  bullet: {
    label: "Bullet",
    icon: TimerReset,
    iconColor: "text-orange-400",
    lineColor: "#67e8f9",
  },
  classical: {
    label: "Classical",
    icon: Landmark,
    iconColor: "text-sky-400",
    lineColor: "#93c5fd",
  },
};

function buildSparkline(points: RatingTimelinePoint[], fallbackRating: number) {
  if (!points.length) {
    return Array.from({ length: 14 }, (_, idx) => ({
      x: idx,
      rating: fallbackRating,
    }));
  }

  const stride = Math.max(1, Math.ceil(points.length / 20));
  const sampled = points
    .filter((_, index) => index % stride === 0 || index === points.length - 1)
    .map((point, idx) => ({ x: idx, rating: point.rating }));

  if (sampled.length === 1) {
    sampled.push({ x: 1, rating: sampled[0].rating });
  }

  return sampled;
}

function ratingChange(points: RatingTimelinePoint[]) {
  if (points.length < 2) return 0;
  return points[points.length - 1].rating - points[0].rating;
}

interface FormatSparklineProps {
  id: string;
  data: Array<{ x: number; rating: number }>;
  lineColor: string;
  loading: boolean;
}

function FormatSparkline({
  id,
  data,
  lineColor,
  loading,
}: FormatSparklineProps) {
  const chart = useElementSize<HTMLDivElement>();

  return (
    <div
      ref={chart.ref}
      className="mt-3 h-14 w-full min-w-0 overflow-hidden rounded-lg bg-slate-900/45"
    >
      {loading || !chart.hasSize ? (
        <div className="h-full w-full bg-gradient-to-r from-slate-700/20 via-slate-600/20 to-slate-700/20 animate-pulse" />
      ) : (
        <AreaChart
          width={chart.width}
          height={chart.height}
          data={data}
          margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
        >
          <XAxis dataKey="x" hide />
          <YAxis
            hide
            domain={[
              (dataMin: number) => Math.floor(dataMin - 10),
              (dataMax: number) => Math.ceil(dataMax + 10),
            ]}
          />
          <defs>
            <linearGradient id={`poolFill-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity={0.24} />
              <stop offset="100%" stopColor={lineColor} stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="rating"
            stroke={lineColor}
            strokeWidth={2.5}
            fill={`url(#poolFill-${id})`}
            dot={false}
            activeDot={false}
            isAnimationActive
            animationDuration={700}
          />
        </AreaChart>
      )}
    </div>
  );
}

export function FormatStatsCard() {
  const { user } = useAuthStore();
  const bulletTimeline = useRatingTimeline("bullet", "30d");
  const blitzTimeline = useRatingTimeline("blitz", "30d");
  const rapidTimeline = useRatingTimeline("rapid", "30d");
  const classicalTimeline = useRatingTimeline("classical", "30d");

  const formats = [
    {
      id: "rapid",
      timeline: rapidTimeline,
      rating: Number(user?.rapidRating ?? user?.rating ?? 1200),
      games: Number(user?.rapidGames ?? 0),
    },
    {
      id: "blitz",
      timeline: blitzTimeline,
      rating: Number(user?.blitzRating ?? user?.rating ?? 1200),
      games: Number(user?.blitzGames ?? 0),
    },
    {
      id: "bullet",
      timeline: bulletTimeline,
      rating: Number(user?.bulletRating ?? user?.rating ?? 1200),
      games: Number(user?.bulletGames ?? 0),
    },
    {
      id: "classical",
      timeline: classicalTimeline,
      rating: Number(user?.classicalRating ?? user?.rating ?? 1200),
      games: Number(user?.classicalGames ?? 0),
    },
  ] as const;

  const cards = useMemo(
    () =>
      formats.map((format) => {
        const pool = format.id as RatingPool;
        const points = format.timeline.points || [];
        return {
          ...format,
          pool,
          meta: CARD_THEME[pool],
          sparkline: buildSparkline(points, format.rating),
          delta: ratingChange(points),
          loading: format.timeline.loading,
        };
      }),
    [formats],
  );

  return (
    <div className="bg-white/85 dark:bg-slate-900/70 rounded-2xl p-5 border border-gray-200/70 dark:border-white/10 shadow-[0_10px_30px_rgba(15,23,42,0.08)] dark:shadow-[0_12px_32px_rgba(0,0,0,0.4)] backdrop-blur">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Format Ratings
        </h3>
        <Shield className="w-5 h-5 text-teal-500" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {cards.map((format) => (
          <div
            key={format.id}
            className="group min-w-0 rounded-2xl border border-white/10 bg-[linear-gradient(140deg,rgba(31,41,55,0.94),rgba(28,33,45,0.9))] p-4 shadow-[0_14px_30px_rgba(0,0,0,0.32)] hover:translate-y-[-1px] hover:shadow-[0_18px_38px_rgba(0,0,0,0.42)] transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <format.meta.icon
                  className={`w-7 h-7 mt-1 ${format.meta.iconColor}`}
                />
                <div>
                  <div className="text-gray-300 text-sm">{format.meta.label}</div>
                  <div className="mt-0.5 flex items-end gap-2">
                    <span className="text-white text-[42px] font-bold leading-none tracking-tight">
                      {format.rating}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 text-sm font-semibold pb-1 ${
                        format.delta >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {format.delta >= 0 ? (
                        <ArrowUp className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowDown className="w-3.5 h-3.5" />
                      )}
                      {Math.abs(format.delta)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-gray-400">
                  {format.games < 10
                    ? `Provisional (${format.games}/10)`
                    : `${format.games} games`}
                </div>
              </div>
            </div>

            <FormatSparkline
              id={format.id}
              data={format.sparkline}
              lineColor={format.meta.lineColor}
              loading={format.loading}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
