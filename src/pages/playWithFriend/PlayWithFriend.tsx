import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useFriendOnlineGame } from "../../hooks/useFriendOnlineGame";
import { navigateToNewGameRoute } from "../../components/game/newGameRouting";
import { useAuthStore } from "../../store/authStore";
import { useFriendChallengeStore } from "../../store/friendChallengeStore";
import { FriendGameSetup } from "./FriendGameSetup";
import { FriendGameView } from "./FriendGameView";
import { QuickMatchGameView } from "../quickMatch/QuickMatchGameView";
import { fetchBlockStatus } from "../../features/blocking/api";

export default function PlayWithFriend() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const sendChallenge = useFriendChallengeStore((state) => state.sendChallenge);
  const lastInfo = useFriendChallengeStore((state) => state.lastInfo);
  const clearInfo = useFriendChallengeStore((state) => state.clearInfo);
  const routeState = (location.state || {}) as {
    preselectedFriendId?: unknown;
    preselectedFriendName?: unknown;
    opponentId?: unknown;
    opponentName?: unknown;
  };
  const routeParams = new URLSearchParams(location.search);
  const preselectedFriendId = String(
    routeState.preselectedFriendId ??
      routeState.opponentId ??
      routeParams.get("friendId") ??
      "",
  ).trim();
  const preselectedFriendName = String(
    routeState.preselectedFriendName ??
      routeState.opponentName ??
      routeParams.get("friendName") ??
      "",
  ).trim();

  const {
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
    threeCheckState,
    isRated,
    lastGameOver,
    isConnected,
    statusMessage,
    chatMessages,
    playerClockSeed,
    opponentClockSeed,
    clockResetToken,
    isClockPaused,
    sendChatMessage,
  } = useFriendOnlineGame();

  const [playAs, setPlayAs] = useState<"white" | "black" | "random">("white");
  const [timeControl, setTimeControl] = useState({
    initial: 600,
    increment: 0,
  });
  const [friendName, setFriendName] = useState(
    preselectedFriendName || "Friend",
  );
  const [isSendingChallenge, setIsSendingChallenge] = useState(false);
  const [challengeError, setChallengeError] = useState<string | null>(null);

  const isUnratedFriendVariant = (value: string) =>
    value === "threeCheck" ||
    value === "three-check" ||
    value === "three_check" ||
    value === "kingOfHill" ||
    value === "king-of-hill" ||
    value === "king_of_hill" ||
    value === "kingofhill";

  useEffect(() => {
    if (!preselectedFriendName) return;
    setFriendName(preselectedFriendName);
  }, [preselectedFriendName]);

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

    const blockStatus = await fetchBlockStatus(payload.toUserId);
    if (
      blockStatus.isAnyBlocked ||
      blockStatus.isBlocked ||
      blockStatus.isBlockedByTarget
    ) {
      setChallengeError("You cannot challenge this player.");
      setIsSendingChallenge(false);
      return;
    }

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

    const blockStatus = await fetchBlockStatus(rematchTargetUserId);
    if (
      blockStatus.isAnyBlocked ||
      blockStatus.isBlocked ||
      blockStatus.isBlockedByTarget
    ) {
      setChallengeError("You cannot challenge this player.");
      setIsSendingChallenge(false);
      return;
    }

    const response = await sendChallenge({
      toUserId: rematchTargetUserId,
      toName: rematchTargetName,
      gameType: gameType || "standard",
      rated: isUnratedFriendVariant(gameType || "standard") ? false : isRated,
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

  const isNormalFriendGame = String(matchVariant || "standard") === "standard";

  // If game started, show the game board
  if (gameStarted) {
    if (isNormalFriendGame) {
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
          gameOverElo={isRated ? lastGameOver?.elo ?? null : null}
          onSquareClick={onSquareClick}
          onPieceDrop={onPieceDrop}
          onCancelSelection={onCancelSelection}
          isDraggablePiece={isDraggablePiece}
          setOpponentTime={setOpponentTime}
          setPlayerTime={setPlayerTime}
          playerClockSeed={playerClockSeed}
          opponentClockSeed={opponentClockSeed}
          clockResetToken={
            typeof clockResetToken === "number"
              ? clockResetToken
              : Number(clockResetToken) || 0
          }
          isClockPaused={isClockPaused}
          onTimeOut={timeOut}
          onResign={resign}
          onSendChatMessage={sendChatMessage}
          onRematch={handleTryAgain}
          onNewGame={handleNewGame}
          onLeave={leaveGame}
          opponentName={opponentName || friendName}
          variant="standard"
          promotionState={promotionState}
          onPromotionPieceSelect={onPromotionPieceSelect}
        />
      );
    }

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
        playerColor={playerColor}
        isPlayerTurn={isPlayerTurn}
        savedGameId={savedGameId}
        historyPersistenceStatus={historyPersistenceStatus}
        showGameOverModal={showGameOverModal}
        optionSquares={optionSquares}
        preMoveSquares={preMoveSquares}
        playerRating={playerRating}
        opponentRating={opponentRating}
        statusMessage={statusMessage}
        chatMessages={chatMessages}
        onSendChatMessage={sendChatMessage}
        onSquareClick={onSquareClick}
        onPieceDrop={onPieceDrop}
        onCancelSelection={onCancelSelection}
        isDraggablePiece={isDraggablePiece}
        promotionState={promotionState}
        onPromotionPieceSelect={onPromotionPieceSelect}
        setOpponentTime={setOpponentTime}
        setPlayerTime={setPlayerTime}
        playerClockSeed={playerClockSeed}
        opponentClockSeed={opponentClockSeed}
        clockResetToken={clockResetToken}
        isClockPaused={isClockPaused}
        onTimeOut={timeOut}
        onResign={resign}
        onTryAgain={handleTryAgain}
        onNewGame={handleNewGame}
        onLeave={leaveGame}
        variant={matchVariant}
        threeCheckState={threeCheckState}
        gameOverElo={isRated ? lastGameOver?.elo ?? null : null}
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
      preselectedFriendId={preselectedFriendId || null}
      preselectedFriendName={preselectedFriendName || null}
    />
  );
}
