import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Chess } from "chess.js";
import { useAuthStore } from "../../store/authStore";
import { useGameplayPreferences } from "../../hooks/useGameplayPreferences";
import {
  playChessMoveSound,
  playGameplaySound,
  playUiSound,
} from "../../utils/moveSounds";
import {
  fetchPuzzleById,
  fetchPuzzleSelection,
  fetchPuzzleStats,
  localDateKey,
  submitPuzzleAttempt,
  togglePuzzleBookmark,
} from "../puzzles/api";
import type { PuzzleMode, PuzzleUserStats } from "../puzzles/types";
import type { PuzzleStatus, TrainerAttemptFeedback } from "./types";
import {
  fenStartsWithWhite,
  normalizeFen,
  normalizeSolution,
  safeLoadGame,
  applyMoveString,
  moveStringToMove,
} from "./utils";

function isPuzzleMode(value: string | null): value is PuzzleMode {
  return (
    value === "rated" ||
    value === "review" ||
    value === "random" ||
    value === "library"
  );
}

function resolveMode(
  search: string,
  fallback: PuzzleMode = "rated",
): PuzzleMode {
  const queryMode = new URLSearchParams(search).get("mode");
  if (isPuzzleMode(queryMode)) return queryMode;
  return fallback;
}

function toPublicStatsFromAttempt(
  previous: PuzzleUserStats | null,
  payload: {
    user: {
      puzzleElo: number;
      puzzleBestElo: number;
      puzzleAttempts: number;
      puzzleSolved: number;
      puzzleFailed: number;
      puzzleSkipped: number;
    };
    stats: {
      dailyGoal: number;
      solvedToday: number;
      currentStreak: number;
      puzzleXP: number;
      reviewDueCount: number;
      graceTokens: number;
    };
  },
): PuzzleUserStats {
  return {
    rating: payload.user.puzzleElo,
    bestRating: payload.user.puzzleBestElo,
    attempts: payload.user.puzzleAttempts,
    solved: payload.user.puzzleSolved,
    failed: payload.user.puzzleFailed,
    skipped: payload.user.puzzleSkipped,
    solvedToday: payload.stats.solvedToday,
    streak: payload.stats.currentStreak,
    provisional: payload.user.puzzleAttempts < 20,
    dailyGoal: payload.stats.dailyGoal,
    puzzleXP: payload.stats.puzzleXP,
    reviewDueCount: payload.stats.reviewDueCount,
    graceTokens: payload.stats.graceTokens,
    weakMotifs: previous?.weakMotifs || [],
  };
}

