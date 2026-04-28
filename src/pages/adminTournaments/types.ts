export { API_URL } from "../../config/network";

export type TournamentType = "swiss" | "arena";
export type TournamentStatus =
  | "DRAFT"
  | "REGISTRATION_OPEN"
  | "LIVE_ROUND"
  | "ROUND_CLOSED"
  | "CANCELLED"
  | "FINISHED";
export type RatingFilterMode = "none" | "min" | "max" | "range";
export type TournamentSortMode =
  | "newest"
  | "oldest"
  | "most_players"
  | "live_first"
  | "name_az";

export interface AdminTournamentOrganizer {
  _id: string;
  fullName: string;
  email: string;
  avatar?: string;
}

export interface TimeControl {
  baseMs: number;
  incMs: number;
  label?: string;
}

export interface AdminTournamentSummary {
  id: string;
  name: string;
  type: TournamentType;
  format?: TournamentType;
  formatLabel: string;
  rated: boolean;
  gameType: "standard" | "chess960";
  setup: string;
  pairingLogic: string;
  durationMinutes: number | null;
  timezone: string;
  timeControl: TimeControl;
  timeControlLabel: string;
  ratingMin: number | null;
  ratingMax: number | null;
  ratingFilterMode: RatingFilterMode;
  ratingRequirement: string;
  status: TournamentStatus;
  roundsPlanned: number;
  currentRound: number;
  latestPublishedRound: number;
  minPlayers: number;
  maxPlayers: number | null;
  registeredCount: number;
  activeCount: number;
  withdrawnCount: number;
  totalGames: number;
  publishedGames: number;
  completedGames: number;
  organizer: AdminTournamentOrganizer | null;
  registrationDeadline: string | null;
  startType: "manual" | "scheduled";
  scheduledStartAt: string | null;
  description: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  championUserId?: string;
}

export interface AdminTournamentStats {
  total: number;
  draft: number;
  registrationOpen: number;
  live: number;
  roundClosed: number;
  cancelled: number;
  finished: number;
  active: number;
  totalPlayers: number;
  totalGames: number;
}

