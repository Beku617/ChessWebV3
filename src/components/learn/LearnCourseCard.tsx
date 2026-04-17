import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  GraduationCap,
  Play,
  RotateCcw,
  UserRound,
} from "lucide-react";
import type { LearnCatalogCourse } from "../../features/learn/types";

interface LearnCourseCardProps {
  course: LearnCatalogCourse;
  onContinue: (courseSlug: string, lessonSlug: string) => void;
  onOpenLesson: (courseSlug: string, lessonSlug: string) => void;
}

function difficultyClass(value: string) {
  if (value === "Beginner") {
    return "bg-brand-500/15 text-brand-200 border-brand-400/30";
  }
  if (value === "Advanced") {
    return "bg-rose-500/15 text-rose-200 border-rose-400/30";
  }
  return "bg-amber-500/15 text-amber-200 border-amber-400/30";
}

export function LearnCourseCard({
  course,
  onContinue,
  onOpenLesson,
}: LearnCourseCardProps) {
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
    ? "Retry Course"
    : isStarted
      ? "Continue Lesson"
      : "Start Course";

  return (
    <article className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/70 shadow-[0_20px_40px_-32px_rgba(15,23,42,0.95)]">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="relative min-h-[290px] overflow-hidden border-b border-gray-800 xl:min-h-[400px] xl:border-b-0 xl:border-r xl:border-gray-800">
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
              <span className="inline-flex h-8 items-center rounded-full border border-brand-400/35 bg-brand-500/12 px-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-brand-100">
                {badgeText}
              </span>
            </div>

            <div className="max-w-[28rem] space-y-3">
              <h3 className="font-sans text-3xl leading-[1.08] font-semibold tracking-tight text-slate-50 sm:text-4xl">
                {course.title}
              </h3>
              <p className="line-clamp-2 text-sm leading-relaxed text-gray-300/85">
                {secondaryText}
              </p>
              <div className="inline-flex items-center gap-2 text-gray-300/85">
                <UserRound className="h-4 w-4 text-gray-400" />
                <span className="text-sm">
                  {course.instructorName || "NeonGambit Instructor"}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6 bg-gray-900/65 p-5 sm:p-6">
          <div className="flex items-center">
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-gray-400/90">
              Course Progress
            </p>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4">
            <div className="mb-2.5 flex items-center justify-between text-xs text-gray-400">
              <span>
                {course.progress.completedLessonsCount}/{course.progress.totalLessons} lessons
              </span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-300 to-cyan-300 transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-gray-400/90">
                Quick Lessons
              </p>
              <span
                className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${difficultyClass(course.difficulty)}`}
              >
                {course.category}
              </span>
            </div>

            <div className="space-y-2">
              {visibleLessons.map((lesson) => (
                <button
                  key={lesson.id}
                  onClick={() => onOpenLesson(course.slug, lesson.slug)}
                  className="group flex h-11 w-full items-center gap-3 rounded-xl border border-gray-800 bg-gray-950/70 px-3 text-left transition-colors hover:border-brand-300/35 hover:bg-gray-950/90"
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-800 bg-gray-900/85 text-gray-300 group-hover:text-brand-200">
                    <Play className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-100">
                    {lesson.title}
                  </span>
                  <ChevronRight className="h-4 w-4 text-gray-500 group-hover:text-gray-300" />
                </button>
              ))}
            </div>
          </div>

          <div className="mt-auto space-y-3 pt-1">
            {course.lessons.length > visibleLessons.length ? (
              <p className="text-xs text-gray-500">
                +{course.lessons.length - visibleLessons.length} more lesson
                {course.lessons.length - visibleLessons.length === 1 ? "" : "s"}
              </p>
            ) : null}
          </div>

          <button
            onClick={() => actionSlug && onContinue(course.slug, actionSlug)}
            disabled={!actionSlug}
            className="group inline-flex h-11 w-full items-center justify-center rounded-xl border border-cyan-300/35 bg-gradient-to-r from-brand-300 via-cyan-300 to-brand-300 px-5 text-sm font-semibold text-slate-950 transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:brightness-100"
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

