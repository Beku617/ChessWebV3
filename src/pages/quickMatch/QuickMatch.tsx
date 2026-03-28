import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { useOnlineQuickMatch } from "../../hooks/useOnlineQuickMatch";
import { navigateToNewGameRoute } from "../../components/game/newGameRouting";
import { QuickMatchSetup } from "./QuickMatchSetup";
import { QuickMatchGameView } from "./QuickMatchGameView";

type MatchVariant = "standard" | "chess960";
const LAST_QUICK_TIME_CONTROL_KEY = "quickMatch:lastTimeControl";

function normalizeVariant(value: unknown): MatchVariant {
  if (typeof value !== "string") return "standard";
  return value.trim().toLowerCase() === "chess960" ? "chess960" : "standard";
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
    return {
      initial: maybeState.initial,
      increment: maybeState.increment,
    };
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
    return { initial, increment };
  }

  return null;
}

function getStoredTimeControl():
  | { initial: number; increment: number }
  | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(LAST_QUICK_TIME_CONTROL_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { initial?: unknown; increment?: unknown };
    if (
      typeof parsed.initial === "number" &&
      Number.isFinite(parsed.initial) &&
      parsed.initial >= 0 &&
      typeof parsed.increment === "number" &&
      Number.isFinite(parsed.increment) &&
      parsed.increment >= 0
    ) {
      return {
        initial: parsed.initial,
        increment: parsed.increment,
      };
    }
  } catch {
    return null;
  }

  return null;
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
    savedGameId,
    historyPersistenceStatus,
    showGameOverModal,
    optionSquares,
    preMoveSquares,
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
    promotionState,
    onPromotionPieceSelect,
  } = useOnlineQuickMatch();

  const [timeControl, setTimeControl] = useState(() => {
    return (
      getTimeControlFromState(location.state) ||
      getTimeControlFromSearch(location.search) ||
      getStoredTimeControl() || {
        initial: 300,
        increment: 0,
      }
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

  useEffect(() => {
    const selectedTimeControl =
      getTimeControlFromState(location.state) ||
      getTimeControlFromSearch(location.search);
    if (selectedTimeControl) {
      setTimeControl(selectedTimeControl);
      return;
    }
    setTimeControl(getStoredTimeControl() || { initial: 300, increment: 0 });
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
        savedGameId={savedGameId}
        historyPersistenceStatus={historyPersistenceStatus}
        showGameOverModal={showGameOverModal}
        optionSquares={optionSquares}
        preMoveSquares={preMoveSquares}
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
        onTimeOut={timeOut}
        onResign={resign}
        onRematch={rematch}
        onNewGame={handleNewGameFromModal}
        onLeave={leaveGame}
        variant={matchVariant}
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
