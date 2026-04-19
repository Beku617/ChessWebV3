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

type MatchVariant = "standard" | "chess960" | "threeCheck";
const LAST_QUICK_TIME_CONTROL_KEY = "quickMatch:lastTimeControl";
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const DEFAULT_TIME_CONTROL = { initial: 300, increment: 0 };

function normalizeVariant(value: unknown): MatchVariant {
  if (typeof value !== "string") return "standard";
  const normalized = value.trim().toLowerCase();
  if (normalized === "chess960") return "chess960";
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

function getAutoStartFromState(state: unknown): boolean {
  if (!state || typeof state !== "object") return false;
  return (state as { autoStart?: unknown }).autoStart === true;
}

function getAutoStartFromSearch(search: string): boolean {
  const value = new URLSearchParams(search).get("autostart");
  return value === "1" || value === "true";
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

export default function QuickMatch() {
  const { user } = useAuthStore();
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
    timeOut,
    rematch,
    leaveGame,
    matchVariant,
    threeCheckState,
    promotionState,
    onPromotionPieceSelect,
    lastGameOver,
  } = useOnlineQuickMatch();

  const [timeControl, setTimeControl] = useState(() => {
    return (
      getTimeControlFromState(location.state) ||
      getTimeControlFromSearch(location.search) ||
      DEFAULT_TIME_CONTROL
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
  const [tournamentPanelData, setTournamentPanelData] =
    useState<TournamentGamePanelData | null>(null);

  useEffect(() => {
    const selectedTimeControl =
      getTimeControlFromState(location.state) ||
      getTimeControlFromSearch(location.search);
    if (selectedTimeControl) {
      setTimeControl(selectedTimeControl);
      return;
    }
    setTimeControl(DEFAULT_TIME_CONTROL);
  }, [location.state, location.search]);

  useEffect(() => {
    const selectedTimeControl =
      getTimeControlFromState(location.state) ||
      getTimeControlFromSearch(location.search);
    if (selectedTimeControl) return;

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
          getTimeControlFromHistory(data.games?.[0]) || DEFAULT_TIME_CONTROL,
        );
      } catch {
        if (!cancelled) {
          setTimeControl(DEFAULT_TIME_CONTROL);
        }
      }
    };

    void loadLatestPlayedFormat();

    return () => {
      cancelled = true;
    };
  }, [location.state, location.search]);

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
    if (!tournamentGameId) {
      setTournamentPanelData(null);
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
      gameStarted ? 6000 : 12000,
    );

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
    };
  }, [gameStarted, tournamentGameId]);

  const autoStartRequested =
    !tournamentGameId &&
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
    if (gameStarted) {
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
    if (gameStarted) {
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
  }, [gameStarted, isSearching, pendingTournamentJoin, queueStatus]);

  const handleCancelMatch = () => {
    if (tournamentGameId) {
      setPendingTournamentJoin(false);
      leaveTournamentJoin();
      navigate("/tournaments");
      return;
    }
    setPendingAutoStart(false);
    cancelMatch();
  };

  const handleStartMatch = () => {
    if (tournamentGameId) return;
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

  if (gameStarted) {
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
        savedGameId={savedGameId}
        historyPersistenceStatus={historyPersistenceStatus}
        showGameOverModal={showGameOverModal}
        optionSquares={optionSquares}
        preMoveSquares={preMoveSquares}
        playerRating={isRatedMatch ? playerRating : null}
        opponentRating={isRatedMatch ? opponentRating : null}
        gameOverElo={isRatedMatch ? lastGameOver?.elo ?? null : null}
        onSquareClick={onSquareClick}
        onPieceDrop={onPieceDrop}
        onCancelSelection={onCancelSelection}
        isDraggablePiece={isDraggablePiece}
        opponentName={opponentName}
        promotionState={promotionState}
        onPromotionPieceSelect={onPromotionPieceSelect}
        tournamentMode={!!tournamentGameId}
        setOpponentTime={setOpponentTime}
        setPlayerTime={setPlayerTime}
        playerClockSeed={playerClockSeed}
        opponentClockSeed={opponentClockSeed}
        clockResetToken={clockResetToken}
        onTimeOut={timeOut}
        onResign={resign}
        onRematch={rematch}
        onNewGame={handleNewGameFromModal}
        onLeave={leaveGame}
        variant={matchVariant}
        threeCheckState={threeCheckState}
        tournamentPanelData={tournamentPanelData}
        activeTournamentGameId={tournamentGameId}
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
      tournamentMode={!!tournamentGameId}
    />
  );
}
