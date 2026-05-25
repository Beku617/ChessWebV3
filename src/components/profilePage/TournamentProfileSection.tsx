import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslation } from "react-i18next";

export interface TournamentProfileData {
  currentElo: number;
  eloTier: string;
  eloHistory: Array<{
    date: string | null;
    elo: number;
    delta: number;
  }>;
  tournamentHistory: Array<{
    tournamentId: string;
    tournamentName: string;
    format: string;
    placement: number | null;
    score: number;
    eloChange: number;
    date: string | null;
    status: string;
  }>;
  record: {
    wins: number;
    draws: number;
    losses: number;
  };
  tournamentsCreated: Array<{
    id: string;
    name: string;
    format: string;
    status: string;
    createdAt: string | null;
  }>;
}

interface Props {
  data: TournamentProfileData | null;
  isLoading?: boolean;
  title?: string;
}

const AUTO_Y_DOMAIN: ["auto", "auto"] = ["auto", "auto"];

function formatDateLabel(input: string | null) {
  if (!input) return "-";
  const date = new Date(input);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleDateString();
}

export default function TournamentProfileSection({
  data,
  isLoading = false,
  title,
}: Props) {
  const { t } = useTranslation();
  const resolvedTitle = title || t("tournamentProfile.title");

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-theme-glass bg-theme-panel p-4 space-y-3">
        <div className="h-5 w-40 animate-pulse rounded bg-theme-surface" />
        <div className="h-28 animate-pulse rounded bg-theme-surface" />
        <div className="h-24 animate-pulse rounded bg-theme-surface" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-theme-glass bg-theme-panel p-4 text-sm text-theme-muted">
        {t("tournamentProfile.unavailable")}
      </div>
    );
  }

  const history = data.eloHistory.map((point) => ({
    date: point.date,
    label: formatDateLabel(point.date),
    elo: Number(point.elo || 1200),
    delta: Number(point.delta || 0),
  }));

  return (
    <section className="rounded-2xl border border-theme-glass bg-theme-panel p-4 space-y-4">
      <div>
        <h3 className="text-base font-semibold text-theme-foreground ">
          {resolvedTitle}
        </h3>
        <p className="text-xs text-theme-muted mt-1">
          {t("tournamentProfile.description")}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-theme-glass bg-theme-surface/40 px-3 py-2">
          <div className="text-xs text-theme-muted">
            {t("tournamentProfile.currentElo")}
          </div>
          <div className="text-lg font-bold text-theme-foreground ">
            {data.currentElo}
          </div>
          <div className="text-xs text-emerald-600">{data.eloTier}</div>
        </div>
        <div className="rounded-xl border border-theme-glass bg-theme-surface/40 px-3 py-2">
          <div className="text-xs text-theme-muted">
            {t("tournamentProfile.record")}
          </div>
          <div className="text-lg font-bold text-theme-foreground ">
            {data.record.wins} / {data.record.draws} / {data.record.losses}
          </div>
          <div className="text-xs text-theme-muted">
            {t("tournamentProfile.allTournaments")}
          </div>
        </div>
        <div className="rounded-xl border border-theme-glass bg-theme-surface/40 px-3 py-2">
          <div className="text-xs text-theme-muted">
            {t("tournamentProfile.tournamentsCreated")}
          </div>
          <div className="text-lg font-bold text-theme-foreground ">
            {data.tournamentsCreated.length}
          </div>
          <div className="text-xs text-theme-muted">
            {t("tournamentProfile.organizerActivity")}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-theme-glass bg-theme-surface/40 px-3 py-3">
        <div className="mb-2 text-sm font-semibold text-theme-foreground ">
          {t("tournamentProfile.eloHistory")}
        </div>
        {history.length === 0 ? (
          <div className="text-xs text-theme-muted">
            {t("tournamentProfile.noEloEvents")}
          </div>
        ) : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <XAxis dataKey="label" hide />
                <YAxis hide domain={AUTO_Y_DOMAIN} />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    value,
                    name === "elo"
                      ? t("tournamentProfile.elo")
                      : t("tournamentProfile.delta"),
                  ]}
                  labelFormatter={(label) =>
                    t("tournamentProfile.dateLabel", { label })
                  }
                />
                <Line
                  type="monotone"
                  dataKey="elo"
                  stroke="rgb(var(--accent-rgb))"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-sm font-semibold text-theme-foreground ">
          {t("tournamentProfile.historyTitle")}
        </div>
        <div className="overflow-x-auto rounded-xl border border-theme-glass ">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-theme-surface/50 text-theme-muted">
              <tr>
                <th className="px-3 py-2">{t("profileGames.columns.tournament")}</th>
                <th className="px-3 py-2">{t("profileGames.columns.format")}</th>
                <th className="px-3 py-2">{t("profileGames.columns.placement")}</th>
                <th className="px-3 py-2">{t("profileGames.columns.score")}</th>
                <th className="px-3 py-2">{t("profileGames.columns.eloChange")}</th>
                <th className="px-3 py-2">{t("profileGames.columns.date")}</th>
              </tr>
            </thead>
            <tbody>
              {data.tournamentHistory.slice(0, 20).map((row) => (
                <tr key={`${row.tournamentId}:${row.date || ""}`} className="border-t border-theme-glass ">
                  <td className="px-3 py-2 text-theme-foreground ">{row.tournamentName}</td>
                  <td className="px-3 py-2 text-theme-muted">{row.format}</td>
                  <td className="px-3 py-2 text-theme-muted">
                    {row.placement ? `#${row.placement}` : "-"}
                  </td>
                  <td className="px-3 py-2 text-theme-muted">{row.score}</td>
                  <td
                    className={`px-3 py-2 font-semibold ${
                      row.eloChange >= 0
                        ? "text-emerald-600"
                        : "text-red-600"
                    }`}
                  >
                    {row.eloChange >= 0 ? "+" : ""}
                    {row.eloChange}
                  </td>
                  <td className="px-3 py-2 text-theme-muted">
                    {formatDateLabel(row.date)}
                  </td>
                </tr>
              ))}
              {data.tournamentHistory.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-6 text-center text-sm text-theme-muted"
                  >
                    {t("profileGames.noTournamentHistory")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
