import { useEffect, useMemo, useRef, useState } from "react";
import { Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Square } from "chess.js";
import { useAuthStore } from "../../store/authStore";
import {
  GameOverModal,
  PlayerInfo,
  GameBoard,
  ChessMoveList,
  MoveListTabs,
  buildChessMoveRows,
} from "../../components/game";
import type { GameSettings, PromotionState } from "../../components/game";
import type { HistoryPersistenceStatus } from "../../hooks/gameHistorySaver/historyPersistence";
import { BOARD_FRAME } from "./types";
import type { CSSProperties } from "react";

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

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

function resolveAvatarUrl(avatar?: string) {
  if (!avatar) return "";
  if (
    avatar.startsWith("http://") ||
    avatar.startsWith("https://") ||
    avatar.startsWith("data:") ||
    avatar.startsWith("blob:")
  ) {
    return avatar;
  }
  return `${API_URL}${avatar.startsWith("/") ? "" : "/"}${avatar}`;
}

interface FriendGameViewProps {
  friendName: string;
  game: { fen: () => string };
  lastMove?: { from: string; to: string } | null;
  moves: string[];
  gameSettings: GameSettings;
  gameStarted: boolean;
  gameOver: boolean;
  gameResult: string | null;
  playerColor: "w" | "b";
  isPlayerTurn: boolean;
  savedGameId: string | null;
  historyPersistenceStatus: HistoryPersistenceStatus;
  showGameOverModal: boolean;
  optionSquares: Record<string, CSSProperties>;
  preMoveSquares: Record<string, CSSProperties>;
  playerRating?: number | null;
  opponentRating?: number | null;
  statusMessage?: string | null;
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
  clockResetToken?: string | number;
  isClockPaused?: boolean;
  onTimeOut: (isPlayer: boolean) => void;
  onResign: () => void;
  onTryAgain: () => void;
  onNewGame: () => void;
  onLeave?: () => void;
  variant?: MatchVariant;
  threeCheckState?: { whiteCheckCount: number; blackCheckCount: number };
  promotionState?: PromotionState;
  onPromotionPieceSelect?: (
    piece?: string,
    fromSquare?: Square,
    toSquare?: Square,
  ) => boolean;
}

