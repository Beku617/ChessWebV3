import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  Rocket,
  Search,
  Trophy,
  Zap,
} from "lucide-react";
import { FeedPagination } from "../../components/community/FeedPagination";
import { useAuthStore } from "../../store/authStore";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const SOCKET_URL = (
  import.meta.env.VITE_SOCKET_URL ||
  import.meta.env.VITE_API_URL ||
  "http://localhost:3001"
).replace(/\/api\/?$/, "");

type TournamentType = "swiss" | "arena" | "chess960";
type TournamentStatus =
  | "DRAFT"
  | "REGISTRATION_OPEN"
  | "LIVE_ROUND"
  | "ROUND_CLOSED"
  | "FINISHED";

type DetailTabKey = "standings" | "rounds";
type TournamentPageTab = "current" | "schedule" | "watch" | "create";
type SortMode = "newest" | "most_players" | "my_tournaments";
type StatusFilter = "all" | "DRAFT" | "REGISTRATION_OPEN" | "LIVE_ROUND" | "FINISHED";
type TournamentSpeed = "bullet" | "blitz" | "rapid" | "chess960";
type CreateTournamentView = "choice" | "form";

interface TimeControl {
  baseMs: number;
  incMs: number;
  label?: string;
}

interface TournamentSummary {
  id: string;
  name: string;
  type: TournamentType;
  format?: TournamentType;
  formatLabel: string;
  timeControl: TimeControl;
  timeControlLabel: string;
  ratingRequirement: string;
  status: TournamentStatus;
  roundsPlanned: number;
  currentRound: number;
  minPlayers: number;
  maxPlayers: number | null;
  registeredCount: number;
  isRegistered: boolean;
  canManage: boolean;
  myTournament: boolean;
  registrationDeadline?: string | null;
  scheduledStartAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt?: string | null;
  durationMinutes?: number | null;
  durationLabel?: string | null;
  description?: string;
  organizer?: { id: string; username: string; avatar?: string };
  championUserId?: string;
}

interface PlayerRow {
  id: string;
  userId: string;
  rank: number;
  username: string;
  avatar: string;
  elo: number;
  score: number;
  wins: number;
  draws: number;
  losses: number;
  seed: number | null;
  status: "active" | "withdrawn";
  tournamentEloDelta: number;
  buchholz: number;
  buchholzCut1: number;
  directEncounter: number;
  sonnebornBerger: number;
  koya: number;
  colorBalance: number;
}

interface RoundGame {
  id: string;
  gameId: string;
  roundNumber: number;
  board: number;
  whiteId: string;
  blackId: string;
  white: string;
  black: string;
  result: string;
  isBye: boolean;
  isPublished: boolean;
  status: "in_progress" | "completed";
  whiteRatingAtPairing: number;
  blackRatingAtPairing: number | null;
  whiteEloDelta: number;
  blackEloDelta: number;
  explanation: {
    scoreGroup?: string;
    colorAssignment?: string;
    byeReason?: string;
    rematchesAvoided?: string[];
  };
}

interface RoundRow {
  roundNumber: number;
  games: RoundGame[];
}

interface StandingRow {
  rank: number;
  userId: string;
  username: string;
  avatar: string;
  elo: number;
  points: number;
  buchholz: number;
  buchholzCut1: number;
  wins: number;
  draws: number;
  losses: number;
  directEncounter: number;
  sonnebornBerger: number;
  koya: number;
  colorBalance: number;
  status: "active" | "withdrawn";
}

interface WinnerRow {
  userId: string;
  username: string;
  avatar: string;
  placement: number;
  score: number;
  eloBefore: number;
  eloAfter: number;
  eloDelta: number;
}

interface DetailResponse {
  tournament: TournamentSummary & {
    organizer?: { id: string; username: string; avatar?: string };
    totalPlayers: number;
  };
  players: PlayerRow[];
  rounds: RoundRow[];
  standings: StandingRow[];
  standingsMeta: {
    isOfficial: boolean;
    label: string;
  };
  winners: WinnerRow[];
}

interface ConfirmDialogState {
  message: string;
  confirmLabel?: string;
  tone?: "warning" | "danger";
  onConfirm: () => Promise<void> | void;
}

interface TournamentListResponse {
  tournaments: TournamentSummary[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages?: number;
    hasMore?: boolean;
  };
}

const TIME_PRESETS = [
  { key: "bullet_1_0", label: "Bullet 1+0", baseMinutes: 1, incrementSeconds: 0 },
  { key: "blitz_3_2", label: "Blitz 3+2", baseMinutes: 3, incrementSeconds: 2 },
  { key: "blitz_5_0", label: "Blitz 5+0", baseMinutes: 5, incrementSeconds: 0 },
  { key: "rapid_10_0", label: "Rapid 10+0", baseMinutes: 10, incrementSeconds: 0 },
  { key: "rapid_10_1", label: "Rapid 10+1", baseMinutes: 10, incrementSeconds: 1 },
  { key: "rapid_15_10", label: "Rapid 15+10", baseMinutes: 15, incrementSeconds: 10 },
  { key: "classical_30_0", label: "Classical 30+0", baseMinutes: 30, incrementSeconds: 0 },
  { key: "custom", label: "Custom", baseMinutes: 10, incrementSeconds: 0 },
] as const;

const CREATE_TIME_PRESET_OPTIONS = TIME_PRESETS.filter((preset) => preset.key !== "custom");
const CREATE_ROUND_OPTIONS = Array.from({ length: 13 }, (_, index) => String(index + 3));
const CREATE_DURATION_OPTIONS = [15, 20, 30, 45, 60, 90, 120];
const CREATE_HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) =>
  String(hour).padStart(2, "0"),
);
const CREATE_MINUTE_OPTIONS = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

const STANDINGS_PAGE_SIZE = 50;
const LIST_PAGE_SIZE = 20;
const SCHEDULE_PIXELS_PER_MINUTE = 3.75;
const SCHEDULE_LOOKAHEAD_DAYS = 7;
const SCHEDULE_CONTEXT_BEFORE_NOW_MINUTES = 60;
const SCHEDULE_MIN_BAR_WIDTH = 148;
const SCHEDULE_TIMELINE_HEADER_HEIGHT = 54;
const SCHEDULE_BAR_HEIGHT = 44;
const SCHEDULE_BAR_VERTICAL_GAP = 10;
const SCHEDULE_TRACK_PADDING_Y = 10;

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function statusForFilter(status: StatusFilter) {
  if (status === "all") return "";
  return status;
}

function formatType(type: TournamentType) {
  if (type === "arena") return "Arena";
  if (type === "chess960") return "Chess960";
  return "Swiss";
}

function parseOptionalNonNegativeNumber(value: string): number | null {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}

const PAGE_TAB_OPTIONS: Array<{
  key: TournamentPageTab;
  label: string;
}> = [
  { key: "current", label: "Current" },
  { key: "schedule", label: "Schedule" },
  { key: "watch", label: "Watch" },
  { key: "create", label: "Create" },
];

const ARENA_SCORING_RULES = {
  win: 2,
  draw: 1,
  loss: 0,
  streakStartsAfterWins: 2,
  streakBonusMultiplier: 0.5,
  freeConsecutiveDraws: 1,
} as const;

const ARENA_PAIRING_RULES = {
  pairingIntervalMs: 4000,
  strategy: "closest_rating_adjacent_lobby_players",
  avoidImmediateRematch: true,
  allowRematchesWhenPoolExhausted: true,
} as const;

