import { motion } from "framer-motion";
import { Users, Clock, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TransformedLiveGame } from "../../utils/lichessApi";

interface LiveGamesSectionProps {
  loading: boolean;
  games: TransformedLiveGame[];
  apiLoading: boolean;
  error: string | null;
  refetch: () => void | Promise<void>;
}

export function LiveGamesSection({
  loading,
  games,
  apiLoading,
  error,
  refetch,
}: LiveGamesSectionProps) {
  const { t } = useTranslation();
  const isLoading = loading || apiLoading;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"
    >
      <div className="p-6 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-teal-500 dark:text-teal-400" />
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
              {t("Live Games")}
            </h2>
            <span className="px-2 py-1 bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 text-xs rounded-full">
              {games.length} {t("active")}
            </span>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={refetch}
              disabled={apiLoading}
              className="flex items-center space-x-1 text-sm text-gray-500 dark:text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors disabled:opacity-50"
              title={t("Refresh live games")}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${apiLoading ? "animate-spin" : ""}`}
              />
            </button>
            <button className="text-sm text-teal-600 dark:text-teal-400 hover:text-teal-500 dark:hover:text-teal-300 transition-colors">
              {t("View All")}
            </button>
          </div>
        </div>
        {error && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            {error}
          </p>
        )}
      </div>
      <div className="p-6 space-y-4">
        {isLoading
          ? [0, 1, 2].map((i) => (
              <div
                key={i}
                className="animate-pulse bg-gray-100 dark:bg-gray-800/40 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-2 w-2/3">
                    <div className="h-3 bg-gray-200 dark:bg-gray-700/60 rounded w-36"></div>
                    <div className="h-3 bg-gray-200 dark:bg-gray-700/60 rounded w-64"></div>
                  </div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700/60 rounded w-24"></div>
                </div>
              </div>
            ))
          : games.slice(0, 5).map((game, index) => (
              <motion.div
                key={`${game.id}-${index}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: index * 0.06 }}
                className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-all cursor-pointer group hover:translate-y-[1px]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-4 mb-2">
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-green-500 dark:bg-green-400 rounded-full animate-pulse"></div>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {game.type || game.speed}
                        </span>
                      </div>
                      <div className="flex items-center space-x-1 text-gray-600 dark:text-gray-300">
                        <Clock className="w-3 h-3" />
                        <span className="text-sm font-mono">{game.time}</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="text-sm">
                        <span className="text-gray-900 dark:text-white font-medium">
                          {game.whiteTitle && (
                            <span className="text-amber-600 dark:text-amber-400 mr-1">
                              {game.whiteTitle}
                            </span>
                          )}
                          {game.white}
                          <span className="text-gray-400 dark:text-gray-500 ml-1">
                            ({game.whiteRating})
                          </span>
                        </span>
                        <span className="text-gray-400 dark:text-gray-500 mx-2">
                          vs
                        </span>
                        <span className="text-gray-900 dark:text-white font-medium">
                          {game.blackTitle && (
                            <span className="text-amber-600 dark:text-amber-400 mr-1">
                              {game.blackTitle}
                            </span>
                          )}
                          {game.black}
                          <span className="text-gray-400 dark:text-gray-500 ml-1">
                            ({game.blackRating})
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <div className="flex items-center space-x-1 text-gray-500 dark:text-gray-400">
                        <Users className="w-3 h-3" />
                        <span className="text-sm">{game.viewers}</span>
                      </div>
                    </div>
                    <a
                      href={game.gameUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 bg-teal-600 hover:bg-teal-500 text-white text-sm rounded-md transition-colors opacity-0 group-hover:opacity-100 shadow-sm hover:shadow-teal-600/20"
                    >
                      {t("Watch")}
                    </a>
                  </div>
                </div>
              </motion.div>
            ))}
      </div>
    </motion.div>
  );
}