export function usePuzzleTrainer() {
  const navigate = useNavigate();
  const location = useLocation();
  const { puzzleId } = useParams<{ puzzleId?: string }>();
  const { user, setUser } = useAuthStore();
  const { allowClickInput, showLegalMoves } = useGameplayPreferences();

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<PuzzleStatus>("loading");
  const [stats, setStats] = useState<PuzzleUserStats | null>(null);
  const [selectionReason, setSelectionReason] = useState("");
  const [hintLevel, setHintLevel] = useState(0);
  const [attemptFeedback, setAttemptFeedback] =
    useState<TrainerAttemptFeedback | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const [refreshSeed, setRefreshSeed] = useState(0);
  const [currentPuzzle, setCurrentPuzzle] = useState<any | null>(null);
  const [game, setGame] = useState<Chess>(new Chess());
  const [fenError, setFenError] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(
    null,
  );
  const [moveFrom, setMoveFrom] = useState<string | null>(null);
  const [moveSquares, setMoveSquares] = useState<
    Record<string, React.CSSProperties>
  >({});
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [solutionLineVisible, setSolutionLineVisible] = useState(false);
  const [isSolutionAnimating, setIsSolutionAnimating] = useState(false);
  const [solutionRevealSubmitted, setSolutionRevealSubmitted] = useState(false);
  const solutionAnimationRunIdRef = useRef(0);

  const waitFor = useCallback(
    (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    [],
  );

  const activeMode = useMemo<PuzzleMode>(() => {
    if (puzzleId) {
      return resolveMode(location.search, "library");
    }
    return resolveMode(location.search, "rated");
  }, [location.search, puzzleId]);

  const puzzleFen = useMemo(
    () => (currentPuzzle ? normalizeFen(currentPuzzle.fen) : ""),
    [currentPuzzle],
  );

  const puzzleStartsWithWhite = useMemo(
    () =>
      currentPuzzle
        ? fenStartsWithWhite(currentPuzzle.fen, currentPuzzle.isWhiteToMove)
        : true,
    [currentPuzzle],
  );

  const solutionMoves = useMemo(
    () =>
      currentPuzzle ? normalizeSolution(currentPuzzle.solution || []) : [],
    [currentPuzzle],
  );

  const puzzleElo = stats?.rating ?? user?.puzzleElo ?? 1200;
  const streak = stats?.streak ?? 0;
  const reviewDueCount = stats?.reviewDueCount ?? 0;

  useEffect(() => {
    if (status !== "solving") return;
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [status, startTime]);

  const loadStats = useCallback(async () => {
    try {
      const nextStats = await fetchPuzzleStats();
      setStats(nextStats);
    } catch (error) {
      console.error("Failed to fetch puzzle stats:", error);
      setStats((prev) => prev || null);
    }
  }, []);

  const resetBoardState = useCallback(
    (puzzle: any) => {
      solutionAnimationRunIdRef.current += 1;
      setIsSolutionAnimating(false);
      const normalizedFen = normalizeFen(puzzle.fen);
      const nextGame = safeLoadGame(normalizedFen, setFenError);
      setGame(nextGame);
      setStatus("solving");
      setHintLevel(0);
      setCurrentMoveIndex(0);
      setLastMove(null);
      setStartTime(Date.now());
      setElapsedTime(0);
      setMoveFrom(null);
      setMoveSquares({});
      setAttemptFeedback(null);
      setNetworkError(null);
      setSolutionLineVisible(false);
      setSolutionRevealSubmitted(false);
    },
    [setFenError],
  );

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    return () => {
      solutionAnimationRunIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPuzzle() {
      setLoading(true);
      setStatus("loading");
      setNetworkError(null);

      try {
        if (puzzleId) {
          const puzzle = await fetchPuzzleById(puzzleId);
          if (cancelled) return;
          setCurrentPuzzle(puzzle);
          setSelectionReason(
            activeMode === "library" ? "Library puzzle" : "Selected puzzle",
          );
          resetBoardState(puzzle);
          setLoading(false);
          return;
        }

        const selection = await fetchPuzzleSelection(activeMode, {
          localDateKey: localDateKey(),
          includeMastered: false,
        });

        if (cancelled) return;
        if (!selection.puzzle) {
          setCurrentPuzzle(null);
          setSelectionReason(
            selection.reason ||
              (activeMode === "review"
                ? "No reviews due. Try a new rated puzzle."
                : "No puzzle available right now."),
          );
          return;
        }

        setCurrentPuzzle(selection.puzzle);
        setSelectionReason(
          selection.reason || "New rated puzzle near your level",
        );
        resetBoardState(selection.puzzle);
      } catch (error) {
        console.error("Failed to load puzzle:", error);
        if (cancelled) return;
        setCurrentPuzzle(null);
        setNetworkError(
          error instanceof Error ? error.message : "Failed to load puzzle",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPuzzle();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzleId, activeMode, refreshSeed, resetBoardState]);

  const submitResult = useCallback(
    async (
      result: "SOLVED" | "FAILED" | "SKIPPED" | "ABANDONED",
      options: {
        movesPlayed?: string[];
        solutionShown?: boolean;
      } = {},
    ) => {
      if (!currentPuzzle || !user) return null;

      try {
        const response = await submitPuzzleAttempt(currentPuzzle._id, {
          mode: activeMode,
          result,
          movesPlayed: options.movesPlayed ?? game.history(),
          timeMs: Math.max(0, Date.now() - startTime),
          hintsUsed: hintLevel,
          solutionShown: options.solutionShown === true,
          localDateKey: localDateKey(),
        });

        setUser({
          ...user,
          puzzleElo: response.user.puzzleElo,
          puzzleBestElo: response.user.puzzleBestElo,
          puzzleAttempts: response.user.puzzleAttempts,
          puzzleSolved: response.user.puzzleSolved,
          puzzleFailed: response.user.puzzleFailed,
          puzzleSkipped: response.user.puzzleSkipped,
        });

        setStats((previous) => toPublicStatsFromAttempt(previous, response));

        setAttemptFeedback({
          xpAwarded: response.attempt.xpAwarded,
          ratingChange: response.attempt.ratingChange,
          messages: response.meta.messages || [],
          statusAfter: response.attempt.statusAfter,
          hintsUsed: response.attempt.hintsUsed,
          repeatDecayMultiplier: response.attempt.repeatDecayMultiplier,
          isRepeat: response.attempt.isRepeat,
          isRated: response.attempt.isRated,
        });

        setCurrentPuzzle((previous: any) => {
          if (!previous) return previous;
          return {
            ...previous,
            userState: response.state,
          };
        });

        return response;
      } catch (error) {
        console.error("Failed to submit puzzle attempt:", error);
        setNetworkError(
          error instanceof Error ? error.message : "Failed to submit attempt",
        );
        return null;
      }
    },
    [activeMode, currentPuzzle, game, hintLevel, setUser, startTime, user],
  );

  const handlePuzzleSolved = useCallback(
    (movesPlayed: string[]) => {
      playUiSound("puzzleCorrect");
      setStatus("correct");
      void submitResult("SOLVED", { movesPlayed });
    },
    [submitResult],
  );

  const handleWrongMove = useCallback(
    ({
      movesPlayed,
      sourceSquare,
      targetSquare,
      wrongFen,
      revertFen,
    }: {
      movesPlayed: string[];
      sourceSquare: string;
      targetSquare: string;
      wrongFen: string;
      revertFen: string;
    }) => {
      const wrongPosition = new Chess(wrongFen);
      setGame(wrongPosition);
      setLastMove({ from: sourceSquare, to: targetSquare });
      playUiSound("puzzleWrong");
      setStatus("wrong");
      void submitResult("FAILED", { movesPlayed });

      setTimeout(() => {
        setGame(new Chess(revertFen));
        setLastMove(null);
        setStatus("solving");
      }, 260);
    },
    [submitResult],
  );

  const onDrop = useCallback(
    (sourceSquare: string, targetSquare: string) => {
      if (!currentPuzzle || status !== "solving" || isSolutionAnimating) {
        return false;
      }
      if (!sourceSquare || !targetSquare || sourceSquare === targetSquare) {
        return false;
      }

      const legalProbe = new Chess(game.fen());
      const attemptedMove = legalProbe.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q",
      });
      if (!attemptedMove) {
        // Illegal board interaction is not a puzzle attempt.
        return false;
      }

      const expectedMoveStr = solutionMoves[currentMoveIndex];
      if (!expectedMoveStr) return false;

      const expectedMove = moveStringToMove(game.fen(), expectedMoveStr);
      if (!expectedMove) return false;

      if (
        sourceSquare !== expectedMove.from ||
        targetSquare !== expectedMove.to
      ) {
        handleWrongMove({
          movesPlayed: [...game.history(), attemptedMove.san],
          sourceSquare,
          targetSquare,
          wrongFen: legalProbe.fen(),
          revertFen: game.fen(),
        });
        return true;
      }

      playChessMoveSound(attemptedMove);
      setGame(legalProbe);
      setLastMove({ from: sourceSquare, to: targetSquare });

      const nextMoveIndex = currentMoveIndex + 1;
      setCurrentMoveIndex(nextMoveIndex);

      if (nextMoveIndex >= solutionMoves.length) {
        handlePuzzleSolved(solutionMoves.slice(0, nextMoveIndex));
        return true;
      }

      const opponentMoveStr = solutionMoves[nextMoveIndex];
      if (!opponentMoveStr) {
        handlePuzzleSolved(solutionMoves.slice(0, nextMoveIndex));
        return true;
      }

      setTimeout(() => {
        const opponentGame = new Chess(legalProbe.fen());
        const opponentMove = applyMoveString(opponentGame, opponentMoveStr);
        if (!opponentMove) return;

        playChessMoveSound(opponentMove, { isOpponentMove: true });
        setGame(opponentGame);
        setLastMove({ from: opponentMove.from, to: opponentMove.to });
        setCurrentMoveIndex(nextMoveIndex + 1);

        if (nextMoveIndex + 1 >= solutionMoves.length) {
          handlePuzzleSolved(solutionMoves.slice(0, nextMoveIndex + 1));
        }
      }, 350);

      return true;
    },
    [
      currentMoveIndex,
      currentPuzzle,
      game,
      handlePuzzleSolved,
      handleWrongMove,
      isSolutionAnimating,
      solutionMoves,
      status,
    ],
  );

  const retryPuzzle = useCallback(() => {
    if (!currentPuzzle) return;
    resetBoardState(currentPuzzle);
  }, [currentPuzzle, resetBoardState]);

  const nextPuzzle = useCallback(async () => {
    if (!currentPuzzle) return;

    if (
      status === "solving" &&
      (currentMoveIndex > 0 || hintLevel > 0 || game.history().length > 0)
    ) {
      await submitResult("SKIPPED", { movesPlayed: game.history() });
    }

    if (puzzleId) {
      navigate(`/puzzles/train?mode=${activeMode}`);
      return;
    }

    setRefreshSeed((prev) => prev + 1);
  }, [
    activeMode,
    currentMoveIndex,
    currentPuzzle,
    game,
    hintLevel,
    navigate,
    puzzleId,
    status,
    submitResult,
  ]);

  const useHint = useCallback(() => {
    if (status !== "solving" || isSolutionAnimating || hintLevel >= 1) return;
    playGameplaySound("premove");
    setHintLevel((level) => Math.min(1, level + 1));
  }, [hintLevel, isSolutionAnimating, status]);

  const showSolution = useCallback(async () => {
    if (!currentPuzzle || isSolutionAnimating || status !== "solving") return;

    const runId = solutionAnimationRunIdRef.current + 1;
    solutionAnimationRunIdRef.current = runId;

    playGameplaySound("premove");
    setSolutionLineVisible(true);
    setIsSolutionAnimating(true);
    setMoveFrom(null);
    setMoveSquares({});
    setLastMove(null);

    if (!solutionRevealSubmitted) {
      setSolutionRevealSubmitted(true);
      void submitResult("ABANDONED", {
        movesPlayed: game.history(),
        solutionShown: true,
      });
    }

    const animationGame = safeLoadGame(normalizeFen(currentPuzzle.fen), setFenError);
    setGame(new Chess(animationGame.fen()));
    setCurrentMoveIndex(0);

    try {
      for (let index = 0; index < solutionMoves.length; index += 1) {
        if (solutionAnimationRunIdRef.current !== runId) return;

        const moveString = solutionMoves[index];
        const move = applyMoveString(animationGame, moveString);
        if (!move) break;

        playChessMoveSound(move, { isOpponentMove: index % 2 === 1 });
        setLastMove({ from: move.from, to: move.to });
        setCurrentMoveIndex(index + 1);
        setGame(new Chess(animationGame.fen()));
        await waitFor(900);
      }
    } finally {
      if (solutionAnimationRunIdRef.current === runId) {
        setIsSolutionAnimating(false);
      }
    }
  }, [
    currentPuzzle,
    game,
    isSolutionAnimating,
    setFenError,
    solutionRevealSubmitted,
    solutionMoves,
    status,
    submitResult,
    waitFor,
  ]);

  const toggleBookmark = useCallback(async () => {
    if (!currentPuzzle) return;
    try {
      const next = await togglePuzzleBookmark(
        currentPuzzle._id,
        !currentPuzzle.userState?.isBookmarked,
      );
      setCurrentPuzzle((previous: any) => {
        if (!previous) return previous;
        return {
          ...previous,
          userState: {
            ...previous.userState,
            isBookmarked: next.isBookmarked,
            badge: next.isBookmarked
              ? "bookmarked"
              : previous.userState?.badge || "new",
          },
        };
      });
    } catch (error) {
      console.error("Bookmark failed:", error);
    }
  }, [currentPuzzle]);

  const hintMove = useMemo(() => {
    if (hintLevel <= 0 || solutionMoves.length === 0 || !currentPuzzle)
      return null;
    const nextMove = solutionMoves[currentMoveIndex] || solutionMoves[0];
    const fromCurrent = moveStringToMove(game.fen(), nextMove);
    if (fromCurrent) return fromCurrent;
    return moveStringToMove(normalizeFen(currentPuzzle.fen), solutionMoves[0]);
  }, [currentMoveIndex, currentPuzzle, game, hintLevel, solutionMoves]);

  const highlightMoves = (from: string) => {
    const moves = game
      .moves({ square: from, verbose: true })
      .map((move) => move.to)
      .reduce<Record<string, React.CSSProperties>>((acc, square) => {
        if (!showLegalMoves) return acc;
        const hasPiece = !!game.get(square as any);
        acc[square] = hasPiece
          ? {
              boxShadow:
                "inset 0 0 0 2px rgba(31, 41, 55, 0.58), inset 0 0 0 5px rgba(31, 41, 55, 0.2)",
            }
          : {
              background:
                "radial-gradient(circle, rgba(31, 41, 55, 0.26) 34%, rgba(0, 0, 0, 0) 36%)",
              borderRadius: "50%",
            };
        return acc;
      }, {});
    setMoveSquares({
      [from]: { backgroundColor: "rgba(250, 204, 21, 0.38)" },
      ...moves,
    });
  };

  const handleSquareClick = useCallback(
    (square: string) => {
      if (!allowClickInput) return;
      if (status !== "solving" || isSolutionAnimating) return;

      if (!moveFrom) {
        const moves = game.moves({ square, verbose: true });
        if (moves.length === 0) return;
        setMoveFrom(square);
        highlightMoves(square);
        return;
      }

      if (moveFrom === square) {
        setMoveFrom(null);
        setMoveSquares({});
        return;
      }

      const legalTargets = game.moves({ square: moveFrom, verbose: true });
      const canMoveToSquare = legalTargets.some((move) => move.to === square);
      if (canMoveToSquare) {
        onDrop(moveFrom, square);
        setMoveFrom(null);
        setMoveSquares({});
        return;
      }

      const movesFromSquare = game.moves({ square, verbose: true });
      if (movesFromSquare.length > 0) {
        // Reselecting a different own piece is not a move attempt.
        setMoveFrom(square);
        highlightMoves(square);
        return;
      }

      // Illegal target click just clears the selection.
      playGameplaySound("illegal");
      setMoveFrom(null);
      setMoveSquares({});
    },
    [allowClickInput, game, isSolutionAnimating, moveFrom, onDrop, status],
  );

  const handleSquareRightClick = useCallback(() => {
    if (isSolutionAnimating) return;
    setMoveFrom(null);
    setMoveSquares({});
  }, [isSolutionAnimating]);

  const customSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = { ...moveSquares };

    if (lastMove) {
      styles[lastMove.from] = { backgroundColor: "rgba(255, 255, 0, 0.4)" };
      styles[lastMove.to] = { backgroundColor: "rgba(255, 255, 0, 0.4)" };
    }

    if (hintMove?.from && hintLevel >= 1) {
      styles[hintMove.from] = {
        ...(styles[hintMove.from] || {}),
        boxShadow: "inset 0 0 0 3px rgba(251, 191, 36, 0.95)",
      };
    }

    return styles;
  }, [hintLevel, hintMove, lastMove, moveSquares]);

  const hintPenaltyLabel = useMemo(() => {
    if (hintLevel <= 0) return "No hint penalty";
    return "Hint used: -20% XP";
  }, [hintLevel]);

  const openMode = useCallback(
    (mode: PuzzleMode) => {
      if (mode === "library") {
        navigate("/puzzles/library");
        return;
      }
      navigate(`/puzzles/train?mode=${mode}`);
    },
    [navigate],
  );

  return {
    loading,
    status,
    hintLevel,
    elapsedTime,
    game,
    fenError,
    networkError,
    currentPuzzle,
    solutionMoves,
    puzzleElo,
    streak,
    stats,
    reviewDueCount,
    selectionReason,
    attemptFeedback,
    activeMode,
    customSquareStyles,
    puzzleStartsWithWhite,
    hintMove,
    hintPenaltyLabel,
    solutionLineVisible,
    isSolutionAnimating,
    onDrop,
    handleSquareClick,
    handleSquareRightClick,
    nextPuzzle,
    retryPuzzle,
    useHint,
    showSolution,
    toggleBookmark,
    openMode,
    navigate,
  };
}
