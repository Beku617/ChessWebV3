import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/authStore";
import { GameHistory } from "../historyTypes";
import Sidebar from "../components/Sidebar";
import {
  ProfileHeader,
  OverviewTabContent,
  GamesTabContent,
  NoGamesPlaceholder,
  API_URL,
  formatMemberSince,
  calculateStats,
  filterGames,
  type FilterType,
  type TabType,
} from "../components/profilePage";

export default function Profile() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const [games, setGames] = useState<GameHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [activeTab, setActiveTab] = useState<TabType>("overview");

  useEffect(() => {
    async function fetchGames() {
      try {
        const res = await fetch(`${API_URL}/api/history`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(t("profilePage.errors.fetchGamesFailed", "Failed to fetch games"));
        const data = await res.json();
        setGames(data.games || []);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : t("profilePage.errors.loadGamesFailed", "Failed to load games"),
        );
      } finally {
        setLoading(false);
      }
    }
    fetchGames();
  }, []);

  const stats = useMemo(() => calculateStats(games), [games]);
  const filteredGames = useMemo(
    () => filterGames(games, filter),
    [games, filter],
  );

  const oldestGameDate = useMemo(() => {
    if (games.length === 0) return null;
    return games.reduce<string | null>((oldest, game) => {
      const gameDate = new Date(game.createdAt);
      if (!Number.isFinite(gameDate.getTime())) return oldest;
      if (!oldest) return game.createdAt;
      const oldestDate = new Date(oldest);
      return gameDate.getTime() < oldestDate.getTime() ? game.createdAt : oldest;
    }, null);
  }, [games]);

  const memberSince = useMemo(
    () =>
      formatMemberSince(
        user?.createdAt ?? null,
        oldestGameDate,
        i18n.resolvedLanguage || i18n.language || "en",
        t("profilePage.unknown", "Unknown"),
      ),
    [i18n.language, i18n.resolvedLanguage, oldestGameDate, t, user?.createdAt],
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-theme-panel flex">
        <Sidebar />
        <div className="flex-1 ml-[60px] md:ml-72 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-panel text-theme-foreground flex transition-colors duration-300">
      <Sidebar />
      <div className="flex-1 ml-[60px] md:ml-72">
        <ProfileHeader
          user={user}
          stats={stats}
          memberSince={memberSince}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isMe={true}
        />

        <div className="px-4 lg:px-6 py-6">
          {error && (
            <div className="bg-red-100 text-red-700 p-4 rounded-xl mb-6">
              {error}
            </div>
          )}

          {stats ? (
            activeTab === "overview" ? (
              <OverviewTabContent
                stats={stats}
                games={games}
                expandedId={expandedId}
                setExpandedId={setExpandedId}
                setActiveTab={setActiveTab}
              />
            ) : (
              <GamesTabContent
                filteredGames={filteredGames}
                allGames={games}
                filter={filter}
                setFilter={setFilter}
                expandedId={expandedId}
                setExpandedId={setExpandedId}
                showShareButton={true}
              />
            )
          ) : (
            <NoGamesPlaceholder />
          )}
        </div>
      </div>
    </div>
  );
}

