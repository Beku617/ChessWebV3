import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { GameHistory } from "../historyTypes";
import Sidebar from "../components/Sidebar";
import NotFound from "./NotFound";
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
  type TournamentHistoryEntry,
  type TabType,
} from "../components/profilePage";
import type { Relationship } from "../components/profilePage/ProfileHeader";
import { useFriendStore } from "../store/friendStore";
import {
  blockUser,
  unblockUser,
  useBlockStatus,
  refreshBlockingCaches,
} from "../features/blocking/api";

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
  createdAt?: string | null;
  presenceStatus?: "online" | "offline" | "searching_match" | "in_game" | "away";
  lastSeenAt?: string | null;
  lastActiveAt?: string | null;
  isWatchableInGame?: boolean;
  watchableGame?: {
    gameId: string;
    kind: "classic" | "fourPlayer";
    mode: "quick" | "friend" | "tournament" | "fourPlayer";
    variant?: string;
    status?: "active" | "temporarily_disconnected";
    participantCount?: number;
  } | null;
}

export default function UserProfile() {
  const { userId, username } = useParams<{
    userId?: string;
    username?: string;
  }>();
  const routeProfileKey = userId || username || "";
  const isUsernameRoute = Boolean(username && !userId);
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
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [friendLoading, setFriendLoading] = useState(false);
  const [blockActionLoading, setBlockActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [tournamentHistory, setTournamentHistory] = useState<
    TournamentHistoryEntry[]
  >([]);
  const targetUserId =
    profileUser?.id || (!isUsernameRoute ? routeProfileKey : "");
  const {
    data: blockStatus,
    mutate: mutateBlockStatus,
  } = useBlockStatus(targetUserId);

  const isBlockedByMe = Boolean(blockStatus?.isBlocked);
  const hasAnyBlockRelation = Boolean(
    blockStatus?.isAnyBlocked ||
      blockStatus?.isBlocked ||
      blockStatus?.isBlockedByTarget,
  );

  // If viewing own profile, redirect to /profile
  useEffect(() => {
    if (
      !authLoading &&
      isAuthenticated &&
      authUser?.id &&
      targetUserId === authUser.id
    ) {
      navigate("/profile", { replace: true });
    }
  }, [authLoading, isAuthenticated, authUser?.id, targetUserId, navigate]);

  // Fetch profile + games in parallel
  useEffect(() => {
    if (!routeProfileKey) return;

    let cancelled = false;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        setNotFound(false);

        const encodedProfileKey = encodeURIComponent(routeProfileKey);
        const profileUrl = isUsernameRoute
          ? `${API_URL}/api/users/profile/${encodedProfileKey}`
          : `${API_URL}/api/users/${encodedProfileKey}`;
        const profileRes = await fetch(profileUrl, {
          credentials: "include",
        });

        if (profileRes.status === 404) {
          if (!cancelled) {
            setNotFound(true);
            setProfileUser(null);
            setGames([]);
          }
          return;
        }
        if (!profileRes.ok) throw new Error("Failed to load profile");
        const profileData = await profileRes.json();
        const resolvedUserId = String(profileData.user?.id || "").trim();
        if (!resolvedUserId) throw new Error("User not found");

        const gamesRes = await fetch(`${API_URL}/api/history/user/${resolvedUserId}`, {
          credentials: "include",
        });
        if (gamesRes.status === 404) {
          if (!cancelled) {
            setNotFound(true);
            setProfileUser(null);
            setGames([]);
          }
          return;
        }
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
  }, [isUsernameRoute, routeProfileKey]);

  useEffect(() => {
    if (!targetUserId) return;
    let cancelled = false;

    async function fetchTournamentHistory() {
      try {
        const res = await fetch(`${API_URL}/api/users/${targetUserId}/profile`, {
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to load profile");
        if (!cancelled) {
          setTournamentHistory(data.profile?.tournamentHistory || []);
        }
      } catch {
        if (!cancelled) setTournamentHistory([]);
      }
    }

    void fetchTournamentHistory();
    return () => {
      cancelled = true;
    };
  }, [targetUserId]);

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
    () => formatMemberSince(profileUser?.createdAt ?? null, oldestGameDate),
    [profileUser?.createdAt, oldestGameDate],
  );
  const canUseFriendActions =
    !authLoading && isAuthenticated && Boolean(authUser?.id);

  const handleAddFriend = useCallback(async () => {
    if (!targetUserId || friendLoading) return;
    if (hasAnyBlockRelation) {
      setActionError("You cannot send a friend request to this player.");
      return;
    }
    try {
      setFriendLoading(true);
      setActionError(null);
      const result = await sendFriendRequest(targetUserId);
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
  }, [targetUserId, friendLoading, sendFriendRequest, hasAnyBlockRelation]);

  const handleRemoveFriend = useCallback(async () => {
    if (!targetUserId || friendLoading) return;
    try {
      setFriendLoading(true);
      setActionError(null);
      await removeFriendship(targetUserId);
      setRelationship("none");
      setPendingRequestId(null);
    } catch {
      // ignore
    } finally {
      setFriendLoading(false);
    }
  }, [targetUserId, friendLoading, removeFriendship]);

  const handleAcceptRequest = useCallback(async () => {
    if (!pendingRequestId || friendLoading) return;
    try {
      setFriendLoading(true);
      setActionError(null);
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
      setActionError(null);
      await ignoreFriendRequest(pendingRequestId);
      setRelationship("none");
      setPendingRequestId(null);
    } finally {
      setFriendLoading(false);
    }
  }, [pendingRequestId, friendLoading, ignoreFriendRequest]);

  const handleChallenge = useCallback(() => {
    if (hasAnyBlockRelation) {
      setActionError("You cannot challenge this player.");
      return;
    }
    if (relationship !== "friends") return;
    navigate("/play/friend");
  }, [navigate, relationship, hasAnyBlockRelation]);

  const handleMessage = useCallback(() => {
    if (!targetUserId || !profileUser?.fullName) return;
    if (hasAnyBlockRelation) {
      setActionError("Unable to send message.");
      return;
    }
    navigate(
      `/messages?chat=${encodeURIComponent(targetUserId)}&name=${encodeURIComponent(profileUser.fullName)}`,
    );
  }, [hasAnyBlockRelation, navigate, profileUser?.fullName, targetUserId]);

  const handleWatch = useCallback(() => {
    if (hasAnyBlockRelation) {
      setActionError("Unable to watch this player's game.");
      return;
    }
    if (!profileUser?.isWatchableInGame) return;
    const gameId = String(profileUser.watchableGame?.gameId || "").trim();
    navigate(gameId ? `/watch/${encodeURIComponent(gameId)}` : "/watch");
  }, [hasAnyBlockRelation, navigate, profileUser?.isWatchableInGame, profileUser?.watchableGame?.gameId]);

  const handleToggleBlock = useCallback(async () => {
    if (!targetUserId || blockActionLoading) return;

    const previous = blockStatus || {
      isBlocked: false,
      isBlockedByTarget: false,
      isAnyBlocked: false,
    };
    const nextIsBlocked = !Boolean(previous.isBlocked);

    setBlockActionLoading(true);
    setActionError(null);
    if (nextIsBlocked) {
      setRelationship("none");
      setPendingRequestId(null);
    }

    await mutateBlockStatus(
      {
        isBlocked: nextIsBlocked,
        isBlockedByTarget: Boolean(previous.isBlockedByTarget),
        isAnyBlocked: nextIsBlocked || Boolean(previous.isBlockedByTarget),
      },
      false,
    );

    try {
      if (nextIsBlocked) {
        await blockUser(targetUserId);
      } else {
        await unblockUser(targetUserId);
      }
      await mutateBlockStatus();
      await refreshBlockingCaches(targetUserId);
    } catch (error) {
      await mutateBlockStatus(previous, false);
      setActionError(
        error instanceof Error ? error.message : "Unable to update block status.",
      );
    } finally {
      setBlockActionLoading(false);
    }
  }, [blockActionLoading, blockStatus, mutateBlockStatus, targetUserId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 flex">
        <Sidebar />
        <div className="flex-1 ml-[60px] md:ml-72 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-500"></div>
        </div>
      </div>
    );
  }

  if (notFound) {
    return <NotFound withSidebar />;
  }

  if (error || !profileUser) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 flex">
        <Sidebar />
        <div className="flex-1 ml-[60px] md:ml-72 flex items-center justify-center">
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
      <div className="flex-1 ml-[60px] md:ml-72">
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
          onWatch={canUseFriendActions ? handleWatch : undefined}
          onMessage={canUseFriendActions ? handleMessage : undefined}
          onAcceptRequest={canUseFriendActions ? handleAcceptRequest : undefined}
          onIgnoreRequest={canUseFriendActions ? handleIgnoreRequest : undefined}
          friendLoading={friendLoading}
          isBlocked={isBlockedByMe}
          onToggleBlock={canUseFriendActions ? handleToggleBlock : undefined}
          blockActionLoading={blockActionLoading}
        />

        <div className="px-4 lg:px-6 py-6">
          {actionError ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
              {actionError}
            </div>
          ) : null}
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
                allGames={games}
                tournamentHistory={tournamentHistory}
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

