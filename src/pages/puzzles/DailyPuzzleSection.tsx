import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Puzzle, Clock, Play, Award } from "lucide-react";
import { useTranslation } from "react-i18next";

export function DailyPuzzleCard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dailyPuzzlePath = "/puzzles/train/697e04834e244759b6123158";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gray-950/70 px-5 py-4 shadow-[0_22px_60px_-48px_rgba(6,182,212,0.42)]"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-brand-400/30 bg-brand-500/10 text-brand-200/90">
          <Puzzle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-brand-300/35 bg-brand-500/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-100">
              {t("Daily Challenge")}
            </span>
            <span className="inline-flex items-center gap-1 text-[12px] text-gray-400">
              <Clock className="h-3.5 w-3.5 text-brand-200/90" />
              {t("12 hours remaining")}
            </span>
          </div>
          <div className="mt-2 flex flex-col gap-1">
            <h3 className="text-base font-semibold text-white">{t("The Immortal Zugzwang")}</h3>
            <p className="text-sm text-gray-400 line-clamp-2">
              {t(
                "White to move. Can you find the subtle quiet move that leaves Black completely helpless despite their material advantage?",
              )}
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate(dailyPuzzlePath)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand-300/40 bg-brand-500/15 px-3 py-2 text-xs font-semibold text-brand-50 transition-colors hover:bg-brand-500/25"
        >
          <Play className="h-3.5 w-3.5" />
          {t("Start")}
        </button>
      </div>
    </motion.div>
  );
}

export function TrainingThemes() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
        <Award className="w-5 h-5 text-amber-500 dark:text-amber-400" />
        {t("Training Themes")}
      </h3>

      <div className="grid grid-cols-1 gap-3">
        {["Tactics", "Endgames", "Openings", "Strategy"].map((theme, i) => (
          <motion.button
            key={theme}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className="w-full p-4 rounded-xl bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-700 transition-all text-left group flex items-center justify-between shadow-sm"
          >
            <span className="font-medium text-gray-700 dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-white">
              {t(theme)}
            </span>
            <Play className="w-4 h-4 text-gray-400 dark:text-gray-600 group-hover:text-brand-500 dark:group-hover:text-brand-400 transition-colors" />
          </motion.button>
        ))}
      </div>
    </div>
  );
}

