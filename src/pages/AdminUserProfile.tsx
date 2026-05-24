import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAdminStore } from "../store/adminStore";
import AdminSidebar from "../components/AdminSidebar";
import { GameHistory } from "../historyTypes";
import {
  ProfileHeader,
  OverviewTabContent,
  GamesTabContent,
  NoGamesPlaceholder,
  formatMemberSince,
  calculateStats,
  filterGames,
  type FilterType,
  type TabType,
} from "../components/profilePage";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface UserData {
  _id: string;
  fullName: string;
  email: string;
  avatar?: string;
  rating: number;
  bulletRating?: number;
  blitzRating?: number;
  rapidRating?: number;
  classicalRating?: number;
  bulletGames?: number;
  blitzGames?: number;
  rapidGames?: number;
  classicalGames?: number;
  gamesPlayed: number;
  gamesWon: number;
  presenceStatus?: "online" | "offline" | "searching_match" | "in_game" | "away";
  lastSeenAt?: string | null;
  lastActiveAt?: string | null;
  createdAt: string;
}

export default function AdminUserProfile() {
  const { t } = useTranslation();
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const {
    isAuthenticated,
    isLoading: authLoading,
    checkAuth,
  } = useAdminStore();

  const [user, setUser] = useState<UserData | null>(null);
  const [games, setGames] = useState<GameHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [activeTab, setActiveTab] = useState<TabType>("overview");

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [isAuthenticated, authLoading, navigate]);

  // Fetch user data
  useEffect(() => {
    if (!isAuthenticated || !userId) return;

    async function fetchUserData() {
      try {
        setLoading(true);

        // Fetch user info
        const userRes = await fetch(`${API_URL}/api/admin/users/${userId}`, {
          credentials: "include",
        });
        if (!userRes.ok) throw new Error(t("admin.users.errors.fetchUser"));
        const userData = await userRes.json();
        setUser(userData.user);

        // Fetch user's games
        const gamesRes = await fetch(
          `${API_URL}/api/admin/users/${userId}/games`,
          {
            credentials: "include",
          },
        );
        if (gamesRes.ok) {
          const gamesData = await gamesRes.json();
          setGames(gamesData.games || []);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t("admin.users.errors.loadUser"),
        );
      } finally {
        setLoading(false);
      }
    }
    fetchUserData();
  }, [isAuthenticated, t, userId]);

  const stats = useMemo(() => calculateStats(games), [games]);
  const filteredGames = useMemo(
    () => filterGames(games, filter),
    [games, filter],
  );

  const memberSince = formatMemberSince(user?.createdAt ?? null);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 text-gray-900 dark:text-white">
        <AdminSidebar />
        <main className="ml-72 p-8">
          <button
            onClick={() => navigate("/admin")}
            className="flex items-center gap-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            {t("admin.users.backToDashboard")}
          </button>
          <div className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-4 rounded-xl">
            {error || t("admin.users.errors.notFound")}
          </div>
        </main>
      </div>
    );
  }

  // Create a user object compatible with ProfileHeader
  const profileUser = {
    id: user._id,
    fullName: user.fullName,
    email: user.email,
    avatar: user.avatar,
    rating: user.rating,
    bulletRating: user.bulletRating,
    blitzRating: user.blitzRating,
    rapidRating: user.rapidRating,
    classicalRating: user.classicalRating,
    bulletGames: user.bulletGames,
    blitzGames: user.blitzGames,
    rapidGames: user.rapidGames,
    classicalGames: user.classicalGames,
    gamesPlayed: user.gamesPlayed,
    gamesWon: user.gamesWon,
    presenceStatus: user.presenceStatus,
    lastSeenAt: user.lastSeenAt,
    lastActiveAt: user.lastActiveAt,
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 text-gray-900 dark:text-white transition-colors duration-300">
      <AdminSidebar />

      <div className="ml-72">
        {/* Back Button */}
        <div className="px-8 pt-6">
          <button
            onClick={() => navigate("/admin")}
            className="flex items-center gap-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            {t("admin.users.backToDashboard")}
          </button>
        </div>

        <ProfileHeader
          user={profileUser}
          stats={stats}
          memberSince={memberSince}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isMe={false}
        />

        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8">
          {stats ? (
            activeTab === "overview" ? (
              <OverviewTabContent
                stats={stats}
                games={games}
                expandedId={expandedId}
                setExpandedId={setExpandedId}
                setActiveTab={setActiveTab}
                analyzeBaseUrl="/admin/analyze"
                enableSelfRatingAnalytics={false}
                ratingSnapshot={profileUser}
                timelineUnavailableMessage={t(
                  "admin.users.timelineUnavailable",
                )}
              />
            ) : (
              <GamesTabContent
                filteredGames={filteredGames}
                filter={filter}
                setFilter={setFilter}
                expandedId={expandedId}
                setExpandedId={setExpandedId}
                analyzeBaseUrl="/admin/analyze"
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

