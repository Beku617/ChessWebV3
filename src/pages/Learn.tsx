import { useEffect, useMemo, useState } from "react";
import { Flame, GraduationCap, Search, Sparkles, Target } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { LearnCourseCard } from "../components/learn/LearnCourseCard";
import { fetchLearnCatalog } from "../features/learn/api";
import type {
  LearnCatalogCourse,
  LearnCategory,
  LearnSummary,
} from "../features/learn/types";

const CATEGORY_TABS: LearnCategory[] = [
  "Openings",
  "Middlegame",
  "Endgame",
  "Strategy",
];

type DifficultyFilter = "all" | "Beginner" | "Intermediate" | "Advanced";
type ProgressFilter = "all" | "not_started" | "in_progress" | "completed";

const EMPTY_SUMMARY: LearnSummary = {
  watchedLessons: 0,
  completedLessons: 0,
  dayStreak: 0,
  inProgressCourses: 0,
  completedCourses: 0,
};

export default function Learn() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<LearnCatalogCourse[]>([]);
  const [summary, setSummary] = useState<LearnSummary>(EMPTY_SUMMARY);
  const [activeCategory, setActiveCategory] = useState<LearnCategory>("Openings");
  const [searchQuery, setSearchQuery] = useState("");
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("all");
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        setError("");
        const data = await fetchLearnCatalog({
          q: searchQuery,
          category: activeCategory,
          difficulty: difficulty === "all" ? "" : difficulty,
          progress: progressFilter === "all" ? "" : progressFilter,
        });
        if (cancelled) return;
        setCourses(data.courses || []);
        setSummary(data.summary || EMPTY_SUMMARY);
      } catch (err) {
        if (cancelled) return;
        setCourses([]);
        setSummary(EMPTY_SUMMARY);
        setError(
          err instanceof Error ? err.message : "Failed to load learn catalog.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeCategory, difficulty, progressFilter, searchQuery]);

  const courseCountLabel = useMemo(() => {
    if (loading) return "Loading courses...";
    if (courses.length === 1) return "1 course";
    return `${courses.length} courses`;
  }, [courses.length, loading]);

  const openLesson = (courseSlug: string, lessonSlug: string) => {
    navigate(`/learn/${courseSlug}/${lessonSlug}`);
  };

  return (
    <div className="space-y-6 pb-4">
      <section className="rounded-2xl border border-slate-800/80 bg-[radial-gradient(circle_at_top_right,rgba(45,212,191,0.13),rgba(2,6,23,0.98)_52%)] shadow-[0_10px_32px_rgba(2,6,23,0.45)] p-5 sm:p-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/65 px-3 py-2.5 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 text-cyan-300 flex items-center justify-center">
              <Target className="w-4 h-4" />
            </div>
            <div>
              <p className="text-base font-semibold text-slate-100">{summary.watchedLessons}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-[0.12em]">
                Watched Lessons
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800/80 bg-slate-950/65 px-3 py-2.5 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-300 flex items-center justify-center">
              <GraduationCap className="w-4 h-4" />
            </div>
            <div>
              <p className="text-base font-semibold text-slate-100">{summary.completedLessons}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-[0.12em]">
                Completed Lessons
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800/80 bg-slate-950/65 px-3 py-2.5 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500/15 text-teal-300 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <p className="text-base font-semibold text-slate-100">{summary.inProgressCourses}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-[0.12em]">
                In Progress
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800/80 bg-slate-950/65 px-3 py-2.5 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-500/15 text-orange-300 flex items-center justify-center">
              <Flame className="w-4 h-4" />
            </div>
            <div>
              <p className="text-base font-semibold text-slate-100">{summary.dayStreak}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-[0.12em]">
                Day Streak
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800/80 bg-slate-950/80 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <label className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by course, lesson, or tags..."
              className="h-11 w-full pl-10 pr-3 rounded-xl bg-slate-900/85 border border-slate-800 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-teal-400/40"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:w-[390px]">
            <select
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value as DifficultyFilter)}
              className="h-11 w-full px-3 rounded-xl bg-slate-900/85 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-teal-400/40"
            >
              <option value="all">All Difficulty</option>
              <option value="Beginner">Beginner</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced">Advanced</option>
            </select>

            <select
              value={progressFilter}
              onChange={(event) =>
                setProgressFilter(event.target.value as ProgressFilter)
              }
              className="h-11 w-full px-3 rounded-xl bg-slate-900/85 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-teal-400/40"
            >
              <option value="all">All Progress</option>
              <option value="not_started">Not Started</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {CATEGORY_TABS.map((category) => {
            const active = activeCategory === category;
            return (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`h-10 rounded-xl px-3 text-sm border transition-colors ${
                  active
                    ? "bg-teal-400 border-teal-200 text-slate-950 shadow-[0_8px_18px_rgba(45,212,191,0.22)]"
                    : "bg-slate-900/85 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                }`}
              >
                {category}
              </button>
            );
          })}
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 text-rose-200 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/80 px-4 py-14 text-center text-slate-400">
          Loading learn catalog...
        </div>
      ) : courses.length === 0 ? (
        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/80 px-4 py-14 text-center">
          <p className="text-slate-300">No courses matched your filters.</p>
          <button
            onClick={() => {
              setSearchQuery("");
              setDifficulty("all");
              setProgressFilter("all");
            }}
            className="mt-3 text-sm text-teal-300 hover:text-teal-200"
          >
            Clear search and filters
          </button>
        </div>
      ) : (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-semibold text-slate-100">
              Course Catalog
            </h2>
            <p className="text-xs uppercase tracking-[0.12em] text-slate-500">
              {courseCountLabel}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-5">
            {courses.map((course) => (
              <LearnCourseCard
                key={course.id}
                course={course}
                onContinue={openLesson}
                onOpenLesson={openLesson}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
