import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Chessboard } from "react-chessboard";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/authStore";
import type { BotPersonality } from "../../data/botPersonalities";
import { BOARD_FRAME } from "./types";
import { useBoardTheme } from "../../hooks/useBoardTheme";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const CATEGORY_INFO: {
  key: BotPersonality["category"];
  label: string;
}[] = [
  { key: "beginner", label: "Beginner" },
  { key: "casual", label: "Casual" },
  { key: "intermediate", label: "Intermediate" },
  { key: "advanced", label: "Advanced" },
  { key: "master", label: "Master" },
];

function resolveBotAvatarUrl(input: unknown): string {
  const avatarUrl = String(input || "").trim();
  if (!avatarUrl) return "";
  if (/^(https?:)?\/\//i.test(avatarUrl) || avatarUrl.startsWith("data:")) {
    return avatarUrl;
  }
  if (avatarUrl.startsWith("/BotProPic/")) {
    return avatarUrl;
  }
  return `${API_URL}${avatarUrl.startsWith("/") ? "" : "/"}${avatarUrl}`;
}

function getBotInitials(name?: string): string {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "?";
  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

// Map database bot to BotPersonality interface
function mapDbBotToPersonality(dbBot: any): BotPersonality {
  return {
    id: dbBot._id,
    name: dbBot.name,
    avatar: "",
    avatarUrl: resolveBotAvatarUrl(dbBot.avatarUrl),
    rating: dbBot.eloRating,
    title: dbBot.title || undefined,
    description: dbBot.description || "",
    personality: dbBot.personality || dbBot.quote || "",
    playStyle: dbBot.playStyle || "balanced",
    skillLevel: dbBot.skillLevel || 5,
    depth: dbBot.depth || 10,
    thinkTimeMs: dbBot.thinkTimeMs || 2000,
    blunderChance: dbBot.blunderChance || 0,
    aggressiveness: dbBot.aggressiveness || 0,
    openingBook: dbBot.openingBook ?? true,
    category: dbBot.difficulty || "beginner",
  };
}

export default function PlayWithBot() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { colors } = useBoardTheme();

  // Bot data state
  const [bots, setBots] = useState<BotPersonality[]>([]);
  const [groupedBots, setGroupedBots] = useState<
    Record<string, BotPersonality[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedBot, setSelectedBot] = useState<BotPersonality | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<
    BotPersonality["category"] | null
  >("beginner");

  // Responsive board width
  const [boardWidth, setBoardWidth] = useState(620);
  const containerRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);

  // Fetch bots from API
  useEffect(() => {
    async function fetchBots() {
      try {
        setLoading(true);
        const res = await fetch(`${API_URL}/api/bots`, {
          credentials: "include",
        });

        if (!res.ok) {
          throw new Error(t("Failed to fetch bots"));
        }

        const data = await res.json();

        // Map database bots to BotPersonality interface
        const mappedBots = data.bots.map(mapDbBotToPersonality);
        setBots(mappedBots);

        // Group bots by category
        const grouped: Record<string, BotPersonality[]> = {};
        mappedBots.forEach((bot: BotPersonality) => {
          if (!grouped[bot.category]) {
            grouped[bot.category] = [];
          }
          grouped[bot.category].push(bot);
        });
        setGroupedBots(grouped);

        // Select first bot from first available category
        if (mappedBots.length > 0) {
          setSelectedBot(mappedBots[0]);
          // Expand the category of the first bot
          setExpandedCategory(mappedBots[0].category);
        }

        setError(null);
      } catch (err) {
        console.error("Error fetching bots:", err);
        setError(t("Failed to load bots"));
      } finally {
        setLoading(false);
      }
    }

    fetchBots();
  }, []);

  useEffect(() => {
    const container = leftRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const padding = 24;
      const headerH = 60;
      const footerH = 48;
      const availableWidth = rect.width - padding - BOARD_FRAME;
      const availableHeight = rect.height - headerH - footerH - padding;
      const size = Math.floor(Math.min(availableWidth, availableHeight));
      setBoardWidth(Math.max(400, Math.min(size, 720)));
    };

    updateSize();
    const observer = new ResizeObserver(() => updateSize());
    observer.observe(container);
    window.addEventListener("resize", updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  const handleStartMatch = () => {
    if (!selectedBot) return;
    // Navigate to the bot game page
    navigate(`/play/bot/${selectedBot.id}`);
  };

  const toggleCategory = (cat: BotPersonality["category"]) => {
    setExpandedCategory(expandedCategory === cat ? null : cat);
  };

  // Bot selection screen - Chess.com inspired layout
  return (
    <div
      ref={containerRef}
      className="relative h-screen w-full bg-slate-100 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 overflow-hidden"
    >
      <div className="h-full min-h-0 grid grid-cols-1 lg:grid-cols-2">
        {/* Left Side - Board Preview with Bot Info */}
        <div
          ref={leftRef}
          className="flex flex-col items-center justify-center p-4 gap-4 h-full min-h-0"
        >
          {/* Top Bot Info Bar */}
          <div className="w-full max-w-[900px] flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-700 flex-shrink-0">
              {selectedBot?.avatarUrl ? (
                <img
                  src={selectedBot.avatarUrl}
                  alt={selectedBot.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center">
                  <span className="text-white text-lg leading-none">
                    {getBotInitials(selectedBot?.name)}
                  </span>
                </div>
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900 dark:text-white">
                  {selectedBot?.name || t("Select Bot")}
                </span>
                {selectedBot?.title && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded">
                    {selectedBot.title}
                  </span>
                )}
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  ({selectedBot?.rating || "---"})
                </span>
              </div>
            </div>
          </div>

          {/* Chess Board Preview */}
          <div
            className="rounded-2xl overflow-hidden shadow-2xl border border-gray-200/60 dark:border-white/10"
            style={{ width: boardWidth }}
          >
            <Chessboard
              boardWidth={boardWidth}
              position="start"
              arePiecesDraggable={false}
              customDarkSquareStyle={{
                backgroundColor: colors.dark,
                transition: "background-color 160ms ease",
              }}
              customLightSquareStyle={{
                backgroundColor: colors.light,
                transition: "background-color 160ms ease",
              }}
            />
          </div>

          {/* Bottom Player Info Bar */}
          <div className="w-full max-w-[900px] flex items-center gap-3 px-2 justify-start">
            <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-700 flex-shrink-0">
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.fullName || t("You")}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center">
                  <span className="text-white font-bold text-sm">{user?.fullName?.substring(0, 1).toUpperCase() || t("Y")}</span>
                </div>
              )}
            </div>
            <div className="flex-1">
              <span className="font-bold text-gray-900 dark:text-white">
                {user?.fullName || t("You")}
              </span>
            </div>
          </div>
        </div>

        {/* Right Side - Bot Selection Panel */}
        <div className="w-full bg-white/90 dark:bg-slate-900/95 border-l border-gray-200/60 dark:border-white/10 flex flex-col h-full min-h-0">
          {/* Panel Header */}
          <div className="p-4 border-b border-gray-200/60 dark:border-white/10">
            <div>
              <h2 className="font-bold text-lg text-gray-900 dark:text-white">
                {t("Play Bots")}
              </h2>
            </div>
          </div>

          {/* Selected Bot Hero */}
          {selectedBot && (
            <div
              className="p-3 border-b border-gray-200/60 dark:border-white/10 space-y-2"
              style={{ minHeight: "15vh" }}
            >
              <div className="flex items-start gap-3">
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-slate-700 flex-shrink-0">
                  {selectedBot.avatarUrl ? (
                    <img
                      src={selectedBot.avatarUrl}
                      alt={selectedBot.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center">
                      <span className="text-white text-2xl leading-none">
                        {getBotInitials(selectedBot.name)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <div className="relative bg-gray-100 dark:bg-slate-800 rounded-lg p-2">
                    <p className="text-xs text-gray-700 dark:text-gray-300 italic line-clamp-2">
                      "{selectedBot.personality}"
                    </p>
                    <div className="absolute -bottom-2 left-6 w-0 h-0 border-l-6 border-r-6 border-t-6 border-transparent border-t-gray-100 dark:border-t-slate-800" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {selectedBot.name}
                    </span>
                    <span className="text-sm font-medium text-brand-600 dark:text-brand-400">
                      {selectedBot.rating}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                    {selectedBot.description}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Category Sections */}
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 pb-3 [scrollbar-width:thin] [scrollbar-color:#334155_transparent]">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <span className="text-gray-500">{t("Loading bots...")}</span>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center py-10">
                <p className="text-red-500">{error}</p>
              </div>
            ) : (
              CATEGORY_INFO.map((cat) => {
                const categoryBots = groupedBots[cat.key] || [];
                const isExpanded = expandedCategory === cat.key;

                // Only show categories that have bots
                if (categoryBots.length === 0) return null;

                return (
                  <div
                    key={cat.key}
                    className="border-b border-gray-200/60 dark:border-white/10 py-1"
                  >
                    {/* Category Header */}
                    <button
                      onClick={() => toggleCategory(cat.key)}
                      className="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <div className="flex items-center">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {t(cat.label)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {categoryBots.length}{" "}
                          {categoryBots.length === 1 ? t("bot") : t("bots")}
                        </span>
                        <span className="text-xs font-semibold text-gray-400">
                          {isExpanded ? "Hide" : "Show"}
                        </span>
                      </div>
                    </button>

                    {/* Bot Avatars Grid */}
                    {isExpanded && (
                      <div className="px-3 pb-3 grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-5 gap-2.5">
                        {categoryBots.map((bot) => (
                          <button
                            key={bot.id}
                            onClick={() => setSelectedBot(bot)}
                            className="w-full text-left transition-transform hover:scale-[1.02]"
                            title={`${bot.name} (${bot.rating})`}
                          >
                            <div
                              className={`relative w-full aspect-square rounded-xl overflow-hidden ${
                                selectedBot?.id === bot.id
                                  ? "ring-2 ring-brand-500 shadow-md shadow-brand-500/20"
                                  : "ring-1 ring-gray-200 dark:ring-slate-700 hover:ring-gray-300 dark:hover:ring-slate-600"
                              }`}
                            >
                              {bot.avatarUrl ? (
                                <img
                                  src={bot.avatarUrl}
                                  alt={bot.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full bg-gradient-to-br from-rose-500 to-pink-600 flex flex-col items-center justify-center">
                                  <span className="text-2xl leading-none text-white">
                                    {getBotInitials(bot.name)}
                                  </span>
                                  <span className="mt-1 text-[10px] font-semibold text-white/90">
                                    {bot.name.match(/\d+/)?.[0] ||
                                      bot.name.substring(0, 2).toUpperCase()}
                                  </span>
                                </div>
                              )}
                            </div>
                            <span
                              className={`mt-1 block text-[11px] font-medium truncate ${
                                selectedBot?.id === bot.id
                                  ? "text-brand-600 dark:text-brand-400"
                                  : "text-gray-700 dark:text-gray-300"
                              }`}
                            >
                              {bot.name}
                            </span>
                            <span className="block text-[10px] text-gray-500 dark:text-gray-400">
                              {bot.rating}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Play Button */}
          <div className="p-3 border-t border-gray-200/60 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm">
            <button
              onClick={handleStartMatch}
              disabled={!selectedBot}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-brand-500 to-brand-500 hover:from-brand-600 hover:to-brand-600 text-white font-bold text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl active:scale-[0.98]"
            >
              {t("Play")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
