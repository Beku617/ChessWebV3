import { useNavigate } from "react-router-dom";
import { useMemo } from "react";
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

interface BotGameViewProps {
  containerRef: React.RefObject<HTMLDivElement>;
  leftRef: React.RefObject<HTMLDivElement>;
  boardWidth: number;
  game: { fen: () => string };
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
  lastMove?: { from: string; to: string } | null;
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
  onRematch: () => void;
  onNewGame: () => void;
  promotionState?: PromotionState;
  onPromotionPieceSelect?: (
    piece?: string,
    fromSquare?: Square,
    toSquare?: Square,
  ) => boolean;
}

export function BotGameView({
  containerRef,
  leftRef,
  boardWidth,
  game,
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
  lastMove,
  onSquareClick,
  onPieceDrop,
  onCancelSelection,
  isDraggablePiece,
  setOpponentTime,
  setPlayerTime,
  onTimeOut,
  onResign,
  onRematch,
  onNewGame,
  promotionState,
  onPromotionPieceSelect,
}: BotGameViewProps) {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const moveRows = useMemo(() => buildChessMoveRows(moves), [moves]);
  const timerInitialTime = 0;
  const timerIncrement = 0;
  const opponentInitials =
    gameSettings.selectedBot?.name
      ?.split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "AI";

  return (
    <div
      ref={containerRef}
      className="relative h-screen w-full bg-transparent overflow-hidden"
    >
      <div className="h-full grid grid-cols-1 lg:grid-cols-2 min-h-0">
        <GameOverModal
          isOpen={showGameOverModal}
          result={gameResult}
          onTryAgain={onRematch}
          onNewGame={onNewGame}
          savedGameId={savedGameId}
          analyzeBasePath="/analyze"
          historyStatus={historyPersistenceStatus}
          opponentName={gameSettings.selectedBot?.name || "Stockfish"}
        />

        {/* Left Side - Board with Player Info */}
        <div
          ref={leftRef}
          className="flex flex-col items-center justify-center p-4 gap-4 h-full min-h-0"
        >
          {/* Top Player Info Bar (Opponent) */}
          <div className="w-full max-w-[900px] flex items-center gap-3 px-2">
            <PlayerInfo
              name={gameSettings.selectedBot?.name || "Stockfish"}
              subtitle={gameSettings.selectedBot?.title || "AI opponent"}
              avatarLetter={opponentInitials}
              avatarStyle="opponent"
              initialTime={timerInitialTime}
              increment={timerIncrement}
              showTimer={false}
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

          {/* Chess Board */}
          <div
            className="theme-board-panel rounded-2xl overflow-hidden"
            style={{ width: boardWidth }}
          >
            <GameBoard
              fen={game.fen()}
              boardWidth={boardWidth}
              boardOrientation={gameSettings.playAs}
              onSquareClick={onSquareClick}
              onPieceDrop={onPieceDrop}
              onCancelSelection={onCancelSelection}
              isDraggablePiece={isDraggablePiece}
              customSquareStyles={{ ...optionSquares, ...preMoveSquares }}
              lastMove={lastMove}
              promotionState={promotionState}
              onPromotionPieceSelect={onPromotionPieceSelect}
            />
          </div>

          {/* Bottom Player Info Bar (You) */}
          <div className="w-full max-w-[900px] flex items-center gap-3 px-2 justify-start">
            <PlayerInfo
              name={user?.fullName || "You"}
              subtitle=""
              avatarLetter={
                user?.fullName?.substring(0, 2).toUpperCase() || "U"
              }
              avatarImage={user?.avatar}
              avatarStyle="player"
              initialTime={timerInitialTime}
              increment={timerIncrement}
              showTimer={false}
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

        {/* Right Side - Game Panel (same width as bot selection) */}
        <div className="theme-glass-panel-strong w-full rounded-none border-l-0 flex flex-col h-full">
          {/* Panel Header */}
          <div className="p-4 border-b border-theme-glass">
            <div className="flex items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    {gameSettings.selectedBot?.name || "Stockfish"}
                  </h2>
                  {gameSettings.selectedBot?.title && (
                    <span className="px-2 py-0.5 text-xs font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded">
                      {gameSettings.selectedBot.title}
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Rating: {gameSettings.selectedBot?.rating || "N/A"}
                </div>
              </div>
            </div>
          </div>

          {/* Move List */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <MoveListTabs
              movesContent={
                <ChessMoveList
                  rows={moveRows}
                  emptyMessage="No moves yet"
                  rowClassName="text-sm"
                  inactiveMoveClassName="text-gray-800 dark:text-gray-200"
                />
              }
              showMessagesTab={false}
            />
          </div>

          {/* Action Buttons */}
          <div className="p-4 pb-6 border-t border-theme-glass flex flex-col gap-2">
            <button
              onClick={onResign}
              disabled={gameOver}
              className="w-full py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 font-medium transition-colors disabled:opacity-50"
            >
              Resign
            </button>
            <button
              onClick={() => navigate("/play/bot")}
              className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/15 text-gray-800 dark:text-gray-200 font-medium transition-colors"
            >
              Back to Bot Selection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

