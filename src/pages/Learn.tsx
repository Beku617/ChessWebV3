import { motion } from "framer-motion";
import {
  GraduationCap,
  BookOpen,
  Video,
  Play,
  Star,
  ChevronRight,
  BarChart,
  Target,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { courses } from "../data/mockData";

export default function Learn() {
  const { t } = useTranslation();

  const levelColor = (level: string) => {
    switch (level) {
      case "Beginner":
        return "text-green-500 dark:text-green-400 bg-green-100 dark:bg-green-900/20 border-green-300 dark:border-green-800";
      case "Intermediate":
        return "text-amber-500 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/20 border-amber-300 dark:border-amber-800";
      case "Advanced":
        return "text-red-500 dark:text-red-400 bg-red-100 dark:bg-red-900/20 border-red-300 dark:border-red-800";
      default:
        return "text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700";
    }
  };

  // Fallback if courses is undefined
  const safeCourses = courses || [];

  return (
    <div className="space-y-8">
      {/* Categories */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {["Openings", "Middlegame", "Endgame", "Strategy"].map((cat, i) => (
          <motion.button
            key={cat}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="p-6 rounded-xl bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-teal-400 dark:hover:border-teal-500/50 transition-all group text-left shadow-sm"
          >
            <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 group-hover:bg-teal-100 dark:group-hover:bg-teal-900/30 flex items-center justify-center mb-3 transition-colors">
              {cat === "Openings" && (
                <BookOpen className="w-5 h-5 text-gray-500 dark:text-gray-400 group-hover:text-teal-500 dark:group-hover:text-teal-400" />
              )}
              {cat === "Middlegame" && (
                <Target className="w-5 h-5 text-gray-500 dark:text-gray-400 group-hover:text-teal-500 dark:group-hover:text-teal-400" />
              )}
              {cat === "Endgame" && (
                <BarChart className="w-5 h-5 text-gray-500 dark:text-gray-400 group-hover:text-teal-500 dark:group-hover:text-teal-400" />
              )}
              {cat === "Strategy" && (
                <Video className="w-5 h-5 text-gray-500 dark:text-gray-400 group-hover:text-teal-500 dark:group-hover:text-teal-400" />
              )}
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
              {t(cat)}
            </h3>
            <p className="text-xs text-gray-500 mt-1">{t("12 Courses")}</p>
          </motion.button>
        ))}
      </div>

      {/* Featured Courses */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t("Featured Courses")}
          </h2>
          <button className="text-teal-600 dark:text-teal-400 hover:text-teal-500 dark:hover:text-teal-300 text-sm font-medium transition-colors">
            {t("View All")}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {safeCourses.length > 0 ? (
            safeCourses.map((course, idx) => (
              <motion.div
                key={course.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.1 }}
                className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden hover:border-gray-300 dark:hover:border-gray-700 transition-all group hover:shadow-xl shadow-sm flex flex-col"
              >
                {/* Course Image Placeholder */}
                <div className="h-32 bg-gradient-to-br from-gray-100 dark:from-gray-800 to-gray-200 dark:to-gray-900 flex items-center justify-center relative overflow-hidden">
                  <div className="absolute inset-0 bg-teal-500/5 group-hover:bg-teal-500/10 transition-colors"></div>
                  <span className="text-4xl transform group-hover:scale-110 transition-transform duration-500">
                    {course.image}
                  </span>
                  <div className="absolute top-3 right-3">
                    <span
                      className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide border ${levelColor(course.level)}`}
                    >
                      {t(course.level)}
                    </span>
                  </div>
                </div>

                <div className="p-5 flex-1 flex flex-col">
                  <div className="text-xs font-medium text-teal-600 dark:text-teal-500 mb-2 uppercase tracking-wider">
                    {t(course.category)}
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 line-clamp-2 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                    {course.title}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    {t("by")} {course.author}
                  </p>

                  <div className="mt-auto space-y-3">
                    {/* Progress Bar */}
                    <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-1.5">
                      <div
                        className="bg-teal-500 h-1.5 rounded-full transition-all duration-1000"
                        style={{ width: `${course.progress}%` }}
                      ></div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <BookOpen className="w-3 h-3" /> {course.lessons}{" "}
                        {t("Lessons")}
                      </span>
                      <span>
                        {course.progress}% {t("Complete")}
                      </span>
                    </div>

                    <button className="w-full py-2 bg-gray-100 dark:bg-gray-800 hover:bg-teal-600 hover:text-white text-gray-600 dark:text-gray-300 rounded-lg transition-all text-sm font-medium flex items-center justify-center gap-2">
                      {course.progress > 0 ? t("Continue") : t("Start Course")}
                      {course.progress === 0 && <Play className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="col-span-full text-center py-12 text-gray-500">
              {t("No courses available at the moment.")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
