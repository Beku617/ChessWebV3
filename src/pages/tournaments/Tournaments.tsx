import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation, Trans } from "react-i18next";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  Rocket,
  Search,
  Trophy,
  Users,
  X,
  Zap,
} from "lucide-react";
import { FeedPagination } from "../../components/community/FeedPagination";
import { useAuthStore } from "../../store/authStore";
import { getRatingPoolForMatch } from "../../utils/ratingPool";
import { API_URL, SOCKET_URL } from "../../config/network";
import i18n from "../../i18n";

type TournamentType = "swiss" | "arena" | "chess960";
type TournamentStatus =
  | "DRAFT"
  | "REGISTRATION_OPEN"
  | "LIVE_ROUND"
  | "ROUND_CLOSED"
  | "CANCELLED"
  | "FINISHED";

type DetailTabKey = "standings" | "rounds";
type TournamentPageTab = "current" | "schedule" | "create";
type CurrentFormatFilter = "all" | "arena";
type StatusFilter = "all" | "REGISTRATION_OPEN" | "LIVE_ROUND" | "FINISHED";
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
  startAt?: string | null;
  startDate?: string | null;
  startHour?: number | string | null;
  startMinute?: number | string | null;
  timezone?: string | null;
  gameType?: "standard" | "chess960";
  rated?: boolean;
  pairingLogic?: string;
  setup?: string;
  description?: string;
  organizer?: { id: string; username: string; avatar?: string };
  championUserId?: string;
  myPendingGameId?: string | null;
  myPendingGameRound?: number | null;
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
  games?: number;
  gamesPlayed?: number;
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
  { key: "classical_30_0", label: "Classical 90+30", baseMinutes: 90, incrementSeconds: 30 },
  { key: "custom", label: "Custom", baseMinutes: 10, incrementSeconds: 0 },
] as const;

const CREATE_TIME_PRESET_OPTIONS = TIME_PRESETS.filter((preset) => preset.key !== "custom");
const CREATE_ROUND_OPTIONS = Array.from({ length: 13 }, (_, index) => String(index + 3));
const CREATE_DURATION_OPTIONS = [15, 20, 30, 45, 60, 90, 120];
const CREATE_HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) =>
  String(hour).padStart(2, "0"),
);
const CREATE_MINUTE_OPTIONS = Array.from({ length: 60 }, (_, minute) =>
  String(minute).padStart(2, "0"),
);

const STANDINGS_PAGE_SIZE = 50;
const LIST_PAGE_SIZE = 20;
const REQUEST_TIMEOUT_MS = 15000;
const HEALTH_CHECK_TIMEOUT_MS = 5000;
const REGISTRATION_WINDOW_MS = 60 * 60 * 1000;
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

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
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
  labelKey: string;
}> = [
  { key: "current", labelKey: "tournamentsPage.pageTabs.current" },
  { key: "schedule", labelKey: "tournamentsPage.pageTabs.schedule" },
  { key: "create", labelKey: "tournamentsPage.pageTabs.create" },
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
  const looksChess960 =
    String(item.gameType || "").toLowerCase() === "chess960" ||
    /960/.test(`${item.name} ${item.timeControlLabel || ""} ${item.formatLabel || ""}`);
  if (looksChess960) return "chess960";

  const ratingPool = getRatingPoolForMatch(
    {
      initial: Math.max(0, Math.round(Number(item.timeControl?.baseMs || 300000) / 1000)),
      increment: getIncrementSeconds(item.timeControl),
    },
    "standard",
  );

  if (ratingPool === "bullet") return "bullet";
  if (ratingPool === "blitz") return "blitz";
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
  const minAbbr = i18n.t("tournamentsPage.units.minAbbr", "min");
  const secAbbr = i18n.t("tournamentsPage.units.secAbbr", "s");
  return incrementSeconds > 0
    ? `${baseMinutes} ${minAbbr} +${incrementSeconds}${secAbbr}`
    : `${baseMinutes} ${minAbbr}`;
}

function getUiLocale() {
  const language = String(i18n.resolvedLanguage || i18n.language || "").toLowerCase();
  if (language.startsWith("mn")) return "mn-MN";
  return undefined;
}

