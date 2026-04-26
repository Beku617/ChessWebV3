import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { LessonPanel } from "../components/learn/LessonPanel";
import { fetchLearnLesson, submitLearnLessonStep } from "../features/learn/api";
import { useGameplayPreferences } from "../hooks/useGameplayPreferences";
import { playChessMoveSound, playGameplaySound } from "../utils/moveSounds";
import type {
  LearnLessonDetail,
  LearnLessonProgress,
  LearnSubmitStepResponse,
} from "../features/learn/types";

type FeedbackKind = "correct" | "wrong" | "info";

interface FeedbackState {
  kind: FeedbackKind;
  message: string;
}

function clampIndex(value: number, max: number) {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(max, Math.floor(value));
}

export default function LearnLesson() {
  const { courseSlug, lessonSlug } = useParams<{
    courseSlug: string;
    lessonSlug: string;
  }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const lessonLoadFailedMessage = t(
    "learn.lessonLoadFailed",
    "Failed to load lesson.",
  );
  const { allowClickInput, allowDragInput, showLegalMoves } =
    useGameplayPreferences();

  const [lessonData, setLessonData] = useState<LearnLessonDetail | null>(null);
  const [progress, setProgress] = useState<LearnLessonProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [boardFen, setBoardFen] = useState("");
  const [boardSize, setBoardSize] = useState(560);
  const [isSubmittingMove, setIsSubmittingMove] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [moveFrom, setMoveFrom] = useState<string | null>(null);
  const [moveSquares, setMoveSquares] = useState<
    Record<string, React.CSSProperties>
  >({});
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(
    null,
  );
  const boardViewportRef = useRef<HTMLDivElement | null>(null);
  const lessonBoardId = useId().replace(/:/g, "");

  useEffect(() => {
    const node = boardViewportRef.current;
    if (!node) return;

    const resizeBoard = () => {
      const rect = node.getBoundingClientRect();
      const size = Math.max(280, Math.floor(Math.min(rect.width, rect.height)));
      setBoardSize((prev) => (Math.abs(prev - size) > 1 ? size : prev));
    };

    resizeBoard();

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => resizeBoard())
        : null;

    observer?.observe(node);
    window.addEventListener("resize", resizeBoard);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", resizeBoard);
    };
  }, [loading, lessonData?.lesson.id]);

  useEffect(() => {
    if (!courseSlug || !lessonSlug) return;
    let cancelled = false;

    const loadLesson = async () => {
      try {
        setLoading(true);
        setError("");
        const data = await fetchLearnLesson(courseSlug, lessonSlug);
        if (cancelled) return;
        setLessonData(data);
        setProgress(data.progress);
        const maxStepIndex = Math.max(0, data.steps.length - 1);
        const startIndex = clampIndex(data.progress.currentStepIndex, maxStepIndex);
        setCurrentStepIndex(startIndex);
        setBoardFen(data.steps[startIndex]?.fen || "");
        setFeedback(null);
        setShowHint(false);
        setMoveFrom(null);
        setMoveSquares({});
        setLastMove(null);
      } catch (err) {
        if (cancelled) return;
        setLessonData(null);
        setProgress(null);
        setError(
          err instanceof Error
            ? err.message
            : lessonLoadFailedMessage,
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadLesson();
    return () => {
      cancelled = true;
    };
  }, [courseSlug, lessonLoadFailedMessage, lessonSlug]);

  const currentStep = useMemo(() => {
    if (!lessonData || lessonData.steps.length === 0) return null;
    return lessonData.steps[currentStepIndex] || null;
  }, [lessonData, currentStepIndex]);

  const visibleLessons = useMemo(() => {
    if (!lessonData) return [];
    return lessonData.lessons.filter((entry) => Number(entry.stepCount || 0) > 0);
  }, [lessonData]);

  useEffect(() => {
    if (!currentStep) return;
    setBoardFen(currentStep.fen);
    setShowHint(false);
    setMoveFrom(null);
    setMoveSquares({});
    setLastMove(null);
  }, [currentStep?.id]);

  const currentLessonOrder = useMemo(() => {
    if (!lessonData) return -1;
    return visibleLessons.findIndex((entry) => entry.slug === lessonData.lesson.slug);
  }, [lessonData, visibleLessons]);

  const hasPrevLesson = currentLessonOrder > 0;
  const nextLesson =
    lessonData != null && currentLessonOrder >= 0
      ? visibleLessons[currentLessonOrder + 1]
      : undefined;
  const hasNextLesson = !!nextLesson;

  const courseProgress = progress?.courseProgress || lessonData?.progress.courseProgress;
  const lessonCompleted = progress?.lessonCompleted ?? lessonData?.progress.lessonCompleted ?? false;
  const completedStepIndexes =
    progress?.completedStepIndexes || lessonData?.progress.completedStepIndexes || [];
  const boardSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = { ...moveSquares };
    if (lastMove) {
      styles[lastMove.from] = { backgroundColor: "rgba(250, 204, 21, 0.45)" };
      styles[lastMove.to] = { backgroundColor: "rgba(16, 185, 129, 0.35)" };
    }
    return styles;
  }, [lastMove, moveSquares]);

  const clearMoveSelection = () => {
    setMoveFrom(null);
    setMoveSquares({});
  };

  const highlightMoveOptions = (sourceSquare: string) => {
    if (!currentStep) return false;
    const chess = new Chess(currentStep.fen);
    const piece = chess.get(sourceSquare as Square);
    if (!piece || piece.color !== chess.turn()) {
      clearMoveSelection();
      return false;
    }

    const moves = chess.moves({ square: sourceSquare as Square, verbose: true });
    if (moves.length === 0) {
      clearMoveSelection();
      return false;
    }

    const optionStyles = moves.reduce<Record<string, React.CSSProperties>>(
      (styles, move) => {
        if (!showLegalMoves) return styles;
        const hasPiece = !!chess.get(move.to as Square);
        styles[move.to] = hasPiece
          ? {
              boxShadow:
                "inset 0 0 0 2px rgba(31, 41, 55, 0.58), inset 0 0 0 5px rgba(31, 41, 55, 0.2)",
            }
          : {
              background:
                "radial-gradient(circle, rgba(31, 41, 55, 0.26) 34%, rgba(0, 0, 0, 0) 36%)",
              borderRadius: "50%",
            };
        return styles;
      },
      {},
    );

    setMoveFrom(sourceSquare);
    setMoveSquares({
      [sourceSquare]: { backgroundColor: "rgba(250, 204, 21, 0.38)" },
      ...optionStyles,
    });
    return true;
  };

  const submitMove = async (
    sourceSquare: string,
    targetSquare: string,
  ): Promise<LearnSubmitStepResponse | null> => {
    if (!courseSlug || !lessonSlug || !currentStep) return null;

    const chess = new Chess(currentStep.fen);
    const move = chess.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: "q",
    });

    if (!move) return null;

    setBoardFen(chess.fen());
    setLastMove({ from: sourceSquare, to: targetSquare });
    setIsSubmittingMove(true);

    try {
      const response = await submitLearnLessonStep(courseSlug, lessonSlug, {
        stepIndex: currentStepIndex,
        move: move.san,
        san: move.san,
        uci: `${sourceSquare}${targetSquare}${move.promotion || ""}`,
        from: sourceSquare,
        to: targetSquare,
        promotion: move.promotion || "",
      });
      return response;
    } catch (err) {
      setFeedback({
        kind: "wrong",
        message:
          err instanceof Error
            ? err.message
            : t("learn.submitMoveFailed", "Failed to submit lesson move."),
      });
      setBoardFen(currentStep.fen);
      setLastMove(null);
      return null;
    } finally {
      setIsSubmittingMove(false);
    }
  };

  const onDrop = (sourceSquare: string, targetSquare: string) => {
    if (isSubmittingMove || !currentStep || lessonCompleted) return false;
    const probe = new Chess(currentStep.fen);
    const moveResult = probe.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: "q",
    });
    if (!moveResult) {
      playGameplaySound("illegal");
      return false;
    }

    playChessMoveSound(moveResult);
    clearMoveSelection();
    void (async () => {
      const result = await submitMove(sourceSquare, targetSquare);
      if (!result) return;

      setProgress(result.progress);

      if (result.isCorrect) {
        setFeedback({ kind: "correct", message: result.feedback });
        setBoardFen(result.boardFenAfterMove || currentStep.fen);

        if (result.lessonCompleted && lessonData) {
          setLessonData({
            ...lessonData,
            lessons: lessonData.lessons.map((lesson) =>
              lesson.slug === lessonData.lesson.slug
                ? { ...lesson, isCompleted: true }
                : lesson,
            ),
          });
        }

        if (
          !result.lessonCompleted &&
          result.nextStepIndex > currentStepIndex
        ) {
          setTimeout(() => {
            setCurrentStepIndex(
              clampIndex(result.nextStepIndex, Math.max(0, (lessonData?.steps.length || 1) - 1)),
            );
            setFeedback(null);
          }, 650);
        }
      } else {
        playGameplaySound("illegal");
        setFeedback({ kind: "wrong", message: result.feedback });

        if (result.keepPositionOnWrong) {
          setBoardFen(result.boardFenAfterMove || currentStep.fen);
        } else {
          setBoardFen(result.resetFen || currentStep.fen);
          setLastMove(null);
        }
      }
    })();

    return true;
  };

  const onSquareClick = (square: string) => {
    if (!allowClickInput) return;
    if (isSubmittingMove || !currentStep || lessonCompleted) return;

    if (!moveFrom) {
      void highlightMoveOptions(square);
      return;
    }

    if (moveFrom === square) {
      clearMoveSelection();
      return;
    }

    const chess = new Chess(currentStep.fen);
    const clickedPiece = chess.get(square as Square);
    if (clickedPiece && clickedPiece.color === chess.turn()) {
      void highlightMoveOptions(square);
      return;
    }

    const moved = onDrop(moveFrom, square);
    if (moved) {
      clearMoveSelection();
    }
  };

  const retryCurrentStep = () => {
    if (!currentStep) return;
    setBoardFen(currentStep.fen);
    clearMoveSelection();
    setLastMove(null);
    setFeedback(null);
    setShowHint(false);
  };

  const openLessonBySlug = (slug: string) => {
    if (!courseSlug) return;
    navigate(`/learn/${courseSlug}/${slug}`);
  };

  const openPrevLesson = () => {
    if (!lessonData || !hasPrevLesson) return;
    const target = visibleLessons[currentLessonOrder - 1];
    if (target) openLessonBySlug(target.slug);
  };

  const openNextLesson = () => {
    if (!nextLesson) return;
    openLessonBySlug(nextLesson.slug);
  };

  const retryLesson = () => {
    if (!lessonData || lessonData.steps.length === 0) return;
    setCurrentStepIndex(0);
    setBoardFen(lessonData.steps[0].fen);
    setFeedback(null);
    setShowHint(false);
    setMoveFrom(null);
    setMoveSquares({});
    setLastMove(null);
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
      </div>
    );
  }

  if (error || !lessonData || !currentStep || !courseProgress) {
    return (
      <div className="max-w-2xl mx-auto py-14 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center">
          <BookOpen className="w-7 h-7 text-slate-400" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-slate-100">
          {t("learn.lessonNotFound", "Lesson Not Found")}
        </h1>
        <p className="mt-2 text-slate-400">
          {error ||
            t(
              "learn.lessonNotFoundDescription",
              "The requested lesson could not be loaded.",
            )}
        </p>
        <button
          onClick={() => navigate("/learn")}
          className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500/20 border border-brand-400/35 text-brand-200 hover:bg-brand-500/30"
        >
          {t("learn.backToLearn", "Back to Learn")}
        </button>
      </div>
    );
  }

  const feedbackClass =
    feedback?.kind === "correct"
      ? "border-brand-400/35 bg-brand-500/10 text-brand-200"
      : feedback?.kind === "wrong"
        ? "border-rose-400/35 bg-rose-500/10 text-rose-200"
        : "border-cyan-400/35 bg-cyan-500/10 text-cyan-200";

  return (
    <div className="h-full min-h-0 px-4 sm:px-5 lg:px-6 xl:px-8 py-4 lg:py-5 overflow-y-auto xl:overflow-hidden">
      <div className="h-full min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(0,780px)_minmax(420px,1fr)] gap-3 lg:gap-4 items-start xl:items-stretch">
        <section className="min-h-[420px] xl:min-h-0 rounded-2xl border border-slate-800/90 bg-slate-950/85 p-2.5 sm:p-3 flex items-center justify-center xl:justify-start">
          <div ref={boardViewportRef} className="w-full h-full min-h-[380px] xl:min-h-0 flex items-center justify-center xl:justify-start">
            <div className="rounded-xl overflow-hidden shadow-[0_16px_40px_rgba(2,6,23,0.7)] border border-slate-800">
              <Chessboard
                id={`learn-lesson-board-${lessonBoardId}`}
                allowDragOutsideBoard={false}
                position={boardFen}
                onPieceDrop={(sourceSquare, targetSquare) => {
                  if (!allowDragInput) return false;
                  return onDrop(sourceSquare, targetSquare);
                }}
                onSquareClick={(square) => {
                  if (!allowClickInput) return;
                  onSquareClick(square);
                }}
                onSquareRightClick={clearMoveSelection}
                boardOrientation={currentStep.boardOrientation || "white"}
                boardWidth={boardSize}
                arePiecesDraggable={
                  allowDragInput && !isSubmittingMove && !lessonCompleted
                }
                customBoardStyle={{ borderRadius: "10px" }}
                customSquareStyles={boardSquareStyles}
                dropOffBoardAction="snapback"
              />
            </div>
          </div>
        </section>

        <aside className="min-w-0 xl:min-h-0 xl:h-full flex flex-col gap-3 lg:gap-4">
          <LessonPanel
            courseTitle={lessonData.course.title}
            lessons={visibleLessons}
            currentLessonSlug={lessonData.lesson.slug}
            courseProgress={courseProgress}
            onBackToCatalog={() => navigate("/learn")}
            onOpenLesson={openLessonBySlug}
            onPrevLesson={openPrevLesson}
            onNextLesson={openNextLesson}
            onRetryLesson={retryLesson}
            hasPrevLesson={hasPrevLesson}
            hasNextLesson={!!hasNextLesson}
            fillHeight={false}
            showNavigationFooter={false}
          />

          <section className="min-w-0 min-h-0 xl:flex-1 rounded-2xl border border-slate-800/90 bg-slate-950/85 flex flex-col overflow-hidden">
            <div className="px-3.5 py-3 space-y-3 min-h-0 flex-1 overflow-y-auto">
              <div className="space-y-1.5">
                <p className="text-base text-slate-200 leading-snug">{currentStep.instructionText}</p>
                <p className="text-sm text-slate-400 leading-relaxed">
                  {currentStep.explanationBeforeMove}
                </p>
              </div>

              {showHint && currentStep.hintText && (
                <div className="rounded-xl border border-cyan-400/35 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200">
                  {t("learn.hint", "Hint")}: {currentStep.hintText}
                </div>
              )}

              {feedback && (
                <div className={`rounded-xl border px-3 py-2 text-sm ${feedbackClass}`}>
                  {feedback.message}
                </div>
              )}

              {lessonCompleted && (
                <div className="rounded-xl border border-brand-400/35 bg-brand-500/10 px-3 py-2 text-sm text-brand-200 inline-flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  {t("learn.lessonComplete", "Lesson complete.")}
                </div>
              )}
            </div>

            <div className="px-3.5 py-2.5 border-t border-slate-800 space-y-2">
              <div className="flex flex-wrap gap-2">
                {currentStep.hintText && (
                  <button
                    onClick={() => setShowHint((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 text-xs hover:border-slate-600"
                  >
                    <Lightbulb className="w-3.5 h-3.5" />
                    {showHint
                      ? t("learn.hideHint", "Hide Hint")
                      : t("learn.showHint", "Show Hint")}
                  </button>
                )}

                <button
                  onClick={retryCurrentStep}
                  disabled={currentStep.allowRetry === false}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 text-xs hover:border-slate-600 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {t("learn.retryStep", "Retry Step")}
                </button>

                {lessonCompleted && (
                  <button
                    onClick={() => navigate("/learn")}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 text-xs hover:border-slate-600"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    {t("learn.backToLearn", "Back to Learn")}
                  </button>
                )}
              </div>

              {isSubmittingMove && (
                <div className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {t("learn.checkingMove", "Checking move...")}
                </div>
              )}
            </div>
          </section>

          <div className="mt-auto rounded-2xl border border-slate-800/90 bg-slate-950/85 p-2.5 grid grid-cols-2 gap-2">
            <button
              onClick={openPrevLesson}
              disabled={!hasPrevLesson}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs bg-slate-900 border border-slate-700 text-slate-300 hover:border-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              {t("learn.previous", "Previous")}
            </button>
            {lessonCompleted && hasNextLesson ? (
              <button
                onClick={openNextLesson}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs bg-brand-500/20 border border-brand-400/35 text-brand-200 hover:bg-brand-500/30"
              >
                <ChevronRight className="w-3.5 h-3.5" />
                {t("learn.nextLesson", "Next Lesson")}
              </button>
            ) : lessonCompleted ? (
              <button
                onClick={() => navigate("/learn")}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs bg-slate-900 border border-slate-700 text-slate-300 hover:border-slate-600"
              >
                <BookOpen className="w-3.5 h-3.5" />
                {t("learn.backToLearn", "Back to Learn")}
              </button>
            ) : (
              <button
                onClick={retryLesson}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs bg-slate-900 border border-slate-700 text-slate-300 hover:border-slate-600"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {t("learn.retryLesson", "Retry Lesson")}
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