export function FriendGameView({
  friendName,
  game,
  lastMove,
  moves,
  gameSettings,
  gameStarted,
  gameOver,
  gameResult,
  playerColor,
  isPlayerTurn,
  savedGameId,
  historyPersistenceStatus,
  showGameOverModal,
  optionSquares,
  preMoveSquares,
  playerRating,
  opponentRating,
  statusMessage,
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
  onTryAgain,
  onNewGame,
  onLeave,
  variant = "standard",
  threeCheckState,
  promotionState,
  onPromotionPieceSelect,
}: FriendGameViewProps) {
  const { user } = useAuthStore();
  const playerAvatarUrl = resolveAvatarUrl(user?.avatar);
  const navigate = useNavigate();
  const isThreeCheck = variant === "threeCheck";
  const whiteCheckCount = Number(threeCheckState?.whiteCheckCount || 0);
  const blackCheckCount = Number(threeCheckState?.blackCheckCount || 0);
  const playerCheckedCount = playerColor === "w" ? whiteCheckCount : blackCheckCount;
  const opponentCheckedCount =
    playerColor === "w" ? blackCheckCount : whiteCheckCount;
  const opponentDisplayName = isThreeCheck
    ? `${friendName} (Checks ${opponentCheckedCount}/3)`
    : friendName;
  const playerDisplayName = isThreeCheck
    ? `${user?.fullName || "You"} (Checks ${playerCheckedCount}/3)`
    : user?.fullName || "You";
  const displayMoves = moves.slice(-8);
  const moveNumberOffset = Math.floor((moves.length - displayMoves.length) / 2);
  const moveRows = useMemo(
    () =>
      buildChessMoveRows(displayMoves, {
        startMoveNumber: moveNumberOffset + 1,
        startPly: moveNumberOffset * 2 + 1,
      }),
    [displayMoves, moveNumberOffset],
  );
  const sidebarMessages = useMemo(() => {
    const safeStatus = String(statusMessage || "").trim();
    if (!safeStatus) return [];
    return [
      {
        id: `status-${safeStatus}`,
        sender: "System",
        content: safeStatus,
      },
    ];
  }, [statusMessage]);
  const persistentSquareStyles =
    variant === "kingOfHill" ? KING_OF_HILL_SQUARE_STYLES : {};
  const [boardWidth, setBoardWidth] = useState(620);
  const leftRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = leftRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const padding = 12;
      const topH = topRef.current?.offsetHeight ?? 60;
      const bottomH = bottomRef.current?.offsetHeight ?? 60;
      const gap = 8;
      const availableWidth = rect.width - padding - BOARD_FRAME;
      const availableHeight = rect.height - topH - bottomH - gap * 2 - padding;
      const size = Math.floor(Math.min(availableWidth, availableHeight));
      setBoardWidth(Math.max(320, Math.min(size, 720)));
    };

    updateSize();
    const observer = new ResizeObserver(() => updateSize());
    observer.observe(container);
    window.addEventListener("resize", updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  return (
    <div className="relative h-screen w-full bg-transparent overflow-hidden">
      <div className="relative h-full w-full grid grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] gap-2 p-2 overflow-hidden">
        <GameOverModal
          isOpen={showGameOverModal}
          result={gameResult}
          onTryAgain={onTryAgain}
          onNewGame={onNewGame}
          savedGameId={savedGameId}
          historyStatus={historyPersistenceStatus}
          opponentName={friendName}
          playerColor={playerColor}
          elo={gameOverElo}
          analyzeBasePath={variant === "chess960" ? "/analyze960" : "/analyze"}
        />

        {/* Main Board Area */}
        <div
          ref={leftRef}
          className="min-w-0 flex flex-col items-center justify-center gap-2 h-full overflow-hidden"
        >
          {/* Opponent Info */}
          <div
            ref={topRef}
            className="flex-shrink-0 z-10"
            style={{ width: boardWidth + BOARD_FRAME }}
          >
            <PlayerInfo
              name={opponentDisplayName}
              subtitle=""
              rating={opponentRating}
              avatarLetter={friendName.substring(0, 2).toUpperCase()}
              avatarStyle="opponent"
              initialTime={
                Number.isFinite(Number(opponentClockSeed))
                  ? Number(opponentClockSeed)
                  : gameSettings.timeControl.initial
              }
              increment={gameSettings.timeControl.increment}
              isTimerActive={
                gameStarted &&
                !isPlayerTurn &&
                !gameOver &&
                gameSettings.timeControl.initial > 0 &&
                !isClockPaused
              }
              onTimeOut={() => onTimeOut(false)}
              onTimeChange={() => {}}
              timerResetToken={`opp:${clockResetToken ?? 0}`}
              timerManagedExternally
            />
          </div>

          {/* Chessboard */}
          <div
            className="theme-board-panel rounded-2xl"
            style={{ width: boardWidth + BOARD_FRAME }}
          >
            <GameBoard
              fen={game.fen()}
              boardWidth={boardWidth}
              boardOrientation={gameSettings.playAs}
              onSquareClick={onSquareClick}
              onPieceDrop={onPieceDrop}
              onCancelSelection={onCancelSelection}
              isDraggablePiece={isDraggablePiece}
              persistentSquareStyles={persistentSquareStyles}
              customSquareStyles={
                { ...optionSquares, ...preMoveSquares } as unknown as Record<
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
            className="flex-shrink-0 z-10"
            style={{ width: boardWidth + BOARD_FRAME }}
          >
            <PlayerInfo
              name={playerDisplayName}
              subtitle=""
              rating={playerRating}
              avatarLetter={
                user?.fullName?.substring(0, 2).toUpperCase() || "U"
              }
              avatarImage={playerAvatarUrl}
              avatarStyle="player"
              initialTime={
                Number.isFinite(Number(playerClockSeed))
                  ? Number(playerClockSeed)
                  : gameSettings.timeControl.initial
              }
              increment={gameSettings.timeControl.increment}
              isTimerActive={
                gameStarted &&
                isPlayerTurn &&
                !gameOver &&
                gameSettings.timeControl.initial > 0 &&
                !isClockPaused
              }
              onTimeOut={() => onTimeOut(true)}
              onTimeChange={() => {}}
              timerResetToken={`self:${clockResetToken ?? 0}`}
              timerManagedExternally
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="min-w-0 w-full lg:flex-1 lg:self-stretch min-h-0 flex flex-col">
          <div className="theme-glass-panel-strong flex-1 rounded-3xl px-4 py-4 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-center mb-3 pb-3 border-b border-gray-200/60 dark:border-white/10">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-brand-500" />
                Play with Friend
              </h2>
            </div>

            {/* Turn Indicator */}
            <div className="theme-glass-panel-soft mb-3 p-2.5 rounded-xl text-center">
              <p className="text-xs font-medium text-brand-600 dark:text-brand-400">
                {isPlayerTurn ? "Your turn" : `${friendName}'s turn`}
              </p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                Online challenge match
              </p>
            </div>

            {statusMessage && (
              <div className="theme-glass-panel-soft mb-3 rounded-xl px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
                {statusMessage}
              </div>
            )}

            {/* Move List */}
            <div className="theme-glass-panel-soft flex-1 mb-3 rounded-xl overflow-hidden">
              <MoveListTabs
                movesContent={
                  <ChessMoveList
                    rows={moveRows}
                    emptyMessage="No moves yet"
                    inactiveMoveClassName="text-gray-800 dark:text-gray-200"
                  />
                }
                messages={sidebarMessages}
              />
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <button
                onClick={onResign}
                disabled={gameOver}
                className="w-full px-4 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 font-medium transition-colors disabled:opacity-50"
              >
                End Game
              </button>
              <button
                onClick={() => {
                  onLeave?.();
                  navigate("/play");
                }}
                className="w-full px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-gray-800 dark:text-gray-200 font-medium transition-colors"
              >
                Back to Play
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