function formatShortTime(date: Date) {
  return new Intl.DateTimeFormat(getUiLocale(), {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatRelativeCountdown(totalMinutes: number) {
  const safeMinutes = Math.max(0, Math.ceil(totalMinutes));
  const minAbbr = i18n.t("tournamentsPage.units.minAbbr", "min");
  const hourAbbr = i18n.t("tournamentsPage.units.hourAbbr", "hr");
  const dayAbbr = i18n.t("tournamentsPage.units.dayAbbr", "day");
  if (safeMinutes < 60) return `${safeMinutes} ${minAbbr}`;
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  if (hours < 24) {
    if (minutes === 0) return `${hours} ${hourAbbr}`;
    return `${hours} ${hourAbbr} ${minutes} ${minAbbr}`;
  }
  const days = Math.floor(hours / 24);
  return `${days} ${dayAbbr}`;
}

function formatStartsIn(target: Date, now: Date) {
  const diffMinutes = (target.getTime() - now.getTime()) / 60000;
  if (diffMinutes <= 0) {
    return i18n.t("tournamentsPage.status.startsSoon", "Starts soon");
  }
  return i18n.t("tournamentsPage.status.startsIn", {
    duration: formatRelativeCountdown(diffMinutes),
    defaultValue: "Starts in {{duration}}",
  });
}

function parseStartDateParts(item: TournamentSummary) {
  const datePart = String(item.startDate || "").trim();
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!dateMatch) return null;

  const hour = Number.parseInt(String(item.startHour ?? "0"), 10);
  const minute = Number.parseInt(String(item.startMinute ?? "0"), 10);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;

  const fromParts = new Date(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    hour,
    minute,
    0,
    0,
  );
  return Number.isNaN(fromParts.getTime()) ? null : fromParts;
}

function getScheduledTournamentStart(item: TournamentSummary) {
  return (
    parseDateValue(item.scheduledStartAt) ||
    parseDateValue(item.startAt) ||
    parseStartDateParts(item)
  );
}

function getKnownTournamentDurationMinutes(item: TournamentSummary) {
  const explicitMinutes = Number(item.durationMinutes || 0);
  if (Number.isFinite(explicitMinutes) && explicitMinutes > 0) {
    return Math.max(1, Math.round(explicitMinutes));
  }

  const startedAt = parseDateValue(item.startedAt) || getScheduledTournamentStart(item);
  const finishedAt = parseDateValue(item.finishedAt);
  if (startedAt && finishedAt && finishedAt.getTime() > startedAt.getTime()) {
    return Math.max(1, Math.round((finishedAt.getTime() - startedAt.getTime()) / 60000));
  }

  return null;
}

function getTournamentEndAt(item: TournamentSummary) {
  const start = parseDateValue(item.startedAt) || getScheduledTournamentStart(item);
  const durationMinutes = getKnownTournamentDurationMinutes(item);
  if (!start || !durationMinutes) return null;
  return new Date(start.getTime() + durationMinutes * 60000);
}

function isTournamentEnded(item: TournamentSummary, now: Date) {
  if (item.status === "FINISHED") return true;
  const endAt = getTournamentEndAt(item);
  return !!endAt && now.getTime() >= endAt.getTime();
}

function getTournamentTimeLabel(item: TournamentSummary) {
  const scheduledStart = getScheduledTournamentStart(item);
  if (scheduledStart) return formatShortTime(scheduledStart);

  const registrationDeadline = parseDateValue(item.registrationDeadline);
  if (registrationDeadline) return formatShortTime(registrationDeadline);

  const startedAt = parseDateValue(item.startedAt);
  if (startedAt) return formatShortTime(startedAt);

  const createdAt = parseDateValue(item.createdAt);
  if (createdAt) return formatShortTime(createdAt);

  return "--";
}

function getTournamentStatusText(item: TournamentSummary, now: Date) {
  const startAt = parseDateValue(item.startedAt) || getScheduledTournamentStart(item);
  const endAt = getTournamentEndAt(item);

  if (isTournamentEnded(item, now)) {
    return item.status === "FINISHED"
      ? i18n.t("tournamentsPage.status.resultsAvailable", "Results available")
      : i18n.t("tournamentsPage.status.ended", "Ended");
  }

  if (startAt && now.getTime() < startAt.getTime()) {
    return formatStartsIn(startAt, now);
  }

  if (endAt && now.getTime() < endAt.getTime()) {
    const leftMinutes = (endAt.getTime() - now.getTime()) / 60000;
    return i18n.t("tournamentsPage.status.timeLeft", {
      duration: formatRelativeCountdown(leftMinutes),
      defaultValue: "{{duration}} left",
    });
  }

  if (item.status === "LIVE_ROUND" || item.status === "ROUND_CLOSED") {
    return i18n.t("tournamentsPage.status.inProgress", "In progress");
  }

  return i18n.t("tournamentsPage.status.startsSoon", "Starts soon");
}

function isRegistrationLocked(item: TournamentSummary, now: Date) {
  if (item.status === "REGISTRATION_OPEN") return false;
  const startAt = getScheduledTournamentStart(item);
  if (!startAt) return false;
  return now.getTime() < startAt.getTime() - REGISTRATION_WINDOW_MS;
}

function isRegistrationOpenBySchedule(item: TournamentSummary, now: Date) {
  const startAt = getScheduledTournamentStart(item);
  if (!startAt) {
    return item.status === "REGISTRATION_OPEN";
  }
  const nowMs = now.getTime();
  const registrationOpenMs = startAt.getTime() - REGISTRATION_WINDOW_MS;
  return nowMs >= registrationOpenMs && nowMs < startAt.getTime();
}

function canJoinTournament(item: TournamentSummary, now: Date) {
  return (
    !item.isRegistered &&
    !isTournamentEnded(item, now) &&
    (item.status === "REGISTRATION_OPEN" ||
      isRegistrationOpenBySchedule(item, now) ||
      isTournamentRunning(item, now))
  );
}

function isTournamentRunning(item: TournamentSummary, now: Date) {
  if (isTournamentEnded(item, now)) return false;
  if (item.status === "LIVE_ROUND" || item.status === "ROUND_CLOSED") return true;
  const startAt = parseDateValue(item.startedAt) || getScheduledTournamentStart(item);
  if (!startAt) return false;
  return now.getTime() >= startAt.getTime();
}

function getTournamentGameActionLabel(item: TournamentSummary) {
  const roundNumber = Number(item.myPendingGameRound || item.currentRound || 0);
  return roundNumber > 1
    ? i18n.t("tournamentsPage.actions.nextGame", "Next Game")
    : i18n.t("tournamentsPage.actions.startGame", "Start Game");
}

function getTournamentDisplayName(item: TournamentSummary) {
  const timeCategory = formatTimeCategory(item);
  const tournamentName = String(item.name || "").trim();
  if (!tournamentName) return timeCategory;
  return `${timeCategory} - ${tournamentName}`;
}

function getTournamentSummaryLine(item: TournamentSummary) {
  return formatType(item.type);
}

function formatDurationValue(totalMinutes: number) {
  const safeMinutes = Math.max(1, Math.round(Number(totalMinutes || 0)));
  const minAbbr = i18n.t("tournamentsPage.units.minAbbr", "min");
  const hourAbbr = i18n.t("tournamentsPage.units.hourShort", "h");
  if (safeMinutes < 60) return `${safeMinutes} ${minAbbr}`;
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  if (minutes === 0) return `${hours}${hourAbbr}`;
  return `${hours}${hourAbbr} ${minutes}${minAbbr}`;
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

function getGameTimeLabel(timeControl?: TimeControl) {
  const baseMinutes = getBaseMinutes(timeControl);
  const incrementSeconds = getIncrementSeconds(timeControl);
  return `${baseMinutes}+${incrementSeconds}`;
}

function getTournamentMetaLine(item: TournamentSummary) {
  const typeLabel = getTournamentSummaryLine(item);
  const timeLabel = getTournamentTimeLabel(item);
  if (!timeLabel || timeLabel === "--") return typeLabel;
  return `${typeLabel} \u00b7 ${timeLabel}`;
}

function getInitials(name: string) {
  const letters = String(name || "")
    .replace(/[^a-zA-Z]/g, "")
    .slice(0, 2)
    .toUpperCase();
  return letters || "??";
}

function formatArenaScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatSignedRatingDelta(delta: number) {
  if (delta > 0) return `+${delta}`;
  return `${delta}`;
}

function ratingDeltaTextClass(delta: number) {
  if (delta > 0) return "text-emerald-300";
  if (delta < 0) return "text-rose-300";
  return "text-slate-300";
}

function getStandingGames(row: StandingRow) {
  const explicitGames = Number(row.games ?? row.gamesPlayed);
  if (Number.isFinite(explicitGames) && explicitGames >= 0) return explicitGames;
  return Number(row.wins || 0) + Number(row.draws || 0) + Number(row.losses || 0);
}

function ArenaResultsModal({
  detail,
  currentUserId,
  onClose,
}: {
  detail: DetailResponse;
  currentUserId: string;
  onClose: () => void;
}) {
  const tournament = detail.tournament;
  const topRows = [...(detail.standings || [])]
    .sort((a, b) => Number(a.rank || 9999) - Number(b.rank || 9999))
    .slice(0, 3);
  const viewerRow =
    tournament.isRegistered && currentUserId
      ? (detail.standings || []).find((row) => String(row.userId) === currentUserId) || null
      : null;
  const isRatedTournament = tournament.rated === true;
  const ratingDeltaByUserId = new Map(
    (detail.players || []).map((player) => [
      String(player.userId || ""),
      Number.isFinite(Number(player.tournamentEloDelta))
        ? Math.round(Number(player.tournamentEloDelta))
        : 0,
    ]),
  );
  const getRatingDelta = (userId: string) =>
    Number(ratingDeltaByUserId.get(String(userId || "")) || 0);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-[430px] overflow-hidden rounded-2xl border border-brand-400/30 bg-slate-950/95 text-white shadow-[0_28px_80px_rgba(0,0,0,0.65)]">
        <div className="relative border-b border-brand-400/20 bg-brand-500/10 px-6 pb-8 pt-7 text-center">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-white/60 transition hover:bg-white/10 hover:text-white"
            aria-label="Close tournament results"
          >
            <X size={18} />
          </button>
          <h3 className="text-2xl font-semibold leading-tight"><Trans>Arena Over</Trans></h3>
          <p className="mt-1 text-sm text-white/80">{tournament.name || "Tournament"}</p>
          <p className="mt-0.5 text-xs text-white/55">
            {tournament.timeControlLabel || formatTimeCategory(tournament)}
          </p>
        </div>

        <div className="space-y-4 px-6 py-5">
          {topRows.map((row, index) => (
            <div key={row.userId || `${row.rank}-${row.username}`} className="flex items-center gap-3">
              <div
                className={classNames(
                  "flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 text-2xl font-black shadow-lg",
                  index === 0
                    ? "border-amber-300 bg-gradient-to-br from-amber-200 to-amber-600 text-amber-950"
                    : index === 1
                      ? "border-slate-200 bg-gradient-to-br from-slate-100 to-slate-500 text-slate-950"
                      : "border-orange-300 bg-gradient-to-br from-orange-200 to-orange-700 text-orange-950",
                )}
              >
                {index + 1}
              </div>
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border-2 border-brand-400/70 bg-slate-800 text-base font-semibold text-white/80">
                {row.avatar ? (
                  <img src={row.avatar} alt={row.username} className="h-full w-full object-cover" />
                ) : (
                  getInitials(row.username)
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">{row.username}</div>
                <div className="mt-0.5 flex items-baseline gap-1">
                  <span className="text-2xl font-black">{formatArenaScore(Number(row.points || 0))}</span>
                  <span className="text-sm font-semibold text-white/55">/ {getStandingGames(row)}</span>
                  {isRatedTournament ? (
                    <span
                      className={`text-sm font-semibold ${ratingDeltaTextClass(
                        getRatingDelta(String(row.userId || "")),
                      )}`}
                    >
                      {formatSignedRatingDelta(getRatingDelta(String(row.userId || "")))}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>

        {viewerRow ? (
          <div className="flex items-center gap-3 border-t border-brand-400/20 bg-brand-500/10 px-4 py-3">
            <div className="w-12 shrink-0 text-right text-sm font-semibold text-white/70">
              {viewerRow.rank}
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-800 text-xs font-semibold">
              {viewerRow.avatar ? (
                <img src={viewerRow.avatar} alt={viewerRow.username} className="h-full w-full object-cover" />
              ) : (
                getInitials(viewerRow.username)
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{viewerRow.username}</div>
              <div className="text-xs text-white/55">({viewerRow.elo})</div>
            </div>
            <div className="text-lg font-black">{formatArenaScore(Number(viewerRow.points || 0))}</div>
            <div className="text-sm font-semibold text-white/60">/ {getStandingGames(viewerRow)}</div>
            {isRatedTournament ? (
              <div
                className={`text-sm font-semibold ${ratingDeltaTextClass(
                  getRatingDelta(String(viewerRow.userId || "")),
                )}`}
              >
                {formatSignedRatingDelta(getRatingDelta(String(viewerRow.userId || "")))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
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
  const normalizedLabel = label.toLowerCase();
  const isResults = normalizedLabel.includes("results");
  const isEnded = normalizedLabel === "ended";
  const isLive =
    status === "LIVE_ROUND" ||
    status === "ROUND_CLOSED" ||
    normalizedLabel.includes("left") ||
    normalizedLabel.includes("progress");
  const showDot = isResults || isEnded || isLive || status === "REGISTRATION_OPEN";
  const dotClass = isEnded
    ? "bg-rose-400"
    : isLive
      ? "bg-amber-400"
      : "bg-emerald-400";
  const tone = isResults || status === "REGISTRATION_OPEN"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300"
    : isEnded || status === "CANCELLED"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-300"
      : isLive
        ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300"
        : status === "FINISHED"
          ? "border-slate-400/35 bg-slate-500/10 text-slate-600 dark:text-slate-300"
          : "border-gray-400/35 bg-gray-500/10 text-gray-600 dark:text-gray-300";

  return (
    <span
      className={classNames(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none",
        tone,
      )}
    >
      {showDot && (
        <span
          className={classNames("h-1.5 w-1.5 rounded-full", dotClass, isLive && "animate-pulse")}
        />
      )}
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
  const { t } = useTranslation();
  return (
    <nav className="flex h-[54px] w-full items-stretch gap-[2px] overflow-x-auto overflow-y-hidden border-b border-theme-glass bg-theme-secondary px-5 no-scrollbar">
      {PAGE_TAB_OPTIONS.map(({ key, labelKey }) => {
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
            {t(labelKey)}
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
  onOpenGame,
  onOpenResult,
}: {
  item: TournamentSummary;
  selected: boolean;
  now: Date;
  busyAction: string;
  onSelect: (id: string) => void;
  onRegister: (id: string) => void;
  onOpenGame: (gameId: string) => void;
  onOpenResult: (id: string) => void;
}) {
  const { t } = useTranslation();
  const speed = getTournamentSpeed(item);
  const statusText = getTournamentStatusText(item, now);
  const gameTimeLabel = getGameTimeLabel(item.timeControl);
  const durationText = getTournamentDurationLabel(item, now);
  const isBusy = busyAction.includes(item.id);
  const hasEnded = isTournamentEnded(item, now);
  const registrationOpen = canJoinTournament(item, now);
  const registrationLocked = !registrationOpen && !item.isRegistered && isRegistrationLocked(item, now);
  const runningAndJoined = item.isRegistered && isTournamentRunning(item, now);
  const hasPendingGame = runningAndJoined && !!String(item.myPendingGameId || "").trim();
  const actionLabel = hasEnded
    ? t("tournamentsPage.actions.result", "Result")
    : t("tournamentsPage.actions.open", "Open");
  const actionButtonClass =
    "inline-flex h-7 min-w-[72px] items-center justify-center rounded-md px-3 text-[12px] font-semibold transition-colors disabled:opacity-60";
  const registrationHint = registrationLocked
    ? t(
        "tournamentsPage.hints.registrationStartsOneHourBefore",
        "Registration begins 1 hour before the event starts",
      )
    : "";

  return (
    <tr
      className={classNames(
        "border-t border-theme-glass transition-colors duration-200 ease-out",
        selected
          ? "bg-brand-500/15 dark:bg-brand-500/20"
          : "hover:bg-gray-900/[0.025] dark:hover:bg-white/[0.035]",
      )}
    >
      <td className="align-middle px-5 py-3">
        <button
          type="button"
          onClick={() => onSelect(item.id)}
          className="group flex min-w-0 items-center gap-3 text-left"
        >
          <TournamentTypeIcon speed={speed} />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold text-gray-900 group-hover:text-brand-700 dark:text-white dark:group-hover:text-brand-300">
              {getTournamentDisplayName(item)}
            </span>
            <span className="mt-1 block truncate text-[11px] text-gray-500/85 dark:text-gray-400/85">
              {getTournamentMetaLine(item)}
            </span>
          </span>
        </button>
      </td>
      <td className="align-middle px-5 py-3 text-left whitespace-nowrap">
        <span className="text-[12px] font-semibold text-gray-800 dark:text-gray-100">
          {gameTimeLabel}
        </span>
      </td>
      <td className="align-middle px-5 py-3 text-left whitespace-nowrap">
        <span className="inline-flex rounded-full border border-theme-glass bg-gray-900/[0.04] px-2.5 py-1 text-[11px] font-medium text-gray-700 dark:bg-white/[0.06] dark:text-gray-200">
          {durationText}
        </span>
      </td>
      <td className="align-middle px-5 py-3 text-left whitespace-nowrap">
        <TournamentStatusBadge status={item.status} label={statusText} />
      </td>
      <td className="align-middle px-5 py-3 text-left whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-gray-700 dark:text-gray-200">
          <Users className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" aria-hidden="true" />
          {formatPlayersCount(item)}
        </span>
      </td>
      <td className="align-middle px-5 py-3 text-right">
        <div className="flex flex-col items-end gap-1.5">
          {hasPendingGame ? (
            <button
              type="button"
              onClick={() => onOpenGame(String(item.myPendingGameId || ""))}
              disabled={!!busyAction || !item.myPendingGameId}
              className={classNames(
                actionButtonClass,
                "min-w-[92px] bg-emerald-500 text-white hover:bg-emerald-400",
              )}
            >
              {t("tournamentsPage.actions.continue", "Continue")}
            </button>
          ) : registrationOpen ? (
            <button
              type="button"
              onClick={() => onRegister(item.id)}
              disabled={!!busyAction}
              className={classNames(
                actionButtonClass,
                "bg-emerald-500 text-white hover:bg-emerald-400",
              )}
            >
              {isBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                t("tournamentsPage.actions.join", "Join")
              )}
            </button>
          ) : item.isRegistered && !hasEnded ? (
            <button
              type="button"
              onClick={() => onRegister(item.id)}
              disabled={!!busyAction}
              className={classNames(
                actionButtonClass,
                "bg-emerald-500 text-white hover:bg-emerald-400",
              )}
            >
              {t("tournamentsPage.actions.continue", "Continue")}
            </button>
          ) : registrationLocked ? (
            <button
              type="button"
              disabled
              className={classNames(
                actionButtonClass,
                "bg-gray-300 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
              )}
            >
              {t("tournamentsPage.actions.join", "Join")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => (hasEnded ? onOpenResult(item.id) : onSelect(item.id))}
              className={classNames(
                actionButtonClass,
                hasEnded
                  ? "bg-brand-500 text-white hover:bg-brand-400 dark:text-gray-950"
                  : "bg-brand-500 text-white hover:bg-brand-400 dark:text-gray-950",
              )}
            >
              {actionLabel}
            </button>
          )}
          {registrationHint && (
            <span className="max-w-[220px] text-right text-[11px] leading-tight text-gray-500 dark:text-gray-400">
              {registrationHint}
            </span>
          )}
        </div>
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
  onOpenGame,
  onOpenResult,
  embedded = false,
}: {
  tournaments: TournamentSummary[];
  loading: boolean;
  now: Date;
  selectedId: string;
  busyAction: string;
  onSelect: (id: string) => void;
  onRegister: (id: string) => void;
  onOpenGame: (gameId: string) => void;
  onOpenResult: (id: string) => void;
  embedded?: boolean;
}) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div
        className={
          embedded
            ? "theme-glass-panel-soft mt-3 overflow-hidden rounded-xl p-4"
            : "theme-glass-panel overflow-hidden rounded-xl p-4"
        }
      >
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-14 animate-pulse rounded-lg border border-theme-glass bg-gray-100/70 dark:bg-white/5"
            />
          ))}
        </div>
      </div>
    );
  }

  if (tournaments.length === 0) {
    return (
      <div
        className={
          embedded
            ? "theme-glass-panel-soft mt-3 rounded-xl px-6 py-12 text-center"
            : "theme-glass-panel rounded-xl px-6 py-12 text-center"
        }
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-theme-glass bg-white/60 text-brand-500 dark:bg-white/5">
          <Trophy className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
          {t("No tournaments available")}
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          {t(
            "tournamentsPage.empty.createOrCheckBack",
            "Create one or check back when registration opens.",
          )}
        </p>
      </div>
    );
  }

  const tableContent = (
    <>
      <div
        className={classNames(
          "hidden overflow-hidden rounded-xl border border-theme-glass bg-white/60 shadow-[0_14px_40px_rgba(15,23,42,0.08)] dark:bg-gray-950/45 dark:shadow-[0_18px_50px_rgba(0,0,0,0.24)] lg:block",
          embedded ? "mt-3" : "",
        )}
      >
        <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] table-fixed text-left">
          <colgroup>
            <col className="w-[29%]" />
            <col className="w-[16%]" />
            <col className="w-[13%]" />
            <col className="w-[20%]" />
            <col className="w-[12%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead className="bg-gray-900/[0.04] text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-500 dark:bg-white/[0.035] dark:text-gray-400">
            <tr>
              <th className="px-5 py-3 text-left">
                {t("tournamentsPage.table.type", "Type")}
              </th>
              <th className="px-5 py-3 text-left">
                {t("tournamentsPage.table.gameTime", "Game Time")}
              </th>
              <th className="px-5 py-3 text-left">
                {t("tournamentsPage.table.duration", "Duration")}
              </th>
              <th className="px-5 py-3 text-left">
                {t("tournamentsPage.table.status", "Status")}
              </th>
              <th className="px-5 py-3 text-left">
                {t("tournamentsPage.table.players", "Players")}
              </th>
              <th className="px-5 py-3 text-right">
                {t("tournamentsPage.table.action", "Action")}
              </th>
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
                onOpenGame={onOpenGame}
                onOpenResult={onOpenResult}
              />
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <div
        className={classNames(
          "overflow-hidden rounded-xl border border-theme-glass bg-white/60 dark:bg-gray-950/45 lg:hidden",
          embedded ? "mt-3" : "",
        )}
      >
        {tournaments.map((item) => {
          const speed = getTournamentSpeed(item);
          const statusText = getTournamentStatusText(item, now);
          const gameTimeLabel = getGameTimeLabel(item.timeControl);
          const durationText = getTournamentDurationLabel(item, now);
          const hasEnded = isTournamentEnded(item, now);
          const registrationOpen = canJoinTournament(item, now);
          const registrationLocked =
            !registrationOpen && !item.isRegistered && isRegistrationLocked(item, now);
          const runningAndJoined = item.isRegistered && isTournamentRunning(item, now);
          const hasPendingGame = runningAndJoined && !!String(item.myPendingGameId || "").trim();
          const isBusy = busyAction.includes(item.id);
          return (
            <article
              key={item.id}
              className={classNames(
                "border-t border-theme-glass p-4 transition-colors duration-200 ease-out first:border-t-0",
                selectedId === item.id ? "bg-brand-500/15 dark:bg-brand-500/20" : "",
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
                    {getTournamentMetaLine(item)}
                  </p>
                </div>
                <TournamentStatusBadge status={item.status} label={statusText} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-theme-glass bg-white/40 p-3 dark:bg-white/[0.03]">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                    {t("tournamentsPage.table.gameTime", "Game Time")}
                  </p>
                  <p className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-100">
                    {gameTimeLabel}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                    {t("tournamentsPage.table.duration", "Duration")}
                  </p>
                  <p className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-100">
                    {durationText}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                    {t("tournamentsPage.table.players", "Players")}
                  </p>
                  <p className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-100">
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                      {formatPlayersCount(item)}
                    </span>
                  </p>
                </div>
              </div>
              {registrationLocked && (
                <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                  {t(
                    "tournamentsPage.hints.registrationStartsOneHourBefore",
                    "Registration begins 1 hour before the event starts",
                  )}
                </p>
              )}
              <div className="mt-4 flex items-center justify-end gap-3">
                {hasPendingGame ? (
                  <button
                    type="button"
                    onClick={() => onOpenGame(String(item.myPendingGameId || ""))}
                    disabled={!!busyAction || !item.myPendingGameId}
                    className="inline-flex h-8 min-w-[104px] items-center justify-center rounded-md bg-emerald-500 px-3 text-[12px] font-semibold text-white transition-colors hover:bg-emerald-400 disabled:opacity-60"
                  >
                    {t("tournamentsPage.actions.continue", "Continue")}
                  </button>
                ) : registrationOpen ? (
                  <button
                    type="button"
                    onClick={() => onRegister(item.id)}
                    disabled={!!busyAction}
                    className="inline-flex h-8 min-w-[76px] items-center justify-center rounded-md bg-emerald-500 px-3 text-[12px] font-semibold text-white transition-colors hover:bg-emerald-400 disabled:opacity-60"
                  >
                    {isBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      t("tournamentsPage.actions.join", "Join")
                    )}
                  </button>
                ) : item.isRegistered && !hasEnded ? (
                  <button
                    type="button"
                    onClick={() => onRegister(item.id)}
                    disabled={!!busyAction}
                    className="inline-flex h-8 min-w-[104px] items-center justify-center rounded-md bg-emerald-500 px-3 text-[12px] font-semibold text-white transition-colors hover:bg-emerald-400 disabled:opacity-60"
                  >
                    {t("tournamentsPage.actions.continue", "Continue")}
                  </button>
                ) : registrationLocked ? (
                  <button
                    type="button"
                    disabled
                    className="inline-flex h-8 min-w-[76px] items-center justify-center rounded-md bg-gray-300 px-3 text-[12px] font-semibold text-gray-600 transition-colors disabled:opacity-70 dark:bg-gray-700 dark:text-gray-300"
                  >
                    {t("tournamentsPage.actions.join", "Join")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => (hasEnded ? onOpenResult(item.id) : onSelect(item.id))}
                    disabled={!!busyAction}
                    className="inline-flex h-8 min-w-[76px] items-center justify-center rounded-md bg-brand-500 px-3 text-[12px] font-semibold text-white transition-colors hover:bg-brand-400 disabled:opacity-60 dark:text-gray-950"
                  >
                    {isBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : hasEnded ? (
                      t("tournamentsPage.actions.result", "Result")
                    ) : (
                      t("tournamentsPage.actions.open", "Open")
                    )}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );

  return tableContent;
}

type ScheduleFormatFilter = "all" | "arena";

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

const SCHEDULE_FORMAT_OPTIONS: Array<{ value: ScheduleFormatFilter; labelKey: string }> = [
  { value: "all", labelKey: "tournamentsPage.filters.allFormats" },
  { value: "arena", labelKey: "tournamentCommon.formats.arena" },
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
  const normalized = Math.floor(Math.max(0, Math.min(59, value)));
  return String(normalized).padStart(2, "0");
}

function buildScheduledStartDate(dateValue: string, hourValue: string, minuteValue: string) {
  const date = parseDateInputValueOnly(dateValue);
  if (!date) return null;

  const hours = Number.parseInt(hourValue, 10);
  const minutes = Number.parseInt(minuteValue, 10);
  if (!Number.isInteger(hours) || hours < 0 || hours > 23) return null;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) return null;

  date.setHours(hours, minutes, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function buildScheduledStartIso(dateValue: string, hourValue: string, minuteValue: string) {
  const date = buildScheduledStartDate(dateValue, hourValue, minuteValue);
  if (!date) return null;
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
  return new Intl.DateTimeFormat(getUiLocale(), { hour: "numeric" }).format(date);
}

function formatDayBoundaryLabel(date: Date) {
  return new Intl.DateTimeFormat(getUiLocale(), {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
    .format(date)
    .toUpperCase();
}

function formatScheduleDayLabel(date: Date) {
  return new Intl.DateTimeFormat(getUiLocale(), {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function getTournamentStartDate(item: TournamentSummary) {
  return (
    getScheduledTournamentStart(item) ||
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
  statusFilter: StatusFilter,
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
      if (String(item.type || "").toLowerCase() !== "arena") return [];
      if (item.status === "CANCELLED" || item.status === "DRAFT") return [];
      const speed = getTournamentSpeed(item);
      if (formatFilter !== "all" && String(item.type || "").toLowerCase() !== formatFilter) {
        return [];
      }
      if (statusFilter !== "all" && item.status !== statusFilter) {
        return [];
      }

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
  onOpenGame,
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
  onOpenGame: (gameId: string) => void;
}) {
  const { t } = useTranslation();
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
    () => buildTimelineItems(tournaments, scheduleDayValue, formatFilter, statusFilter, now),
    [formatFilter, now, scheduleDayValue, statusFilter, tournaments],
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
                {t(option.labelKey)}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => onStatusFilterChange(event.target.value as StatusFilter)}
            className="rounded-lg border border-white/10 bg-[#0b1727] px-3 py-2 text-sm font-medium text-slate-100 outline-none transition-colors focus:border-brand-400"
          >
            <option value="all">{t("tournamentsPage.filters.allStatuses")}</option>
            <option value="REGISTRATION_OPEN">
              {t("tournamentCommon.status.registrationOpen")}
            </option>
            <option value="LIVE_ROUND">{t("tournamentCommon.status.live")}</option>
            <option value="FINISHED">{t("tournamentCommon.status.finished")}</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => moveDay(-1)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-white"
            aria-label={t("tournamentsPage.schedule.previousDay", "Previous day")}
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
            aria-label={t("tournamentsPage.schedule.nextDay", "Next day")}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onScheduleDateChange(toDateInputValueOnly(new Date()))}
            className="h-10 rounded-lg border border-brand-400/30 bg-brand-500/10 px-3 text-xs font-semibold uppercase tracking-[0.2em] text-brand-200 transition-colors hover:bg-brand-500/15"
          >
            {t("tournamentsPage.schedule.today", "Today")}
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
        <span>
          {t("tournamentsPage.schedule.scheduledCount", {
            count: timelineItems.length,
            defaultValue: "{{count}} scheduled tournaments in next 7 days",
          })}
        </span>
      </div>

      {timelineItems.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 py-14 text-center">
          <div>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-brand-300">
              <CalendarDays className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="mt-4 text-base font-semibold text-white">
              {t(
                "tournamentsPage.schedule.emptyTitle",
                "No tournaments in this 7-day window",
              )}
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              {t(
                "tournamentsPage.schedule.emptyDescription",
                "Try another day or loosen the format/status filters.",
              )}
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
                const hasEnded = isTournamentEnded(item, now);
                const canRegister = canJoinTournament(item, now);
                const runningAndJoined = item.isRegistered && isTournamentRunning(item, now);
                const hasPendingGame =
                  runningAndJoined && !!String(item.myPendingGameId || "").trim();
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
                      if (hasPendingGame) {
                        onOpenGame(String(item.myPendingGameId || ""));
                        return;
                      }
                      if (canRegister) {
                        onRegister(item.id);
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
                        {t("tournamentsPage.detail.playersCount", {
                          count: item.registeredCount,
                          defaultValue: "{{count}} players",
                        })}
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
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const isTournamentRoute = location.pathname.startsWith("/tournaments");
  const selectedFromUrl = String(searchParams.get("selected") || "").trim();
  const initialTab = parsePageTab(searchParams.get("tab")) || "current";

  const [pageTab, setPageTab] = useState<TournamentPageTab>(initialTab);
  const [now, setNow] = useState(() => new Date());
  const [search, setSearch] = useState("");
  const [formatFilter, setFormatFilter] = useState<CurrentFormatFilter>("all");
  const [scheduleFormatFilter, setScheduleFormatFilter] =
    useState<ScheduleFormatFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
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
  const [resultModalDetail, setResultModalDetail] = useState<DetailResponse | null>(null);
  const [standingsPage, setStandingsPage] = useState(1);

  const [createView, setCreateView] = useState<CreateTournamentView>("form");
  const [createName, setCreateName] = useState("");
  const [createType, setCreateType] = useState<TournamentType>("arena");
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
  const [createStartTimeError, setCreateStartTimeError] = useState<string | null>(null);
  const [pendingCreateId, setPendingCreateId] = useState<string | null>(null);

  const currentUserId = String(user?.id || "");
  const createTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Local";
  const isCreateChess960 = createGameType === "chess960";
  const effectiveCreateRated = isCreateChess960 ? false : createRated;
  const isMountedRef = useRef(true);
  const routeActiveRef = useRef(isTournamentRoute);
  const selectedIdRef = useRef(selectedId);
  const selectedFromUrlRef = useRef(selectedFromUrl);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    routeActiveRef.current = isTournamentRoute;
    if (!isTournamentRoute) {
      setSelectedId("");
      setDetail(null);
      setBusyAction("");
    }
  }, [isTournamentRoute]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    selectedFromUrlRef.current = selectedFromUrl;
  }, [selectedFromUrl]);

  useEffect(() => {
    if (!isCreateChess960) return;
    setCreateRated(false);
  }, [isCreateChess960]);

  useEffect(() => {
    if (!pendingCreateId) return;
    if (!selectedId || selectedId === pendingCreateId) return;
    setPendingCreateId(null);
  }, [pendingCreateId, selectedId]);

  useEffect(() => {
    if (!isTournamentRoute) return;
    const clock = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(clock);
  }, [isTournamentRoute]);

  useEffect(() => {
    if (!isTournamentRoute) return;
    setSelectedId((previous) => (previous === selectedFromUrl ? previous : selectedFromUrl));
  }, [isTournamentRoute, selectedFromUrl]);

  useEffect(() => {
    if (!isTournamentRoute) return;
    const urlTab = parsePageTab(searchParams.get("tab")) || "current";
    setPageTab((previous) => (previous === urlTab ? previous : urlTab));
    if (urlTab !== "create") {
      setCreateView("form");
    }

    const urlDate = parseDateInputValueOnly(searchParams.get("date"));
    if (urlDate) {
      const normalized = toDateInputValueOnly(urlDate);
      setScheduleDate((previous) => (previous === normalized ? previous : normalized));
    }
  }, [isTournamentRoute, searchParams]);

  function updateTournamentSearchParams(
    mutate: (params: URLSearchParams) => void,
  ) {
    if (!routeActiveRef.current) return;
    const nextParams = new URLSearchParams(window.location.search);
    const previousSerialized = nextParams.toString();
    mutate(nextParams);
    if (nextParams.toString() === previousSerialized) return;
    setSearchParams(nextParams, { replace: true });
  }

  function writeTabToUrl(tabKey: TournamentPageTab, nextDate = scheduleDate) {
    updateTournamentSearchParams((nextParams) => {
      nextParams.set("tab", tabKey);
      if (tabKey === "schedule") {
        nextParams.set("date", nextDate);
      } else {
        nextParams.delete("date");
      }
    });
  }

  function switchToCurrentTabWithSelection(tournamentId: string) {
    const normalizedTournamentId = String(tournamentId || "").trim();
    setPageTab("current");
    setListPage(1);
    setSelectedId((previous) =>
      previous === normalizedTournamentId ? previous : normalizedTournamentId,
    );
    updateTournamentSearchParams((nextParams) => {
      nextParams.set("tab", "current");
      nextParams.delete("date");
      if (normalizedTournamentId) {
        nextParams.set("selected", normalizedTournamentId);
      } else {
        nextParams.delete("selected");
      }
    });
  }

  function selectTournament(tournamentId: string) {
    const normalizedTournamentId = String(tournamentId || "").trim();
    setSelectedId((previous) =>
      previous === normalizedTournamentId ? previous : normalizedTournamentId,
    );
    updateTournamentSearchParams((nextParams) => {
      if (normalizedTournamentId) {
        nextParams.set("selected", normalizedTournamentId);
      } else {
        nextParams.delete("selected");
      }
    });
  }

  function resetCreateForm(options?: { keepType?: boolean }) {
    const nowDate = new Date();
    setCreateName("");
    if (!options?.keepType) {
      setCreateType("arena");
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
    setCreateStartTimeError(null);
  }

  function beginCreateFlow(type: TournamentType) {
    const normalizedType = "arena";
    resetCreateForm({ keepType: true });
    setCreateType(normalizedType);
    setTimePreset("blitz_3_2");
    setCreateDurationMinutes("30");
    setCreateView("form");
  }

  function backToCreateChoices() {
    resetCreateForm();
    setPageTab("current");
    writeTabToUrl("current");
  }

  function handleScheduleDateChange(value: string) {
    const nextDate = toDateInputValueOnly(parseDateInputValueOnly(value) || new Date());
    setScheduleDate(nextDate);
    writeTabToUrl("schedule", nextDate);
  }

  function handlePageTabChange(nextTab: TournamentPageTab) {
    if (nextTab === "create") {
      setPageTab("create");
      setCreateView("form");
      resetCreateForm();
      setCreateType("arena");
      setTimePreset("blitz_3_2");
      setCreateDurationMinutes("30");
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
      return t("tournamentCommon.status.registrationOpen", "Registration Open");
    }
    if (status === "LIVE_ROUND") {
      return t("tournamentCommon.status.live", "Live");
    }
    if (status === "ROUND_CLOSED") {
      return t("tournamentCommon.badges.roundClosed", "Round closed");
    }
    if (status === "CANCELLED") {
      return t("tournamentCommon.status.cancelled", "Cancelled");
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

  const visibleTournaments = useMemo(() => {
    const nowMs = now.getTime();
    return list
      .filter((item) => {
        if (String(item.type || "").toLowerCase() !== "arena") return false;
        if (item.status === "CANCELLED" || item.status === "DRAFT") return false;
        const joinable = canJoinTournament(item, now);
        const registeredOpen = item.isRegistered && item.status === "REGISTRATION_OPEN";
        const joinedRunning = item.isRegistered && isTournamentRunning(item, now);
        const ended = isTournamentEnded(item, now);
        return joinable || registeredOpen || joinedRunning || ended;
      })
      .sort((a, b) => {
        const aJoinable = canJoinTournament(a, now);
        const bJoinable = canJoinTournament(b, now);
        if (aJoinable !== bJoinable) return aJoinable ? -1 : 1;

        const aRegisteredOpen = a.isRegistered && a.status === "REGISTRATION_OPEN";
        const bRegisteredOpen = b.isRegistered && b.status === "REGISTRATION_OPEN";
        if (aRegisteredOpen !== bRegisteredOpen) return aRegisteredOpen ? -1 : 1;

        const aJoinedRunning = a.isRegistered && isTournamentRunning(a, now);
        const bJoinedRunning = b.isRegistered && isTournamentRunning(b, now);
        if (aJoinedRunning !== bJoinedRunning) return aJoinedRunning ? -1 : 1;

        const aEnded = isTournamentEnded(a, now);
        const bEnded = isTournamentEnded(b, now);
        if (aEnded !== bEnded) return aEnded ? 1 : -1;

        const aFinished = parseDateValue(a.finishedAt)?.getTime() || 0;
        const bFinished = parseDateValue(b.finishedAt)?.getTime() || 0;
        if (aFinished !== bFinished) return bFinished - aFinished;

        const aStart = getScheduledTournamentStart(a)?.getTime() || 0;
        const bStart = getScheduledTournamentStart(b)?.getTime() || 0;
        if (aStart !== bStart) return aStart - bStart;

        const aCreated = parseDateValue(a.createdAt)?.getTime() || nowMs;
        const bCreated = parseDateValue(b.createdAt)?.getTime() || nowMs;
        return aCreated - bCreated;
      });
  }, [list, now]);

  useEffect(() => {
    if (!isTournamentRoute || pageTab !== "current") return;
    if (visibleTournaments.length === 0) {
      if (selectedId) {
        selectTournament("");
      }
      return;
    }
    const hasVisibleSelection = visibleTournaments.some((item) => item.id === selectedId);
    if (!hasVisibleSelection) {
      selectTournament(visibleTournaments[0].id);
    }
  }, [isTournamentRoute, pageTab, selectedId, visibleTournaments]);

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
    if (!routeActiveRef.current || !isMountedRef.current) return false;
    try {
      const response = await fetchWithTimeout(
        `${API_URL}/healthz`,
        { credentials: "include" },
        HEALTH_CHECK_TIMEOUT_MS,
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  async function loadList(options?: { silent?: boolean }) {
    if (!routeActiveRef.current || !isMountedRef.current) return;
    try {
      if (!options?.silent) setLoadingList(true);
      const reachable = await isServerReachable();
      if (!routeActiveRef.current || !isMountedRef.current) return;
      if (!reachable) {
        setError(serverReconnectMessage);
        return;
      }
      const params = new URLSearchParams();
      const isScheduleView = pageTab === "schedule";
      if (!isScheduleView && search.trim()) params.set("search", search.trim());
      if (!isScheduleView && formatFilter !== "all") params.set("format", formatFilter);
      if (statusForFilter(statusFilter)) params.set("status", statusForFilter(statusFilter));
      params.set("sort", "starting_soon");
      params.set("page", String(isScheduleView ? 1 : listPage));
      params.set("limit", String(isScheduleView ? 100 : LIST_PAGE_SIZE));
      const response = await fetchWithTimeout(
        `${API_URL}/api/tournaments?${params.toString()}`,
        {
          credentials: "include",
        },
      );
      const payload = (await response.json().catch(() => ({}))) as Partial<TournamentListResponse> & {
        error?: string;
      };
      if (!routeActiveRef.current || !isMountedRef.current) return;
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
      const currentSelectedId = selectedIdRef.current;
      const currentSelectedFromUrl = selectedFromUrlRef.current;
      if (!currentSelectedId && !currentSelectedFromUrl && tournaments.length > 0) {
        selectTournament(tournaments[0].id);
      } else if (
        currentSelectedId &&
        !currentSelectedFromUrl &&
        !tournaments.some((tournament) => tournament.id === currentSelectedId)
      ) {
        selectTournament(tournaments[0]?.id || "");
      }
      setError(null);
    } catch (err) {
      if (!routeActiveRef.current || !isMountedRef.current) return;
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
      if (routeActiveRef.current && isMountedRef.current && !options?.silent) {
        setLoadingList(false);
      }
    }
  }

  async function loadDetail(tournamentId: string, options?: { silent?: boolean }) {
    if (!routeActiveRef.current || !isMountedRef.current) return;
    if (!tournamentId) {
      setDetail(null);
      return;
    }
    try {
      if (!options?.silent) setLoadingDetail(true);
      const reachable = await isServerReachable();
      if (!routeActiveRef.current || !isMountedRef.current) return;
      if (!reachable) {
        setError(serverReconnectMessage);
        return;
      }
      const response = await fetchWithTimeout(`${API_URL}/api/tournaments/${tournamentId}`, {
        credentials: "include",
      });
      const payload = await response.json().catch(() => ({}));
      if (!routeActiveRef.current || !isMountedRef.current) return;
      if (response.status === 404) {
        setDetail(null);
        setError(null);
        if (selectedIdRef.current === tournamentId) {
          const fallbackId = list.find((item) => item.id !== tournamentId)?.id || "";
          selectTournament(fallbackId);
        }
        return;
      }
      if (!response.ok) {
        throw new Error(
          payload?.error ||
            t("tournamentsPage.errors.fetchTournament", "Failed to fetch tournament"),
        );
      }
      setDetail(payload as DetailResponse);
      setError(null);
    } catch (err) {
      if (!routeActiveRef.current || !isMountedRef.current) return;
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
      if (routeActiveRef.current && isMountedRef.current && !options?.silent) {
        setLoadingDetail(false);
      }
    }
  }

  useEffect(() => {
    if (!isTournamentRoute || pageTab === "create") return;
    void loadList();
  }, [isTournamentRoute, pageTab]);

  useEffect(() => {
    if (!isTournamentRoute) return;
    if (!selectedId) return;
    if (pendingCreateId && selectedId === pendingCreateId) return;
    void loadDetail(selectedId);
  }, [isTournamentRoute, pendingCreateId, selectedId]);

  useEffect(() => {
    if (!isTournamentRoute || pageTab === "create") return;
    const timeout = window.setTimeout(() => {
      void loadList({ silent: false });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [isTournamentRoute, listPage, search, formatFilter, statusFilter, pageTab]);

  useEffect(() => {
    if (!isTournamentRoute) return;
    setListPage(1);
  }, [isTournamentRoute, search, formatFilter, statusFilter, pageTab]);

  useEffect(() => {
    if (!isTournamentRoute || pageTab === "create") return;
    const listTimer = window.setInterval(() => {
      void loadList({ silent: true });
    }, 20000);
    return () => window.clearInterval(listTimer);
  }, [isTournamentRoute, listPage, search, formatFilter, statusFilter, pageTab]);

  useEffect(() => {
    if (!isTournamentRoute) return;
    if (!selectedId) return;
    if (pendingCreateId && selectedId === pendingCreateId) return;
    const detailTimer = window.setInterval(() => {
      void loadDetail(selectedId, { silent: true });
    }, 8000);
    return () => window.clearInterval(detailTimer);
  }, [isTournamentRoute, pendingCreateId, selectedId]);

  useEffect(() => {
    if (!isTournamentRoute) return;
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
          if (!routeActiveRef.current || !isMountedRef.current) return;
          setError(serverReconnectMessage);
          scheduleConnectProbe();
        }
      }, 1500);
    };

    const handleConnect = () => {
      if (!routeActiveRef.current || !isMountedRef.current) return;
      setError(null);
      if (selectedId) {
        joinRoom(selectedId);
      }
    };
    const handleConnectError = () => {
      if (!routeActiveRef.current || !isMountedRef.current) return;
      setError(realtimeFailedMessage);
      scheduleConnectProbe();
    };
    const handleReconnectAttempt = () => {
      if (!routeActiveRef.current || !isMountedRef.current) return;
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
  }, [isTournamentRoute, selectedId]);

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
  const tournamentListSurfaceClass =
    pageTab === "create" || pageTab === "schedule"
      ? "theme-glass-panel-soft mt-3 mx-3 min-h-[calc(100vh-8rem)] overflow-hidden rounded-xl"
      : "mt-3 mx-3 min-h-[calc(100vh-8rem)] overflow-visible";
  const filterControlClass =
    "h-[34px] rounded-lg border border-theme-glass bg-white/75 px-3 text-[13px] font-medium text-gray-900 outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-400/15 dark:bg-gray-950/45 dark:text-gray-100";

  async function runAction(
    key: string,
    call: () => Promise<Response>,
    options?: { refreshList?: boolean; refreshDetail?: boolean },
  ) {
    if (!routeActiveRef.current || !isMountedRef.current) return null;
    try {
      setBusyAction(key);
      const reachable = await isServerReachable();
      if (!routeActiveRef.current || !isMountedRef.current) return null;
      if (!reachable) {
        setError(serverReconnectMessage);
        return null;
      }
      const response = await call();
      const payload = await response.json().catch(() => ({}));
      if (!routeActiveRef.current || !isMountedRef.current) return null;
      if (!response.ok) {
        throw new Error(
          payload?.error || t("tournamentsPage.errors.requestFailed", "Request failed"),
        );
      }
      if (payload?.tournament && payload?.players && payload?.standings) {
        setDetail(payload as DetailResponse);
        if ((payload as DetailResponse).tournament.id !== selectedIdRef.current) {
          selectTournament((payload as DetailResponse).tournament.id);
        }
      }
      if (options?.refreshList !== false) {
        await loadList({ silent: true });
      }
      if (options?.refreshDetail !== false && selectedIdRef.current) {
        await loadDetail(selectedIdRef.current, { silent: true });
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
      if (routeActiveRef.current && isMountedRef.current) {
        setBusyAction("");
      }
    }
  }

  async function onCreateTournament(event: FormEvent) {
    event.preventDefault();
    if (!createName.trim()) return;
    if (busyAction === "create") return;
    setCreateStartTimeError(null);

    const normalizedType = "arena";
    const scheduledStartDate = buildScheduledStartDate(
      createStartDate,
      createStartHour,
      createStartMinute,
    );
    const scheduledStartIso = buildScheduledStartIso(
      createStartDate,
      createStartHour,
      createStartMinute,
    );

    if (scheduledStartDate) {
      const minimumStart = new Date(Date.now() + 5 * 60 * 1000);
      if (scheduledStartDate.getTime() < minimumStart.getTime()) {
        setCreateStartTimeError(
          t(
            "tournamentsPage.errors.startTimeTooSoon",
            "Start time must be at least 5 minutes from now.",
          ),
        );
        return;
      }
    }

    const roundsPlanned = null;
    const durationMinutes =
      normalizedType === "arena"
        ? Math.max(1, parseOptionalNonNegativeNumber(createDurationMinutes) || 30)
        : null;
    const fallbackSelectedId = selectedIdRef.current;
    const optimisticId = `pending-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    setPendingCreateId(optimisticId);

    try {
      setBusyAction("create");

      const response = await fetchWithTimeout(`${API_URL}/api/tournaments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          type: normalizedType,
          roundsPlanned: null,
          timeControl: createTimeControl,
          minPlayers: 2,
          maxPlayers: Number(maxPlayers) > 1 ? Number(maxPlayers) : null,
          ratingFilterMode: "none",
          ratingMin: null,
          ratingMax: null,
          registrationDeadline: null,
          startType: scheduledStartIso ? "scheduled" : "manual",
          scheduledStartAt: scheduledStartIso,
          rated: effectiveCreateRated,
          gameType: createGameType,
          setup: createSetup,
          pairingLogic: createPairingLogic,
          durationMinutes,
          timezone: createTimezone,
          description: description.trim(),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as Partial<DetailResponse> & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          payload?.error || t("tournamentsPage.errors.requestFailed", "Request failed"),
        );
      }

      const createdId = String(payload?.tournament?.id || "").trim();
      if (!createdId) {
        throw new Error(t("tournamentsPage.errors.requestFailed", "Request failed"));
      }

      setPendingCreateId(null);
      setSearch("");
      setFormatFilter("all");
      setStatusFilter("all");
      if (payload.tournament) {
        setList((previous) => [
          payload.tournament as TournamentSummary,
          ...previous.filter((item) => item.id !== createdId),
        ]);
        setDetail(payload as DetailResponse);
      }
      switchToCurrentTabWithSelection(createdId);
      resetCreateForm();
      setError(null);
      void loadDetail(createdId, { silent: true });
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

      setPendingCreateId(null);
      setCreateView("form");
      setPageTab("create");
      updateTournamentSearchParams((nextParams) => {
        nextParams.set("tab", "create");
        nextParams.delete("date");
        if (fallbackSelectedId) {
          nextParams.set("selected", fallbackSelectedId);
        } else {
          nextParams.delete("selected");
        }
      });
      setSelectedId((previous) =>
        previous === fallbackSelectedId ? previous : fallbackSelectedId,
      );
    } finally {
      if (routeActiveRef.current && isMountedRef.current) {
        setBusyAction("");
      }
    }
  }

  async function doRegister(tournamentId = selectedId) {
    const targetId = String(tournamentId || "").trim();
    if (!targetId) return;
    selectTournament(targetId);
    navigate(`/play/quick?tournamentId=${encodeURIComponent(targetId)}`, {
      state: { tournamentId: targetId },
    });
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
      state: { tournamentGameId: trimmed },
    });
  }

  async function openTournamentResult(tournamentId: string) {
    const targetId = String(tournamentId || "").trim();
    if (!targetId) return;
    selectTournament(targetId);
    try {
      setBusyAction(`result:${targetId}`);
      const response = await fetchWithTimeout(`${API_URL}/api/tournaments/${targetId}`, {
        credentials: "include",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload?.error || t("tournamentsPage.errors.fetchTournament", "Failed to fetch tournament"),
        );
      }
      setResultModalDetail(payload as DetailResponse);
      setDetail(payload as DetailResponse);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("tournamentsPage.errors.fetchTournament", "Failed to fetch tournament"),
      );
    } finally {
      setBusyAction("");
    }
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
    <div className="w-full min-w-0 min-h-screen bg-theme-primary">
      <section className="theme-glass-panel-soft overflow-hidden">
        <TournamentTabs activeTab={pageTab} onTabChange={handlePageTabChange} />
      </section>

      {error && (
        <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <section className={tournamentListSurfaceClass}>
        {pageTab === "create" ? (
          <div className="px-4 py-6 md:px-6">
            {false ? (
              <div className="mx-auto max-w-4xl">
                <p className="text-center text-xl font-semibold text-gray-900 dark:text-gray-100">
                  {t(
                    "tournamentsPage.createChoice.title",
                    "Please select the kind of event you'd like to create:",
                  )}
                </p>
                <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
                  {t("tournamentsPage.createChoice.shareable", "Tournaments")}
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
                          "New Arena Tournament",
                        )
                      : t(
                          "tournamentsPage.create.swissTitle",
                          "New Swiss Tournament",
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
                      aria-checked={effectiveCreateRated}
                      disabled={isCreateChess960}
                      onClick={() => {
                        if (isCreateChess960) return;
                        setCreateRated((value) => !value);
                      }}
                      className={classNames(
                        "relative inline-flex h-7 w-12 items-center rounded-full border border-theme-glass transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                        effectiveCreateRated
                          ? "bg-brand-500"
                          : "bg-gray-300/70 dark:bg-gray-800/80",
                      )}
                    >
                      <span
                        className={classNames(
                          "inline-block h-5 w-5 transform rounded-full bg-white transition-transform",
                          effectiveCreateRated ? "translate-x-6" : "translate-x-1",
                        )}
                      />
                    </button>
                  </div>
                  {isCreateChess960 && (
                    <p className="md:col-span-2 text-xs text-gray-500 dark:text-gray-400">
                      {t(
                        "tournamentsPage.create.chess960UnratedNotice",
                        "Chess960 tournaments are always unrated.",
                      )}
                    </p>
                  )}

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
                        <option value="point-based">
                          {t("tournamentsPage.create.pairing.pointBased", "Point-based")}
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
                            {duration} <Trans>min</Trans> </option>
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
                      onChange={(event) => {
                        setCreateStartDate(event.target.value);
                        setCreateStartTimeError(null);
                      }}
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
                      {createTimezone}
                    </p>
                    <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <label className={formLabelClass}>
                          {t("tournamentsPage.create.fields.hour", "Hour")}
                        </label>
                        <select
                          value={createStartHour}
                          onChange={(event) => {
                            setCreateStartHour(event.target.value);
                            setCreateStartTimeError(null);
                          }}
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
                          onChange={(event) => {
                            setCreateStartMinute(event.target.value);
                            setCreateStartTimeError(null);
                          }}
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
                    {createStartTimeError && (
                      <p className="mt-2 text-sm font-medium text-red-600 dark:text-red-300">
                        {createStartTimeError}
                      </p>
                    )}
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
            onOpenGame={openGame}
          />
        ) : (
          <>
            {pendingCreateId && (
              <div className="mx-4 mt-4 inline-flex items-center gap-2 rounded-lg border border-brand-400/25 bg-brand-500/10 px-3 py-2 text-sm font-medium text-brand-700 dark:text-brand-300">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {t(
                  "tournamentsPage.create.pendingMessage",
                  "Creating tournament. You will be redirected to the real tournament ID once it is ready.",
                )}
              </div>
            )}
            <div className="py-1">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <label className="relative sm:w-[300px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                  <input
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setListPage(1);
                    }}
                    placeholder={t("tournamentsPage.filters.searchPlaceholder", "Search by name")}
                    className={classNames(filterControlClass, "w-full pl-9")}
                  />
                </label>
                <select
                  value={formatFilter}
                  onChange={(event) => {
                    setFormatFilter(event.target.value as CurrentFormatFilter);
                    setListPage(1);
                  }}
                  className={classNames(filterControlClass, "sm:w-[106px]")}
                >
                  <option value="all">
                    {t("tournamentsPage.filters.allFormats", "All Formats")}
                  </option>
                  <option value="arena">{t("tournamentCommon.formats.arena", "Arena")}</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value as StatusFilter);
                    setListPage(1);
                  }}
                  className={classNames(filterControlClass, "sm:w-[140px]")}
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
              onOpenGame={openGame}
              onOpenResult={(id) => void openTournamentResult(id)}
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

      {resultModalDetail && (
        <ArenaResultsModal
          detail={resultModalDetail}
          currentUserId={currentUserId}
          onClose={() => setResultModalDetail(null)}
        />
      )}
    </div>
  );
}

