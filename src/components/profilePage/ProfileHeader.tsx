import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Calendar,
  BarChart3,
  History,
  MoreHorizontal,
  Swords,
  MessageCircle,
  UserRoundPlus,
  UserCheck,
  Settings,
  Hourglass,
  Eye,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ProfileStats, TabType } from "./types";
import { ProfileAvatarUpload } from "./ProfileAvatarUpload";
import { useFriendChallengeStore } from "../../store/friendChallengeStore";
import {
  PresenceStatus,
  presenceText,
  presenceDotClass,
} from "../../utils/presence";

export type Relationship = "self" | "none" | "friends" | "incoming_pending" | "outgoing_pending";
function resolveAvatarUrl(avatar?: string) {
  if (!avatar) return "";
  if (
    avatar.startsWith("http://") ||
    avatar.startsWith("https://") ||
    avatar.startsWith("data:") ||
    avatar.startsWith("blob:")
  ) {
    return avatar;
  }
  const base = import.meta.env.VITE_API_URL || "http://localhost:3001";
  return `${base}${avatar.startsWith("/") ? "" : "/"}${avatar}`;
}

interface ProfileHeaderProps {
  user: {
    fullName?: string;
    email?: string;
    avatar?: string;
    rating?: number;
    blitzRating?: number;
    gamesPlayed?: number;
    gamesWon?: number;
    presenceStatus?: PresenceStatus;
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
  } | null;
  stats: ProfileStats | null;
  memberSince: string;
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  isMe?: boolean;
  relationship?: Relationship;
  onAddFriend?: () => void;
  onRemoveFriend?: () => void;
  onChallenge?: () => void;
  onWatch?: () => void;
  onMessage?: () => void;
  onAcceptRequest?: () => void;
  onIgnoreRequest?: () => void;
  friendLoading?: boolean;
  isBlocked?: boolean;
  onToggleBlock?: () => void;
  blockActionLoading?: boolean;
}

