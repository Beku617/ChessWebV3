import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { QUICK_ACTIONS, iconMap } from "./game/types";
import { useDashboardLiveGames } from "../hooks/useWatchPage";
import {
  LiveGamesSection,
  TournamentsSection,
  PuzzlesSection,
} from "../components/dashboardComponents";

type PairingOption = {
  label: string;
  category: string;
  initial?: number;
  increment?: number;
};

const pairingOptions: PairingOption[] = [
  { label: "1+0", category: "Bullet", initial: 60, increment: 0 },
  { label: "2+1", category: "Bullet", initial: 120, increment: 1 },
  { label: "3+0", category: "Blitz", initial: 180, increment: 0 },
  { label: "3+2", category: "Blitz", initial: 180, increment: 2 },
  { label: "5+0", category: "Blitz", initial: 300, increment: 0 },
  { label: "5+3", category: "Blitz", initial: 300, increment: 3 },
  { label: "10+0", category: "Rapid", initial: 600, increment: 0 },
  { label: "10+5", category: "Rapid", initial: 600, increment: 5 },
  { label: "15+10", category: "Rapid", initial: 900, increment: 10 },
  { label: "90+0", category: "Classical", initial: 5400, increment: 0 },
  { label: "90+30", category: "Classical", initial: 5400, increment: 30 },
  { label: "Custom", category: "Choose setup" },
];

const fontSizeGroup = {
  primary: "text-base",
  secondary: "text-sm",
} as const;

export default function Dashboard() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const { games, loading: apiLoading, error, refetch } = useDashboardLiveGames();

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 650);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-6 md:space-y-8 min-w-0">
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="flex flex-col xl:flex-row items-stretch gap-5 xl:min-h-max"
      >
        <div className="theme-glass-panel rounded-xl flex flex-1 flex-col self-stretch min-h-0">
          <div className="p-3 sm:p-4 flex flex-1 min-h-0">
            <div className="grid h-full min-h-0 flex-1 items-stretch grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-2.5 xl:grid-rows-[repeat(4,minmax(0,1fr))]">
              {pairingOptions.map((option) => (
                <Link
                  key={option.label}
                  to={
                    option.initial !== undefined && option.increment !== undefined
                      ? `/play/quick?initial=${option.initial}&increment=${option.increment}&autostart=1`
                      : "/play/quick"
                  }
                  state={
                    option.initial !== undefined && option.increment !== undefined
                      ? {
                          initial: option.initial,
                          increment: option.increment,
                          autoStart: true,
                        }
                      : undefined
                  }
                  className="theme-glass-panel-soft rounded-xl min-h-[92px] h-full min-w-0 px-3 py-2.5 sm:px-3.5 sm:py-3 flex flex-col items-center justify-center text-center hover:border-teal-300/60 hover:bg-white/70 dark:hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <p className="text-3xl sm:text-[2.2rem] leading-none font-light text-gray-900 dark:text-white tracking-tight">
                    {option.label === "Custom" ? t("Custom") : option.label}
                  </p>
                  <p className="mt-1.5 text-sm sm:text-base font-medium text-gray-600 dark:text-gray-300">
                    {t(option.category)}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <aside className="theme-glass-panel rounded-xl p-4 sm:p-5 flex flex-col w-full xl:w-[380px] xl:shrink-0 self-stretch h-full">
          <div className="space-y-3">
            {QUICK_ACTIONS.map((item) => {
              const Icon = iconMap[item.icon];

              return (
                <Link
                  key={item.id}
                  to={item.route}
                  className="theme-glass-panel-soft group w-full rounded-xl px-4 py-4 hover:border-teal-300/60 hover:bg-white/70 dark:hover:bg-white/10 transition-colors flex items-center gap-3"
                >
                  <span className="w-10 h-10 shrink-0 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center border border-gray-200 dark:border-gray-700 group-hover:border-teal-300 dark:group-hover:border-teal-700/50 transition-colors">
                    <Icon className="w-5 h-5 text-gray-500 dark:text-gray-300" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span
                      className={`block ${fontSizeGroup.primary} font-medium text-gray-900 dark:text-white`}
                    >
                      {t(item.title)}
                    </span>
                    <span
                      className={`block ${fontSizeGroup.secondary} text-gray-500 dark:text-gray-400`}
                    >
                      {t(item.description)}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </aside>
      </motion.section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08 }}
          className="theme-glass-panel xl:col-span-12 rounded-xl p-6"
        >
          <PuzzlesSection showTopDivider={false} />

          <div className="mt-6 pt-4 border-t border-theme-glass">
            <TournamentsSection />
          </div>
        </motion.section>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.16 }}
      >
        <LiveGamesSection
          loading={loading}
          games={games}
          apiLoading={apiLoading}
          error={error}
          refetch={refetch}
        />
      </motion.div>
    </div>
  );
}
