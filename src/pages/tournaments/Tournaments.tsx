import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const SOCKET_URL = (
  import.meta.env.VITE_SOCKET_URL ||
  import.meta.env.VITE_API_URL ||
  "http://localhost:3001"
).replace(/\/api\/?$/, "");

type TournamentType = "swiss" | "roundRobin" | "knockout";
type TournamentStatus =
  | "DRAFT"
  | "REGISTRATION_OPEN"
  | "PAIRING_PREVIEW"
  | "LIVE_ROUND"
  | "ROUND_CLOSED"
  | "FINISHED";

type TabKey = "standings" | "rounds" | "bracket";
type SortMode = "newest" | "most_players" | "my_tournaments";
type StatusFilter = "all" | "DRAFT" | "REGISTRATION_OPEN" | "LIVE_ROUND" | "FINISHED";
type RatingFilterMode = "none" | "min" | "max" | "range";

interface TimeControl {
  baseMs: number;
  incMs: number;
  label?: string;
}

interface TournamentSummary {
  id: string;
  name: string;
  type: TournamentType;
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
  previewPairings: Array<{
    id: string;
    gameId: string;
    board: number;
    whiteId: string;
    blackId: string;
    white: string;
    black: string;
    isBye: boolean;
    explanation: {
      scoreGroup?: string;
      colorAssignment?: string;
      byeReason?: string;
      rematchesAvoided?: string[];
    };
  }>;
  winners: WinnerRow[];
}

interface ConfirmDialogState {
  message: string;
  confirmLabel?: string;
  tone?: "warning" | "danger";
  onConfirm: () => Promise<void> | void;
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

const STANDINGS_PAGE_SIZE = 50;

const STATUS_BADGE: Record<
  TournamentStatus,
  { label: string; className: string; pulse?: boolean }
> = {
  DRAFT: {
    label: "DRAFT",
    className: "bg-gray-500/20 text-gray-300 border-gray-500/40",
  },
  REGISTRATION_OPEN: {
    label: "OPEN",
    className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  },
  PAIRING_PREVIEW: {
    label: "PREVIEW",
    className: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
  },
  LIVE_ROUND: {
    label: "LIVE",
    className: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    pulse: true,
  },
  ROUND_CLOSED: {
    label: "ROUND CLOSED",
    className: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40",
  },
  FINISHED: {
    label: "FINISHED",
    className: "bg-zinc-500/20 text-zinc-300 border-zinc-500/40",
  },
};

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function statusForFilter(status: StatusFilter) {
  if (status === "all") return "";
  return status;
}

function formatType(type: TournamentType) {
  if (type === "roundRobin") return "Round-Robin";
  if (type === "knockout") return "Knockout";
  return "Swiss";
}

function buildTimeLabel(timeControl?: TimeControl) {
  if (!timeControl) return "3+2";
  if (timeControl.label) return timeControl.label;
  return `${Math.max(1, Math.round(Number(timeControl.baseMs || 300000) / 60000))}+${Math.max(
    0,
    Math.round(Number(timeControl.incMs || 0) / 1000),
  )}`;
}

function toLocalDateTimeValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseOptionalNonNegativeNumber(value: string): number | null {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}

export default function Tournaments() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  const [search, setSearch] = useState("");
  const [formatFilter, setFormatFilter] = useState<"all" | TournamentType>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortMode>("newest");

  const [list, setList] = useState<TournamentSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [tab, setTab] = useState<TabKey>("standings");
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string>("");
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [standingsPage, setStandingsPage] = useState(1);

  const [showCreateModal, setShowCreateModal] = useState(false);

  const [createName, setCreateName] = useState("");
  const [createType, setCreateType] = useState<TournamentType>("swiss");
  const [createRounds, setCreateRounds] = useState<string>("7");
  const [timePreset, setTimePreset] = useState<string>("blitz_3_2");
  const [customBaseMinutes, setCustomBaseMinutes] = useState<string>("10");
  const [customIncrementSeconds, setCustomIncrementSeconds] = useState<string>("0");
  const [minPlayers, setMinPlayers] = useState<string>("4");
  const [maxPlayers, setMaxPlayers] = useState<string>("");
  const [ratingFilterMode, setRatingFilterMode] = useState<RatingFilterMode>("none");
  const [ratingMin, setRatingMin] = useState<string>("");
  const [ratingMax, setRatingMax] = useState<string>("");
  const [registrationDeadline, setRegistrationDeadline] = useState<string>("");
  const [startType, setStartType] = useState<"manual" | "scheduled">("manual");
  const [scheduledStartAt, setScheduledStartAt] = useState<string>("");
  const [description, setDescription] = useState("");

