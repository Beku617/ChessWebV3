import { useEffect, useRef, useState } from "react";
import { Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Square } from "chess.js";
import { useAuthStore } from "../../store/authStore";
import { GameOverModal, PlayerInfo, GameBoard } from "../../components/game";
import type { GameSettings, PromotionState } from "../../components/game";
import type { HistoryPersistenceStatus } from "../../hooks/gameHistorySaver/historyPersistence";
import { BOARD_FRAME } from "./types";
import type { CSSProperties } from "react";

type MatchVariant = "standard" | "chess960";

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
  isPlayerTurn: boolean;
  savedGameId: string | null;
  historyPersistenceStatus: HistoryPersistenceStatus;
  showGameOverModal: boolean;
  optionSquares: Record<string, CSSProperties>;
  preMoveSquares: Record<string, CSSProperties>;
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
  onTimeOut: (isPlayer: boolean) => void;
  onResign: () => void;
  onTryAgain: () => void;
  onNewGame: () => void;
  onLeave?: () => void;
  variant?: MatchVariant;
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
  isPlayerTurn,
  savedGameId,
  historyPersistenceStatus,
  showGameOverModal,
  optionSquares,
  preMoveSquares,
  onSquareClick,
  onPieceDrop,
  onCancelSelection,
  isDraggablePiece,
  setOpponentTime,
  setPlayerTime,
  onTimeOut,
  onResign,
  onTryAgain,
  onNewGame,
  onLeave,
  variant = "standard",
  promotionState,
  onPromotionPieceSelect,
}: FriendGameViewProps) {
  const { user } = useAuthStore();
  const playerAvatarUrl = resolveAvatarUrl(user?.avatar);
  const navigate = useNavigate();
  const displayMoves = moves.slice(-8);
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
    <div className="relative h-screen w-full bg-slate-100 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 overflow-hidden">
      <div className="relative h-full w-full grid grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] gap-2 p-2 overflow-hidden">
        <GameOverModal
          isOpen={showGameOverModal}
          result={gameResult}
          onTryAgain={onTryAgain}
          onNewGame={onNewGame}
          savedGameId={savedGameId}
          historyStatus={historyPersistenceStatus}
          opponentName={friendName}
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
              name={friendName}
              subtitle={gameSettings.playAs === "white" ? "Black" : "White"}
              avatarLetter={friendName.substring(0, 2).toUpperCase()}
              avatarStyle="opponent"
              initialTime={gameSettings.timeControl.initial}
              increment={gameSettings.timeControl.increment}
              isTimerActive={
                gameStarted &&
                !isPlayerTurn &&
                !gameOver &&
                gameSettings.timeControl.initial > 0
              }
              onTimeOut={() => onTimeOut(false)}
              onTimeChange={setOpponentTime}
            />
          </div>

          {/* Chessboard */}
          <div
            className="rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-gray-200/60 dark:border-white/5 shadow-xl"
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
              name={user?.fullName || "You"}
              subtitle={gameSettings.playAs === "white" ? "White" : "Black"}
              avatarLetter={
                user?.fullName?.substring(0, 2).toUpperCase() || "U"
              }
              avatarImage={playerAvatarUrl}
              avatarStyle="player"
              initialTime={gameSettings.timeControl.initial}
              increment={gameSettings.timeControl.increment}
              isTimerActive={
                gameStarted &&
                isPlayerTurn &&
                !gameOver &&
                gameSettings.timeControl.initial > 0
              }
              onTimeOut={() => onTimeOut(true)}
              onTimeChange={setPlayerTime}
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="min-w-0 w-full lg:flex-1 lg:self-stretch min-h-0 flex flex-col">
          <div className="flex-1 rounded-3xl border border-white/10 bg-white/70 dark:bg-slate-900/80 shadow-2xl backdrop-blur-xl px-4 py-4 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-center mb-3 pb-3 border-b border-gray-200/60 dark:border-white/10">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-brand-500" />
                Play with Friend
              </h2>
            </div>

            {/* Turn Indicator */}
            <div className="mb-3 p-2.5 rounded-xl bg-brand-500/10 border border-brand-500/20 text-center">
              <p className="text-xs font-medium text-brand-600 dark:text-brand-400">
                {isPlayerTurn ? "Your turn" : `${friendName}'s turn`}
              </p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                Online challenge match
              </p>
            </div>

            {/* Move List */}
            <div className="flex-1 mb-3 rounded-xl bg-gray-50/50 dark:bg-slate-800/50 border border-gray-200/60 dark:border-white/5 overflow-hidden">
              <div className="p-2.5">
                {moves.length === 0 ? (
                  <div className="text-center text-gray-400 dark:text-gray-500 text-xs py-6">
                    Game in progress...
                  </div>
                ) : (
                  <div className="space-y-1">
                    {Array.from(
                      { length: Math.ceil(displayMoves.length / 2) },
                      (_, i) => (
                        <div
                          key={i}
                          className="flex items-center text-xs font-mono"
                        >
                          <span className="w-8 text-gray-400 dark:text-gray-500">
                            {moves.length - displayMoves.length + i + 1}.
                          </span>
                          <span className="flex-1 px-2 text-gray-800 dark:text-gray-200">
                            {displayMoves[i * 2]}
                          </span>
                          {displayMoves[i * 2 + 1] && (
                            <span className="flex-1 px-2 text-gray-800 dark:text-gray-200">
                              {displayMoves[i * 2 + 1]}
                            </span>
                          )}
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>
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
                className="w-full px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-800 dark:text-gray-200 font-medium transition-colors"
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