function parseDateValue(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getBaseMinutes(timeControl?: TimeControl) {
  return Math.max(1, Math.round(Number(timeControl?.baseMs || 300000) / 60000));
}

function getIncrementSeconds(timeControl?: TimeControl) {
  return Math.max(0, Math.round(Number(timeControl?.incMs || 0) / 1000));
}

function getTournamentSpeed(item: TournamentSummary): TournamentSpeed {
  const haystack = `${item.name} ${item.type} ${item.format || ""} ${item.formatLabel} ${
    item.timeControlLabel || ""
  }`.toLowerCase();
  if (haystack.includes("960")) return "chess960";

  if (/\bbullet\b/.test(haystack)) return "bullet";
  if (/\bblitz\b/.test(haystack)) return "blitz";
  if (/\brapid\b/.test(haystack)) return "rapid";

  const estimatedSeconds =
    Math.max(0, Math.round(Number(item.timeControl?.baseMs || 300000) / 1000)) +
    getIncrementSeconds(item.timeControl) * 40;

  if (estimatedSeconds < 180) return "bullet";
  if (estimatedSeconds < 600) return "blitz";
  return "rapid";
}

function getSpeedLabel(speed: TournamentSpeed) {
  if (speed === "chess960") return "Chess960";
  return speed[0].toUpperCase() + speed.slice(1);
}

function formatTimeCategory(item: TournamentSummary) {
  const speed = getTournamentSpeed(item);
  return `${getBaseMinutes(item.timeControl)}|${getIncrementSeconds(item.timeControl)} ${getSpeedLabel(
    speed,
  )}`;
}

function formatGameTime(timeControl?: TimeControl) {
  const baseMinutes = getBaseMinutes(timeControl);
  const incrementSeconds = getIncrementSeconds(timeControl);
  return incrementSeconds > 0
    ? `${baseMinutes} min +${incrementSeconds}s`
    : `${baseMinutes} min`;
}

function formatShortTime(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatStartsIn(target: Date, now: Date) {
  const diffMinutes = Math.ceil((target.getTime() - now.getTime()) / 60000);
  if (diffMinutes <= 0) return "Starts soon";
  if (diffMinutes < 60) return `Starts in ${diffMinutes} min`;
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  if (hours < 24) return minutes > 0 ? `Starts in ${hours}h ${minutes}m` : `Starts in ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Starts in ${days}d`;
}

function getTournamentTimeLabel(item: TournamentSummary) {
  const scheduledStart = parseDateValue(item.scheduledStartAt);
  if (scheduledStart) return formatShortTime(scheduledStart);

  const registrationDeadline = parseDateValue(item.registrationDeadline);
  if (registrationDeadline) return formatShortTime(registrationDeadline);

  const startedAt = parseDateValue(item.startedAt);
  if (startedAt) return formatShortTime(startedAt);

  const createdAt = parseDateValue(item.createdAt);
  if (createdAt) return formatShortTime(createdAt);

  return item.status === "DRAFT" ? "Draft" : "Manual";
}

function getTournamentStatusText(item: TournamentSummary, now: Date) {
  if (item.status === "REGISTRATION_OPEN") {
    const scheduledStart = parseDateValue(item.scheduledStartAt);
    return scheduledStart ? formatStartsIn(scheduledStart, now) : "Registration open";
  }
  if (item.status === "LIVE_ROUND") return "Active";
  if (item.status === "ROUND_CLOSED") return "Round closed";
  if (item.status === "FINISHED") return "Finished";
  return "Draft";
}

function getTournamentDisplayName(item: TournamentSummary) {
  return formatTimeCategory(item);
}

function getTournamentSummaryLine(item: TournamentSummary) {
  return formatType(item.type);
}

function formatDurationValue(totalMinutes: number) {
  const safeMinutes = Math.max(1, Math.round(Number(totalMinutes || 0)));
  if (safeMinutes < 60) return `${safeMinutes} min`;
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function getTournamentDurationLabel(item: TournamentSummary, now: Date) {
  const explicitLabel = String(item.durationLabel || "").trim();
  if (explicitLabel) return explicitLabel;

  const explicitMinutes = Number(item.durationMinutes || 0);
  if (Number.isFinite(explicitMinutes) && explicitMinutes > 0) {
    return formatDurationValue(explicitMinutes);
  }

  const startedAt = parseDateValue(item.startedAt);
  const finishedAt = parseDateValue(item.finishedAt);
  if (startedAt && finishedAt && finishedAt.getTime() > startedAt.getTime()) {
    return formatDurationValue((finishedAt.getTime() - startedAt.getTime()) / 60000);
  }

  if (
    startedAt &&
    (item.status === "LIVE_ROUND" || item.status === "ROUND_CLOSED") &&
    now.getTime() > startedAt.getTime()
  ) {
    return formatDurationValue((now.getTime() - startedAt.getTime()) / 60000);
  }

  return "--";
}

function formatPlayersCount(item: TournamentSummary) {
  return Intl.NumberFormat().format(Math.max(0, Number(item.registeredCount || 0)));
}

function TournamentTypeIcon({ speed }: { speed: TournamentSpeed }) {
  const commonClass = "h-4 w-4";

  if (speed === "bullet") {
    return (
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-orange-400/25 bg-orange-500/10 text-orange-300">
        <Rocket className={commonClass} aria-hidden="true" />
      </span>
    );
  }

  if (speed === "blitz") {
    return (
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-amber-400/25 bg-amber-500/10 text-amber-300">
        <Zap className={commonClass} aria-hidden="true" />
      </span>
    );
  }

  if (speed === "chess960") {
    return (
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-violet-400/25 bg-violet-500/10 text-[11px] font-bold text-violet-200">
        960
      </span>
    );
  }

  return (
    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-sky-400/25 bg-sky-500/10 text-sky-300">
      <Clock3 className={commonClass} aria-hidden="true" />
    </span>
  );
}

function TournamentStatusBadge({
  status,
  label,
}: {
  status: TournamentStatus;
  label: string;
}) {
  const tone =
    status === "REGISTRATION_OPEN"
      ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : status === "LIVE_ROUND"
        ? "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : status === "ROUND_CLOSED"
          ? "border-indigo-500/35 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
          : status === "FINISHED"
            ? "border-slate-400/35 bg-slate-500/10 text-slate-600 dark:text-slate-300"
            : "border-gray-400/35 bg-gray-500/10 text-gray-600 dark:text-gray-300";

  return (
    <span
      className={classNames(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold leading-none",
        tone,
      )}
    >
      {status === "LIVE_ROUND" && <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />}
      {label}
    </span>
  );
}

function TournamentTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: TournamentPageTab;
  onTabChange: (tab: TournamentPageTab) => void;
}) {
  return (
    <nav className="flex h-[54px] w-full items-stretch gap-[2px] overflow-x-auto overflow-y-hidden border-b border-theme-glass bg-theme-secondary px-5 no-scrollbar">
      {PAGE_TAB_OPTIONS.map(({ key, label }) => {
        const isActive = activeTab === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onTabChange(key)}
            className={classNames(
              "relative h-full px-3.5 text-[12.5px] font-medium transition-colors whitespace-nowrap",
              isActive
                ? "text-theme-accent after:absolute after:bottom-0 after:left-[10px] after:right-[10px] after:h-0.5 after:rounded-t-[2px] after:bg-brand-500"
                : "text-theme-muted hover:text-theme-foreground",
            )}
          >
            {label}
          </button>
        );
      })}
    </nav>
  );
}

function TournamentRow({
  item,
  selected,
  now,
  busyAction,
  onSelect,
  onRegister,
  onUnregister,
}: {
  item: TournamentSummary;
  selected: boolean;
  now: Date;
  busyAction: string;
  onSelect: (id: string) => void;
  onRegister: (id: string) => void;
  onUnregister: (id: string) => void;
}) {
  const speed = getTournamentSpeed(item);
  const statusText = getTournamentStatusText(item, now);
  const durationText = getTournamentDurationLabel(item, now);
  const isBusy = busyAction.includes(item.id);
  const canRegister = item.status === "REGISTRATION_OPEN" && !item.isRegistered;
  const canUnregister =
    item.isRegistered && (item.status === "REGISTRATION_OPEN" || item.status === "DRAFT");
  const actionLabel = item.status === "FINISHED" ? "Results" : item.status === "LIVE_ROUND" ? "Watch" : "View";

  return (
    <tr
      className={classNames(
        "border-t border-theme-glass transition-colors",
        selected
          ? "bg-brand-500/10"
          : "hover:bg-gray-900/[0.03] dark:hover:bg-white/[0.04]",
      )}
    >
      <td className="px-4 py-4">
        <button
          type="button"
          onClick={() => onSelect(item.id)}
          className="group flex min-w-[260px] items-center gap-3 text-left"
        >
          <TournamentTypeIcon speed={speed} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-gray-900 group-hover:text-brand-700 dark:text-white dark:group-hover:text-brand-300">
              {getTournamentDisplayName(item)}
            </span>
            <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
              {getTournamentSummaryLine(item)}
            </span>
            <span className="mt-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {getTournamentTimeLabel(item)}
            </span>
          </span>
        </button>
      </td>
      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-700 dark:text-gray-200">
        {formatGameTime(item.timeControl)}
      </td>
      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-700 dark:text-gray-200">
        {durationText}
      </td>
      <td className="px-4 py-4 whitespace-nowrap">
        <TournamentStatusBadge status={item.status} label={statusText} />
      </td>
      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-700 dark:text-gray-200">
        {formatPlayersCount(item)}
      </td>
      <td className="px-4 py-4 text-right">
        {canRegister ? (
          <button
            type="button"
            onClick={() => onRegister(item.id)}
            disabled={!!busyAction}
            className="inline-flex min-h-9 items-center justify-center rounded-lg bg-brand-500 px-3 text-sm font-semibold text-white transition-colors hover:bg-brand-400 disabled:opacity-60 dark:text-gray-950"
          >
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Join"}
          </button>
        ) : canUnregister ? (
          <button
            type="button"
            onClick={() => onUnregister(item.id)}
            disabled={!!busyAction}
            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-theme-glass px-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-white/70 disabled:opacity-60 dark:text-gray-200 dark:hover:bg-white/10"
          >
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Leave"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onSelect(item.id)}
            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-theme-glass px-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-white/70 dark:text-gray-200 dark:hover:bg-white/10"
          >
            {actionLabel}
          </button>
        )}
      </td>
    </tr>
  );
}

