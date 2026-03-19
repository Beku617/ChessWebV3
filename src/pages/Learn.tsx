import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  Play,
  Search,
  Flame,
  Eye,
  CheckCircle2,
  ChevronRight,
  SlidersHorizontal,
  Target,
  BarChart,
  Video,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { learnCourses, type LearnCourse } from "../data/learnCourses";

const CATEGORIES = ["All", "Openings", "Middlegame", "Endgame", "Strategy"] as const;
type Category = (typeof CATEGORIES)[number];

const DIFFICULTIES = ["All", "Beginner", "Intermediate", "Advanced"] as const;
type Difficulty = (typeof DIFFICULTIES)[number];

const PROGRESS_FILTERS = ["All", "Not Started", "In Progress", "Completed"] as const;
type ProgressFilter = (typeof PROGRESS_FILTERS)[number];

const SORT_OPTIONS = ["Default", "Title A-Z", "Most Lessons", "Most Progress"] as const;
type SortOption = (typeof SORT_OPTIONS)[number];

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Openings: <BookOpen className="w-4 h-4" />,
  Middlegame: <Target className="w-4 h-4" />,
  Endgame: <BarChart className="w-4 h-4" />,
  Strategy: <Video className="w-4 h-4" />,
};

function getCourseProgress(c: LearnCourse): number {
  // Simulated progress from the old mockData — in future this comes from user state
  const progressMap: Record<string, number> = {
    RuyLopezOpening: 45,
    PawnStructures101: 10,
    RookEndgames: 0,
    AttackingTheKing: 80,
  };
  return progressMap[c.slug] ?? 0;
}

function getProgressStatus(progress: number): "Not Started" | "In Progress" | "Completed" {
  if (progress === 0) return "Not Started";
  if (progress >= 100) return "Completed";
  return "In Progress";
}

// Simulated stats — in future these come from user state
const LEARN_STATS = {
  watchedLessons: 7,
  completedCourses: 0,
  dayStreak: 3,
};

