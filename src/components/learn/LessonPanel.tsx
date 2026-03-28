import { CheckCircle2, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import type {
  LearnCourseProgressView,
  LearnLessonSidebarItem,
} from "../../features/learn/types";

interface LessonPanelProps {
  courseTitle: string;
  lessons: LearnLessonSidebarItem[];
  currentLessonSlug: string;
  courseProgress: LearnCourseProgressView;
  onBackToCatalog: () => void;
  onOpenLesson: (lessonSlug: string) => void;
  onPrevLesson: () => void;
  onNextLesson: () => void;
  onRetryLesson: () => void;
  hasPrevLesson: boolean;
  hasNextLesson: boolean;
  fillHeight?: boolean;
  showNavigationFooter?: boolean;
}

export function LessonPanel({
  courseTitle,
  lessons,
  currentLessonSlug,
  courseProgress,
  onBackToCatalog,
  onOpenLesson,
  onPrevLesson,
  onNextLesson,
  onRetryLesson,
  hasPrevLesson,
  hasNextLesson,
  fillHeight = true,
  showNavigationFooter = true,
}: LessonPanelProps) {
  return (
    <aside
      className={`flex flex-col min-h-0 bg-slate-950/90 border border-slate-800 rounded-2xl overflow-hidden ${
        fillHeight ? "h-full" : ""
      }`}
    >
      <div className="px-3.5 pt-3 pb-2.5 border-b border-slate-800 bg-[radial-gradient(circle_at_top_right,rgba(20,184,166,0.15),rgba(2,6,23,0.95)_50%)]">
        <button
          onClick={onBackToCatalog}
          className="inline-flex items-center gap-1 text-[11px] text-teal-300 hover:text-teal-200 transition-colors"
        >
          <ChevronLeft className="w-3 h-3" />
          Back to Learn
        </button>
        <p className="mt-1.5 text-[10px] uppercase tracking-[0.14em] text-teal-300/80">
          {courseTitle}
        </p>
      </div>

      <div className="px-3.5 py-2.5 border-b border-slate-800">
        <div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
            <span>Course progress</span>
            <span>{courseProgress.percentComplete}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-teal-400 to-emerald-300"
              style={{ width: `${courseProgress.percentComplete}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-slate-500">
            {courseProgress.completedLessonsCount}/{courseProgress.totalLessons} lessons completed
          </p>
        </div>
      </div>

      <div className="px-3.5 py-2.5 border-b border-slate-800 min-h-0 flex flex-col">
        <p className="text-xs font-medium text-slate-300 mb-2">Course Lessons</p>
        <div className="space-y-1 min-h-0 flex-1 overflow-y-auto pr-1">
          {lessons.map((lesson, index) => {
            const active = lesson.slug === currentLessonSlug;
            return (
              <button
                key={lesson.id}
                onClick={() => onOpenLesson(lesson.slug)}
                className={`w-full rounded-lg px-2.5 py-1.5 border text-left transition-colors ${
                  active
                    ? "border-teal-400/35 bg-teal-500/10"
                    : "border-slate-800 bg-slate-900/80 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                      lesson.isCompleted
                        ? "bg-emerald-500/20 text-emerald-300"
                        : active
                          ? "bg-teal-500/30 text-teal-200"
                          : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {lesson.isCompleted ? <CheckCircle2 className="w-3.5 h-3.5" /> : index + 1}
                  </span>
                  <span
                    className={`text-xs truncate ${active ? "text-slate-100" : "text-slate-300"}`}
                  >
                    {lesson.title}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {showNavigationFooter && (
        <div className="mt-auto p-2.5 grid grid-cols-2 gap-2 border-t border-slate-800">
          <button
            onClick={onPrevLesson}
            disabled={!hasPrevLesson}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs bg-slate-900 border border-slate-700 text-slate-300 hover:border-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Previous
          </button>
          {hasNextLesson ? (
            <button
              onClick={onNextLesson}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs bg-teal-500/20 border border-teal-400/35 text-teal-200 hover:bg-teal-500/30"
            >
              <ChevronRight className="w-3.5 h-3.5" />
              Next Lesson
            </button>
          ) : (
            <button
              onClick={onRetryLesson}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs bg-slate-900 border border-slate-700 text-slate-300 hover:border-slate-600"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry Lesson
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
