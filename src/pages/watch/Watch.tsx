import { useState } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import Sidebar from "../../components/Sidebar";
import { LiveGamesGrid } from "./LiveGamesGrid";
import { StreamersSection } from "./StreamersSection";
import { useWatchPageData } from "../../hooks/useWatchPage";
import { WatchFeaturedCarousel } from "./WatchFeaturedCarousel";

export default function Watch() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("Top Rated");
  const [searchQuery, setSearchQuery] = useState("");

  const { liveGames, streamers, featured } = useWatchPageData();
  const liveError = liveGames.error;
  const streamError = streamers.error;

  const filteredGames = liveGames.games.filter((game) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      game.white.toLowerCase().includes(query) ||
      game.black.toLowerCase().includes(query) ||
      game.type.toLowerCase().includes(query)
    );
  });

  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 text-gray-900 dark:text-white flex transition-colors duration-300">
      <Sidebar />

      <main className="flex-1 ml-[60px] md:ml-72 p-8">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
              {t("Watch Live")}
            </h1>
          </div>

          <div className="flex items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder={t("Search players or events...")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-300 pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:border-brand-500 w-64 transition-colors shadow-sm"
              />
            </div>
          </div>
        </header>

        <WatchFeaturedCarousel
          events={featured.events}
          loading={featured.loading}
        />

        <LiveGamesGrid
          activeTab={activeTab}
          onTabChange={setActiveTab}
          games={filteredGames}
          loading={liveGames.loading}
          onRefresh={liveGames.refetch}
        />

        {(liveError || streamError) && (
          <div className="mt-4 text-sm text-amber-600 dark:text-amber-400">
            {liveError || streamError}
          </div>
        )}

        <StreamersSection
          streamers={streamers.streamers}
          loading={streamers.loading}
          onRefresh={streamers.refetch}
        />
      </main>
    </div>
  );
}
