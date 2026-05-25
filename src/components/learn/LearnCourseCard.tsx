import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  GraduationCap,
  Play,
  RotateCcw,
  UserRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { LearnCatalogCourse } from "../../features/learn/types";

interface LearnCourseCardProps {
  course: LearnCatalogCourse;
  onContinue: (courseSlug: string, lessonSlug: string) => void;
  onOpenLesson: (courseSlug: string, lessonSlug: string) => void;
}

function difficultyClass(value: string) {
  if (value === "Beginner") {
    return "bg-emerald-500/12 text-emerald-700 border-emerald-400/30";
  }
  if (value === "Advanced") {
    return "bg-rose-500/12 text-rose-700 border-rose-400/30";
  }
  return "bg-amber-500/12 text-amber-700 border-amber-400/30";
}

export function LearnCourseCard({
  course,
  onContinue,
  onOpenLesson,
}: LearnCourseCardProps) {
  const { t } = useTranslation();
  const badgeText = course.badge?.trim() || course.difficulty;
  const continueSlug = course.progress.continueLessonSlug || course.lessons[0]?.slug;
  const retrySlug = course.lessons[0]?.slug || continueSlug;
  const actionSlug =
    course.progress.status === "completed" ? retrySlug : continueSlug;
  const isStarted = course.progress.status !== "not_started";
  const isCompleted = course.progress.status === "completed";
  const visibleLessons = course.lessons.slice(0, 2);
  const progressPercent = Math.max(0, Math.min(100, course.progress.percentComplete));
  const secondaryText = course.subtitle || course.description;
  const actionLabel = isCompleted
    ? t("learn.retryCourse", "Retry Course")
    : isStarted
      ? t("learn.continueLesson", "Continue Lesson")
      : t("learn.startCourse", "Start Course");
  const categoryLabel =
    course.category === "Openings"
      ? t("learn.categories.openings", "Openings")
      : course.category === "Middlegame"
        ? t("learn.categories.middlegame", "Middlegame")
        : course.category === "Endgame"
          ? t("learn.categories.endgame", "Endgame")
          : t("learn.categories.strategy", "Strategy");
  const localizedBadgeText =
    badgeText === "Beginner"
      ? t("learn.difficulty.beginner", "Beginner")
      : badgeText === "Intermediate"
        ? t("learn.difficulty.intermediate", "Intermediate")
        : badgeText === "Advanced"
          ? t("learn.difficulty.advanced", "Advanced")
          : badgeText;

  return (
    <article className="overflow-hidden rounded-2xl border border-theme-border bg-theme-panel/70 shadow-[0_20px_40px_-32px_rgba(15,23,42,0.95)]">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="relative min-h-[290px] overflow-hidden border-b border-theme-border xl:min-h-[400px] xl:border-b-0 xl:border-r xl:border-theme-border">
          {course.coverImage ? (
            <img
              src={course.coverImage}
              alt={course.title}
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
            />
          ) : null}

          <div className="absolute inset-0 bg-[linear-gradient(160deg,rgba(2,6,23,0.54),rgba(2,6,23,0.9))]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(20,184,166,0.09),transparent_56%)]" />

          <div className="relative z-10 flex h-full flex-col justify-between p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex h-8 items-center rounded-full border border-white/35 bg-white/12 px-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-white">
                {localizedBadgeText}
              </span>
            </div>

            <div className="max-w-[28rem] space-y-3">
              <h3 className="font-sans text-3xl leading-[1.08] font-semibold tracking-tight text-white sm:text-4xl">
                {course.title}
              </h3>
              <p className="line-clamp-2 text-sm leading-relaxed text-white/85">
                {secondaryText}
              </p>
              <div className="inline-flex items-center gap-2 text-white/85">
                <UserRound className="h-4 w-4 text-white/75" />
                <span className="text-sm">
                  {course.instructorName ||
                    t("learn.instructorFallback", "NeonGambit Instructor")}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6 bg-theme-panel/65 p-5 sm:p-6">
          <div className="flex items-center">
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-theme-muted/90">
              {t("learn.courseProgress", "Course Progress")}
            </p>
          </div>

          <div className="rounded-2xl border border-theme-border bg-theme-panel/70 p-4">
            <div className="mb-2.5 flex items-center justify-between text-xs text-theme-muted">
              <span>
                {t("learn.lessonProgress", {
                  defaultValue: "{{completed}}/{{total}} lessons",
                  completed: course.progress.completedLessonsCount,
                  total: course.progress.totalLessons,
                })}
              </span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-theme-surface">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-300 to-cyan-300 transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-theme-muted/90">
                {t("learn.quickLessons", "Quick Lessons")}
              </p>
              <span
                className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${difficultyClass(course.difficulty)}`}
              >
                {categoryLabel}
              </span>
            </div>

            <div className="space-y-2">
              {visibleLessons.map((lesson) => (
                <button
                  key={lesson.id}
                  onClick={() => onOpenLesson(course.slug, lesson.slug)}
                  className="group flex h-11 w-full items-center gap-3 rounded-xl border border-theme-border bg-theme-panel/70 px-3 text-left transition-colors hover:border-brand-300/35 hover:bg-theme-panel/90"
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-theme-border bg-theme-panel/85 text-theme-muted group-hover:text-brand-700">
                    <Play className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-theme-foreground">
                    {lesson.title}
                  </span>
                  <ChevronRight className="h-4 w-4 text-theme-muted group-hover:text-theme-muted" />
                </button>
              ))}
            </div>
          </div>

          <div className="mt-auto space-y-3 pt-1">
            {course.lessons.length > visibleLessons.length ? (
              <p className="text-xs text-theme-muted">
                {t(
                  course.lessons.length - visibleLessons.length === 1
                    ? "learn.moreLessons_one"
                    : "learn.moreLessons_other",
                  {
                    defaultValue: "+{{count}} more lessons",
                  count: course.lessons.length - visibleLessons.length,
                  },
                )}
              </p>
            ) : null}
          </div>

          <button
            onClick={() => actionSlug && onContinue(course.slug, actionSlug)}
            disabled={!actionSlug}
            className="group inline-flex h-11 w-full items-center justify-center rounded-xl border border-cyan-300/35 bg-gradient-to-r from-brand-300 via-cyan-300 to-brand-300 px-5 text-sm font-semibold text-theme-foreground transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:brightness-100"
          >
            <span className="inline-flex items-center gap-2">
              {isCompleted ? (
                <RotateCcw className="h-4 w-4" />
              ) : isStarted ? (
                <BookOpen className="h-4 w-4" />
              ) : (
                <GraduationCap className="h-4 w-4" />
              )}
              {actionLabel}
            </span>
            {!isCompleted ? (
              <ArrowRight className="ml-2 inline-block h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            ) : (
              <ArrowRight className="ml-2 inline-block h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </article>
  );
}

