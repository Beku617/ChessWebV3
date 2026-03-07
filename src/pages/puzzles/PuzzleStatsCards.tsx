import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { Target, Brain, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PuzzleUserStats } from "./types";

interface PuzzleStatsCardsProps {
  stats: PuzzleUserStats | null;
  loading?: boolean;
}

export function PuzzleStatsCards({ stats, loading = false }: PuzzleStatsCardsProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div
            key={idx}
            className="h-[92px] rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 animate-pulse"
          />
        ))}
      </div>
    );
  }

  const rating = stats?.rating ?? 1200;
  const bestRating = stats?.bestRating ?? rating;
  const solvedToday = stats?.solvedToday ?? 0;
  const solved = stats?.solved ?? 0;
  const attempts = stats?.attempts ?? 0;
  const streak = stats?.streak ?? 0;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatCard
        delay={0.1}
        label={t("Puzzle Rating")}
        value={rating.toLocaleString()}
        helper={`${t("Best:")} ${bestRating.toLocaleString()}`}
        icon={<Target className="h-4 w-4" />}
        accent="border-teal-400/30 bg-teal-500/12 text-teal-200"
      />

      <StatCard
        delay={0.2}
        label={t("Solved Today")}
        value={solvedToday.toLocaleString()}
        helper={`${solved}/${attempts} ${t("solved overall")}`}
        icon={<Brain className="h-4 w-4" />}
        accent="border-cyan-400/35 bg-cyan-500/12 text-cyan-200"
      />

      <StatCard
        delay={0.3}
        label={t("Streak")}
        value={`${streak} ${streak === 1 ? t("Day") : t("Days")}`}
        helper={t("Consecutive solve days")}
        icon={<Zap className="h-4 w-4" />}
        accent="border-amber-400/30 bg-amber-500/10 text-amber-200"
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  helper,
  icon,
  accent,
  delay,
}: {
  label: string;
  value: string;
  helper: string;
  icon: ReactNode;
  accent: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900/70 px-4 py-3 shadow-[0_14px_32px_-26px_rgba(15,23,42,0.9)]"
    >
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.16em] text-gray-400">{label}</p>
        <p className="mt-1 text-lg font-semibold leading-tight text-white">{value}</p>
        <p className="mt-0.5 text-[11px] text-gray-500">{helper}</p>
      </div>
      <span
        className={`ml-3 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${accent}`}
      >
        {icon}
      </span>
    </motion.div>
  );
}
