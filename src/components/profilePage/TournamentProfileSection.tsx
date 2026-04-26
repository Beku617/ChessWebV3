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
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
        <div className="h-5 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
        <div className="h-28 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
        <div className="h-24 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 text-sm text-gray-500 dark:text-gray-400">
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
    <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {resolvedTitle}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {t("tournamentProfile.description")}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/40 px-3 py-2">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {t("tournamentProfile.currentElo")}
          </div>
          <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {data.currentElo}
          </div>
          <div className="text-xs text-emerald-600 dark:text-emerald-400">{data.eloTier}</div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/40 px-3 py-2">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {t("tournamentProfile.record")}
          </div>
          <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {data.record.wins} / {data.record.draws} / {data.record.losses}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {t("tournamentProfile.allTournaments")}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/40 px-3 py-2">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {t("tournamentProfile.tournamentsCreated")}
          </div>
          <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {data.tournamentsCreated.length}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {t("tournamentProfile.organizerActivity")}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/40 px-3 py-3">
        <div className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
          {t("tournamentProfile.eloHistory")}
        </div>
        {history.length === 0 ? (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {t("tournamentProfile.noEloEvents")}
          </div>
        ) : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <XAxis dataKey="label" hide />
                <YAxis hide domain={["auto", "auto"]} />
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
                  stroke="#10b981"
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
        <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          {t("tournamentProfile.historyTitle")}
        </div>
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-gray-50 dark:bg-gray-950/50 text-gray-500 dark:text-gray-400">
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
                <tr key={`${row.tournamentId}:${row.date || ""}`} className="border-t border-gray-200 dark:border-gray-800">
                  <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{row.tournamentName}</td>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.format}</td>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                    {row.placement ? `#${row.placement}` : "-"}
                  </td>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.score}</td>
                  <td
                    className={`px-3 py-2 font-semibold ${
                      row.eloChange >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {row.eloChange >= 0 ? "+" : ""}
                    {row.eloChange}
                  </td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                    {formatDateLabel(row.date)}
                  </td>
                </tr>
              ))}
              {data.tournamentHistory.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400"
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
