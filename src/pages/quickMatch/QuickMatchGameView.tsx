import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Square } from "chess.js";
import {
  BarChart3,
  Check,
  Flag,
  Handshake,
  Maximize2,
  Minimize2,
  X,
  Zap,
} from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import {
  GameOverModal,
  PlayerInfo,
  GameBoard,
  ChessMoveList,
  MoveListTabs,
  ResignConfirmButton,
  buildChessMoveRows,
} from "../../components/game";
import type { GameSettings, PromotionState } from "../../components/game";
import type { SidebarMessageItem } from "../../components/game";
import type { HistoryPersistenceStatus } from "../../hooks/gameHistorySaver/historyPersistence";
import { useOpeningExplorer } from "../../hooks/useOpeningExplorer";
import { BOARD_FRAME } from "./types";
import type { CSSProperties, ReactNode } from "react";
import { openAnalyzeWindow } from "../../utils/analyzeNavigation";
import { buildFenByPly, formatOpeningLabel } from "../../utils/liveGameReview";

type MatchVariant =
  | "standard"
  | "chess960"
  | "threeCheck"
  | "kingOfHill"
  | "atomic";
const KING_OF_HILL_SQUARE_STYLES: Record<string, CSSProperties> = {
  d4: { boxShadow: "inset 0 0 0 9999px rgba(250, 204, 21, 0.16)" },
  e4: { boxShadow: "inset 0 0 0 9999px rgba(250, 204, 21, 0.16)" },
  d5: { boxShadow: "inset 0 0 0 9999px rgba(250, 204, 21, 0.16)" },
  e5: { boxShadow: "inset 0 0 0 9999px rgba(250, 204, 21, 0.16)" },
};
const ARENA_MEDAL_CLASSES = [
  "border-amber-300 bg-gradient-to-br from-amber-200 to-amber-600 text-amber-950",
  "border-slate-200 bg-gradient-to-br from-slate-100 to-slate-500 text-slate-950",
  "border-orange-300 bg-gradient-to-br from-orange-200 to-orange-700 text-orange-950",
];

export interface TournamentPanelStandingRow {
  rank: number;
  userId: string;
  username: string;
  elo: number;
  avatar?: string;
  points: number;
  games?: number;
  wins?: number;
  draws?: number;
  losses?: number;
  status?: string;
}

export interface TournamentPanelHistoryRow {
  id: string;
  gameId: string;
  savedGameId?: string;
  roundNumber: number;
  board: number;
  white: string;
  black: string;
  whiteId: string;
  blackId: string;
  result: string;
  rawResult: string;
  isBye: boolean;
  status: "in_progress" | "completed";
  whiteEloDelta?: number;
  blackEloDelta?: number;
}

export interface TournamentGamePanelData {
  tournament: {
    id: string;
    name: string;
    status: string;
    type: string;
    formatLabel?: string;
    currentRound: number;
    roundsPlanned: number;
    timeControlLabel?: string;
    durationMinutes?: number | null;
    scheduledStartAt?: string | null;
    startedAt?: string | null;
    finishedAt?: string | null;
    arenaReady?: boolean;
    arenaWaitTicks?: number;
    arenaReadyPoolSize?: number;
    arenaPairingIntervalSeconds?: number;
  };
  opponent?: {
    userId: string;
    username: string;
    elo: number;
    avatar?: string;
  } | null;
  standings: TournamentPanelStandingRow[];
  history: TournamentPanelHistoryRow[];
  gameAction?: {
    gameId: string | null;
    label: string;
    disabled: boolean;
  } | null;
  chatMessages?: Array<{
    id: string;
    sender: string;
    content: string;
    createdAt: string;
  }>;
}

interface MatchChatMessageEntry {
  senderId: string;
  senderUsername: string;
  content: string;
  createdAt: string;
  isSystem?: boolean;
}

interface QuickMatchGameViewProps {
  game: { fen: () => string };
  lastMove?: { from: string; to: string } | null;
  moves: string[];
  gameSettings: GameSettings;
  gameStarted: boolean;
  gameOver: boolean;
  gameResult: string | null;
  isPlayerTurn: boolean;
  playerColor: "w" | "b";
  activeGameId?: string | null;
  savedGameId: string | null;
  historyPersistenceStatus: HistoryPersistenceStatus;
  showGameOverModal: boolean;
  optionSquares: Record<string, CSSProperties>;
  preMoveSquares: Record<string, CSSProperties>;
  playerRating?: number | null;
  opponentRating?: number | null;
  statusMessage?: string | null;
  chatMessages?: MatchChatMessageEntry[];
  gameOverElo?: {
    rated?: boolean;
    applied?: boolean;
    white?: { oldRating?: number; newRating?: number; delta?: number } | null;
    black?: { oldRating?: number; newRating?: number; delta?: number } | null;
  } | null;
  onSquareClick: (square: Square) => void;
  onPieceDrop: (
    sourceSquare: Square,
    targetSquare: Square,
    piece?: string,
  ) => boolean;
  onCancelSelection: () => void;
  isDraggablePiece: (sourceSquare: Square) => boolean;
  setOpponentTime: (time: number) => void;
  setPlayerTime: (time: number) => void;
  playerClockSeed?: number;
  opponentClockSeed?: number;
  clockResetToken?: number;
  isClockPaused?: boolean;
  onTimeOut: (isPlayer: boolean) => void;
  onResign: () => void;
  onOfferDraw?: () => void;
  onRespondDrawOffer?: (accept: boolean) => void;
  onSendChatMessage?: (message: string) => void;
  drawOfferState?: {
    status: "idle" | "sent" | "received";
    offeredBy: "w" | "b" | null;
    expiresAt: number | null;
  };
  onRematch: () => void;
  onNewGame: () => void;
  onLeave?: () => void;
  tournamentMode?: boolean;
  opponentName?: string;
  variant?: MatchVariant;
  threeCheckState?: { whiteCheckCount: number; blackCheckCount: number };
  promotionState?: PromotionState;
  onPromotionPieceSelect?: (
    piece?: string,
    fromSquare?: Square,
    toSquare?: Square,
  ) => boolean;
  tournamentPanelData?: TournamentGamePanelData | null;
  activeTournamentGameId?: string | null;
  onTournamentAction?: (
    action: { gameId: string | null; label: string; disabled: boolean } | null,
  ) => void;
  boardFenOverride?: string;
  boardOrientationOverride?: "white" | "black";
  topPlayerNameOverride?: string;
  topPlayerRatingOverride?: number | null;
  bottomPlayerNameOverride?: string;
  bottomPlayerRatingOverride?: number | null;
  sidebarTitleOverride?: string;
  sidebarHeaderRightOverride?: string;
  customActionsOverride?: ReactNode;
  activeMovePly?: number;
  moveLogFooterMessage?: string | null;
  hideQuickMatchTitleSuffix?: boolean;
}

