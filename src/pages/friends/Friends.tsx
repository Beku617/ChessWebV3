import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Eye,
  Hourglass,
  MessageCircle,
  Search,
  Swords,
  UserPlus,
  UserX,
  Users,
  type LucideIcon,
} from "lucide-react";
import Sidebar from "../../components/Sidebar";
import { useAuthStore } from "../../store/authStore";
import {
  useFriendStore,
  type FriendRequestItem,
  type FriendListItem,
  type FriendRelationship,
} from "../../store/friendStore";
import { fetchBlockStatus } from "../../features/blocking/api";
import i18n from "../../i18n";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

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
  return `${API_URL}${avatar.startsWith("/") ? "" : "/"}${avatar}`;
}

interface SearchResult {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  rating?: number;
  relation?:
    | FriendRelationship
    | "incoming_pending"
    | "outgoing_pending"
    | "friends"
    | "none";
  requestId?: string | null;
}

type PrimaryTab = "friends" | "incoming" | "outgoing";

function formatPresence(presence?: string, lastActiveAt?: string | null) {
  if (presence === "online") return i18n.t("presence.status.online");
  if (presence === "in_game") return i18n.t("presence.status.inGame");
  if (presence === "searching_match") return i18n.t("presence.status.searchingMatch");
  if (presence === "away") return i18n.t("presence.status.away");
  if (!lastActiveAt) return i18n.t("presence.status.offline");
  const d = new Date(lastActiveAt);
  if (Number.isNaN(d.getTime())) return i18n.t("presence.status.offline");
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return i18n.t("presence.justNow");
  if (mins < 60) return i18n.t("presence.minutesAgo", { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return i18n.t("presence.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  return i18n.t("presence.daysAgo", { count: days });
}

function formatDateDistance(value?: string | null) {
  if (!value) return i18n.t("friendsPage.time.earlier");
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return i18n.t("friendsPage.time.earlier");
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return i18n.t("presence.justNow");
  if (mins < 60) return i18n.t("presence.minutesAgo", { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 48) return i18n.t("presence.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 14) return i18n.t("presence.daysAgo", { count: days });
  return d.toLocaleDateString();
}

function StatusBadge({ status }: { status: FriendRequestItem["status"] }) {
  const map: Record<string, { label: string; color: string }> = {
    accepted: {
      label: i18n.t("friendsPage.requestStatus.accepted"),
      color: "bg-brand-500/15 text-brand-300 border-brand-500/30",
    },
    denied: {
      label: i18n.t("friendsPage.requestStatus.denied"),
      color: "bg-red-500/10 text-red-300 border-red-500/30",
    },
    ignored: {
      label: i18n.t("friendsPage.requestStatus.ignored"),
      color: "bg-slate-500/10 text-slate-300 border-slate-500/30",
    },
    canceled: {
      label: i18n.t("friendsPage.requestStatus.canceled"),
      color: "bg-amber-500/10 text-amber-200 border-amber-500/30",
    },
    pending: {
      label: i18n.t("friendsPage.requestStatus.pending"),
      color: "bg-brand-500/10 text-brand-200 border-brand-500/30",
    },
  };
  const style = map[status] || map.pending;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold border ${style.color}`}
    >
      <Hourglass className="w-3 h-3" />
      {style.label}
    </span>
  );
}

const shellClass =
  "theme-glass-panel-strong rounded-2xl";

function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-gradient-to-b from-[#0c1524]/88 to-[#0b1220]/72 px-4 py-8 text-center shadow-[0_16px_40px_rgba(0,0,0,0.24)] ring-1 ring-[#0d1523]/18">
      <div className="text-sm font-semibold text-slate-100">{title}</div>
      {description && (
        <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}

function SummaryStat({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-xl bg-[#0b1424]/75 px-3 py-2 shadow-[0_10px_24px_rgba(0,0,0,0.2)] ring-1 ring-[#132035]/18">
      <div className="w-8 h-8 rounded-lg bg-[#0f1c30] ring-1 ring-[#16243a]/28 flex items-center justify-center text-brand-200">
        <Icon className="w-4 h-4" />
      </div>
      <div className="leading-tight">
        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
          {label}
        </div>
        <div className="text-sm font-semibold text-slate-100">{value}</div>
      </div>
    </div>
  );
}

function TabButton({
  id,
  label,
  count,
  activeTab,
  onSelect,
}: {
  id: PrimaryTab;
  label: string;
  count?: number;
  activeTab: PrimaryTab;
  onSelect: (id: PrimaryTab) => void;
}) {
  const isActive = activeTab === id;
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={`relative inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
        isActive
          ? "bg-gradient-to-br from-[#0f2536] via-[#0c1c2f] to-[#0d1e33] text-brand-100 shadow-[0_8px_18px_rgba(0,0,0,0.28)] ring-1 ring-[#132036]/32"
          : "bg-[#0b1322]/70 text-slate-300 hover:bg-[#0f1c30] ring ring-transparent hover:ring-[#0f1b2d]/24"
      }`}
    >
      <span>{label}</span>
      {typeof count === "number" && (
        <span
          className={`min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-semibold flex items-center justify-center ${
            isActive
              ? "bg-brand-500/20 text-brand-100 border border-brand-500/25"
              : "bg-[#162239] text-slate-300/90"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export default function Friends() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    friends,
    incoming,
    outgoing,
    loading,
    sendRequest,
    acceptRequest,
    denyRequest,
    cancelRequest,
    removeFriend,
    loadAll,
    getRelationship,
  } = useFriendStore();

  const [friendFilter, setFriendFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PrimaryTab>("friends");

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filteredFriends = useMemo(() => {
    const q = friendFilter.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((f) => f.name.toLowerCase().includes(q));
  }, [friendFilter, friends]);

  const pendingIncoming = useMemo(
    () => incoming.filter((r) => r.status === "pending"),
    [incoming],
  );
  const pendingOutgoing = useMemo(
    () => outgoing.filter((r) => r.status === "pending"),
    [outgoing],
  );

  const handleSearchUsers = async () => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    try {
      setSearching(true);
      setSearchError(null);
      const res = await fetch(
        `${API_URL}/api/friends/search?q=${encodeURIComponent(q)}`,
        { credentials: "include" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || t("friendsPage.errors.searchFailed"));
      }
      const results = Array.isArray(data.results) ? data.results : [];
      setSearchResults(
        results.map((r: any) => ({
          id: String(r.id),
          name: r.name,
          email: r.email,
          avatar: resolveAvatarUrl(r.avatar),
          rating: r.rating,
          relation: r.relation || "none",
          requestId: r.requestId || null,
        })),
      );
    } catch (error) {
      console.error(error);
      setSearchError(t("friendsPage.errors.searchFailedRetry"));
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSendRequest = async (targetId: string) => {
    try {
      setActionId(targetId);
      const status = await fetchBlockStatus(targetId);
      if (status.isAnyBlocked || status.isBlocked || status.isBlockedByTarget) {
        setSearchError(t("friendsPage.errors.cannotSendRequestBlocked"));
        return;
      }
      await sendRequest(targetId);
      setSearchError(null);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : t("friendsPage.errors.sendRequestFailed");
      setSearchError(msg);
    } finally {
      setActionId(null);
    }
  };

  const handleAccept = async (requestId: string) => {
    setActionId(requestId);
    try {
      await acceptRequest(requestId);
      setSearchError(null);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : t("friendsPage.errors.acceptFailed");
      setSearchError(msg);
    } finally {
      setActionId(null);
    }
  };

  const handleMessageFriend = async (friend: FriendListItem) => {
    try {
      setActionId(friend.id);
      const status = await fetchBlockStatus(friend.id);
      if (status.isAnyBlocked || status.isBlocked || status.isBlockedByTarget) {
        setSearchError(t("friendsPage.errors.messageUnavailable"));
        return;
      }
      navigate(
        `/messages?chat=${encodeURIComponent(friend.id)}&name=${encodeURIComponent(friend.name)}`,
      );
    } catch {
      setSearchError(t("friendsPage.errors.messageUnavailable"));
    } finally {
      setActionId(null);
    }
  };

  const handleChallengeFriend = async (friend: FriendListItem) => {
    try {
      setActionId(friend.id);
      const status = await fetchBlockStatus(friend.id);
      if (status.isAnyBlocked || status.isBlocked || status.isBlockedByTarget) {
        setSearchError(t("friendsPage.errors.challengeUnavailable"));
        return;
      }
      navigate("/play/friend", {
        state: {
          preselectedFriendId: friend.id,
          preselectedFriendName: friend.name,
        },
      });
    } catch {
      setSearchError(t("friendsPage.errors.challengeUnavailable"));
    } finally {
      setActionId(null);
    }
  };

  const handleWatchFriend = (friend: FriendListItem) => {
    const gameId = String(friend.watchableGame?.gameId || "").trim();
    if (!gameId) return;
    navigate(`/watch/${encodeURIComponent(gameId)}`);
  };

  const handleDeny = async (requestId: string) => {
    setActionId(requestId);
    try {
      await denyRequest(requestId);
      setSearchError(null);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : t("friendsPage.errors.denyFailed");
      setSearchError(msg);
    } finally {
      setActionId(null);
    }
  };

  const handleCancel = async (requestId: string) => {
    setActionId(requestId);
    try {
      await cancelRequest(requestId);
      setSearchError(null);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : t("friendsPage.errors.cancelFailed");
      setSearchError(msg);
    } finally {
      setActionId(null);
    }
  };

  const handleUnfriend = async (friendId: string) => {
    setActionId(friendId);
    try {
      await removeFriend(friendId);
      setSearchError(null);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : t("friendsPage.errors.unfriendFailed");
      setSearchError(msg);
    } finally {
      setActionId(null);
    }
  };

  const renderRequestCard = (
    req: FriendRequestItem,
    type: "incoming" | "outgoing",
  ) => {
    const disabled = actionId === req.id;
    const accent =
      type === "incoming"
        ? "ring-1 ring-[#0f253a]/18 bg-gradient-to-br from-[#0c1f30]/88 via-[#0c1829] to-[#0b1424]"
        : "ring-1 ring-[#0f1c2e]/16 bg-gradient-to-br from-[#0b1220] via-[#0b111d] to-[#0a0f1a]";
    const subtitle =
      type === "incoming"
        ? t("friendsPage.requestSubtitle.wantsToConnect")
        : t("friendsPage.requestSubtitle.awaitingResponse");
    return (
      <div
        key={req.id}
        className={`flex items-start justify-between gap-3 rounded-xl px-4 py-3.5 shadow-[0_14px_30px_rgba(0,0,0,0.3)] ${accent}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative w-11 h-11 rounded-full overflow-hidden bg-[#132033] ring-1 ring-[#1f2c45]">
            {req.userAvatar ? (
              <img
                src={req.userAvatar}
                alt={req.userName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm font-semibold text-brand-100">
                {req.userName.substring(0, 2).toUpperCase()}
              </div>
            )}
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-brand-400 border border-[#0c1424]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-sm font-semibold text-slate-100 truncate leading-tight">
                {req.userName}
              </div>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#13243a] text-slate-200 border border-[#1f2c45]">
                {type === "incoming"
                  ? t("friendsPage.incomingRequests")
                  : t("friendsPage.outgoingRequests")}
              </span>
            </div>
            <div className="text-xs text-slate-400 leading-relaxed flex items-center gap-2 flex-wrap">
              <span>{subtitle}</span>
              <span className="text-slate-600">•</span>
              <span>{formatDateDistance(req.createdAt)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {type === "incoming" ? (
            <>
              <button
                onClick={() => void handleAccept(req.id)}
                disabled={disabled}
                className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-500 disabled:opacity-60 transition-colors shadow-[0_10px_24px_rgba(13,148,136,0.28)]"
              >
                {t("Accept")}
              </button>
              <button
                onClick={() => void handleDeny(req.id)}
                disabled={disabled}
                className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-300 text-xs font-semibold hover:bg-red-500/10 disabled:opacity-60 transition-colors"
              >
                {t("friendsPage.actions.deny")}
              </button>
            </>
          ) : (
            <>
              <StatusBadge status={req.status} />
              {req.status === "pending" && (
                <button
                  onClick={() => void handleCancel(req.id)}
                  disabled={disabled}
                  className="px-3 py-1.5 rounded-lg border border-slate-600/60 text-slate-300 text-xs font-semibold hover:bg-slate-700/40 disabled:opacity-60 transition-colors"
                >
                  {t("Cancel")}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  const renderFriendRow = (friend: FriendListItem) => {
    const disabled = actionId === friend.id;
    return (
      <div
        key={friend.id}
        className="flex items-center justify-between gap-4 rounded-xl bg-gradient-to-br from-[#0d1628] via-[#0c1424] to-[#0c182d] px-4 py-3.5 hover:ring-1 hover:ring-[#11324b]/24 hover:bg-[#122036]/85 transition-all shadow-[0_12px_30px_rgba(0,0,0,0.26)]"
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            className="w-11 h-11 rounded-full overflow-hidden bg-gradient-to-br from-brand-600 to-brand-500 text-white font-bold ring-1 ring-brand-500/40"
            onClick={() => navigate(`/u/${friend.id}`)}
            title={t("nav.viewProfile")}
          >
            {friend.avatar ? (
              <img
                src={friend.avatar}
                alt={friend.name}
                className="w-full h-full object-cover"
              />
            ) : (
              friend.name.substring(0, 2).toUpperCase()
            )}
          </button>
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <div
                className="text-sm font-semibold text-slate-100 truncate cursor-pointer hover:text-brand-200"
                onClick={() => navigate(`/u/${friend.id}`)}
              >
                {friend.name}
              </div>
              {typeof friend.rating === "number" && (
                <span className="px-2 py-0.5 rounded-lg border border-[#1f2c45] bg-[#102138] text-[11px] text-slate-200">
                  {friend.rating}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-brand-400" />
                {formatPresence(friend.presenceStatus, friend.lastActiveAt)}
              </span>
              {friend.isWatchableInGame && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-cyan-400/35 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-200"
                  title={t("friendsPage.actions.watchLiveTitle")}
                >
                  <Eye className="w-3 h-3" />
                  {t("Watch")}
                </span>
              )}
              {friend.since && (
                <span className="text-slate-500">
                  • {t("Friends since")} {new Date(friend.since).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {friend.isWatchableInGame && friend.watchableGame?.gameId && (
            <button
              disabled={disabled}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/15 text-cyan-200 border border-cyan-500/30 hover:bg-cyan-500/25"
              onClick={() => handleWatchFriend(friend)}
              title={t("friendsPage.actions.watchCurrentGame")}
            >
              <Eye className="w-4 h-4 inline-block mr-1" />
              {t("Watch")}
            </button>
          )}
          <button
            disabled={disabled}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-500/15 text-brand-200 border border-brand-500/30 hover:bg-brand-500/25"
            onClick={() => void handleMessageFriend(friend)}
            title={t("friendsPage.actions.sendDirectMessage")}
          >
            <MessageCircle className="w-4 h-4 inline-block mr-1" />
            {t("Message")}
          </button>
          <button
            disabled={disabled}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/15 text-cyan-200 border border-cyan-500/30 hover:bg-cyan-500/25"
            onClick={() => void handleChallengeFriend(friend)}
            title={t("friendsPage.actions.challengeFriend")}
          >
            <Swords className="w-4 h-4 inline-block mr-1" />
            {t("friendsPage.actions.challenge")}
          </button>
          <button
            onClick={() => void handleUnfriend(friend.id)}
            disabled={disabled}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 text-red-300 border border-red-500/30 hover:bg-red-500/15 disabled:opacity-60"
          >
            <UserX className="w-4 h-4 inline-block mr-1" />
            {t("Unfriend")}
          </button>
        </div>
      </div>
    );
  };

  const renderSearchActionButton = (result: SearchResult) => {
    const relation =
      getRelationship(result.id) !== "none"
        ? getRelationship(result.id)
        : result.relation || "none";
    const isProcessing = actionId === result.id;

    if (relation === "friends") {
      return (
        <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-500/15 text-brand-200 border border-brand-500/30">
          {t("Friends")}
        </span>
      );
    }
    if (relation === "incoming_pending" && result.requestId) {
      return (
        <button
          onClick={() => void handleAccept(result.requestId!)}
          disabled={isProcessing}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-60 shadow-[0_10px_24px_rgba(13,148,136,0.28)]"
        >
          {t("Accept")}
        </button>
      );
    }
    if (relation === "outgoing_pending") {
      return (
        <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700/40 text-slate-200 border border-slate-600/50">
          {t("profileHeader.status.requestSent")}
        </span>
      );
    }
    if (result.id === user?.id) {
      return (
        <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700/40 text-slate-300 border border-slate-600/50">
          {t("friendsPage.status.thatsYou")}
        </span>
      );
    }
    return (
      <button
        onClick={() => void handleSendRequest(result.id)}
        disabled={isProcessing}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-60 shadow-[0_10px_24px_rgba(13,148,136,0.28)]"
      >
        {t("Add Friend")}
      </button>
    );
  };

  const tabItems: Array<{ id: PrimaryTab; label: string; count: number }> = [
    { id: "friends", label: t("Friends"), count: friends.length },
    {
      id: "incoming",
      label: t("friendsPage.incomingRequests"),
      count: pendingIncoming.length,
    },
    {
      id: "outgoing",
      label: t("friendsPage.outgoingRequests"),
      count: pendingOutgoing.length,
    },
  ];

  return (
    <div className="min-h-screen bg-transparent text-slate-100 flex">
      <Sidebar />
      <main className="flex-1 ml-[60px] md:ml-72 px-5 md:px-8 lg:px-10 py-7 space-y-6">
        <header className="space-y-3">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold text-slate-50 sr-only">
                Friends
              </h1>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-[1.75fr_1fr] gap-5 lg:gap-6">
          <section
            className={`${shellClass} px-4 py-4 md:px-6 md:py-5 space-y-5`}
          >
            <div className="flex flex-col gap-2">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-100">
                  {t("friendsPage.relationshipStates")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-[#0c1526]/82 px-1.5 py-1.5 shadow-[0_8px_18px_rgba(0,0,0,0.22)]">
                {tabItems.map((tab) => (
                  <TabButton
                    key={tab.id}
                    id={tab.id}
                    label={tab.label}
                    count={tab.count}
                    activeTab={activeTab}
                    onSelect={setActiveTab}
                  />
                ))}
              </div>
            </div>

            {activeTab === "friends" && (
              <div className="space-y-4">
                <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
                  <div className="flex-1 flex items-center gap-3 rounded-xl bg-[#0f1b2f]/95 px-3 py-2.5 shadow-[0_8px_16px_rgba(0,0,0,0.14)]">
                    <Search className="w-4 h-4 text-slate-500" />
                    <input
                      value={friendFilter}
                      onChange={(e) => setFriendFilter(e.target.value)}
                      placeholder={t("friendsPage.filterPlaceholder")}
                      className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 outline-none"
                    />
                  </div>
                  <div className="text-xs text-slate-500 px-1.5">
                    {t("friendsPage.totalCount", { count: friends.length })}
                  </div>
                </div>
                {loading ? (
                  <EmptyState
                    title={t("Loading friends...")}
                    description={t("friendsPage.fetchingCircle")}
                  />
                ) : filteredFriends.length === 0 ? (
                  <EmptyState
                    title={t("friendsPage.emptyListTitle")}
                    description={t("friendsPage.emptyListDescription")}
                  />
                ) : (
                  <div className="space-y-2.5">
                    {filteredFriends.map(renderFriendRow)}
                  </div>
                )}
              </div>
            )}

            {activeTab === "incoming" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-sm text-slate-300">{t("friendsPage.incomingRequests")}</p>
                  <span className="text-xs text-slate-500">{t("friendsPage.newestFirst")}</span>
                </div>
                {loading ? (
                  <EmptyState
                    title={t("friendsPage.loadingIncoming")}
                  />
                ) : pendingIncoming.length === 0 ? (
                  <EmptyState
                    title={t("friendsPage.noIncoming")}
                    description={t("friendsPage.noIncomingDescription")}
                  />
                ) : (
                  <div className="space-y-2.5">
                    {pendingIncoming.map((req) =>
                      renderRequestCard(req, "incoming"),
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === "outgoing" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-sm text-slate-300">{t("friendsPage.outgoingRequests")}</p>
                  <span className="text-xs text-slate-500">
                    {t("friendsPage.requestSubtitle.awaitingResponse")}
                  </span>
                </div>
                {loading ? (
                  <EmptyState
                    title={t("friendsPage.loadingOutgoing")}
                  />
                ) : pendingOutgoing.length === 0 ? (
                  <EmptyState
                    title={t("friendsPage.noOutgoing")}
                    description={t("friendsPage.noOutgoingDescription")}
                  />
                ) : (
                  <div className="space-y-2.5">
                    {pendingOutgoing.map((req) =>
                      renderRequestCard(req, "outgoing"),
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          <aside
            className={`${shellClass} px-4 py-4 md:px-5 md:py-5 space-y-4`}
          >
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-100">
                {t("friendsPage.addFriends")}
              </p>
              <p className="text-xs text-slate-400">
                {t("friendsPage.addFriendsDescription")}
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2 items-stretch">
                <div className="flex-1 flex items-center gap-3 rounded-xl bg-[#0f1b2f]/95 px-3 py-2.5 shadow-[0_8px_18px_rgba(0,0,0,0.16)]">
                  <Search className="w-4 h-4 text-slate-500" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleSearchUsers();
                      }
                    }}
                    placeholder={t("friendsPage.findByNameOrEmail")}
                    className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 outline-none"
                  />
                </div>
                <button
                  onClick={() => void handleSearchUsers()}
                  disabled={searching}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 text-white font-semibold text-sm hover:bg-brand-500 disabled:opacity-60 shadow-[0_12px_28px_rgba(13,148,136,0.35)]"
                >
                  <UserPlus className="w-4 h-4" />
                  {searching ? t("Searching...") : t("Search")}
                </button>
              </div>
              {searchError && (
                <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  {searchError}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-transparent bg-[#0c1627]/60 p-3 space-y-2 max-h-[480px] overflow-y-auto premium-scrollbar shadow-[0_10px_26px_rgba(0,0,0,0.2)]">
              {searching ? (
                <EmptyState
                  title={t("Searching...")}
                  description={t("friendsPage.searchingAcrossPlatform")}
                />
              ) : searchResults.length === 0 ? (
                <EmptyState
                  title={t("friendsPage.findPlayers")}
                  description={t("friendsPage.findPlayersDescription")}
                />
              ) : (
                searchResults.map((result) => (
                  <div
                    key={result.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-transparent bg-[#0f1b2f]/82 px-3 py-2.5 shadow-[0_8px_18px_rgba(0,0,0,0.18)]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-600 to-brand-500 text-white text-sm font-bold overflow-hidden flex items-center justify-center shrink-0"
                        onClick={() => navigate(`/u/${result.id}`)}
                      >
                        {result.avatar ? (
                          <img
                            src={result.avatar}
                            alt={result.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          result.name.substring(0, 2).toUpperCase()
                        )}
                      </button>
                      <div className="min-w-0">
                        <div
                          className="text-sm font-semibold text-slate-100 truncate cursor-pointer hover:text-brand-200"
                          onClick={() => navigate(`/u/${result.id}`)}
                        >
                          {result.name}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          {result.email || t("friendsPage.noEmailProvided")}
                        </div>
                      </div>
                    </div>
                    {renderSearchActionButton(result)}
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
