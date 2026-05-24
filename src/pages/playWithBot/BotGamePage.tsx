import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Chess } from "chess.js";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/authStore";
import { useStockfishGame } from "../../hooks/useStockfishGame";
import {
  GameOverModal,
  PlayerInfo,
  GameBoard,
  ChessMoveList,
  MoveListTabs,
  ResignConfirmButton,
  buildChessMoveRows,
} from "../../components/game";
import { navigateToNewGameRoute } from "../../components/game/newGameRouting";
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

function resolveRequestedPlayAs(rawPlayAs: string | null): "white" | "black" {
  const normalized = String(rawPlayAs || "").trim().toLowerCase();
  if (normalized === "black") return "black";
  if (normalized === "random") {
    return Math.random() < 0.5 ? "white" : "black";
  }
  return "white";
}

function formatOpeningLabel(
  opening: { name: string; variation?: string } | null,
): string {
  if (!opening) return "";
  return opening.variation ? `${opening.name}: ${opening.variation}` : opening.name;
}

export default function BotGamePage() {
  const { t } = useTranslation();
  const { botId } = useParams<{ botId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [resolvedPlayAs] = useState<"white" | "black">(() =>
    resolveRequestedPlayAs(searchParams.get("playAs")),
  );

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
    opening,
    openingLoading,
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
  const [selectedPly, setSelectedPly] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const moveRows = useMemo(() => buildChessMoveRows(moves), [moves]);
  const latestPly = moves.length;
  const activePly = selectedPly ?? (latestPly > 0 ? latestPly : null);
  const openingLabel = useMemo(() => {
    if (moves.length === 0) {
      return t("quickMatch.opening.startingPosition", "Starting Position");
    }
    const formatted = formatOpeningLabel(opening);
    if (formatted) return formatted;
    return openingLoading
      ? t("quickMatch.opening.detecting", "Detecting opening...")
      : "";
  }, [moves.length, opening, openingLoading, t]);
  const fenByPly = useMemo(() => {
    const chess = new Chess();
    const map = new Map<number, string>();
    map.set(0, chess.fen());
    for (let index = 0; index < moves.length; index += 1) {
      const san = moves[index];
      const appliedMove = chess.move(san, { sloppy: true });
      if (!appliedMove) break;
      map.set(index + 1, chess.fen());
    }
    return map;
  }, [moves]);
  const isReviewingPastMove =
    selectedPly !== null && selectedPly < latestPly && selectedPly >= 0;
  const displayedFen = isReviewingPastMove
    ? fenByPly.get(selectedPly) || game.fen()
    : game.fen();

  useEffect(() => {
    if (latestPly === 0) {
      setSelectedPly(null);
      return;
    }
    if (selectedPly !== null && selectedPly > latestPly) {
      setSelectedPly(latestPly);
    }
  }, [latestPly, selectedPly]);

  const handleSelectPly = useCallback(
    (ply: number) => {
      if (!Number.isFinite(ply)) return;
      const boundedPly = Math.max(1, Math.min(Math.floor(ply), latestPly));
      if (boundedPly >= latestPly) {
        setSelectedPly(null);
        return;
      }
      setSelectedPly(boundedPly);
    },
    [latestPly],
  );

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
          throw new Error(t("botGame.notFound", "Bot not found"));
        }

        const data = await res.json();
        const mappedBot = mapDbBotToPersonality(data.bot);
        setBot(mappedBot);
        setError(null);
      } catch (err) {
        console.error("Error fetching bot:", err);
        setError(t("botGame.notFound", "Bot not found"));
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
      const padding = 24;
      const headerH = topRef.current?.offsetHeight ?? 60;
      const footerH = bottomRef.current?.offsetHeight ?? 60;
      const availableWidth = rect.width - padding - BOARD_FRAME;
      const availableHeight = rect.height - headerH - footerH - padding;
      const size = Math.floor(Math.min(availableWidth, availableHeight));
      setBoardWidth(Math.max(400, Math.min(size, 720)));
    };

    updateSize();
    const observer = new ResizeObserver(() => updateSize());
    observer.observe(container);
    window.addEventListener("resize", updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, [bot?.id]);

  // Auto-start game when bot is loaded
  useEffect(() => {
    if (bot && !gameStarted) {
      const settings: GameSettings = {
        ...defaultGameSettings,
        timeControl: { initial: 0, increment: 0 },
        playAs: resolvedPlayAs,
        difficulty: bot.skillLevel,
        selectedBot: bot,
      };
      handleStartGame(settings);
    }
  }, [bot, gameStarted, handleStartGame, resolvedPlayAs]);

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
            {t("botGame.notFound", "Bot not found")}
          </h2>
          <button
            onClick={() => navigate("/play/bot")}
            className="px-6 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-medium"
          >
            {t("botGame.backToBotSelection", "Back to Bot Selection")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-theme-primary text-gray-900 dark:text-white font-sans selection:bg-brand-500/30 transition-colors duration-300">
      <Sidebar />

      {/* Main Content */}
      <div className="flex flex-col ml-[60px] md:ml-72 h-screen overflow-hidden">
        <main className="flex-1 flex flex-col overflow-hidden">
          <div
            ref={containerRef}
            className="quickmatch-game-root relative flex-1 w-full bg-transparent overflow-hidden"
          >
            <div className="quickmatch-game-layout relative h-full w-full grid grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] overflow-hidden">
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
                className="quickmatch-main-board min-w-0 flex flex-col items-center justify-center p-4 gap-4 h-full overflow-hidden"
              >
                {/* Top Player Info Bar (Opponent) */}
                <div
                  ref={topRef}
                  className="quickmatch-opponent-panel quickmatch-panel-edge-offset-top flex-shrink-0 z-10 transition-[width] duration-300 ease-out"
                  style={{ width: boardWidth }}
                >
                  <PlayerInfo
                    name={bot.name}
                    subtitle={t("botGame.aiOpponent", "AI opponent")}
                    rating={bot.rating}
                    avatarLetter={getBotInitials(bot.name)}
                    avatarImage={bot.avatarUrl}
                    avatarStyle="opponent"
                    initialTime={gameSettings.timeControl.initial}
                    increment={gameSettings.timeControl.increment}
                    isTimerActive={gameStarted && !isPlayerTurn && !gameOver}
                    onTimeOut={() => handleTimeOut(false)}
                    onTimeChange={setOpponentTime}
                    timerResetToken={`bot:${clockSessionId}`}
                    compactTimer={gameSettings.timeControl.initial > 0}
                  />
                </div>

                {/* Chess Board */}
                <div
                  className="quickmatch-board-wrap relative flex-shrink-0 transition-[width] duration-300 ease-out"
                  style={{ width: boardWidth }}
                >
                  <GameBoard
                    fen={displayedFen}
                    boardWidth={boardWidth}
                    boardOrientation={gameSettings.playAs}
                    onSquareClick={isReviewingPastMove ? () => {} : onSquareClick}
                    onPieceDrop={isReviewingPastMove ? () => false : onPieceDrop}
                    onCancelSelection={isReviewingPastMove ? () => {} : onCancelSelection}
                    isDraggablePiece={
                      isReviewingPastMove ? () => false : isDraggablePiece
                    }
                    customSquareStyles={{ ...optionSquares, ...preMoveSquares }}
                    lastMove={lastMove}
                    promotionState={promotionState}
                    onPromotionPieceSelect={onPromotionPieceSelect}
                  />
                </div>

                {/* Bottom Player Info Bar (You) */}
                <div
                  ref={bottomRef}
                  className="quickmatch-player-panel quickmatch-panel-edge-offset-bottom flex-shrink-0 z-10 transition-[width] duration-300 ease-out"
                  style={{ width: boardWidth }}
                >
                  <PlayerInfo
                    name={user?.fullName || t("You")}
                    subtitle=""
                    avatarLetter={user?.fullName?.substring(0, 2).toUpperCase() || "Y"}
                    avatarImage={user?.avatar}
                    avatarStyle="player"
                    initialTime={gameSettings.timeControl.initial}
                    increment={gameSettings.timeControl.increment}
                    isTimerActive={gameStarted && isPlayerTurn && !gameOver}
                    onTimeOut={() => handleTimeOut(true)}
                    onTimeChange={setPlayerTime}
                    timerResetToken={`self:${clockSessionId}`}
                    compactTimer={gameSettings.timeControl.initial > 0}
                  />
                </div>
              </div>

              {/* Right Side - Game Panel */}
              <div className="quickmatch-sidebar min-w-0 w-full lg:flex-1 lg:self-stretch min-h-0 flex flex-col p-3">
                <div className="theme-glass-panel-strong flex-1 flex flex-col overflow-hidden rounded-3xl">
                {/* Panel Header - Fixed */}
                <div className="flex-shrink-0 p-4 border-b border-theme-glass">
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
                        {t("quickMatch.result.rating", "Rating")}: {bot.rating}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Move List - Scrollable */}
                <div className="theme-glass-panel-soft flex-1 mb-3 rounded-xl overflow-hidden">
                  <MoveListTabs
                    movesContent={
                      <div className="space-y-2">
                        {openingLabel ? (
                          <div className="px-2 text-xs text-gray-500 dark:text-gray-400">
                            {openingLabel}
                          </div>
                        ) : null}
                        <ChessMoveList
                          rows={moveRows}
                          activePly={activePly}
                          onSelectPly={handleSelectPly}
                          emptyMessage={t("quickMatch.moves.empty", "No moves yet")}
                          rowClassName="text-sm"
                          moveCellClassName="rounded px-2 py-1 transition-colors"
                          activeMoveClassName="bg-[#00e5a0]/20 text-[#00e5a0] font-semibold"
                          inactiveMoveClassName="text-gray-800 dark:text-gray-200"
                        />
                      </div>
                    }
                    showMessagesTab={false}
                  />
                </div>

                {/* Action Buttons - Fixed */}
                <div className="flex-shrink-0 p-4 pb-6 border-t border-theme-glass flex flex-col gap-2">
                  <ResignConfirmButton
                    onConfirm={handleResign}
                    disabled={gameOver}
                    className="w-full py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 font-medium transition-colors disabled:opacity-50"
                  >
                    {t("game.actions.resign", "Resign")}
                  </ResignConfirmButton>
                  <button
                    onClick={() => navigate("/play/bot")}
                    className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/15 text-gray-800 dark:text-gray-200 font-medium transition-colors"
                  >
                    {t("botGame.backToBotSelection", "Back to Bot Selection")}
                  </button>
                </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

