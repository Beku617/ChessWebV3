import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Hourglass, MessageCircle, Search, Swords, UserPlus, UserX } from "lucide-react";
import Sidebar from "../../components/Sidebar";
import { useAuthStore } from "../../store/authStore";
import {
  useFriendStore,
  type FriendRequestItem,
  type FriendListItem,
  type FriendRelationship,
} from "../../store/friendStore";

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
  relation?: FriendRelationship | "incoming_pending" | "outgoing_pending" | "friends" | "none";
  requestId?: string | null;
}

function formatPresence(presence?: string, lastActiveAt?: string | null) {
  if (presence === "online") return "Online";
  if (presence === "in_game") return "In game";
  if (presence === "searching_match") return "Searching";
  if (presence === "away") return "Away";
  if (!lastActiveAt) return "Offline";
  const d = new Date(lastActiveAt);
  if (Number.isNaN(d.getTime())) return "Offline";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function StatusBadge({ status }: { status: FriendRequestItem["status"] }) {
  const map: Record<string, { label: string; color: string }> = {
    accepted: { label: "Accepted", color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
    denied: { label: "Denied", color: "bg-red-500/10 text-red-300 border-red-500/30" },
    ignored: { label: "Ignored", color: "bg-slate-500/10 text-slate-300 border-slate-500/30" },
    canceled: { label: "Canceled", color: "bg-amber-500/10 text-amber-200 border-amber-500/30" },
    pending: { label: "Pending", color: "bg-teal-500/10 text-teal-200 border-teal-500/30" },
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

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#1f2c45] bg-gradient-to-br from-[#0c1424] via-[#0b1220] to-[#0d1629] shadow-[0_24px_60px_rgba(0,0,0,0.55)] p-4 md:p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export default function Friends() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    friends,
    incoming,
    outgoing,
    history,
    loading,
    sendRequest,
    acceptRequest,
    denyRequest,
    ignoreRequest,
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

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filteredFriends = useMemo(() => {
    const q = friendFilter.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((f) => f.name.toLowerCase().includes(q));
  }, [friendFilter, friends]);

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
        throw new Error(data.error || "Search failed");
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
      setSearchError("Search failed. Try again.");
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSendRequest = async (targetId: string) => {
    try {
      setActionId(targetId);
      await sendRequest(targetId);
      setSearchError(null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to send request";
      setSearchError(msg);
    } finally {
      setActionId(null);
    }
  };

  const handleAccept = async (requestId: string) => {
    setActionId(requestId);
    try {
      await acceptRequest(requestId);
    } finally {
      setActionId(null);
    }
  };

  const handleDeny = async (requestId: string) => {
    setActionId(requestId);
    try {
      await denyRequest(requestId);
    } finally {
      setActionId(null);
    }
  };

  const handleIgnore = async (requestId: string) => {
    setActionId(requestId);
    try {
      await ignoreRequest(requestId);
    } finally {
      setActionId(null);
    }
  };

  const handleCancel = async (requestId: string) => {
    setActionId(requestId);
    try {
      await cancelRequest(requestId);
    } finally {
      setActionId(null);
    }
  };

  const handleUnfriend = async (friendId: string) => {
    setActionId(friendId);
    try {
      await removeFriend(friendId);
    } finally {
      setActionId(null);
    }
  };

  const renderRequestCard = (req: FriendRequestItem, type: "incoming" | "outgoing") => {
    const disabled = actionId === req.id;
    const accent =
      type === "incoming"
        ? "from-emerald-500/15 to-teal-500/10 border-emerald-500/20"
        : "from-slate-500/10 to-slate-700/10 border-slate-600/30";
    return (
      <div
        key={req.id}
        className={`flex items-center justify-between gap-3 rounded-xl border ${accent} bg-gradient-to-br px-3 py-3`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative w-11 h-11 rounded-full overflow-hidden bg-[#132033] ring-1 ring-[#1f2c45]">
            {req.userAvatar ? (
              <img src={req.userAvatar} alt={req.userName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm font-semibold text-teal-100">
                {req.userName.substring(0, 2).toUpperCase()}
              </div>
            )}
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-[#0c1424]" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-100 truncate">
              {req.userName}
            </div>
            <div className="text-xs text-slate-400">
              {type === "incoming" ? "Wants to connect" : "Awaiting response"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {type === "incoming" ? (
            <>
              <button
                onClick={() => void handleAccept(req.id)}
                disabled={disabled}
                className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-500 disabled:opacity-60"
              >
                Accept
              </button>
              <button
                onClick={() => void handleDeny(req.id)}
                disabled={disabled}
                className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-300 text-xs font-semibold hover:bg-red-500/10 disabled:opacity-60"
              >
                Deny
              </button>
              <button
                onClick={() => void handleIgnore(req.id)}
                disabled={disabled}
                className="px-3 py-1.5 rounded-lg border border-slate-600/50 text-slate-300 text-xs font-semibold hover:bg-slate-700/40 disabled:opacity-60"
              >
                Ignore
              </button>
            </>
          ) : (
            <>
              <StatusBadge status={req.status} />
              {req.status === "pending" && (
                <button
                  onClick={() => void handleCancel(req.id)}
                  disabled={disabled}
                  className="px-3 py-1.5 rounded-lg border border-slate-600/50 text-slate-300 text-xs font-semibold hover:bg-slate-700/40 disabled:opacity-60"
                >
                  Cancel
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
        className="flex items-center justify-between gap-4 rounded-xl border border-[#1f2c45] bg-[#0d1729]/80 px-3 py-3 hover:border-teal-500/30 hover:bg-[#112038]/90 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            className="w-11 h-11 rounded-full overflow-hidden bg-gradient-to-br from-teal-600 to-emerald-500 text-white font-bold"
            onClick={() => navigate(`/u/${friend.id}`)}
            title="View profile"
          >
            {friend.avatar ? (
              <img src={friend.avatar} alt={friend.name} className="w-full h-full object-cover" />
            ) : (
              friend.name.substring(0, 2).toUpperCase()
            )}
          </button>
          <div className="min-w-0">
            <div
              className="text-sm font-semibold text-slate-100 truncate cursor-pointer hover:text-teal-200"
              onClick={() => navigate(`/u/${friend.id}`)}
            >
              {friend.name}
            </div>
            <div className="text-xs text-slate-400 flex items-center gap-2">
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                {formatPresence(friend.presenceStatus, friend.lastActiveAt)}
              </span>
              {friend.since && (
                <span className="text-slate-500">• Friends since {new Date(friend.since).toLocaleDateString()}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-500/15 text-teal-200 border border-teal-500/30 hover:bg-teal-500/25"
            onClick={() =>
              navigate(`/messages?chat=${encodeURIComponent(friend.id)}&name=${encodeURIComponent(friend.name)}`)
            }
          >
            <MessageCircle className="w-4 h-4 inline-block mr-1" />
            Message
          </button>
          <button
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/15 text-cyan-200 border border-cyan-500/30 hover:bg-cyan-500/25"
            onClick={() => navigate("/play/friend")}
          >
            <Swords className="w-4 h-4 inline-block mr-1" />
            Challenge
          </button>
          <button
            onClick={() => void handleUnfriend(friend.id)}
            disabled={disabled}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 text-red-300 border border-red-500/30 hover:bg-red-500/15 disabled:opacity-60"
          >
            <UserX className="w-4 h-4 inline-block mr-1" />
            Unfriend
          </button>
        </div>
      </div>
    );
  };

  const renderSearchActionButton = (result: SearchResult) => {
    const relation = getRelationship(result.id) !== "none" ? getRelationship(result.id) : result.relation || "none";
    const isProcessing = actionId === result.id;

    if (relation === "friends") {
      return (
        <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-200 border border-emerald-500/30">
          Friends
        </span>
      );
    }
    if (relation === "incoming_pending" && result.requestId) {
      return (
        <button
          onClick={() => void handleAccept(result.requestId!)}
          disabled={isProcessing}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-60"
        >
          Accept
        </button>
      );
    }
    if (relation === "outgoing_pending") {
      return (
        <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700/40 text-slate-200 border border-slate-600/50">
          Request sent
        </span>
      );
    }
    if (result.id === user?.id) {
      return (
        <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700/40 text-slate-300 border border-slate-600/50">
          That’s you
        </span>
      );
    }
    return (
      <button
        onClick={() => void handleSendRequest(result.id)}
        disabled={isProcessing}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-60"
      >
        Add Friend
      </button>
    );
  };

  const totalFriends = friends.length;
  const totalIncoming = incoming.filter((r) => r.status === "pending").length;
  const totalOutgoing = outgoing.filter((r) => r.status === "pending").length;

  return (
    <div className="min-h-screen bg-[#060b16] text-slate-100 flex">
      <Sidebar />
      <main className="flex-1 ml-72 px-5 md:px-7 lg:px-9 py-6 space-y-6">
        <header className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-teal-300/80">NeonGambit Social</p>
              <h1 className="text-3xl font-bold text-white">Friends</h1>
              <p className="text-sm text-slate-400">Requests update in real time while keeping the classic NeonGambit polish.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="px-3 py-2 rounded-xl border border-teal-500/30 bg-teal-500/10 text-sm font-semibold text-teal-200">
                {totalFriends} Friends
              </div>
              <div className="px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-sm font-semibold text-amber-200">
                {totalIncoming} Incoming
              </div>
              <div className="px-3 py-2 rounded-xl border border-slate-500/40 bg-slate-500/10 text-sm font-semibold text-slate-200">
                {totalOutgoing} Outgoing
              </div>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_1.35fr] gap-5 lg:gap-6">
          <div className="space-y-4">
            <SectionCard title="Incoming requests" subtitle="Accept, deny, or ignore pending invites">
              {loading ? (
                <div className="rounded-xl border border-[#1f2c45] bg-[#0e182b]/70 px-4 py-5 text-sm text-slate-400">
                  Loading incoming requests...
                </div>
              ) : incoming.filter((r) => r.status === "pending").length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#1f2c45] bg-[#0e182b]/60 px-4 py-5 text-sm text-slate-400">
                  No incoming requests right now.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {incoming
                    .filter((r) => r.status === "pending")
                    .map((req) => renderRequestCard(req, "incoming"))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Outgoing requests" subtitle="Requests you have sent">
              {loading ? (
                <div className="rounded-xl border border-[#1f2c45] bg-[#0e182b]/70 px-4 py-5 text-sm text-slate-400">
                  Loading outgoing requests...
                </div>
              ) : outgoing.filter((r) => r.status === "pending").length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#1f2c45] bg-[#0e182b]/60 px-4 py-5 text-sm text-slate-400">
                  No outgoing requests.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {outgoing
                    .filter((r) => r.status === "pending")
                    .map((req) => renderRequestCard(req, "outgoing"))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="History" subtitle="Processed requests stay tidy here">
              {history.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#1f2c45] bg-[#0e182b]/60 px-4 py-5 text-sm text-slate-400">
                  No processed requests yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {history.slice(0, 8).map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between rounded-xl border border-[#1f2c45] bg-[#0d1525]/70 px-3 py-2.5"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-[#132033] text-xs font-semibold text-teal-100 flex items-center justify-center overflow-hidden">
                          {req.userAvatar ? (
                            <img src={req.userAvatar} alt={req.userName} className="w-full h-full object-cover" />
                          ) : (
                            req.userName.substring(0, 2).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-100 truncate">{req.userName}</div>
                          <div className="text-xs text-slate-500">
                            {req.direction === "incoming" ? "You responded" : "Their response"}
                          </div>
                        </div>
                      </div>
                      <StatusBadge status={req.status} />
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <div className="space-y-4">
            <SectionCard title="Add friends" subtitle="Search players by name or email">
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleSearchUsers();
                      }
                    }}
                    placeholder="Username or email"
                    className="w-full rounded-xl bg-[#0f1b2f] border border-[#1f2c45] text-sm text-slate-100 pl-10 pr-3 py-2.5 placeholder:text-slate-500 focus:border-teal-400 focus:ring-2 focus:ring-teal-500/30 outline-none"
                  />
                </div>
                <button
                  onClick={() => void handleSearchUsers()}
                  disabled={searching}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 text-white font-semibold text-sm hover:bg-teal-500 disabled:opacity-60"
                >
                  <UserPlus className="w-4 h-4" />
                  {searching ? "Searching..." : "Search"}
                </button>
              </div>
              {searchError && (
                <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  {searchError}
                </div>
              )}
              {searchResults.length > 0 && (
                <div className="mt-4 space-y-2">
                  {searchResults.map((result) => (
                    <div
                      key={result.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-[#1f2c45] bg-[#0e182b]/70 px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          type="button"
                          className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-600 to-emerald-500 text-white text-xs font-bold overflow-hidden flex items-center justify-center shrink-0"
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
                            className="text-sm font-semibold text-slate-100 truncate cursor-pointer hover:text-teal-200"
                            onClick={() => navigate(`/u/${result.id}`)}
                          >
                            {result.name}
                          </div>
                          <div className="text-xs text-slate-500 truncate">
                            {result.email || "No email"}
                          </div>
                        </div>
                      </div>
                      {renderSearchActionButton(result)}
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Friends list" subtitle="Message or challenge your connections">
              <div className="mb-3 flex items-center gap-2">
                <Search className="w-4 h-4 text-slate-500" />
                <input
                  value={friendFilter}
                  onChange={(e) => setFriendFilter(e.target.value)}
                  placeholder="Filter friends"
                  className="flex-1 rounded-lg bg-[#0f1b2f] border border-[#1f2c45] text-sm text-slate-100 px-3 py-2 placeholder:text-slate-500 focus:border-teal-400 focus:ring-2 focus:ring-teal-500/30 outline-none"
                />
              </div>
              {loading ? (
                <div className="rounded-xl border border-[#1f2c45] bg-[#0e182b]/70 px-4 py-5 text-sm text-slate-400">
                  Loading friends...
                </div>
              ) : filteredFriends.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#1f2c45] bg-[#0e182b]/60 px-4 py-5 text-sm text-slate-400">
                  Your friends list is empty for now.
                </div>
              ) : (
                <div className="space-y-2">{filteredFriends.map(renderFriendRow)}</div>
              )}
            </SectionCard>
          </div>
        </div>
      </main>
    </div>
  );
}