export function ProfileHeader({
  user,
  stats,
  memberSince,
  activeTab,
  setActiveTab,
  isMe = false,
  relationship = "self",
  onAddFriend,
  onRemoveFriend,
  onChallenge,
  onWatch,
  onMessage,
  onAcceptRequest,
  onIgnoreRequest,
  friendLoading,
  isBlocked = false,
  onToggleBlock,
  blockActionLoading = false,
}: ProfileHeaderProps) {
  const navigate = useNavigate();
  const realtimePresence = useFriendChallengeStore((state) => state.presenceStatus);
  const realtimeLastSeenAt = useFriendChallengeStore((state) => state.lastSeenAt);
  const realtimeConnected = useFriendChallengeStore((state) => state.isConnected);
  const [clockTick, setClockTick] = useState(0);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockTick((value) => value + 1);
    }, 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isMoreMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!moreMenuRef.current) return;
      if (moreMenuRef.current.contains(event.target as Node)) return;
      setIsMoreMenuOpen(false);
    };
    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [isMoreMenuOpen]);

  const displayName = user?.fullName?.trim() || "Chess Player";
  const totalGames = Math.max(
    Number(stats?.total ?? 0),
    Number(user?.gamesPlayed ?? 0),
  );
  const totalWins = Math.max(
    Number(stats?.wins ?? 0),
    Number(user?.gamesWon ?? 0),
  );
  const winRate =
    typeof stats?.winRate === "number"
      ? stats.winRate
      : totalGames > 0
        ? Math.round((totalWins / totalGames) * 100)
        : 0;
  const effectiveStatus: PresenceStatus = useMemo(() => {
    if (isMe && realtimeConnected) {
      if (
        realtimePresence === "in_game" ||
        realtimePresence === "searching_match" ||
        realtimePresence === "away" ||
        realtimePresence === "online"
      ) {
        return realtimePresence;
      }
      return "online";
    }
    if (
      user?.presenceStatus === "in_game" ||
      user?.presenceStatus === "searching_match" ||
      user?.presenceStatus === "away" ||
      user?.presenceStatus === "online"
    ) {
      return user.presenceStatus;
    }
    return "offline";
  }, [isMe, realtimeConnected, realtimePresence, user?.presenceStatus]);

  const effectiveLastSeen = useMemo(() => {
    if (isMe && realtimeLastSeenAt) return realtimeLastSeenAt;
    return user?.lastSeenAt || null;
  }, [isMe, realtimeLastSeenAt, user?.lastSeenAt]);

  const lastActiveLabel = useMemo(
    () => presenceText(effectiveStatus, effectiveLastSeen),
    [clockTick, effectiveLastSeen, effectiveStatus],
  );
  const showVisitorActions =
    !isMe &&
    (!!onChallenge || !!onWatch || !!onAddFriend || !!onRemoveFriend || !!onMessage || !!onToggleBlock);
  const canChallenge = relationship === "friends" && !isBlocked;
  const canWatch = !isBlocked && !!onWatch && Boolean(user?.isWatchableInGame);
  const canMessage = !isBlocked && !!onMessage;
  const blockActionLabel = isBlocked ? "Unblock" : "Block";

  return (
    <div className="relative">
      <div className="px-4 lg:px-6 pt-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl border border-gray-200/70 dark:border-white/10 bg-gradient-to-br from-white via-gray-50 to-slate-100 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 shadow-[0_12px_35px_rgba(15,23,42,0.08)] dark:shadow-[0_22px_48px_rgba(0,0,0,0.5)] p-4 lg:p-5"
        >
          <div className="pointer-events-none absolute -top-20 -left-12 w-64 h-64 rounded-full bg-brand-400/15 blur-3xl" />
          <div className="relative z-10 flex flex-col xl:flex-row xl:items-start gap-5">
            <div className="flex-shrink-0">
              {isMe ? (
                <ProfileAvatarUpload
                  currentAvatar={user?.avatar}
                  userName={user?.fullName}
                  size="xl"
                  editable={true}
                />
              ) : (
                <div className="w-40 h-40 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 shadow-[0_0_42px_rgba(20,184,166,0.28)] ring-4 ring-white/70 dark:ring-black/30 overflow-hidden flex items-center justify-center text-white text-4xl font-bold">
                  {user?.avatar ? (
                    <img
                      src={resolveAvatarUrl(user.avatar)}
                      alt={displayName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    displayName.substring(0, 2).toUpperCase()
                  )}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                    {displayName}
                  </h1>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1.5">
                      <Calendar size={14} />
                      Member since {memberSince}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {isMe ? (
                    <>
                      <button
                        type="button"
                        onClick={() => navigate("/settings")}
                        className="px-4 py-2.5 rounded-lg border border-gray-300/80 dark:border-white/15 bg-white/85 dark:bg-black/25 hover:bg-white dark:hover:bg-black/35 text-sm font-semibold text-gray-900 dark:text-white inline-flex items-center gap-2 transition-colors"
                      >
                        <Settings size={16} />
                        Edit Profile
                      </button>
                    </>
                  ) : showVisitorActions ? (
                    <>
                      {canWatch ? (
                        <button
                          type="button"
                          onClick={onWatch}
                          className="px-4 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center gap-2 transition-colors bg-cyan-500/15 text-cyan-800 hover:bg-cyan-500/25 border border-cyan-500/30 dark:text-cyan-200"
                          title="Watch this player's live multiplayer game"
                        >
                          <Eye size={16} />
                          Watch
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          if (canMessage) onMessage?.();
                        }}
                        disabled={!canMessage}
                        title={isBlocked ? "Messaging is unavailable for blocked users." : undefined}
                        className={`px-4 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center gap-2 transition-colors ${
                          canMessage
                            ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                            : "cursor-not-allowed bg-slate-200 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400"
                        }`}
                      >
                        <MessageCircle size={16} />
                        Message
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (canChallenge) onChallenge?.();
                        }}
                        disabled={!canChallenge}
                        title={isBlocked ? "You cannot challenge this player." : undefined}
                        className={`px-4 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center gap-2 transition-colors ${
                          canChallenge
                            ? "bg-brand-600 hover:bg-brand-700 text-white shadow-[0_8px_20px_rgba(13,148,136,0.35)]"
                            : "cursor-not-allowed bg-slate-200 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400"
                        }`}
                      >
                        <Swords size={16} />
                        Challenge
                      </button>
                      {isBlocked ? (
                        <span className="inline-flex items-center gap-2 rounded-lg border border-red-300/70 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                          Blocked
                        </span>
                      ) : relationship === "friends" ? (
                        <button
                          type="button"
                          onClick={onRemoveFriend}
                          disabled={friendLoading}
                          className="px-4 py-2.5 rounded-lg border border-brand-400/40 bg-brand-50/80 dark:bg-brand-500/10 hover:bg-brand-100 dark:hover:bg-brand-500/20 text-sm font-semibold text-brand-700 dark:text-brand-300 inline-flex items-center gap-2 transition-colors disabled:opacity-50"
                        >
                          <UserCheck size={16} />
                          Friends
                        </button>
                      ) : relationship === "incoming_pending" ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onAcceptRequest?.()}
                            disabled={friendLoading}
                            className="px-4 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-sm font-semibold text-white inline-flex items-center gap-2 transition-colors disabled:opacity-50"
                          >
                            <UserCheck size={16} />
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => onIgnoreRequest?.()}
                            disabled={friendLoading}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors disabled:opacity-50 dark:border-slate-500/40 dark:bg-slate-800/70 dark:text-slate-200"
                          >
                            <Hourglass size={16} />
                            Ignore
                          </button>
                        </div>
                      ) : relationship === "outgoing_pending" ? (
                        <span className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-500/40 dark:bg-slate-800/70 dark:text-slate-200">
                          <Hourglass size={16} />
                          Request sent
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={onAddFriend}
                          disabled={friendLoading}
                          className="px-4 py-2.5 rounded-lg border border-gray-300/80 dark:border-white/15 bg-white/85 dark:bg-black/25 hover:bg-white dark:hover:bg-black/35 text-sm font-semibold text-gray-900 dark:text-white inline-flex items-center gap-2 transition-colors disabled:opacity-50"
                        >
                          <UserRoundPlus size={16} />
                          Add Friend
                        </button>
                      )}
                      <div className="relative" ref={moreMenuRef}>
                        <button
                          type="button"
                          onClick={() => setIsMoreMenuOpen((value) => !value)}
                          className="w-10 h-10 rounded-lg border border-gray-300/80 dark:border-white/15 bg-white/85 dark:bg-black/25 hover:bg-white dark:hover:bg-black/35 text-gray-700 dark:text-gray-200 inline-flex items-center justify-center transition-colors"
                          aria-label="More profile actions"
                        >
                          <MoreHorizontal size={18} />
                        </button>
                        {isMoreMenuOpen && onToggleBlock ? (
                          <div className="absolute right-0 mt-2 w-52 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-lg p-1 z-50">
                            <button
                              type="button"
                              onClick={() => {
                                onToggleBlock();
                                setIsMoreMenuOpen(false);
                              }}
                              disabled={blockActionLoading}
                              className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-60"
                            >
                              {blockActionLoading
                                ? `${blockActionLabel}ing...`
                                : `${blockActionLabel} ${displayName}`}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-200/70 dark:border-white/10 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <span className="text-gray-500 dark:text-gray-400">
                  Joined{" "}
                  <span className="text-gray-900 dark:text-white">
                    {memberSince}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                  <span
                    className={`inline-block w-2.5 h-2.5 rounded-full ${presenceDotClass(
                      effectiveStatus,
                    )}`}
                  />
                  {lastActiveLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="relative z-10 mt-5 border-t border-gray-200/70 dark:border-white/10 pt-4">
            <div className="flex gap-1.5 bg-white/70 dark:bg-black/20 border border-gray-200/70 dark:border-white/10 p-1 rounded-xl w-fit backdrop-blur">
              <button
                onClick={() => setActiveTab("overview")}
                className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                  activeTab === "overview"
                    ? "bg-white dark:bg-slate-900 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <BarChart3 size={16} />
                Overview
              </button>
              <button
                onClick={() => setActiveTab("games")}
                className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                  activeTab === "games"
                    ? "bg-white dark:bg-slate-900 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <History size={16} />
                Game History
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

