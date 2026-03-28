import { useState, useEffect, useRef } from "react";
import { useStockfishGame } from "../../hooks/useStockfishGame";
import { GameOverModal, PlayerInfo, GameBoard } from "../../components/game";
import type { GameSettings } from "../../components/game";
import { defaultGameSettings } from "../../hooks/useStockfishGameTypes";
import { useAuthStore } from "../../store/authStore";
import { BOARD_FRAME } from "./types";
import { GameSidebar } from "./GameSidebar";

export default function Game() {
  const { user } = useAuthStore();

  const {
    game,
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
    promotionState,
    onPromotionPieceSelect,
    handleStartGame,
    handleNewGame,
    handleTimeOut,
  } = useStockfishGame();

  const [matchSettings, setMatchSettings] =
    useState<GameSettings>(defaultGameSettings);

  useEffect(() => {
    setMatchSettings((prev) => ({
      ...prev,
      ...gameSettings,
      selectedBot: undefined,
    }));
  }, [gameSettings]);

  // Responsive board width based on available viewport and layout
  const [boardWidth, setBoardWidth] = useState(900);
  const containerRef = useRef<HTMLDivElement>(null);
  const topInfoRef = useRef<HTMLDivElement>(null);
  const bottomInfoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const isWide = window.innerWidth >= 1024;
      const topH = topInfoRef.current?.getBoundingClientRect().height ?? 80;
      const bottomH =
        bottomInfoRef.current?.getBoundingClientRect().height ?? 80;
      const maxBoardWidth = isWide ? rect.width * 0.55 : rect.width;
      const columnGap = isWide ? 16 : 8;
      const verticalGap = 12;
      const padding = isWide ? 32 : 24;
      const availableWidth = maxBoardWidth - columnGap - padding - BOARD_FRAME;
      const availableHeight =
        rect.height - topH - bottomH - verticalGap * 2 - padding;
      const size = Math.floor(Math.min(availableWidth, availableHeight));
      setBoardWidth(Math.max(360, Math.min(size, 720)));
    };

    updateSize();
    const observer = new ResizeObserver(() => updateSize());
    observer.observe(container);
    if (topInfoRef.current) observer.observe(topInfoRef.current);
    if (bottomInfoRef.current) observer.observe(bottomInfoRef.current);
    window.addEventListener("resize", updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  const startMatch = () =>
    handleStartGame({
      ...matchSettings,
      selectedBot: undefined,
    });

  const quickRematch = () =>
    handleStartGame({
      ...gameSettings,
      selectedBot: undefined,
    });

  return (
    <div className="relative h-full w-full bg-slate-100 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 overflow-hidden">
      <div
        ref={containerRef}
        className="relative h-full w-full flex flex-col lg:flex-row lg:items-stretch gap-2 lg:gap-3 px-2 sm:px-3 lg:px-4 py-3 lg:py-4 overflow-hidden"
      >
        {/* Game Over Modal */}
        <GameOverModal
          isOpen={showGameOverModal}
          result={gameResult}
          onTryAgain={quickRematch}
          onNewGame={handleNewGame}
          savedGameId={savedGameId}
          historyStatus={historyPersistenceStatus}
          opponentName="Opponent"
        />

        {/* Main Game Area */}
        <div className="flex flex-col items-start gap-2 sm:gap-3 flex-shrink-0">
          {/* Opponent Info */}
          <div
            ref={topInfoRef}
            className="flex-shrink-0 z-10"
            style={{ width: boardWidth + BOARD_FRAME }}
          >
            <PlayerInfo
              name="Opponent"
              subtitle="Waiting to start"
              avatarLetter="?"
              avatarStyle="opponent"
              initialTime={gameSettings.timeControl.initial}
              increment={gameSettings.timeControl.increment}
              isTimerActive={
                gameStarted &&
                !isPlayerTurn &&
                !gameOver &&
                gameSettings.timeControl.initial > 0
              }
              onTimeOut={() => handleTimeOut(false)}
              onTimeChange={setOpponentTime}
            />
          </div>

          {/* Chessboard */}
          <div className="flex-shrink-0">
            <div
              className="rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-gray-200/60 dark:border-white/5 shadow-xl p-2"
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
                customSquareStyles={{ ...optionSquares, ...preMoveSquares }}
                promotionState={promotionState}
                onPromotionPieceSelect={onPromotionPieceSelect}
              />
            </div>
          </div>

          {/* Player Info */}
          <div
            ref={bottomInfoRef}
            className="flex-shrink-0 z-10"
            style={{ width: boardWidth + BOARD_FRAME }}
          >
            <PlayerInfo
              name={user?.fullName || "You"}
              subtitle={gameSettings.playAs === "white" ? "White" : "Black"}
              avatarLetter={
                user?.fullName?.substring(0, 2).toUpperCase() || "U"
              }
              avatarImage={user?.avatar}
              avatarStyle="player"
              initialTime={gameSettings.timeControl.initial}
              increment={gameSettings.timeControl.increment}
              isTimerActive={
                gameStarted &&
                isPlayerTurn &&
                !gameOver &&
                gameSettings.timeControl.initial > 0
              }
              onTimeOut={() => handleTimeOut(true)}
              onTimeChange={setPlayerTime}
            />
          </div>
        </div>

        {/* Sidebar Controls */}
        <GameSidebar onStartMatch={startMatch} />
      </div>
    </div>
  );
}
