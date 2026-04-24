import { Eye, ExternalLink, Calendar, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FeaturedEvent } from "../../hooks/useWatchPage";
import { TransformedLiveGame } from "../../utils/lichessApi";

interface FeaturedMatchProps {
  event?: FeaturedEvent | null;
  fallbackGame?: TransformedLiveGame | null;
  loading?: boolean;
}

export function FeaturedMatch({
  event,
  fallbackGame,
  loading,
}: FeaturedMatchProps) {
  const { t } = useTranslation();

  // Show skeleton while loading
  if (loading) {
    return (
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
            {t("Featured Match")}
          </h2>
        </div>
        <div className="bg-white dark:bg-gradient-to-r dark:from-gray-900 dark:to-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-800 shadow-xl animate-pulse">
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </section>
    );
  }

  // If we have a featured event from admin
  if (event) {
    const player1 = event.players?.[0];
    const player2 = event.players?.[1];

    return (
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
            {t("Featured")}{" "}
            {event.type === "tournament"
              ? t("Tournament")
              : event.type === "match"
                ? t("Match")
                : t("Event")}
          </h2>
          <span className="text-brand-600 dark:text-brand-500 text-sm font-medium cursor-pointer hover:underline">
            {t("View all events")}
          </span>
        </div>

        <div className="bg-white dark:bg-gradient-to-r dark:from-gray-900 dark:to-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-800 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/5 dark:bg-brand-500/10 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-brand-500/10 dark:group-hover:bg-brand-500/20"></div>

          {/* Event Header */}
          <div className="relative z-10 mb-6">
            <div className="flex items-center gap-3 mb-2">
              {event.status === "live" && (
                <span className="px-2 py-1 bg-red-500 text-white text-xs font-bold rounded animate-pulse">
                  LIVE
                </span>
              )}
              {event.status === "upcoming" && (
                <span className="px-2 py-1 bg-blue-500 text-white text-xs font-bold rounded">
                  {t("UPCOMING")}
                </span>
              )}
              <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {event.type}
              </span>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
              {event.title}
            </h3>
            {event.description && (
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                {event.description}
              </p>
            )}
          </div>

          {/* Players (if it's a match) */}
          {player1 && player2 && (
            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8 mb-6">
              {/* Player 1 */}
              <div className="flex items-center space-x-4 flex-1 justify-end">
                <div className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {player1.title && (
                      <span className="text-amber-500 font-bold text-sm">
                        {player1.title}
                      </span>
                    )}
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">
                      {player1.name}
                    </span>
                  </div>
                  <div className="text-gray-500 dark:text-gray-400 font-mono">
                    {player1.rating}
                  </div>
                </div>
                <div className="w-16 h-16 rounded-xl bg-gray-100 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 flex items-center justify-center text-2xl shadow-lg">

                </div>
              </div>

              {/* VS */}
              <div className="flex flex-col items-center px-8">
                <div className="text-4xl font-black text-gray-400 dark:text-gray-600">
                  VS
                </div>
              </div>

              {/* Player 2 */}
              <div className="flex items-center space-x-4 flex-1">
                <div className="w-16 h-16 rounded-xl bg-gray-100 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 flex items-center justify-center text-2xl shadow-lg">

                </div>
                <div>
                  <div className="flex items-center gap-2">
                    {player2.title && (
                      <span className="text-amber-500 font-bold text-sm">
                        {player2.title}
                      </span>
                    )}
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">
                      {player2.name}
                    </span>
                  </div>
                  <div className="text-gray-500 dark:text-gray-400 font-mono">
                    {player2.rating}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Event Info */}
          <div className="relative z-10 flex items-center justify-center gap-6 text-sm text-gray-500 dark:text-gray-400 mb-6">
            {event.startDate && (
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                <span>{new Date(event.startDate).toLocaleDateString()}</span>
              </div>
            )}
            {event.viewers > 0 && (
              <div className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                <span>
                  {event.viewers.toLocaleString()} {t("watching")}
                </span>
              </div>
            )}
          </div>

          <div className="flex justify-center gap-4">
            <button className="flex items-center space-x-2 bg-brand-600 hover:bg-brand-500 text-white px-8 py-3 rounded-lg font-bold transition-all shadow-lg shadow-brand-900/20 hover:scale-105">
              <Eye className="w-5 h-5" />
              <span>{t("Watch Now")}</span>
            </button>
            {event.lichessUrl && (
              <a
                href={event.lichessUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-2 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white px-6 py-3 rounded-lg font-bold transition-all"
              >
                <ExternalLink className="w-5 h-5" />
                <span>Lichess</span>
              </a>
            )}
          </div>
        </div>
      </section>
    );
  }

  // Fallback to Lichess live game
  if (fallbackGame) {
    return (
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
            {t("Featured Match")}
            <span className="ml-2 text-xs bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded text-gray-500">
              {t("via Lichess")}
            </span>
          </h2>
          <span className="text-brand-600 dark:text-brand-500 text-sm font-medium cursor-pointer hover:underline">
            {t("View all tournaments")}
          </span>
        </div>

        <div className="bg-white dark:bg-gradient-to-r dark:from-gray-900 dark:to-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-800 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/5 dark:bg-brand-500/10 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-brand-500/10 dark:group-hover:bg-brand-500/20"></div>

          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
            {/* Player 1 */}
            <div className="flex items-center space-x-4 flex-1 justify-end">
              <div className="text-right">
                <div className="flex items-center justify-end gap-2">
                  {fallbackGame.whiteTitle && (
                    <span className="text-amber-500 font-bold text-sm">
                      {fallbackGame.whiteTitle}
                    </span>
                  )}
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">
                    {fallbackGame.white}
                  </span>
                </div>
                <div className="text-gray-500 dark:text-gray-400 font-mono">
                  {fallbackGame.whiteRating}
                </div>
              </div>
              <div className="w-16 h-16 rounded-xl bg-gray-100 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 flex items-center justify-center text-2xl shadow-lg">

              </div>
            </div>

            {/* VS / Status */}
            <div className="flex flex-col items-center px-8">
              <div className="text-sm font-bold text-red-500 tracking-widest mb-2 animate-pulse">
                LIVE
              </div>
              <div className="text-4xl font-black text-gray-400 dark:text-gray-600">
                VS
              </div>
              <div className="mt-2 px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                {(fallbackGame.category || fallbackGame.type) +
                  " • " +
                  fallbackGame.time}
              </div>
            </div>

            {/* Player 2 */}
            <div className="flex items-center space-x-4 flex-1">
              <div className="w-16 h-16 rounded-xl bg-gray-100 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 flex items-center justify-center text-2xl shadow-lg">

              </div>
              <div>
                <div className="flex items-center gap-2">
                  {fallbackGame.blackTitle && (
                    <span className="text-amber-500 font-bold text-sm">
                      {fallbackGame.blackTitle}
                    </span>
                  )}
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">
                    {fallbackGame.black}
                  </span>
                </div>
                <div className="text-gray-500 dark:text-gray-400 font-mono">
                  {fallbackGame.blackRating}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-center gap-4">
            <a
              href={fallbackGame.gameUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 bg-brand-600 hover:bg-brand-500 text-white px-8 py-3 rounded-lg font-bold transition-all shadow-lg shadow-brand-900/20 hover:scale-105"
            >
              <Eye className="w-5 h-5" />
              <span>{t("Watch on Lichess")}</span>
            </a>
          </div>
        </div>
      </section>
    );
  }

  // No featured content
  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
          {t("Featured Match")}
        </h2>
      </div>
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 border border-gray-200 dark:border-gray-800 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          {t("No featured events at the moment")}
        </p>
      </div>
    </section>
  );
}

