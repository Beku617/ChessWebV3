import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Eye,
  EyeOff,
  Loader2,
  PencilLine,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import AdminSidebar from "../../components/AdminSidebar";
import { useThemeStore } from "../../store/themeStore";
import {
  createAdminLearnCourse,
  deleteAdminLearnCourse,
  fetchAdminLearnCourses,
  uploadAdminLearnCourseCoverImage,
  updateAdminLearnCourse,
} from "./api";
import type { AdminLearnCourse, CoursePayload } from "./types";
import { useAdminGuard } from "./useAdminGuard";

type PublishFilter = "all" | "published" | "unpublished";

type CourseDraft = {
  title: string;
  slug: string;
  subtitle: string;
  description: string;
  category: CoursePayload["category"];
  difficulty: CoursePayload["difficulty"];
  instructorName: string;
  tags: string;
  coverImage: string;
  badge: string;
  icon: string;
  sortOrder: number;
  isPublished: boolean;
};

const EMPTY_DRAFT: CourseDraft = {
  title: "",
  slug: "",
  subtitle: "",
  description: "",
  category: "Openings",
  difficulty: "Beginner",
  instructorName: "",
  tags: "",
  coverImage: "",
  badge: "",
  icon: "",
  sortOrder: 0,
  isPublished: false,
};

function toDraft(course: AdminLearnCourse): CourseDraft {
  return {
    title: course.title,
    slug: course.slug,
    subtitle: course.subtitle,
    description: course.description,
    category: course.category,
    difficulty: course.difficulty,
    instructorName: course.instructorName,
    tags: (course.tags || []).join(", "),
    coverImage: course.coverImage || "",
    badge: course.badge || "",
    icon: course.icon || "",
    sortOrder: Number(course.sortOrder || 0),
    isPublished: course.isPublished,
  };
}

