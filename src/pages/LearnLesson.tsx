import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import {
  BookOpen,
  CheckCircle2,
  Compass,
  Lightbulb,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { LessonPanel } from "../components/learn/LessonPanel";
import { fetchLearnLesson, submitLearnLessonStep } from "../features/learn/api";
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
  const [canAdvanceStep, setCanAdvanceStep] = useState(false);
  const [pendingNextStepIndex, setPendingNextStepIndex] = useState<number | null>(
    null,
  );
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(
    null,
  );
  const boardViewportRef = useRef<HTMLDivElement | null>(null);

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
        setCanAdvanceStep(false);
        setPendingNextStepIndex(null);
        setLastMove(null);
      } catch (err) {
        if (cancelled) return;
        setLessonData(null);
        setProgress(null);
        setError(err instanceof Error ? err.message : "Failed to load lesson.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadLesson();
    return () => {
      cancelled = true;
    };
  }, [courseSlug, lessonSlug]);

  const currentStep = useMemo(() => {
    if (!lessonData || lessonData.steps.length === 0) return null;
    return lessonData.steps[currentStepIndex] || null;
  }, [lessonData, currentStepIndex]);

  useEffect(() => {
    if (!currentStep) return;
    setBoardFen(currentStep.fen);
    setShowHint(false);
    setCanAdvanceStep(false);
    setPendingNextStepIndex(null);
    setLastMove(null);
  }, [currentStep?.id]);

  const currentLessonOrder = useMemo(() => {
    if (!lessonData) return -1;
    return lessonData.lessons.findIndex((entry) => entry.slug === lessonData.lesson.slug);
  }, [lessonData]);

  const hasPrevLesson = currentLessonOrder > 0;
  const nextLesson =
    lessonData != null && currentLessonOrder >= 0
      ? lessonData.lessons[currentLessonOrder + 1]
      : undefined;
  const hasNextLesson = !!nextLesson;

  const courseProgress = progress?.courseProgress || lessonData?.progress.courseProgress;
  const lessonCompleted = progress?.lessonCompleted ?? lessonData?.progress.lessonCompleted ?? false;
  const completedStepIndexes =
    progress?.completedStepIndexes || lessonData?.progress.completedStepIndexes || [];

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
          err instanceof Error ? err.message : "Failed to submit lesson move.",
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
    const isLegal = probe.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: "q",
    });
    if (!isLegal) return false;

    void (async () => {
      const result = await submitMove(sourceSquare, targetSquare);
      if (!result) return;

      setProgress(result.progress);

      if (result.isCorrect) {
        setFeedback({ kind: "correct", message: result.feedback });
        setCanAdvanceStep(!result.lessonCompleted);
        setPendingNextStepIndex(result.nextStepIndex);
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
          result.autoAdvance &&
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
        setFeedback({ kind: "wrong", message: result.feedback });
        setCanAdvanceStep(false);
        setPendingNextStepIndex(null);

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

  const goToNextStep = () => {
    if (!lessonData || pendingNextStepIndex == null) return;
    const maxStepIndex = Math.max(0, lessonData.steps.length - 1);
    setCurrentStepIndex(clampIndex(pendingNextStepIndex, maxStepIndex));
    setFeedback(null);
    setCanAdvanceStep(false);
    setPendingNextStepIndex(null);
  };

  const retryCurrentStep = () => {
    if (!currentStep) return;
    setBoardFen(currentStep.fen);
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
    const target = lessonData.lessons[currentLessonOrder - 1];
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
    setCanAdvanceStep(false);
    setPendingNextStepIndex(null);
    setLastMove(null);
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
      </div>
    );
  }

  if (error || !lessonData || !currentStep || !courseProgress) {
    return (
      <div className="max-w-2xl mx-auto py-14 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center">
          <BookOpen className="w-7 h-7 text-slate-400" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-slate-100">Lesson Not Found</h1>
        <p className="mt-2 text-slate-400">
          {error || "The requested lesson could not be loaded."}
        </p>
        <button
          onClick={() => navigate("/learn")}
          className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-500/20 border border-teal-400/35 text-teal-200 hover:bg-teal-500/30"
        >
          Back to Learn
        </button>
      </div>
    );
  }

  const feedbackClass =
    feedback?.kind === "correct"
      ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-200"
      : feedback?.kind === "wrong"
        ? "border-rose-400/35 bg-rose-500/10 text-rose-200"
        : "border-cyan-400/35 bg-cyan-500/10 text-cyan-200";

  return (
    <div className="h-full min-h-0 px-3 sm:px-4 lg:px-5 py-3 lg:py-4 overflow-y-auto xl:overflow-hidden">
      <div className="h-full min-h-0 grid grid-cols-1 xl:grid-cols-[290px_minmax(0,1fr)_332px] gap-3 lg:gap-4">
        <aside className="min-w-0 min-h-0 rounded-2xl border border-slate-800/90 bg-slate-950/85 flex flex-col overflow-hidden">
          <div className="px-3.5 py-3 border-b border-slate-800 bg-[radial-gradient(circle_at_top_right,rgba(20,184,166,0.13),rgba(2,6,23,0.96)_55%)]">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-teal-300/85">
              <Compass className="w-3.5 h-3.5" />
              <span>{lessonData.course.category}</span>
            </div>
            <h1 className="mt-1.5 text-xl font-semibold text-slate-50 leading-tight">
              {lessonData.lesson.title}
            </h1>
            <p className="mt-1 text-xs text-slate-300/80 leading-snug line-clamp-3">
              {lessonData.lesson.subtitle || lessonData.lesson.description}
            </p>
          </div>

          <div className="px-3.5 py-2.5 border-b border-slate-800 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="px-2 py-1 rounded-md bg-slate-900 border border-slate-800">
              Step {currentStepIndex + 1} / {lessonData.steps.length}
            </span>
            <span className="px-2 py-1 rounded-md bg-slate-900 border border-slate-800">
              {currentStep.sideToMove === "white" ? "White to move" : "Black to move"}
            </span>
          </div>

          <div className="px-3.5 py-3 space-y-3 min-h-0 flex-1 overflow-y-auto">
            <h2 className="text-base font-semibold text-slate-100">
              {currentStep.title || "Instruction"}
            </h2>

            <div className="space-y-1.5">
              <p className="text-sm text-slate-200 leading-snug">{currentStep.instructionText}</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                {currentStep.explanationBeforeMove}
              </p>
            </div>

            {showHint && currentStep.hintText && (
              <div className="rounded-xl border border-cyan-400/35 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200">
                Hint: {currentStep.hintText}
              </div>
            )}

            {feedback && (
              <div className={`rounded-xl border px-3 py-2 text-sm ${feedbackClass}`}>
                {feedback.message}
              </div>
            )}

            {lessonCompleted && (
              <div className="rounded-xl border border-emerald-400/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200 inline-flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Lesson complete.
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
                  {showHint ? "Hide Hint" : "Show Hint"}
                </button>
              )}

              <button
                onClick={retryCurrentStep}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 text-xs hover:border-slate-600"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Retry Step
              </button>

              {canAdvanceStep && !lessonCompleted && (
                <button
                  onClick={goToNextStep}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-500/20 border border-teal-400/35 text-teal-200 text-xs hover:bg-teal-500/30"
                >
                  Next Step
                </button>
              )}

              {lessonCompleted && hasNextLesson && (
                <button
                  onClick={openNextLesson}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-500/20 border border-teal-400/35 text-teal-200 text-xs hover:bg-teal-500/30"
                >
                  Next Lesson
                </button>
              )}
            </div>

            {isSubmittingMove && (
              <div className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Checking move...
              </div>
            )}
          </div>
        </aside>

        <section className="min-h-[420px] xl:min-h-0 rounded-2xl border border-slate-800/90 bg-slate-950/85 p-2.5 sm:p-3 flex items-center justify-center">
          <div ref={boardViewportRef} className="w-full h-full min-h-[380px] xl:min-h-0 flex items-center justify-center">
            <div className="rounded-xl overflow-hidden shadow-[0_16px_40px_rgba(2,6,23,0.7)] border border-slate-800">
              <Chessboard
                id="learn-lesson-board"
                position={boardFen}
                onPieceDrop={onDrop}
                boardOrientation="white"
                boardWidth={boardSize}
                arePiecesDraggable={!isSubmittingMove && !lessonCompleted}
                customBoardStyle={{ borderRadius: "10px" }}
                customSquareStyles={
                  lastMove
                    ? {
                        [lastMove.from]: { backgroundColor: "rgba(250, 204, 21, 0.45)" },
                        [lastMove.to]: { backgroundColor: "rgba(16, 185, 129, 0.35)" },
                      }
                    : {}
                }
              />
            </div>
          </div>
        </section>

        <div className="xl:min-h-0">
          <LessonPanel
            courseTitle={lessonData.course.title}
            lessonTitle={lessonData.lesson.title}
            lessonSubtitle={lessonData.lesson.subtitle}
            lessons={lessonData.lessons}
            currentLessonSlug={lessonData.lesson.slug}
            courseProgress={courseProgress}
            onBackToCatalog={() => navigate("/learn")}
            onOpenLesson={openLessonBySlug}
            onPrevLesson={openPrevLesson}
            onNextLesson={openNextLesson}
            onRetryLesson={retryLesson}
            hasPrevLesson={hasPrevLesson}
            hasNextLesson={!!hasNextLesson}
          />
        </div>
      </div>
    </div>
  );
}
