import { useEffect, useMemo, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  Crown,
  ExternalLink,
  Hash,
  Info,
  LayoutGrid,
  Play,
  Plus,
  Search,
  Shield,
  Shuffle,
  SlidersHorizontal,
  Timer,
  Users,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { BOARD_FRAME } from "./types";
import { useBoardTheme } from "../../hooks/useBoardTheme";

interface FriendGameSetupProps {
  playAs: "white" | "black" | "random";
  onPlayAsChange: (value: "white" | "black" | "random") => void;
  timeControl: { initial: number; increment: number };
  onTimeControlChange: (value: { initial: number; increment: number }) => void;
  friendName: string;
  onFriendNameChange: (name: string) => void;
  onSendChallenge: (payload: {
    toUserId: string;
    toName: string;
    gameType: string;
    rated: boolean;
    playAs: "white" | "black" | "random";
    timeControl: { initial: number; increment: number };
  }) => void | Promise<void>;
  isSendingChallenge?: boolean;
  challengeError?: string | null;
  challengeInfo?: string | null;
  isRealtimeConnected?: boolean;
}

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

interface FriendPreview {
  id: string;
  name: string;
  avatar?: string;
  rating?: number;
}

interface GameTypeOption {
  id: string;
  label: string;
  icon: LucideIcon;
  external?: boolean;
}

interface ChallengeTimeOption {
  label: string;
  initial: number;
  increment: number;
}

interface TimeGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  options: ChallengeTimeOption[];
}

const GAME_TYPE_OPTIONS: GameTypeOption[] = [
  { id: "standard", label: "Standard", icon: LayoutGrid },
  { id: "chess960", label: "Chess960", icon: Hash },
  { id: "bughouse", label: "Bughouse", icon: Shield },
  { id: "custom", label: "Custom Position / Odds", icon: SlidersHorizontal },
  { id: "three-check", label: "3 Check", icon: Plus, external: true },
  { id: "crazyhouse", label: "Crazyhouse", icon: Shield, external: true },
  { id: "king-of-hill", label: "King of the Hill", icon: Crown, external: true },
  { id: "four-player", label: "4 Player Chess", icon: Users, external: true },
];

const TIME_GROUPS: TimeGroup[] = [
  {
    id: "bullet",
    label: "Bullet",
    icon: Zap,
    options: [
      { label: "1 min", initial: 60, increment: 0 },
      { label: "1 | 1", initial: 60, increment: 1 },
      { label: "2 | 1", initial: 120, increment: 1 },
    ],
  },
  {
    id: "blitz",
    label: "Blitz",
    icon: Zap,
    options: [
      { label: "3 min", initial: 180, increment: 0 },
      { label: "3 | 2", initial: 180, increment: 2 },
      { label: "5 min", initial: 300, increment: 0 },
    ],
  },
  {
    id: "rapid",
    label: "Rapid",
    icon: Clock,
    options: [
      { label: "10 min", initial: 600, increment: 0 },
      { label: "15 | 10", initial: 900, increment: 10 },
      { label: "30 min", initial: 1800, increment: 0 },
    ],
  },
  {
    id: "daily",
    label: "Daily",
    icon: Calendar,
    options: [
      { label: "1 day", initial: 86400, increment: 0 },
      { label: "3 days", initial: 259200, increment: 0 },
      { label: "7 days", initial: 604800, increment: 0 },
    ],
  },
];

const PLAY_AS_OPTIONS = [
  { id: "white", label: "White", icon: Crown, iconClassName: "" },
  { id: "random", label: "Random", icon: Shuffle, iconClassName: "" },
  { id: "black", label: "Black", icon: Crown, iconClassName: "rotate-180" },
] as const;