function getInitials(name: string): string {
  const letters = String(name || "")
    .replace(/[^a-zA-Z]/g, "")
    .slice(0, 2)
    .toUpperCase();
  return letters || "??";
}

function getJoinedCountdownLabel(
  startAt: string | null | undefined,
  nowMs: number,
): string | null {
  if (!startAt) return null;
  const startMs = new Date(startAt).getTime();
  if (!Number.isFinite(startMs)) return null;

  const remainingMs = startMs - nowMs;
  if (remainingMs <= 0) return null;

  if (remainingMs < 60_000) {
    const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
    return `Starts in ${seconds} second${seconds === 1 ? "" : "s"}`;
  }

  const minutes = Math.max(1, Math.floor(remainingMs / 60_000));
  return `Starts in ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function formatDurationClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function getArenaClockLabel(
  tournament: TournamentGamePanelData["tournament"] | undefined,
  nowMs: number,
): string | null {
  if (!tournament) return null;
  if (String(tournament.type || "").toLowerCase() !== "arena") return null;
  const durationMinutes = Number(tournament.durationMinutes || 0);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;

  const startMs = new Date(tournament.startedAt || "").getTime();
  if (!Number.isFinite(startMs) || startMs <= 0) return null;
  if (nowMs < startMs) return null;

  const remainingSeconds = Math.ceil(
    (startMs + durationMinutes * 60_000 - nowMs) / 1000,
  );
  return remainingSeconds > 0 ? formatDurationClock(remainingSeconds) : "0:00";
}

type ViewerOutcome = "win" | "draw" | "loss" | null;

function getViewerOutcome(
  row: TournamentPanelHistoryRow | null | undefined,
  viewerUserId: string,
): ViewerOutcome {
  if (!row || !viewerUserId) return null;
  const result = String(row.rawResult || row.result || "");
  if (result === "1/2-1/2") return "draw";
  if ((result === "1-0" || result === "1-0F") && row.whiteId === viewerUserId) {
    return "win";
  }
  if ((result === "0-1" || result === "0-1F") && row.blackId === viewerUserId) {
    return "win";
  }
  if (["1-0", "1-0F", "0-1", "0-1F"].includes(result)) return "loss";
  return null;
}

function getTournamentResultTitle(result: string | null | undefined): string {
  const normalized = String(result || "Game complete").trim();
  if (!normalized) return "Game complete";
  return normalized.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

function getWinnerLabel(row: TournamentPanelHistoryRow | null | undefined): string | null {
  if (!row) return null;
  const result = String(row.rawResult || row.result || "");
  if (result === "1-0" || result === "1-0F") return String(row.white || "White");
  if (result === "0-1" || result === "0-1F") return String(row.black || "Black");
  if (result === "1/2-1/2") return "Draw";
  return null;
}

function sanitizeTournamentStatusMessage(message: string | null | undefined): string | null {
  const normalized = String(message || "").trim();
  if (!normalized) return null;
  if (normalized.toLowerCase() === "game state restored.") return null;
  if (normalized.toLowerCase() === "game restored after reconnect.") return null;
  if (
    /pairing every/i.test(normalized) ||
    /ready\.\s*searching for next pairing/i.test(normalized) ||
    /waiting for (next )?pairing/i.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function formatArenaModalScore(value: number | null | undefined): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0";
  return Number.isInteger(numeric) ? String(numeric) : String(Math.round(numeric * 10) / 10);
}

function getArenaFormatLabel(
  tournament: TournamentGamePanelData["tournament"] | undefined,
): string {
  const timeControl = String(tournament?.timeControlLabel || "").trim();
  const format = String(tournament?.formatLabel || tournament?.type || "Arena")
    .trim()
    .replace(/^arena$/i, "Arena");
  return [timeControl, format].filter(Boolean).join(" ");
}

function shouldHideSidebarMessage(content: string) {
  const normalized = content.trim().toLowerCase();
  return (
    normalized === "game state restored." ||
    normalized === "game restored after reconnect."
  );
}

function buildSidebarMessages(
  chatMessages: MatchChatMessageEntry[] | undefined,
  statusMessage: string | null | undefined,
): SidebarMessageItem[] {
  const mappedChat = Array.isArray(chatMessages)
    ? chatMessages
        .map((message, index) => ({
          id: String(`chat-${index}-${message?.createdAt || ""}`),
          senderId: String(message?.senderId || ""),
          senderUsername: String(message?.senderUsername || "Player"),
          content: String(message?.content || "").trim(),
          createdAt: String(message?.createdAt || ""),
          isSystem: message?.isSystem === true,
        }))
        .filter((message) => !shouldHideSidebarMessage(message.content))
    : [];

  const safeStatus = String(statusMessage || "").trim();
  if (!safeStatus || shouldHideSidebarMessage(safeStatus)) {
    return mappedChat;
  }

  const alreadyExists = mappedChat.some(
    (message) =>
      message.isSystem === true &&
      String(message.content || "").trim() === safeStatus,
  );
  if (alreadyExists) {
    return mappedChat;
  }

  return [
    ...mappedChat,
    {
      id: `status-${safeStatus}`,
      senderId: "system",
      senderUsername: "System",
      content: safeStatus,
      createdAt: "",
      isSystem: true,
    },
  ];
}

export function QuickMatchGameView({
  game,
  lastMove,
  moves,
  gameSettings,
  gameStarted,
  gameOver,
  gameResult,
  isPlayerTurn,
  playerColor,
  activeGameId = null,
  savedGameId,
  historyPersistenceStatus,
  showGameOverModal,
  optionSquares,
  preMoveSquares,
  playerRating,
  opponentRating,
  statusMessage,
  chatMessages,
  gameOverElo,
  onSquareClick,
  onPieceDrop,
  onCancelSelection,
  isDraggablePiece,
  setOpponentTime,
  setPlayerTime,
  playerClockSeed,
  opponentClockSeed,
  clockResetToken,
  isClockPaused = false,
  onTimeOut,
  onResign,
  onOfferDraw,
  onRespondDrawOffer,
  onSendChatMessage,
  drawOfferState = { status: "idle", offeredBy: null, expiresAt: null },
  onRematch,
  onNewGame,
  onLeave,
  tournamentMode = false,
  opponentName,
  variant = "standard",
  threeCheckState,
  promotionState,
  onPromotionPieceSelect,
  tournamentPanelData = null,
  activeTournamentGameId = null,
  onTournamentAction,
  boardFenOverride,
  boardOrientationOverride,
  topPlayerNameOverride,
  topPlayerRatingOverride,
  bottomPlayerNameOverride,
  bottomPlayerRatingOverride,
  sidebarTitleOverride,
  sidebarHeaderRightOverride,
  customActionsOverride,
  activeMovePly,
  moveLogFooterMessage,
  hideQuickMatchTitleSuffix = false,
}: QuickMatchGameViewProps) {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [selectedPly, setSelectedPly] = useState<number | null>(null);
  const [tournamentTab, setTournamentTab] = useState<
    "standings" | "games" | "moves"
  >(tournamentMode ? "standings" : "games");
  const displayMoves = moves;
  const latestPly = moves.length;
  const moveNumberOffset = Math.floor((moves.length - displayMoves.length) / 2);
  const moveRows = useMemo(
    () =>
      buildChessMoveRows(displayMoves, {
        startMoveNumber: moveNumberOffset + 1,
        startPly: moveNumberOffset * 2 + 1,
      }),
    [displayMoves, moveNumberOffset],
  );
  const externalBoardFenProvided =
    typeof boardFenOverride === "string" && boardFenOverride.trim().length > 0;
  const isExternallyControlled =
    externalBoardFenProvided || typeof activeMovePly === "number";
  const canShowOpening = variant !== "chess960";
  const { opening, isLoading: openingLoading } = useOpeningExplorer(
    canShowOpening ? moves : [],
    { enableRemote: true },
  );
  const openingDisplayLabel = useMemo(() => {
    if (!canShowOpening) return "";
    if (moves.length === 0) return "Starting Position";
    const formatted = formatOpeningLabel(opening);
    if (formatted) return formatted;
    return openingLoading ? "Detecting opening..." : "";
  }, [canShowOpening, moves.length, opening, openingLoading]);
  const fenByPly = useMemo(() => buildFenByPly(moves), [moves]);
  const resolvedActivePly = isExternallyControlled
    ? activeMovePly ?? null
    : selectedPly ?? (latestPly > 0 ? latestPly : null);
  const isReviewingPastMove =
    !isExternallyControlled &&
    selectedPly !== null &&
    selectedPly >= 0 &&
    selectedPly < latestPly;
  const reviewFen = isReviewingPastMove
    ? fenByPly.get(selectedPly) || game.fen()
    : null;
  const handleSelectPly = isExternallyControlled
    ? undefined
    : (ply: number) => {
        if (!Number.isFinite(ply)) return;
        const boundedPly = Math.max(1, Math.min(Math.floor(ply), latestPly));
        if (boundedPly >= latestPly) {
          setSelectedPly(null);
          return;
        }
        setSelectedPly(boundedPly);
      };
  const isThreeCheck = variant === "threeCheck";
  const whiteCheckCount = Number(threeCheckState?.whiteCheckCount || 0);
  const blackCheckCount = Number(threeCheckState?.blackCheckCount || 0);
  const playerCheckedCount = playerColor === "w" ? whiteCheckCount : blackCheckCount;
  const opponentCheckedCount =
    playerColor === "w" ? blackCheckCount : whiteCheckCount;
  const opponentDisplayName = isThreeCheck
    ? `${opponentName || "Opponent"} (Checks ${opponentCheckedCount}/3)`
    : opponentName || "Opponent";
  const playerDisplayName = isThreeCheck
    ? `${user?.fullName || "You"} (Checks ${playerCheckedCount}/3)`
    : user?.fullName || "You";
  const opponentNameForInfo = String(topPlayerNameOverride || opponentDisplayName);
  const playerNameForInfo = String(bottomPlayerNameOverride || playerDisplayName);
  const opponentRatingForInfo =
    topPlayerRatingOverride !== undefined ? topPlayerRatingOverride : opponentRating;
  const playerRatingForInfo =
    bottomPlayerRatingOverride !== undefined ? bottomPlayerRatingOverride : playerRating;
  const boardFen = externalBoardFenProvided
    ? boardFenOverride
    : reviewFen || game.fen();
  const boardOrientation = boardOrientationOverride || gameSettings.playAs;
  const sidebarTitle = sidebarTitleOverride ? sidebarTitleOverride : "";
  const persistentSquareStyles =
    variant === "kingOfHill" ? KING_OF_HILL_SQUARE_STYLES : {};
  const [boardWidth, setBoardWidth] = useState(620);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const leftRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const opponentColor = playerColor === "w" ? "b" : "w";
  const whiteHasMoved = moves.length >= 1;
  const blackHasMoved = moves.length >= 2;
  const colorHasMoved = (color: "w" | "b") =>
    color === "w" ? whiteHasMoved : blackHasMoved;
  const playerTimerAllowed = !tournamentMode || colorHasMoved(playerColor);
  const opponentTimerAllowed = !tournamentMode || colorHasMoved(opponentColor);
  const tournamentStandings = tournamentPanelData?.standings || [];
  const tournamentHistory = tournamentPanelData?.history || [];
  const sidebarMessages = useMemo(
    () => buildSidebarMessages(chatMessages, statusMessage),
    [chatMessages, statusMessage],
  );
  const tournamentGameAction = tournamentPanelData?.gameAction || null;
  const tournamentType = String(tournamentPanelData?.tournament?.type || "").toLowerCase();
  const isArenaTournament = tournamentType === "arena";
  const tournamentStatus = String(tournamentPanelData?.tournament?.status || "").toUpperCase();
  const isTournamentFinished = tournamentStatus === "FINISHED";
  const tournamentIdForModal = String(tournamentPanelData?.tournament?.id || "");
  const [countdownNowMs, setCountdownNowMs] = useState(() => Date.now());
  const rawTournamentActionLabel = String(
    tournamentGameAction?.label || "Waiting for pairing",
  ).trim();
  const tournamentActionLabel =
    /^ready for next game$/i.test(rawTournamentActionLabel)
      ? "Ready"
      : /^(waiting for next pairing|waiting for pairing)$/i.test(
            rawTournamentActionLabel,
          )
        ? "Waiting for pairing"
        : rawTournamentActionLabel;
  const isJoinedAction = /^joined$/i.test(tournamentActionLabel.trim());
  const joinedCountdownStartAt =
    tournamentPanelData?.tournament?.scheduledStartAt ??
    tournamentPanelData?.tournament?.startedAt ??
    null;
  const joinedCountdownLabel = getJoinedCountdownLabel(
    joinedCountdownStartAt,
    countdownNowMs,
  );
  const tournamentActionDisplayLabel =
    isJoinedAction && joinedCountdownLabel
      ? `${tournamentActionLabel} (${joinedCountdownLabel})`
      : tournamentActionLabel;
  const arenaClockLabel = getArenaClockLabel(
    tournamentPanelData?.tournament,
    countdownNowMs,
  );

  useEffect(() => {
    if (latestPly === 0) {
      setSelectedPly(null);
      return;
    }
    if (selectedPly !== null && selectedPly > latestPly) {
      setSelectedPly(latestPly);
    }
  }, [latestPly, selectedPly]);
  const viewerUserId = String(user?.id || "");
  const viewerStanding =
    tournamentStandings.find((row) => String(row.userId || "") === viewerUserId) ||
    null;
  const activeTournamentHistoryRow =
    tournamentHistory.find((row) => row.gameId === activeTournamentGameId) || null;
  const tournamentResultTitle = getTournamentResultTitle(gameResult);
  const viewerOutcome = getViewerOutcome(activeTournamentHistoryRow, viewerUserId);
  const viewerOutcomeLabel =
    viewerOutcome === "win"
      ? "Win"
      : viewerOutcome === "draw"
        ? "Draw"
        : viewerOutcome === "loss"
          ? "Loss"
          : null;
  const winnerLabel = getWinnerLabel(activeTournamentHistoryRow);
  const filteredTournamentStatusMessage = sanitizeTournamentStatusMessage(statusMessage);
  const [showTournamentResultModal, setShowTournamentResultModal] = useState(false);
  const shownTournamentResultGameRef = useRef("");
  const [showArenaOverModal, setShowArenaOverModal] = useState(false);
  const shownArenaOverTournamentRef = useRef("");
  const arenaTopStandings = [...tournamentStandings]
    .sort((a, b) => Number(a.rank || 9999) - Number(b.rank || 9999))
    .slice(0, 3);
  const arenaFormatLabel = getArenaFormatLabel(tournamentPanelData?.tournament);
  const canUseTournamentGameAction =
    !!tournamentGameAction && !tournamentGameAction.disabled;
  const showActiveTournamentControls =
    tournamentMode && gameStarted && !gameOver;
  const hasIncomingDrawOffer =
    drawOfferState.status === "received" && drawOfferState.offeredBy !== playerColor;
  const drawOfferPending =
    drawOfferState.status === "sent" ||
    (drawOfferState.status === "received" && drawOfferState.offeredBy === playerColor);
  const canUseFocusMode = !tournamentMode && !customActionsOverride;
  const focusPlayerPanelWidth = Math.min(
    240,
    Math.max(200, Math.floor(boardWidth * 0.38)),
  );
  const drawOfferMessageCard = useMemo(() => {
    if (!hasIncomingDrawOffer || !gameStarted || gameOver) return null;

    return (
      <div className="mx-auto mt-2 w-full max-w-sm rounded-2xl border border-brand-400/35 bg-slate-950/95 p-4 text-white shadow-[0_18px_55px_rgba(0,0,0,0.45)]">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-200">
            <Handshake size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Draw offered</div>
            <p className="mt-1 text-xs text-slate-300">
              Your opponent offered a draw.
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onRespondDrawOffer?.(true)}
            disabled={!onRespondDrawOffer}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 text-sm font-semibold text-white transition-colors hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Check size={15} />
            Accept
          </button>
          <button
            type="button"
            onClick={() => onRespondDrawOffer?.(false)}
            disabled={!onRespondDrawOffer}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] text-sm font-semibold text-slate-100 transition-colors hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X size={15} />
            Decline
          </button>
        </div>
      </div>
    );
  }, [gameOver, gameStarted, hasIncomingDrawOffer, onRespondDrawOffer]);

  const handleTournamentGameAction = () => {
    if (!tournamentGameAction || tournamentGameAction.disabled) return;
    if (onTournamentAction) {
      onTournamentAction(tournamentGameAction);
      return;
    }
    const nextGameId = String(tournamentGameAction.gameId || "").trim();
    if (!nextGameId) return;
    onLeave?.();
    navigate(`/play/quick?tournamentGameId=${encodeURIComponent(nextGameId)}`, {
      state: { tournamentGameId: nextGameId, autoStart: true },
    });
  };

  const handleTournamentAnalyze = () => {
    if (!savedGameId) return;
    const analyzeBasePath = variant === "chess960" ? "/analyze960" : "/analyze";
    openAnalyzeWindow(`${analyzeBasePath}/${savedGameId}`);
    setShowTournamentResultModal(false);
  };

  const handleTournamentHistoryAnalyze = (row: TournamentPanelHistoryRow) => {
    const targetGameId = String(row.savedGameId || row.gameId || "").trim();
    if (!targetGameId) return;
    const analyzeBasePath = variant === "chess960" ? "/analyze960" : "/analyze";
    openAnalyzeWindow(`${analyzeBasePath}/${targetGameId}`);
  };

  useEffect(() => {
    setTournamentTab(tournamentMode ? "standings" : "games");
  }, [tournamentMode, tournamentPanelData?.tournament?.id]);

  useEffect(() => {
    if (!tournamentMode) {
      setShowTournamentResultModal(false);
      return;
    }
    if (!gameOver) {
      setShowTournamentResultModal(false);
      return;
    }
    const resultGameKey = String(activeGameId || activeTournamentGameId || "");
    if (!resultGameKey || shownTournamentResultGameRef.current === resultGameKey) {
      return;
    }
    shownTournamentResultGameRef.current = resultGameKey;
    setShowTournamentResultModal(true);
  }, [activeGameId, activeTournamentGameId, gameOver, tournamentMode]);

  useEffect(() => {
    if (!tournamentMode || !isArenaTournament || !isTournamentFinished) {
      setShowArenaOverModal(false);
      return;
    }
    const tournamentKey = tournamentIdForModal || "arena";
    if (shownArenaOverTournamentRef.current === tournamentKey) return;
    shownArenaOverTournamentRef.current = tournamentKey;
    setShowArenaOverModal(true);
  }, [
    isArenaTournament,
    isTournamentFinished,
    tournamentIdForModal,
    tournamentMode,
  ]);

  useEffect(() => {
    if (!tournamentMode || !isTournamentFinished) return;
    setTournamentTab("standings");
  }, [isTournamentFinished, tournamentMode]);

  useEffect(() => {
    if (!tournamentMode || !isJoinedAction) return;
    if (!joinedCountdownStartAt) return;

    const startMs = new Date(joinedCountdownStartAt).getTime();
    if (!Number.isFinite(startMs)) return;
    if (startMs <= Date.now()) return;

    let timeoutId: number | null = null;
    const tick = () => {
      const now = Date.now();
      setCountdownNowMs(now);

      const remainingMs = startMs - now;
      if (remainingMs <= 0) return;

      const nextDelay =
        remainingMs < 60_000
          ? 1000
          : Math.max(
              1,
              remainingMs - Math.floor(remainingMs / 60_000) * 60_000 + 1,
            );

      timeoutId = window.setTimeout(tick, nextDelay);
    };

    tick();

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [isJoinedAction, joinedCountdownStartAt, tournamentMode]);

  useEffect(() => {
    const isArena =
      String(tournamentPanelData?.tournament?.type || "").toLowerCase() === "arena";
    if (!tournamentMode || !isArena) return undefined;

    const intervalId = window.setInterval(() => {
      setCountdownNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [tournamentMode, tournamentPanelData?.tournament?.type]);

  useEffect(() => {
    const container = leftRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const padding = 24;
      const topH = topRef.current?.offsetHeight ?? 60;
      const bottomH = bottomRef.current?.offsetHeight ?? 60;
      const focusLeftRail = isFocusMode ? 244 : 0;
      const focusRightRail = isFocusMode ? 88 : 0;
      const availableWidth =
        rect.width - padding - BOARD_FRAME - focusLeftRail - focusRightRail;
      const availableHeight = isFocusMode
        ? rect.height - padding
        : rect.height - topH - bottomH - padding;
      const size = Math.floor(Math.min(availableWidth, availableHeight));
      const maxBoardWidth = isFocusMode ? 840 : 720;
      setBoardWidth(Math.max(400, Math.min(size, maxBoardWidth)));
    };

    updateSize();
    const observer = new ResizeObserver(() => updateSize());
    observer.observe(container);
    window.addEventListener("resize", updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, [isFocusMode]);

  useEffect(() => {
    if (canUseFocusMode) return;
    setIsFocusMode(false);
  }, [canUseFocusMode]);

  return (
    <div
      className={`quickmatch-game-root relative h-screen w-full bg-transparent overflow-hidden ${
        isFocusMode ? "focus-mode" : ""
      }`}
    >
      <div className="quickmatch-game-layout relative h-full w-full grid grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] overflow-hidden">
        {!tournamentMode && (
          <GameOverModal
            isOpen={showGameOverModal}
            result={gameResult}
            onTryAgain={onRematch}
            onNewGame={onNewGame}
            savedGameId={savedGameId}
            historyStatus={historyPersistenceStatus}
            opponentName={opponentName || "Opponent"}
            playerColor={playerColor}
            elo={gameOverElo}
            analyzeBasePath={variant === "chess960" ? "/analyze960" : "/analyze"}
          />
        )}

        {/* Main Board Area */}
        <div
          ref={leftRef}
          className="quickmatch-main-board min-w-0 flex flex-col items-center justify-center p-4 gap-4 h-full overflow-hidden"
        >
          {/* Opponent Info */}
          <div
            ref={topRef}
            className="quickmatch-opponent-panel quickmatch-panel-edge-offset-top flex-shrink-0 z-10 transition-[width] duration-300 ease-out"
            style={{
              width: isFocusMode
                ? focusPlayerPanelWidth
                : boardWidth,
            }}
          >
            <PlayerInfo
              name={opponentNameForInfo}
              subtitle=""
              rating={isFocusMode ? null : opponentRatingForInfo}
              avatarLetter={
                opponentNameForInfo.substring(0, 1).toUpperCase() || "O"
              }
              avatarStyle="opponent"
              initialTime={Number.isFinite(opponentClockSeed) ? Number(opponentClockSeed) : gameSettings.timeControl.initial}
              increment={gameSettings.timeControl.increment}
              isTimerActive={
                gameStarted &&
                !isPlayerTurn &&
                !gameOver &&
                gameSettings.timeControl.initial > 0 &&
                opponentTimerAllowed &&
                !isClockPaused
              }
              onTimeOut={() => onTimeOut(false)}
              onTimeChange={() => {}}
              timerResetToken={`opp:${clockResetToken ?? 0}`}
              timerManagedExternally
              compactTimer={gameSettings.timeControl.initial > 0}
              layout={isFocusMode ? "focus" : "default"}
              showConnectionDots={isFocusMode}
            />
          </div>

          {/* Chessboard */}
          <div
            className="quickmatch-board-wrap relative flex-shrink-0 transition-[width] duration-300 ease-out"
            style={{ width: boardWidth }}
          >
            {canUseFocusMode ? (
              <button
                type="button"
                onClick={() => setIsFocusMode((prev) => !prev)}
                className={`quickmatch-focus-toggle absolute -right-9 top-1 z-30 inline-flex h-8 w-8 items-center justify-center rounded-lg border text-white shadow-lg transition-colors ${
                  isFocusMode
                    ? "border-brand-300/65 bg-brand-500/55"
                    : "border-white/20 bg-slate-900/35 hover:bg-slate-800/50"
                }`}
                aria-label={isFocusMode ? "Exit focus mode" : "Enter focus mode"}
                title={isFocusMode ? "Exit focus mode" : "Focus mode"}
              >
                {isFocusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            ) : null}
            <GameBoard
              fen={boardFen}
              boardWidth={boardWidth}
              boardOrientation={boardOrientation}
              onSquareClick={isReviewingPastMove ? () => {} : onSquareClick}
              onPieceDrop={isReviewingPastMove ? () => false : onPieceDrop}
              onCancelSelection={isReviewingPastMove ? () => {} : onCancelSelection}
              isDraggablePiece={
                isReviewingPastMove ? () => false : isDraggablePiece
              }
              persistentSquareStyles={persistentSquareStyles}
              customSquareStyles={
                { ...optionSquares, ...preMoveSquares } as Record<
                  string,
                  { background: string; borderRadius?: string }
                >
              }
              lastMove={lastMove}
              promotionState={promotionState}
              onPromotionPieceSelect={onPromotionPieceSelect}
            />
          </div>

          {/* Player Info */}
          <div
            ref={bottomRef}
            className="quickmatch-player-panel quickmatch-panel-edge-offset-bottom flex-shrink-0 z-10 transition-[width] duration-300 ease-out"
            style={{
              width: isFocusMode
                ? focusPlayerPanelWidth
                : boardWidth,
            }}
          >
            <PlayerInfo
              name={playerNameForInfo}
              subtitle=""
              rating={isFocusMode ? null : playerRatingForInfo}
              avatarLetter={
                playerNameForInfo.substring(0, 2).toUpperCase() || "U"
              }
              avatarImage={user?.avatar}
              avatarStyle="player"
              initialTime={Number.isFinite(playerClockSeed) ? Number(playerClockSeed) : gameSettings.timeControl.initial}
              increment={gameSettings.timeControl.increment}
              isTimerActive={
                gameStarted &&
                isPlayerTurn &&
                !gameOver &&
                gameSettings.timeControl.initial > 0 &&
                playerTimerAllowed &&
                !isClockPaused
              }
              onTimeOut={() => onTimeOut(true)}
              onTimeChange={() => {}}
              timerResetToken={`self:${clockResetToken ?? 0}`}
              timerManagedExternally
              compactTimer={gameSettings.timeControl.initial > 0}
              layout={isFocusMode ? "focus" : "default"}
              showConnectionDots={isFocusMode}
            />
          </div>

          {canUseFocusMode ? (
            <div className="quickmatch-focus-actions">
              {hasIncomingDrawOffer ? (
                <div
                  className="quickmatch-focus-draw-offer w-[220px] rounded-xl border border-cyan-300/45 bg-[#0b1f2e]/95 p-2.5 text-white shadow-[0_16px_46px_rgba(8,145,178,0.35)]"
                  role="alert"
                  aria-live="assertive"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-300 shadow-[0_0_0_3px_rgba(103,232,249,0.24)]" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold leading-tight text-cyan-100">
                        Draw offer received
                      </p>
                      <p className="mt-0.5 text-[10px] leading-tight text-cyan-100/75">
                        Accept or decline now.
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onRespondDrawOffer?.(true)}
                      disabled={!onRespondDrawOffer}
                      className="inline-flex h-8 items-center justify-center gap-1 rounded-md bg-emerald-600 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      <Check size={12} />
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => onRespondDrawOffer?.(false)}
                      disabled={!onRespondDrawOffer}
                      className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-white/20 bg-white/10 text-[11px] font-semibold text-slate-100 transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      <X size={12} />
                      Decline
                    </button>
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                onClick={onOfferDraw}
                disabled={gameOver || drawOfferPending || hasIncomingDrawOffer}
                className={`quickmatch-focus-action-button ${
                  hasIncomingDrawOffer ? "quickmatch-focus-action-alert" : ""
                }`}
                title={
                  drawOfferPending
                    ? "Draw offer pending"
                    : hasIncomingDrawOffer
                      ? "Draw offer received"
                      : "Offer draw"
                }
                aria-label="Offer draw"
              >
                {hasIncomingDrawOffer ? (
                  <span className="quickmatch-focus-action-alert-dot" aria-hidden="true" />
                ) : null}
                <span className="text-[1.45rem] font-semibold leading-none">1/2</span>
              </button>
              <ResignConfirmButton
                type="button"
                onConfirm={onResign}
                disabled={gameOver}
                className="quickmatch-focus-action-button quickmatch-focus-action-danger"
                title="Resign"
                aria-label="Resign game"
              >
                <Flag size={18} />
              </ResignConfirmButton>
            </div>
          ) : null}
        </div>

        {/* Sidebar */}
        <div className="quickmatch-sidebar min-w-0 w-full lg:flex-1 lg:self-stretch min-h-0 flex flex-col p-3">
          <div className="theme-glass-panel-strong flex-1 flex flex-col overflow-hidden rounded-3xl">
            {/* Header */}
            {tournamentMode || sidebarTitle || sidebarHeaderRightOverride ? (
              <div className="p-4 border-b border-theme-glass">
                {tournamentMode ? (
                  <div className="rounded-xl border border-cyan-500/20 bg-[#081a33]/95 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-cyan-300/25 bg-cyan-400/15 text-cyan-100">
                          <Zap className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <h2 className="truncate text-base font-semibold text-slate-100">
                            {tournamentPanelData?.tournament?.name || "Arena Tournament"}
                          </h2>
                          <p className="truncate text-xs text-cyan-100/75">
                            Standard - {tournamentStandings.length} players
                          </p>
                          <p className="truncate text-xs text-cyan-100/65">
                            Pairing: Rating-based
                          </p>
                        </div>
                      </div>
                      {arenaClockLabel ? (
                        <div className="rounded-md border border-cyan-200/20 bg-cyan-200/10 px-3 py-2 text-lg font-semibold tracking-wide text-cyan-100">
                          {arenaClockLabel}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                      {sidebarTitle}
                    </h2>
                    {sidebarHeaderRightOverride ? (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {sidebarHeaderRightOverride}
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}

            {tournamentMode && (
              <div className="theme-glass-panel-soft mx-4 mt-3 flex items-center gap-2 rounded-xl p-1">
                <button
                  onClick={() => setTournamentTab("standings")}
                  className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    tournamentTab === "standings"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "text-gray-600 hover:bg-gray-200/70 dark:text-gray-300 dark:hover:bg-slate-700/60"
                  }`}
                >
                  Standings
                </button>
                <button
                  onClick={() => setTournamentTab("games")}
                  className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    tournamentTab === "games"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "text-gray-600 hover:bg-gray-200/70 dark:text-gray-300 dark:hover:bg-slate-700/60"
                  }`}
                >
                  Games
                </button>
                <button
                  onClick={() => setTournamentTab("moves")}
                  className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    tournamentTab === "moves"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "text-gray-600 hover:bg-gray-200/70 dark:text-gray-300 dark:hover:bg-slate-700/60"
                  }`}
                >
                  Moves
                </button>
              </div>
            )}

            {filteredTournamentStatusMessage && (
              <div className="px-4 pt-2 text-xs text-gray-500 dark:text-gray-400">
                {filteredTournamentStatusMessage}
              </div>
            )}

            {/* Content */}
            <div className="theme-glass-panel-soft flex-1 mb-3 rounded-xl overflow-hidden">
              {!tournamentMode && (
                <MoveListTabs
                  movesContent={
                    <div className="space-y-2">
                      {openingDisplayLabel ? (
                        <div className="px-2 text-xs text-gray-500 dark:text-gray-400">
                          {openingDisplayLabel}
                        </div>
                      ) : null}
                      <ChessMoveList
                        rows={moveRows}
                        activePly={resolvedActivePly}
                        onSelectPly={handleSelectPly}
                        emptyMessage="No moves yet"
                        moveCellClassName="rounded px-2 py-1 transition-colors"
                        activeMoveClassName="bg-[#00e5a0]/20 text-[#00e5a0] font-semibold"
                        inactiveMoveClassName="text-gray-800 dark:text-gray-200"
                        footer={
                          moveLogFooterMessage ? (
                            <div className="mt-3 pt-3 border-t border-gray-200/70 dark:border-white/10 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
                              {moveLogFooterMessage}
                            </div>
                          ) : null
                        }
                      />
                    </div>
                  }
                  messages={sidebarMessages}
                  currentUserId={String(user?.id || "")}
                  messagesTopContent={drawOfferMessageCard}
                  focusMessagesOnTopContent={!!drawOfferMessageCard}
                  onSendMessage={onSendChatMessage}
                  disableMessageInput={gameOver}
                  hideMessageInput={!gameStarted}
                />
              )}

              {tournamentMode && tournamentTab === "standings" && (
                <div className="h-full overflow-auto p-2">
                  {isTournamentFinished ? (
                    <div className="mb-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200">
                      Final Standings
                    </div>
                  ) : null}
                  {tournamentStandings.length === 0 ? (
                    <div className="text-center text-gray-400 dark:text-gray-500 text-xs py-6">
                      Standings are loading...
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {tournamentStandings.map((row) => (
                        <div
                          key={row.userId || `${row.rank}-${row.username}`}
                          className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
                            Number(row.rank) === 1
                              ? "border-amber-500/30 bg-amber-500/5"
                              : "border-gray-200/70 bg-white/50 dark:border-white/10 dark:bg-slate-900/60"
                          }`}
                        >
                          <div
                            className={`w-8 text-right text-xs font-semibold ${
                              Number(row.rank) === 1
                                ? "text-amber-400"
                                : Number(row.rank) === 2
                                  ? "text-slate-300"
                                  : Number(row.rank) === 3
                                    ? "text-orange-400"
                                    : "text-gray-500 dark:text-gray-400"
                            }`}
                          >
                            #{row.rank}
                          </div>
                          <div className="h-7 w-7 overflow-hidden rounded-full border border-emerald-400/25 bg-emerald-500/10 flex items-center justify-center text-[11px] font-semibold text-emerald-300">
                            {row.avatar ? (
                              <img
                                src={row.avatar}
                                alt={row.username}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              getInitials(row.username)
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-medium text-gray-900 dark:text-gray-100">
                              {row.username}
                            </div>
                            <div className="text-[11px] text-gray-500 dark:text-gray-400">
                              ELO {row.elo}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                              {row.points}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tournamentMode && tournamentTab === "games" && (
                <div className="h-full overflow-auto p-2">
                  {tournamentHistory.length === 0 ? (
                    <div className="text-center text-gray-400 dark:text-gray-500 text-xs py-6">
                      No games yet.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {tournamentHistory.map((row) => (
                        <div
                          key={row.id}
                          className={`rounded-lg border px-2.5 py-2 ${
                            activeTournamentGameId &&
                            row.gameId === activeTournamentGameId
                              ? "border-emerald-500/40 bg-emerald-500/10"
                              : "border-gray-200/70 bg-white/50 dark:border-white/10 dark:bg-slate-900/60"
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
                            <span>
                              Round {row.roundNumber} - Board {row.board}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 font-semibold ${
                                row.status === "completed"
                                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                  : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                              }`}
                            >
                              {row.status === "completed" ? "Done" : "Live"}
                            </span>
                          </div>
                          <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
                            <div className="min-w-0 flex-1 truncate text-gray-900 dark:text-gray-100">
                              {row.white}
                            </div>
                            <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                              {row.result}
                            </div>
                            <div className="min-w-0 flex-1 truncate text-right text-gray-900 dark:text-gray-100">
                              {row.black}
                            </div>
                          </div>
                          {row.status === "completed" && !row.isBye ? (
                            <div className="mt-2 flex justify-end">
                              <button
                                type="button"
                                onClick={() => handleTournamentHistoryAnalyze(row)}
                                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-brand-400/35 bg-brand-500/10 px-2.5 text-[11px] font-semibold text-brand-700 transition-colors hover:bg-brand-500/20 dark:text-brand-200"
                              >
                                <BarChart3 size={13} />
                                Analyze
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tournamentMode && tournamentTab === "moves" && (
                <div className="h-full overflow-auto p-2">
                  <div className="space-y-2">
                    {openingDisplayLabel ? (
                      <div className="px-2 text-xs text-gray-500 dark:text-gray-400">
                        {openingDisplayLabel}
                      </div>
                    ) : null}
                    <ChessMoveList
                      rows={moveRows}
                      activePly={resolvedActivePly}
                      onSelectPly={handleSelectPly}
                      emptyMessage="No moves yet"
                      moveCellClassName="rounded px-2 py-1 transition-colors"
                      activeMoveClassName="bg-[#00e5a0]/20 text-[#00e5a0] font-semibold"
                      inactiveMoveClassName="text-gray-800 dark:text-gray-200"
                      footer={
                        moveLogFooterMessage ? (
                          <div className="mt-3 pt-3 border-t border-gray-200/70 dark:border-white/10 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
                            {moveLogFooterMessage}
                          </div>
                        ) : null
                      }
                    />
                  </div>
                </div>
              )}

            </div>

            {/* Actions */}
            <div className="p-4 pb-6 border-t border-theme-glass flex flex-col gap-2">
              {customActionsOverride ? (
                customActionsOverride
              ) : tournamentMode ? (
                <>
                  {showActiveTournamentControls ? (
                    hasIncomingDrawOffer ? (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => onRespondDrawOffer?.(true)}
                          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 text-sm font-semibold text-white transition-colors hover:bg-emerald-400"
                        >
                          <Check size={16} />
                          Accept Draw
                        </button>
                        <button
                          type="button"
                          onClick={() => onRespondDrawOffer?.(false)}
                          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-white/10 text-sm font-semibold text-gray-800 transition-colors hover:bg-white/15 dark:text-gray-100"
                        >
                          <X size={16} />
                          Decline
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <ResignConfirmButton
                          type="button"
                          onConfirm={onResign}
                          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-red-500/10 text-sm font-semibold text-red-600 transition-colors hover:bg-red-500/20 dark:text-red-300"
                        >
                          <Flag size={16} />
                          Resign
                        </ResignConfirmButton>
                        <button
                          type="button"
                          onClick={onOfferDraw}
                          disabled={drawOfferPending}
                          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-white/10 text-sm font-semibold text-gray-800 transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-100"
                          title={
                            drawOfferPending
                              ? "Draw offer pending"
                              : "Offer draw"
                          }
                        >
                          <Handshake size={16} />
                          {drawOfferPending ? "Offered" : "Offer Draw"}
                        </button>
                      </div>
                    )
                  ) : null}
                  {!showActiveTournamentControls ? (
                    <button
                      type="button"
                      onClick={handleTournamentGameAction}
                      disabled={!canUseTournamentGameAction}
                      className={`w-full py-3 rounded-xl font-semibold transition-colors ${
                        canUseTournamentGameAction
                          ? "bg-emerald-500 hover:bg-emerald-400 text-white"
                          : "bg-gray-300/70 text-gray-500 dark:bg-gray-700 dark:text-gray-300 cursor-not-allowed"
                      }`}
                    >
                      {tournamentActionDisplayLabel}
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <ResignConfirmButton
                      type="button"
                      onConfirm={onResign}
                      disabled={gameOver}
                      className="flex h-11 items-center justify-center gap-2 rounded-xl bg-red-500/10 text-sm font-semibold text-red-600 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400"
                    >
                      <Flag size={16} />
                      Resign
                    </ResignConfirmButton>
                    <button
                      type="button"
                      onClick={onOfferDraw}
                      disabled={
                        gameOver ||
                        drawOfferPending ||
                        hasIncomingDrawOffer ||
                        !onOfferDraw
                      }
                      className="flex h-11 items-center justify-center gap-2 rounded-xl bg-white/10 text-sm font-semibold text-gray-800 transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-100"
                      title={
                        drawOfferPending
                          ? "Draw offer pending"
                          : hasIncomingDrawOffer
                            ? "Draw offer received"
                            : "Offer draw"
                      }
                    >
                      <Handshake size={16} />
                      {drawOfferPending ? "Offered" : "Offer Draw"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      {tournamentMode && showTournamentResultModal && (
        <div className="pointer-events-none absolute inset-0 z-[85] flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="pointer-events-auto w-full max-w-[560px] rounded-2xl border border-cyan-400/35 bg-[#031829]/95 p-5 shadow-[0_24px_70px_rgba(3,10,26,0.75)]">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-[28px] font-semibold leading-tight text-cyan-50">
                {tournamentResultTitle}
              </h3>
              <button
                type="button"
                onClick={() => setShowTournamentResultModal(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-cyan-200/20 bg-cyan-200/10 text-cyan-100 transition-colors hover:bg-cyan-200/20"
                aria-label="Close result dialog"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-cyan-100/75">
              {winnerLabel ? <span>Winner: {winnerLabel}</span> : null}
              {viewerOutcomeLabel ? <span>Result: {viewerOutcomeLabel}</span> : null}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleTournamentAnalyze}
                disabled={!savedGameId}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <BarChart3 size={16} />
                Analyze
              </button>
            </div>
          </div>
        </div>
      )}
      {tournamentMode && showArenaOverModal && (
        <div className="pointer-events-none absolute inset-0 z-[95] flex items-center justify-center bg-black/55 px-4 py-6">
          <div className="pointer-events-auto w-full max-w-[430px] overflow-hidden rounded-2xl border border-brand-400/30 bg-slate-950/95 text-white shadow-[0_28px_80px_rgba(0,0,0,0.65)]">
            <div className="relative border-b border-brand-400/20 bg-brand-500/10 px-6 pb-9 pt-7 text-center">
              <button
                type="button"
                onClick={() => setShowArenaOverModal(false)}
                className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-white/55 transition hover:bg-white/10 hover:text-white"
                aria-label="Close arena results"
              >
                <X size={18} />
              </button>
              <h3 className="text-2xl font-semibold leading-tight">Arena Over</h3>
              <p className="mt-1 text-sm text-white/80">
                {tournamentPanelData?.tournament?.name || "Tournament"}
              </p>
              {arenaFormatLabel ? (
                <p className="mt-0.5 text-xs text-white/55">{arenaFormatLabel}</p>
              ) : null}
            </div>

            <div className="space-y-4 px-6 py-5">
              {arenaTopStandings.map((row, index) => (
                <div key={row.userId || row.username} className="flex items-center gap-3">
                  <div
                    className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 text-2xl font-black shadow-lg ${
                      ARENA_MEDAL_CLASSES[index] || ARENA_MEDAL_CLASSES[2]
                    }`}
                  >
                    {index + 1}
                  </div>
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border-2 border-emerald-400/70 bg-slate-700">
                    {row.avatar ? (
                      <img
                        src={row.avatar}
                        alt={row.username}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-base font-semibold text-white/80">
                        {getInitials(row.username)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white">
                      {row.username}
                    </div>
                    <div className="mt-0.5 flex items-baseline gap-1">
                      <span className="text-2xl font-black">
                        {formatArenaModalScore(row.points)}
                      </span>
                      <span className="text-sm font-semibold text-white/55">
                        / {Number(row.games || row.gamesPlayed || 0)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {viewerStanding ? (
              <div className="flex items-center gap-3 border-t border-brand-400/20 bg-brand-500/10 px-4 py-3">
                <div className="w-12 shrink-0 text-right text-sm font-semibold text-white/70">
                  {viewerStanding.rank}
                </div>
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-slate-700">
                  {viewerStanding.avatar || user?.avatar ? (
                    <img
                      src={viewerStanding.avatar || user?.avatar}
                      alt={viewerStanding.username}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs font-semibold">
                      {getInitials(viewerStanding.username)}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {viewerStanding.username}
                  </div>
                  <div className="text-xs text-white/55">({viewerStanding.elo})</div>
                </div>
                <div className="text-lg font-black">
                  {formatArenaModalScore(viewerStanding.points)}
                </div>
                <div className="text-sm font-semibold text-white/60">
                  / {Number(viewerStanding.games || viewerStanding.gamesPlayed || 0)}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

