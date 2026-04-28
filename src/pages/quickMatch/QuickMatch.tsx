import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { useOnlineQuickMatch } from "../../hooks/useOnlineQuickMatch";
import { navigateToNewGameRoute } from "../../components/game/newGameRouting";
import { QuickMatchSetup } from "./QuickMatchSetup";
import {
  QuickMatchGameView,
  type TournamentGamePanelData,
} from "./QuickMatchGameView";
import type { GameHistory } from "../../historyTypes";
import { useGameplayPreferences } from "../../hooks/useGameplayPreferences";
import { resolveQuickMatchDefaultTimeControl } from "../../utils/gameplaySettings";
import { API_URL } from "../../config/network";

type MatchVariant =
  | "standard"
  | "chess960"
  | "threeCheck"
  | "kingOfHill"
  | "atomic";
const LAST_QUICK_TIME_CONTROL_KEY = "quickMatch:lastTimeControl";
const DEFAULT_TIME_CONTROL = resolveQuickMatchDefaultTimeControl("rapid");
const REGISTRATION_WINDOW_MS = 60 * 60 * 1000;
const ARENA_PAIRING_INTERVAL_SECONDS = 5;

function normalizeVariant(value: unknown): MatchVariant {
  if (typeof value !== "string") return "standard";
  const normalized = value.trim().toLowerCase();
  if (normalized === "chess960") return "chess960";
  if (
    normalized === "atomic" ||
    normalized === "atomicchess" ||
    normalized === "atomic-chess" ||
    normalized === "atomic_chess"
  ) {
    return "atomic";
  }
  if (
    normalized === "kingofhill" ||
    normalized === "king-of-hill" ||
    normalized === "king_of_hill"
  ) {
    return "kingOfHill";
  }
  if (
    normalized === "threecheck" ||
    normalized === "three-check" ||
    normalized === "three_check"
  ) {
    return "threeCheck";
  }
  return "standard";
}

function normalizeTimeControlValue(value: {
  initial: unknown;
  increment: unknown;
}): { initial: number; increment: number } | null {
  const initial = Number(value.initial);
  const increment = Number(value.increment);

  if (
    !Number.isFinite(initial) ||
    !Number.isFinite(increment) ||
    initial <= 0 ||
    increment < 0
  ) {
    return null;
  }

  return {
    initial: Math.round(initial),
    increment: Math.round(increment),
  };
}

function getValidQuickMatchTimeControl(
  value: { initial: unknown; increment: unknown } | null,
): { initial: number; increment: number } | null {
  if (!value) return null;
  const normalized = normalizeTimeControlValue(value);
  if (!normalized) return null;
  return normalized;
}

function getTimeControlFromState(
  state: unknown,
): { initial: number; increment: number } | null {
  if (!state || typeof state !== "object") return null;
  const maybeState = state as { initial?: unknown; increment?: unknown };

  if (
    typeof maybeState.initial === "number" &&
    typeof maybeState.increment === "number"
  ) {
    return getValidQuickMatchTimeControl({
      initial: maybeState.initial,
      increment: maybeState.increment,
    });
  }

  return null;
}

function getTimeControlFromSearch(
  search: string,
): { initial: number; increment: number } | null {
  const params = new URLSearchParams(search);
  const initial = Number(params.get("initial"));
  const increment = Number(params.get("increment"));

  if (Number.isFinite(initial) && Number.isFinite(increment)) {
    return getValidQuickMatchTimeControl({ initial, increment });
  }

  return null;
}

function getTimeControlFromHistory(
  game: Pick<GameHistory, "timeControl"> | null | undefined,
): { initial: number; increment: number } | null {
  const raw = String(game?.timeControl || "").trim();
  if (!raw || raw === "-") return null;

  const [initialPart, incrementPart = "0"] = raw.split("+");
  return getValidQuickMatchTimeControl({
    initial: Number(initialPart),
    increment: Number(incrementPart),
  });
}

function storeTimeControl(value: { initial: number; increment: number }) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      LAST_QUICK_TIME_CONTROL_KEY,
      JSON.stringify(value),
    );
  } catch {

  }
}

