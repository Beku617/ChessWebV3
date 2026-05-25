import { useEffect, useId, useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { useTranslation, Trans } from "react-i18next";
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
import {
  createAdminLearnStep,
  deleteAdminLearnStep,
  fetchAdminLearnSteps,
  reorderAdminLearnSteps,
  updateAdminLearnStep,
} from "./api";
import type {
  AdminLearnLesson,
  AdminLearnStep,
  StepPayload,
} from "./types";
import { useAdminGuard } from "./useAdminGuard";

type StepDraft = {
  instructionText: string;
  fen: string;
  sideToMove: "white" | "black";
  boardOrientation: "white" | "black";
  acceptedMoves: string;
  successMessage: string;
  wrongMoveMessage: string;
  isPublished: boolean;
};

const DEFAULT_SUCCESS_MESSAGE = "Correct move.";
const DEFAULT_WRONG_MOVE_MESSAGE = "Try another move.";
const SIDE_TO_MOVE_VALUE = {
  white: "white",
  black: "black",
} as const;
const BOARD_PREVIEW_FALLBACK_POSITION = "start";
const BOARD_PREVIEW_DROP_ACTION = "snapback";

const EMPTY_STEP_DRAFT: StepDraft = {
  instructionText: "",
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  sideToMove: "white",
  boardOrientation: "white",
  acceptedMoves: "",
  successMessage: DEFAULT_SUCCESS_MESSAGE,
  wrongMoveMessage: DEFAULT_WRONG_MOVE_MESSAGE,
  isPublished: true,
};

function toStepDraft(step: AdminLearnStep): StepDraft {
  return {
    instructionText: step.instructionText || "",
    fen: step.fen,
    sideToMove: step.sideToMove,
    boardOrientation: step.boardOrientation || "white",
    acceptedMoves: (step.correctMoves || step.acceptedMoves || []).join(", "),
    successMessage: step.successMessage || step.feedbackCorrect || DEFAULT_SUCCESS_MESSAGE,
    wrongMoveMessage:
      step.wrongMoveMessage || step.feedbackWrong || DEFAULT_WRONG_MOVE_MESSAGE,
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
  const { t } = useTranslation();
  const { courseId = "", lessonId = "" } = useParams<{
    courseId: string;
    lessonId: string;
  }>();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAdminGuard();

  const [lesson, setLesson] = useState<AdminLearnLesson | null>(null);
  const [steps, setSteps] = useState<AdminLearnStep[]>([]);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [stepDraft, setStepDraft] = useState<StepDraft>(EMPTY_STEP_DRAFT);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingStep, setSavingStep] = useState(false);
  const [processingStepId, setProcessingStepId] = useState<string | null>(null);
  const [isRecordingAcceptedMoves, setIsRecordingAcceptedMoves] = useState(false);
  const [recordFromSquare, setRecordFromSquare] = useState<string | null>(null);
  const [previewMoveSquares, setPreviewMoveSquares] = useState<
    Record<string, React.CSSProperties>
  >({});
  const previewBoardId = useId().replace(/:/g, "");

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
      setLesson(data.lesson || null);
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

  const handleSaveStep = async () => {
    if (!lessonId) return;
    setSavingStep(true);
    setError("");
    try {
      const normalizedSuccessMessage =
        stepDraft.successMessage.trim() || DEFAULT_SUCCESS_MESSAGE;
      const normalizedWrongMoveMessage =
        stepDraft.wrongMoveMessage.trim() || DEFAULT_WRONG_MOVE_MESSAGE;

      const basePayload: StepPayload = {
        instructionText: stepDraft.instructionText,
        fen: stepDraft.fen,
        sideToMove: stepDraft.sideToMove,
        boardOrientation: stepDraft.boardOrientation,
        correctMoves: stepDraft.acceptedMoves,
        successMessage: normalizedSuccessMessage,
        wrongMoveMessage: normalizedWrongMoveMessage,
        isPublished: stepDraft.isPublished,
      };

      let savedStepId = selectedStepId;
      if (selectedStepId) {
        const response = await updateAdminLearnStep(selectedStepId, basePayload);
        savedStepId = response.step.id;
        setSteps((prev) =>
          prev.map((entry) => (entry.id === selectedStepId ? response.step : entry)),
        );
        setStepDraft(toStepDraft(response.step));
      } else {
        const response = await createAdminLearnStep(lessonId, basePayload);
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
      t("admin.confirm.deleteStep", { index: step.orderIndex + 1 }),
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
      const preservedMoves = (step.correctMoves || step.acceptedMoves || []).join(", ");
      const payload: StepPayload = {
        instructionText: step.instructionText || "",
        explanationBeforeMove: step.explanationBeforeMove || step.explanationText || "",
        fen: step.fen,
        sideToMove: step.sideToMove,
        boardOrientation: step.boardOrientation,
        validationMode: step.validationMode,
        correctMoves: preservedMoves,
        successMessage:
          (step.successMessage || step.feedbackCorrect || "").trim() ||
          DEFAULT_SUCCESS_MESSAGE,
        wrongMoveMessage:
          (step.wrongMoveMessage || step.feedbackWrong || "").trim() ||
          DEFAULT_WRONG_MOVE_MESSAGE,
        hintText: step.hintText || "",
        allowRetry: step.allowRetry,
        autoAdvance: step.autoAdvance,
        keepPositionOnWrong: step.keepPositionOnWrong,
        nextFen: step.nextFen || "",
        annotations: step.annotations || {},
        isPublished: step.isPublished,
        successCondition: step.successCondition || "accepted_move",
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
      return {
        ...current,
        acceptedMoves: next.join(", "),
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
      setAcceptedMoveTokens([...acceptedMoveTokens, token]);
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
      <div className="min-h-screen flex items-center justify-center bg-theme-panel">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  const pageToneClass = "bg-theme-panel text-theme-foreground";
  const surfaceClass =
    "border-theme-glass bg-theme-panel/85 shadow-[0_18px_44px_rgba(15,23,42,0.12)]";
  const neutralButtonClass =
    "inline-flex items-center gap-2 rounded-lg border border-theme-glass bg-theme-panel px-3 py-1.5 text-xs font-medium text-theme-foreground hover:bg-theme-hover";
  const compactNeutralButtonClass =
    "rounded-md border border-theme-glass bg-theme-panel px-2 py-1 text-[11px] font-medium text-theme-foreground hover:bg-theme-hover disabled:opacity-55";
  const duplicateButtonClass =
    "rounded-md border border-theme-border bg-theme-surface px-2 py-1 text-[11px] font-medium text-theme-accent hover:bg-theme-hover disabled:opacity-55";
  const deleteButtonClass =
    "rounded-md border border-theme-glass bg-theme-surface px-2 py-1 text-[11px] font-medium text-theme-muted hover:bg-theme-hover disabled:opacity-55";
  const alertClass =
    "rounded-xl border border-theme-glass bg-theme-surface px-4 py-3 text-sm text-theme-muted";
  const headingTextClass = "text-theme-foreground";
  const mutedTextClass = "text-theme-muted";
  const secondaryTextClass = "text-theme-muted";
  const checkboxLabelClass = `inline-flex items-center gap-2 text-sm ${secondaryTextClass}`;
  const interactiveFieldToneClass =
    "border-theme-glass bg-theme-surface text-theme-foreground placeholder:text-theme-disabled";
  const searchInputClass = `h-10 w-full rounded-xl border py-2 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 ${interactiveFieldToneClass}`;
  const fullInputClass = `h-10 w-full rounded-xl border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 ${interactiveFieldToneClass}`;
  const textareaClass = `w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 ${interactiveFieldToneClass}`;
  const fieldLabelClass = "text-xs font-medium text-theme-muted";
  const inactiveStepCardClass =
    "border-theme-glass bg-theme-surface/90 hover:bg-theme-hover";
  const previewSurfaceClass =
    "rounded-2xl border border-theme-glass bg-theme-surface/90 p-3";
  const previewBoardBorderClass = "border-theme-glass";
  const invalidFenClass =
    "mt-3 rounded-lg border border-theme-glass bg-theme-surface px-3 py-2 text-xs text-theme-muted";
  const recordMovesButtonClass =
    "inline-flex items-center gap-1.5 rounded-md border border-theme-border bg-theme-surface px-2.5 py-1.5 text-[11px] font-semibold text-theme-accent hover:bg-theme-hover";
  const moveChipClass =
    "inline-flex items-center gap-1 rounded-full border border-theme-glass bg-theme-panel px-2 py-1 text-[11px] text-theme-foreground";
  const moveChipRemoveClass =
    "rounded-full px-1 text-theme-muted hover:bg-theme-hover hover:text-theme-foreground";

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
                <ArrowLeft className="h-3.5 w-3.5" /> <Trans>Back to Course</Trans> </button>

              <div className="mt-4">
                <h1 className={`text-3xl font-semibold tracking-tight ${headingTextClass}`}>
                    {lesson?.title ||
                      t("admin.learn.labels.loadingLesson", "Loading lesson...")}
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
                  <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-theme-muted"> <Trans>Steps</Trans> </h2>
                  <button
                    onClick={handleNewStep}
                    className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-theme-on-accent hover:bg-brand-500"
                  >
                    <Plus className="h-3.5 w-3.5" /> <Trans>New</Trans> </button>
                </div>

                <label className="relative mt-3 block">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-muted" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t("admin.search.steps")}
                    className={searchInputClass}
                  />
                </label>

                {loading ? (
                  <div className="py-16 text-center">
                    <Loader2 className="mx-auto h-7 w-7 animate-spin text-brand-400" />
                  </div>
                ) : steps.length === 0 ? (
                  <div className={`py-16 text-center text-sm ${mutedTextClass}`}> <Trans>No steps yet.</Trans> </div>
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
                            <div className="text-[11px] uppercase tracking-[0.14em] text-theme-muted"> <Trans>Step</Trans> {step.orderIndex + 1}
                            </div>
                            <div className={`mt-1 text-sm ${headingTextClass} line-clamp-2`}>
                              {step.instructionText ||
                                t("admin.learn.labels.noInstructions", "No instructions yet.")}
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
                    <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-theme-muted">
                      {selectedStep
                        ? t("admin.learn.actions.editStepWithIndex", {
                            defaultValue: "Edit Step {{index}}",
                            index: selectedStep.orderIndex + 1,
                          })
                        : t("admin.learn.actions.createStep", "Create Step")}
                    </h2>
                    <button
                      disabled={savingStep}
                      onClick={() => void handleSaveStep()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-theme-on-accent hover:bg-brand-500 disabled:opacity-50"
                    >
                      {savingStep ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      {selectedStep
                        ? t("admin.learn.actions.saveStep", "Save Step")
                        : t("admin.learn.actions.createStep", "Create Step")}
                    </button>
                  </div>

                  <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="space-y-5">
                      <div>
                        <h3 className="text-xs uppercase tracking-[0.14em] text-theme-muted"> <Trans>Step Info</Trans> </h3>
                      </div>

                      <div>
                        <h3 className="text-xs uppercase tracking-[0.14em] text-theme-muted"> <Trans>Board</Trans> </h3>
                        <div className="mt-2 space-y-3">
                          <label className="block space-y-1">
                            <span className={fieldLabelClass}><Trans>Board position</Trans></span>
                            <textarea
                              value={stepDraft.fen}
                              onChange={(event) =>
                                setStepDraft((current) => ({
                                  ...current,
                                  fen: event.target.value,
                                }))
                              }
                              placeholder={t("admin.form.pasteFen")}
                              className={`min-h-[75px] ${textareaClass}`}
                            />
                          </label>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="space-y-1">
                              <span className={fieldLabelClass}><Trans>Move color</Trans></span>
                              <select
                                value={stepDraft.sideToMove}
                                onChange={(event) =>
                                  setStepDraft((current) => ({
                                    ...current,
                                    sideToMove: event.target.value as "white" | "black",
                                    boardOrientation:
                                      event.target.value as "white" | "black",
                                  }))
                                }
                                className={fullInputClass}
                              >
                                <option value={SIDE_TO_MOVE_VALUE.white}><Trans>White to move</Trans></option>
                                <option value={SIDE_TO_MOVE_VALUE.black}><Trans>Black to move</Trans></option>
                              </select>
                            </label>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-xs uppercase tracking-[0.14em] text-theme-muted"> <Trans>Instructions</Trans> </h3>
                        <div className="mt-2 space-y-3">
                          <div className="block">
                            <textarea
                              aria-label="Student instructions"
                              value={stepDraft.instructionText}
                              onChange={(event) =>
                                setStepDraft((current) => ({
                                  ...current,
                                  instructionText: event.target.value,
                                }))
                              }
                              placeholder={t("admin.form.studentPrompt")}
                              className={`min-h-[82px] ${textareaClass}`}
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-xs uppercase tracking-[0.14em] text-theme-muted"> <Trans>Feedback</Trans> </h3>
                        <div className="mt-2 grid gap-3 sm:grid-cols-2">
                          <label className="block space-y-1">
                            <span className={fieldLabelClass}><Trans>Correct feedback</Trans></span>
                            <textarea
                              value={stepDraft.successMessage}
                              onChange={(event) =>
                                setStepDraft((current) => ({
                                  ...current,
                                  successMessage: event.target.value,
                                }))
                              }
                              placeholder={t("admin.form.successMessage")}
                              className={`min-h-[70px] ${textareaClass}`}
                            />
                          </label>
                          <label className="block space-y-1">
                            <span className={fieldLabelClass}><Trans>Wrong feedback</Trans></span>
                            <textarea
                              value={stepDraft.wrongMoveMessage}
                              onChange={(event) =>
                                setStepDraft((current) => ({
                                  ...current,
                                  wrongMoveMessage: event.target.value,
                                }))
                              }
                              placeholder={t("admin.form.retryMessage")}
                              className={`min-h-[70px] ${textareaClass}`}
                            />
                          </label>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-xs uppercase tracking-[0.14em] text-theme-muted"> <Trans>Correct Moves</Trans> </h3>
                        <div className="mt-2 space-y-3">
                          <label className="block space-y-1">
                            <span className={fieldLabelClass}><Trans>Correct moves</Trans></span>
                            <textarea
                              value={stepDraft.acceptedMoves}
                              onChange={(event) =>
                                setStepDraft((current) => ({
                                  ...current,
                                  acceptedMoves: event.target.value,
                                }))
                              }
                              placeholder={t("admin.form.acceptedMovesExample")}
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
                                ? t("admin.learn.actions.stopBoardRecording", "Stop board recording")
                                : t("admin.learn.actions.recordFromBoard", "Record from board")}
                            </button>
                            <button
                              type="button"
                              disabled={acceptedMoveTokens.length === 0}
                              onClick={() => setAcceptedMoveTokens([])}
                              className={`${compactNeutralButtonClass} inline-flex items-center gap-1.5 disabled:cursor-not-allowed`}
                            >
                              <RotateCcw className="h-3.5 w-3.5" /> <Trans>Clear moves</Trans> </button>
                            <span className={`text-xs ${mutedTextClass}`}> <Trans>Drag or click a legal move on the preview board to add it.</Trans> </span>
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
                                    aria-label={t("admin.aria.removeMove", {
                                      token,
                                    })}
                                  > <Trans>x</Trans> </button>
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-4">
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
                                className="h-4 w-4 rounded border-theme-glass text-brand-500 focus:ring-brand-400/40"
                              /> <Trans>Show step</Trans> </label>
                          </div>
                        </div>
                      </div>
                    </div>

                    <aside className="space-y-3">
                      <h3 className="text-xs uppercase tracking-[0.14em] text-theme-muted"> <Trans>Position Preview</Trans> </h3>
                      <div className={previewSurfaceClass}>
                        <div
                          className={`mx-auto w-[280px] max-w-full rounded-xl overflow-hidden border ${previewBoardBorderClass}`}
                        >
                          <Chessboard
                            id={`admin-learn-step-preview-${previewBoardId}`}
                            allowDragOutsideBoard={false}
                            position={
                              previewValidation.valid
                                ? stepDraft.fen
                                : BOARD_PREVIEW_FALLBACK_POSITION
                            }
                            boardOrientation={stepDraft.boardOrientation}
                            onPieceDrop={handleAcceptedMoveDrop}
                            onSquareClick={handlePreviewSquareClick}
                            onSquareRightClick={clearAcceptedMoveSelection}
                            arePiecesDraggable={isRecordingAcceptedMoves && previewValidation.valid}
                            customSquareStyles={previewMoveSquares}
                            boardWidth={280}
                            dropOffBoardAction={BOARD_PREVIEW_DROP_ACTION}
                          />
                        </div>
                        {!previewValidation.valid && (
                          <p className={invalidFenClass}>
                            {previewValidation.message}
                          </p>
                        )}
                        <p className={`mt-3 text-xs ${mutedTextClass}`}>
                          {isRecordingAcceptedMoves
                            ? t(
                                "admin.learn.hints.recordingActive",
                                "Recording active: drag a legal move to add it to accepted moves.",
                              )
                            : t(
                                "admin.learn.hints.previewUsage",
                                "Preview uses current FEN and side to move selection.",
                              )}
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
