import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Copy,
  Loader2,
  Plus,
  Save,
  Search,
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
  acceptedMoves: string;
  feedbackCorrect: string;
  feedbackWrong: string;
  hintText: string;
  autoAdvance: boolean;
  keepPositionOnWrong: boolean;
  nextFen: string;
};

const EMPTY_STEP_DRAFT: StepDraft = {
  title: "",
  instructionText: "",
  explanationBeforeMove: "",
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  sideToMove: "white",
  acceptedMoves: "",
  feedbackCorrect: "",
  feedbackWrong: "",
  hintText: "",
  autoAdvance: false,
  keepPositionOnWrong: false,
  nextFen: "",
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
    acceptedMoves: (step.acceptedMoves || []).join(", "),
    feedbackCorrect: step.feedbackCorrect || "",
    feedbackWrong: step.feedbackWrong || "",
    hintText: step.hintText || "",
    autoAdvance: !!step.autoAdvance,
    keepPositionOnWrong: !!step.keepPositionOnWrong,
    nextFen: step.nextFen || "",
  };
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

  const handleSelectStep = (step: AdminLearnStep) => {
    setSelectedStepId(step.id);
    setStepDraft(toStepDraft(step));
  };

  const handleNewStep = () => {
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
      const payload: StepPayload = {
        title: stepDraft.title,
        instructionText: stepDraft.instructionText,
        explanationBeforeMove: stepDraft.explanationBeforeMove,
        fen: stepDraft.fen,
        sideToMove: stepDraft.sideToMove,
        acceptedMoves: stepDraft.acceptedMoves,
        feedbackCorrect: stepDraft.feedbackCorrect,
        feedbackWrong: stepDraft.feedbackWrong,
        hintText: stepDraft.hintText,
        autoAdvance: stepDraft.autoAdvance,
        keepPositionOnWrong: stepDraft.keepPositionOnWrong,
        nextFen: stepDraft.nextFen,
        successCondition: "accepted_move",
      };

      if (selectedStepId) {
        const response = await updateAdminLearnStep(selectedStepId, payload);
        setSteps((prev) =>
          prev.map((entry) => (entry.id === selectedStepId ? response.step : entry)),
        );
        setStepDraft(toStepDraft(response.step));
      } else {
        const response = await createAdminLearnStep(lessonId, payload);
        setSteps((prev) =>
          [...prev, response.step].sort((a, b) => a.orderIndex - b.orderIndex),
        );
        setSelectedStepId(response.step.id);
        setStepDraft(toStepDraft(response.step));
      }

      await loadSteps(response.step.id);
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
      const payload: StepPayload = {
        ...toStepDraft(step),
        title: step.title ? `${step.title} (Copy)` : "Step copy",
        acceptedMoves: step.acceptedMoves,
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

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7] dark:bg-gray-950">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className={isDarkMode ? "dark" : ""}>
      <div className="min-h-screen bg-[#f5f5f7] text-gray-900 dark:bg-[#06101d] dark:text-white">
        <AdminSidebar />

        <main className="ml-72 px-8 py-7">
          <div className="mx-auto max-w-[1520px] space-y-6">
            <section className="rounded-[24px] border border-gray-200/80 bg-white/95 p-6 shadow-[0_18px_44px_rgba(15,23,42,0.08)] dark:border-white/[0.05] dark:bg-[#0c1728]/82 dark:shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
              <button
                onClick={() => navigate(`/admin/learn/courses/${courseId}`)}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-gray-200"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Course
              </button>

              <div className="mt-4">
                <div className="text-[11px] uppercase tracking-[0.2em] text-teal-300/80">
                  Lesson Step Editor
                </div>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">
                  {lesson?.title || "Loading lesson..."}
                </h1>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {course?.title || "Course"} · {steps.length} steps
                </p>
              </div>
            </section>

            {error && (
              <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <section className="grid gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
              <div className="rounded-[24px] border border-gray-200/80 bg-white/95 p-4 shadow-[0_18px_44px_rgba(15,23,42,0.08)] dark:border-white/[0.05] dark:bg-[#0c1728]/82 dark:shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-gray-500">
                    Steps
                  </h2>
                  <button
                    onClick={handleNewStep}
                    className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-500"
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
                    className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-10 pr-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-white/[0.06] dark:bg-white/[0.05] dark:text-white"
                  />
                </label>

                {loading ? (
                  <div className="py-16 text-center">
                    <Loader2 className="mx-auto h-7 w-7 animate-spin text-teal-400" />
                  </div>
                ) : steps.length === 0 ? (
                  <div className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">
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
                              : "border-gray-200 bg-gray-50/90 hover:border-gray-300 dark:border-white/[0.06] dark:bg-white/[0.03]"
                          }`}
                        >
                          <button
                            onClick={() => handleSelectStep(step)}
                            className="w-full text-left"
                          >
                            <div className="text-[11px] uppercase tracking-[0.14em] text-gray-500">
                              Step {step.orderIndex + 1}
                            </div>
                            <div className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
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
                              className="rounded-md border border-gray-200 bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-40 dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-gray-200"
                            >
                              <ChevronUp className="h-3 w-3" />
                            </button>
                            <button
                              disabled={busy || index === steps.length - 1}
                              onClick={() => void handleMoveStep(step.id, "down")}
                              className="rounded-md border border-gray-200 bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-40 dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-gray-200"
                            >
                              <ChevronDown className="h-3 w-3" />
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => void handleDuplicateStep(step)}
                              className="rounded-md border border-indigo-400/25 bg-indigo-500/10 px-2 py-1 text-[11px] font-medium text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-40"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => void handleDeleteStep(step)}
                              className="rounded-md border border-red-400/25 bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-200 hover:bg-red-500/20 disabled:opacity-40"
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
                <section className="rounded-[24px] border border-gray-200/80 bg-white/95 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] dark:border-white/[0.05] dark:bg-[#0c1728]/82 dark:shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-gray-500">
                      Lesson Metadata
                    </h2>
                    <button
                      disabled={savingLesson || !lessonDraft}
                      onClick={() => void handleSaveLessonMeta()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
                    >
                      {savingLesson ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Save Lesson
                    </button>
                  </div>

                  {lessonDraft && (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <input
                        value={lessonDraft.title}
                        onChange={(event) =>
                          setLessonDraft((current) =>
                            current ? { ...current, title: event.target.value } : current,
                          )
                        }
                        placeholder="Lesson title"
                        className="h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-white"
                      />
                      <input
                        value={lessonDraft.slug}
                        onChange={(event) =>
                          setLessonDraft((current) =>
                            current ? { ...current, slug: event.target.value } : current,
                          )
                        }
                        placeholder="Lesson slug"
                        className="h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-white"
                      />
                      <input
                        value={lessonDraft.subtitle}
                        onChange={(event) =>
                          setLessonDraft((current) =>
                            current
                              ? { ...current, subtitle: event.target.value }
                              : current,
                          )
                        }
                        placeholder="Subtitle"
                        className="h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-white"
                      />
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
                        placeholder="Estimated minutes"
                        className="h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-white"
                      />
                      <textarea
                        value={lessonDraft.description}
                        onChange={(event) =>
                          setLessonDraft((current) =>
                            current
                              ? { ...current, description: event.target.value }
                              : current,
                          )
                        }
                        placeholder="Lesson description"
                        className="min-h-[85px] rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 sm:col-span-2 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-white"
                      />
                      <label className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
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
                          className="h-4 w-4 rounded border-gray-300 text-teal-500 focus:ring-teal-400/40"
                        />
                        Lesson is published
                      </label>
                    </div>
                  )}
                </section>

                <section className="rounded-[24px] border border-gray-200/80 bg-white/95 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] dark:border-white/[0.05] dark:bg-[#0c1728]/82 dark:shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-gray-500">
                      {selectedStep ? `Edit Step ${selectedStep.orderIndex + 1}` : "Create Step"}
                    </h2>
                    <button
                      disabled={savingStep}
                      onClick={() => void handleSaveStep()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
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
                          Section A - Metadata
                        </h3>
                        <div className="mt-2 grid gap-3 sm:grid-cols-2">
                          <input
                            value={stepDraft.title}
                            onChange={(event) =>
                              setStepDraft((current) => ({
                                ...current,
                                title: event.target.value,
                              }))
                            }
                            placeholder="Step title"
                            className="h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-white"
                          />
                          <div className="h-10 rounded-xl border border-gray-200 bg-gray-100 px-3 text-xs text-gray-500 flex items-center dark:border-white/[0.08] dark:bg-white/[0.05]">
                            Order managed with Up/Down controls
                          </div>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-xs uppercase tracking-[0.14em] text-gray-500">
                          Section B - Board State
                        </h3>
                        <div className="mt-2 space-y-3">
                          <textarea
                            value={stepDraft.fen}
                            onChange={(event) =>
                              setStepDraft((current) => ({
                                ...current,
                                fen: event.target.value,
                              }))
                            }
                            placeholder="FEN"
                            className="min-h-[75px] w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-white"
                          />
                          <select
                            value={stepDraft.sideToMove}
                            onChange={(event) =>
                              setStepDraft((current) => ({
                                ...current,
                                sideToMove: event.target.value as "white" | "black",
                              }))
                            }
                            className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-white"
                          >
                            <option value="white">White to move</option>
                            <option value="black">Black to move</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-xs uppercase tracking-[0.14em] text-gray-500">
                          Section C - Instruction
                        </h3>
                        <div className="mt-2 space-y-3">
                          <textarea
                            value={stepDraft.instructionText}
                            onChange={(event) =>
                              setStepDraft((current) => ({
                                ...current,
                                instructionText: event.target.value,
                              }))
                            }
                            placeholder="Instruction text"
                            className="min-h-[82px] w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-white"
                          />
                          <textarea
                            value={stepDraft.explanationBeforeMove}
                            onChange={(event) =>
                              setStepDraft((current) => ({
                                ...current,
                                explanationBeforeMove: event.target.value,
                              }))
                            }
                            placeholder="Explanation before move"
                            className="min-h-[72px] w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-white"
                          />
                          <textarea
                            value={stepDraft.hintText}
                            onChange={(event) =>
                              setStepDraft((current) => ({
                                ...current,
                                hintText: event.target.value,
                              }))
                            }
                            placeholder="Hint text"
                            className="min-h-[62px] w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-white"
                          />
                        </div>
                      </div>

                      <div>
                        <h3 className="text-xs uppercase tracking-[0.14em] text-gray-500">
                          Section D - Validation
                        </h3>
                        <div className="mt-2 space-y-3">
                          <textarea
                            value={stepDraft.acceptedMoves}
                            onChange={(event) =>
                              setStepDraft((current) => ({
                                ...current,
                                acceptedMoves: event.target.value,
                              }))
                            }
                            placeholder="Accepted moves (comma or new line)"
                            className="min-h-[70px] w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-white"
                          />
                          <textarea
                            value={stepDraft.feedbackCorrect}
                            onChange={(event) =>
                              setStepDraft((current) => ({
                                ...current,
                                feedbackCorrect: event.target.value,
                              }))
                            }
                            placeholder="Correct move feedback"
                            className="min-h-[62px] w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-white"
                          />
                          <textarea
                            value={stepDraft.feedbackWrong}
                            onChange={(event) =>
                              setStepDraft((current) => ({
                                ...current,
                                feedbackWrong: event.target.value,
                              }))
                            }
                            placeholder="Wrong move feedback"
                            className="min-h-[62px] w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-white"
                          />
                          <input
                            value={stepDraft.nextFen}
                            onChange={(event) =>
                              setStepDraft((current) => ({
                                ...current,
                                nextFen: event.target.value,
                              }))
                            }
                            placeholder="Optional next FEN"
                            className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-white"
                          />
                          <div className="flex flex-wrap gap-4">
                            <label className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                              <input
                                type="checkbox"
                                checked={stepDraft.autoAdvance}
                                onChange={(event) =>
                                  setStepDraft((current) => ({
                                    ...current,
                                    autoAdvance: event.target.checked,
                                  }))
                                }
                                className="h-4 w-4 rounded border-gray-300 text-teal-500 focus:ring-teal-400/40"
                              />
                              Auto advance
                            </label>
                            <label className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                              <input
                                type="checkbox"
                                checked={stepDraft.keepPositionOnWrong}
                                onChange={(event) =>
                                  setStepDraft((current) => ({
                                    ...current,
                                    keepPositionOnWrong: event.target.checked,
                                  }))
                                }
                                className="h-4 w-4 rounded border-gray-300 text-teal-500 focus:ring-teal-400/40"
                              />
                              Keep board on wrong move
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>

                    <aside className="space-y-3">
                      <h3 className="text-xs uppercase tracking-[0.14em] text-gray-500">
                        Position Preview
                      </h3>
                      <div className="rounded-2xl border border-gray-200 bg-gray-50/90 p-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
                        <div className="mx-auto w-[280px] max-w-full rounded-xl overflow-hidden border border-gray-200 dark:border-white/[0.08]">
                          <Chessboard
                            id="admin-learn-step-preview"
                            position={previewValidation.valid ? stepDraft.fen : "start"}
                            boardOrientation={
                              stepDraft.sideToMove === "white" ? "white" : "black"
                            }
                            arePiecesDraggable={false}
                            boardWidth={280}
                          />
                        </div>
                        {!previewValidation.valid && (
                          <p className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                            {previewValidation.message}
                          </p>
                        )}
                        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                          Preview uses current FEN and side to move selection.
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
