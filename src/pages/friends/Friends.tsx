import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, UserPlus, UserX, MessageCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import Sidebar from "../../components/Sidebar";
import { useAuthStore } from "../../store/authStore";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface Friend {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  rating?: number;
  since: string;
}

interface SearchResult {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  rating?: number;
}

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

export default function Friends() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [newFriendName, setNewFriendName] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadFriends = async () => {
      try {
        setLoadingFriends(true);
        const res = await fetch(`${API_URL}/api/friends`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to fetch friends");
        const data = await res.json();
        setFriends(
          (data.friends || []).map((f: any) => ({
            id: f.id,
            name: f.name,
            email: f.email,
            avatar: f.avatar,
            rating: f.rating,
            since: new Date(f.since).toLocaleDateString(),
          })),
        );
        setError(null);
      } catch (err) {
        setError("Failed to load friends.");
      } finally {
        setLoadingFriends(false);
      }
    };

    loadFriends();
  }, []);

  const filteredFriends = useMemo(() => {
    if (!searchQuery) return friends;
    const query = searchQuery.toLowerCase();
    return friends.filter((f) => f.name.toLowerCase().includes(query));
  }, [friends, searchQuery]);

  const handleAddFriend = () => {
    if (!newFriendName.trim()) return;
    handleSearchUsers();
  };

  const handleRemoveFriend = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/friends/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to remove friend");
      setFriends((prev) => prev.filter((f) => f.id !== id));
    } catch {
      setError("Failed to remove friend.");
    }
  };

  const handleSearchUsers = async () => {
    const query = newFriendName.trim();
    if (!query) return;
    try {
      setSearching(true);
      const res = await fetch(
        `${API_URL}/api/friends/search?q=${encodeURIComponent(query)}`,
        {
          credentials: "include",
        },
      );
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setSearchResults(data.results || []);
      setError(null);
    } catch (err) {
      setError("Search failed. Try again.");
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleAddFromResult = async (friendId: string) => {
    try {
      const res = await fetch(`${API_URL}/api/friends`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ friendId }),
      });
      if (!res.ok) throw new Error("Failed to add friend");
      // refresh list
      const updated = await fetch(`${API_URL}/api/friends`, {
        credentials: "include",
      });
      const data = await updated.json();
      setFriends(
        (data.friends || []).map((f: any) => ({
          id: f.id,
          name: f.name,
          email: f.email,
          avatar: f.avatar,
          rating: f.rating,
          since: new Date(f.since).toLocaleDateString(),
        })),
      );
      setSearchResults((prev) => prev.filter((r) => r.id !== friendId));
      setNewFriendName("");
      setError(null);
    } catch {
      setError("Failed to add friend.");
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 text-gray-900 dark:text-white flex transition-colors duration-300">
      <Sidebar />

      <main className="flex-1 ml-72 p-8">
        {/* Header */}
        <header className="flex flex-col gap-4 mb-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">{t("Friends")}</h1>
              <p className="text-gray-500 dark:text-gray-400">
                {t("Manage your friends and stay connected.")}
              </p>
            </div>
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder={t("Search friends...")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-300 pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:border-teal-500 transition-colors shadow-sm"
              />
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] gap-6">
          {/* Friend List */}
          <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">{t("Your Friends")}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {friends.length} {t("total")}
                </p>
              </div>
            </div>

            {loadingFriends ? (
              <div className="py-10 text-center text-gray-500 dark:text-gray-400">
                {t("Loading friends...")}
              </div>
            ) : filteredFriends.length === 0 ? (
              <div className="py-10 text-center text-gray-500 dark:text-gray-400">
                {t("No friends found.")}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredFriends.map((friend) => (
                  <div
                    key={friend.id}
                    className="flex items-center justify-between gap-4 p-3 rounded-xl border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white font-bold cursor-pointer overflow-hidden"
                        onClick={() => navigate(`/u/${friend.id}`)}
                      >
                        {friend.avatar ? (
                          <img
                            src={resolveAvatarUrl(friend.avatar)}
                            alt={friend.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          friend.name.substring(0, 2).toUpperCase()
                        )}
                      </button>
                      <div className="min-w-0">
                        <div
                          className="font-semibold truncate cursor-pointer hover:text-teal-500 dark:hover:text-teal-400 transition-colors"
                          onClick={() => navigate(`/u/${friend.id}`)}
                        >
                          {friend.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {t("Friends since")} {friend.since}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-500/10 text-teal-600 dark:text-teal-300 hover:bg-teal-500/20 transition-colors flex items-center gap-1.5"
                        title={t("Message")}
                        onClick={() =>
                          navigate(
                            `/messages?chat=${encodeURIComponent(friend.id)}&name=${encodeURIComponent(friend.name)}`,
                          )
                        }
                      >
                        <MessageCircle className="w-4 h-4" />
                        {t("Message")}
                      </button>
                      <button
                        onClick={() => handleRemoveFriend(friend.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-1.5"
                        title={t("Unfriend")}
                      >
                        <UserX className="w-4 h-4" />
                        {t("Unfriend")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Add Friend */}
          <aside className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm">
            <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-teal-500" />
              {t("Add Friend")}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {t("Search by username or email.")}
            </p>

            <div className="space-y-3">
              <input
                type="text"
                placeholder={t("Username or email")}
                value={newFriendName}
                onChange={(e) => setNewFriendName(e.target.value)}
                className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-300 px-4 py-2 rounded-lg focus:outline-none focus:border-teal-500 transition-colors"
              />
              {error && (
                <div className="text-xs text-red-500 font-medium">{error}</div>
              )}
              <button
                onClick={handleSearchUsers}
                className="w-full py-2.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold transition-colors"
              >
                {searching ? t("Searching...") : t("Search")}
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="mt-4 space-y-2">
                {searchResults.map((result) => (
                  <div
                    key={result.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg border border-gray-200 dark:border-gray-800"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <button
                        type="button"
                        className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-white text-xs font-bold overflow-hidden flex items-center justify-center shrink-0"
                        onClick={() => navigate(`/u/${result.id}`)}
                      >
                        {result.avatar ? (
                          <img
                            src={resolveAvatarUrl(result.avatar)}
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
                          className="text-sm font-semibold truncate cursor-pointer hover:text-teal-500 dark:hover:text-teal-400 transition-colors"
                          onClick={() => navigate(`/u/${result.id}`)}
                        >
                          {result.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {result.email || t("No email")}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleAddFromResult(result.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-500/10 text-teal-600 dark:text-teal-300 hover:bg-teal-500/20 transition-colors"
                    >
                      {t("Add")}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
