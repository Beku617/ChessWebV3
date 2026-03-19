import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState, useRef } from "react";
import { Chessboard } from "react-chessboard";
import { BookOpen } from "lucide-react";
import { findCourseBySlug, findLessonBySlug } from "../data/learnCourses";
import { LessonPanel } from "../components/learn/LessonPanel";

const PANEL_WIDTH = 340;
const GAP = 24;
const SIDEBAR_WIDTH = 288;

export default function LearnLesson() {
  const { courseSlug, lessonSlug } = useParams<{
    courseSlug: string;
    lessonSlug: string;
  }>();
  const navigate = useNavigate();
  const boardContainerRef = useRef<HTMLDivElement>(null);

  const course = courseSlug ? findCourseBySlug(courseSlug) : undefined;
  const lesson =
    course && lessonSlug ? findLessonBySlug(course, lessonSlug) : undefined;

  /* ---- responsive board sizing ---- */
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 1280,
    height: typeof window !== "undefined" ? window.innerHeight : 800,
  }));

  useEffect(() => {
    const onResize = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const boardWidth = useMemo(() => {
    // Available width = viewport - sidebar - panel - gap - page padding (32px each side)
    const availW = viewport.width - SIDEBAR_WIDTH - PANEL_WIDTH - GAP - 64;
    // Available height = viewport - top/bottom padding (64px total)
    const availH = viewport.height - 96;
    // Board should be the largest square that fits both constraints
    return Math.max(360, Math.min(720, availW - 32, availH - 32));
  }, [viewport]);

  /* ---- invalid route fallback ---- */
  if (!course || !lesson) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
          <BookOpen className="w-8 h-8 text-gray-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          Lesson Not Found
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md">
          The lesson you&apos;re looking for doesn&apos;t exist or may have been
          moved.
        </p>
        <button
          onClick={() => navigate("/learn")}
          className="px-6 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-all text-sm font-medium"
        >
          Back to Learn
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex gap-6 -mx-4 sm:-mx-6 lg:-mx-8 -my-8 px-4 sm:px-6 lg:px-8 py-4"
      style={{ height: "calc(100vh - 0px)" }}
    >
      {/* Board Area */}
      <div ref={boardContainerRef} className="flex-1 flex items-center justify-center min-w-0">
        <div className="rounded-xl overflow-hidden shadow-lg">
          <Chessboard
            id="learn-lesson-board"
            position={lesson.fen}
            boardOrientation="white"
            animationDuration={300}
            boardWidth={boardWidth}
            arePiecesDraggable={false}
            customBoardStyle={{
              borderRadius: "8px",
            }}
          />
        </div>
      </div>

      {/* Lesson Panel */}
      <div
        className="flex-shrink-0 bg-white dark:bg-gray-900/90 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"
        style={{ width: PANEL_WIDTH }}
      >
        <LessonPanel course={course} currentLesson={lesson} />
      </div>
    </div>
  );
}
