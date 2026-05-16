import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

type TournamentStatus = "draft" | "registering" | "running" | "finished";
type TournamentApiStatus =
  | TournamentStatus
  | "DRAFT"
  | "REGISTRATION_OPEN"
  | "LIVE_ROUND"
  | "ROUND_CLOSED"
  | "FINISHED";

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

interface TournamentApiSummary extends Omit<TournamentSummary, "status"> {
  status?: TournamentApiStatus | string | null;
  timeControlLabel?: string;
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
  translate?: (key: string, defaultValue?: string) => unknown,
): string {
  if (!value) return "3+0";
  if (value.label?.trim()) {
    const rawLabel = value.label.trim();
    if (!translate) return rawLabel;

    return rawLabel
      .replace(/\bBullet\b/gi, String(translate("Bullet", "Bullet")))
      .replace(/\bBlitz\b/gi, String(translate("Blitz", "Blitz")))
      .replace(/\bRapid\b/gi, String(translate("Rapid", "Rapid")))
      .replace(/\bClassical\b/gi, String(translate("Classical", "Classical")));
  }

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

// The dashboard still expects legacy lower-case states, while the main API now
// returns enum-style states such as REGISTRATION_OPEN and LIVE_ROUND.
function normalizeTournamentStatus(
  status?: TournamentApiStatus | string | null,
): TournamentStatus {
  const raw = String(status || "").trim();
  const normalized = raw.toUpperCase();

  if (normalized === "REGISTRATION_OPEN" || normalized === "REGISTERING") {
    return "registering";
  }

  if (
    normalized === "LIVE_ROUND" ||
    normalized === "ROUND_CLOSED" ||
    normalized === "PAIRING_PREVIEW" ||
    normalized === "RUNNING"
  ) {
    return "running";
  }

  if (normalized === "FINISHED") {
    return "finished";
  }

  return "draft";
}

function isCancelledOrEndedStatus(
  status?: TournamentApiStatus | string | null,
): boolean {
  const normalized = String(status || "").trim().toUpperCase();
  return (
    normalized === "CANCELLED" ||
    normalized === "CANCELED" ||
    normalized === "ENDED" ||
    normalized === "COMPLETED" ||
    normalized === "FINISHED"
  );
}

function normalizeTournamentSummary(
  item: TournamentApiSummary,
): TournamentSummary | null {
  const id = String(item?.id || "").trim();
  if (!id) return null;

  return {
    id,
    name: String(item?.name || "Tournament"),
    status: normalizeTournamentStatus(item?.status),
    roundsPlanned: Math.max(0, Number(item?.roundsPlanned || 0)),
    currentRound: Math.max(0, Number(item?.currentRound || 0)),
    registeredCount: Math.max(0, Number(item?.registeredCount || 0)),
    isRegistered: !!item?.isRegistered,
    startedAt: item?.startedAt ?? null,
    finishedAt: item?.finishedAt ?? null,
    createdAt: item?.createdAt ?? null,
    timeControl: item?.timeControl
      ? {
          baseMs: Number(item.timeControl.baseMs || 0),
          incMs: Number(item.timeControl.incMs || 0),
          label: item.timeControl.label || item.timeControlLabel,
        }
      : item?.timeControlLabel
        ? {
            baseMs: 0,
            incMs: 0,
            label: item.timeControlLabel,
          }
        : undefined,
  };
}

function getCardClasses(status: TournamentStatus) {
  const base =
    "theme-glass-panel-soft border border-theme-glass transition-colors";

  if (status === "running") {
    return `${base} hover:border-amber-400/45`;
  }

  if (status === "registering") {
    return `${base} hover:border-teal-400/45`;
  }

  return `${base} hover:border-brand-400/35`;
}

function getStatusTone(status: TournamentStatus) {
  if (status === "running") {
    return {
      badge: "text-amber-600 dark:text-amber-300",
      button: "bg-amber-500 hover:bg-amber-400",
    };
  }

  return {
    badge: "text-teal-600 dark:text-teal-300",
    button: "bg-teal-600 hover:bg-teal-500",
  };
}

function getStatusLabel(item: TournamentSummary) {
  if (item.status === "running") {
    const relativeStart = formatRelativeTime(item.startedAt);
    return relativeStart ? `Started ${relativeStart}` : "In progress";
  }

  if (item.status === "registering") {
    return "Open registration";
  }

  return item.finishedAt
    ? `Finished ${formatAbsoluteDate(item.finishedAt)}`
    : "Completed";
}

function getActionLabel(item: TournamentSummary) {
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
          className="animate-pulse rounded-xl border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/35 p-4 sm:p-5"
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
          ? (data.tournaments as TournamentApiSummary[])
              .filter((item) => !isCancelledOrEndedStatus(item?.status))
              .map((item) => normalizeTournamentSummary(item))
              .filter((item): item is TournamentSummary => item !== null)
          : [];

        setTournaments(nextTournaments);
        setError(null);
      } catch (err) {
        if (silent || cancelled) return;
        setError(
          err instanceof Error ? err.message : "Failed to load tournaments",
        );
        setTournaments([]);
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
    upcomingTournaments.length > 0 ? upcomingTournaments : runningTournaments;

  if (loading) {
    return <LoadingCards />;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
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
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            {t("Retry")}
          </button>
        </div>
      </div>
    );
  }

  if (prioritizedTournaments.length > 0) {
    const isMultiColumn = prioritizedTournaments.length > 1;

    return (
      <div className={`grid grid-cols-1 gap-4 ${isMultiColumn ? "md:grid-cols-2" : ""}`}>
        {prioritizedTournaments.map((tournament) => {
          const tone = getStatusTone(tournament.status);

          return (
            <div
              key={tournament.id}
              className={`min-w-0 rounded-xl border dark:border-gray-700/50 p-4 sm:p-5 shadow-sm ${getCardClasses(
                tournament.status,
              )}`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div
                    className={`flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] ${tone.badge}`}
                  >
                    <span>
                      {tournament.status === "running" ? t("Active") : t("Upcoming")}
                    </span>
                  </div>
                  <h3 className="mt-2 text-lg font-semibold leading-tight text-gray-900 dark:text-white break-words">
                    {tournament.name}
                  </h3>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 break-words">
                    {timeControlLabel(tournament.timeControl, t)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 break-words">
                    {tournament.status === "running"
                      ? t("tournamentsPage.detail.roundOf", {
                          current: Math.max(1, tournament.currentRound),
                          total: Math.max(1, tournament.roundsPlanned),
                          defaultValue: `Round ${Math.max(1, tournament.currentRound)} of ${Math.max(
                            1,
                            tournament.roundsPlanned,
                          )}`,
                        })
                      : t("tournamentCommon.status.registrationOpen", "Registration open")}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="inline-flex min-w-0 items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span className="truncate">
                    {tournament.registeredCount} {t("players joined")}
                  </span>
                </div>

                <button
                  onClick={() => navigate(buildTournamentUrl(tournament.id))}
                  className={`inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium text-white transition-colors ${tone.button}`}
                >
                  {t(getActionLabel(tournament))}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/20 px-4 py-8 text-center">
      <p className="mt-3 text-sm font-medium text-gray-900 dark:text-white">
        {t("No tournaments available")}
      </p>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {t("Create a tournament or check back for the next event.")}
      </p>
    </div>
  );
}
