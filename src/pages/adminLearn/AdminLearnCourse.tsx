import { useEffect, useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Loader2,
  PencilLine,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import AdminSidebar from "../../components/AdminSidebar";
import { useThemeStore } from "../../store/themeStore";
import {
  createAdminLearnLesson,
  deleteAdminLearnLesson,
  fetchAdminLearnLessons,
  reorderAdminLearnLessons,
  updateAdminLearnLesson,
} from "./api";
import type { AdminLearnCourse, AdminLearnLesson, LessonPayload } from "./types";
import { useAdminGuard } from "./useAdminGuard";

type LessonStatusFilter = "all" | "published" | "unpublished";
const LESSON_STATUS_FILTER_VALUE = {
  all: "all",
  published: "published",
  unpublished: "unpublished",
} as const;

type LessonDraft = {
  title: string;
  slug: string;
  subtitle: string;
  description: string;
  pairId: string;
  estimatedMinutes: number;
  isPublished: boolean;
};

const EMPTY_DRAFT: LessonDraft = {
  title: "",
  slug: "",
  subtitle: "",
  description: "",
  pairId: "",
  estimatedMinutes: 10,
  isPublished: false,
};

function generatePairId() {
  return String(Math.floor(Math.random() * 90000) + 10000);
}

function toDraft(lesson: AdminLearnLesson): LessonDraft {
  return {
    title: lesson.title,
    slug: lesson.slug,
    subtitle: lesson.subtitle,
    description: lesson.description,
    pairId: lesson.pairId || "",
    estimatedMinutes: lesson.estimatedMinutes || 10,
    isPublished: lesson.isPublished,
  };
}

export default function AdminLearnCourse() {
  const { t } = useTranslation();
  const { courseId = "" } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { isDarkMode } = useThemeStore();
  const { isAuthenticated, isLoading: authLoading } = useAdminGuard();

  const [course, setCourse] = useState<AdminLearnCourse | null>(null);
  const [lessons, setLessons] = useState<AdminLearnLesson[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<LessonStatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingLesson, setEditingLesson] = useState<AdminLearnLesson | null>(null);
  const [draft, setDraft] = useState<LessonDraft>(EMPTY_DRAFT);
  const [processingLessonId, setProcessingLessonId] = useState<string | null>(null);

  const loadLessons = async () => {
    if (!courseId) return;
    try {
      setLoading(true);
      setError("");
      const data = await fetchAdminLearnLessons({
        courseId,
        search,
        status,
      });
      setCourse(data.course);
      setLessons(data.lessons || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lessons.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !courseId) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      await loadLessons();
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isAuthenticated, courseId, search, status]);

  const openCreate = () => {
    setEditingLesson(null);
    setDraft(EMPTY_DRAFT);
    setModalOpen(true);
  };

  const openEdit = (lesson: AdminLearnLesson) => {
    setEditingLesson(lesson);
    setDraft(toDraft(lesson));
    setModalOpen(true);
  };

  const handleSaveLesson = async () => {
    if (!courseId) return;
    setSaving(true);
    setError("");
    try {
      const payload: LessonPayload = {
        title: draft.title,
        slug: draft.slug,
        subtitle: draft.subtitle,
        description: draft.description,
        pairId: draft.pairId,
        estimatedMinutes: Number(draft.estimatedMinutes || 10),
        isPublished: draft.isPublished,
      };

      if (editingLesson) {
        const response = await updateAdminLearnLesson(editingLesson.id, payload);
        setLessons((prev) =>
          prev.map((entry) => (entry.id === editingLesson.id ? response.lesson : entry)),
        );
      } else {
        const response = await createAdminLearnLesson(courseId, payload);
        setLessons((prev) =>
          [...prev, response.lesson].sort((a, b) => a.orderIndex - b.orderIndex),
        );
      }
      setModalOpen(false);
      setEditingLesson(null);
      setDraft(EMPTY_DRAFT);
      await loadLessons();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save lesson.");
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublish = async (lesson: AdminLearnLesson) => {
    setProcessingLessonId(lesson.id);
    setError("");
    try {
      const response = await updateAdminLearnLesson(lesson.id, {
        isPublished: !lesson.isPublished,
      });
      setLessons((prev) =>
        prev.map((entry) => (entry.id === lesson.id ? response.lesson : entry)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update lesson status.");
    } finally {
      setProcessingLessonId(null);
    }
  };

  const handleDeleteLesson = async (lesson: AdminLearnLesson) => {
    const confirmed = window.confirm(
      t("admin.confirm.deleteLesson", { title: lesson.title }),
    );
    if (!confirmed) return;
    setProcessingLessonId(lesson.id);
    setError("");
    try {
      await deleteAdminLearnLesson(lesson.id);
      setLessons((prev) => prev.filter((entry) => entry.id !== lesson.id));
      await loadLessons();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete lesson.");
    } finally {
      setProcessingLessonId(null);
    }
  };

  const handleMoveLesson = async (
    lessonId: string,
    direction: "up" | "down",
  ) => {
    if (!courseId) return;
    const currentIndex = lessons.findIndex((entry) => entry.id === lessonId);
    if (currentIndex < 0) return;
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= lessons.length) return;

    const next = [...lessons];
    const [moved] = next.splice(currentIndex, 1);
    next.splice(targetIndex, 0, moved);
    const nextIds = next.map((entry) => entry.id);

    setProcessingLessonId(lessonId);
    setError("");
    try {
      const response = await reorderAdminLearnLessons(courseId, nextIds);
      setLessons(response.lessons || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reorder lessons.");
    } finally {
      setProcessingLessonId(null);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7] dark:bg-gray-950">
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
  const statCardClass = isDarkMode
    ? "border-slate-800 bg-slate-900/70"
    : "border-gray-200 bg-gray-50/90";
  const alertClass = isDarkMode
    ? "border-red-500/25 bg-red-500/10 text-red-200"
    : "border-red-200 bg-red-50 text-red-700";
  const inputClass =
    "h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
  const textInputClass =
    "h-11 w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
  const neutralButtonClass =
    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";
  const openActionClass = isDarkMode
    ? "border-cyan-400/25 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
    : "border-cyan-300 bg-cyan-100 text-cyan-800 hover:bg-cyan-200";
  const publishActionClass = isDarkMode
    ? "border-brand-400/25 bg-brand-500/10 text-brand-200 hover:bg-brand-500/20"
    : "border-brand-300 bg-brand-100 text-brand-800 hover:bg-brand-200";
  const deleteActionClass = isDarkMode
    ? "border-red-400/25 bg-red-500/10 text-red-200 hover:bg-red-500/20"
    : "border-red-300 bg-red-100 text-red-800 hover:bg-red-200";
  const publishedBadgeClass = isDarkMode
    ? "bg-brand-500/15 text-brand-300"
    : "bg-brand-100 text-brand-800";
  const draftBadgeClass = isDarkMode
    ? "bg-gray-500/15 text-gray-400"
    : "bg-gray-200 text-gray-700";

  return (
    <div className={isDarkMode ? "dark" : ""}>
      <div className={`min-h-screen ${pageToneClass}`}>
        <AdminSidebar />

        <main className="ml-72 px-8 py-7">
          <div className="mx-auto max-w-[1450px] space-y-6">
            <section className={`rounded-[24px] border p-6 ${surfaceClass}`}>
              <button
                onClick={() => navigate("/admin/learn")}
                className={neutralButtonClass}
              >
                <ArrowLeft className="h-3.5 w-3.5" /> <Trans>Back to Learn Admin</Trans> </button>

              <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">
                    {course?.title ||
                      t("admin.learn.labels.loadingCourse", "Loading course...")}
                  </h1>
                </div>
                <button
                  onClick={openCreate}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-500"
                >
                  <Plus className="h-4 w-4" /> <Trans>Add Lesson</Trans> </button>
              </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className={`rounded-2xl border px-4 py-4 ${statCardClass}`}>
          <div className="text-[11px] uppercase tracking-[0.2em] text-gray-500"> <Trans>Topic / Level</Trans> </div>
                  <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                    {course?.category || t("common.notAvailable", "-")}{" "}
                    <Trans>/</Trans>{" "}
                    {course?.difficulty || t("common.notAvailable", "-")}
                  </div>
                </div>
                <div className={`rounded-2xl border px-4 py-4 ${statCardClass}`}>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-gray-500"> <Trans>Lessons</Trans> </div>
                  <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                    {lessons.length}
                  </div>
                </div>
              </div>
            </section>

            <section className={`rounded-[24px] border p-5 ${surfaceClass}`}>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
                <label className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t("admin.search.lessons")}
                    className={textInputClass}
                  />
                </label>
                <select
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as LessonStatusFilter)
                  }
                  className={inputClass}
                >
                  <option value={LESSON_STATUS_FILTER_VALUE.all}><Trans>All status</Trans></option>
                  <option value={LESSON_STATUS_FILTER_VALUE.published}><Trans>Published</Trans></option>
                  <option value={LESSON_STATUS_FILTER_VALUE.unpublished}><Trans>Unpublished</Trans></option>
                </select>
              </div>
            </section>

            {error && (
              <div className={`rounded-xl border px-4 py-3 text-sm ${alertClass}`}>
                {error}
              </div>
            )}

            <section className={`rounded-[24px] border p-4 ${surfaceClass}`}>
              {loading ? (
                <div className="py-24 text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-400" />
                </div>
              ) : lessons.length === 0 ? (
                <div className="py-16 text-center text-gray-500 dark:text-gray-400"> <Trans>No lessons found.</Trans> </div>
              ) : (
                <div className="space-y-3">
                  {lessons.map((lesson, index) => {
                    const busy = processingLessonId === lesson.id;
                    return (
                      <article
                        key={lesson.id}
                        className={`rounded-2xl border px-4 py-4 ${statCardClass}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-gray-500"> <Trans>Lesson</Trans> {lesson.orderIndex + 1}
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  lesson.isPublished
                                    ? publishedBadgeClass
                                    : draftBadgeClass
                                }`}
                              >
                                {lesson.isPublished
                                  ? t("admin.learn.status.published", "Published")
                                  : t("admin.learn.status.draft", "Draft")}
                              </span>
                            </div>
                            <h3 className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                              {lesson.title}
                            </h3>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                              {lesson.subtitle ||
                                lesson.description ||
                                t("admin.learn.labels.noSubtitle", "No subtitle.")}
                            </p>
                            <div className="mt-2 text-xs text-gray-500">
                              {t("admin.learn.labels.lessonMeta", {
                                defaultValue:
                                  "{{steps}} steps - {{minutes}} min - /learn/{{courseSlug}}/{{lessonSlug}}",
                                steps: lesson.stepCount,
                                minutes: lesson.estimatedMinutes,
                                courseSlug: course?.slug || "",
                                lessonSlug: lesson.slug,
                              })}
                            </div>
                            {lesson.pairId && (
                              <div className="mt-1 inline-flex rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-slate-800 dark:text-slate-300"> <Trans>Pair ID:</Trans> {lesson.pairId}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              disabled={busy || index === 0}
                              onClick={() => void handleMoveLesson(lesson.id, "up")}
                              className={`${neutralButtonClass} disabled:opacity-55`}
                            >
                              <span className="inline-flex items-center gap-1">
                                <ChevronUp className="h-3.5 w-3.5" /> <Trans>Up</Trans> </span>
                            </button>
                            <button
                              disabled={busy || index === lessons.length - 1}
                              onClick={() => void handleMoveLesson(lesson.id, "down")}
                              className={`${neutralButtonClass} disabled:opacity-55`}
                            >
                              <span className="inline-flex items-center gap-1">
                                <ChevronDown className="h-3.5 w-3.5" /> <Trans>Down</Trans> </span>
                            </button>
                            <button
                              onClick={() =>
                                navigate(
                                  `/admin/learn/courses/${courseId}/lessons/${lesson.id}`,
                                )
                              }
                              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${openActionClass}`}
                            > <Trans>Step Editor</Trans> </button>
                            <button
                              onClick={() => openEdit(lesson)}
                              className={neutralButtonClass}
                            >
                              <span className="inline-flex items-center gap-1">
                                <PencilLine className="h-3.5 w-3.5" /> <Trans>Edit</Trans> </span>
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => void handleTogglePublish(lesson)}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${publishActionClass}`}
                            >
                              <span className="inline-flex items-center gap-1">
                                {lesson.isPublished ? (
                                  <EyeOff className="h-3.5 w-3.5" />
                                ) : (
                                  <Eye className="h-3.5 w-3.5" />
                                )}
                                {lesson.isPublished
                                  ? t("admin.learn.actions.unpublish", "Unpublish")
                                  : t("admin.learn.actions.publish", "Publish")}
                              </span>
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => void handleDeleteLesson(lesson)}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${deleteActionClass}`}
                            >
                              <span className="inline-flex items-center gap-1">
                                <Trash2 className="h-3.5 w-3.5" /> <Trans>Delete</Trans> </span>
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </main>

        {modalOpen && (
          <div className="fixed inset-0 z-[100] bg-black/55 backdrop-blur-sm px-4 py-8 overflow-y-auto">
            <div className="mx-auto w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.25)] dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {editingLesson
                    ? t("admin.learn.actions.editLesson", "Edit lesson")
                    : t("admin.learn.actions.createLesson", "Create lesson")}
                </h2>
                <button
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-gray-200 bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                > <Trans>Close</Trans> </button>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs uppercase tracking-[0.14em] text-gray-500"> <Trans>Lesson name</Trans> </span>
                  <input
                    value={draft.title}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, title: event.target.value }))
                    }
                    className={inputClass}
                  />
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={draft.isPublished}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        isPublished: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-400/40"
                  /> <Trans>Show lesson</Trans> </label>
              </div>

              <label className="mt-4 block space-y-1">
                <span className="text-xs uppercase tracking-[0.14em] text-gray-500"> <Trans>Pair ID</Trans> </span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{5}"
                    maxLength={5}
                    value={draft.pairId}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        pairId: event.target.value.replace(/\D/g, "").slice(0, 5),
                      }))
                    }
                    placeholder={t("admin.learn.placeholders.pairId", "10423")}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((current) => ({ ...current, pairId: generatePairId() }))
                    }
                    className="rounded-xl border border-gray-200 bg-gray-100 px-4 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  > <Trans>Generate</Trans> </button>
                </div>
              </label>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-gray-200 bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                > <Trans>Cancel</Trans> </button>
                <button
                  disabled={saving}
                  onClick={() => void handleSaveLesson()}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingLesson
                    ? t("admin.learn.actions.saveChanges", "Save Changes")
                    : t("admin.learn.actions.createLessonTitle", "Create Lesson")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

