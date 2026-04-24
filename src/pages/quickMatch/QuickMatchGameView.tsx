import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Square } from "chess.js";
import { useAuthStore } from "../../store/authStore";
import { GameOverModal, PlayerInfo, GameBoard } from "../../components/game";
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

export interface TournamentPanelStandingRow {
  rank: number;
  userId: string;
  username: string;
  elo: number;
  points: number;
  status?: string;
}

export interface TournamentPanelHistoryRow {
  id: string;
  gameId: string;
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
    currentRound: number;
    roundsPlanned: number;
  };
  standings: TournamentPanelStandingRow[];
  history: TournamentPanelHistoryRow[];
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
  clockResetToken?: number;
  isClockPaused?: boolean;
  onTimeOut: (isPlayer: boolean) => void;
  onResign: () => void;
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
}

function getInitials(name: string): string {
  const letters = String(name || "")
    .replace(/[^a-zA-Z]/g, "")
    .slice(0, 2)
    .toUpperCase();
  return letters || "??";
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
}: QuickMatchGameViewProps) {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [tournamentTab, setTournamentTab] = useState<
    "standings" | "history" | "moves"
  >(tournamentMode ? "standings" : "moves");
  const displayMoves = moves;
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
  const variantLabel =
    variant === "chess960"
      ? "Chess960"
      : variant === "kingOfHill"
        ? "King of the Hill"
      : variant === "threeCheck"
        ? "Three-Check"
        : variant === "atomic"
          ? "Atomic Chess"
        : "";
  const persistentSquareStyles =
    variant === "kingOfHill" ? KING_OF_HILL_SQUARE_STYLES : {};
  const [boardWidth, setBoardWidth] = useState(620);
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

  useEffect(() => {
    setTournamentTab(tournamentMode ? "standings" : "moves");
  }, [tournamentMode, tournamentPanelData?.tournament?.id]);

  useEffect(() => {
    const container = leftRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const padding = 24;
      const topH = topRef.current?.offsetHeight ?? 60;
      const bottomH = bottomRef.current?.offsetHeight ?? 60;
      const availableWidth = rect.width - padding - BOARD_FRAME;
      const availableHeight = rect.height - topH - bottomH - padding;
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
  }, []);

  return (
    <div className="relative h-screen w-full bg-transparent overflow-hidden">
      <div className="relative h-full w-full grid grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] overflow-hidden">
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
          tournamentMode={tournamentMode}
          onBackToTournament={() => navigate("/tournaments")}
        />

        {/* Main Board Area */}
        <div
          ref={leftRef}
          className="min-w-0 flex flex-col items-center justify-center p-4 gap-4 h-full overflow-hidden"
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
              avatarLetter={opponentName?.substring(0, 1).toUpperCase() || "O"}
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
              onTimeChange={setOpponentTime}
              timerResetToken={`opp:${clockResetToken ?? 0}`}
            />
          </div>

          {/* Chessboard */}
          <div
            className="theme-glass-panel-strong rounded-2xl"
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
              onTimeChange={setPlayerTime}
              timerResetToken={`self:${clockResetToken ?? 0}`}
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="min-w-0 w-full lg:flex-1 lg:self-stretch min-h-0 flex flex-col">
          <div className="theme-glass-panel-strong flex-1 rounded-3xl px-4 py-4 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-center mb-3 pb-3 border-b border-gray-200/60 dark:border-white/10">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {tournamentMode
                  ? tournamentPanelData?.tournament?.name || "Tournament Match"
                  : `Quick Match${variantLabel ? ` - ${variantLabel}` : ""}`}
              </h2>
            </div>

            {tournamentMode && (
              <div className="theme-glass-panel-soft mb-3 flex items-center gap-2 rounded-xl p-1">
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
                  onClick={() => setTournamentTab("history")}
                  className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    tournamentTab === "history"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "text-gray-600 hover:bg-gray-200/70 dark:text-gray-300 dark:hover:bg-slate-700/60"
                  }`}
                >
                  History
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

            {statusMessage && (
              <div className="theme-glass-panel-soft mb-3 rounded-xl px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
                {statusMessage}
              </div>
            )}

            {/* Content */}
            <div className="theme-glass-panel-soft flex-1 mb-3 rounded-xl overflow-hidden">
              {(!tournamentMode || tournamentTab === "moves") && (
                <div className="h-full overflow-auto p-2.5">
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
                              {Math.floor(
                                (moves.length - displayMoves.length) / 2,
                              ) +
                                i +
                                1}
                              .
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
              )}

              {tournamentMode && tournamentTab === "standings" && (
                <div className="h-full overflow-auto p-2">
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
                          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-500/10 text-[11px] font-semibold text-emerald-300">
                            {getInitials(row.username)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-medium text-gray-900 dark:text-gray-100">
                              {row.username}
                            </div>
                            <div className="text-[11px] text-gray-500 dark:text-gray-400">
                              ELO {row.elo}
                            </div>
                          </div>
                          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {row.points}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tournamentMode && tournamentTab === "history" && (
                <div className="h-full overflow-auto p-2">
                  {tournamentHistory.length === 0 ? (
                    <div className="text-center text-gray-400 dark:text-gray-500 text-xs py-6">
                      No round history yet.
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
                              Round {row.roundNumber} · Board {row.board}
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
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <button
                onClick={onResign}
                disabled={gameOver}
                className="w-full px-4 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 font-medium transition-colors disabled:opacity-50"
              >
                Resign
              </button>
              <button
                onClick={() => {
                  onLeave?.();
                  navigate(tournamentMode ? "/tournaments" : "/play");
                }}
                className="w-full px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-gray-800 dark:text-gray-200 font-medium transition-colors"
              >
                {tournamentMode ? "Back to Tournament" : "Back to Play"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