function readStoredTimeControl(): { initial: number; increment: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_QUICK_TIME_CONTROL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      initial?: unknown;
      increment?: unknown;
    };
    return getValidQuickMatchTimeControl(parsed);
  } catch {
    return null;
  }
}

function getAutoStartFromState(state: unknown): boolean {
  if (!state || typeof state !== "object") return false;
  const raw = (state as { autoStart?: unknown }).autoStart;
  if (raw === true || raw === 1) return true;
  if (typeof raw === "string") {
    const normalized = raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+$/g, "");
    return (
      normalized === "1" ||
      normalized === "true" ||
      normalized === "yes" ||
      normalized === "on"
    );
  }
  return false;
}

function getAutoStartFromSearch(search: string): boolean {
  const rawValue = new URLSearchParams(search).get("autostart");
  if (!rawValue) return false;
  const normalized = rawValue
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+$/g, "");
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  );
}

function getVariantFromState(state: unknown): MatchVariant | null {
  if (!state || typeof state !== "object") return null;
  if (!("variant" in state)) return null;
  return normalizeVariant((state as { variant?: unknown }).variant);
}

function getVariantFromSearch(search: string): MatchVariant | null {
  const value = new URLSearchParams(search).get("variant");
  if (!value) return null;
  return normalizeVariant(value);
}

