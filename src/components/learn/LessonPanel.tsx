import {
  ChevronLeft,
  ChevronRight,
  BookOpen,
  CheckCircle2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { LearnCourse, LearnLesson } from "../../data/learnCourses";

interface LessonPanelProps {
  course: LearnCourse;
  currentLesson: LearnLesson;
}

export function LessonPanel({ course, currentLesson }: LessonPanelProps) {
  const navigate = useNavigate();

  const currentIndex = course.lessons.findIndex(
    (l) => l.slug === currentLesson.slug,
  );
  const totalLessons = course.lessons.length;
  const completedLessons = currentIndex;
  const remainingLessons = totalLessons - currentIndex - 1;
  const progressPercent = Math.round(
    ((currentIndex + 1) / totalLessons) * 100,
  );

  const prevLesson =
    currentIndex > 0 ? course.lessons[currentIndex - 1] : null;
  const nextLesson =
    currentIndex < totalLessons - 1 ? course.lessons[currentIndex + 1] : null;

  function goToLesson(lessonSlug: string) {
    navigate(`/learn/${course.slug}/${lessonSlug}`);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Course Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => navigate("/learn")}
          className="text-[11px] text-teal-600 dark:text-teal-400 hover:text-teal-500 dark:hover:text-teal-300 mb-1.5 flex items-center gap-0.5 transition-colors"
        >
          <ChevronLeft className="w-3 h-3" />
          Back to Courses
        </button>
        <h2 className="text-base font-bold text-gray-900 dark:text-white leading-tight">
          {course.title}
        </h2>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
          by {course.author}
        </p>
      </div>

      {/* Progress */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-gray-600 dark:text-gray-300 font-medium">
            Lesson {currentIndex + 1} of {totalLessons}
          </span>
          <span className="text-teal-600 dark:text-teal-400 font-semibold">
            {progressPercent}%
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-1.5">
          <div
            className="bg-teal-500 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-gray-500 mt-1.5">
          <span>{completedLessons} completed</span>
          <span>{remainingLessons} remaining</span>
        </div>
      </div>

      {/* Current Lesson Info */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
          {currentLesson.title}
        </h3>
        {currentLesson.subtitle && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            {currentLesson.subtitle}
          </p>
        )}
        <p className="text-xs text-gray-600 dark:text-gray-300 mt-2 leading-relaxed">
          {currentLesson.content}
        </p>
      </div>

      {/* Lesson List */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <div className="space-y-0.5">
          {course.lessons.map((lesson, idx) => {
            const isCurrent = lesson.slug === currentLesson.slug;
            const isCompleted = idx < currentIndex;

            return (
              <button
                key={lesson.slug}
                onClick={() => goToLesson(lesson.slug)}
                className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center gap-2.5 transition-all ${
                  isCurrent
                    ? "bg-teal-500/10 border border-teal-500/30 text-teal-600 dark:text-teal-400"
                    : "hover:bg-gray-100 dark:hover:bg-gray-800/60 text-gray-600 dark:text-gray-400 border border-transparent"
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                    isCurrent
                      ? "bg-teal-500 text-white"
                      : isCompleted
                        ? "bg-teal-500/20 text-teal-500"
                        : "bg-gray-200 dark:bg-gray-800 text-gray-500"
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="w-3 h-3" />
                  ) : (
                    idx + 1
                  )}
                </span>
                <span className="truncate">{lesson.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Navigation */}
      <div className="px-3 py-3 border-t border-gray-200 dark:border-gray-800 flex gap-2">
        {prevLesson ? (
          <button
            onClick={() => goToLesson(prevLesson.slug)}
            className="flex-1 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg transition-all text-xs font-medium flex items-center justify-center gap-1"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Previous
          </button>
        ) : (
          <div className="flex-1" />
        )}

        {nextLesson ? (
          <button
            onClick={() => goToLesson(nextLesson.slug)}
            className="flex-1 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-all text-xs font-medium flex items-center justify-center gap-1"
          >
            Next Lesson
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            onClick={() => navigate("/learn")}
            className="flex-1 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-all text-xs font-medium flex items-center justify-center gap-1"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Back to Courses
          </button>
        )}
      </div>
    </div>
  );
}
