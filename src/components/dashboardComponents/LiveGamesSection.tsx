import { motion } from "framer-motion";
import { Users, Clock, RefreshCw, Radio } from "lucide-react";
import { useTranslation, Trans } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { WatchLiveGame } from "../../pages/watch/types";

interface LiveGamesSectionProps {
  loading: boolean;
  games: WatchLiveGame[];
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
  const hasMoreGames = games.length > 5;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-theme-panel rounded-2xl border border-theme-glass/50 shadow-sm overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-theme-glass/60 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center">
            <Radio className="w-4 h-4 text-emerald-400" />
          </div>
          <h2 className="text-lg font-semibold text-theme-foreground ">
            {t("Live Games")}
          </h2>
          {!isLoading && (
            <span className="px-2 py-0.5 bg-emerald-500/15 border border-emerald-400/30 text-emerald-400 text-xs rounded-md font-medium">
              {games.length} {t("active")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={refetch}
            disabled={apiLoading}
            className="p-1.5 rounded-lg text-theme-muted hover:text-emerald-500 hover:bg-theme-surface transition-all disabled:opacity-40"
            title={t("Refresh live games")}
          >
            <RefreshCw className={`w-4 h-4 ${apiLoading ? "animate-spin" : ""}`} />
          </button>
          {!isLoading && hasMoreGames ? (
            <button
              onClick={() => navigate("/watch")}
              className="text-sm text-theme-accent hover:opacity-80 transition-colors font-medium"
            >
              {t("View All")} &gt;
            </button>
          ) : null}
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-4 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200/60">
          <p className="text-xs text-amber-600">{error}</p>
        </div>
      )}

      <div className="p-5 space-y-2.5">
        {isLoading
          ? [0, 1, 2].map((i) => (
              <div
                key={i}
                className="animate-pulse bg-theme-surface rounded-xl p-4 border border-theme-glass/50"
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-2 w-2/3">
                    <div className="h-3 bg-theme-surface rounded-lg w-36" />
                    <div className="h-3 bg-theme-surface rounded-lg w-64" />
                  </div>
                  <div className="h-3 bg-theme-surface rounded-lg w-24" />
                </div>
              </div>
            ))
          : games.slice(0, 5).map((game, index) => (
              <motion.div
                key={`${game.id}-${index}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="group bg-theme-surface/80 rounded-xl p-4 border border-theme-glass/50 hover:border-emerald-400/50 hover:bg-theme-panel transition-all"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                        <span className="text-xs text-theme-muted font-medium">
                          {game.type || game.speed}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-theme-muted">
                        <Clock className="w-3 h-3" />
                        <span className="text-xs font-mono">{game.time}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm flex-wrap">
                      <span className="text-theme-foreground font-medium">
                        {game.whiteTitle && (
                          <span className="text-amber-500 mr-1 text-xs">
                            {game.whiteTitle}
                          </span>
                        )}
                        {game.white}
                        <span className="text-theme-muted ml-1 font-normal text-xs">
                          ({game.whiteRating})
                        </span>
                      </span>
                      <span className="text-theme-muted text-xs"><Trans>vs</Trans></span>
                      <span className="text-theme-foreground font-medium">
                        {game.blackTitle && (
                          <span className="text-amber-500 mr-1 text-xs">
                            {game.blackTitle}
                          </span>
                        )}
                        {game.black}
                        <span className="text-theme-muted ml-1 font-normal text-xs">
                          ({game.blackRating})
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="flex items-center gap-1 text-theme-muted">
                      <Users className="w-3 h-3" />
                      <span className="text-xs">{game.viewers}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        navigate(
                          game.gameUrl ||
                            `/watch/${encodeURIComponent(game.id)}`,
                        )
                      }
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-theme-on-accent text-xs font-medium rounded-lg transition-all opacity-0 group-hover:opacity-100 shadow-sm"
                    >
                      {t("Watch")}
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
      </div>
    </motion.div>
  );
}