function getTournamentGameIdFromState(state: unknown): string | null {
  if (!state || typeof state !== "object") return null;
  const raw = (state as { tournamentGameId?: unknown }).tournamentGameId;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

function getTournamentGameIdFromSearch(search: string): string | null {
  const params = new URLSearchParams(search);
  const raw = params.get("tournamentGameId");
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

function getTournamentIdFromState(state: unknown): string | null {
  if (!state || typeof state !== "object") return null;
  const raw = (state as { tournamentId?: unknown }).tournamentId;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

function getTournamentIdFromSearch(search: string): string | null {
  const params = new URLSearchParams(search);
  const raw = params.get("tournamentId");
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

function parseOptionalDate(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed;
}

function formatLobbyResult(result: string, isBye: boolean): string {
  if (isBye) return "BYE";
  const normalized = String(result || "*");
  if (normalized === "*") return "Live";
  if (normalized === "1/2-1/2") return "1/2";
  return normalized.replace(/F$/i, "");
}

interface TournamentLobbyRoundGame {
  id?: string;
  gameId?: string;
  roundNumber?: number;
  board?: number;
  white?: string;
  black?: string;
  whiteId?: string;
  blackId?: string;
  result?: string;
  isBye?: boolean;
  status?: "in_progress" | "completed";
  whiteEloDelta?: number;
  blackEloDelta?: number;
}

interface TournamentLobbyRound {
  roundNumber?: number;
  games?: TournamentLobbyRoundGame[];
}

interface TournamentLobbyDetailResponse {
  tournament?: {
    id?: string;
    name?: string;
    status?: string;
    type?: string;
    formatLabel?: string;
    currentRound?: number;
    roundsPlanned?: number;
    durationMinutes?: number | null;
    timeControlLabel?: string;
    isRegistered?: boolean;
    scheduledStartAt?: string | null;
    startedAt?: string | null;
    finishedAt?: string | null;
    arenaReady?: boolean;
    arenaWaitTicks?: number;
    arenaReadyPoolSize?: number;
    arenaPairingIntervalSeconds?: number;
  };
  standings?: Array<{
    rank?: number;
    userId?: string;
    username?: string;
    elo?: number;
    avatar?: string;
    points?: number;
    games?: number;
    gamesPlayed?: number;
    wins?: number;
    draws?: number;
    losses?: number;
    status?: string;
  }>;
  rounds?: TournamentLobbyRound[];
}

function buildTournamentLobbyPanelData(
  detail: TournamentLobbyDetailResponse,
  viewerUserId: string,
): { panelData: TournamentGamePanelData; statusMessage: string | null } {
  const tournament = detail?.tournament || {};
  const status = String(tournament.status || "").toUpperCase();
  const nowMs = Date.now();
  const startedAt = parseOptionalDate(tournament.startedAt);
  const scheduledStartAt = parseOptionalDate(tournament.scheduledStartAt);
  const finishedAt = parseOptionalDate(tournament.finishedAt);
  const startAt = startedAt || scheduledStartAt;
  const durationMinutes = Number(tournament.durationMinutes || 0);
  const hasDurationEnded =
    !!startAt &&
    Number.isFinite(durationMinutes) &&
    durationMinutes > 0 &&
    nowMs >= startAt.getTime() + durationMinutes * 60_000;
  const hasEnded =
    status === "FINISHED" || (!!finishedAt && nowMs >= finishedAt.getTime());
  const isRunning =
    !hasEnded &&
    (status === "LIVE_ROUND" ||
      status === "ROUND_CLOSED" ||
      (!!startAt && nowMs >= startAt.getTime()));
  const isRegistered = !!tournament.isRegistered;
  const isArena = String(tournament.type || "").toLowerCase() === "arena";
  const isInReadyPool = !!tournament.arenaReady;
  const isArenaTimerElapsed = isArena && hasDurationEnded && !hasEnded;

  const history = (detail?.rounds || [])
    .flatMap((round) =>
      (round.games || []).map((game) => ({
        id: String(game.id || game.gameId || ""),
        gameId: String(game.gameId || ""),
        roundNumber: Number(round.roundNumber || game.roundNumber || 0),
        board: Number(game.board || 0),
        white: String(game.white || "Player"),
        black: String(game.black || "Player"),
        whiteId: String(game.whiteId || ""),
        blackId: String(game.blackId || ""),
        result: formatLobbyResult(String(game.result || "*"), !!game.isBye),
        rawResult: String(game.result || "*"),
        isBye: !!game.isBye,
        status:
          game.status || (String(game.result || "*") === "*" ? "in_progress" : "completed"),
        whiteEloDelta: Number(game.whiteEloDelta || 0),
        blackEloDelta: Number(game.blackEloDelta || 0),
      })),
    )
    .sort((a, b) => {
      const byRound = Number(a.roundNumber || 0) - Number(b.roundNumber || 0);
      if (byRound !== 0) return byRound;
      return Number(a.board || 0) - Number(b.board || 0);
    });

  const pendingViewerGame =
    history.find(
      (game) =>
        !game.isBye &&
        game.rawResult === "*" &&
        (game.whiteId === viewerUserId || game.blackId === viewerUserId),
    ) || null;

  let statusMessage: string | null = null;
  let gameAction: NonNullable<TournamentGamePanelData["gameAction"]> = {
    gameId: null,
    label: "Join",
    disabled: false,
  };

  if (!isRegistered) {
    if (hasEnded || (startAt && nowMs >= startAt.getTime())) {
      gameAction = { gameId: null, label: "Join", disabled: true };
      statusMessage = "Registration is closed.";
    } else if (startAt && nowMs < startAt.getTime() - REGISTRATION_WINDOW_MS) {
      gameAction = { gameId: null, label: "Join", disabled: true };
      statusMessage = "Registration begins 1 hour before the event starts.";
    } else {
      gameAction = { gameId: null, label: "Join", disabled: false };
    }
  } else if (pendingViewerGame) {
    gameAction = {
      gameId: pendingViewerGame.gameId,
      label: Number(pendingViewerGame.roundNumber || 0) > 1 ? "Next Game" : "Start Game",
      disabled: !String(pendingViewerGame.gameId || "").trim(),
    };
  } else if (isRunning) {
    if (isArena) {
      if (isArenaTimerElapsed) {
        gameAction = { gameId: null, label: "Time ended", disabled: true };
      } else if (isInReadyPool) {
        gameAction = { gameId: null, label: "Waiting for pairing", disabled: true };
      } else {
        gameAction = { gameId: null, label: "Ready", disabled: false };
      }
    } else {
      gameAction = { gameId: null, label: "Waiting for pairing", disabled: true };
    }
  } else {
    gameAction = { gameId: null, label: hasEnded ? "Final standings" : "Joined", disabled: true };
  }

  return {
    panelData: {
      tournament: {
        id: String(tournament.id || ""),
        name: String(tournament.name || "Tournament"),
        status: String(tournament.status || ""),
        type: String(tournament.type || "swiss"),
        formatLabel: String(tournament.formatLabel || ""),
        currentRound: Number(tournament.currentRound || 0),
        roundsPlanned: Number(tournament.roundsPlanned || 1),
        timeControlLabel: String(tournament.timeControlLabel || ""),
        durationMinutes:
          tournament.durationMinutes === null ||
          tournament.durationMinutes === undefined
            ? null
            : Number(tournament.durationMinutes),
        scheduledStartAt:
          typeof tournament.scheduledStartAt === "string"
            ? tournament.scheduledStartAt
            : null,
        startedAt:
          typeof tournament.startedAt === "string"
            ? tournament.startedAt
            : null,
        finishedAt:
          typeof tournament.finishedAt === "string"
            ? tournament.finishedAt
            : null,
        arenaReady: !!tournament.arenaReady,
        arenaWaitTicks: Number(tournament.arenaWaitTicks || 0),
        arenaReadyPoolSize: Number(tournament.arenaReadyPoolSize || 0),
        arenaPairingIntervalSeconds: Number(
          tournament.arenaPairingIntervalSeconds || ARENA_PAIRING_INTERVAL_SECONDS,
        ),
      },
      opponent: null,
      standings: (detail.standings || []).map((row) => ({
        rank: Number(row.rank || 0),
        userId: String(row.userId || ""),
        username: String(row.username || "Player"),
        elo: Number(row.elo || 1200),
        avatar: String(row.avatar || ""),
        points: Number(row.points || 0),
        games: Number(row.games ?? row.gamesPlayed ?? 0),
        wins: Number(row.wins || 0),
        draws: Number(row.draws || 0),
        losses: Number(row.losses || 0),
        status: String(row.status || "active"),
      })),
      history,
      gameAction,
      chatMessages: [],
    },
    statusMessage,
  };
}

export default function QuickMatch() {
  const { user } = useAuthStore();
  const { defaultTimeControl } = useGameplayPreferences();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    game,
    lastMove,
    moves,
    gameSettings,
    gameStarted,
    gameOver,
    gameResult,
    isPlayerTurn,
    playerColor,
    activeGameId,
    savedGameId,
    historyPersistenceStatus,
    showGameOverModal,
    optionSquares,
    preMoveSquares,
    playerRating,
    opponentRating,
    isRatedMatch,
    playerClockSeed,
    opponentClockSeed,
    clockResetToken,
    isClockPaused,
    setPlayerTime,
    setOpponentTime,
    onSquareClick,
    onPieceDrop,
    onCancelSelection,
    isDraggablePiece,
    opponentName,
    isSearching,
    queueStatus,
    isConnected,
    startMatch,
    joinTournamentGame,
    leaveTournamentJoin,
    cancelMatch,
    resign,
    offerDraw,
    respondDrawOffer,
    timeOut,
    rematch,
    leaveGame,
    matchVariant,
    threeCheckState,
    drawOfferState,
    promotionState,
    onPromotionPieceSelect,
    lastGameOver,
  } = useOnlineQuickMatch();

  const [timeControl, setTimeControl] = useState(() => {
    return (
      getTimeControlFromState(location.state) ||
      getTimeControlFromSearch(location.search) ||
      resolveQuickMatchDefaultTimeControl(
        defaultTimeControl,
        readStoredTimeControl(),
      )
    );
  });
  const [variant, setVariant] = useState<MatchVariant>(() => {
    return (
      getVariantFromState(location.state) ||
      getVariantFromSearch(location.search) ||
      "standard"
    );
  });
  const [tournamentGameId, setTournamentGameId] = useState<string | null>(() => {
    return (
      getTournamentGameIdFromState(location.state) ||
      getTournamentGameIdFromSearch(location.search)
    );
  });
  const [tournamentId, setTournamentId] = useState<string | null>(() => {
    return (
      getTournamentIdFromState(location.state) ||
      getTournamentIdFromSearch(location.search)
    );
  });
  const [tournamentPanelData, setTournamentPanelData] =
    useState<TournamentGamePanelData | null>(null);
  const [tournamentLobbyStatusMessage, setTournamentLobbyStatusMessage] =
    useState<string | null>(null);

  useEffect(() => {
    const selectedTimeControl =
      getTimeControlFromState(location.state) ||
      getTimeControlFromSearch(location.search);
    if (selectedTimeControl) {
      setTimeControl(selectedTimeControl);
      return;
    }
    const storedTimeControl = readStoredTimeControl();
    const fallbackTimeControl = resolveQuickMatchDefaultTimeControl(
      defaultTimeControl,
      storedTimeControl,
    );

    if (defaultTimeControl !== "custom" || storedTimeControl) {
      setTimeControl(fallbackTimeControl);
      return;
    }

    let cancelled = false;

    const loadLatestPlayedFormat = async () => {
      try {
        const res = await fetch(`${API_URL}/api/history?limit=1`, {
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error("Failed to load history");
        }

        const data = (await res.json()) as { games?: GameHistory[] };
        if (cancelled) return;

        setTimeControl(
          getTimeControlFromHistory(data.games?.[0]) || fallbackTimeControl,
        );
      } catch {
        if (!cancelled) {
          setTimeControl(fallbackTimeControl);
        }
      }
    };

    void loadLatestPlayedFormat();

    return () => {
      cancelled = true;
    };
  }, [defaultTimeControl, location.state, location.search]);

  useEffect(() => {
    const selectedVariant =
      getVariantFromState(location.state) ||
      getVariantFromSearch(location.search);
    setVariant(selectedVariant || "standard");
  }, [location.state, location.search]);

  useEffect(() => {
    setTournamentGameId(
      getTournamentGameIdFromState(location.state) ||
        getTournamentGameIdFromSearch(location.search),
    );
  }, [location.state, location.search]);

  useEffect(() => {
    setTournamentId(
      getTournamentIdFromState(location.state) ||
        getTournamentIdFromSearch(location.search),
    );
  }, [location.state, location.search]);

  const isTournamentLobbyMode = !!tournamentId && !tournamentGameId;

  useEffect(() => {
    if (!tournamentGameId) {
      if (!isTournamentLobbyMode) {
        setTournamentPanelData(null);
        setTournamentLobbyStatusMessage(null);
      }
      return;
    }

    let cancelled = false;

    const loadTournamentPanelData = async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/tournaments/by-game/${encodeURIComponent(tournamentGameId)}/context`,
          {
            credentials: "include",
          },
        );
        if (!res.ok) {
          if (!cancelled && res.status >= 500) {
            setTournamentPanelData(null);
          }
          return;
        }

        const payload = (await res.json()) as TournamentGamePanelData;
        if (!cancelled) {
          setTournamentPanelData(payload);
        }
      } catch {
        if (!cancelled) {
          setTournamentPanelData(null);
        }
      }
    };

    void loadTournamentPanelData();
    const pollId = window.setInterval(
      () => void loadTournamentPanelData(),
      5000,
    );

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
    };
  }, [gameStarted, isTournamentLobbyMode, tournamentGameId]);

  useEffect(() => {
    if (!isTournamentLobbyMode || !tournamentId) {
      if (!tournamentGameId) {
        setTournamentLobbyStatusMessage(null);
      }
      return;
    }

    let cancelled = false;

    const loadTournamentLobbyData = async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/tournaments/${encodeURIComponent(tournamentId)}`,
          {
            credentials: "include",
          },
        );
        const payload = (await res.json().catch(() => ({}))) as
          | TournamentLobbyDetailResponse
          | { error?: string };

        if (cancelled) return;
        if (!res.ok) {
          const message = String(
            (payload as { error?: string })?.error || "Failed to load tournament.",
          );
          setTournamentLobbyStatusMessage(message);
          return;
        }

        const mapped = buildTournamentLobbyPanelData(
          payload as TournamentLobbyDetailResponse,
          String(user?.id || ""),
        );
        setTournamentPanelData(mapped.panelData);
        setTournamentLobbyStatusMessage(mapped.statusMessage);
      } catch {
        if (!cancelled) {
          setTournamentLobbyStatusMessage("Failed to load tournament.");
        }
      }
    };

    void loadTournamentLobbyData();
    const pollId = window.setInterval(() => {
      void loadTournamentLobbyData();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
    };
  }, [isTournamentLobbyMode, tournamentGameId, tournamentId, user?.id]);

  const autoStartRequested =
    !tournamentGameId &&
    !tournamentId &&
    (getAutoStartFromState(location.state) ||
      getAutoStartFromSearch(location.search));
  const autoStartHandledRef = useRef(false);
  const [pendingAutoStart, setPendingAutoStart] = useState(autoStartRequested);
  const tournamentJoinHandledRef = useRef("");
  const [pendingTournamentJoin, setPendingTournamentJoin] = useState(
    !!tournamentGameId,
  );

  useEffect(() => {
    autoStartHandledRef.current = false;
    setPendingAutoStart(autoStartRequested);
  }, [autoStartRequested, location.key]);

  useEffect(() => {
    tournamentJoinHandledRef.current = "";
    setPendingTournamentJoin(!!tournamentGameId);
  }, [location.key, tournamentGameId]);

  useEffect(() => {
    if (!pendingAutoStart || autoStartHandledRef.current) return;
    if (gameStarted || isSearching) {
      setPendingAutoStart(false);
      autoStartHandledRef.current = true;
      return;
    }
    if (!isConnected) return;

    autoStartHandledRef.current = true;
    storeTimeControl(timeControl);
    startMatch(timeControl, user?.fullName || "Player", variant);
  }, [
    gameStarted,
    isConnected,
    isSearching,
    pendingAutoStart,
    startMatch,
    timeControl,
    variant,
    user?.fullName,
  ]);

  useEffect(() => {
    if (!pendingTournamentJoin || !tournamentGameId) return;
    if (gameStarted && activeGameId === tournamentGameId) {
      setPendingTournamentJoin(false);
      return;
    }
    if (!isConnected) return;

    const joinKey = `${location.key}:${tournamentGameId}`;
    if (tournamentJoinHandledRef.current === joinKey) return;
    tournamentJoinHandledRef.current = joinKey;

    joinTournamentGame(tournamentGameId, user?.fullName || "Player");
  }, [
    gameStarted,
    activeGameId,
    isConnected,
    joinTournamentGame,
    location.key,
    pendingTournamentJoin,
    tournamentGameId,
    user?.fullName,
  ]);

  useEffect(() => {
    if (!pendingAutoStart) return;
    if (isSearching || gameStarted) {
      setPendingAutoStart(false);
      return;
    }
    if (
      queueStatus &&
      /offline|unable to connect|disconnected/i.test(queueStatus)
    ) {
      setPendingAutoStart(false);
    }
  }, [gameStarted, isSearching, pendingAutoStart, queueStatus]);

  useEffect(() => {
    if (!pendingTournamentJoin) return;
    if (gameStarted && activeGameId === tournamentGameId) {
      setPendingTournamentJoin(false);
      return;
    }
    if (isSearching) return;
    if (!queueStatus) return;
    if (
      /offline|failed|not found|finished|not running|not a player|required/i.test(
        queueStatus,
      )
    ) {
      setPendingTournamentJoin(false);
    }
  }, [
    activeGameId,
    gameStarted,
    isSearching,
    pendingTournamentJoin,
    queueStatus,
    tournamentGameId,
  ]);

  const handleCancelMatch = () => {
    if (tournamentGameId) {
      setPendingTournamentJoin(false);
      leaveTournamentJoin();
      navigate("/tournaments");
      return;
    }
    if (isTournamentLobbyMode) {
      navigate("/tournaments");
      return;
    }
    setPendingAutoStart(false);
    cancelMatch();
  };

  const handleStartMatch = () => {
    if (tournamentGameId || isTournamentLobbyMode) return;
    storeTimeControl(timeControl);

    const params = new URLSearchParams({
      initial: String(timeControl.initial),
      increment: String(timeControl.increment),
    });
    if (variant !== "standard") {
      params.set("variant", variant);
    }
    navigate(`/play/quick?${params.toString()}`, {
      replace: true,
      state: {
        initial: timeControl.initial,
        increment: timeControl.increment,
        variant,
      },
    });
    setPendingAutoStart(false);
    startMatch(timeControl, user?.fullName || "Player", variant);
  };

  const handleVariantChange = (nextVariant: MatchVariant) => {
    setVariant(nextVariant);
    const params = new URLSearchParams({
      initial: String(timeControl.initial),
      increment: String(timeControl.increment),
    });
    if (nextVariant !== "standard") {
      params.set("variant", nextVariant);
    }

    navigate(`/play/quick?${params.toString()}`, {
      replace: true,
      state: {
        initial: timeControl.initial,
        increment: timeControl.increment,
        variant: nextVariant,
      },
    });
  };

  const handleOpenVariantPage = (variantKey: string) => {
    const params = new URLSearchParams({
      initial: String(timeControl.initial),
      increment: String(timeControl.increment),
      variant: variantKey,
    });

    navigate(`/play/variants?${params.toString()}`, {
      state: {
        initial: timeControl.initial,
        increment: timeControl.increment,
        variant: variantKey,
      },
    });
  };

  const handleNewGameFromModal = useCallback(() => {
    leaveGame();
    navigateToNewGameRoute(navigate, {
      mode: "quick",
      variant: matchVariant,
      timeControl: gameSettings.timeControl,
    });
  }, [leaveGame, navigate, matchVariant, gameSettings.timeControl]);

  const handleTournamentAction = useCallback(
    async (action: { gameId: string | null; label: string; disabled: boolean } | null) => {
      if (!action || action.disabled) return;

      const nextGameId = String(action.gameId || "").trim();
      if (nextGameId) {
        navigate(`/play/quick?tournamentGameId=${encodeURIComponent(nextGameId)}`, {
          state: { tournamentGameId: nextGameId, autoStart: true },
        });
        return;
      }

      const targetTournamentId = String(
        tournamentId || tournamentPanelData?.tournament?.id || "",
      ).trim();
      if (!targetTournamentId) return;
      const actionLabel = String(action.label || "").trim();
      const isArenaLobby =
        String(tournamentPanelData?.tournament?.type || "").toLowerCase() === "arena";

      if (isArenaLobby && /^(start game|ready for next game|ready)$/i.test(actionLabel)) {
        setTournamentLobbyStatusMessage("Joining ready pool...");
        try {
          const res = await fetch(
            `${API_URL}/api/tournaments/${encodeURIComponent(targetTournamentId)}/arena/ready`,
            {
              method: "POST",
              credentials: "include",
            },
          );
          const payload = (await res.json().catch(() => ({}))) as
            | TournamentLobbyDetailResponse
            | { error?: string; message?: string };

          if (!res.ok) {
            setTournamentLobbyStatusMessage(
              String((payload as { error?: string })?.error || "Failed to join ready pool."),
            );
            return;
          }

          const mapped = buildTournamentLobbyPanelData(
            payload as TournamentLobbyDetailResponse,
            String(user?.id || ""),
          );
          setTournamentPanelData(mapped.panelData);
          setTournamentLobbyStatusMessage(
            (payload as { message?: string })?.message ||
              mapped.statusMessage,
          );
          const pairedGameId = String(mapped.panelData.gameAction?.gameId || "").trim();
          if (pairedGameId && pairedGameId !== tournamentGameId) {
            navigate(`/play/quick?tournamentGameId=${encodeURIComponent(pairedGameId)}`, {
              state: { tournamentGameId: pairedGameId, autoStart: true },
            });
          }
        } catch {
          setTournamentLobbyStatusMessage("Failed to join ready pool.");
        }
        return;
      }

      if (!isTournamentLobbyMode || !/^join$/i.test(actionLabel)) return;

      setTournamentLobbyStatusMessage("Joining...");
      try {
        const res = await fetch(
          `${API_URL}/api/tournaments/${encodeURIComponent(targetTournamentId)}/register`,
          {
            method: "POST",
            credentials: "include",
          },
        );
        const payload = (await res.json().catch(() => ({}))) as
          | TournamentLobbyDetailResponse
          | { error?: string };

        if (!res.ok) {
          setTournamentLobbyStatusMessage(
            String((payload as { error?: string })?.error || "Failed to join tournament."),
          );
          return;
        }

        const mapped = buildTournamentLobbyPanelData(
          payload as TournamentLobbyDetailResponse,
          String(user?.id || ""),
        );
        setTournamentPanelData(mapped.panelData);
        setTournamentLobbyStatusMessage(mapped.statusMessage);
      } catch {
        setTournamentLobbyStatusMessage("Failed to join tournament.");
      }
    },
    [
      isTournamentLobbyMode,
      navigate,
      tournamentGameId,
      tournamentId,
      tournamentPanelData,
      user?.id,
    ],
  );

  const showTournamentBoard = !!tournamentGameId || isTournamentLobbyMode;
  const boardStatusMessage = isTournamentLobbyMode
    ? tournamentLobbyStatusMessage
    : tournamentLobbyStatusMessage || queueStatus;

  if (gameStarted || showTournamentBoard) {
    return (
      <QuickMatchGameView
        game={game}
        lastMove={lastMove}
        moves={moves}
        gameSettings={gameSettings}
        gameStarted={gameStarted}
        gameOver={gameOver}
        gameResult={gameResult}
        isPlayerTurn={isPlayerTurn}
        playerColor={playerColor}
        activeGameId={activeGameId}
        savedGameId={savedGameId}
        historyPersistenceStatus={historyPersistenceStatus}
        showGameOverModal={showGameOverModal}
        optionSquares={optionSquares}
        preMoveSquares={preMoveSquares}
        playerRating={isRatedMatch ? playerRating : null}
        opponentRating={isRatedMatch ? opponentRating : null}
        gameOverElo={isRatedMatch ? lastGameOver?.elo ?? null : null}
        statusMessage={boardStatusMessage}
        onSquareClick={onSquareClick}
        onPieceDrop={onPieceDrop}
        onCancelSelection={onCancelSelection}
        isDraggablePiece={isDraggablePiece}
        opponentName={opponentName}
        promotionState={promotionState}
        onPromotionPieceSelect={onPromotionPieceSelect}
        tournamentMode={showTournamentBoard}
        setOpponentTime={setOpponentTime}
        setPlayerTime={setPlayerTime}
        playerClockSeed={playerClockSeed}
        opponentClockSeed={opponentClockSeed}
        clockResetToken={clockResetToken}
        isClockPaused={isClockPaused}
        onTimeOut={timeOut}
        onResign={resign}
        onOfferDraw={offerDraw}
        onRespondDrawOffer={respondDrawOffer}
        onRematch={rematch}
        onNewGame={handleNewGameFromModal}
        onLeave={leaveGame}
        variant={matchVariant}
        threeCheckState={threeCheckState}
        drawOfferState={drawOfferState}
        tournamentPanelData={tournamentPanelData}
        activeTournamentGameId={tournamentGameId}
        onTournamentAction={showTournamentBoard ? handleTournamentAction : undefined}
      />
    );
  }

  return (
    <QuickMatchSetup
      timeControl={timeControl}
      onTimeControlChange={setTimeControl}
      variant={variant}
      onVariantChange={handleVariantChange}
      onOpenVariantPage={handleOpenVariantPage}
      onStart={handleStartMatch}
      isSearching={
      isSearching ||
      pendingAutoStart ||
      (!!tournamentGameId && pendingTournamentJoin && !gameStarted)
    }
      queueStatus={
        tournamentGameId
          ? queueStatus || "Waiting for your tournament opponent..."
          : queueStatus
      }
      isConnected={isConnected}
      onCancel={handleCancelMatch}
      tournamentMode={showTournamentBoard}
    />
  );
}
