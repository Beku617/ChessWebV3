import { useEffect, useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Copy,
  Loader2,
  Plus,
  Play,
  RotateCcw,
  Save,
  Search,
  Square as SquareIcon,
  Trash2,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import AdminSidebar from "../../components/AdminSidebar";
import { useThemeStore } from "../../store/themeStore";
import {
  createAdminLearnStep,
  deleteAdminLearnStep,
  fetchAdminLearnSteps,
  reorderAdminLearnSteps,
  updateAdminLearnLesson,
  updateAdminLearnStep,
} from "./api";
import type {
  AdminLearnCourse,
  AdminLearnLesson,
  AdminLearnStep,
  StepPayload,
} from "./types";
import { useAdminGuard } from "./useAdminGuard";

type LessonMetaDraft = {
  title: string;
  slug: string;
  subtitle: string;
  description: string;
  estimatedMinutes: number;
  isPublished: boolean;
};

type StepDraft = {
  title: string;
  instructionText: string;
  explanationBeforeMove: string;
  fen: string;
  sideToMove: "white" | "black";
  boardOrientation: "white" | "black";
  validationMode: "exact" | "one_of_many";
  acceptedMoves: string;
  successMessage: string;
  wrongMoveMessage: string;
  hintText: string;
  allowRetry: boolean;
  autoAdvance: boolean;
  keepPositionOnWrong: boolean;
  nextFen: string;
  annotations: string;
  isPublished: boolean;
};

const EMPTY_STEP_DRAFT: StepDraft = {
  title: "",
  instructionText: "",
  explanationBeforeMove: "",
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  sideToMove: "white",
  boardOrientation: "white",
  validationMode: "one_of_many",
  acceptedMoves: "",
  successMessage: "",
  wrongMoveMessage: "",
  hintText: "",
  allowRetry: true,
  autoAdvance: false,
  keepPositionOnWrong: false,
  nextFen: "",
  annotations: "{}",
  isPublished: true,
};

function toLessonMetaDraft(lesson: AdminLearnLesson): LessonMetaDraft {
  return {
    title: lesson.title,
    slug: lesson.slug,
    subtitle: lesson.subtitle,
    description: lesson.description,
    estimatedMinutes: lesson.estimatedMinutes || 10,
    isPublished: lesson.isPublished,
  };
}

function toStepDraft(step: AdminLearnStep): StepDraft {
  return {
    title: step.title || "",
    instructionText: step.instructionText || "",
    explanationBeforeMove: step.explanationBeforeMove || "",
    fen: step.fen,
    sideToMove: step.sideToMove,
    boardOrientation: step.boardOrientation || "white",
    validationMode: step.validationMode || "one_of_many",
    acceptedMoves: (step.correctMoves || step.acceptedMoves || []).join(", "),
    successMessage: step.successMessage || step.feedbackCorrect || "",
    wrongMoveMessage: step.wrongMoveMessage || step.feedbackWrong || "",
    hintText: step.hintText || "",
    allowRetry: step.allowRetry !== false,
    autoAdvance: !!step.autoAdvance,
    keepPositionOnWrong: !!step.keepPositionOnWrong,
    nextFen: step.nextFen || "",
    annotations: JSON.stringify(step.annotations || {}, null, 2),
    isPublished: step.isPublished !== false,
  };
}

function splitAcceptedMoves(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function mergeAcceptedMoves(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

export default function AdminLearnLesson() {
  const { courseId = "", lessonId = "" } = useParams<{
    courseId: string;
    lessonId: string;
  }>();
  const navigate = useNavigate();
  const { isDarkMode } = useThemeStore();
  const { isAuthenticated, isLoading: authLoading } = useAdminGuard();

  const [course, setCourse] = useState<AdminLearnCourse | null>(null);
  const [lesson, setLesson] = useState<AdminLearnLesson | null>(null);
  const [lessonDraft, setLessonDraft] = useState<LessonMetaDraft | null>(null);
  const [steps, setSteps] = useState<AdminLearnStep[]>([]);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [stepDraft, setStepDraft] = useState<StepDraft>(EMPTY_STEP_DRAFT);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingLesson, setSavingLesson] = useState(false);
  const [savingStep, setSavingStep] = useState(false);
  const [processingStepId, setProcessingStepId] = useState<string | null>(null);
  const [isRecordingAcceptedMoves, setIsRecordingAcceptedMoves] = useState(false);
  const [recordFromSquare, setRecordFromSquare] = useState<string | null>(null);
  const [previewMoveSquares, setPreviewMoveSquares] = useState<
    Record<string, React.CSSProperties>
  >({});

  const selectedStep = useMemo(
    () => steps.find((entry) => entry.id === selectedStepId) || null,
    [steps, selectedStepId],
  );

  const previewValidation = useMemo(() => {
    try {
      new Chess(stepDraft.fen);
      return { valid: true, message: "" };
    } catch {
      return { valid: false, message: "Invalid FEN format." };
    }
  }, [stepDraft.fen]);

  const acceptedMoveTokens = useMemo(
    () => splitAcceptedMoves(stepDraft.acceptedMoves),
    [stepDraft.acceptedMoves],
  );

  const loadSteps = async (preferredStepId?: string | null) => {
    if (!lessonId) return;
    try {
      setLoading(true);
      setError("");
      const data = await fetchAdminLearnSteps({ lessonId, search });
      setCourse(data.course || null);
      setLesson(data.lesson || null);
      setLessonDraft(data.lesson ? toLessonMetaDraft(data.lesson) : null);
      setSteps(data.steps || []);

      if (!data.steps?.length) {
        setSelectedStepId(null);
        setStepDraft(EMPTY_STEP_DRAFT);
      } else {
        const targetStepId = preferredStepId ?? selectedStepId;
        const matched = targetStepId
          ? data.steps.find((step) => step.id === targetStepId) || null
          : null;
        const nextStep = matched || data.steps[0];
        setSelectedStepId(nextStep.id);
        setStepDraft(toStepDraft(nextStep));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lesson steps.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !lessonId) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      await loadSteps(selectedStepId || undefined);
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isAuthenticated, lessonId, search]);

  useEffect(() => {
    if (!previewValidation.valid && isRecordingAcceptedMoves) {
      setIsRecordingAcceptedMoves(false);
    }
  }, [isRecordingAcceptedMoves, previewValidation.valid]);

  useEffect(() => {
    if (!isRecordingAcceptedMoves) {
      clearAcceptedMoveSelection();
    }
  }, [isRecordingAcceptedMoves]);

  useEffect(() => {
    clearAcceptedMoveSelection();
  }, [stepDraft.fen, stepDraft.boardOrientation, stepDraft.sideToMove]);

  const handleSelectStep = (step: AdminLearnStep) => {
    setIsRecordingAcceptedMoves(false);
    setSelectedStepId(step.id);
    setStepDraft(toStepDraft(step));
  };

  const handleNewStep = () => {
    setIsRecordingAcceptedMoves(false);
    setSelectedStepId(null);
    setStepDraft(EMPTY_STEP_DRAFT);
  };

  const handleSaveLessonMeta = async () => {
    if (!lesson || !lessonDraft) return;
    setSavingLesson(true);
    setError("");
    try {
      const response = await updateAdminLearnLesson(lesson.id, {
        title: lessonDraft.title,
        slug: lessonDraft.slug,
        subtitle: lessonDraft.subtitle,
        description: lessonDraft.description,
        estimatedMinutes: Number(lessonDraft.estimatedMinutes || 10),
        isPublished: lessonDraft.isPublished,
      });
      setLesson(response.lesson);
      setLessonDraft(toLessonMetaDraft(response.lesson));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save lesson metadata.");
    } finally {
      setSavingLesson(false);
    }
  };

  const handleSaveStep = async () => {
    if (!lessonId) return;
    setSavingStep(true);
    setError("");
    try {
      let parsedAnnotations: Record<string, unknown> = {};
      if (stepDraft.annotations.trim()) {
        parsedAnnotations = JSON.parse(stepDraft.annotations);
      }

      const payload: StepPayload = {
        title: stepDraft.title,
        instructionText: stepDraft.instructionText,
        explanationBeforeMove: stepDraft.explanationBeforeMove,
        fen: stepDraft.fen,
        sideToMove: stepDraft.sideToMove,
        boardOrientation: stepDraft.boardOrientation,
        validationMode: stepDraft.validationMode,
        correctMoves: stepDraft.acceptedMoves,
        successMessage: stepDraft.successMessage,
        wrongMoveMessage: stepDraft.wrongMoveMessage,
        hintText: stepDraft.hintText,
        allowRetry: stepDraft.allowRetry,
        autoAdvance: stepDraft.autoAdvance,
        keepPositionOnWrong: stepDraft.keepPositionOnWrong,
        nextFen: stepDraft.nextFen,
        annotations: parsedAnnotations,
        isPublished: stepDraft.isPublished,
        successCondition: "accepted_move",
      };

      let savedStepId = selectedStepId;
      if (selectedStepId) {
        const response = await updateAdminLearnStep(selectedStepId, payload);
        savedStepId = response.step.id;
        setSteps((prev) =>
          prev.map((entry) => (entry.id === selectedStepId ? response.step : entry)),
        );
        setStepDraft(toStepDraft(response.step));
      } else {
        const response = await createAdminLearnStep(lessonId, payload);
        savedStepId = response.step.id;
        setSteps((prev) =>
          [...prev, response.step].sort((a, b) => a.orderIndex - b.orderIndex),
        );
        setSelectedStepId(response.step.id);
        setStepDraft(toStepDraft(response.step));
      }

      await loadSteps(savedStepId || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save step.");
    } finally {
      setSavingStep(false);
    }
  };

  const handleDeleteStep = async (step: AdminLearnStep) => {
    const confirmed = window.confirm(
      `Delete step "${step.title || step.orderIndex + 1}"?`,
    );
    if (!confirmed) return;

    setProcessingStepId(step.id);
    setError("");
    try {
      await deleteAdminLearnStep(step.id);
      const filtered = steps.filter((entry) => entry.id !== step.id);
      setSteps(filtered);
      if (selectedStepId === step.id) {
        if (filtered.length > 0) {
          setSelectedStepId(filtered[0].id);
          setStepDraft(toStepDraft(filtered[0]));
        } else {
          setSelectedStepId(null);
          setStepDraft(EMPTY_STEP_DRAFT);
        }
      }
      await loadSteps(filtered[0]?.id || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete step.");
    } finally {
      setProcessingStepId(null);
    }
  };

  const handleDuplicateStep = async (step: AdminLearnStep) => {
    setProcessingStepId(step.id);
    setError("");
    try {
      const draft = toStepDraft(step);
      let parsedAnnotations: Record<string, unknown> = {};
      if (draft.annotations.trim()) {
        parsedAnnotations = JSON.parse(draft.annotations);
      }
      const payload: StepPayload = {
        title: step.title ? `${step.title} (Copy)` : "Step copy",
        instructionText: draft.instructionText,
        explanationBeforeMove: draft.explanationBeforeMove,
        fen: draft.fen,
        sideToMove: draft.sideToMove,
        boardOrientation: draft.boardOrientation,
        validationMode: draft.validationMode,
        correctMoves: draft.acceptedMoves,
        successMessage: draft.successMessage,
        wrongMoveMessage: draft.wrongMoveMessage,
        hintText: draft.hintText,
        allowRetry: draft.allowRetry,
        autoAdvance: draft.autoAdvance,
        keepPositionOnWrong: draft.keepPositionOnWrong,
        nextFen: draft.nextFen,
        annotations: parsedAnnotations,
        isPublished: draft.isPublished,
        successCondition: "accepted_move",
      };
      const response = await createAdminLearnStep(lessonId, payload);
      setSteps((prev) =>
        [...prev, response.step].sort((a, b) => a.orderIndex - b.orderIndex),
      );
      setSelectedStepId(response.step.id);
      setStepDraft(toStepDraft(response.step));
      await loadSteps(response.step.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to duplicate step.");
    } finally {
      setProcessingStepId(null);
    }
  };

  const handleMoveStep = async (stepId: string, direction: "up" | "down") => {
    const currentIndex = steps.findIndex((entry) => entry.id === stepId);
    if (currentIndex < 0) return;
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= steps.length) return;

    const next = [...steps];
    const [moved] = next.splice(currentIndex, 1);
    next.splice(targetIndex, 0, moved);
    const nextIds = next.map((entry) => entry.id);

    setProcessingStepId(stepId);
    setError("");
    try {
      const response = await reorderAdminLearnSteps(lessonId, nextIds);
      setSteps(response.steps || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reorder steps.");
    } finally {
      setProcessingStepId(null);
    }
  };

  const clearAcceptedMoveSelection = () => {
    setRecordFromSquare(null);
    setPreviewMoveSquares({});
  };

  const setAcceptedMoveTokens = (tokens: string[]) => {
    setStepDraft((current) => {
      const next = mergeAcceptedMoves(tokens);
      const normalized =
        current.validationMode === "exact" ? next.slice(0, 1) : next;
      return {
        ...current,
        acceptedMoves: normalized.join(", "),
      };
    });
  };

  const handleStartAcceptedMoveRecording = () => {
    if (!previewValidation.valid) {
      setError("Please enter a valid FEN before recording accepted moves.");
      return;
    }
    setError("");
    clearAcceptedMoveSelection();
    setIsRecordingAcceptedMoves(true);
  };

  const highlightAcceptedMoveOptions = (sourceSquare: string) => {
    if (!isRecordingAcceptedMoves || !previewValidation.valid) {
      clearAcceptedMoveSelection();
      return false;
    }

    const game = new Chess(stepDraft.fen);
    const piece = game.get(sourceSquare as Square);
    if (!piece || piece.color !== game.turn()) {
      clearAcceptedMoveSelection();
      return false;
    }

    const moves = game.moves({ square: sourceSquare as Square, verbose: true });
    if (moves.length === 0) {
      clearAcceptedMoveSelection();
      return false;
    }

    const optionStyles = moves.reduce<Record<string, React.CSSProperties>>(
      (styles, move) => {
        styles[move.to] = {
          boxShadow:
            "inset 0 0 0 3px rgba(20,184,166,0.8), inset 0 0 0 6px rgba(20,184,166,0.18)",
          background:
            "radial-gradient(circle, rgba(20,184,166,0.45) 38%, rgba(0,0,0,0) 60%)",
        };
        return styles;
      },
      {},
    );

    setRecordFromSquare(sourceSquare);
    setPreviewMoveSquares({
      [sourceSquare]: { backgroundColor: "rgba(20,184,166,0.25)" },
      ...optionStyles,
    });
    return true;
  };

  const handleAcceptedMoveDrop = (sourceSquare: string, targetSquare: string) => {
    if (!isRecordingAcceptedMoves || !previewValidation.valid) return false;

    try {
      const game = new Chess(stepDraft.fen);
      const move = game.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q",
      });

      if (!move) return false;

      const token = move.san;
      if (stepDraft.validationMode === "exact") {
        setAcceptedMoveTokens([token]);
      } else {
        setAcceptedMoveTokens([...acceptedMoveTokens, token]);
      }
      clearAcceptedMoveSelection();
      return true;
    } catch {
      return false;
    }
  };

  const handlePreviewSquareClick = (square: string) => {
    if (!isRecordingAcceptedMoves || !previewValidation.valid) return;

    if (!recordFromSquare) {
      void highlightAcceptedMoveOptions(square);
      return;
    }

    if (recordFromSquare === square) {
      clearAcceptedMoveSelection();
      return;
    }

    const game = new Chess(stepDraft.fen);
    const clickedPiece = game.get(square as Square);
    if (clickedPiece && clickedPiece.color === game.turn()) {
      void highlightAcceptedMoveOptions(square);
      return;
    }

    const moved = handleAcceptedMoveDrop(recordFromSquare, square);
    if (moved) {
      clearAcceptedMoveSelection();
    }
  };

  if (authLoading) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${
          isDarkMode ? "bg-slate-950" : "bg-[#f5f5f7]"
        }`}
      >
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  const pageToneClass = isDarkMode
    ? "bg-slate-950 text-white"
    : "bg-[#f5f5f7] text-gray-900";
  const surfaceClass = isDarkMode
    ? "border-slate-800 bg-slate-900/80 shadow-[0_20px_60px_rgba(0,0,0,0.22)]"
    : "border-gray-200/80 bg-white/95 shadow-[0_18px_44px_rgba(15,23,42,0.08)]";
  const neutralButtonClass = isDarkMode
    ? "inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
    : "inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-100";
  const compactNeutralButtonClass = isDarkMode
    ? "rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-55"
    : "rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-800 hover:bg-gray-100 disabled:opacity-55";
  const duplicateButtonClass = isDarkMode
    ? "rounded-md border border-indigo-400/25 bg-indigo-500/10 px-2 py-1 text-[11px] font-medium text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-55"
    : "rounded-md border border-indigo-300 bg-indigo-100 px-2 py-1 text-[11px] font-medium text-indigo-800 hover:bg-indigo-200 disabled:opacity-55";
  const deleteButtonClass = isDarkMode
    ? "rounded-md border border-red-400/25 bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-200 hover:bg-red-500/20 disabled:opacity-55"
    : "rounded-md border border-red-300 bg-red-100 px-2 py-1 text-[11px] font-medium text-red-800 hover:bg-red-200 disabled:opacity-55";
  const alertClass = isDarkMode
    ? "rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200"
    : "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700";
  const headingTextClass = isDarkMode ? "text-white" : "text-gray-900";
  const mutedTextClass = isDarkMode ? "text-slate-400" : "text-gray-500";
  const secondaryTextClass = isDarkMode ? "text-slate-300" : "text-gray-600";
  const checkboxLabelClass = `inline-flex items-center gap-2 text-sm ${secondaryTextClass}`;
  const interactiveFieldToneClass = isDarkMode
    ? "border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-400"
    : "border-gray-200 bg-gray-50 text-gray-900 placeholder:text-gray-400";
  const searchInputClass = `h-10 w-full rounded-xl border py-2 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 ${interactiveFieldToneClass}`;
  const fullInputClass = `h-10 w-full rounded-xl border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 ${interactiveFieldToneClass}`;
  const textareaClass = `w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 ${interactiveFieldToneClass}`;
  const fieldLabelClass = "text-xs font-medium text-gray-500 dark:text-slate-400";
  const inactiveStepCardClass = isDarkMode
    ? "border-slate-800 bg-slate-900/70 hover:border-slate-700"
    : "border-gray-200 bg-gray-50/90 hover:border-gray-300";
  const previewSurfaceClass = isDarkMode
    ? "rounded-2xl border border-slate-700 bg-slate-900/70 p-3"
    : "rounded-2xl border border-gray-200 bg-gray-50/90 p-3";
  const previewBoardBorderClass = isDarkMode ? "border-slate-700" : "border-gray-200";
  const invalidFenClass = isDarkMode
    ? "mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-200"
    : "mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700";
  const recordMovesButtonClass = isDarkMode
    ? "inline-flex items-center gap-1.5 rounded-md border border-brand-400/30 bg-brand-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-brand-200 hover:bg-brand-500/25"
    : "inline-flex items-center gap-1.5 rounded-md border border-brand-300 bg-brand-100 px-2.5 py-1.5 text-[11px] font-semibold text-brand-800 hover:bg-brand-200";
  const moveChipClass = isDarkMode
    ? "inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-200"
    : "inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-700";
  const moveChipRemoveClass = isDarkMode
    ? "rounded-full px-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
    : "rounded-full px-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700";

  return (
    <div>
      <div className={`min-h-screen ${pageToneClass}`}>
        <AdminSidebar />

        <main className="ml-72 px-8 py-7">
          <div className="mx-auto max-w-[1520px] space-y-6">
            <section className={`rounded-[24px] border p-6 ${surfaceClass}`}>
              <button
                onClick={() => navigate(`/admin/learn/courses/${courseId}`)}
                className={neutralButtonClass}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Course
              </button>

              <div className="mt-4">
                <h1 className={`text-3xl font-semibold tracking-tight ${headingTextClass}`}>
                  {lesson?.title || "Loading lesson..."}
                </h1>
              </div>
            </section>

            {error && (
              <div className={alertClass}>
                {error}
              </div>
            )}

            <section className="grid gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
              <div className={`rounded-[24px] border p-4 ${surfaceClass}`}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-gray-500">
                    Steps
                  </h2>
                  <button
                    onClick={handleNewStep}
                    className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-500"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New
                  </button>
                </div>

                <label className="relative mt-3 block">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search steps..."
                    className={searchInputClass}
                  />
                </label>

                {loading ? (
                  <div className="py-16 text-center">
                    <Loader2 className="mx-auto h-7 w-7 animate-spin text-brand-400" />
                  </div>
                ) : steps.length === 0 ? (
                  <div className={`py-16 text-center text-sm ${mutedTextClass}`}>
                    No steps yet.
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {steps.map((step, index) => {
                      const active = selectedStepId === step.id;
                      const busy = processingStepId === step.id;
                      return (
                        <article
                          key={step.id}
                          className={`rounded-xl border px-3 py-3 transition-colors ${
                            active
                              ? "border-cyan-400/35 bg-cyan-500/10"
                              : inactiveStepCardClass
                          }`}
                        >
                          <button
                            onClick={() => handleSelectStep(step)}
                            className="w-full text-left"
                          >
                            <div className="text-[11px] uppercase tracking-[0.14em] text-gray-500">
                              Step {step.orderIndex + 1}
                            </div>
                            <div className={`mt-1 text-sm font-medium ${headingTextClass}`}>
                              {step.title || "Untitled Step"}
                            </div>
                            <div className="mt-1 text-xs text-gray-500 line-clamp-2">
                              {step.instructionText || "No instruction text."}
                            </div>
                          </button>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <button
                              disabled={busy || index === 0}
                              onClick={() => void handleMoveStep(step.id, "up")}
                              className={compactNeutralButtonClass}
                            >
                              <ChevronUp className="h-3 w-3" />
                            </button>
                            <button
                              disabled={busy || index === steps.length - 1}
                              onClick={() => void handleMoveStep(step.id, "down")}
                              className={compactNeutralButtonClass}
                            >
                              <ChevronDown className="h-3 w-3" />
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => void handleDuplicateStep(step)}
                              className={duplicateButtonClass}
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => void handleDeleteStep(step)}
                              className={deleteButtonClass}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-5">
                <section className={`rounded-[24px] border p-5 ${surfaceClass}`}>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-gray-500">
                      Lesson Info
                    </h2>
                    <button
                      disabled={savingLesson || !lessonDraft}
                      onClick={() => void handleSaveLessonMeta()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
                    >
                      {savingLesson ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Save Info
                    </button>
                  </div>

                  {lessonDraft && (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1">
                        <span className={fieldLabelClass}>Lesson name</span>
                        <input
                          value={lessonDraft.title}
                          onChange={(event) =>
                            setLessonDraft((current) =>
                              current ? { ...current, title: event.target.value } : current,
                            )
                          }
                          placeholder="Pawn structure basics"
                          className={fullInputClass}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className={fieldLabelClass}>Time</span>
                        <input
                          type="number"
                          min={1}
                          value={lessonDraft.estimatedMinutes}
                          onChange={(event) =>
                            setLessonDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    estimatedMinutes: Number(event.target.value || 1),
                                  }
                                : current,
                            )
                          }
                          placeholder="10 min"
                          className={fullInputClass}
                        />
                      </label>
                      <label className="space-y-1 sm:col-span-2">
                        <span className={fieldLabelClass}>Short label</span>
                        <input
                          value={lessonDraft.subtitle}
                          onChange={(event) =>
                            setLessonDraft((current) =>
                              current
                                ? { ...current, subtitle: event.target.value }
                                : current,
                            )
                          }
                          placeholder="Quick lesson summary"
                          className={fullInputClass}
                        />
                      </label>
                      <label className="space-y-1 sm:col-span-2">
                        <span className={fieldLabelClass}>Details</span>
                        <textarea
                          value={lessonDraft.description}
                          onChange={(event) =>
                            setLessonDraft((current) =>
                              current
                                ? { ...current, description: event.target.value }
                                : current,
                            )
                          }
                          placeholder="What students will learn"
                          className={`min-h-[85px] ${textareaClass}`}
                        />
                      </label>
                      <label className={checkboxLabelClass}>
                        <input
                          type="checkbox"
                          checked={lessonDraft.isPublished}
                          onChange={(event) =>
                            setLessonDraft((current) =>
                              current
                                ? { ...current, isPublished: event.target.checked }
                                : current,
                            )
                          }
                          className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-400/40"
                        />
                        Show lesson
                      </label>
                    </div>
                  )}
                </section>

                <section className={`rounded-[24px] border p-5 ${surfaceClass}`}>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-gray-500">
                      {selectedStep ? `Edit Step ${selectedStep.orderIndex + 1}` : "Create Step"}
                    </h2>
                    <button
                      disabled={savingStep}
                      onClick={() => void handleSaveStep()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
                    >
                      {savingStep ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      {selectedStep ? "Save Step" : "Create Step"}
                    </button>
                  </div>

                  <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="space-y-5">
                      <div>
                        <h3 className="text-xs uppercase tracking-[0.14em] text-gray-500">
                          Step Info
                        </h3>
                        <div className="mt-2">
                          <label className="block space-y-1">
                            <span className={fieldLabelClass}>Step name</span>
                            <input
                              value={stepDraft.title}
                              onChange={(event) =>
                                setStepDraft((current) => ({
                                  ...current,
                                  title: event.target.value,
                                }))
                              }
                              placeholder="Find the best pawn break"
                              className={fullInputClass}
                            />
                          </label>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-xs uppercase tracking-[0.14em] text-gray-500">
                          Board
                        </h3>
                        <div className="mt-2 space-y-3">
                          <label className="block space-y-1">
                            <span className={fieldLabelClass}>Board position</span>
                            <textarea
                              value={stepDraft.fen}
                              onChange={(event) =>
                                setStepDraft((current) => ({
                                  ...current,
                                  fen: event.target.value,
                                }))
                              }
                              placeholder="Paste FEN here"
                              className={`min-h-[75px] ${textareaClass}`}
                            />
                          </label>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="space-y-1">
                              <span className={fieldLabelClass}>Move color</span>
                              <select
                                value={stepDraft.sideToMove}
                                onChange={(event) =>
                                  setStepDraft((current) => ({
                                    ...current,
                                    sideToMove: event.target.value as "white" | "black",
                                  }))
                                }
                                className={fullInputClass}
                              >
                                <option value="white">White to move</option>
                                <option value="black">Black to move</option>
                              </select>
                            </label>
                            <label className="space-y-1">
                              <span className={fieldLabelClass}>Board view</span>
                              <select
                                value={stepDraft.boardOrientation}
                                onChange={(event) =>
                                  setStepDraft((current) => ({
                                    ...current,
                                    boardOrientation: event.target.value as "white" | "black",
                                  }))
                                }
                                className={fullInputClass}
                              >
                                <option value="white">White at bottom</option>
                                <option value="black">Black at bottom</option>
                              </select>
                            </label>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-xs uppercase tracking-[0.14em] text-gray-500">
                          Teaching Text
                        </h3>
                        <div className="mt-2 space-y-3">
                          <label className="block space-y-1">
                            <span className={fieldLabelClass}>Instruction</span>
                            <textarea
                              value={stepDraft.instructionText}
                              onChange={(event) =>
                                setStepDraft((current) => ({
                                  ...current,
                                  instructionText: event.target.value,
                                }))
                              }
                              placeholder="Ask the student what to play"
                              className={`min-h-[82px] ${textareaClass}`}
                            />
                          </label>
                          <label className="block space-y-1">
                            <span className={fieldLabelClass}>Before move note</span>
                            <textarea
                              value={stepDraft.explanationBeforeMove}
                              onChange={(event) =>
                                setStepDraft((current) => ({
                                  ...current,
                                  explanationBeforeMove: event.target.value,
                                }))
                              }
                              placeholder="Optional context before the move"
                              className={`min-h-[72px] ${textareaClass}`}
                            />
                          </label>
                          <label className="block space-y-1">
                            <span className={fieldLabelClass}>Hint</span>
                            <textarea
                              value={stepDraft.hintText}
                              onChange={(event) =>
                                setStepDraft((current) => ({
                                  ...current,
                                  hintText: event.target.value,
                                }))
                              }
                              placeholder="Optional hint"
                              className={`min-h-[62px] ${textareaClass}`}
                            />
                          </label>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-xs uppercase tracking-[0.14em] text-gray-500">
                          Correct Moves
                        </h3>
                        <div className="mt-2 space-y-3">
                          <label className="block space-y-1">
                            <span className={fieldLabelClass}>Correct moves</span>
                            <textarea
                              value={stepDraft.acceptedMoves}
                              onChange={(event) =>
                                setStepDraft((current) => ({
                                  ...current,
                                  acceptedMoves: event.target.value,
                                }))
                              }
                              placeholder="Example: e4, Nf3"
                              className={`min-h-[70px] ${textareaClass}`}
                            />
                          </label>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={!previewValidation.valid}
                              onClick={() => {
                                if (isRecordingAcceptedMoves) {
                                  clearAcceptedMoveSelection();
                                  setIsRecordingAcceptedMoves(false);
                                  return;
                                }
                                handleStartAcceptedMoveRecording();
                              }}
                              className={`${recordMovesButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
                            >
                              {isRecordingAcceptedMoves ? (
                                <SquareIcon className="h-3.5 w-3.5" />
                              ) : (
                                <Play className="h-3.5 w-3.5" />
                              )}
                              {isRecordingAcceptedMoves
                                ? "Stop board recording"
                                : "Record from board"}
                            </button>
                            <button
                              type="button"
                              disabled={acceptedMoveTokens.length === 0}
                              onClick={() => setAcceptedMoveTokens([])}
                              className={`${compactNeutralButtonClass} inline-flex items-center gap-1.5 disabled:cursor-not-allowed`}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Clear moves
                            </button>
                            <span className={`text-xs ${mutedTextClass}`}>
                              Drag or click a legal move on the preview board to add it.
                            </span>
                          </div>
                          {acceptedMoveTokens.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {acceptedMoveTokens.map((token) => (
                                <span key={token} className={moveChipClass}>
                                  {token}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setAcceptedMoveTokens(
                                        acceptedMoveTokens.filter((entry) => entry !== token),
                                      )
                                    }
                                    className={moveChipRemoveClass}
                                    aria-label={`Remove move ${token}`}
                                  >
                                    x
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                          <label className="block space-y-1">
                            <span className={fieldLabelClass}>Good move message</span>
                            <textarea
                              value={stepDraft.successMessage}
                              onChange={(event) =>
                                setStepDraft((current) => ({
                                  ...current,
                                  successMessage: event.target.value,
                                }))
                              }
                              placeholder="Shown after a correct move"
                              className={`min-h-[62px] ${textareaClass}`}
                            />
                          </label>
                          <label className="block space-y-1">
                            <span className={fieldLabelClass}>Wrong move message</span>
                            <textarea
                              value={stepDraft.wrongMoveMessage}
                              onChange={(event) =>
                                setStepDraft((current) => ({
                                  ...current,
                                  wrongMoveMessage: event.target.value,
                                }))
                              }
                              placeholder="Shown after an incorrect move"
                              className={`min-h-[62px] ${textareaClass}`}
                            />
                          </label>
                          <div className="flex flex-wrap gap-4">
                            <label className={checkboxLabelClass}>
                              <input
                                type="checkbox"
                                checked={stepDraft.allowRetry}
                                onChange={(event) =>
                                  setStepDraft((current) => ({
                                    ...current,
                                    allowRetry: event.target.checked,
                                  }))
                                }
                                className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-400/40"
                              />
                              Let students retry
                            </label>
                            <label className={checkboxLabelClass}>
                              <input
                                type="checkbox"
                                checked={stepDraft.isPublished}
                                onChange={(event) =>
                                  setStepDraft((current) => ({
                                    ...current,
                                    isPublished: event.target.checked,
                                  }))
                                }
                                className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-400/40"
                              />
                              Show step
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>

                    <aside className="space-y-3">
                      <h3 className="text-xs uppercase tracking-[0.14em] text-gray-500">
                        Position Preview
                      </h3>
                      <div className={previewSurfaceClass}>
                        <div
                          className={`mx-auto w-[280px] max-w-full rounded-xl overflow-hidden border ${previewBoardBorderClass}`}
                        >
                          <Chessboard
                            id="admin-learn-step-preview"
                            position={previewValidation.valid ? stepDraft.fen : "start"}
                            boardOrientation={stepDraft.boardOrientation}
                            onPieceDrop={handleAcceptedMoveDrop}
                            onSquareClick={handlePreviewSquareClick}
                            onSquareRightClick={clearAcceptedMoveSelection}
                            arePiecesDraggable={isRecordingAcceptedMoves && previewValidation.valid}
                            customSquareStyles={previewMoveSquares}
                            boardWidth={280}
                          />
                        </div>
                        {!previewValidation.valid && (
                          <p className={invalidFenClass}>
                            {previewValidation.message}
                          </p>
                        )}
                        <p className={`mt-3 text-xs ${mutedTextClass}`}>
                          {isRecordingAcceptedMoves
                            ? "Recording active: drag a legal move to add it to accepted moves."
                            : "Preview uses current FEN and side to move selection."}
                        </p>
                      </div>
                    </aside>
                  </div>
                </section>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

