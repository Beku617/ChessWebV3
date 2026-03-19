import {
  BookOpen,
  ChevronRight,
  Clock3,
  GraduationCap,
  RotateCcw,
  Sparkles,
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
    return "bg-emerald-500/15 text-emerald-300 border-emerald-400/30";
  }
  if (value === "Advanced") {
    return "bg-rose-500/15 text-rose-300 border-rose-400/30";
  }
  return "bg-amber-500/15 text-amber-300 border-amber-400/30";
}

export function LearnCourseCard({
  course,
  onContinue,
  onOpenLesson,
}: LearnCourseCardProps) {
  const continueSlug = course.progress.continueLessonSlug || course.lessons[0]?.slug;
  const retrySlug = course.lessons[0]?.slug || continueSlug;
  const actionSlug =
    course.progress.status === "completed" ? retrySlug : continueSlug;
  const courseIcon = course.icon || "♟";
  const isStarted = course.progress.status !== "not_started";
  const isCompleted = course.progress.status === "completed";
  const visibleLessons = course.lessons.slice(0, 2);

  return (
    <article className="flex h-full flex-col rounded-2xl border border-slate-800/80 bg-slate-950/85 shadow-[0_10px_30px_rgba(2,6,23,0.42)]">
      <div className="px-5 py-4 border-b border-slate-800/80 bg-[radial-gradient(circle_at_top_right,rgba(45,212,191,0.12),rgba(15,23,42,0.96)_58%)]">
        <div className="flex items-start justify-between gap-3">
          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-teal-300/90">
            <Sparkles className="w-3 h-3" />
            <span>{course.category}</span>
          </div>
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-900/85 text-lg">
            {courseIcon}
          </div>
        </div>
        <h3 className="mt-2 text-lg font-semibold text-slate-50 leading-tight">
          {course.title}
        </h3>
      </div>

      <div className="flex flex-1 flex-col px-5 py-4 gap-4">
        <div className="flex items-center gap-2 text-xs text-slate-300/85">
          <UserRound className="w-3.5 h-3.5 text-slate-400" />
          <span>{course.instructorName || "NeonGambit Instructor"}</span>
          <span
            className={`ml-auto px-2 py-0.5 rounded-full border text-[10px] font-medium ${difficultyClass(course.difficulty)}`}
          >
            {course.difficulty}
          </span>
        </div>

        <div className="rounded-xl border border-slate-800/75 bg-slate-900/55 p-3">
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
            <span>
              {course.progress.completedLessonsCount}/{course.progress.totalLessons} lessons
            </span>
            <span>{course.progress.percentComplete}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-teal-400 to-emerald-300 transition-all duration-500"
              style={{ width: `${course.progress.percentComplete}%` }}
            />
          </div>
        </div>

        {visibleLessons.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
              Quick Lessons
            </p>
            <div className="space-y-1.5">
              {visibleLessons.map((lesson) => (
                <button
                  key={lesson.id}
                  onClick={() => onOpenLesson(course.slug, lesson.slug)}
                  className="w-full h-10 flex items-center gap-2 rounded-lg px-3 text-left bg-slate-900/70 border border-slate-800/80 hover:border-slate-700 hover:bg-slate-900 transition-colors"
                >
                  <Clock3 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="text-xs text-slate-300 truncate flex-1">
                    {lesson.title}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                </button>
              ))}
            </div>
            {course.lessons.length > visibleLessons.length && (
              <p className="text-xs text-slate-500">
                +{course.lessons.length - visibleLessons.length} more lesson
                {course.lessons.length - visibleLessons.length === 1 ? "" : "s"}
              </p>
            )}
          </div>
        )}

        <div className="mt-auto">
          <button
            onClick={() => actionSlug && onContinue(course.slug, actionSlug)}
            disabled={!actionSlug}
            className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium bg-teal-500/20 text-teal-200 border border-teal-400/35 hover:bg-teal-500/30 transition-colors disabled:opacity-50"
          >
            {isCompleted ? (
              <RotateCcw className="w-4 h-4" />
            ) : isStarted ? (
              <BookOpen className="w-4 h-4" />
            ) : (
              <GraduationCap className="w-4 h-4" />
            )}
            {isCompleted
              ? "Retry Course"
              : isStarted
                ? "Continue Lesson"
                : "Start Course"}
          </button>
        </div>
      </div>
    </article>
  );
}