function TournamentTable({
  tournaments,
  loading,
  now,
  selectedId,
  busyAction,
  onSelect,
  onRegister,
  onUnregister,
  embedded = false,
}: {
  tournaments: TournamentSummary[];
  loading: boolean;
  now: Date;
  selectedId: string;
  busyAction: string;
  onSelect: (id: string) => void;
  onRegister: (id: string) => void;
  onUnregister: (id: string) => void;
  embedded?: boolean;
}) {
  if (loading) {
    return (
      <div className={embedded ? "p-4" : "theme-glass-panel rounded-xl p-4"}>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-16 animate-pulse rounded-lg border border-theme-glass bg-gray-100/70 dark:bg-white/5"
            />
          ))}
        </div>
      </div>
    );
  }

  if (tournaments.length === 0) {
    return (
      <div className={embedded ? "px-6 py-12 text-center" : "theme-glass-panel rounded-xl px-6 py-12 text-center"}>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-theme-glass bg-white/60 text-brand-500 dark:bg-white/5">
          <Trophy className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">No tournaments available</h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Create one or check back when registration opens.
        </p>
      </div>
    );
  }

  const tableContent = (
    <>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[960px] text-left">
          <thead className="bg-white/45 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
            <tr>
              <th className="px-4 py-3">Tournament</th>
              <th className="px-4 py-3">Game Time</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Players</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {tournaments.map((item) => (
              <TournamentRow
                key={item.id}
                item={item}
                selected={selectedId === item.id}
                now={now}
                busyAction={busyAction}
                onSelect={onSelect}
                onRegister={onRegister}
                onUnregister={onUnregister}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-theme-glass lg:hidden">
        {tournaments.map((item) => {
          const speed = getTournamentSpeed(item);
          const statusText = getTournamentStatusText(item, now);
          const durationText = getTournamentDurationLabel(item, now);
          const canRegister = item.status === "REGISTRATION_OPEN" && !item.isRegistered;
          return (
            <article
              key={item.id}
              className={classNames(
                "p-4 transition-colors",
                selectedId === item.id ? "bg-brand-500/10" : "",
              )}
            >
              <div className="flex items-start gap-3">
                <TournamentTypeIcon speed={speed} />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    className="block w-full truncate text-left text-sm font-semibold text-gray-900 dark:text-white"
                  >
                    {getTournamentDisplayName(item)}
                  </button>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {getTournamentSummaryLine(item)}
                  </p>
                </div>
                <TournamentStatusBadge status={item.status} label={statusText} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-theme-glass bg-white/40 p-3 dark:bg-white/[0.03]">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                    Game Time
                  </p>
                  <p className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-100">
                    {formatGameTime(item.timeControl)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                    Duration
                  </p>
                  <p className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-100">
                    {durationText}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                    Players
                  </p>
                  <p className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-100">
                    {formatPlayersCount(item)}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                {getTournamentTimeLabel(item)}
              </p>
              <div className="mt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => (canRegister ? onRegister(item.id) : onSelect(item.id))}
                  disabled={!!busyAction}
                  className={classNames(
                    "inline-flex min-h-9 items-center justify-center rounded-lg px-3 text-sm font-semibold transition-colors disabled:opacity-60",
                    canRegister
                      ? "bg-brand-500 text-white hover:bg-brand-400 dark:text-gray-950"
                      : "border border-theme-glass text-gray-700 hover:bg-white/70 dark:text-gray-200 dark:hover:bg-white/10",
                  )}
                >
                  {canRegister ? "Join" : item.status === "FINISHED" ? "Results" : "View"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );

  if (embedded) return tableContent;

  return <div className="theme-glass-panel overflow-hidden rounded-xl">{tableContent}</div>;
}

type ScheduleFormatFilter = "all" | TournamentSpeed;

interface TimelineTournament {
  item: TournamentSummary;
  speed: TournamentSpeed;
  start: Date;
  durationMinutes: number;
  left: number;
  width: number;
  lane: number;
  clippedStart: boolean;
  clippedEnd: boolean;
}

interface TimelineHourTick {
  key: string;
  left: number;
  label: string;
}

interface TimelineDayBoundary {
  key: string;
  left: number;
  label: string;
}

const SCHEDULE_FORMAT_OPTIONS: Array<{ value: ScheduleFormatFilter; label: string }> = [
  { value: "all", label: "All Formats" },
  { value: "blitz", label: "Blitz" },
  { value: "rapid", label: "Rapid" },
  { value: "bullet", label: "Bullet" },
  { value: "chess960", label: "Chess960" },
];

const SCHEDULE_BAR_STYLES: Record<TournamentSpeed, string> = {
  blitz:
    "border-amber-300/25 bg-amber-400/[0.13] text-amber-50 hover:border-amber-200/45 hover:shadow-[0_0_22px_rgba(251,191,36,0.16)]",
  rapid:
    "border-emerald-300/25 bg-emerald-400/[0.12] text-emerald-50 hover:border-emerald-200/45 hover:shadow-[0_0_22px_rgba(52,211,153,0.14)]",
  bullet:
    "border-orange-300/25 bg-orange-500/[0.14] text-orange-50 hover:border-orange-200/45 hover:shadow-[0_0_22px_rgba(251,146,60,0.15)]",
  chess960:
    "border-violet-300/25 bg-violet-500/[0.14] text-violet-50 hover:border-violet-200/45 hover:shadow-[0_0_22px_rgba(167,139,250,0.16)]",
};

function parsePageTab(value?: string | null): TournamentPageTab | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "current" || normalized === "schedule" || normalized === "create") {
    return normalized;
  }
  return null;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toDateInputValueOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInputValueOnly(value?: string | null) {
  const normalized = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDefaultStartMinuteValue(value: number) {
  const rounded = Math.floor(Math.max(0, Math.min(59, value)) / 5) * 5;
  return String(rounded).padStart(2, "0");
}

function buildScheduledStartIso(dateValue: string, hourValue: string, minuteValue: string) {
  const date = parseDateInputValueOnly(dateValue);
  if (!date) return null;

  const hours = Number.parseInt(hourValue, 10);
  const minutes = Number.parseInt(minuteValue, 10);
  if (!Number.isInteger(hours) || hours < 0 || hours > 23) return null;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) return null;

  date.setHours(hours, minutes, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function isSameLocalDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatTimelineHour(date: Date) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric" }).format(date);
}

function formatDayBoundaryLabel(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
    .format(date)
    .toUpperCase();
}

function formatScheduleDayLabel(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function getTournamentStartDate(item: TournamentSummary) {
  return (
    parseDateValue(item.scheduledStartAt) ||
    parseDateValue(item.startedAt) ||
    parseDateValue(item.registrationDeadline) ||
    parseDateValue(item.createdAt)
  );
}

function getTournamentDurationMinutes(item: TournamentSummary) {
  const explicitDuration = Number(item.durationMinutes);
  if (Number.isFinite(explicitDuration) && explicitDuration > 0) {
    return Math.max(15, Math.round(explicitDuration));
  }

  const isArena = String(item.type).toLowerCase() === "arena" || /arena/i.test(item.name);
  if (isArena) return 60;

  const baseMinutes = getBaseMinutes(item.timeControl);
  const incrementSeconds = getIncrementSeconds(item.timeControl);
  const estimatedGameMinutes = baseMinutes * 2 + (incrementSeconds * 80) / 60;
  const rounds = Math.max(1, Number(item.roundsPlanned || 1));
  return Math.max(30, Math.round(rounds * (estimatedGameMinutes + 5)));
}

function buildTimelineItems(
  tournaments: TournamentSummary[],
  scheduleDateValue: string,
  formatFilter: ScheduleFormatFilter,
  now: Date,
) {
  const scheduleDay = parseDateInputValueOnly(scheduleDateValue) || startOfLocalDay(now);
  const rangeStartDay = startOfLocalDay(scheduleDay);
  const rangeStartMs = rangeStartDay.getTime();
  const rangeEndMs = addDays(rangeStartDay, SCHEDULE_LOOKAHEAD_DAYS).getTime();

  const rollingStartMs = now.getTime() - SCHEDULE_CONTEXT_BEFORE_NOW_MINUTES * 60000;
  const windowStartMs = isSameLocalDay(rangeStartDay, now)
    ? Math.max(rangeStartMs, rollingStartMs)
    : rangeStartMs;
  const windowEndMs = Math.max(windowStartMs + 60 * 60000, rangeEndMs);

  const baseItems = tournaments
    .flatMap<{
      item: TournamentSummary;
      speed: TournamentSpeed;
      start: Date;
      durationMinutes: number;
      startMs: number;
      endMs: number;
    }>((item) => {
      const start = getTournamentStartDate(item);
      if (!start) return [];
      const speed = getTournamentSpeed(item);
      if (formatFilter !== "all" && speed !== formatFilter) return [];

      const durationMinutes = getTournamentDurationMinutes(item);
      const startMs = start.getTime();
      const endMs = startMs + durationMinutes * 60000;
      if (endMs <= windowStartMs || startMs >= windowEndMs) return [];

      return [
        {
          item,
          speed,
          start,
          durationMinutes,
          startMs,
          endMs,
        },
      ];
    })
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const laneEndMs: number[] = [];
  const minVisibleMinutes = SCHEDULE_MIN_BAR_WIDTH / SCHEDULE_PIXELS_PER_MINUTE;
  const items: TimelineTournament[] = baseItems.flatMap((entry) => {
    const visibleStartMs = Math.max(entry.startMs, windowStartMs);
    const visibleEndMs = Math.min(entry.endMs, windowEndMs);
    if (visibleEndMs <= visibleStartMs) return [];

    const visibleMinutes = (visibleEndMs - visibleStartMs) / 60000;
    const maxVisibleMinutes = Math.max(1, (windowEndMs - visibleStartMs) / 60000);
    const renderedMinutes = Math.min(
      maxVisibleMinutes,
      Math.max(visibleMinutes, minVisibleMinutes),
    );
    const renderedEndMs = visibleStartMs + renderedMinutes * 60000;

    let lane = laneEndMs.findIndex((laneEnd) => visibleStartMs >= laneEnd);
    if (lane === -1) {
      lane = laneEndMs.length;
      laneEndMs.push(renderedEndMs);
    } else {
      laneEndMs[lane] = renderedEndMs;
    }

    const left = ((visibleStartMs - windowStartMs) / 60000) * SCHEDULE_PIXELS_PER_MINUTE;
    const width = renderedMinutes * SCHEDULE_PIXELS_PER_MINUTE;

    return [
      {
        item: entry.item,
        speed: entry.speed,
        start: entry.start,
        durationMinutes: entry.durationMinutes,
        left,
        width,
        lane,
        clippedStart: entry.startMs < windowStartMs,
        clippedEnd: entry.endMs > windowEndMs,
      },
    ];
  });

  const hourTicks: TimelineHourTick[] = [];
  const firstHour = new Date(windowStartMs);
  firstHour.setMinutes(0, 0, 0);
  if (firstHour.getTime() < windowStartMs) {
    firstHour.setHours(firstHour.getHours() + 1);
  }
  for (
    let cursorMs = firstHour.getTime();
    cursorMs <= windowEndMs;
    cursorMs += 60 * 60000
  ) {
    const tickDate = new Date(cursorMs);
    hourTicks.push({
      key: `hour-${cursorMs}`,
      left: ((cursorMs - windowStartMs) / 60000) * SCHEDULE_PIXELS_PER_MINUTE,
      label: formatTimelineHour(tickDate),
    });
  }

  const dayBoundaries: TimelineDayBoundary[] = [];
  let boundaryDay = startOfLocalDay(new Date(windowStartMs));
  if (boundaryDay.getTime() <= windowStartMs) {
    boundaryDay = addDays(boundaryDay, 1);
  }
  while (boundaryDay.getTime() <= windowEndMs) {
    const boundaryMs = boundaryDay.getTime();
    dayBoundaries.push({
      key: `day-${boundaryMs}`,
      left: ((boundaryMs - windowStartMs) / 60000) * SCHEDULE_PIXELS_PER_MINUTE,
      label: formatDayBoundaryLabel(boundaryDay),
    });
    boundaryDay = addDays(boundaryDay, 1);
  }

  return {
    items,
    windowStartMs,
    windowEndMs,
    hourTicks,
    dayBoundaries,
    laneCount: Math.max(1, laneEndMs.length),
  };
}

function TimelineFormatIcon({ speed }: { speed: TournamentSpeed }) {
  const iconClass = "h-3.5 w-3.5 shrink-0";
  if (speed === "blitz") return <Zap className={iconClass} aria-hidden="true" />;
  if (speed === "rapid") return <Clock3 className={iconClass} aria-hidden="true" />;
  if (speed === "bullet") return <Rocket className={iconClass} aria-hidden="true" />;
  return <span className="shrink-0 font-mono text-[10px] font-black leading-none">960</span>;
}

function getTimelineTitle(item: TimelineTournament, now: Date) {
  const end = new Date(item.start.getTime() + item.durationMinutes * 60000);
  return `${getTournamentDisplayName(item.item)}\n${formatShortTime(item.start)} - ${formatShortTime(
    end,
  )}\n${item.item.registeredCount} players\n${getTournamentStatusText(item.item, now)}`;
}

function TournamentScheduleTimeline({
  tournaments,
  loading,
  now,
  selectedId,
  busyAction,
  scheduleDate,
  formatFilter,
  statusFilter,
  onScheduleDateChange,
  onFormatFilterChange,
  onStatusFilterChange,
  onSelect,
  onRegister,
  onUnregister,
}: {
  tournaments: TournamentSummary[];
  loading: boolean;
  now: Date;
  selectedId: string;
  busyAction: string;
  scheduleDate: string;
  formatFilter: ScheduleFormatFilter;
  statusFilter: StatusFilter;
  onScheduleDateChange: (value: string) => void;
  onFormatFilterChange: (value: ScheduleFormatFilter) => void;
  onStatusFilterChange: (value: StatusFilter) => void;
  onSelect: (id: string) => void;
  onRegister: (id: string) => void;
  onUnregister: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [chromeHeight, setChromeHeight] = useState(0);
  const scheduleDay = parseDateInputValueOnly(scheduleDate) || startOfLocalDay(now);
  const scheduleDayValue = toDateInputValueOnly(scheduleDay);
  const scheduleRangeEnd = useMemo(
    () => addDays(scheduleDay, SCHEDULE_LOOKAHEAD_DAYS),
    [scheduleDay],
  );
  const timelineData = useMemo(
    () => buildTimelineItems(tournaments, scheduleDayValue, formatFilter, now),
    [formatFilter, now, scheduleDayValue, tournaments],
  );
  const timelineItems = timelineData.items;
  const timelineMinutes = Math.max(
    60,
    (timelineData.windowEndMs - timelineData.windowStartMs) / 60000,
  );
  const timelineWidth = timelineMinutes * SCHEDULE_PIXELS_PER_MINUTE;
  const timelineHeight =
    SCHEDULE_TIMELINE_HEADER_HEIGHT +
    SCHEDULE_TRACK_PADDING_Y * 2 +
    timelineData.laneCount * SCHEDULE_BAR_HEIGHT +
    Math.max(0, timelineData.laneCount - 1) * SCHEDULE_BAR_VERTICAL_GAP;
  const nowMs = now.getTime();
  const showNowMarker =
    nowMs >= timelineData.windowStartMs && nowMs <= timelineData.windowEndMs;
  const nowOffset =
    ((nowMs - timelineData.windowStartMs) / 60000) * SCHEDULE_PIXELS_PER_MINUTE;
  const timelineContainerHeight = Math.max(viewportHeight, chromeHeight + timelineHeight);

  const measureLayout = useCallback(() => {
    const top = containerRef.current?.getBoundingClientRect().top ?? 0;
    const available = Math.max(0, Math.floor(window.innerHeight - top));
    const controlsHeight = Math.ceil(controlsRef.current?.getBoundingClientRect().height ?? 0);
    const summaryHeight = Math.ceil(summaryRef.current?.getBoundingClientRect().height ?? 0);

    setViewportHeight(available);
    setChromeHeight(controlsHeight + summaryHeight);
  }, []);

  useEffect(() => {
    measureLayout();
    window.addEventListener("resize", measureLayout);
    return () => window.removeEventListener("resize", measureLayout);
  }, [measureLayout]);

  useEffect(() => {
    measureLayout();
  }, [measureLayout, loading, scheduleDayValue, timelineItems.length, timelineHeight]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || loading) return;
    const targetLeft = showNowMarker ? Math.max(0, nowOffset - scroller.clientWidth / 2) : 0;
    scroller.scrollTo({ left: targetLeft, behavior: "smooth" });
  }, [loading, nowOffset, scheduleDayValue, showNowMarker]);

  function moveDay(amount: number) {
    onScheduleDateChange(toDateInputValueOnly(addDays(scheduleDay, amount)));
  }

  if (loading) {
    return (
      <div
        ref={containerRef}
        className="bg-[#07111f]/90 p-4"
        style={timelineContainerHeight > 0 ? { height: timelineContainerHeight } : undefined}
      >
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="h-12 animate-pulse rounded-xl border border-white/10 bg-white/[0.04]"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex min-h-0 flex-col bg-[#07111f]/95 text-slate-100"
      style={timelineContainerHeight > 0 ? { height: timelineContainerHeight } : undefined}
    >
      <div
        ref={controlsRef}
        className="flex flex-col gap-3 border-b border-white/10 px-4 py-3 xl:flex-row xl:items-center xl:justify-between"
      >
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={formatFilter}
            onChange={(event) => onFormatFilterChange(event.target.value as ScheduleFormatFilter)}
            className="rounded-lg border border-white/10 bg-[#0b1727] px-3 py-2 text-sm font-medium text-slate-100 outline-none transition-colors focus:border-brand-400"
          >
            {SCHEDULE_FORMAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => onStatusFilterChange(event.target.value as StatusFilter)}
            className="rounded-lg border border-white/10 bg-[#0b1727] px-3 py-2 text-sm font-medium text-slate-100 outline-none transition-colors focus:border-brand-400"
          >
            <option value="all">All Statuses</option>
            <option value="REGISTRATION_OPEN">Registration Open</option>
            <option value="LIVE_ROUND">Live</option>
            <option value="FINISHED">Finished</option>
            <option value="DRAFT">Draft</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => moveDay(-1)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-white"
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <label className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            <input
              type="date"
              value={scheduleDayValue}
              onChange={(event) => onScheduleDateChange(event.target.value)}
              className="h-10 rounded-lg border border-white/10 bg-[#0b1727] pl-9 pr-3 font-mono text-sm text-slate-100 outline-none transition-colors focus:border-brand-400"
            />
          </label>
          <button
            type="button"
            onClick={() => moveDay(1)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-white"
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onScheduleDateChange(toDateInputValueOnly(new Date()))}
            className="h-10 rounded-lg border border-brand-400/30 bg-brand-500/10 px-3 text-xs font-semibold uppercase tracking-[0.2em] text-brand-200 transition-colors hover:bg-brand-500/15"
          >
            Today
          </button>
        </div>
      </div>

      <div
        ref={summaryRef}
        className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-xs text-slate-400"
      >
        <span className="font-mono uppercase tracking-[0.22em]">
          {formatScheduleDayLabel(scheduleDay)} - {formatScheduleDayLabel(scheduleRangeEnd)}
        </span>
        <span>{timelineItems.length} scheduled tournaments in next 7 days</span>
      </div>

      {timelineItems.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 py-14 text-center">
          <div>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-brand-300">
              <CalendarDays className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="mt-4 text-base font-semibold text-white">
              No tournaments in this 7-day window
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Try another day or loosen the format/status filters.
            </p>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <div ref={scrollerRef} className="h-full overflow-x-auto overflow-y-hidden premium-scrollbar">
            <div
              className="relative bg-[#081220]"
              style={{
                width: timelineWidth,
                minWidth: timelineWidth,
                height: timelineHeight,
                minHeight: "100%",
              }}
            >
              <div
                className="absolute left-0 right-0 border-b border-white/10 bg-[#081220]/95"
                style={{ top: 0, height: SCHEDULE_TIMELINE_HEADER_HEIGHT }}
              />

              {timelineData.hourTicks.map((tick) => (
                <div
                  key={tick.key}
                  className="pointer-events-none absolute top-0 bottom-0 border-l border-white/[0.055]"
                  style={{ left: tick.left }}
                >
                  <span className="absolute left-2 top-7 whitespace-nowrap font-mono text-[11px] font-semibold text-slate-500">
                    {tick.label}
                  </span>
                </div>
              ))}

              {timelineData.dayBoundaries.map((boundary) => (
                <div
                  key={boundary.key}
                  className="pointer-events-none absolute top-0 bottom-0 border-l-2 border-cyan-300/45"
                  style={{ left: boundary.left }}
                >
                  <span className="absolute left-2 top-1 whitespace-nowrap font-mono text-[10px] font-black tracking-[0.18em] text-cyan-200">
                    {boundary.label}
                  </span>
                </div>
              ))}

              {showNowMarker && (
                <div
                  className="pointer-events-none absolute top-0 z-20 w-px bg-brand-300 shadow-[0_0_14px_rgba(34,211,238,0.75)]"
                  style={{ left: nowOffset, bottom: 0 }}
                >
                  <span className="absolute -left-[3px] top-0 h-2 w-2 rounded-full bg-brand-200 shadow-[0_0_12px_rgba(34,211,238,0.8)]" />
                </div>
              )}

              {timelineItems.map((timelineItem) => {
                const { item, speed, left, width, clippedStart, clippedEnd, lane } = timelineItem;
                const canRegister = item.status === "REGISTRATION_OPEN" && !item.isRegistered;
                const canUnregister =
                  item.isRegistered &&
                  (item.status === "REGISTRATION_OPEN" || item.status === "DRAFT");
                const isBusy = busyAction.includes(item.id);
                const top =
                  SCHEDULE_TIMELINE_HEADER_HEIGHT +
                  SCHEDULE_TRACK_PADDING_Y +
                  lane * (SCHEDULE_BAR_HEIGHT + SCHEDULE_BAR_VERTICAL_GAP);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (canRegister) {
                        onRegister(item.id);
                        return;
                      }
                      if (canUnregister) {
                        onUnregister(item.id);
                        return;
                      }
                      onSelect(item.id);
                    }}
                    disabled={!!busyAction}
                    title={getTimelineTitle(timelineItem, now)}
                    className={classNames(
                      "group absolute flex min-w-0 items-center gap-2.5 rounded-full border px-4 text-left text-[13px] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-300/50 disabled:opacity-60",
                      SCHEDULE_BAR_STYLES[speed],
                      item.status === "LIVE_ROUND" && "tournament-live-pulse",
                      selectedId === item.id && "ring-2 ring-brand-300/50",
                    )}
                    style={{ left, width, top, height: SCHEDULE_BAR_HEIGHT }}
                  >
                    <TimelineFormatIcon speed={speed} />
                    {item.status === "LIVE_ROUND" && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" />
                    )}
                    {clippedStart && (
                      <span className="shrink-0 font-mono text-[10px] text-slate-300">...</span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {getTournamentDisplayName(item)}
                      </span>
                      <span className="block truncate font-mono text-[11px] text-slate-300/80">
                        {item.registeredCount} players
                      </span>
                    </span>
                    {clippedEnd && (
                      <span className="shrink-0 font-mono text-[10px] text-slate-300">...</span>
                    )}
                    {isBusy && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Tournaments() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const selectedFromUrl = String(searchParams.get("selected") || "").trim();
  const initialTab = parsePageTab(searchParams.get("tab")) || "current";

  const [pageTab, setPageTab] = useState<TournamentPageTab>(initialTab);
  const [now, setNow] = useState(() => new Date());
  const [search, setSearch] = useState("");
  const [formatFilter, setFormatFilter] = useState<"all" | TournamentType>("all");
  const [scheduleFormatFilter, setScheduleFormatFilter] =
    useState<ScheduleFormatFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortMode>("newest");
  const [scheduleDate, setScheduleDate] = useState(() =>
    toDateInputValueOnly(parseDateInputValueOnly(searchParams.get("date")) || new Date()),
  );

  const [list, setList] = useState<TournamentSummary[]>([]);
  const [listPage, setListPage] = useState(1);
  const [listTotal, setListTotal] = useState(0);
  const [listTotalPages, setListTotalPages] = useState(1);
  const [listPageSize, setListPageSize] = useState(LIST_PAGE_SIZE);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [tab, setTab] = useState<DetailTabKey>("standings");
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string>("");
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [standingsPage, setStandingsPage] = useState(1);

  const [createView, setCreateView] = useState<CreateTournamentView>("choice");
  const [createName, setCreateName] = useState("");
  const [createType, setCreateType] = useState<TournamentType>("swiss");
  const [createRounds, setCreateRounds] = useState<string>("5");
  const [timePreset, setTimePreset] = useState<string>("rapid_10_0");
  const [createDurationMinutes, setCreateDurationMinutes] = useState<string>("30");
  const [createRated, setCreateRated] = useState(true);
  const [createGameType, setCreateGameType] = useState<"standard" | "chess960">("standard");
  const [createSetup, setCreateSetup] = useState("standard");
  const [createPairingLogic, setCreatePairingLogic] = useState("rating-based");
  const [maxPlayers, setMaxPlayers] = useState<string>("");
  const [createStartDate, setCreateStartDate] = useState<string>(() =>
    toDateInputValueOnly(now),
  );
  const [createStartHour, setCreateStartHour] = useState<string>(() =>
    String(now.getHours()).padStart(2, "0"),
  );
  const [createStartMinute, setCreateStartMinute] = useState<string>(() =>
    getDefaultStartMinuteValue(now.getMinutes()),
  );
  const [description, setDescription] = useState("");

  const currentUserId = String(user?.id || "");
  const autoJoinGameIdRef = useRef<string>("");

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    if (selectedFromUrl) {
      setSelectedId(selectedFromUrl);
    }
  }, [selectedFromUrl]);

  useEffect(() => {
    const urlTab = parsePageTab(searchParams.get("tab")) || "current";
    setPageTab(urlTab);
    if (urlTab !== "create") {
      setCreateView("choice");
    }

    const urlDate = parseDateInputValueOnly(searchParams.get("date"));
    if (urlDate) {
      setScheduleDate(toDateInputValueOnly(urlDate));
    }
  }, [searchParams]);

  function writeTabToUrl(tabKey: TournamentPageTab, nextDate = scheduleDate) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", tabKey);
    if (tabKey === "schedule") {
      nextParams.set("date", nextDate);
    } else {
      nextParams.delete("date");
    }
    setSearchParams(nextParams, { replace: true });
  }

  function selectTournament(tournamentId: string) {
    setSelectedId(tournamentId);
    const nextParams = new URLSearchParams(searchParams);
    if (tournamentId) {
      nextParams.set("selected", tournamentId);
    } else {
      nextParams.delete("selected");
    }
    setSearchParams(nextParams, { replace: true });
  }

  function resetCreateForm(options?: { keepType?: boolean }) {
    const nowDate = new Date();
    setCreateName("");
    if (!options?.keepType) {
      setCreateType("swiss");
    }
    setCreateRounds("5");
    setTimePreset("rapid_10_0");
    setCreateDurationMinutes("30");
    setCreateRated(true);
    setCreateGameType("standard");
    setCreateSetup("standard");
    setCreatePairingLogic("rating-based");
    setMaxPlayers("");
    setCreateStartDate(toDateInputValueOnly(nowDate));
    setCreateStartHour(String(nowDate.getHours()).padStart(2, "0"));
    setCreateStartMinute(getDefaultStartMinuteValue(nowDate.getMinutes()));
    setDescription("");
  }

  function beginCreateFlow(type: TournamentType) {
    const normalizedType = type === "arena" ? "arena" : "swiss";
    resetCreateForm({ keepType: true });
    setCreateType(normalizedType);
    if (normalizedType === "arena") {
      setTimePreset("blitz_3_2");
      setCreateDurationMinutes("30");
    } else {
      setTimePreset("rapid_10_0");
      setCreateRounds("5");
    }
    setCreateView("form");
  }

  function backToCreateChoices() {
    setCreateView("choice");
    resetCreateForm();
  }

  function handleScheduleDateChange(value: string) {
    const nextDate = toDateInputValueOnly(parseDateInputValueOnly(value) || new Date());
    setScheduleDate(nextDate);
    writeTabToUrl("schedule", nextDate);
  }

  function handlePageTabChange(nextTab: TournamentPageTab) {
    if (nextTab === "watch") {
      navigate("/watch");
      return;
    }
    if (nextTab === "create") {
      setPageTab("create");
      setCreateView("choice");
      resetCreateForm();
      writeTabToUrl("create");
      return;
    }
    setPageTab(nextTab);
    writeTabToUrl(nextTab);
  }

  const serverReconnectMessage = t(
    "tournamentsPage.errors.serverReconnect",
    "Unable to reach server. Reconnecting...",
  );
  const realtimeReconnectMessage = t(
    "tournamentsPage.errors.realtimeReconnect",
    "Realtime disconnected. Reconnecting...",
  );
  const realtimeFailedMessage = t(
    "tournamentsPage.errors.realtimeFailed",
    "Realtime connection failed. Reconnecting...",
  );
  const formatStatusLabel = (status: TournamentStatus) => {
    if (status === "REGISTRATION_OPEN") {
      return t("tournamentCommon.status.registrationOpen", "Registration open");
    }
    if (status === "LIVE_ROUND") {
      return t("tournamentCommon.status.live", "Active");
    }
    if (status === "ROUND_CLOSED") {
      return t("tournamentCommon.badges.roundClosed", "Round closed");
    }
    if (status === "FINISHED") {
      return t("tournamentCommon.status.finished", "Finished");
    }
    return t("tournamentCommon.status.draft", "Draft");
  };
  const formatTimePresetLabel = (key: string, fallback: string) =>
    t(`tournamentCommon.timePresets.${key}`, fallback);
  const formatRatingRequirementLabel = (value?: string | null) => {
    const normalized = String(value || "").trim();
    if (!normalized || /^none$/i.test(normalized)) {
      return t("tournamentCommon.rating.none", "None");
    }
    return normalized;
  };

  const selectedTournament = useMemo(
    () => list.find((item) => item.id === selectedId) || null,
    [list, selectedId],
  );

  const visibleTournaments = useMemo(() => list, [list]);

  const currentRoundGames = useMemo(() => {
    if (!detail) return [];
    const currentRound = Number(detail.tournament.currentRound || 0);
    return detail.rounds.find((round) => round.roundNumber === currentRound)?.games || [];
  }, [detail]);

  const myPendingGame = useMemo(() => {
    if (!detail || !currentUserId) return null;
    const currentRound = Number(detail.tournament.currentRound || 0);
    const round = detail.rounds.find((item) => Number(item.roundNumber) === currentRound);
    if (!round) return null;
    return (
      round.games.find(
        (game) =>
          !game.isBye &&
          game.result === "*" &&
          (game.whiteId === currentUserId || game.blackId === currentUserId),
      ) || null
    );
  }, [currentUserId, detail]);

  const standingsRows = useMemo(() => detail?.standings || [], [detail]);
  const standingsPageCount = useMemo(
    () => Math.max(1, Math.ceil(standingsRows.length / STANDINGS_PAGE_SIZE)),
    [standingsRows.length],
  );
  const currentStandingsPage = Math.min(standingsPage, standingsPageCount);
  const standingsStartIndex = (currentStandingsPage - 1) * STANDINGS_PAGE_SIZE;
  const standingsEndIndex = standingsStartIndex + STANDINGS_PAGE_SIZE;
  const paginatedStandings = useMemo(
    () => standingsRows.slice(standingsStartIndex, standingsEndIndex),
    [standingsEndIndex, standingsRows, standingsStartIndex],
  );

  useEffect(() => {
    setStandingsPage(1);
  }, [selectedId, tab]);

  useEffect(() => {
    setStandingsPage((prev) => Math.min(prev, standingsPageCount));
  }, [standingsPageCount]);

  async function isServerReachable() {
    try {
      const response = await fetch(`${API_URL}/healthz`, { credentials: "include" });
      return response.ok;
    } catch {
      return false;
    }
  }

  async function loadList(options?: { silent?: boolean }) {
    try {
      if (!options?.silent) setLoadingList(true);
      const reachable = await isServerReachable();
      if (!reachable) {
        setError(serverReconnectMessage);
        return;
      }
      const params = new URLSearchParams();
      const isScheduleView = pageTab === "schedule";
      if (!isScheduleView && search.trim()) params.set("search", search.trim());
      if (!isScheduleView && formatFilter !== "all") params.set("format", formatFilter);
      if (statusForFilter(statusFilter)) params.set("status", statusForFilter(statusFilter));
      params.set("sort", isScheduleView ? "starting_soon" : sort);
      params.set("page", String(isScheduleView ? 1 : listPage));
      params.set("limit", String(isScheduleView ? 100 : LIST_PAGE_SIZE));
      const response = await fetch(`${API_URL}/api/tournaments?${params.toString()}`, {
        credentials: "include",
      });
      const payload = (await response.json().catch(() => ({}))) as Partial<TournamentListResponse> & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          payload?.error ||
            t("tournamentsPage.errors.fetchTournaments", "Failed to fetch tournaments"),
        );
      }
      const tournaments: TournamentSummary[] = payload.tournaments || [];
      setList(tournaments);
      const total = Number(payload.pagination?.total || 0);
      const pageSize = Math.max(1, Number(payload.pagination?.limit || LIST_PAGE_SIZE));
      const totalPages =
        Number(payload.pagination?.pages) ||
        Math.max(1, Math.ceil(total / pageSize));
      setListTotal(total);
      setListPageSize(pageSize);
      setListTotalPages(totalPages);
      setListPage(Math.max(1, Number(payload.pagination?.page || 1)));
      if (!selectedId && !selectedFromUrl && tournaments.length > 0) {
        selectTournament(tournaments[0].id);
      } else if (
        selectedId &&
        !selectedFromUrl &&
        !tournaments.some((tournament) => tournament.id === selectedId)
      ) {
        selectTournament(tournaments[0]?.id || "");
      }
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t("tournamentsPage.errors.fetchTournaments", "Failed to fetch tournaments");
      if (/failed to fetch|networkerror|fetch/i.test(message)) {
        setError(serverReconnectMessage);
      } else {
        setError(message);
      }
    } finally {
      if (!options?.silent) setLoadingList(false);
    }
  }

  async function loadDetail(tournamentId: string, options?: { silent?: boolean }) {
    if (!tournamentId) {
      setDetail(null);
      return;
    }
    try {
      if (!options?.silent) setLoadingDetail(true);
      const reachable = await isServerReachable();
      if (!reachable) {
        setError(serverReconnectMessage);
        return;
      }
      const response = await fetch(`${API_URL}/api/tournaments/${tournamentId}`, {
        credentials: "include",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload?.error ||
            t("tournamentsPage.errors.fetchTournament", "Failed to fetch tournament"),
        );
      }
      setDetail(payload as DetailResponse);
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t("tournamentsPage.errors.fetchTournament", "Failed to fetch tournament");
      if (/failed to fetch|networkerror|fetch/i.test(message)) {
        setError(serverReconnectMessage);
      } else {
        setError(message);
      }
      setDetail(null);
    } finally {
      if (!options?.silent) setLoadingDetail(false);
    }
  }

  useEffect(() => {
    void loadList();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    void loadDetail(selectedId);
  }, [selectedId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadList({ silent: false });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [listPage, search, formatFilter, statusFilter, sort, pageTab]);

  useEffect(() => {
    setListPage(1);
  }, [search, formatFilter, statusFilter, sort, pageTab]);

  useEffect(() => {
    const listTimer = window.setInterval(() => {
      void loadList({ silent: true });
    }, 20000);
    return () => window.clearInterval(listTimer);
  }, [listPage, search, formatFilter, statusFilter, sort, pageTab]);

  useEffect(() => {
    if (!selectedId) return;
    const detailTimer = window.setInterval(() => {
      void loadDetail(selectedId, { silent: true });
    }, 8000);
    return () => window.clearInterval(detailTimer);
  }, [selectedId]);

  useEffect(() => {
    const socket: Socket = io(SOCKET_URL, {
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      autoConnect: false,
    });
    let activeTournamentId = selectedId;
    let disposed = false;
    let reconnectProbeTimer: number | null = null;

    const joinRoom = (id: string) => {
      if (!id) return;
      if (!socket.connected) return;
      socket.emit("tournament:join", { tournamentId: id });
      activeTournamentId = id;
    };
    const leaveRoom = (id: string) => {
      if (!id) return;
      if (!socket.connected) return;
      socket.emit("tournament:leave", { tournamentId: id });
    };

    if (selectedId) {
      joinRoom(selectedId);
    }

    const refreshIfCurrent = (payload?: { tournamentId?: string }) => {
      if (!payload?.tournamentId) return;
      if (payload.tournamentId !== activeTournamentId) return;
      void loadDetail(payload.tournamentId, { silent: true });
      void loadList({ silent: true });
    };

    const scheduleConnectProbe = () => {
      if (disposed) return;
      if (reconnectProbeTimer !== null) {
        window.clearTimeout(reconnectProbeTimer);
      }
      reconnectProbeTimer = window.setTimeout(async () => {
        reconnectProbeTimer = null;
        if (disposed || socket.connected) return;
        try {
          const response = await fetch(`${API_URL}/healthz`, { credentials: "include" });
          if (!response.ok) {
            throw new Error(t("tournamentsPage.errors.serverUnavailable", "Server unavailable"));
          }
          if (!disposed && !socket.connected) {
            socket.connect();
          }
        } catch {
          setError(serverReconnectMessage);
          scheduleConnectProbe();
        }
      }, 1500);
    };

    const handleConnect = () => {
      setError(null);
      if (selectedId) {
        joinRoom(selectedId);
      }
    };
    const handleConnectError = () => {
      setError(realtimeFailedMessage);
      scheduleConnectProbe();
    };
    const handleReconnectAttempt = () => {
      setError(realtimeReconnectMessage);
    };
    const handleDisconnect = () => {
      scheduleConnectProbe();
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("pairings:published", refreshIfCurrent);
    socket.on("result:updated", refreshIfCurrent);
    socket.on("standings:updated", refreshIfCurrent);
    socket.on("round:closed", refreshIfCurrent);
    socket.on("tournament:stateChanged", refreshIfCurrent);
    socket.on("tournament:finished", refreshIfCurrent);
    socket.on("connect_error", handleConnectError);
    socket.io.on("reconnect_attempt", handleReconnectAttempt);

    scheduleConnectProbe();

    return () => {
      disposed = true;
      if (reconnectProbeTimer !== null) {
        window.clearTimeout(reconnectProbeTimer);
      }
      if (activeTournamentId) leaveRoom(activeTournamentId);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("pairings:published", refreshIfCurrent);
      socket.off("result:updated", refreshIfCurrent);
      socket.off("standings:updated", refreshIfCurrent);
      socket.off("round:closed", refreshIfCurrent);
      socket.off("tournament:stateChanged", refreshIfCurrent);
      socket.off("tournament:finished", refreshIfCurrent);
      socket.off("connect_error", handleConnectError);
      socket.io.off("reconnect_attempt", handleReconnectAttempt);
      socket.disconnect();
    };
  }, [selectedId]);

  useEffect(() => {
    if (!detail || !currentUserId) return;
    if (detail.tournament.status !== "LIVE_ROUND") return;
    if (!myPendingGame?.gameId) return;
    if (autoJoinGameIdRef.current === myPendingGame.gameId) return;

    autoJoinGameIdRef.current = myPendingGame.gameId;
    const encodedGameId = encodeURIComponent(myPendingGame.gameId);
    navigate(`/play/quick?tournamentGameId=${encodedGameId}`, {
      state: { tournamentGameId: myPendingGame.gameId, autoStart: true },
    });
  }, [currentUserId, detail, myPendingGame, navigate]);

  const canManage = !!detail?.tournament?.canManage;
  const tournamentStatus = detail?.tournament?.status;

  const createTimeControl = useMemo(() => {
    const preset =
      CREATE_TIME_PRESET_OPTIONS.find((item) => item.key === timePreset) ||
      CREATE_TIME_PRESET_OPTIONS[0];
    return {
      baseMs: preset.baseMinutes * 60000,
      incMs: preset.incrementSeconds * 1000,
      label: `${preset.baseMinutes}+${preset.incrementSeconds}`,
    };
  }, [timePreset]);
  const formLabelClass = "text-sm font-medium text-gray-700 dark:text-gray-300";
  const formInputClass =
    "w-full rounded-lg border border-theme-glass bg-white/70 px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-400 dark:bg-gray-950/35 dark:text-gray-100";
  const formInlineInputClass =
    "rounded-lg border border-theme-glass bg-white/70 px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-400 dark:bg-gray-950/35 dark:text-gray-100";
  const secondaryButtonClass =
    "rounded-lg border border-theme-glass px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200";

  async function runAction(
    key: string,
    call: () => Promise<Response>,
    options?: { refreshList?: boolean; refreshDetail?: boolean },
  ) {
    try {
      setBusyAction(key);
      const reachable = await isServerReachable();
      if (!reachable) {
        setError(serverReconnectMessage);
        return null;
      }
      const response = await call();
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload?.error || t("tournamentsPage.errors.requestFailed", "Request failed"),
        );
      }
      if (payload?.tournament && payload?.players && payload?.standings) {
        setDetail(payload as DetailResponse);
        if ((payload as DetailResponse).tournament.id !== selectedId) {
          selectTournament((payload as DetailResponse).tournament.id);
        }
      }
      if (options?.refreshList !== false) {
        await loadList({ silent: true });
      }
      if (options?.refreshDetail !== false && selectedId) {
        await loadDetail(selectedId, { silent: true });
      }
      setError(null);
      return payload;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t("tournamentsPage.errors.requestFailed", "Request failed");
      if (/failed to fetch|networkerror|fetch|connection refused/i.test(message)) {
        setError(serverReconnectMessage);
      } else {
        setError(message);
      }
      return null;
    } finally {
      setBusyAction("");
    }
  }

  async function onCreateTournament(event: FormEvent) {
    event.preventDefault();
    if (!createName.trim()) return;
    const normalizedType = createType === "arena" ? "arena" : "swiss";
    const scheduledStartIso = buildScheduledStartIso(
      createStartDate,
      createStartHour,
      createStartMinute,
    );
    const roundsPlanned =
      normalizedType === "swiss" ? parseOptionalNonNegativeNumber(createRounds) : null;
    const durationMinutes =
      normalizedType === "arena"
        ? Math.max(1, parseOptionalNonNegativeNumber(createDurationMinutes) || 30)
        : null;

    const payload = await runAction(
      "create",
      () =>
        fetch(`${API_URL}/api/tournaments`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: createName.trim(),
            type: normalizedType,
            roundsPlanned:
              normalizedType === "swiss" ? Math.max(1, Number(roundsPlanned) || 5) : null,
            timeControl: createTimeControl,
            minPlayers: 4,
            maxPlayers: Number(maxPlayers) > 1 ? Number(maxPlayers) : null,
            ratingFilterMode: "none",
            ratingMin: null,
            ratingMax: null,
            registrationDeadline: null,
            startType: scheduledStartIso ? "scheduled" : "manual",
            scheduledStartAt: scheduledStartIso,
            rated: createRated,
            gameType: createGameType,
            setup: createSetup,
            pairingLogic: normalizedType === "arena" ? createPairingLogic : "swiss_pairing",
            durationMinutes,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
            description: description.trim(),
          }),
        }),
      { refreshDetail: false },
    );

    if (!payload) return;
    const createdId = (payload as DetailResponse)?.tournament?.id;
    if (createdId) {
      selectTournament(createdId);
      await loadDetail(createdId);
    }
    resetCreateForm();
    setCreateView("choice");
    setPageTab("current");
    writeTabToUrl("current");
  }

  async function doRegister(tournamentId = selectedId) {
    const targetId = String(tournamentId || "").trim();
    if (!targetId) return;
    selectTournament(targetId);
    await runAction(`register:${targetId}`, () =>
      fetch(`${API_URL}/api/tournaments/${targetId}/register`, {
        method: "POST",
        credentials: "include",
      }),
      { refreshDetail: false },
    );
    await loadDetail(targetId, { silent: true });
  }

  async function doUnregister(tournamentId = selectedId) {
    const targetId = String(tournamentId || "").trim();
    if (!targetId) return;
    selectTournament(targetId);
    await runAction(`unregister:${targetId}`, () =>
      fetch(`${API_URL}/api/tournaments/${targetId}/register`, {
        method: "DELETE",
        credentials: "include",
      }),
      { refreshDetail: false },
    );
    await loadDetail(targetId, { silent: true });
  }

  async function organizerStateAction(action: string, confirmMessage?: string) {
    if (!selectedId) return;
    const execute = async () =>
      runAction(action, () =>
        fetch(`${API_URL}/api/tournaments/${selectedId}/state`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }),
      );
    if (confirmMessage) {
      setConfirmDialog({
        message: confirmMessage,
        confirmLabel:
          action === "finish_tournament"
            ? t("tournamentsPage.actions.endTournament", "End Tournament")
            : t("common.confirm", "Confirm"),
        tone: action === "finish_tournament" ? "danger" : "warning",
        onConfirm: execute,
      });
      return;
    }
    await execute();
  }

  function openGame(gameId: string) {
    const trimmed = String(gameId || "").trim();
    if (!trimmed) return;
    const encodedGameId = encodeURIComponent(trimmed);
    navigate(`/play/quick?tournamentGameId=${encodedGameId}`, {
      state: { tournamentGameId: trimmed, autoStart: true },
    });
  }

  async function deleteTournament() {
    if (!selectedId) return;
    setConfirmDialog({
      message: t(
        "tournamentsPage.confirm.deleteDraftMessage",
        "Delete this draft tournament permanently?",
      ),
      confirmLabel: t("tournamentsPage.actions.delete", "Delete"),
      tone: "danger",
      onConfirm: async () => {
        await runAction(
          "delete_tournament",
          () =>
            fetch(`${API_URL}/api/tournaments/${selectedId}`, {
              method: "DELETE",
              credentials: "include",
            }),
          { refreshDetail: false },
        );
        setDetail(null);
        selectTournament("");
      },
    });
  }

  function renderStatusBadge(status: TournamentStatus) {
    return <TournamentStatusBadge status={status} label={formatStatusLabel(status)} />;
  }

  return (
    <div className="w-full min-w-0">
      <section className="theme-glass-panel-soft overflow-hidden">
        <TournamentTabs activeTab={pageTab} onTabChange={handlePageTabChange} />
      </section>

      {error && (
        <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <section className="theme-glass-panel-soft mt-3 mx-3 overflow-hidden rounded-xl">
        {pageTab === "create" ? (
          <div className="px-4 py-6 md:px-6">
            {createView === "choice" ? (
              <div className="mx-auto max-w-4xl">
                <p className="text-center text-xl font-semibold text-gray-900 dark:text-gray-100">
                  {t(
                    "tournamentsPage.createChoice.title",
                    "Please select the kind of event you'd like to create:",
                  )}
                </p>
                <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
                  {t("tournamentsPage.createChoice.shareable", "Shareable Tournaments")}
                </p>

                <div className="mt-4 grid grid-cols-1 gap-3">
                  <button
                    type="button"
                    onClick={() => beginCreateFlow("swiss")}
                    className="group flex w-full items-center gap-4 rounded-xl border border-theme-glass bg-white/65 px-5 py-5 text-left transition-colors hover:bg-white/80 dark:bg-gray-950/25 dark:hover:bg-gray-900/45"
                  >
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-theme-glass bg-white/80 text-brand-500 dark:bg-white/10">
                      <Trophy className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-2xl font-semibold text-gray-900 dark:text-white">
                        {t("tournamentCommon.formats.swiss", "Swiss Tournament")}
                      </span>
                      <span className="mt-1 block text-sm text-gray-600 dark:text-gray-300">
                        {t(
                          "tournamentsPage.createChoice.swissDescription",
                          "Invite players into a round-based Swiss event with standings by score and tie-breaks.",
                        )}
                      </span>
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-gray-400 transition-colors group-hover:text-brand-500" />
                  </button>

                  <button
                    type="button"
                    onClick={() => beginCreateFlow("arena")}
                    className="group flex w-full items-center gap-4 rounded-xl border border-theme-glass bg-white/65 px-5 py-5 text-left transition-colors hover:bg-white/80 dark:bg-gray-950/25 dark:hover:bg-gray-900/45"
                  >
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-theme-glass bg-white/80 text-brand-500 dark:bg-white/10">
                      <Rocket className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-2xl font-semibold text-gray-900 dark:text-white">
                        {t("tournamentCommon.formats.arena", "Arena")}
                      </span>
                      <span className="mt-1 block text-sm text-gray-600 dark:text-gray-300">
                        {t(
                          "tournamentsPage.createChoice.arenaDescription",
                          "Create a continuous arena where players score as many points as possible in a set duration.",
                        )}
                      </span>
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-gray-400 transition-colors group-hover:text-brand-500" />
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={onCreateTournament} className="mx-auto max-w-4xl space-y-5">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-theme-glass bg-white/80 text-brand-500 dark:bg-white/10">
                    {createType === "arena" ? (
                      <Rocket className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <Trophy className="h-5 w-5" aria-hidden="true" />
                    )}
                  </span>
                  <h3 className="text-2xl font-semibold text-gray-900 dark:text-white">
                    {createType === "arena"
                      ? t(
                          "tournamentsPage.create.arenaTitle",
                          "New Shareable Arena Tournament",
                        )
                      : t(
                          "tournamentsPage.create.swissTitle",
                          "New Shareable Swiss Tournament",
                        )}
                  </h3>
                </div>

                <div className="space-y-1">
                  <label className={formLabelClass}>
                    {createType === "arena"
                      ? t("tournamentsPage.create.fields.arenaName", "Arena Name")
                      : t("tournamentsPage.create.fields.tournamentName", "Tournament Name")}
                  </label>
                  <input
                    required
                    value={createName}
                    onChange={(event) => setCreateName(event.target.value)}
                    className={formInputClass}
                    placeholder={t("tournamentsPage.modal.placeholders.name", "Title")}
                  />
                </div>

                <div className="h-px bg-theme-glass" />

                <h4 className="text-2xl font-semibold text-gray-900 dark:text-white">
                  {t("tournamentsPage.create.game", "Game")}
                </h4>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="md:col-span-2 flex items-center justify-between rounded-lg border border-theme-glass bg-white/65 px-3 py-2 dark:bg-gray-950/25">
                    <span className={formLabelClass}>{t("tournamentsPage.create.rated", "Rated")}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={createRated}
                      onClick={() => setCreateRated((value) => !value)}
                      className={classNames(
                        "relative inline-flex h-7 w-12 items-center rounded-full border border-theme-glass transition-colors",
                        createRated
                          ? "bg-brand-500"
                          : "bg-gray-300/70 dark:bg-gray-800/80",
                      )}
                    >
                      <span
                        className={classNames(
                          "inline-block h-5 w-5 transform rounded-full bg-white transition-transform",
                          createRated ? "translate-x-6" : "translate-x-1",
                        )}
                      />
                    </button>
                  </div>

                  {createType === "arena" && (
                    <div className="space-y-1">
                      <label className={formLabelClass}>
                        {t("tournamentsPage.create.fields.pairingLogic", "Pairing Logic")}
                      </label>
                      <select
                        value={createPairingLogic}
                        onChange={(event) => setCreatePairingLogic(event.target.value)}
                        className={formInputClass}
                      >
                        <option value="rating-based">
                          {t("tournamentsPage.create.pairing.ratingBased", "Rating-based")}
                        </option>
                        <option value="random">
                          {t("tournamentsPage.create.pairing.random", "Random")}
                        </option>
                      </select>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className={formLabelClass}>
                      {t("tournamentsPage.create.fields.gameType", "Game Type")}
                    </label>
                    <select
                      value={createGameType}
                      onChange={(event) =>
                        setCreateGameType(event.target.value as "standard" | "chess960")
                      }
                      className={formInputClass}
                    >
                      <option value="standard">
                        {t("tournamentsPage.create.gameTypes.standard", "Standard")}
                      </option>
                      <option value="chess960">
                        {t("tournamentsPage.create.gameTypes.chess960", "Chess960")}
                      </option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className={formLabelClass}>
                      {t("tournamentsPage.create.fields.timeControl", "Time Control")}
                    </label>
                    <select
                      value={timePreset}
                      onChange={(event) => setTimePreset(event.target.value)}
                      className={formInputClass}
                    >
                      {CREATE_TIME_PRESET_OPTIONS.map((preset) => (
                        <option key={preset.key} value={preset.key}>
                          {preset.incrementSeconds > 0
                            ? `${preset.baseMinutes} min + ${preset.incrementSeconds}s`
                            : `${preset.baseMinutes} min`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {createType === "arena" ? (
                    <div className="space-y-1">
                      <label className={formLabelClass}>
                        {t("tournamentsPage.create.fields.duration", "Duration")}
                      </label>
                      <select
                        value={createDurationMinutes}
                        onChange={(event) => setCreateDurationMinutes(event.target.value)}
                        className={formInputClass}
                      >
                        {CREATE_DURATION_OPTIONS.map((duration) => (
                          <option key={duration} value={String(duration)}>
                            {duration} min
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <label className={formLabelClass}>
                        {t("tournamentsPage.modal.fields.rounds", "Rounds")}
                      </label>
                      <select
                        value={createRounds}
                        onChange={(event) => setCreateRounds(event.target.value)}
                        className={formInputClass}
                      >
                        {CREATE_ROUND_OPTIONS.map((rounds) => (
                          <option key={rounds} value={rounds}>
                            {rounds}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className={formLabelClass}>
                      {t("tournamentsPage.create.fields.setup", "Setup")}
                    </label>
                    <select
                      value={createSetup}
                      onChange={(event) => setCreateSetup(event.target.value)}
                      className={formInputClass}
                    >
                      <option value="standard">
                        {t("tournamentsPage.create.setup.standard", "Standard")}
                      </option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className={formLabelClass}>
                      {t("tournamentsPage.create.fields.startDate", "Start Date")}
                    </label>
                    <input
                      type="date"
                      value={createStartDate}
                      min={toDateInputValueOnly(new Date())}
                      onChange={(event) => setCreateStartDate(event.target.value)}
                      className={formInputClass}
                    />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                      {t("tournamentsPage.create.fields.startTime", "Start Time")}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t(
                        "tournamentsPage.create.fields.timezonePrefix",
                        "Timezone:",
                      )}{" "}
                      {Intl.DateTimeFormat().resolvedOptions().timeZone || "Local"}
                    </p>
                    <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <label className={formLabelClass}>
                          {t("tournamentsPage.create.fields.hour", "Hour")}
                        </label>
                        <select
                          value={createStartHour}
                          onChange={(event) => setCreateStartHour(event.target.value)}
                          className={formInputClass}
                        >
                          {CREATE_HOUR_OPTIONS.map((hour) => (
                            <option key={hour} value={hour}>
                              {hour}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className={formLabelClass}>
                          {t("tournamentsPage.create.fields.minute", "Minute")}
                        </label>
                        <select
                          value={createStartMinute}
                          onChange={(event) => setCreateStartMinute(event.target.value)}
                          className={formInputClass}
                        >
                          {CREATE_MINUTE_OPTIONS.map((minute) => (
                            <option key={minute} value={minute}>
                              {minute}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <label className={formLabelClass}>
                      {t("tournamentsPage.modal.fields.maxPlayers", "Max Players")}
                    </label>
                    <input
                      type="number"
                      min={2}
                      value={maxPlayers}
                      onChange={(event) => setMaxPlayers(event.target.value)}
                      className={formInputClass}
                      placeholder={t("tournamentCommon.generic.optional", "Optional")}
                    />
                  </div>
                </div>

                <div className="h-px bg-theme-glass" />

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={backToCreateChoices}
                    className={secondaryButtonClass}
                  >
                    {t("common.cancel", "Cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={busyAction === "create"}
                    className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-400 disabled:opacity-60 dark:text-gray-950"
                  >
                    {busyAction === "create"
                      ? t("tournamentsPage.modal.creating", "Creating...")
                      : t("tournamentsPage.create.submit", "Create")}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : pageTab === "schedule" ? (
          <TournamentScheduleTimeline
            tournaments={list}
            loading={loadingList}
            now={now}
            selectedId={selectedId}
            busyAction={busyAction}
            scheduleDate={scheduleDate}
            formatFilter={scheduleFormatFilter}
            statusFilter={statusFilter}
            onScheduleDateChange={handleScheduleDateChange}
            onFormatFilterChange={setScheduleFormatFilter}
            onStatusFilterChange={(value) => {
              setStatusFilter(value);
              setListPage(1);
            }}
            onSelect={selectTournament}
            onRegister={(id) => void doRegister(id)}
            onUnregister={(id) => void doUnregister(id)}
          />
        ) : (
          <>
            <div className="border-b border-theme-glass px-4 py-3">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-4 xl:grid-cols-6">
                <label className="relative md:col-span-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                  <input
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setListPage(1);
                    }}
                    placeholder={t("tournamentsPage.filters.searchPlaceholder", "Search by name")}
                    className="w-full rounded-lg border border-theme-glass bg-white/70 py-2 pl-9 pr-3 text-sm text-gray-900 outline-none transition-colors focus:border-brand-400 dark:bg-gray-950/35 dark:text-gray-100"
                  />
                </label>
                <select
                  value={formatFilter}
                  onChange={(event) => {
                    setFormatFilter(event.target.value as "all" | TournamentType);
                    setListPage(1);
                  }}
                  className="rounded-lg border border-theme-glass bg-white/70 px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-brand-400 dark:bg-gray-950/35 dark:text-gray-100"
                >
                  <option value="all">
                    {t("tournamentsPage.filters.allFormats", "All Formats")}
                  </option>
                  <option value="swiss">{t("tournamentCommon.formats.swiss", "Swiss")}</option>
                  <option value="arena">{t("tournamentCommon.formats.arena", "Arena")}</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value as StatusFilter);
                    setListPage(1);
                  }}
                  className="rounded-lg border border-theme-glass bg-white/70 px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-brand-400 dark:bg-gray-950/35 dark:text-gray-100"
                >
                  <option value="all">
                    {t("tournamentsPage.filters.allStatuses", "All Statuses")}
                  </option>
                  <option value="REGISTRATION_OPEN">
                    {t("tournamentCommon.status.registrationOpen", "Registration Open")}
                  </option>
                  <option value="LIVE_ROUND">
                    {t("tournamentCommon.status.live", "Live")}
                  </option>
                  <option value="FINISHED">
                    {t("tournamentCommon.status.finished", "Finished")}
                  </option>
                  <option value="DRAFT">{t("tournamentCommon.status.draft", "Draft")}</option>
                </select>
                <select
                  value={sort}
                  onChange={(event) => {
                    setSort(event.target.value as SortMode);
                    setListPage(1);
                  }}
                  className="rounded-lg border border-theme-glass bg-white/70 px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-brand-400 dark:bg-gray-950/35 dark:text-gray-100"
                >
                  <option value="newest">{t("tournamentsPage.sort.newest", "Newest")}</option>
                  <option value="most_players">
                    {t("tournamentsPage.sort.mostPlayers", "Most Players")}
                  </option>
                  <option value="my_tournaments">
                    {t("tournamentsPage.sort.myTournaments", "My Tournaments")}
                  </option>
                </select>
              </div>
            </div>
            <TournamentTable
              tournaments={visibleTournaments}
              loading={loadingList}
              now={now}
              selectedId={selectedId}
              busyAction={busyAction}
              onSelect={selectTournament}
              onRegister={(id) => void doRegister(id)}
              onUnregister={(id) => void doUnregister(id)}
              embedded
            />

            {listTotalPages > 1 && listTotal > listPageSize && (
              <div className="border-t border-theme-glass px-4 py-3">
                <div className="mb-3 text-center text-xs text-gray-600 dark:text-gray-400">
                  {t("tournamentsPage.pagination.showingRange", {
                    start: (listPage - 1) * listPageSize + 1,
                    end: Math.min(listPage * listPageSize, listTotal),
                    total: listTotal,
                    defaultValue: `Showing ${(listPage - 1) * listPageSize + 1} - ${Math.min(
                      listPage * listPageSize,
                      listTotal,
                    )} of ${listTotal} tournaments`,
                  })}
                </div>
                <FeedPagination
                  currentPage={listPage}
                  totalPages={listTotalPages}
                  onPageChange={setListPage}
                />
              </div>
            )}
          </>
        )}
      </section>

      {confirmDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-theme-glass bg-white/90 p-5 shadow-2xl backdrop-blur dark:bg-gray-950/90">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
              {t("tournamentsPage.confirm.title", "Confirm Action")}
            </h4>
            <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{confirmDialog.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className={secondaryButtonClass}
              >
                {t("common.cancel", "Cancel")}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const action = confirmDialog.onConfirm;
                  setConfirmDialog(null);
                  await action();
                }}
                className={classNames(
                  "rounded-lg px-4 py-2 text-sm font-semibold",
                  confirmDialog.tone === "danger"
                    ? "bg-red-500 text-red-50"
                    : "bg-emerald-500 text-emerald-950",
                )}
              >
                {confirmDialog.confirmLabel || t("common.confirm", "Confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
