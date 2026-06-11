import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
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
import { useTranslation } from "react-i18next";
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
  const base = import.meta.env.VITE_API_URL;
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
  const { t } = useTranslation();
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

  const displayName = user?.fullName?.trim() || t("profileHeader.chessPlayer");
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
  const blockActionLabel = isBlocked
    ? t("profileHeader.actions.unblock")
    : t("profileHeader.actions.block");

  return (
    <div className="relative">
      <div className="px-4 lg:px-6 pt-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl border border-theme-glass/70 bg-gradient-to-br from-theme-panel via-theme-surface to-theme-base shadow-[0_12px_35px_rgba(15,23,42,0.08)] p-4 lg:p-5"
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
                <div className="w-40 h-40 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 shadow-[0_0_42px_rgba(20,184,166,0.28)] ring-4 ring-theme-border/70 overflow-hidden flex items-center justify-center text-theme-on-accent text-4xl font-bold">
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
                  <h1 className="text-3xl font-bold tracking-tight text-theme-foreground ">
                    {displayName}
                  </h1>

                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {isMe ? (
                    <>
                      <button
                        type="button"
                        onClick={() => navigate("/settings")}
                        className="px-4 py-2.5 rounded-lg border border-theme-glass/80 bg-theme-panel/85 hover:bg-theme-panel text-sm font-semibold text-theme-foreground inline-flex items-center gap-2 transition-colors"
                      >
                        <Settings size={16} />
                        {t("profileHeader.actions.editProfile")}
                      </button>
                    </>
                  ) : showVisitorActions ? (
                    <>
                      {canWatch ? (
                        <button
                          type="button"
                          onClick={onWatch}
                          className="px-4 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center gap-2 transition-colors bg-cyan-500/15 text-cyan-800 hover:bg-cyan-500/25 border border-cyan-500/30"
                          title={t("profileHeader.actions.watchTitle")}
                        >
                          <Eye size={16} />
                          {t("profileHeader.actions.watch")}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          if (canMessage) onMessage?.();
                        }}
                        disabled={!canMessage}
                        title={
                          isBlocked
                            ? t("profileHeader.actions.messageUnavailable")
                            : undefined
                        }
                        className={`px-4 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center gap-2 transition-colors ${
                          canMessage
                            ? "bg-indigo-600 hover:bg-indigo-700 text-theme-on-accent"
                            : "cursor-not-allowed bg-theme-surface text-theme-muted"
                        }`}
                      >
                        <MessageCircle size={16} />
                        {t("profileHeader.actions.message")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (canChallenge) onChallenge?.();
                        }}
                        disabled={!canChallenge}
                        title={
                          isBlocked
                            ? t("profileHeader.actions.challengeUnavailable")
                            : undefined
                        }
                        className={`px-4 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center gap-2 transition-colors ${
                          canChallenge
                            ? "bg-brand-600 hover:bg-brand-700 text-theme-on-accent shadow-[0_8px_20px_rgba(13,148,136,0.35)]"
                            : "cursor-not-allowed bg-theme-surface text-theme-muted"
                        }`}
                      >
                        <Swords size={16} />
                        {t("profileHeader.actions.challenge")}
                      </button>
                      {isBlocked ? (
                        <span className="inline-flex items-center gap-2 rounded-lg border border-red-300/70 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700">
                          {t("profileHeader.status.blocked")}
                        </span>
                      ) : relationship === "friends" ? (
                        <button
                          type="button"
                          onClick={onRemoveFriend}
                          disabled={friendLoading}
                          className="px-4 py-2.5 rounded-lg border border-brand-400/40 bg-brand-50/80 hover:bg-brand-100 text-sm font-semibold text-brand-700 inline-flex items-center gap-2 transition-colors disabled:opacity-50"
                        >
                          <UserCheck size={16} />
                          {t("profileHeader.status.friends")}
                        </button>
                      ) : relationship === "incoming_pending" ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onAcceptRequest?.()}
                            disabled={friendLoading}
                            className="px-4 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-sm font-semibold text-theme-on-accent inline-flex items-center gap-2 transition-colors disabled:opacity-50"
                          >
                            <UserCheck size={16} />
                            {t("profileHeader.actions.accept")}
                          </button>
                          <button
                            type="button"
                            onClick={() => onIgnoreRequest?.()}
                            disabled={friendLoading}
                            className="inline-flex items-center gap-2 rounded-lg border border-theme-border bg-theme-panel px-4 py-2.5 text-sm font-semibold text-theme-foreground transition-colors disabled:opacity-50"
                          >
                            <Hourglass size={16} />
                            {t("profileHeader.actions.ignore")}
                          </button>
                        </div>
                      ) : relationship === "outgoing_pending" ? (
                        <span className="inline-flex items-center gap-2 rounded-lg border border-theme-border bg-theme-panel px-4 py-2.5 text-sm font-semibold text-theme-foreground">
                          <Hourglass size={16} />
                          {t("profileHeader.status.requestSent")}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={onAddFriend}
                          disabled={friendLoading}
                          className="px-4 py-2.5 rounded-lg border border-theme-glass/80 bg-theme-panel/85 hover:bg-theme-panel text-sm font-semibold text-theme-foreground inline-flex items-center gap-2 transition-colors disabled:opacity-50"
                        >
                          <UserRoundPlus size={16} />
                          {t("profileHeader.actions.addFriend")}
                        </button>
                      )}
                      <div className="relative" ref={moreMenuRef}>
                        <button
                          type="button"
                          onClick={() => setIsMoreMenuOpen((value) => !value)}
                          className="w-10 h-10 rounded-lg border border-theme-glass/80 bg-theme-panel/85 hover:bg-theme-panel text-theme-muted inline-flex items-center justify-center transition-colors"
                          aria-label={t("profileHeader.actions.moreActions")}
                        >
                          <MoreHorizontal size={18} />
                        </button>
                        {isMoreMenuOpen && onToggleBlock ? (
                          <div className="absolute right-0 mt-2 w-52 rounded-lg border border-theme-glass bg-theme-panel shadow-lg p-1 z-50">
                            <button
                              type="button"
                              onClick={() => {
                                onToggleBlock();
                                setIsMoreMenuOpen(false);
                              }}
                              disabled={blockActionLoading}
                              className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-theme-surface disabled:opacity-60"
                            >
                              {blockActionLoading
                                ? t("profileHeader.actions.processing", {
                                    action: blockActionLabel,
                                  })
                                : `${blockActionLabel} ${displayName}`}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-theme-glass/70 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <span className="text-theme-muted">
                  {t("profileHeader.joined")}{" "}
                  <span className="text-theme-foreground ">
                    {memberSince}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-theme-muted">
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

          <div className="relative z-10 mt-5 border-t border-theme-glass/70 pt-4">
            <div className="flex gap-1.5 bg-theme-panel/70 border border-theme-glass/70 p-1 rounded-xl w-fit backdrop-blur">
              <button
                onClick={() => setActiveTab("overview")}
                className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                  activeTab === "overview"
                    ? "bg-theme-panel text-theme-foreground shadow-sm"
                    : "text-theme-muted hover:text-theme-foreground"
                }`}
              >
                <BarChart3 size={16} />
                {t("profileHeader.tabs.overview")}
              </button>
              <button
                onClick={() => setActiveTab("games")}
                className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                  activeTab === "games"
                    ? "bg-theme-panel text-theme-foreground shadow-sm"
                    : "text-theme-muted hover:text-theme-foreground"
                }`}
              >
                <History size={16} />
                {t("profileHeader.tabs.gameHistory")}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

