import { useEffect, useMemo, useState } from "react";
import { useTranslation, Trans } from "react-i18next";
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
import {
  createAdminLearnCourse,
  deleteAdminLearnCourse,
  fetchAdminLearnCourses,
  fetchAdminLearnMnCoursesForImport,
  importAdminLearnCoursesFromMn,
  uploadAdminLearnCourseCoverImage,
  updateAdminLearnCourse,
} from "./api";
import type { AdminLearnCourse, CoursePayload } from "./types";
import { useAdminGuard } from "./useAdminGuard";

type PublishFilter = "all" | "published" | "unpublished";
const PUBLISH_FILTER_VALUE = {
  all: "all",
  published: "published",
  unpublished: "unpublished",
} as const;
const IMPORT_WARNING_SEPARATOR = " | ";

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
  pairId: string;
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
  pairId: "",
  sortOrder: 0,
  isPublished: false,
};

function generatePairId() {
  return String(Math.floor(Math.random() * 90000) + 10000);
}

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
    pairId: course.pairId || "",
    sortOrder: Number(course.sortOrder || 0),
    isPublished: course.isPublished,
  };
}

export default function AdminLearnOverview() {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [importSourceCourses, setImportSourceCourses] = useState<AdminLearnCourse[]>([]);
  const [selectedImportCourseIds, setSelectedImportCourseIds] = useState<string[]>(
    [],
  );
  const [importError, setImportError] = useState("");
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importToast, setImportToast] = useState("");

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
    if (!importToast) return undefined;
    const timer = setTimeout(() => setImportToast(""), 3400);
    return () => clearTimeout(timer);
  }, [importToast]);

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

  const modalTitle = editingCourse
    ? t("admin.modal.editCourse")
    : t("admin.modal.createCourse");

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
        pairId: draft.pairId,
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
      setOptions(
        refreshed.options || {
          categories: ["Openings", "Middlegame", "Endgame", "Strategy"],
          difficulties: ["Beginner", "Intermediate", "Advanced"],
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
    const confirmed = window.confirm(
      t("admin.confirm.deleteCourseWithLessons", { title: course.title }),
    );
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

  const handleOpenImport = async () => {
    setImportModalOpen(true);
    setImportLoading(true);
    setImportError("");
    setImportWarnings([]);
    setSelectedImportCourseIds([]);
    try {
      const response = await fetchAdminLearnMnCoursesForImport();
      setImportSourceCourses(response.courses || []);
    } catch (err) {
      setImportError(
        err instanceof Error
          ? err.message
          : "Failed to load source courses for import.",
      );
      setImportSourceCourses([]);
    } finally {
      setImportLoading(false);
    }
  };

  const closeImportModal = () => {
    setImportModalOpen(false);
    setImportError("");
    setImportLoading(false);
    setSelectedImportCourseIds([]);
  };

  const handleToggleImportCourse = (courseId: string) => {
    setSelectedImportCourseIds((current) =>
      current.includes(courseId)
        ? current.filter((entry) => entry !== courseId)
        : [...current, courseId],
    );
  };

  const allImportSelected =
    importSourceCourses.length > 0 &&
    selectedImportCourseIds.length === importSourceCourses.length;

  const handleToggleImportAll = () => {
    setSelectedImportCourseIds((current) =>
      current.length === importSourceCourses.length
        ? []
        : importSourceCourses.map((course) => course.id),
    );
  };

  const handleImportSelected = async () => {
    if (!selectedImportCourseIds.length) return;

    setImportSaving(true);
    setImportError("");
    try {
      const result = await importAdminLearnCoursesFromMn(selectedImportCourseIds);
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
      setOptions(
        refreshed.options || {
          categories: ["Openings", "Middlegame", "Endgame", "Strategy"],
          difficulties: ["Beginner", "Intermediate", "Advanced"],
        },
      );
      setCourses(refreshed.courses || []);
      setImportWarnings(result.warnings || []);
      setImportToast(`${result.importedCount} course(s) imported successfully`);
      closeImportModal();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImportSaving(false);
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
      <div className="min-h-screen flex items-center justify-center bg-theme-panel ">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  const pageToneClass = "bg-theme-panel text-theme-foreground";
  const surfaceClass =
    "border-theme-glass bg-theme-panel/85 shadow-[0_20px_60px_rgba(15,23,42,0.12)]";
  const compactSurfaceClass =
    "border-theme-glass bg-theme-panel/85 shadow-[0_18px_44px_rgba(15,23,42,0.12)]";
  const openActionClass =
    "border-theme-border bg-theme-surface text-theme-accent hover:bg-theme-hover";
  const editActionClass =
    "border-theme-glass bg-theme-panel text-theme-foreground hover:bg-theme-hover";
  const publishActionClass =
    "border-theme-border bg-theme-surface text-theme-accent hover:bg-theme-hover";
  const deleteActionClass =
    "border-theme-glass bg-theme-surface text-theme-muted hover:bg-theme-hover";

  return (
    <div>
      <div className={`min-h-screen ${pageToneClass}`}>
        <AdminSidebar />

        <main className="ml-72 px-8 py-7">
          <div className="mx-auto max-w-[1450px] space-y-6">
            <section
              className={`rounded-[26px] border p-6 ${surfaceClass}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight text-theme-foreground "> <Trans>Learn Course Management</Trans> </h1>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleOpenImport()}
                    className="rounded-xl border border-theme-glass bg-theme-panel px-4 py-2.5 text-sm font-semibold text-theme-muted transition-colors hover:bg-theme-surface "
                  > <Trans>Import from МН</Trans> </button>
                  <button
                    type="button"
                    onClick={handleOpenCreate}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-theme-on-accent transition-colors hover:bg-brand-500"
                  >
                    <Plus className="h-4 w-4" /> <Trans>New Course</Trans> </button>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-theme-glass bg-theme-surface/90 px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-theme-muted"> <Trans>Total Courses</Trans> </div>
                  <div className="mt-2 text-2xl font-semibold text-theme-foreground ">
                    {stats.totalCourses}
                  </div>
                </div>
                <div className="rounded-2xl border border-theme-glass bg-theme-surface/90 px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-theme-muted"> <Trans>Total Lessons</Trans> </div>
                  <div className="mt-2 text-2xl font-semibold text-theme-foreground ">
                    {stats.totalLessons}
                  </div>
                </div>
                <div className="rounded-2xl border border-theme-glass bg-theme-surface/90 px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-theme-muted"> <Trans>Published Courses</Trans> </div>
                  <div className="mt-2 text-2xl font-semibold text-theme-foreground ">
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
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-muted" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t("admin.search.courses")}
                    className="h-11 w-full rounded-xl border border-theme-glass bg-theme-surface py-2 pl-10 pr-3 text-sm text-theme-foreground placeholder:text-theme-disabled focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </label>

                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="h-11 w-full rounded-xl border border-theme-glass bg-theme-surface px-3 text-sm text-theme-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                >
                  <option value=""><Trans>All categories</Trans></option>
                  {options.categories.map((entry) => (
                    <option key={entry} value={entry}>
                      {entry}
                    </option>
                  ))}
                </select>

                <select
                  value={difficulty}
                  onChange={(event) => setDifficulty(event.target.value)}
                  className="h-11 w-full rounded-xl border border-theme-glass bg-theme-surface px-3 text-sm text-theme-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                >
                  <option value=""><Trans>All difficulties</Trans></option>
                  {options.difficulties.map((entry) => (
                    <option key={entry} value={entry}>
                      {entry}
                    </option>
                  ))}
                </select>

                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as PublishFilter)}
                  className="h-11 w-full rounded-xl border border-theme-glass bg-theme-surface px-3 text-sm text-theme-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                >
                  <option value={PUBLISH_FILTER_VALUE.all}><Trans>All status</Trans></option>
                  <option value={PUBLISH_FILTER_VALUE.published}><Trans>Published</Trans></option>
                  <option value={PUBLISH_FILTER_VALUE.unpublished}><Trans>Unpublished</Trans></option>
                </select>
              </div>
            </section>

            {error && (
              <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}

            {importWarnings.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
                {importWarnings.join(IMPORT_WARNING_SEPARATOR)}
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
                  <BookOpen className="mx-auto h-9 w-9 text-theme-muted" />
                  <p className="mt-3 text-theme-muted"> <Trans>No courses found for the current filters.</Trans> </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px]">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-[0.14em] text-theme-muted">
                        <th className="px-3 py-3"><Trans>Course</Trans></th>
                        <th className="px-3 py-3"><Trans>Topic</Trans></th>
                        <th className="px-3 py-3"><Trans>Level</Trans></th>
                        <th className="px-3 py-3"><Trans>Lessons</Trans></th>
                        <th className="px-3 py-3"><Trans>Status</Trans></th>
                        <th className="px-3 py-3"><Trans>Updated</Trans></th>
                        <th className="px-3 py-3 text-right"><Trans>Actions</Trans></th>
                      </tr>
                    </thead>
                    <tbody>
                      {courses.map((course) => {
                        const busy = processingCourseId === course.id;
                        return (
                          <tr
                            key={course.id}
                            className="border-t border-theme-glass/80"
                          >
                            <td className="px-3 py-4">
                              <div className="font-medium text-theme-foreground ">
                                {course.title}
                              </div>
                              <div className="mt-1 text-xs text-theme-muted"> <Trans>/learn/</Trans>{course.slug}
                              </div>
                              {course.pairId && (
                                <div className="mt-1 inline-flex rounded-full bg-theme-surface px-2 py-0.5 text-[10px] font-medium text-theme-muted"> <Trans>Pair ID:</Trans> {course.pairId}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-4 text-sm text-theme-muted">
                              {course.category}
                            </td>
                            <td className="px-3 py-4 text-sm text-theme-muted">
                              {course.difficulty}
                            </td>
                            <td className="px-3 py-4 text-sm text-theme-muted">
                              {course.totalLessons} <Trans>total /</Trans> {course.publishedLessons} <Trans>published</Trans> </td>
                            <td className="px-3 py-4">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                                  course.isPublished
                                    ? "bg-brand-500/15 text-brand-300"
                                    : "bg-theme-surface/15 text-theme-muted"
                                }`}
                              >
                                {course.isPublished
                                  ? t("admin.learn.status.published", "Published")
                                  : t("admin.learn.status.draft", "Draft")}
                              </span>
                            </td>
                            <td className="px-3 py-4 text-sm text-theme-muted">
                              {course.updatedAt
                                ? new Date(course.updatedAt).toLocaleDateString()
                                : t("common.notAvailable", "-")}
                            </td>
                            <td className="px-3 py-4">
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() =>
                                    navigate(`/admin/learn/courses/${course.id}`)
                                  }
                                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${openActionClass}`}
                                > <Trans>Open</Trans> </button>
                                <button
                                  onClick={() => handleOpenEdit(course)}
                                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${editActionClass}`}
                                >
                                  <span className="inline-flex items-center gap-1">
                                    <PencilLine className="h-3.5 w-3.5" /> <Trans>Edit</Trans> </span>
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
                                    {course.isPublished
                                      ? t("admin.learn.actions.unpublish", "Unpublish")
                                      : t("admin.learn.actions.publish", "Publish")}
                                  </span>
                                </button>
                                <button
                                  disabled={busy}
                                  onClick={() => void handleDelete(course)}
                                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${deleteActionClass}`}
                                >
                                  <span className="inline-flex items-center gap-1">
                                    <Trash2 className="h-3.5 w-3.5" /> <Trans>Delete</Trans> </span>
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
              <div className="text-xs uppercase tracking-[0.14em] text-theme-muted">
                <Trans>Showing</Trans> {courses.length}{" "}
                {courses.length === 1
                  ? t("admin.learn.labels.courseSingular", "course")
                  : t("admin.learn.labels.coursePlural", "courses")}{" "}
                <Trans>/</Trans> {totalLessonsLabel}{" "}
                {totalLessonsLabel === 1
                  ? t("admin.learn.labels.lessonSingular", "lesson")
                  : t("admin.learn.labels.lessonPlural", "lessons")}{" "}
                <Trans>in current result.</Trans>
              </div>
            )}
          </div>
        </main>

        {importModalOpen && (
          <div className="fixed inset-0 z-[105] bg-theme-panel/55 backdrop-blur-sm px-4 py-8 overflow-y-auto">
            <div className="mx-auto w-full max-w-4xl rounded-2xl border border-theme-glass bg-theme-panel p-6 shadow-[0_24px_60px_rgba(15,23,42,0.25)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-semibold text-theme-foreground "> <Trans>Import from МН</Trans> </h2>
                <button
                  type="button"
                  onClick={closeImportModal}
                  disabled={importSaving}
                  className="rounded-lg border border-theme-glass bg-theme-surface px-3 py-1.5 text-xs font-medium text-theme-muted hover:bg-theme-surface/80 disabled:opacity-60"
                > <Trans>Close</Trans> </button>
              </div>

              {importError && (
                <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {importError}
                </div>
              )}

              <div className="mt-4 rounded-xl border border-theme-glass">
                {importLoading ? (
                  <div className="py-16 text-center">
                    <Loader2 className="mx-auto h-7 w-7 animate-spin text-brand-400" />
                  </div>
                ) : importSourceCourses.length === 0 ? (
                  <div className="py-12 text-center text-sm text-theme-muted"> <Trans>No courses available to import.</Trans> </div>
                ) : (
                  <div className="max-h-[52vh] overflow-auto">
                    <table className="w-full min-w-[920px]">
                      <thead className="bg-theme-surface">
                        <tr className="text-left text-xs uppercase tracking-[0.14em] text-theme-muted">
                          <th className="px-3 py-3">
                            <label className="inline-flex items-center gap-2 text-xs font-semibold normal-case tracking-normal text-theme-muted">
                              <input
                                type="checkbox"
                                checked={allImportSelected}
                                onChange={handleToggleImportAll}
                                className="h-4 w-4 rounded border-theme-glass text-brand-500 focus:ring-brand-500/30"
                              /> <Trans>All</Trans> </label>
                          </th>
                          <th className="px-3 py-3"><Trans>Course</Trans></th>
                          <th className="px-3 py-3"><Trans>Topic</Trans></th>
                          <th className="px-3 py-3"><Trans>Level</Trans></th>
                          <th className="px-3 py-3"><Trans>Lessons</Trans></th>
                          <th className="px-3 py-3"><Trans>Pair ID</Trans></th>
                        </tr>
                      </thead>
                      <tbody>
                        {importSourceCourses.map((course) => (
                          <tr
                            key={course.id}
                            className="border-t border-theme-glass/80"
                          >
                            <td className="px-3 py-3">
                              <input
                                type="checkbox"
                                checked={selectedImportCourseIds.includes(course.id)}
                                onChange={() => handleToggleImportCourse(course.id)}
                                className="h-4 w-4 rounded border-theme-glass text-brand-500 focus:ring-brand-500/30"
                              />
                            </td>
                            <td className="px-3 py-3 text-sm font-medium text-theme-foreground ">
                              {course.title}
                            </td>
                            <td className="px-3 py-3 text-sm text-theme-muted">
                              {course.category}
                            </td>
                            <td className="px-3 py-3 text-sm text-theme-muted">
                              {course.difficulty}
                            </td>
                            <td className="px-3 py-3 text-sm text-theme-muted">
                              {course.totalLessons}
                            </td>
                            <td className="px-3 py-3 text-xs text-theme-muted">
                              {course.pairId || t("common.notAvailable", "-")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="mt-5 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeImportModal}
                  disabled={importSaving}
                  className="rounded-xl border border-theme-glass bg-theme-surface px-4 py-2 text-sm font-medium text-theme-muted hover:bg-theme-surface/80 disabled:opacity-60"
                > <Trans>Cancel</Trans> </button>
                <button
                  type="button"
                  onClick={() => void handleImportSelected()}
                  disabled={importSaving || selectedImportCourseIds.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-theme-on-accent hover:bg-brand-500 disabled:opacity-60"
                >
                  {importSaving && <Loader2 className="h-4 w-4 animate-spin" />} <Trans>Import Selected</Trans> </button>
              </div>
            </div>
          </div>
        )}

        {modalOpen && (
          <div className="fixed inset-0 z-[100] bg-theme-panel/55 backdrop-blur-sm px-4 py-8 overflow-y-auto">
            <div className="mx-auto w-full max-w-2xl rounded-2xl border border-theme-glass bg-theme-panel p-6 shadow-[0_24px_60px_rgba(15,23,42,0.25)]">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-theme-foreground ">
                  {modalTitle}
                </h2>
                <button
                  onClick={() => {
                    setModalOpen(false);
                    setCoverFile(null);
                  }}
                  className="rounded-lg border border-theme-glass bg-theme-surface px-3 py-1.5 text-xs font-medium text-theme-muted hover:bg-theme-surface/80"
                > <Trans>Close</Trans> </button>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs uppercase tracking-[0.14em] text-theme-muted"> <Trans>Course name</Trans> </span>
                  <input
                    value={draft.title}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, title: event.target.value }))
                    }
                    className="h-11 w-full rounded-xl border border-theme-glass bg-theme-surface px-3 text-sm text-theme-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs uppercase tracking-[0.14em] text-theme-muted"> <Trans>Topic</Trans> </span>
                  <select
                    value={draft.category}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        category: event.target.value as CourseDraft["category"],
                      }))
                    }
                    className="h-11 w-full rounded-xl border border-theme-glass bg-theme-surface px-3 text-sm text-theme-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  >
                    {options.categories.map((entry) => (
                      <option key={entry} value={entry}>
                        {entry}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs uppercase tracking-[0.14em] text-theme-muted"> <Trans>Level</Trans> </span>
                  <select
                    value={draft.difficulty}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        difficulty: event.target.value as CourseDraft["difficulty"],
                      }))
                    }
                    className="h-11 w-full rounded-xl border border-theme-glass bg-theme-surface px-3 text-sm text-theme-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  >
                    {options.difficulties.map((entry) => (
                      <option key={entry} value={entry}>
                        {entry}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs uppercase tracking-[0.14em] text-theme-muted"> <Trans>Cover image</Trans> </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(event) =>
                      setCoverFile(event.target.files?.[0] || null)
                    }
                    className="h-11 w-full rounded-xl border border-theme-glass bg-theme-surface px-3 py-2 text-sm text-theme-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/30 file:mr-3 file:rounded-md file:border-0 file:bg-brand-600/20 file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-brand-200 hover:file:bg-brand-600/30"
                  />
                </label>
              </div>

              <div className="mt-4">
                <span className="text-xs uppercase tracking-[0.14em] text-theme-muted"> <Trans>Cover</Trans> </span>
                <div className="mt-1.5 h-36 w-full overflow-hidden rounded-xl border border-theme-glass bg-theme-surface">
                  {coverPreviewUrl ? (
                    <img
                      src={coverPreviewUrl}
                      alt={t("admin.learn.media.coverPreviewAlt", "Course cover preview")}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-theme-muted"> <Trans>No image selected</Trans> </div>
                  )}
                </div>
              </div>

              <label className="mt-4 block space-y-1">
                <span className="text-xs uppercase tracking-[0.14em] text-theme-muted"> <Trans>Summary</Trans> </span>
                <input
                  value={draft.subtitle}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, subtitle: event.target.value }))
                  }
                  className="h-11 w-full rounded-xl border border-theme-glass bg-theme-surface px-3 text-sm text-theme-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
              </label>

              <label className="mt-4 block space-y-1">
                <span className="text-xs uppercase tracking-[0.14em] text-theme-muted"> <Trans>Pair ID</Trans> </span>
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
                    className="h-11 w-full rounded-xl border border-theme-glass bg-theme-surface px-3 text-sm text-theme-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((current) => ({ ...current, pairId: generatePairId() }))
                    }
                    className="rounded-xl border border-theme-glass bg-theme-surface px-4 text-sm font-medium text-theme-muted hover:bg-theme-surface/80"
                  > <Trans>Generate</Trans> </button>
                </div>
              </label>

              <label className="mt-4 block space-y-1">
                <span className="text-xs uppercase tracking-[0.14em] text-theme-muted"> <Trans>Instructor</Trans> </span>
                <input
                  value={draft.instructorName}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      instructorName: event.target.value,
                    }))
                  }
                  placeholder={t("admin.learn.placeholders.instructorExample", "IM Viktor Asanov")}
                  className="h-11 w-full rounded-xl border border-theme-glass bg-theme-surface px-3 text-sm text-theme-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
              </label>

              <label className="mt-4 inline-flex items-center gap-2 text-sm text-theme-muted">
                <input
                  type="checkbox"
                  checked={draft.isPublished}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      isPublished: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-theme-glass text-brand-500 focus:ring-brand-400/40"
                /> <Trans>Show course</Trans> </label>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => {
                    setModalOpen(false);
                    setCoverFile(null);
                  }}
                  className="rounded-xl border border-theme-glass bg-theme-surface px-4 py-2 text-sm font-medium text-theme-muted hover:bg-theme-surface/80"
                > <Trans>Cancel</Trans> </button>
                <button
                  disabled={saving}
                  onClick={() => void handleSave()}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-theme-on-accent hover:bg-brand-500 disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingCourse
                    ? t("admin.learn.actions.saveChanges", "Save Changes")
                    : t("admin.learn.actions.createCourse", "Create Course")}
                </button>
              </div>
            </div>
          </div>
        )}

        {importToast && (
          <div className="pointer-events-none fixed bottom-6 right-6 z-[130] rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-theme-on-accent shadow-lg">
            {importToast}
          </div>
        )}
      </div>
    </div>
  );
}