export interface AdminTournamentPagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface AdminTournamentPlayerRow {
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

export interface AdminTournamentGame {
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

export interface AdminTournamentRound {
  roundNumber: number;
  games: AdminTournamentGame[];
}

export interface AdminTournamentStandingRow {
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

export interface AdminTournamentWinnerRow {
  userId: string;
  username: string;
  avatar: string;
  placement: number;
  score: number;
  eloBefore: number;
  eloAfter: number;
  eloDelta: number;
}

export interface AdminTournamentDetailResponse {
  tournament: AdminTournamentSummary & {
    organizer?: { id: string; username: string; avatar?: string };
    totalPlayers: number;
    canManage: boolean;
    myTournament?: boolean;
    arenaReadyPoolSize?: number;
    arenaReady?: boolean;
    arenaWaitTicks?: number;
    arenaPairingIntervalSeconds?: number;
  };
  players: AdminTournamentPlayerRow[];
  rounds: AdminTournamentRound[];
  standings: AdminTournamentStandingRow[];
  standingsMeta: {
    isOfficial: boolean;
    label: string;
  };
  winners: AdminTournamentWinnerRow[];
}

export interface AdminTournamentListResponse {
  tournaments: AdminTournamentSummary[];
  stats: AdminTournamentStats;
  pagination: AdminTournamentPagination;
}

export interface TournamentFormData {
  organizerUserId: string;
  name: string;
  type: TournamentType;
  rated: boolean;
  gameType: "standard" | "chess960";
  setup: string;
  pairingLogic: string;
  durationMinutes: string;
  timezone: string;
  roundsPlanned: string;
  timePreset: string;
  customBaseMinutes: string;
  customIncrementSeconds: string;
  minPlayers: string;
  maxPlayers: string;
  ratingFilterMode: RatingFilterMode;
  ratingMin: string;
  ratingMax: string;
  registrationDeadline: string;
  startType: "manual" | "scheduled";
  scheduledStartAt: string;
  description: string;
}

export const TIME_PRESETS = [
  { key: "bullet_1_0", label: "Bullet 1+0", baseMinutes: 1, incrementSeconds: 0 },
  { key: "blitz_3_2", label: "Blitz 3+2", baseMinutes: 3, incrementSeconds: 2 },
  { key: "blitz_5_0", label: "Blitz 5+0", baseMinutes: 5, incrementSeconds: 0 },
  { key: "rapid_10_0", label: "Rapid 10+0", baseMinutes: 10, incrementSeconds: 0 },
  { key: "rapid_10_1", label: "Rapid 10+1", baseMinutes: 10, incrementSeconds: 1 },
  { key: "rapid_15_10", label: "Rapid 15+10", baseMinutes: 15, incrementSeconds: 10 },
  { key: "classical_30_0", label: "Classical 30+0", baseMinutes: 30, incrementSeconds: 0 },
  { key: "custom", label: "Custom", baseMinutes: 10, incrementSeconds: 0 },
] as const;

export const DEFAULT_TOURNAMENT_FORM: TournamentFormData = {
  organizerUserId: "",
  name: "",
  type: "swiss",
  rated: true,
  gameType: "standard",
  setup: "standard",
  pairingLogic: "rating-based",
  durationMinutes: "30",
  timezone:
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || "Local"
      : "Local",
  roundsPlanned: "7",
  timePreset: "blitz_3_2",
  customBaseMinutes: "10",
  customIncrementSeconds: "0",
  minPlayers: "2",
  maxPlayers: "",
  ratingFilterMode: "none",
  ratingMin: "",
  ratingMax: "",
  registrationDeadline: "",
  startType: "manual",
  scheduledStartAt: "",
  description: "",
};

function toLocalDateTimeValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function isoToLocalInput(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return toLocalDateTimeValue(parsed);
}

function parseOptionalNumber(value: string): number | null {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function resolveTimePresetKey(timeControl?: TimeControl) {
  const baseMinutes = Math.round(Number(timeControl?.baseMs || 0) / 60000);
  const incrementSeconds = Math.round(Number(timeControl?.incMs || 0) / 1000);
  const preset = TIME_PRESETS.find(
    (item) =>
      item.key !== "custom" &&
      item.baseMinutes === baseMinutes &&
      item.incrementSeconds === incrementSeconds,
  );
  return preset?.key || "custom";
}

export function getLocalDateTimeMinimum() {
  return toLocalDateTimeValue(new Date());
}

export function tournamentToForm(
  tournament?: Partial<AdminTournamentSummary> | null,
): TournamentFormData {
  if (!tournament) {
    return { ...DEFAULT_TOURNAMENT_FORM };
  }

  const timePreset = resolveTimePresetKey(tournament.timeControl);
  const baseMinutes = Math.max(
    1,
    Math.round(Number(tournament.timeControl?.baseMs || 600000) / 60000),
  );
  const incrementSeconds = Math.max(
    0,
    Math.round(Number(tournament.timeControl?.incMs || 0) / 1000),
  );

  return {
    organizerUserId: String(tournament.organizer?._id || ""),
    name: String(tournament.name || ""),
    type: tournament.type === "arena" ? "arena" : "swiss",
    rated: tournament.rated !== false,
    gameType: tournament.gameType === "chess960" ? "chess960" : "standard",
    setup: String(tournament.setup || "standard"),
    pairingLogic: String(
      tournament.pairingLogic ||
        (tournament.type === "arena" ? "rating-based" : "swiss_pairing"),
    ),
    durationMinutes: String(tournament.durationMinutes || 30),
    timezone: String(tournament.timezone || DEFAULT_TOURNAMENT_FORM.timezone),
    roundsPlanned: String(tournament.roundsPlanned || 1),
    timePreset,
    customBaseMinutes: String(baseMinutes),
    customIncrementSeconds: String(incrementSeconds),
    minPlayers: String(tournament.minPlayers || 2),
    maxPlayers:
      tournament.maxPlayers === null || tournament.maxPlayers === undefined
        ? ""
        : String(tournament.maxPlayers),
    ratingFilterMode:
      tournament.ratingFilterMode === "min" ||
      tournament.ratingFilterMode === "max" ||
      tournament.ratingFilterMode === "range"
        ? tournament.ratingFilterMode
        : "none",
    ratingMin:
      tournament.ratingMin === null || tournament.ratingMin === undefined
        ? ""
        : String(tournament.ratingMin),
    ratingMax:
      tournament.ratingMax === null || tournament.ratingMax === undefined
        ? ""
        : String(tournament.ratingMax),
    registrationDeadline: isoToLocalInput(tournament.registrationDeadline),
    startType: tournament.startType || "manual",
    scheduledStartAt: isoToLocalInput(tournament.scheduledStartAt),
    description: String(tournament.description || ""),
  };
}

export function buildTournamentPayload(form: TournamentFormData) {
  const preset = TIME_PRESETS.find((item) => item.key === form.timePreset);
  const baseMinutes =
    preset && preset.key !== "custom"
      ? preset.baseMinutes
      : Math.max(1, Number(form.customBaseMinutes) || 10);
  const incrementSeconds =
    preset && preset.key !== "custom"
      ? preset.incrementSeconds
      : Math.max(0, Number(form.customIncrementSeconds) || 0);

  const ratingMin = parseOptionalNumber(form.ratingMin);
  const ratingMax = parseOptionalNumber(form.ratingMax);
  const maxPlayers = parseOptionalNumber(form.maxPlayers);

  return {
    organizerUserId: form.organizerUserId.trim(),
    name: form.name.trim(),
    type: form.type,
    rated: form.rated,
    gameType: form.gameType,
    setup: form.setup.trim() || "standard",
    pairingLogic:
      form.type === "arena"
        ? form.pairingLogic.trim() || "rating-based"
        : "swiss_pairing",
    durationMinutes:
      form.type === "arena"
        ? Math.max(1, Number(form.durationMinutes) || 30)
        : null,
    timezone: form.timezone.trim() || DEFAULT_TOURNAMENT_FORM.timezone,
    roundsPlanned:
      form.type === "swiss" ? Math.max(1, Number(form.roundsPlanned) || 1) : null,
    timeControl: {
      baseMs: Math.round(baseMinutes * 60000),
      incMs: Math.round(incrementSeconds * 1000),
      label: `${baseMinutes}+${incrementSeconds}`,
    },
    minPlayers: Math.max(2, Number(form.minPlayers) || 2),
    maxPlayers:
      maxPlayers !== null && maxPlayers > 1 ? Math.floor(maxPlayers) : null,
    ratingFilterMode: form.ratingFilterMode,
    ratingMin:
      form.ratingFilterMode === "min" || form.ratingFilterMode === "range"
        ? ratingMin
        : null,
    ratingMax:
      form.ratingFilterMode === "max" || form.ratingFilterMode === "range"
        ? ratingMax
        : null,
    registrationDeadline: form.registrationDeadline || null,
    startType: form.startType,
    scheduledStartAt:
      form.startType === "scheduled" ? form.scheduledStartAt || null : null,
    description: form.description.trim(),
  };
}
