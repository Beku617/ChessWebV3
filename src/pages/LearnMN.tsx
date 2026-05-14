import { useEffect, useState } from "react";
import {
  ChevronDown,
  Search,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LearnCourseCard } from "../components/learn/LearnCourseCard";
import { fetchLearnCatalog } from "../features/learnMn/api";
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

const EMPTY_CATEGORY_COUNTS: Record<LearnCategory, number> = {
  Openings: 0,
  Middlegame: 0,
  Endgame: 0,
  Strategy: 0,
};

type DifficultyFilter = "all" | "Beginner" | "Intermediate" | "Advanced";
type ProgressFilter = "all" | "not_started" | "in_progress" | "completed";

const EMPTY_SUMMARY: LearnSummary = {
  watchedLessons: 0,
  completedLessons: 0,
  dayStreak: 0,
  inProgressCourses: 0,
  completedCourses: 0,
};

interface StatTileProps {
  label: string;
  value: number;
}

function StatTile({ label, value }: StatTileProps) {
  return (
    <article className="rounded-2xl border border-gray-800 bg-gray-900/70 px-4 py-4 sm:px-5 sm:py-4 shadow-[0_14px_32px_-26px_rgba(15,23,42,0.9)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400/70">
            {label}
          </p>
          <p className="mt-2 text-4xl leading-none font-semibold font-sans text-slate-100">
            {value}
          </p>
        </div>
      </div>
    </article>
  );
}

function categoryLabel(
  category: LearnCategory,
  t: (key: string, defaultValue?: string) => string,
) {
  if (category === "Openings") return t("learn.categories.openings", "Openings");
  if (category === "Middlegame") {
    return t("learn.categories.middlegame", "Middlegame");
  }
  if (category === "Endgame") return t("learn.categories.endgame", "Endgame");
  return t("learn.categories.strategy", "Strategy");
}