export default function AdminLearnOverview() {
  const navigate = useNavigate();
  const { isDarkMode } = useThemeStore();
  const { isAuthenticated, isLoading: authLoading } = useAdminGuard();

  const [courses, setCourses] = useState<AdminLearnCourse[]>([]);
  const [stats, setStats] = useState({
    totalCourses: 0,
    totalLessons: 0,
    totalPublished: 0,
  });
  const [options, setOptions] = useState({
    categories: ["Openings", "Middlegame", "Endgame", "Strategy"] as string[],
    difficulties: ["Beginner", "Intermediate", "Advanced"] as string[],
  });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [status, setStatus] = useState<PublishFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [processingCourseId, setProcessingCourseId] = useState<string | null>(null);
  const [editingCourse, setEditingCourse] = useState<AdminLearnCourse | null>(null);
  const [draft, setDraft] = useState<CourseDraft>(EMPTY_DRAFT);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState("");

  useEffect(() => {
    if (!coverFile) {
      setCoverPreviewUrl(draft.coverImage || "");
      return;
    }
    const objectUrl = URL.createObjectURL(coverFile);
    setCoverPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [coverFile, draft.coverImage]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        setError("");
        const data = await fetchAdminLearnCourses({
          search,
          category,
          difficulty,
          status,
        });
        if (cancelled) return;
        setCourses(data.courses || []);
        setStats(
          data.stats || {
            totalCourses: 0,
            totalLessons: 0,
            totalPublished: 0,
          },
        );
        setOptions(
          data.options || {
            categories: ["Openings", "Middlegame", "Endgame", "Strategy"],
            difficulties: ["Beginner", "Intermediate", "Advanced"],
          },
        );
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load courses.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isAuthenticated, search, category, difficulty, status]);

  const modalTitle = editingCourse ? "Edit course" : "Create course";

  const handleOpenCreate = () => {
    setEditingCourse(null);
    setDraft(EMPTY_DRAFT);
    setCoverFile(null);
    setModalOpen(true);
    setError("");
  };

  const handleOpenEdit = (course: AdminLearnCourse) => {
    setEditingCourse(course);
    setDraft(toDraft(course));
    setCoverFile(null);
    setModalOpen(true);
    setError("");
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const payload: CoursePayload = {
        title: draft.title,
        slug: draft.slug,
        subtitle: draft.subtitle,
        description: draft.description,
        category: draft.category,
        difficulty: draft.difficulty,
        instructorName: draft.instructorName,
        tags: draft.tags
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
        coverImage: draft.coverImage,
        badge: draft.badge,
        icon: draft.icon,
        sortOrder: Number(draft.sortOrder || 0),
        isPublished: draft.isPublished,
      };

      let targetCourseId = editingCourse?.id || "";
      if (editingCourse) {
        const response = await updateAdminLearnCourse(editingCourse.id, payload);
        targetCourseId = response.course.id;
        setCourses((prev) =>
          prev.map((entry) =>
            entry.id === editingCourse.id ? response.course : entry,
          ),
        );
      } else {
        const response = await createAdminLearnCourse(payload);
        targetCourseId = response.course.id;
        setCourses((prev) => [response.course, ...prev]);
      }

      if (coverFile && targetCourseId) {
        await uploadAdminLearnCourseCoverImage(targetCourseId, coverFile);
      }

      setModalOpen(false);
      setEditingCourse(null);
      setDraft(EMPTY_DRAFT);
      setCoverFile(null);
      const refreshed = await fetchAdminLearnCourses({
        search,
        category,
        difficulty,
        status,
      });
      setStats(
        refreshed.stats || {
          totalCourses: 0,
          totalLessons: 0,
          totalPublished: 0,
        },
      );
      setCourses(refreshed.courses || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save course.");
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublish = async (course: AdminLearnCourse) => {
    setProcessingCourseId(course.id);
    setError("");
    try {
      const response = await updateAdminLearnCourse(course.id, {
        isPublished: !course.isPublished,
      });
      setCourses((prev) =>
        prev.map((entry) => (entry.id === course.id ? response.course : entry)),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to change publish status.",
      );
    } finally {
      setProcessingCourseId(null);
    }
  };

  const handleDelete = async (course: AdminLearnCourse) => {
    const confirmed = window.confirm(`Delete "${course.title}" and all lessons?`);
    if (!confirmed) return;

    setProcessingCourseId(course.id);
    setError("");
    try {
      await deleteAdminLearnCourse(course.id);
      setCourses((prev) => prev.filter((entry) => entry.id !== course.id));
      setStats((prev) => ({
        ...prev,
        totalCourses: Math.max(0, prev.totalCourses - 1),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete course.");
    } finally {
      setProcessingCourseId(null);
    }
  };

  const isBusy = authLoading || loading;
  const totalLessonsLabel = useMemo(
    () =>
      courses.reduce((total, course) => total + Number(course.totalLessons || 0), 0),
    [courses],
  );

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
    ? "border-slate-800 bg-slate-900/80 shadow-[0_24px_75px_rgba(0,0,0,0.24)]"
    : "border-gray-200/80 bg-white/95 shadow-[0_18px_50px_rgba(15,23,42,0.08)]";
  const compactSurfaceClass = isDarkMode
    ? "border-slate-800 bg-slate-900/80 shadow-[0_20px_60px_rgba(0,0,0,0.22)]"
    : "border-gray-200/80 bg-white/95 shadow-[0_18px_44px_rgba(15,23,42,0.08)]";
  const openActionClass = isDarkMode
    ? "border-cyan-400/25 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
    : "border-cyan-300 bg-cyan-50 text-cyan-700 hover:bg-cyan-100";
  const editActionClass = isDarkMode
    ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
    : "border-gray-300 bg-gray-100 text-gray-800 hover:bg-gray-200";
  const publishActionClass = isDarkMode
    ? "border-brand-400/25 bg-brand-500/10 text-brand-200 hover:bg-brand-500/20"
    : "border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100";
  const deleteActionClass = isDarkMode
    ? "border-red-400/25 bg-red-500/10 text-red-200 hover:bg-red-500/20"
    : "border-red-300 bg-red-50 text-red-700 hover:bg-red-100";

  return (
    <div className={isDarkMode ? "dark" : ""}>
      <div className={`min-h-screen ${pageToneClass}`}>
        <AdminSidebar />

        <main className="ml-72 px-8 py-7">
          <div className="mx-auto max-w-[1450px] space-y-6">
            <section
              className={`rounded-[26px] border p-6 ${surfaceClass}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-300/80">
                    Admin Learn
                  </div>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">
                    Learn Course Management
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-gray-500 dark:text-gray-400">
                    Create and manage production Learn courses, publishing states,
                    and lesson structures.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleOpenCreate}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-500"
                >
                  <Plus className="h-4 w-4" />
                  New Course
                </button>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-gray-200 bg-gray-50/90 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-gray-500">
                    Total Courses
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                    {stats.totalCourses}
                  </div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50/90 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-gray-500">
                    Total Lessons
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                    {stats.totalLessons}
                  </div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50/90 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-gray-500">
                    Published Courses
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                    {stats.totalPublished}
                  </div>
                </div>
              </div>
            </section>

            <section
              className={`rounded-[24px] border p-5 ${compactSurfaceClass}`}
            >
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_190px_190px_180px]">
                <label className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search by title, slug, tags..."
                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>

                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="">All categories</option>
                  {options.categories.map((entry) => (
                    <option key={entry} value={entry}>
                      {entry}
                    </option>
                  ))}
                </select>

                <select
                  value={difficulty}
                  onChange={(event) => setDifficulty(event.target.value)}
                  className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="">All difficulties</option>
                  {options.difficulties.map((entry) => (
                    <option key={entry} value={entry}>
                      {entry}
                    </option>
                  ))}
                </select>

                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as PublishFilter)}
                  className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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

            <section
              className={`rounded-[24px] border p-4 ${compactSurfaceClass}`}
            >
              {isBusy ? (
                <div className="py-24 text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-400" />
                </div>
              ) : courses.length === 0 ? (
                <div className="py-20 text-center">
                  <BookOpen className="mx-auto h-9 w-9 text-gray-500" />
                  <p className="mt-3 text-gray-500 dark:text-gray-400">
                    No courses found for the current filters.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px]">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-[0.14em] text-gray-500 dark:text-gray-500">
                        <th className="px-3 py-3">Course</th>
                        <th className="px-3 py-3">Category</th>
                        <th className="px-3 py-3">Difficulty</th>
                        <th className="px-3 py-3">Order</th>
                        <th className="px-3 py-3">Lessons</th>
                        <th className="px-3 py-3">Status</th>
                        <th className="px-3 py-3">Updated</th>
                        <th className="px-3 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {courses.map((course) => {
                        const busy = processingCourseId === course.id;
                        return (
                          <tr
                            key={course.id}
                            className="border-t border-gray-200/80 dark:border-slate-800"
                          >
                            <td className="px-3 py-4">
                              <div className="font-medium text-gray-900 dark:text-white">
                                {course.title}
                              </div>
                              <div className="mt-1 text-xs text-gray-500">
                                /learn/{course.slug}
                              </div>
                            </td>
                            <td className="px-3 py-4 text-sm text-gray-600 dark:text-gray-300">
                              {course.category}
                            </td>
                            <td className="px-3 py-4 text-sm text-gray-600 dark:text-gray-300">
                              {course.difficulty}
                            </td>
                            <td className="px-3 py-4 text-sm text-gray-600 dark:text-gray-300">
                              {course.sortOrder}
                            </td>
                            <td className="px-3 py-4 text-sm text-gray-600 dark:text-gray-300">
                              {course.totalLessons} total / {course.publishedLessons} published
                            </td>
                            <td className="px-3 py-4">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                                  course.isPublished
                                    ? "bg-brand-500/15 text-brand-300"
                                    : "bg-gray-500/15 text-gray-400"
                                }`}
                              >
                                {course.isPublished ? "Published" : "Draft"}
                              </span>
                            </td>
                            <td className="px-3 py-4 text-sm text-gray-500">
                              {course.updatedAt
                                ? new Date(course.updatedAt).toLocaleDateString()
                                : "-"}
                            </td>
                            <td className="px-3 py-4">
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() =>
                                    navigate(`/admin/learn/courses/${course.id}`)
                                  }
                                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${openActionClass}`}
                                >
                                  Open
                                </button>
                                <button
                                  onClick={() => handleOpenEdit(course)}
                                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${editActionClass}`}
                                >
                                  <span className="inline-flex items-center gap-1">
                                    <PencilLine className="h-3.5 w-3.5" />
                                    Edit
                                  </span>
                                </button>
                                <button
                                  disabled={busy}
                                  onClick={() => void handleTogglePublish(course)}
                                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${publishActionClass}`}
                                >
                                  <span className="inline-flex items-center gap-1">
                                    {course.isPublished ? (
                                      <EyeOff className="h-3.5 w-3.5" />
                                    ) : (
                                      <Eye className="h-3.5 w-3.5" />
                                    )}
                                    {course.isPublished ? "Unpublish" : "Publish"}
                                  </span>
                                </button>
                                <button
                                  disabled={busy}
                                  onClick={() => void handleDelete(course)}
                                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${deleteActionClass}`}
                                >
                                  <span className="inline-flex items-center gap-1">
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Delete
                                  </span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {!isBusy && (
              <div className="text-xs uppercase tracking-[0.14em] text-gray-500">
                Showing {courses.length} course{courses.length === 1 ? "" : "s"} /{" "}
                {totalLessonsLabel} lesson{totalLessonsLabel === 1 ? "" : "s"} in
                current result.
              </div>
            )}
          </div>
        </main>

        {modalOpen && (
          <div className="fixed inset-0 z-[100] bg-black/55 backdrop-blur-sm px-4 py-8 overflow-y-auto">
            <div className="mx-auto w-full max-w-3xl rounded-2xl border border-gray-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.25)] dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {modalTitle}
                </h2>
                <button
                  onClick={() => {
                    setModalOpen(false);
                    setCoverFile(null);
                  }}
                  className="rounded-lg border border-gray-200 bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
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
                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs uppercase tracking-[0.14em] text-gray-500">
                    Category
                  </span>
                  <select
                    value={draft.category}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        category: event.target.value as CourseDraft["category"],
                      }))
                    }
                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    {options.categories.map((entry) => (
                      <option key={entry} value={entry}>
                        {entry}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs uppercase tracking-[0.14em] text-gray-500">
                    Difficulty
                  </span>
                  <select
                    value={draft.difficulty}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        difficulty: event.target.value as CourseDraft["difficulty"],
                      }))
                    }
                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    {options.difficulties.map((entry) => (
                      <option key={entry} value={entry}>
                        {entry}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs uppercase tracking-[0.14em] text-gray-500">
                    Instructor
                  </span>
                  <input
                    value={draft.instructorName}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        instructorName: event.target.value,
                      }))
                    }
                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs uppercase tracking-[0.14em] text-gray-500">
                    Badge
                  </span>
                  <input
                    value={draft.badge}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, badge: event.target.value }))
                    }
                    placeholder="Course badge text"
                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs uppercase tracking-[0.14em] text-gray-500">
                    Tags
                  </span>
                  <input
                    value={draft.tags}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, tags: event.target.value }))
                    }
                    placeholder="opening, strategy"
                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs uppercase tracking-[0.14em] text-gray-500">
                    Sort Order
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={draft.sortOrder}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        sortOrder: Number(event.target.value || 0),
                      }))
                    }
                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs uppercase tracking-[0.14em] text-gray-500">
                    Cover Image URL
                  </span>
                  <input
                    value={draft.coverImage}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        coverImage: event.target.value,
                      }))
                    }
                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs uppercase tracking-[0.14em] text-gray-500">
                    Upload Cover Image
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(event) =>
                      setCoverFile(event.target.files?.[0] || null)
                    }
                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 file:mr-3 file:rounded-md file:border-0 file:bg-brand-600/20 file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-brand-200 hover:file:bg-brand-600/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs uppercase tracking-[0.14em] text-gray-500">
                    Icon
                  </span>
                  <input
                    value={draft.icon}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, icon: event.target.value }))
                    }
                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
              </div>

              <div className="mt-4">
                <span className="text-xs uppercase tracking-[0.14em] text-gray-500">
                  Cover Preview
                </span>
                <div className="mt-1.5 h-36 w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-100 dark:border-slate-700 dark:bg-slate-900">
                  {coverPreviewUrl ? (
                    <img
                      src={coverPreviewUrl}
                      alt="Course cover preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-gray-500 dark:text-gray-400">
                      No image selected
                    </div>
                  )}
                </div>
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
                  className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
                  className="min-h-[110px] w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>

              <label className="mt-4 inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
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
                />
                Publish immediately
              </label>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => {
                    setModalOpen(false);
                    setCoverFile(null);
                  }}
                  className="rounded-xl border border-gray-200 bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  disabled={saving}
                  onClick={() => void handleSave()}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingCourse ? "Save Changes" : "Create Course"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

