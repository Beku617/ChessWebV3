import type { CSSProperties } from "react";
import { Square } from "chess.js";
import type { GameSettings, PromotionState } from "../../components/game";
import type { HistoryPersistenceStatus } from "../../hooks/gameHistorySaver/historyPersistence";
import { QuickMatchGameView } from "../quickMatch/QuickMatchGameView";

type MatchVariant =
  | "standard"
  | "chess960"
  | "threeCheck"
  | "kingOfHill"
  | "atomic";

interface FriendMatchChatMessage {
  senderId: string;
  senderUsername: string;
  content: string;
  createdAt: string;
  isSystem?: boolean;
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
  chatMessages?: FriendMatchChatMessage[];
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
  onSendChatMessage?: (message: string) => void;
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
  onTryAgain,
  onNewGame,
  onLeave,
  variant = "standard",
  threeCheckState,
  promotionState,
  onPromotionPieceSelect,
  onSendChatMessage,
}: FriendGameViewProps) {
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
      playerRating={playerRating}
      opponentRating={opponentRating}
      statusMessage={statusMessage}
      chatMessages={chatMessages}
      gameOverElo={gameOverElo}
      onSquareClick={onSquareClick}
      onPieceDrop={onPieceDrop}
      onCancelSelection={onCancelSelection}
      isDraggablePiece={isDraggablePiece}
      setOpponentTime={setOpponentTime}
      setPlayerTime={setPlayerTime}
      playerClockSeed={playerClockSeed}
      opponentClockSeed={opponentClockSeed}
      clockResetToken={clockResetToken}
      isClockPaused={isClockPaused}
      onTimeOut={onTimeOut}
      onResign={onResign}
      onSendChatMessage={onSendChatMessage}
      onRematch={onTryAgain}
      onNewGame={onNewGame}
      onLeave={onLeave}
      opponentName={friendName}
      variant={variant}
      threeCheckState={threeCheckState}
      promotionState={promotionState}
      onPromotionPieceSelect={onPromotionPieceSelect}
    />
  );
}
