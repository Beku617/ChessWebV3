import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { useStockfishGame } from "../../hooks/useStockfishGame";
import {
  GameOverModal,
  GameBoard,
  ChessMoveList,
  MoveListTabs,
  buildChessMoveRows,
} from "../../components/game";
import { navigateToNewGameRoute } from "../../components/game/newGameRouting";
import { ChessTimer } from "../../components/game/ChessTimer";
import type { GameSettings } from "../../components/game";
import { defaultGameSettings } from "../../hooks/useStockfishGameTypes";
import type { BotPersonality } from "../../data/botPersonalities";
import Sidebar from "../../components/Sidebar";
import { BOARD_FRAME } from "./types";
import { API_URL } from "../../config/network";

function resolveBotAvatarUrl(input: unknown): string {
  const avatarUrl = String(input || "").trim();
  if (!avatarUrl) return "";
  if (/^(https?:)?\/\//i.test(avatarUrl) || avatarUrl.startsWith("data:")) {
    return avatarUrl;
  }
  if (avatarUrl.startsWith("/BotProPic/")) {
    return avatarUrl;
  }
  return `${API_URL}${avatarUrl.startsWith("/") ? "" : "/"}${avatarUrl}`;
}

function getBotInitials(name?: string): string {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "?";
  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

// Map database bot to BotPersonality interface
function mapDbBotToPersonality(dbBot: any): BotPersonality {
  return {
    id: dbBot._id,
    name: dbBot.name,
    avatar: "",
    avatarUrl: resolveBotAvatarUrl(dbBot.avatarUrl),
    rating: dbBot.eloRating,
    title: dbBot.title || undefined,
    description: dbBot.description || "",
    personality: dbBot.personality || dbBot.quote || "",
    playStyle: dbBot.playStyle || "balanced",
    skillLevel: dbBot.skillLevel || 5,
    depth: dbBot.depth || 10,
    thinkTimeMs: dbBot.thinkTimeMs || 2000,
    blunderChance: dbBot.blunderChance || 0,
    aggressiveness: dbBot.aggressiveness || 0,
    openingBook: dbBot.openingBook ?? true,
    category: dbBot.difficulty || "beginner",
  };
}

export default function BotGamePage() {
  const { botId } = useParams<{ botId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  // Bot state
  const [bot, setBot] = useState<BotPersonality | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    clockSessionId,
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
    handleResign,
    handleTimeOut,
  } = useStockfishGame();

  // Responsive board width
  const [boardWidth, setBoardWidth] = useState(620);
  const containerRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const moveRows = useMemo(() => buildChessMoveRows(moves), [moves]);

  // Fetch bot from API
  useEffect(() => {
    async function fetchBot() {
      if (!botId) return;

      try {
        setLoading(true);
        const res = await fetch(`${API_URL}/api/bots/${botId}`, {
          credentials: "include",
        });

        if (!res.ok) {
          throw new Error("Bot not found");
        }

        const data = await res.json();
        const mappedBot = mapDbBotToPersonality(data.bot);
        setBot(mappedBot);
        setError(null);
      } catch (err) {
        console.error("Error fetching bot:", err);
        setError("Bot not found");
      } finally {
        setLoading(false);
      }
    }

    fetchBot();
  }, [botId]);

  useEffect(() => {
    const container = leftRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const padding = 32;
      const headerH = 60;
      const footerH = 80;
      const availableWidth = rect.width - padding - BOARD_FRAME;
      const availableHeight = rect.height - headerH - footerH - padding;
      const size = Math.floor(Math.min(availableWidth, availableHeight));
      setBoardWidth(Math.max(400, Math.min(size, 680)));
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

  // Auto-start game when bot is loaded
  useEffect(() => {
    if (bot && !gameStarted) {
      const settings: GameSettings = {
        ...defaultGameSettings,
        timeControl: { initial: 0, increment: 0 },
        playAs: "white",
        difficulty: bot.skillLevel,
        selectedBot: bot,
      };
      handleStartGame(settings);
    }
  }, [bot]);

  const handleRematch = () => {
    handleStartGame({ ...gameSettings });
  };

  const handleNewGameFromModal = useCallback(() => {
    handleNewGame();
    navigateToNewGameRoute(navigate, { mode: "bot" });
  }, [handleNewGame, navigate]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // If bot not found, redirect back
  if (error || !bot) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            Bot not found
          </h2>
          <button
            onClick={() => navigate("/play/bot")}
            className="px-6 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-medium"
          >
            Back to Bot Selection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-[#f5f5f7] dark:bg-gray-950 text-gray-900 dark:text-white font-sans selection:bg-brand-500/30 transition-colors duration-300">
      <Sidebar />

      {/* Main Content */}
      <div className="flex flex-col ml-[60px] md:ml-72 h-screen overflow-hidden">
        <main className="flex-1 flex flex-col overflow-hidden">
          <div
            ref={containerRef}
            className="flex-1 w-full bg-slate-100 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 overflow-hidden"
          >
            <div className="h-full grid grid-cols-1 lg:grid-cols-2">
              <GameOverModal
                isOpen={showGameOverModal}
                result={gameResult}
                onTryAgain={handleRematch}
                onNewGame={handleNewGameFromModal}
                savedGameId={savedGameId}
                analyzeBasePath="/analyze"
                historyStatus={historyPersistenceStatus}
                opponentName={bot.name}
              />

              {/* Left Side - Board with Player Info */}
              <div
                ref={leftRef}
                className="flex flex-col items-center justify-center p-4 gap-4 h-full overflow-hidden"
              >
                {/* Top Player Info Bar (Opponent) */}
                <div className="w-full max-w-[900px] flex items-center gap-3 px-2">
                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-700 flex-shrink-0">
                    {bot.avatarUrl ? (
                      <img
                        src={bot.avatarUrl}
                        alt={bot.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center">
                        <span className="text-white font-bold text-sm">
                          {getBotInitials(bot.name)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900 dark:text-white">
                        {bot.name}
                      </span>
                      {bot.title && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded">
                          {bot.title}
                        </span>
                      )}
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        ({bot.rating})
                      </span>
                    </div>
                  </div>
                  {gameSettings.timeControl.initial > 0 && (
                    <ChessTimer
                      initialTime={gameSettings.timeControl.initial}
                      increment={gameSettings.timeControl.increment}
                      isActive={gameStarted && !isPlayerTurn && !gameOver}
                      resetToken={clockSessionId}
                      onTimeOut={() => handleTimeOut(false)}
                      onTimeChange={setOpponentTime}
                    />
                  )}
                </div>

                {/* Chess Board */}
                <div
                  className="rounded-2xl overflow-hidden shadow-2xl border border-gray-200/60 dark:border-white/10"
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
                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-700 flex-shrink-0">
                    {user?.avatar ? (
                      <img
                        src={user.avatar}
                        alt={user.fullName || "You"}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center">
                        <span className="text-white font-bold text-sm">
                          {user?.fullName?.substring(0, 1).toUpperCase() || "Y"}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <span className="font-bold text-gray-900 dark:text-white">
                      {user?.fullName || "You"}
                    </span>
                  </div>
                  {gameSettings.timeControl.initial > 0 && (
                    <ChessTimer
                      initialTime={gameSettings.timeControl.initial}
                      increment={gameSettings.timeControl.increment}
                      isActive={gameStarted && isPlayerTurn && !gameOver}
                      resetToken={clockSessionId}
                      onTimeOut={() => handleTimeOut(true)}
                      onTimeChange={setPlayerTime}
                    />
                  )}
                </div>
              </div>

              {/* Right Side - Game Panel */}
              <div className="w-full bg-white/90 dark:bg-slate-900/95 border-l border-gray-200/60 dark:border-white/10 flex flex-col h-full overflow-hidden">
                {/* Panel Header - Fixed */}
                <div className="flex-shrink-0 p-4 border-b border-gray-200/60 dark:border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-700 flex-shrink-0">
                      {bot.avatarUrl ? (
                        <img
                          src={bot.avatarUrl}
                          alt={bot.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center">
                          <span className="text-white font-bold">
                            {getBotInitials(bot.name)}
                          </span>
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                          {bot.name}
                        </h2>
                        {bot.title && (
                          <span className="px-2 py-0.5 text-xs font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded">
                            {bot.title}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        Rating: {bot.rating}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Move List - Scrollable */}
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

                {/* Action Buttons - Fixed */}
                <div className="flex-shrink-0 p-4 border-t border-gray-200/60 dark:border-white/10 flex flex-col gap-2">
                  <button
                    onClick={handleResign}
                    disabled={gameOver}
                    className="w-full py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 font-medium transition-colors disabled:opacity-50"
                  >
                    Resign
                  </button>
                  <button
                    onClick={() => navigate("/play/bot")}
                    className="w-full py-3 rounded-xl bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-800 dark:text-gray-200 font-medium transition-colors"
                  >
                    Back to Bot Selection
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

