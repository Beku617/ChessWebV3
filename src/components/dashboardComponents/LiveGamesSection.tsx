import { motion } from "framer-motion";
import { Users, Clock, RefreshCw, Radio } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  const isLoading = loading || apiLoading;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-white dark:bg-gray-900/95 rounded-2xl border border-gray-200/80 dark:border-gray-700/50 shadow-sm overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800/60 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/60 dark:border-emerald-700/40 flex items-center justify-center">
            <Radio className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t("Live Games")}
          </h2>
          {!isLoading && (
            <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/60 dark:border-emerald-700/40 text-emerald-600 dark:text-emerald-400 text-xs rounded-md font-medium">
              {games.length} {t("active")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={refetch}
            disabled={apiLoading}
            className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-500 dark:hover:text-emerald-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all disabled:opacity-40"
            title={t("Refresh live games")}
          >
            <RefreshCw className={`w-4 h-4 ${apiLoading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => navigate("/watch")}
            className="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 transition-colors font-medium"
          >
            {t("View All")} &gt;
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-4 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-700/40">
          <p className="text-xs text-amber-600 dark:text-amber-400">{error}</p>
        </div>
      )}

      <div className="p-5 space-y-2.5">
        {isLoading
          ? [0, 1, 2].map((i) => (
              <div
                key={i}
                className="animate-pulse bg-gray-50 dark:bg-gray-800/40 rounded-xl p-4 border border-gray-200/80 dark:border-gray-700/50"
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-2 w-2/3">
                    <div className="h-3 bg-gray-200 dark:bg-gray-700/60 rounded-lg w-36" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700/60 rounded-lg w-64" />
                  </div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700/60 rounded-lg w-24" />
                </div>
              </div>
            ))
          : games.slice(0, 5).map((game, index) => (
              <motion.div
                key={`${game.id}-${index}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="group bg-gray-50/80 dark:bg-gray-800/40 rounded-xl p-4 border border-gray-200/80 dark:border-gray-700/50 hover:border-emerald-400/50 dark:hover:border-emerald-500/30 hover:bg-white dark:hover:bg-gray-800/70 transition-all"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                          {game.type || game.speed}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                        <Clock className="w-3 h-3" />
                        <span className="text-xs font-mono">{game.time}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm flex-wrap">
                      <span className="text-gray-900 dark:text-white font-medium">
                        {game.whiteTitle && (
                          <span className="text-amber-500 dark:text-amber-400 mr-1 text-xs">
                            {game.whiteTitle}
                          </span>
                        )}
                        {game.white}
                        <span className="text-gray-400 dark:text-gray-500 ml-1 font-normal text-xs">
                          ({game.whiteRating})
                        </span>
                      </span>
                      <span className="text-gray-300 dark:text-gray-600 text-xs">vs</span>
                      <span className="text-gray-900 dark:text-white font-medium">
                        {game.blackTitle && (
                          <span className="text-amber-500 dark:text-amber-400 mr-1 text-xs">
                            {game.blackTitle}
                          </span>
                        )}
                        {game.black}
                        <span className="text-gray-400 dark:text-gray-500 ml-1 font-normal text-xs">
                          ({game.blackRating})
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="flex items-center gap-1 text-gray-400 dark:text-gray-500">
                      <Users className="w-3 h-3" />
                      <span className="text-xs">{game.viewers}</span>
                    </div>
                    <a
                      href={game.gameUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition-all opacity-0 group-hover:opacity-100 shadow-sm"
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
