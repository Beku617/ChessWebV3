import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Area,
  AreaChart,
  XAxis,
  YAxis,
} from "recharts";
import { useAuthStore } from "../../store/authStore";
import { type RatingPool, type RatingTimelinePoint, useRatingTimeline } from "../../hooks/useRatingsData";
import { useElementSize } from "../../hooks/useElementSize";

export interface RatingSnapshot {
  rating?: number;
  bulletRating?: number;
  blitzRating?: number;
  rapidRating?: number;
  classicalRating?: number;
  bulletGames?: number;
  blitzGames?: number;
  rapidGames?: number;
  classicalGames?: number;
}

const CARD_THEME: Record<
  RatingPool,
  {
    lineColor: string;
  }
> = {
  rapid: {
    lineColor: "rgb(var(--accent-muted-rgb))",
  },
  blitz: {
    lineColor: "rgb(var(--accent-rgb))",
  },
  bullet: {
    lineColor: "rgb(var(--accent-hover-rgb))",
  },
  classical: {
    lineColor: "rgb(var(--accent-muted-rgb))",
  },
};

function buildSparkline(points: RatingTimelinePoint[], fallbackRating: number) {
  if (!points.length) {
    return Array.from({ length: 14 }, (_, idx) => ({
      x: idx,
      rating: fallbackRating,
    }));
  }

  if (points.length === 1) {
    const only = points[0];
    const endRating = Number.isFinite(Number(only.rating))
      ? Number(only.rating)
      : fallbackRating;
    const delta = Number.isFinite(Number(only.delta)) ? Number(only.delta) : 0;
    const startRating = endRating - delta;
    return [
      { x: 0, rating: startRating },
      { x: 1, rating: endRating },
    ];
  }

  const stride = Math.max(1, Math.ceil(points.length / 20));
  const sampled = points
    .filter((_, index) => index % stride === 0 || index === points.length - 1)
    .map((point, idx) => ({ x: idx, rating: point.rating }));

  return sampled;
}

function ratingChange(points: RatingTimelinePoint[]) {
  if (points.length === 1) {
    return Number.isFinite(Number(points[0].delta)) ? Number(points[0].delta) : 0;
  }
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
      className="mt-3 h-14 w-full min-w-0 overflow-hidden rounded-lg bg-theme-surface/95"
    >
      {loading || !chart.hasSize ? (
        <div className="h-full w-full animate-pulse bg-gradient-to-r from-theme-surface via-theme-panel to-theme-surface" />
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

interface FormatStatsCardProps {
  ratingSnapshot?: RatingSnapshot | null;
  enableTimeline?: boolean;
}

export function FormatStatsCard({
  ratingSnapshot,
  enableTimeline = true,
}: FormatStatsCardProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const sourceUser = ratingSnapshot ?? user;
  const bulletTimeline = useRatingTimeline("bullet", "30d", {
    enabled: enableTimeline,
  });
  const blitzTimeline = useRatingTimeline("blitz", "30d", {
    enabled: enableTimeline,
  });
  const rapidTimeline = useRatingTimeline("rapid", "30d", {
    enabled: enableTimeline,
  });
  const classicalTimeline = useRatingTimeline("classical", "30d", {
    enabled: enableTimeline,
  });

  const formats = [
    {
      id: "rapid",
      timeline: rapidTimeline,
      rating: Number(sourceUser?.rapidRating ?? sourceUser?.rating ?? 1200),
      games: Number(sourceUser?.rapidGames ?? 0),
    },
    {
      id: "blitz",
      timeline: blitzTimeline,
      rating: Number(sourceUser?.blitzRating ?? sourceUser?.rating ?? 1200),
      games: Number(sourceUser?.blitzGames ?? 0),
    },
    {
      id: "bullet",
      timeline: bulletTimeline,
      rating: Number(sourceUser?.bulletRating ?? sourceUser?.rating ?? 1200),
      games: Number(sourceUser?.bulletGames ?? 0),
    },
    {
      id: "classical",
      timeline: classicalTimeline,
      rating: Number(
        sourceUser?.classicalRating ?? sourceUser?.rating ?? 1200,
      ),
      games: Number(sourceUser?.classicalGames ?? 0),
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
    <div className="bg-theme-panel/85 rounded-2xl p-5 border border-theme-glass/70 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-theme-foreground ">
          {t("profileWidgets.formatRatingsTitle", "Format Ratings")}
        </h3>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {cards.map((format) => (
          <div
            key={format.id}
            className="group min-w-0 rounded-2xl border border-theme-border/90 bg-theme-card p-4 shadow-[0_12px_28px_rgba(15,23,42,0.08)] transition-all hover:-translate-y-[1px] hover:shadow-[0_18px_34px_rgba(15,23,42,0.14)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div>
                  <div className="text-sm text-theme-muted">
                    {t(`profileGames.pools.${format.pool}`, format.pool)}
                  </div>
                  <div className="mt-0.5 flex items-end gap-2">
                    <span className="text-[42px] font-bold leading-none tracking-tight text-theme-foreground ">
                      {format.rating}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 text-sm font-semibold pb-1 ${
                        format.delta >= 0 ? "text-brand-400" : "text-theme-muted"
                      }`}
                    >
                      {format.delta >= 0 ? "+" : "-"}
                      {Math.abs(format.delta)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-theme-muted">
                  {format.games < 10
                    ? t("profileGames.provisionalGames", {
                        count: format.games,
                        total: 10,
                        defaultValue: "Provisional ({{count}}/{{total}})",
                      })
                    : t("profileGames.gamesCount", {
                        count: format.games,
                        defaultValue: "{{count}} games",
                      })}
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


