import { useEffect, useState } from "react";
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

type LessonDraft = {
  title: string;
  slug: string;
  subtitle: string;
  description: string;
  estimatedMinutes: number;
  isPublished: boolean;
};

const EMPTY_DRAFT: LessonDraft = {
  title: "",
  slug: "",
  subtitle: "",
  description: "",
  estimatedMinutes: 10,
  isPublished: false,
};

function toDraft(lesson: AdminLearnLesson): LessonDraft {
  return {
    title: lesson.title,
    slug: lesson.slug,
    subtitle: lesson.subtitle,
    description: lesson.description,
    estimatedMinutes: lesson.estimatedMinutes || 10,
    isPublished: lesson.isPublished,
  };
}

export default function AdminLearnCourse() {
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
    const confirmed = window.confirm(`Delete lesson "${lesson.title}"?`);
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
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className={isDarkMode ? "dark" : ""}>
      <div className="min-h-screen bg-[#f5f5f7] text-gray-900 dark:bg-[#06101d] dark:text-white">
        <AdminSidebar />

        <main className="ml-72 px-8 py-7">
          <div className="mx-auto max-w-[1450px] space-y-6">
            <section className="rounded-[24px] border border-gray-200/80 bg-white/95 p-6 shadow-[0_18px_44px_rgba(15,23,42,0.08)] dark:border-white/[0.05] dark:bg-[#0c1728]/82 dark:shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
              <button
                onClick={() => navigate("/admin/learn")}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-gray-200"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Learn Admin
              </button>

              <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-teal-300/80">
                    Course Detail
                  </div>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">
                    {course?.title || "Loading course..."}
                  </h1>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    {course?.subtitle || "Manage lessons, order, and publishing state."}
                  </p>
                </div>
                <button
                  onClick={openCreate}
                  className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-500"
                >
                  <Plus className="h-4 w-4" />
                  Add Lesson
                </button>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-gray-200 bg-gray-50/90 px-4 py-4 dark:border-white/[0.05] dark:bg-white/[0.03]">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-gray-500">
                    Slug
                  </div>
                  <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                    {course?.slug || "-"}
                  </div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50/90 px-4 py-4 dark:border-white/[0.05] dark:bg-white/[0.03]">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-gray-500">
                    Category / Difficulty
                  </div>
                  <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                    {course?.category || "-"} / {course?.difficulty || "-"}
                  </div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50/90 px-4 py-4 dark:border-white/[0.05] dark:bg-white/[0.03]">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-gray-500">
                    Lessons
                  </div>
                  <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                    {lessons.length}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[24px] border border-gray-200/80 bg-white/95 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] dark:border-white/[0.05] dark:bg-[#0c1728]/82 dark:shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
                <label className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search lessons..."
                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-white/[0.06] dark:bg-white/[0.05] dark:text-white"
                  />
                </label>
                <select
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as LessonStatusFilter)
                  }
                  className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-white/[0.06] dark:bg-white/[0.05] dark:text-white"
                >
                  <option value="all">All status</option>
                  <option value="published">Published</option>
                  <option value="unpublished">Unpublished</option>
                </select>
              </div>
            </section>

            {error && (
              <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <section className="rounded-[24px] border border-gray-200/80 bg-white/95 p-4 shadow-[0_18px_44px_rgba(15,23,42,0.08)] dark:border-white/[0.05] dark:bg-[#0c1728]/82 dark:shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
              {loading ? (
                <div className="py-24 text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-teal-400" />
                </div>
              ) : lessons.length === 0 ? (
                <div className="py-16 text-center text-gray-500 dark:text-gray-400">
                  No lessons found.
                </div>
              ) : (
                <div className="space-y-3">
                  {lessons.map((lesson, index) => {
                    const busy = processingLessonId === lesson.id;
                    return (
                      <article
                        key={lesson.id}
                        className="rounded-2xl border border-gray-200 bg-gray-50/90 px-4 py-4 dark:border-white/[0.06] dark:bg-white/[0.03]"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-gray-500">
                              Lesson {lesson.orderIndex + 1}
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  lesson.isPublished
                                    ? "bg-emerald-500/15 text-emerald-300"
                                    : "bg-gray-500/15 text-gray-400"
                                }`}
                              >
                                {lesson.isPublished ? "Published" : "Draft"}
                              </span>
                            </div>
                            <h3 className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                              {lesson.title}
                            </h3>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                              {lesson.subtitle || lesson.description || "No subtitle."}
                            </p>
                            <div className="mt-2 text-xs text-gray-500">
                              {lesson.stepCount} steps · {lesson.estimatedMinutes} min · /learn/
                              {course?.slug}/{lesson.slug}
                            </div>
                          </div>

                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              disabled={busy || index === 0}
                              onClick={() => void handleMoveLesson(lesson.id, "up")}
                              className="rounded-lg border border-gray-200 bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-40 dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-gray-200"
                            >
                              <span className="inline-flex items-center gap-1">
                                <ChevronUp className="h-3.5 w-3.5" />
                                Up
                              </span>
                            </button>
                            <button
                              disabled={busy || index === lessons.length - 1}
                              onClick={() => void handleMoveLesson(lesson.id, "down")}
                              className="rounded-lg border border-gray-200 bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-40 dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-gray-200"
                            >
                              <span className="inline-flex items-center gap-1">
                                <ChevronDown className="h-3.5 w-3.5" />
                                Down
                              </span>
                            </button>
                            <button
                              onClick={() =>
                                navigate(
                                  `/admin/learn/courses/${courseId}/lessons/${lesson.id}`,
                                )
                              }
                              className="rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20"
                            >
                              Step Editor
                            </button>
                            <button
                              onClick={() => openEdit(lesson)}
                              className="rounded-lg border border-gray-200 bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-gray-200"
                            >
                              <span className="inline-flex items-center gap-1">
                                <PencilLine className="h-3.5 w-3.5" />
                                Edit
                              </span>
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => void handleTogglePublish(lesson)}
                              className="rounded-lg border border-teal-400/25 bg-teal-500/10 px-3 py-1.5 text-xs font-medium text-teal-200 hover:bg-teal-500/20 disabled:opacity-50"
                            >
                              <span className="inline-flex items-center gap-1">
                                {lesson.isPublished ? (
                                  <EyeOff className="h-3.5 w-3.5" />
                                ) : (
                                  <Eye className="h-3.5 w-3.5" />
                                )}
                                {lesson.isPublished ? "Unpublish" : "Publish"}
                              </span>
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => void handleDeleteLesson(lesson)}
                              className="rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-500/20 disabled:opacity-50"
                            >
                              <span className="inline-flex items-center gap-1">
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                              </span>
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
            <div className="mx-auto w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.25)] dark:border-white/[0.07] dark:bg-[#0b1523]">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {editingLesson ? "Edit lesson" : "Create lesson"}
                </h2>
                <button
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-gray-200 bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200 dark:border-white/[0.12] dark:bg-white/[0.06] dark:text-gray-300"
                >
                  Close
                </button>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs uppercase tracking-[0.14em] text-gray-500">
                    Title
                  </span>
                  <input
                    value={draft.title}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, title: event.target.value }))
                    }
                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-white"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs uppercase tracking-[0.14em] text-gray-500">
                    Slug
                  </span>
                  <input
                    value={draft.slug}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, slug: event.target.value }))
                    }
                    placeholder="auto-from-title"
                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-white"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs uppercase tracking-[0.14em] text-gray-500">
                    Estimated Minutes
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={draft.estimatedMinutes}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        estimatedMinutes: Number(event.target.value || 1),
                      }))
                    }
                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-white"
                  />
                </label>
                <label className="mt-7 inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={draft.isPublished}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        isPublished: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-gray-300 text-teal-500 focus:ring-teal-400/40"
                  />
                  Publish lesson
                </label>
              </div>

              <label className="mt-4 block space-y-1">
                <span className="text-xs uppercase tracking-[0.14em] text-gray-500">
                  Subtitle
                </span>
                <input
                  value={draft.subtitle}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, subtitle: event.target.value }))
                  }
                  className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-white"
                />
              </label>

              <label className="mt-4 block space-y-1">
                <span className="text-xs uppercase tracking-[0.14em] text-gray-500">
                  Description
                </span>
                <textarea
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  className="min-h-[110px] w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-white"
                />
              </label>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-gray-200 bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-gray-200"
                >
                  Cancel
                </button>
                <button
                  disabled={saving}
                  onClick={() => void handleSaveLesson()}
                  className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingLesson ? "Save Changes" : "Create Lesson"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
