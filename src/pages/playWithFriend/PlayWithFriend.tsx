import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFriendOnlineGame } from "../../hooks/useFriendOnlineGame";
import { navigateToNewGameRoute } from "../../components/game/newGameRouting";
import { useAuthStore } from "../../store/authStore";
import { useFriendChallengeStore } from "../../store/friendChallengeStore";
import { FriendGameSetup } from "./FriendGameSetup";
import { FriendGameView } from "./FriendGameView";

export default function PlayWithFriend() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const sendChallenge = useFriendChallengeStore((state) => state.sendChallenge);
  const lastInfo = useFriendChallengeStore((state) => state.lastInfo);
  const clearInfo = useFriendChallengeStore((state) => state.clearInfo);

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
    promotionState,
    onPromotionPieceSelect,
    resign,
    timeOut,
    leaveGame,
    resetToSetup,
    opponentName,
    opponentUserId,
    gameType,
    matchVariant,
    isRated,
    isConnected,
  } = useFriendOnlineGame();

  const [playAs, setPlayAs] = useState<"white" | "black" | "random">("white");
  const [timeControl, setTimeControl] = useState({
    initial: 600,
    increment: 0,
  });
  const [friendName, setFriendName] = useState("Friend");
  const [isSendingChallenge, setIsSendingChallenge] = useState(false);
  const [challengeError, setChallengeError] = useState<string | null>(null);

  const handleSendChallenge = async (payload: {
    toUserId: string;
    toName: string;
    gameType: string;
    rated: boolean;
    playAs: "white" | "black" | "random";
    timeControl: { initial: number; increment: number };
  }) => {
    setIsSendingChallenge(true);
    setChallengeError(null);
    clearInfo();
    const response = await sendChallenge({
      ...payload,
      fromRating: user?.rating,
    });
    if (!response.success) {
      setChallengeError(response.error || "Failed to send challenge.");
    }
    setIsSendingChallenge(false);
  };

  const handleTryAgain = async () => {
    const rematchTargetUserId = opponentUserId;
    const rematchTargetName = opponentName || friendName || "Friend";
    const rematchPlayAs: "white" | "black" = gameSettings.playAs;

    resetToSetup();
    setFriendName(rematchTargetName);

    if (!rematchTargetUserId) {
      setChallengeError("Unable to send rematch right now.");
      return;
    }

    setIsSendingChallenge(true);
    setChallengeError(null);
    clearInfo();

    const response = await sendChallenge({
      toUserId: rematchTargetUserId,
      toName: rematchTargetName,
      gameType: gameType || "standard",
      rated: isRated,
      playAs: rematchPlayAs,
      timeControl: gameSettings.timeControl,
      fromRating: user?.rating,
    });

    if (!response.success) {
      setChallengeError(response.error || "Failed to send rematch.");
    }

    setIsSendingChallenge(false);
  };

  const handleNewGame = useCallback(() => {
    resetToSetup();
    navigateToNewGameRoute(navigate, { mode: "friend" });
  }, [navigate, resetToSetup]);

  // If game started, show the game board
  if (gameStarted) {
    return (
      <FriendGameView
        friendName={opponentName || friendName}
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
        promotionState={promotionState}
        onPromotionPieceSelect={onPromotionPieceSelect}
        setOpponentTime={setOpponentTime}
        setPlayerTime={setPlayerTime}
        onTimeOut={timeOut}
        onResign={resign}
        onTryAgain={handleTryAgain}
        onNewGame={handleNewGame}
        onLeave={leaveGame}
        variant={matchVariant}
      />
    );
  }

  // Setup screen
  return (
    <FriendGameSetup
      playAs={playAs}
      onPlayAsChange={setPlayAs}
      timeControl={timeControl}
      onTimeControlChange={setTimeControl}
      friendName={friendName}
      onFriendNameChange={setFriendName}
      onSendChallenge={handleSendChallenge}
      isSendingChallenge={isSendingChallenge}
      challengeError={challengeError}
      challengeInfo={lastInfo}
      isRealtimeConnected={isConnected}
    />
  );
}
