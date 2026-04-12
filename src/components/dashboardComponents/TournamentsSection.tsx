import { useEffect, useState } from "react";
import { AlertCircle, Crown, Trophy, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

type TournamentStatus = "draft" | "registering" | "running" | "finished";

interface TournamentSummary {
  id: string;
  name: string;
  status: TournamentStatus;
  roundsPlanned: number;
  currentRound: number;
  registeredCount: number;
  isRegistered: boolean;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt?: string | null;
  timeControl?: {
    baseMs: number;
    incMs: number;
    label?: string;
  };
}

interface WinnerSummary {
  name: string;
  score: number;
  buchholz: number;
}

interface TournamentDetail {
  tournament?: TournamentSummary;
  winners?: WinnerSummary[];
}

function timeControlLabel(
  value?: TournamentSummary["timeControl"],
): string {
  if (!value) return "3+0";
  if (value.label?.trim()) return value.label.trim();

  const baseMinutes = Math.max(1, Math.round(Number(value.baseMs || 0) / 60000));
  const increment = Math.max(0, Math.round(Number(value.incMs || 0) / 1000));
  return `${baseMinutes}+${increment}`;
}

function toTimestamp(value?: string | null): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortByNewest(
  items: TournamentSummary[],
  field: "startedAt" | "finishedAt" | "createdAt",
) {
  return [...items].sort((a, b) => {
    const primaryDiff = toTimestamp(b[field]) - toTimestamp(a[field]);
    if (primaryDiff !== 0) return primaryDiff;
    return toTimestamp(b.createdAt) - toTimestamp(a.createdAt);
  });
}

function formatAbsoluteDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatRelativeTime(value?: string | null) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return formatAbsoluteDate(value);
}

function getCardClasses(status: TournamentStatus) {
  if (status === "running") {
    return "bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:from-[#17120f] dark:via-[#1d1714] dark:to-[#140f0d] border-amber-200/80 dark:border-amber-800/35";
  }

  if (status === "registering") {
    return "bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-[#101721] dark:via-[#111b2b] dark:to-[#0d1520] border-slate-200 dark:border-blue-900/30";
  }

  return "bg-gradient-to-br from-stone-50 via-white to-amber-50 dark:from-[#151515] dark:via-[#191919] dark:to-[#15120f] border-stone-200 dark:border-stone-700/40";
}

function getStatusLabel(item: TournamentSummary) {
  if (item.status === "running") {
    const relativeStart = formatRelativeTime(item.startedAt);
    return relativeStart ? `Started ${relativeStart}` : "In progress";
  }

  if (item.status === "registering") {
    return "Open registration";
  }

  return item.finishedAt ? `Finished ${formatAbsoluteDate(item.finishedAt)}` : "Completed";
}

function getActionLabel(item: TournamentSummary) {
  if (item.status === "finished") return "Results";
  if (item.status === "running") return "View";
  return item.isRegistered ? "View" : "Register";
}

function buildTournamentUrl(id: string) {
  return `/tournaments?selected=${encodeURIComponent(id)}`;
}

function LoadingCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[0, 1].map((index) => (
        <div
          key={index}
          className="animate-pulse rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/35 p-4 sm:p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-40 rounded bg-gray-200 dark:bg-gray-700/70" />
              <div className="h-3 w-28 rounded bg-gray-200 dark:bg-gray-700/60" />
            </div>
            <div className="h-5 w-24 rounded-full bg-gray-200 dark:bg-gray-700/60" />
          </div>
          <div className="mt-6 flex items-center justify-between gap-3">
            <div className="h-3 w-32 rounded bg-gray-200 dark:bg-gray-700/60" />
            <div className="h-8 w-20 rounded-md bg-gray-200 dark:bg-gray-700/60" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TournamentsSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [finishedDetail, setFinishedDetail] = useState<TournamentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadTournaments = async (silent = false) => {
      try {
        if (!silent) setLoading(true);

        const res = await fetch(`${API_URL}/api/tournaments?limit=50`, {
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error("Failed to load tournaments");
        }

        const data = await res.json();
        if (cancelled) return;

        const nextTournaments = Array.isArray(data?.tournaments)
          ? (data.tournaments as TournamentSummary[])
          : [];

        setTournaments(nextTournaments);
        setError(null);

        const running = sortByNewest(
          nextTournaments.filter((item) => item.status === "running"),
          "startedAt",
        );
        const upcoming = sortByNewest(
          nextTournaments.filter((item) => item.status === "registering"),
          "createdAt",
        );

        if (running.length > 0 || upcoming.length > 0) {
          setFinishedDetail(null);
          return;
        }

        const latestFinished = sortByNewest(
          nextTournaments.filter((item) => item.status === "finished"),
          "finishedAt",
        )[0];

        if (!latestFinished?.id) {
          setFinishedDetail(null);
          return;
        }

        const detailRes = await fetch(
          `${API_URL}/api/tournaments/${latestFinished.id}`,
          {
            credentials: "include",
          },
        );

        if (cancelled) return;

        if (!detailRes.ok) {
          setFinishedDetail({ tournament: latestFinished, winners: [] });
          return;
        }

        const detailData = await detailRes.json();
        if (cancelled) return;

        setFinishedDetail({
          tournament: detailData?.tournament || latestFinished,
          winners: Array.isArray(detailData?.winners) ? detailData.winners : [],
        });
      } catch (err) {
        if (silent || cancelled) return;
        setError(
          err instanceof Error ? err.message : "Failed to load tournaments",
        );
        setTournaments([]);
        setFinishedDetail(null);
      } finally {
        if (!silent && !cancelled) {
          setLoading(false);
        }
      }
    };

    void loadTournaments();

    const intervalId = window.setInterval(() => {
      void loadTournaments(true);
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [reloadKey]);

  const runningTournaments = sortByNewest(
    tournaments.filter((item) => item.status === "running"),
    "startedAt",
  );
  const upcomingTournaments = sortByNewest(
    tournaments.filter((item) => item.status === "registering"),
    "createdAt",
  );
  const prioritizedTournaments =
    runningTournaments.length > 0 ? runningTournaments : upcomingTournaments;

  if (loading) {
    return <LoadingCards />;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500 dark:text-red-400" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {t("Unable to load tournaments")}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t("Please try again in a moment.")}
              </p>
            </div>
          </div>
          <button
            onClick={() => setReloadKey((value) => value + 1)}
            className="inline-flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            {t("Retry")}
          </button>
        </div>
      </div>
    );
  }

  if (prioritizedTournaments.length > 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {prioritizedTournaments.map((tournament) => (
          <div
            key={tournament.id}
            className={`min-w-0 rounded-xl border p-4 sm:p-5 shadow-sm ${getCardClasses(
              tournament.status,
            )}`}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600 dark:text-amber-300">
                  <Trophy className="h-3.5 w-3.5" />
                  <span>
                    {tournament.status === "running" ? t("Active") : t("Upcoming")}
                  </span>
                </div>
                <h3 className="mt-2 text-lg font-semibold leading-tight text-gray-900 dark:text-white break-words">
                  {tournament.name}
                </h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 break-words">
                  {timeControlLabel(tournament.timeControl)}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 break-words">
                  {tournament.status === "running"
                    ? `Round ${Math.max(1, tournament.currentRound)} of ${Math.max(
                        1,
                        tournament.roundsPlanned,
                      )}`
                    : "Registration open"}
                </p>
              </div>

              <div className="shrink-0">
                <span className="inline-flex rounded-full border border-white/10 bg-white/60 px-2.5 py-1 text-[11px] font-medium text-gray-700 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-200">
                  {getStatusLabel(tournament)}
                </span>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="inline-flex min-w-0 items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <Users className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {tournament.registeredCount} {t("players joined")}
                </span>
              </div>

              <button
                onClick={() => navigate(buildTournamentUrl(tournament.id))}
                className={`inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium text-white transition-colors ${
                  tournament.status === "running"
                    ? "bg-amber-600 hover:bg-amber-500"
                    : "bg-blue-600 hover:bg-blue-500"
                }`}
              >
                {t(getActionLabel(tournament))}
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (finishedDetail?.tournament) {
    const winner = finishedDetail.winners?.[0];
    const finishedTournament = finishedDetail.tournament;
    const resultSummary = winner
      ? `Score ${winner.score}${
          winner.buchholz > 0 ? ` • Buchholz ${winner.buchholz}` : ""
        }`
      : `${finishedTournament.registeredCount} players`;

    return (
      <div
        className={`rounded-xl border p-4 sm:p-5 shadow-sm ${getCardClasses(
          "finished",
        )}`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600 dark:text-amber-300">
              <Crown className="h-3.5 w-3.5" />
              <span>{t("Latest Result")}</span>
            </div>
            <h3 className="mt-2 text-lg font-semibold leading-tight text-gray-900 dark:text-white break-words">
              {finishedTournament.name}
            </h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 break-words">
              {winner ? `${t("Winner")}: ${winner.name}` : t("Results pending")}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 break-words">
              {timeControlLabel(finishedTournament.timeControl)} • {resultSummary}
            </p>
          </div>

          <div className="shrink-0">
            <span className="inline-flex rounded-full border border-white/10 bg-white/60 px-2.5 py-1 text-[11px] font-medium text-gray-700 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-200">
              {getStatusLabel(finishedTournament)}
            </span>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex min-w-0 items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Users className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {finishedTournament.registeredCount} {t("players")}
            </span>
          </div>

          <button
            onClick={() => navigate(buildTournamentUrl(finishedTournament.id))}
            className="inline-flex items-center justify-center rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
          >
            {t("View Results")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/20 px-4 py-8 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300">
        <Trophy className="h-4 w-4" />
      </div>
      <p className="mt-3 text-sm font-medium text-gray-900 dark:text-white">
        {t("No tournaments available")}
      </p>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {t("Create a tournament or check back for the next event.")}
      </p>
    </div>
  );
}