export default function Learn() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [activeCategory, setActiveCategory] = useState<Category>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("All");
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>("All");
  const [sortBy, setSortBy] = useState<SortOption>("Default");
  const [showFilters, setShowFilters] = useState(false);

  const filteredCourses = useMemo(() => {
    let result = learnCourses;

    // Category
    if (activeCategory !== "All") {
      result = result.filter((c) => c.category === activeCategory);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.author.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.lessons.some((l) => l.title.toLowerCase().includes(q)),
      );
    }

    // Difficulty
    if (difficulty !== "All") {
      result = result.filter((c) => c.level === difficulty);
    }

    // Progress
    if (progressFilter !== "All") {
      result = result.filter(
        (c) => getProgressStatus(getCourseProgress(c)) === progressFilter,
      );
    }

    // Sort
    const sorted = [...result];
    switch (sortBy) {
      case "Title A-Z":
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "Most Lessons":
        sorted.sort((a, b) => b.lessons.length - a.lessons.length);
        break;
      case "Most Progress":
        sorted.sort((a, b) => getCourseProgress(b) - getCourseProgress(a));
        break;
    }

    return sorted;
  }, [activeCategory, searchQuery, difficulty, progressFilter, sortBy]);

  const totalLessons = learnCourses.reduce((s, c) => s + c.lessons.length, 0);

  const levelColor = (level: string) => {
    switch (level) {
      case "Beginner":
        return "text-green-400 bg-green-500/10 border-green-500/20";
      case "Intermediate":
        return "text-amber-400 bg-amber-500/10 border-amber-500/20";
      case "Advanced":
        return "text-red-400 bg-red-500/10 border-red-500/20";
      default:
        return "text-gray-400 bg-gray-500/10 border-gray-500/20";
    }
  };

  return (
    <div className="space-y-6">
      {/* ===== Stats Row ===== */}
      <div className="grid grid-cols-3 gap-4">
        <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800">
          <div className="w-10 h-10 rounded-lg bg-teal-500/10 flex items-center justify-center">
            <Eye className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{LEARN_STATS.watchedLessons}</p>
            <p className="text-xs text-gray-500">{t("Lessons Watched")}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800">
          <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
            <Flame className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{LEARN_STATS.dayStreak}</p>
            <p className="text-xs text-gray-500">{t("Day Streak")}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800">
          <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              {LEARN_STATS.watchedLessons}/{totalLessons}
            </p>
            <p className="text-xs text-gray-500">{t("Total Progress")}</p>
          </div>
        </div>
      </div>

      {/* ===== Search + Filter Toggle ===== */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("Search courses and lessons...")}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20 transition-all"
          />
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`px-4 py-2.5 rounded-xl border text-sm font-medium flex items-center gap-2 transition-all ${
            showFilters
              ? "bg-teal-500/10 border-teal-500/30 text-teal-400"
              : "bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-700"
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          {t("Filters")}
        </button>
      </div>

      {/* ===== Filters Row ===== */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-center gap-3 pb-2">
              {/* Difficulty */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-medium">{t("Difficulty")}:</span>
                <div className="flex gap-1">
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d}
                      onClick={() => setDifficulty(d)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                        difficulty === d
                          ? "bg-teal-500/15 text-teal-400 border border-teal-500/30"
                          : "bg-white dark:bg-gray-900/40 text-gray-500 border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
                      }`}
                    >
                      {t(d)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Progress */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-medium">{t("Status")}:</span>
                <div className="flex gap-1">
                  {PROGRESS_FILTERS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setProgressFilter(p)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                        progressFilter === p
                          ? "bg-teal-500/15 text-teal-400 border border-teal-500/30"
                          : "bg-white dark:bg-gray-900/40 text-gray-500 border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
                      }`}
                    >
                      {t(p)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sort */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-medium">{t("Sort")}:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="px-3 py-1 rounded-lg text-xs font-medium bg-white dark:bg-gray-900/40 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-800 focus:outline-none focus:border-teal-500/50"
                >
                  {SORT_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {t(s)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== Category Tabs ===== */}
      <div className="flex gap-2">
        {CATEGORIES.map((cat) => {
          const isActive = activeCategory === cat;
          const count =
            cat === "All"
              ? learnCourses.length
              : learnCourses.filter((c) => c.category === cat).length;

          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? "bg-teal-500/15 text-teal-400 border border-teal-500/30"
                  : "bg-white dark:bg-gray-900/50 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:text-gray-900 dark:hover:text-gray-200"
              }`}
            >
              {cat !== "All" && CATEGORY_ICONS[cat]}
              {t(cat)}
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                  isActive
                    ? "bg-teal-500/20 text-teal-300"
                    : "bg-gray-200 dark:bg-gray-800 text-gray-500"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ===== Course Grid ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        <AnimatePresence mode="popLayout">
          {filteredCourses.length > 0 ? (
            filteredCourses.map((course) => {
              const progress = getCourseProgress(course);
              const firstLessonPath = `/learn/${course.slug}/${course.lessons[0]?.slug ?? "Lesson1"}`;

              return (
                <motion.div
                  key={course.slug}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden hover:border-gray-300 dark:hover:border-gray-700 transition-all group hover:shadow-lg shadow-sm flex flex-col"
                >
                  {/* Top Band */}
                  <div className="h-28 bg-gradient-to-br from-gray-100 dark:from-gray-800/60 to-gray-50 dark:to-gray-900 flex items-center justify-center relative">
                    <span className="text-4xl group-hover:scale-110 transition-transform duration-300">
                      {course.image}
                    </span>
                    <div className="absolute top-3 right-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${levelColor(course.level)}`}
                      >
                        {t(course.level)}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 flex-1 flex flex-col">
                    <div className="text-[10px] font-semibold text-teal-500 mb-1 uppercase tracking-widest">
                      {t(course.category)}
                    </div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 leading-snug group-hover:text-teal-500 dark:group-hover:text-teal-400 transition-colors">
                      {course.title}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      {t("by")} {course.author}
                    </p>

                    <div className="mt-auto space-y-2.5">
                      {/* Progress */}
                      <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-1">
                        <div
                          className="bg-teal-500 h-1 rounded-full transition-all duration-700"
                          style={{ width: `${progress}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-gray-500">
                        <span className="flex items-center gap-1">
                          <BookOpen className="w-3 h-3" />
                          {course.lessons.length} {t("Lessons")}
                        </span>
                        <span>{progress}% {t("Complete")}</span>
                      </div>

                      <button
                        onClick={() => navigate(firstLessonPath)}
                        className="w-full py-2 bg-gray-100 dark:bg-gray-800 hover:bg-teal-600 hover:text-white text-gray-600 dark:text-gray-300 rounded-lg transition-all text-xs font-medium flex items-center justify-center gap-1.5"
                      >
                        {progress > 0 ? t("Continue") : t("Start Course")}
                        {progress === 0 ? (
                          <Play className="w-3 h-3" />
                        ) : (
                          <ChevronRight className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="col-span-full flex flex-col items-center justify-center py-16 text-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                <Search className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                {t("No courses match your filters.")}
              </p>
              <button
                onClick={() => {
                  setSearchQuery("");
                  setDifficulty("All");
                  setProgressFilter("All");
                  setActiveCategory("All");
                  setSortBy("Default");
                }}
                className="mt-3 text-teal-500 hover:text-teal-400 text-xs font-medium transition-colors"
              >
                {t("Clear all filters")}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