export function FriendGameSetup({
  playAs,
  onPlayAsChange,
  timeControl,
  onTimeControlChange,
  friendName,
  onFriendNameChange,
  onSendChallenge,
  isSendingChallenge = false,
  challengeError = null,
  challengeInfo = null,
  isRealtimeConnected = true,
}: FriendGameSetupProps) {
  const { user } = useAuthStore();
  const { colors } = useBoardTheme();
  const [friendSearch, setFriendSearch] = useState("");
  const [friends, setFriends] = useState<FriendPreview[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const [hasChosenFriend, setHasChosenFriend] = useState(false);
  const [isRated, setIsRated] = useState(false);
  const [selectedGameTypeId, setSelectedGameTypeId] = useState("standard");
  const [isGameTypeOpen, setIsGameTypeOpen] = useState(false);
  const [isTimeControlOpen, setIsTimeControlOpen] = useState(false);

  // Responsive board width
  const [boardWidth, setBoardWidth] = useState(620);
  const containerRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const topBarRef = useRef<HTMLDivElement>(null);
  const bottomBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = leftRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const padding = 6;
      const headerH = topBarRef.current?.offsetHeight ?? 36;
      const footerH = bottomBarRef.current?.offsetHeight ?? 32;
      const availableWidth = rect.width - padding - BOARD_FRAME;
      const availableHeight =
        Math.min(rect.height, window.innerHeight) - headerH - footerH - padding;
      const size = Math.floor(Math.min(availableWidth, availableHeight));
      setBoardWidth(Math.max(300, Math.min(size, 700)));
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

  useEffect(() => {
    let isActive = true;

    const loadFriends = async () => {
      try {
        setLoadingFriends(true);
        const res = await fetch(`${API_URL}/api/friends`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to load friends");

        const data = await res.json();
        const mappedFriends: FriendPreview[] = (data.friends || []).map(
          (f: any) => ({
            id: String(f.id),
            name: f.name || f.fullName || "Friend",
            avatar: resolveAvatarUrl(f.avatar),
            rating: typeof f.rating === "number" ? f.rating : undefined,
          }),
        );

        if (!isActive) return;
        setFriends(mappedFriends);
        setFriendsError(null);
      } catch {
        if (!isActive) return;
        setFriendsError("Failed to load friends list.");
      } finally {
        if (isActive) setLoadingFriends(false);
      }
    };

    loadFriends();

    return () => {
      isActive = false;
    };
  }, []);

  const filteredFriends = useMemo(() => {
    const query = friendSearch.trim().toLowerCase();
    if (!query) return friends;
    return friends.filter((friend) => friend.name.toLowerCase().includes(query));
  }, [friendSearch, friends]);

  const selectedFriend = useMemo(() => {
    const activeName = friendName.trim().toLowerCase();
    if (!activeName) return null;
    return (
      friends.find((friend) => friend.name.toLowerCase() === activeName) || null
    );
  }, [friendName, friends]);

  const selectedGameType = useMemo(
    () =>
      GAME_TYPE_OPTIONS.find((gameType) => gameType.id === selectedGameTypeId) ||
      GAME_TYPE_OPTIONS[0],
    [selectedGameTypeId],
  );

  const selectedTimeOption = useMemo(() => {
    for (const group of TIME_GROUPS) {
      const match = group.options.find(
        (option) =>
          option.initial === timeControl.initial &&
          option.increment === timeControl.increment,
      );
      if (match) {
        return { ...match, groupLabel: group.label };
      }
    }
    return null;
  }, [timeControl]);

  const selectedTimeLabel = selectedTimeOption
    ? `${selectedTimeOption.label} (${selectedTimeOption.groupLabel})`
    : "Select Time";

  const opponentLabel = friendName?.trim() || "Friend";
  const playerAvatarUrl = resolveAvatarUrl(user?.avatar);

  const handleSendChallenge = () => {
    if (!selectedFriend) return;
    onSendChallenge({
      toUserId: selectedFriend.id,
      toName: selectedFriend.name,
      gameType: selectedGameType.id,
      rated: isRated,
      playAs,
      timeControl,
    });
  };

  return (
    <div
      ref={containerRef}
      className="relative h-screen w-full bg-slate-100 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 overflow-hidden"
    >
      <div className="h-full grid grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
        {/* Left Side - Board Preview */}
        <div
          ref={leftRef}
          className="min-w-0 flex flex-col items-center justify-center p-2 gap-2 h-full"
        >
          {/* Top Opponent Info Bar */}
          <div
            ref={topBarRef}
            className="w-full max-w-[900px] flex items-center gap-1.5 px-2"
          >
            <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-700 flex-shrink-0">
              {selectedFriend?.avatar ? (
                <img
                  src={selectedFriend.avatar}
                  alt={opponentLabel}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
                  <span className="text-white font-bold text-sm">
                    {opponentLabel.substring(0, 1).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-gray-900 dark:text-white text-[13px]">
                  {opponentLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Chess Board Preview */}
          <div
            className="rounded-2xl overflow-hidden shadow-2xl border border-gray-200/60 dark:border-white/10"
            style={{ width: boardWidth, height: boardWidth }}
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
          <div
            ref={bottomBarRef}
            className="w-full max-w-[900px] flex items-center gap-1.5 px-2 justify-start"
          >
            <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-700 flex-shrink-0">
              {playerAvatarUrl ? (
                <img
                  src={playerAvatarUrl}
                  alt={user.fullName || "You"}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center">
                  <span className="text-white font-bold text-sm">
                    {user?.fullName?.substring(0, 1).toUpperCase() || "Y"}
                  </span>
                </div>
              )}
            </div>
            <div className="flex-1">
              <span className="font-semibold text-gray-900 dark:text-white text-[13px]">
                {user?.fullName || "You"}
              </span>
            </div>
          </div>
        </div>

        {/* Right Side - Settings Panel */}
        <div className="min-w-0 w-full bg-white/90 dark:bg-slate-900/95 border-l border-gray-200/60 dark:border-white/10 flex flex-col h-full overflow-hidden">
          <div className="flex-1 flex flex-col gap-3 px-3 py-3 overflow-y-auto min-h-0">
            {!hasChosenFriend ? (
              <div className="rounded-2xl border border-gray-200/70 dark:border-white/10 bg-white/70 dark:bg-slate-900/60 p-3 flex-shrink-0">
                <div className="text-[12px] font-semibold text-gray-900 dark:text-white mb-2">
                  Opponent
                </div>
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={friendSearch}
                    onChange={(e) => setFriendSearch(e.target.value)}
                    placeholder="Search by username"
                    className="w-full pl-10 pr-3 py-2 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-white text-[12px] border border-gray-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[12px] font-semibold text-gray-900 dark:text-white">
                    Friends
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-gray-300">
                    {filteredFriends.length}
                  </span>
                </div>

                <div className="mt-1 max-h-48 overflow-y-auto space-y-1 pr-1">
                  {loadingFriends ? (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 py-1">
                      Loading friends...
                    </p>
                  ) : friendsError ? (
                    <p className="text-[11px] text-red-500 py-1">{friendsError}</p>
                  ) : filteredFriends.length === 0 ? (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 py-1">
                      No friends found.
                    </p>
                  ) : (
                    filteredFriends.map((friend) => {
                      const isActive =
                        friend.name.toLowerCase() === friendName.trim().toLowerCase();

                      return (
                        <button
                          key={friend.id}
                          type="button"
                          onClick={() => {
                            onFriendNameChange(friend.name);
                            setHasChosenFriend(true);
                            setIsGameTypeOpen(false);
                            setIsTimeControlOpen(false);
                          }}
                          className={`w-full rounded-lg px-2 py-1.5 flex items-center gap-2 text-left transition-all ${
                            isActive
                              ? "bg-teal-500/15 ring-1 ring-teal-500/70"
                              : "hover:bg-gray-100 dark:hover:bg-slate-800/80"
                          }`}
                        >
                          <div className="w-7 h-7 rounded-md overflow-hidden bg-slate-700 flex-shrink-0">
                            {friend.avatar ? (
                              <img
                                src={friend.avatar}
                                alt={friend.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
                                <span className="text-white font-semibold text-[11px]">
                                  {friend.name.substring(0, 1).toUpperCase()}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[12px] font-semibold text-gray-900 dark:text-white truncate">
                              {friend.name}
                              {typeof friend.rating === "number" && (
                                <span className="ml-1 text-[11px] font-normal text-gray-500 dark:text-gray-400">
                                  ({friend.rating})
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-gray-200/70 dark:border-white/10 bg-white/70 dark:bg-slate-900/60 p-3">
                  <div className="flex items-center gap-2 text-[12px] font-semibold text-gray-900 dark:text-white">
                    <Users className="w-4 h-4 text-teal-500" />
                    <span>Play vs</span>
                  </div>

                  <div className="mt-3 flex flex-col items-center text-center">
                    <div className="w-20 h-20 rounded-lg overflow-hidden bg-slate-700">
                      {selectedFriend?.avatar ? (
                        <img
                          src={selectedFriend.avatar}
                          alt={opponentLabel}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
                          <span className="text-white font-bold text-xl">
                            {opponentLabel.substring(0, 1).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="mt-2 text-[13px] font-semibold text-gray-900 dark:text-white">
                      {opponentLabel}
                      {typeof selectedFriend?.rating === "number" && (
                        <span className="ml-1 text-[12px] font-normal text-gray-500 dark:text-gray-400">
                          ({selectedFriend.rating})
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setHasChosenFriend(false)}
                    className="mt-3 w-full py-2 rounded-xl border border-gray-200/70 dark:border-white/10 bg-gray-100 dark:bg-slate-800 text-[12px] font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-200/80 dark:hover:bg-slate-700 transition-colors"
                  >
                    Change Friend
                  </button>
                </div>

                <div className="rounded-2xl border border-gray-200/70 dark:border-white/10 bg-white/70 dark:bg-slate-900/60 p-3">
                  <div className="text-[12px] font-semibold text-gray-900 dark:text-white mb-2">
                    Game Type
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsGameTypeOpen((value) => !value)}
                    className="w-full py-3 px-3 rounded-xl bg-gray-100 dark:bg-slate-800 border border-gray-200/70 dark:border-white/10 text-gray-800 dark:text-gray-100 flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2 text-[13px] font-semibold">
                      <selectedGameType.icon className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                      {selectedGameType.label}
                    </span>
                    {isGameTypeOpen ? (
                      <ChevronUp className="w-4 h-4 opacity-80" />
                    ) : (
                      <ChevronDown className="w-4 h-4 opacity-80" />
                    )}
                  </button>

                  {isGameTypeOpen && (
                    <div className="mt-2 rounded-xl border border-gray-200/70 dark:border-white/10 overflow-hidden">
                      {GAME_TYPE_OPTIONS.map((option) => {
                        const Icon = option.icon;
                        const active = selectedGameType.id === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => {
                              setSelectedGameTypeId(option.id);
                              setIsGameTypeOpen(false);
                            }}
                            className={`w-full px-3 py-2.5 flex items-center justify-between text-left transition-colors ${
                              active
                                ? "bg-teal-500/15 text-teal-600 dark:text-teal-300"
                                : "bg-white dark:bg-slate-900 hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-gray-200"
                            }`}
                          >
                            <span className="flex items-center gap-2 text-[13px] font-medium">
                              <Icon className="w-4 h-4" />
                              <span>{option.label}</span>
                              {option.external && <ExternalLink className="w-3.5 h-3.5 opacity-70" />}
                            </span>
                            <Info className="w-4 h-4 opacity-65" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-gray-200/70 dark:border-white/10 bg-white/70 dark:bg-slate-900/60 p-3">
                  <button
                    type="button"
                    onClick={() => setIsTimeControlOpen((value) => !value)}
                    className="w-full py-3 px-3 rounded-xl bg-gray-100 dark:bg-slate-800 border border-gray-200/70 dark:border-white/10 text-gray-800 dark:text-gray-100 flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2 text-[13px] font-semibold">
                      <Timer className="w-4 h-4 text-yellow-500" />
                      {selectedTimeLabel}
                    </span>
                    {isTimeControlOpen ? (
                      <ChevronUp className="w-4 h-4 opacity-80" />
                    ) : (
                      <ChevronDown className="w-4 h-4 opacity-80" />
                    )}
                  </button>

                  {isTimeControlOpen && (
                    <div className="mt-3 space-y-3">
                      {TIME_GROUPS.map((group) => {
                        const GroupIcon = group.icon;
                        return (
                          <div key={group.id}>
                            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-800 dark:text-gray-200">
                              <GroupIcon className="w-4 h-4 text-yellow-500" />
                              <span>{group.label}</span>
                            </div>
                            <div className="mt-1.5 grid grid-cols-3 gap-2">
                              {group.options.map((option) => {
                                const selected =
                                  timeControl.initial === option.initial &&
                                  timeControl.increment === option.increment;
                                return (
                                  <button
                                    key={`${group.id}-${option.label}`}
                                    type="button"
                                    onClick={() => {
                                      onTimeControlChange({
                                        initial: option.initial,
                                        increment: option.increment,
                                      });
                                      setIsTimeControlOpen(false);
                                    }}
                                    className={`py-2 rounded-lg text-[12px] font-semibold transition-all ${
                                      selected
                                        ? "bg-teal-500/20 text-teal-600 dark:text-teal-300 ring-2 ring-teal-500"
                                        : "bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 ring-1 ring-gray-200 dark:ring-slate-700 hover:ring-gray-300 dark:hover:ring-slate-600"
                                    }`}
                                  >
                                    {option.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between px-1">
                  <span className="text-[14px] font-semibold text-gray-900 dark:text-white">
                    Rated
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsRated((value) => !value)}
                    className={`relative w-14 h-8 rounded-full transition-colors ${
                      isRated ? "bg-teal-500" : "bg-gray-300 dark:bg-slate-700"
                    }`}
                    aria-pressed={isRated}
                  >
                    <span
                      className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all ${
                        isRated ? "left-7" : "left-1"
                      }`}
                    />
                  </button>
                </div>

                <div className="rounded-2xl border border-gray-200/70 dark:border-white/10 bg-white/70 dark:bg-slate-900/60 p-3">
                  <div className="text-[12px] font-semibold text-gray-900 dark:text-white mb-2">
                    I play as
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {PLAY_AS_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      const active = playAs === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => onPlayAsChange(option.id)}
                          className={`py-2.5 rounded-xl text-[11px] font-semibold transition-all border ${
                            active
                              ? "bg-teal-500/20 border-teal-500 text-teal-600 dark:text-teal-300"
                              : "bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300"
                          }`}
                        >
                          <span className="flex items-center justify-center">
                            <Icon className={`w-5 h-5 ${option.iconClassName}`} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {challengeError && (
                  <div className="rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-[12px] text-red-600 dark:text-red-300">
                    {challengeError}
                  </div>
                )}

                {challengeInfo && !challengeError && (
                  <div className="rounded-xl border border-teal-200 dark:border-teal-500/30 bg-teal-50 dark:bg-teal-500/10 px-3 py-2 text-[12px] text-teal-700 dark:text-teal-300">
                    {challengeInfo}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Play Button */}
          <div className="p-3 border-t border-gray-200/60 dark:border-white/10 flex-shrink-0">
            {hasChosenFriend ? (
              <button
                onClick={handleSendChallenge}
                disabled={
                  isSendingChallenge || !selectedFriend || !isRealtimeConnected
                }
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold text-[15px] transition-all shadow-lg hover:shadow-xl active:scale-[0.98] disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
              >
                <Play className="w-5 h-5" />
                {isSendingChallenge
                  ? "Sending..."
                  : isRealtimeConnected
                    ? "Send Challenge"
                    : "Server Offline"}
              </button>
            ) : (
              <button
                disabled
                className="w-full py-3 rounded-2xl bg-gray-300 dark:bg-slate-700 text-gray-500 dark:text-gray-400 font-bold text-[15px] cursor-not-allowed flex items-center justify-center gap-2"
              >
                Choose Friend First
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
