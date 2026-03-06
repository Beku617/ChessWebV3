import { PlayCircle, ExternalLink, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TransformedStreamer } from "../../utils/lichessApi";

interface StreamersSectionProps {
  streamers: TransformedStreamer[];
  loading?: boolean;
  onRefresh?: () => void;
}

export function StreamersSection({
  streamers,
  loading,
  onRefresh,
}: StreamersSectionProps) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <section className="mt-12">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center">
          <PlayCircle className="w-5 h-5 text-purple-500 mr-2" />
          {t("Live Streamers")}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 animate-pulse"
            >
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700"></div>
                <div className="flex-1">
                  <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
                  <div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (streamers.length === 0) {
    return (
      <section className="mt-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
            <PlayCircle className="w-5 h-5 text-purple-500 mr-2" />
            {t("Live Streamers")}
          </h2>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              <RefreshCw className="w-4 h-4" />
              {t("Refresh")}
            </button>
          )}
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            {t("No streamers live right now")}
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            {t("Check back later!")}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-12">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
          <PlayCircle className="w-5 h-5 text-purple-500 mr-2" />
          {t("Live Streamers")}
          <span className="ml-2 text-xs bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded text-gray-500">
            {streamers.length} {t("live")}
          </span>
        </h2>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <RefreshCw className="w-4 h-4" />
            {t("Refresh")}
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {streamers.map((streamer) => (
          <a
            key={streamer.id}
            href={streamer.url}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex items-center space-x-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer shadow-sm group"
          >
            <div className="relative">
              <div className="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center font-bold text-lg text-white">
                {streamer.avatar}
              </div>
              <div className="absolute -bottom-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 rounded-full border-2 border-white dark:border-gray-900">
                LIVE
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-gray-900 dark:text-white truncate flex items-center gap-1">
                {streamer.title && (
                  <span className="text-amber-500 text-xs font-bold">
                    {streamer.title}
                  </span>
                )}
                {streamer.name}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {streamer.streamTitle}
              </div>
              <div className="text-xs text-purple-600 dark:text-purple-400 mt-0.5 flex items-center gap-1">
                <span>
                  {streamer.viewers} {t("watching")}
                </span>
                <span className="text-gray-400">•</span>
                <span className="capitalize">{streamer.platform}</span>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          </a>
        ))}
      </div>

      {/* Lichess attribution */}
      <div className="mt-4 text-center text-xs text-gray-400 dark:text-gray-500">
        {t("Streamers powered by")}{" "}
        <a
          href="https://lichess.org/streamer"
          target="_blank"
          rel="noopener noreferrer"
          className="text-teal-600 dark:text-teal-500 hover:underline"
        >
          Lichess.org
        </a>
      </div>
    </section>
  );
}