  const currentUserId = String(user?.id || "");
  const autoJoinGameIdRef = useRef<string>("");

  const selectedTournament = useMemo(
    () => list.find((item) => item.id === selectedId) || null,
    [list, selectedId],
  );

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
        setError("Unable to reach server. Reconnecting...");
        return;
      }
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (formatFilter !== "all") params.set("format", formatFilter);
      if (statusForFilter(statusFilter)) params.set("status", statusForFilter(statusFilter));
      params.set("sort", sort);
      params.set("limit", "100");
      const response = await fetch(`${API_URL}/api/tournaments?${params.toString()}`, {
        credentials: "include",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Failed to fetch tournaments");
      const tournaments: TournamentSummary[] = payload.tournaments || [];
      setList(tournaments);
      if (!selectedId && tournaments.length > 0) {
        setSelectedId(tournaments[0].id);
      } else if (
        selectedId &&
        !tournaments.some((tournament) => tournament.id === selectedId)
      ) {
        setSelectedId(tournaments[0]?.id || "");
      }
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch tournaments";
      if (/failed to fetch|networkerror|fetch/i.test(message)) {
        setError("Unable to reach server. Reconnecting...");
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
        setError("Unable to reach server. Reconnecting...");
        return;
      }
      const response = await fetch(`${API_URL}/api/tournaments/${tournamentId}`, {
        credentials: "include",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Failed to fetch tournament");
      setDetail(payload as DetailResponse);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch tournament";
      if (/failed to fetch|networkerror|fetch/i.test(message)) {
        setError("Unable to reach server. Reconnecting...");
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
  }, [search, formatFilter, statusFilter, sort]);

  useEffect(() => {
    const listTimer = window.setInterval(() => {
      void loadList({ silent: true });
    }, 20000);
    return () => window.clearInterval(listTimer);
  }, [search, formatFilter, statusFilter, sort]);

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
          if (!response.ok) throw new Error("Server unavailable");
          if (!disposed && !socket.connected) {
            socket.connect();
          }
        } catch {
          setError("Unable to reach server. Reconnecting...");
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
      setError("Realtime connection failed. Reconnecting...");
      scheduleConnectProbe();
    };
    const handleReconnectAttempt = () => {
      setError("Realtime disconnected. Reconnecting...");
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
    const preset = TIME_PRESETS.find((item) => item.key === timePreset);
    if (!preset || preset.key === "custom") {
      const minutes = Math.max(1, Number(customBaseMinutes) || 10);
      const increment = Math.max(0, Number(customIncrementSeconds) || 0);
      return {
        baseMs: Math.round(minutes * 60000),
        incMs: Math.round(increment * 1000),
        label: `${minutes}+${increment}`,
      };
    }
    return {
      baseMs: preset.baseMinutes * 60000,
      incMs: preset.incrementSeconds * 1000,
      label: `${preset.baseMinutes}+${preset.incrementSeconds}`,
    };
  }, [customBaseMinutes, customIncrementSeconds, timePreset]);

  async function runAction(
    key: string,
    call: () => Promise<Response>,
    options?: { refreshList?: boolean; refreshDetail?: boolean },
  ) {
    try {
      setBusyAction(key);
      const reachable = await isServerReachable();
      if (!reachable) {
        setError("Unable to reach server. Reconnecting...");
        return null;
      }
      const response = await call();
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Request failed");
      if (payload?.tournament && payload?.players && payload?.standings) {
        setDetail(payload as DetailResponse);
        if ((payload as DetailResponse).tournament.id !== selectedId) {
          setSelectedId((payload as DetailResponse).tournament.id);
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
      const message = err instanceof Error ? err.message : "Request failed";
      if (/failed to fetch|networkerror|fetch|connection refused/i.test(message)) {
        setError("Unable to reach server. Reconnecting...");
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

    const ratingMinValue =
      ratingFilterMode === "min" || ratingFilterMode === "range"
        ? parseOptionalNonNegativeNumber(ratingMin)
        : null;
    const ratingMaxValue =
      ratingFilterMode === "max" || ratingFilterMode === "range"
        ? parseOptionalNonNegativeNumber(ratingMax)
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
            type: createType,
            roundsPlanned:
              createType === "swiss" && Number(createRounds) > 0
                ? Number(createRounds)
                : null,
            timeControl: createTimeControl,
            minPlayers: Math.max(2, Number(minPlayers) || 4),
            maxPlayers: Number(maxPlayers) > 1 ? Number(maxPlayers) : null,
            ratingFilterMode,
            ratingMin: ratingMinValue,
            ratingMax: ratingMaxValue,
            registrationDeadline: registrationDeadline || null,
            startType,
            scheduledStartAt:
              startType === "scheduled" && scheduledStartAt
                ? new Date(scheduledStartAt).toISOString()
                : null,
            description: description.trim(),
          }),
        }),
      { refreshDetail: false },
    );

    if (!payload) return;
    const createdId = (payload as DetailResponse)?.tournament?.id;
    if (createdId) {
      setSelectedId(createdId);
      await loadDetail(createdId);
    }
    setShowCreateModal(false);
    setCreateName("");
  }

  async function doRegister() {
    if (!selectedId) return;
    await runAction("register", () =>
      fetch(`${API_URL}/api/tournaments/${selectedId}/register`, {
        method: "POST",
        credentials: "include",
      }),
    );
  }

  async function doUnregister() {
    if (!selectedId) return;
    await runAction("unregister", () =>
      fetch(`${API_URL}/api/tournaments/${selectedId}/register`, {
        method: "DELETE",
        credentials: "include",
      }),
    );
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
        confirmLabel: action === "finish_tournament" ? "End Tournament" : "Confirm",
        tone: action === "finish_tournament" ? "danger" : "warning",
        onConfirm: execute,
      });
      return;
    }
    await execute();
  }

  async function startRound() {
    if (!selectedId) return;
    await runAction("start_round", () =>
      fetch(`${API_URL}/api/tournaments/${selectedId}/state`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start_round" }),
      }),
    );
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
      message: "Delete this draft tournament permanently?",
      confirmLabel: "Delete",
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
        setSelectedId("");
      },
    });
  }

  function renderStatusBadge(status: TournamentStatus) {
    const cfg = STATUS_BADGE[status];
    return (
      <span
        className={classNames(
          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
          cfg.className,
        )}
      >
        {cfg.pulse && <span className="h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse" />}
        {cfg.label}
      </span>
    );
  }

  return (
    <div className="w-full space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Tournaments</h1>
          <p className="mt-1 text-sm text-gray-400">
            Create and join Swiss, Round-Robin, and Knockout events
          </p>
        </div>
        <button
          onClick={() => {
            setShowCreateModal(true);
          }}
          className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-400"
        >
          Create Tournament
        </button>
      </header>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-gray-800 bg-[#0f141c] px-4 py-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4 xl:grid-cols-6">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name"
            className="rounded-lg border border-gray-700 bg-[#0d1117] px-3 py-2 text-sm text-gray-100 outline-none focus:border-emerald-500"
          />
          <select
            value={formatFilter}
            onChange={(event) => setFormatFilter(event.target.value as "all" | TournamentType)}
            className="rounded-lg border border-gray-700 bg-[#0d1117] px-3 py-2 text-sm text-gray-100"
          >
            <option value="all">All Formats</option>
            <option value="swiss">Swiss</option>
            <option value="roundRobin">Round-Robin</option>
            <option value="knockout">Knockout</option>
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            className="rounded-lg border border-gray-700 bg-[#0d1117] px-3 py-2 text-sm text-gray-100"
          >
            <option value="all">All Statuses</option>
            <option value="REGISTRATION_OPEN">Registration Open</option>
            <option value="LIVE_ROUND">Live</option>
            <option value="FINISHED">Finished</option>
            <option value="DRAFT">Draft</option>
          </select>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortMode)}
            className="rounded-lg border border-gray-700 bg-[#0d1117] px-3 py-2 text-sm text-gray-100"
          >
            <option value="newest">Newest</option>
            <option value="most_players">Most Players</option>
            <option value="my_tournaments">My Tournaments</option>
          </select>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-gray-800 bg-[#0f141c]">
          <div className="p-3">
            {loadingList ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-20 animate-pulse rounded-xl border border-gray-800 bg-[#121922]"
                  />
                ))}
              </div>
            ) : list.length === 0 ? (
              <div className="rounded-xl border border-gray-800 bg-[#0d1117] px-4 py-6 text-center text-sm text-gray-400">
                No tournaments yet. Create one to get started.
              </div>
            ) : (
              <div className="space-y-2">
                {list.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={classNames(
                      "w-full rounded-xl border px-3 py-3 text-left transition",
                      selectedId === item.id
                        ? "border-emerald-500/50 bg-emerald-500/10"
                        : "border-gray-800 bg-[#0d1117] hover:border-gray-700",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-gray-100">
                          {item.name}
                        </div>
                        <div className="mt-1 text-xs text-gray-400">
                          {formatType(item.type)} · {buildTimeLabel(item.timeControl)}
                        </div>
                      </div>
                      {renderStatusBadge(item.status)}
                    </div>
                    <div className="mt-2 text-xs text-gray-400">
                      {item.registeredCount} players
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        <main className="rounded-2xl border border-gray-800 bg-[#0f141c]">
          {!selectedId ? (
            <div className="px-6 py-16 text-center text-sm text-gray-400">
              Select a tournament to view details.
            </div>
          ) : loadingDetail || !detail ? (
            <div className="space-y-4 p-4">
              <div className="h-24 animate-pulse rounded-xl bg-[#121922]" />
              <div className="h-10 animate-pulse rounded-xl bg-[#121922]" />
              <div className="h-[360px] animate-pulse rounded-xl bg-[#121922]" />
            </div>
          ) : (
            <div className="flex flex-col">
              <section className="border-b border-gray-800 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h2 className="text-xl font-bold text-gray-100">{detail.tournament.name}</h2>
                    <div className="text-sm text-gray-400">
                      {formatType(detail.tournament.type)} · {buildTimeLabel(detail.tournament.timeControl)} ·{" "}
                      {detail.tournament.ratingRequirement}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                      {renderStatusBadge(detail.tournament.status)}
                      <span>
                        Round {Math.max(0, detail.tournament.currentRound)} of{" "}
                        {Math.max(1, detail.tournament.roundsPlanned)}
                      </span>
                      <span>{detail.tournament.registeredCount} players</span>
                      <span>Organizer: {detail.tournament.organizer?.username || "User"}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {detail.tournament.status === "LIVE_ROUND" && myPendingGame?.gameId && (
                      <button
                        onClick={() => openGame(myPendingGame.gameId)}
                        className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold text-indigo-50"
                      >
                        Go to My Board
                      </button>
                    )}
                    {!detail.tournament.isRegistered &&
                      detail.tournament.status === "REGISTRATION_OPEN" && (
                        <button
                          onClick={doRegister}
                          disabled={!!busyAction}
                          className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-emerald-950 disabled:opacity-60"
                        >
                          Register
                        </button>
                      )}
                    {detail.tournament.isRegistered &&
                      (detail.tournament.status === "REGISTRATION_OPEN" ||
                        detail.tournament.status === "DRAFT") && (
                        <button
                          onClick={doUnregister}
                          disabled={!!busyAction}
                          className="rounded-lg border border-gray-700 px-3 py-2 text-sm font-semibold text-gray-200 disabled:opacity-60"
                        >
                          Unregister
                        </button>
                      )}
                  </div>
                </div>

                {(canManage || tournamentStatus === "FINISHED") && (
                <div className="mt-4 rounded-xl border border-gray-800 bg-[#0d1117]">
                  <div className="space-y-3 px-3 py-3 text-sm">
                        {canManage && tournamentStatus === "DRAFT" && (
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => organizerStateAction("open_registration")}
                              disabled={!!busyAction}
                              className="rounded-lg bg-emerald-500 px-3 py-2 font-semibold text-emerald-950 disabled:opacity-60"
                            >
                              Open Registration
                            </button>
                            <button
                              onClick={deleteTournament}
                              disabled={!!busyAction}
                              className="rounded-lg bg-red-500/90 px-3 py-2 font-semibold text-red-50 disabled:opacity-60"
                            >
                              Delete Tournament
                            </button>
                          </div>
                        )}

                        {canManage && tournamentStatus === "REGISTRATION_OPEN" && (
                          <div className="space-y-3">
                            <div className="text-xs text-gray-400">
                              Registered players: {detail.players.filter((player) => player.status !== "withdrawn").length}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => organizerStateAction("close_registration")}
                                disabled={!!busyAction}
                                className="rounded-lg bg-cyan-500 px-3 py-2 font-semibold text-cyan-950 disabled:opacity-60"
                              >
                                Close Registration
                              </button>
                            </div>
                          </div>
                        )}

                        {canManage && tournamentStatus === "PAIRING_PREVIEW" && (
                          <div className="space-y-3">
                            <div className="overflow-x-auto rounded-lg border border-gray-800">
                              <table className="w-full text-left text-xs text-gray-300">
                                <thead className="bg-[#121922] text-gray-400">
                                  <tr>
                                    <th className="px-3 py-2">Board</th>
                                    <th className="px-3 py-2">White</th>
                                    <th className="px-3 py-2">Black</th>
                                    <th className="px-3 py-2">Explain Pairing</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {detail.previewPairings.map((pairing) => (
                                    <tr key={pairing.id} className="border-t border-gray-800">
                                      <td className="px-3 py-2">{pairing.board}</td>
                                      <td className="px-3 py-2">{pairing.white}</td>
                                      <td className="px-3 py-2">{pairing.black}</td>
                                      <td className="px-3 py-2 text-[11px] text-gray-400">
                                        <div>
                                          Score group: {pairing.explanation.scoreGroup || "n/a"}
                                        </div>
                                        <div>{pairing.explanation.colorAssignment || ""}</div>
                                        {pairing.explanation.byeReason && (
                                          <div>Bye: {pairing.explanation.byeReason}</div>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={startRound}
                                disabled={!!busyAction}
                                className="rounded-lg bg-amber-400 px-3 py-2 font-semibold text-amber-950 disabled:opacity-60"
                              >
                                Start Round
                              </button>
                              <button
                                onClick={() =>
                                  organizerStateAction(
                                    "finish_tournament",
                                    "End this tournament now?",
                                  )
                                }
                                disabled={!!busyAction}
                                className="rounded-lg bg-amber-500/90 px-3 py-2 font-semibold text-amber-950 disabled:opacity-60"
                              >
                                End Tournament
                              </button>
                            </div>
                          </div>
                        )}

                        {canManage && tournamentStatus === "LIVE_ROUND" && (
                          <div className="space-y-3">
                            <div className="text-xs text-gray-400">
                              Results are recorded automatically from finished board games. Round
                              progression to the next round is fully automatic.
                            </div>
                            <div className="overflow-x-auto rounded-lg border border-gray-800">
                              <table className="w-full text-left text-xs text-gray-300">
                                <thead className="bg-[#121922] text-gray-400">
                                  <tr>
                                    <th className="px-3 py-2">Board</th>
                                    <th className="px-3 py-2">White</th>
                                    <th className="px-3 py-2">Black</th>
                                    <th className="px-3 py-2">Result</th>
                                    <th className="px-3 py-2">ELO</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {currentRoundGames.map((game) => (
                                    <tr key={game.id} className="border-t border-gray-800">
                                      <td className="px-3 py-2">{game.board}</td>
                                      <td className="px-3 py-2">{game.white}</td>
                                      <td className="px-3 py-2">{game.black}</td>
                                      <td className="px-3 py-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span
                                            className={classNames(
                                              "rounded border px-2 py-0.5 text-xs",
                                              game.result === "*"
                                                ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                                                : "border-gray-700 text-gray-100",
                                            )}
                                          >
                                            {game.result === "*" ? "In Progress" : game.result}
                                          </span>
                                          {game.result === "*" &&
                                            (game.whiteId === currentUserId ||
                                              game.blackId === currentUserId) && (
                                              <button
                                                onClick={() => openGame(game.gameId)}
                                                className="rounded border border-indigo-500/60 px-2 py-1 font-semibold text-indigo-300"
                                              >
                                                Play Board
                                              </button>
                                            )}
                                        </div>
                                      </td>
                                      <td className="px-3 py-2">
                                        {game.result !== "*" ? (
                                          <span className="text-[11px] text-gray-400">
                                            White {game.whiteEloDelta >= 0 ? "+" : ""}
                                            {game.whiteEloDelta} | Black {game.blackEloDelta >= 0 ? "+" : ""}
                                            {game.blackEloDelta}
                                          </span>
                                        ) : (
                                          <span className="text-[11px] text-gray-500">Pending</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                onClick={() =>
                                  organizerStateAction(
                                    "finish_tournament",
                                    "End this tournament now?",
                                  )
                                }
                                disabled={!!busyAction}
                                className="rounded-lg bg-amber-500 px-3 py-2 font-semibold text-amber-950 disabled:opacity-60"
                              >
                                End Tournament
                              </button>
                              <p className="text-[11px] text-gray-500">
                                Round progression is automatic after all board games complete.
                              </p>
                            </div>
                          </div>
                        )}

                        {canManage && tournamentStatus === "ROUND_CLOSED" && (
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() =>
                                organizerStateAction(
                                  "finish_tournament",
                                  "End this tournament now?",
                                )
                              }
                              disabled={!!busyAction}
                              className="rounded-lg bg-amber-500 px-3 py-2 font-semibold text-amber-950 disabled:opacity-60"
                            >
                              End Tournament
                            </button>
                            <p className="text-[11px] text-gray-500">
                              Next round generation is automatic when a live round completes.
                            </p>
                          </div>
                        )}

                        {tournamentStatus === "FINISHED" && (
                          <div className="rounded-lg border border-gray-800 bg-[#121922] p-3">
                            <div className="text-xs uppercase tracking-wide text-gray-400">
                              Final Standings
                            </div>
                            <div className="mt-2 space-y-1 text-sm">
                              <div className="flex items-center gap-2 text-amber-300">
                                <span>{"\uD83E\uDD47"}</span>
                                <span className="font-semibold">
                                  {detail.winners[0]?.username || "TBD"}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-gray-200">
                                <span>{"\uD83E\uDD48"}</span>
                                <span>{detail.winners[1]?.username || "TBD"}</span>
                              </div>
                              <div className="flex items-center gap-2 text-orange-300">
                                <span>{"\uD83E\uDD49"}</span>
                                <span>{detail.winners[2]?.username || "TBD"}</span>
                              </div>
                            </div>
                          </div>
                        )}
                  </div>
                </div>
                )}
              </section>

              <nav className="flex items-center gap-2 border-b border-gray-800 px-4 py-2">
                {(["standings", "rounds", "bracket"] as TabKey[])
                  .filter((item) => !(detail.tournament.type === "swiss" && item === "bracket"))
                  .map((item) => (
                    <button
                      key={item}
                      onClick={() => setTab(item)}
                      className={classNames(
                        "rounded-lg px-3 py-1.5 text-sm font-semibold",
                        tab === item
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "text-gray-400 hover:bg-gray-800/60 hover:text-gray-200",
                      )}
                    >
                      {item === "rounds"
                        ? "Rounds"
                        : item === "standings"
                          ? "Standings"
                          : detail.tournament.type === "roundRobin"
                            ? "Cross-table"
                            : "Bracket"}
                    </button>
                  ))}
              </nav>

              <section className="p-4">

                {tab === "rounds" && (
                  <div className="space-y-3">
                    {detail.rounds.length === 0 && (
                      <div className="rounded-xl border border-gray-800 bg-[#0d1117] px-4 py-6 text-center text-sm text-gray-400">
                        No rounds yet.
                      </div>
                    )}
                    {detail.rounds.map((round) => {
                      const isCurrent =
                        round.roundNumber === Number(detail.tournament.currentRound || 0);
                      return (
                        <details
                          key={round.roundNumber}
                          open={isCurrent}
                          className="rounded-xl border border-gray-800 bg-[#0d1117]"
                        >
                          <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-gray-100">
                            Round {round.roundNumber}
                          </summary>
                          <div className="border-t border-gray-800">
                            {round.games.map((game) => (
                              <div
                                key={game.id}
                                className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-800 px-3 py-2 text-sm text-gray-200 first:border-t-0"
                              >
                                <div className="min-w-[220px]">
                                  <span className="font-semibold">#{game.board}</span>{" "}
                                  {game.white} ({game.whiteRatingAtPairing}) vs {game.black} (
                                  {game.blackRatingAtPairing ?? "-"})
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="rounded border border-gray-700 px-2 py-0.5 text-xs text-gray-300">
                                    {game.result === "*" ? "In Progress" : game.result}
                                  </span>
                                  {game.result === "*" &&
                                    (game.whiteId === currentUserId ||
                                      game.blackId === currentUserId) && (
                                      <button
                                        onClick={() => openGame(game.gameId)}
                                        className="rounded border border-indigo-500/60 px-2 py-0.5 text-xs font-semibold text-indigo-300"
                                      >
                                        Play
                                      </button>
                                    )}
                                  {game.result !== "*" && (
                                    <span className="text-xs text-gray-400">
                                      W {game.whiteEloDelta >= 0 ? "+" : ""}
                                      {game.whiteEloDelta} / B {game.blackEloDelta >= 0 ? "+" : ""}
                                      {game.blackEloDelta}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                )}

                {tab === "standings" && (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-gray-200">Standings</div>
                    <div className="overflow-x-auto rounded-xl border border-gray-800">
                      <table className="w-full text-left text-sm text-gray-200">
                        <thead className="bg-[#121922] text-xs uppercase tracking-wide text-gray-400">
                          <tr>
                            <th className="px-3 py-2">Rank</th>
                            <th className="px-3 py-2">Player</th>
                            <th className="px-3 py-2">ELO</th>
                            <th className="px-3 py-2">Points</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedStandings.map((row) => (
                            <tr key={row.userId} className="border-t border-gray-800">
                              <td className="px-3 py-2">{row.rank}</td>
                              <td className="px-3 py-2">{row.username}</td>
                              <td className="px-3 py-2">{row.elo}</td>
                              <td className="px-3 py-2">{row.points}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400">
                      <span>
                        Showing{" "}
                        {standingsRows.length === 0 ? 0 : standingsStartIndex + 1}-
                        {Math.min(standingsEndIndex, standingsRows.length)} of {standingsRows.length}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setStandingsPage((prev) => Math.max(1, prev - 1))}
                          disabled={currentStandingsPage <= 1}
                          className="rounded border border-gray-700 px-2 py-1 disabled:opacity-50"
                        >
                          Previous
                        </button>
                        <span>
                          Page {currentStandingsPage} / {standingsPageCount}
                        </span>
                        <button
                          onClick={() =>
                            setStandingsPage((prev) => Math.min(standingsPageCount, prev + 1))
                          }
                          disabled={currentStandingsPage >= standingsPageCount}
                          className="rounded border border-gray-700 px-2 py-1 disabled:opacity-50"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {tab === "bracket" && detail.tournament.type === "knockout" && (
                  <div className="overflow-x-auto">
                    <div className="flex min-w-max gap-3">
                      {detail.rounds.map((round) => (
                        <div
                          key={round.roundNumber}
                          className="w-64 rounded-xl border border-gray-800 bg-[#0d1117] p-3"
                        >
                          <div className="mb-2 text-sm font-semibold text-gray-200">
                            Round {round.roundNumber}
                          </div>
                          <div className="space-y-2">
                            {round.games.map((game) => (
                              <div
                                key={game.id}
                                className="rounded-lg border border-gray-800 bg-[#121922] px-2 py-2 text-xs"
                              >
                                <div className="truncate text-gray-200">{game.white}</div>
                                <div className="truncate text-gray-400">{game.black}</div>
                                <div className="mt-1 text-emerald-300">
                                  {game.result === "*" ? "Pending" : game.result}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {tab === "bracket" && detail.tournament.type === "roundRobin" && (
                  <div className="rounded-xl border border-gray-800 bg-[#0d1117] px-4 py-6 text-center text-sm text-gray-400">
                    Cross-table view is available through the standings metrics (Direct Encounter and
                    Sonneborn-Berger) for Round-Robin tournaments.
                  </div>
                )}
              </section>
            </div>
          )}
        </main>
      </section>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-gray-700 bg-[#0f141c] p-5">
            <div className="mb-4 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold text-gray-100">Create Tournament</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg border border-gray-700 px-2 py-1 text-sm text-gray-300"
              >
                Close
              </button>
            </div>

            <form onSubmit={onCreateTournament} className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-400">Tournament Name</label>
                  <input
                    required
                    value={createName}
                    onChange={(event) => setCreateName(event.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-[#0d1117] px-3 py-2 text-sm text-gray-100"
                    placeholder="Club Championship"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-400">Format</label>
                  <select
                    value={createType}
                    onChange={(event) => setCreateType(event.target.value as TournamentType)}
                    className="w-full rounded-lg border border-gray-700 bg-[#0d1117] px-3 py-2 text-sm text-gray-100"
                  >
                    <option value="swiss">Swiss</option>
                    <option value="roundRobin">Round-Robin</option>
                    <option value="knockout">Knockout</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-400">Number of Rounds</label>
                  <input
                    type="number"
                    min={1}
                    disabled={createType !== "swiss"}
                    value={createRounds}
                    onChange={(event) => setCreateRounds(event.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-[#0d1117] px-3 py-2 text-sm text-gray-100 disabled:opacity-50"
                    placeholder={createType === "swiss" ? "Required for Swiss" : "Auto"}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs font-semibold text-gray-400">Time Control</label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <select
                      value={timePreset}
                      onChange={(event) => setTimePreset(event.target.value)}
                      className="rounded-lg border border-gray-700 bg-[#0d1117] px-3 py-2 text-sm text-gray-100"
                    >
                      {TIME_PRESETS.map((preset) => (
                        <option key={preset.key} value={preset.key}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                    {timePreset === "custom" && (
                      <>
                        <input
                          type="number"
                          min={1}
                          value={customBaseMinutes}
                          onChange={(event) => setCustomBaseMinutes(event.target.value)}
                          className="rounded-lg border border-gray-700 bg-[#0d1117] px-3 py-2 text-sm text-gray-100"
                          placeholder="Base minutes"
                        />
                        <input
                          type="number"
                          min={0}
                          value={customIncrementSeconds}
                          onChange={(event) => setCustomIncrementSeconds(event.target.value)}
                          className="rounded-lg border border-gray-700 bg-[#0d1117] px-3 py-2 text-sm text-gray-100"
                          placeholder="Increment seconds"
                        />
                      </>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-400">Min Players</label>
                  <input
                    type="number"
                    min={2}
                    value={minPlayers}
                    onChange={(event) => setMinPlayers(event.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-[#0d1117] px-3 py-2 text-sm text-gray-100"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-400">Max Players</label>
                  <input
                    type="number"
                    min={2}
                    value={maxPlayers}
                    onChange={(event) => setMaxPlayers(event.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-[#0d1117] px-3 py-2 text-sm text-gray-100"
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs font-semibold text-gray-400">Rating Filter</label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <select
                      value={ratingFilterMode}
                      onChange={(event) => setRatingFilterMode(event.target.value as RatingFilterMode)}
                      className="rounded-lg border border-gray-700 bg-[#0d1117] px-3 py-2 text-sm text-gray-100"
                    >
                      <option value="none">None</option>
                      <option value="min">Min Only</option>
                      <option value="max">Max Only</option>
                      <option value="range">Range</option>
                    </select>
                    {(ratingFilterMode === "min" || ratingFilterMode === "range") && (
                      <input
                        type="number"
                        min={0}
                        value={ratingMin}
                        onChange={(event) => setRatingMin(event.target.value)}
                        className="rounded-lg border border-gray-700 bg-[#0d1117] px-3 py-2 text-sm text-gray-100"
                        placeholder="Min rating"
                      />
                    )}
                    {(ratingFilterMode === "max" || ratingFilterMode === "range") && (
                      <input
                        type="number"
                        min={0}
                        value={ratingMax}
                        onChange={(event) => setRatingMax(event.target.value)}
                        className="rounded-lg border border-gray-700 bg-[#0d1117] px-3 py-2 text-sm text-gray-100"
                        placeholder="Max rating"
                      />
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-400">Registration Deadline</label>
                  <input
                    type="datetime-local"
                    value={registrationDeadline}
                    onChange={(event) => setRegistrationDeadline(event.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-[#0d1117] px-3 py-2 text-sm text-gray-100"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-400">Start Type</label>
                  <select
                    value={startType}
                    onChange={(event) => setStartType(event.target.value as "manual" | "scheduled")}
                    className="w-full rounded-lg border border-gray-700 bg-[#0d1117] px-3 py-2 text-sm text-gray-100"
                  >
                    <option value="manual">Manual</option>
                    <option value="scheduled">Scheduled</option>
                  </select>
                </div>
                {startType === "scheduled" && (
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-semibold text-gray-400">Scheduled Start Time</label>
                    <input
                      type="datetime-local"
                      value={scheduledStartAt}
                      min={toLocalDateTimeValue(new Date())}
                      onChange={(event) => setScheduledStartAt(event.target.value)}
                      className="w-full rounded-lg border border-gray-700 bg-[#0d1117] px-3 py-2 text-sm text-gray-100"
                    />
                  </div>
                )}
                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs font-semibold text-gray-400">Description</label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-[#0d1117] px-3 py-2 text-sm text-gray-100"
                    placeholder="Optional tournament notes"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busyAction === "create"}
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 disabled:opacity-60"
                >
                  {busyAction === "create" ? "Creating..." : "Create Draft"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-[#0f141c] p-5 shadow-2xl">
            <h4 className="text-sm font-semibold text-gray-100">Confirm Action</h4>
            <p className="mt-2 text-sm text-gray-300">{confirmDialog.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200"
              >
                Cancel
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
                {confirmDialog.confirmLabel || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