export default function Learn() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const translateDefault = (key: string, defaultValue?: string) =>
    String(defaultValue === undefined ? t(key) : t(key, defaultValue));
  const loadFailedMessage = t(
    "learn.loadFailed",
    "Failed to load learn catalog.",
  );
  const [courses, setCourses] = useState<LearnCatalogCourse[]>([]);
  const [summary, setSummary] = useState<LearnSummary>(EMPTY_SUMMARY);
  const [categoryCounts, setCategoryCounts] = useState<
    Record<LearnCategory, number>
  >(EMPTY_CATEGORY_COUNTS);
  const [activeCategory, setActiveCategory] = useState<LearnCategory>("Openings");
  const [searchQuery, setSearchQuery] = useState("");
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("all");
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(() => {
      async function loadCatalog() {
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
            err instanceof Error
              ? err.message
              : loadFailedMessage,
          );
        } finally {
          if (!cancelled) setLoading(false);
        }
      }

      void loadCatalog();
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    activeCategory,
    difficulty,
    loadFailedMessage,
    progressFilter,
    searchQuery,
  ]);

  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(() => {
      async function loadCategoryCounts() {
        try {
          const data = await fetchLearnCatalog({
            q: searchQuery,
            difficulty: difficulty === "all" ? "" : difficulty,
            progress: progressFilter === "all" ? "" : progressFilter,
          });
          if (cancelled) return;

          const nextCounts: Record<LearnCategory, number> = { ...EMPTY_CATEGORY_COUNTS };
          data.courses.forEach((course) => {
            nextCounts[course.category] += 1;
          });
          setCategoryCounts(nextCounts);
        } catch {
          if (!cancelled) {
            setCategoryCounts(EMPTY_CATEGORY_COUNTS);
          }
        }
      }

      void loadCategoryCounts();
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [difficulty, progressFilter, searchQuery]);

  const openLesson = (courseSlug: string, lessonSlug: string) => {
    navigate(`/learn/${courseSlug}/${lessonSlug}`);
  };

  return (
    <div className="space-y-6 lg:space-y-7">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile
          label={t("learn.stats.completed", "Completed")}
          value={summary.completedCourses}
        />
        <StatTile
          label={t("learn.stats.inProgress", "In Progress")}
          value={summary.inProgressCourses}
        />
        <StatTile
          label={t("learn.stats.dayStreak", "Day Streak")}
          value={summary.dayStreak}
        />
      </section>

      <section className="space-y-4 rounded-2xl border border-gray-800 bg-gray-900/70 px-4 py-4 shadow-[0_24px_48px_-46px_rgba(8,145,178,0.45)] sm:px-5 sm:py-5">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_220px_220px]">
          <label className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t(
                "learn.searchPlaceholder",
                "Search courses, openings, or grandmasters...",
              )}
              className="h-11 w-full rounded-xl border border-gray-800 bg-gray-950/70 pl-12 pr-4 text-base text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-brand-300/50"
            />
          </label>

          <div className="relative">
            <select
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value as DifficultyFilter)}
              className="h-11 w-full appearance-none rounded-xl border border-gray-800 bg-gray-950/70 px-4 pr-10 text-sm text-gray-100 focus:outline-none focus:border-brand-300/50"
            >
              <option value="all">{t("learn.difficulty.all", "All Difficulty")}</option>
              <option value="Beginner">
                {t("learn.difficulty.beginner", "Beginner")}
              </option>
              <option value="Intermediate">
                {t("learn.difficulty.intermediate", "Intermediate")}
              </option>
              <option value="Advanced">
                {t("learn.difficulty.advanced", "Advanced")}
              </option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          </div>

          <div className="relative">
            <select
              value={progressFilter}
              onChange={(event) =>
                setProgressFilter(event.target.value as ProgressFilter)
              }
              className="h-11 w-full appearance-none rounded-xl border border-gray-800 bg-gray-950/70 px-4 pr-10 text-sm text-gray-100 focus:outline-none focus:border-brand-300/50"
            >
              <option value="all">{t("learn.progress.all", "All Progress")}</option>
              <option value="not_started">
                {t("learn.progress.notStarted", "Not Started")}
              </option>
              <option value="in_progress">
                {t("learn.progress.inProgress", "In Progress")}
              </option>
              <option value="completed">
                {t("learn.progress.completed", "Completed")}
              </option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {CATEGORY_TABS.map((category) => {
            const active = activeCategory === category;
            const categoryCount = categoryCounts[category] ?? 0;
            return (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`min-w-[132px] h-11 rounded-full px-5 text-sm font-medium border transition-all ${
                  active
                    ? "border-brand-400/50 bg-brand-500/15 text-brand-100 shadow-[0_10px_18px_-16px_rgba(20,184,166,0.9)]"
                    : "border-gray-800 bg-gray-900/70 text-gray-200 hover:border-brand-300/40 hover:text-brand-100"
                }`}
              >
                <span>{categoryLabel(category, translateDefault)}</span>
                <span className="ml-1.5 text-xs opacity-80">({categoryCount})</span>
              </button>
            );
          })}
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-gray-800 bg-gray-900/70 px-4 py-16 text-center text-gray-400">
          {t("learn.loading", "Loading learn catalog...")}
        </div>
      ) : courses.length === 0 ? (
        <div className="rounded-2xl border border-gray-800 bg-gray-900/70 px-4 py-16 text-center">
          <p className="text-gray-300">
            {t("learn.empty", "No courses matched your filters.")}
          </p>
          <button
            onClick={() => {
              setSearchQuery("");
              setDifficulty("all");
              setProgressFilter("all");
            }}
            className="mt-4 inline-flex h-11 items-center rounded-xl border border-brand-400/35 bg-brand-500/12 px-5 text-sm text-brand-100 hover:bg-brand-500/20"
          >
            {t("learn.clearFilters", "Clear search and filters")}
          </button>
        </div>
      ) : (
        <section className="space-y-6">
          <div className="space-y-6">
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


