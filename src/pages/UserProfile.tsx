import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { GameHistory } from "../historyTypes";
import Sidebar from "../components/Sidebar";
import {
  ProfileHeader,
  OverviewTabContent,
  GamesTabContent,
  NoGamesPlaceholder,
  API_URL,
  calculateStats,
  filterGames,
  type FilterType,
  type TabType,
} from "../components/profilePage";
import type { Relationship } from "../components/profilePage/ProfileHeader";
import { useFriendStore } from "../store/friendStore";

interface PublicUser {
  id: string;
  fullName?: string;
  email?: string;
  avatar?: string;
  rating?: number;
  bulletRating?: number;
  blitzRating?: number;
  rapidRating?: number;
  classicalRating?: number;
  bulletGames?: number;
  blitzGames?: number;
  rapidGames?: number;
  classicalGames?: number;
  gamesPlayed?: number;
  gamesWon?: number;
  presenceStatus?: "online" | "offline" | "searching_match" | "in_game" | "away";
  lastSeenAt?: string | null;
  lastActiveAt?: string | null;
}

export default function UserProfile() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const {
    user: authUser,
    isAuthenticated,
    isLoading: authLoading,
  } = useAuthStore();
  const sendFriendRequest = useFriendStore((state) => state.sendRequest);
  const acceptFriendRequest = useFriendStore((state) => state.acceptRequest);
  const ignoreFriendRequest = useFriendStore((state) => state.ignoreRequest);
  const removeFriendship = useFriendStore((state) => state.removeFriend);

  const [profileUser, setProfileUser] = useState<PublicUser | null>(null);
  const [relationship, setRelationship] = useState<Relationship>("none");
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [games, setGames] = useState<GameHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [friendLoading, setFriendLoading] = useState(false);

  // If viewing own profile, redirect to /profile
  useEffect(() => {
    if (!authLoading && isAuthenticated && authUser?.id && userId === authUser.id) {
      navigate("/profile", { replace: true });
    }
  }, [authLoading, isAuthenticated, authUser?.id, userId, navigate]);

  // Fetch profile + games in parallel
  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        const [profileRes, gamesRes] = await Promise.all([
          fetch(`${API_URL}/api/users/${userId}`, {
            credentials: "include",
          }),
          fetch(`${API_URL}/api/history/user/${userId}`, {
            credentials: "include",
          }),
        ]);

        if (!profileRes.ok) throw new Error("User not found");
        const profileData = await profileRes.json();

        const gamesData = gamesRes.ok ? await gamesRes.json() : { games: [] };

        if (!cancelled) {
          setProfileUser(profileData.user);
          setRelationship(profileData.relationship || "none");
          setPendingRequestId(profileData.relationshipRequestId || null);
          setGames(gamesData.games || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load profile",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const stats = useMemo(() => calculateStats(games), [games]);
  const filteredGames = useMemo(
    () => filterGames(games, filter),
    [games, filter],
  );

  const memberSince =
    games.length > 0
      ? new Date(games[games.length - 1]?.createdAt).toLocaleDateString(
          "en-US",
          { month: "long", year: "numeric" },
        )
      : "New Player";
  const canUseFriendActions =
    !authLoading && isAuthenticated && Boolean(authUser?.id);

  const handleAddFriend = useCallback(async () => {
    if (!userId || friendLoading) return;
    try {
      setFriendLoading(true);
      const result = await sendFriendRequest(userId);
      if (result.status === "accepted") {
        setRelationship("friends");
        setPendingRequestId(null);
      } else {
        setRelationship("outgoing_pending");
        setPendingRequestId(result.requestId || null);
      }
    } catch {
      // ignore
    } finally {
      setFriendLoading(false);
    }
  }, [userId, friendLoading, sendFriendRequest]);

  const handleRemoveFriend = useCallback(async () => {
    if (!userId || friendLoading) return;
    try {
      setFriendLoading(true);
      await removeFriendship(userId);
      setRelationship("none");
      setPendingRequestId(null);
    } catch {
      // ignore
    } finally {
      setFriendLoading(false);
    }
  }, [userId, friendLoading, removeFriendship]);

  const handleAcceptRequest = useCallback(async () => {
    if (!pendingRequestId || friendLoading) return;
    try {
      setFriendLoading(true);
      await acceptFriendRequest(pendingRequestId);
      setRelationship("friends");
      setPendingRequestId(null);
    } finally {
      setFriendLoading(false);
    }
  }, [pendingRequestId, friendLoading, acceptFriendRequest]);

  const handleIgnoreRequest = useCallback(async () => {
    if (!pendingRequestId || friendLoading) return;
    try {
      setFriendLoading(true);
      await ignoreFriendRequest(pendingRequestId);
      setRelationship("none");
      setPendingRequestId(null);
    } finally {
      setFriendLoading(false);
    }
  }, [pendingRequestId, friendLoading, ignoreFriendRequest]);

  const handleChallenge = useCallback(() => {
    if (relationship !== "friends") return;
    navigate("/play/friend");
  }, [navigate, relationship]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 flex">
        <Sidebar />
        <div className="flex-1 ml-72 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-500"></div>
        </div>
      </div>
    );
  }

  if (error || !profileUser) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 flex">
        <Sidebar />
        <div className="flex-1 ml-72 flex items-center justify-center">
          <div className="text-center">
            <p className="text-lg text-gray-500 dark:text-gray-400">
              {error || "User not found"}
            </p>
            <button
              onClick={() => navigate(-1)}
              className="mt-4 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isMe = false;

  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 text-gray-900 dark:text-white flex transition-colors duration-300">
      <Sidebar />
      <div className="flex-1 ml-72">
        <ProfileHeader
          user={profileUser}
          stats={stats}
          memberSince={memberSince}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isMe={isMe}
          relationship={relationship}
          onAddFriend={canUseFriendActions ? handleAddFriend : undefined}
          onRemoveFriend={canUseFriendActions ? handleRemoveFriend : undefined}
          onChallenge={canUseFriendActions ? handleChallenge : undefined}
          onAcceptRequest={canUseFriendActions ? handleAcceptRequest : undefined}
          onIgnoreRequest={canUseFriendActions ? handleIgnoreRequest : undefined}
          friendLoading={friendLoading}
        />

        <div className="px-4 lg:px-6 py-6">
          {stats ? (
            activeTab === "overview" ? (
              <OverviewTabContent
                stats={stats}
                games={games}
                expandedId={expandedId}
                setExpandedId={setExpandedId}
                setActiveTab={setActiveTab}
                enableSelfRatingAnalytics={false}
                ratingSnapshot={profileUser}
                timelineUnavailableMessage="Timeline is only available on the player's own account."
              />
            ) : (
              <GamesTabContent
                filteredGames={filteredGames}
                filter={filter}
                setFilter={setFilter}
                expandedId={expandedId}
                setExpandedId={setExpandedId}
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

