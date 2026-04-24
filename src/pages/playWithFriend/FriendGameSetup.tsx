import { useEffect, useMemo, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import {
  ChevronDown,
  ChevronUp,
  Play,
  Search,
  Timer,
  Users,
} from "lucide-react";
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
  preselectedFriendId?: string | null;
  preselectedFriendName?: string | null;
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
  id: "standard" | "chess960" | "threeCheck" | "kingOfHill" | "atomic";
  label: string;
}

interface ChallengeTimeOption {
  label: string;
  initial: number;
  increment: number;
}

interface TimeGroup {
  id: string;
  label: string;
  options: ChallengeTimeOption[];
}

const GAME_TYPE_OPTIONS: GameTypeOption[] = [
  { id: "standard", label: "Standard" },
  { id: "chess960", label: "Chess960" },
  { id: "threeCheck", label: "Three-Check" },
  { id: "kingOfHill", label: "King of the Hill" },
  { id: "atomic", label: "Atomic Chess" },
];

const TIME_GROUPS: TimeGroup[] = [
  {
    id: "bullet",
    label: "Bullet",
    options: [
      { label: "1 min", initial: 60, increment: 0 },
      { label: "1 | 1", initial: 60, increment: 1 },
      { label: "2 | 1", initial: 120, increment: 1 },
    ],
  },
  {
    id: "blitz",
    label: "Blitz",
    options: [
      { label: "3 min", initial: 180, increment: 0 },
      { label: "3 | 2", initial: 180, increment: 2 },
      { label: "5 min", initial: 300, increment: 0 },
    ],
  },
  {
    id: "rapid",
    label: "Rapid",
    options: [
      { label: "10 min", initial: 600, increment: 0 },
      { label: "15 | 10", initial: 900, increment: 10 },
      { label: "30 min", initial: 1800, increment: 0 },
    ],
  },
  {
    id: "daily",
    label: "Daily",
    options: [
      { label: "1 day", initial: 86400, increment: 0 },
      { label: "3 days", initial: 259200, increment: 0 },
      { label: "7 days", initial: 604800, increment: 0 },
    ],
  },
];

const PLAY_AS_OPTIONS = [
  { id: "white", label: "White" },
  { id: "random", label: "Random" },
  { id: "black", label: "Black" },
] as const;

export function FriendGameSetup({
  playAs,
  onPlayAsChange,
  timeControl,
  onTimeControlChange,
  friendName,
  onFriendNameChange,
  preselectedFriendId = null,
  preselectedFriendName = null,
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
  const [selectedGameTypeId, setSelectedGameTypeId] = useState<
    "standard" | "chess960" | "threeCheck" | "kingOfHill" | "atomic"
  >("standard");
  const [isGameTypeOpen, setIsGameTypeOpen] = useState(false);
  const [isTimeControlOpen, setIsTimeControlOpen] = useState(false);
  const [customBaseMinutes, setCustomBaseMinutes] = useState(() =>
    String(Math.max(1, Math.round(timeControl.initial / 60))),
  );
  const [customIncrementSeconds, setCustomIncrementSeconds] = useState(() =>
    String(Math.max(0, Math.round(timeControl.increment))),
  );

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

  useEffect(() => {
    if (hasChosenFriend) return;
    if (!friends.length) return;

    const targetId = String(preselectedFriendId || "").trim();
    const targetName = String(preselectedFriendName || friendName || "")
      .trim()
      .toLowerCase();
    if (!targetId && !targetName) return;

    const match =
      friends.find((friend) => targetId && friend.id === targetId) ||
      friends.find((friend) => targetName && friend.name.toLowerCase() === targetName) ||
      null;

    if (!match) {
      if (!friendSearch && preselectedFriendName) {
        setFriendSearch(preselectedFriendName);
      }
      return;
    }

    onFriendNameChange(match.name);
    setFriendSearch(match.name);
    setHasChosenFriend(true);
    setIsGameTypeOpen(false);
    setIsTimeControlOpen(false);
  }, [
    friendName,
    friendSearch,
    friends,
    hasChosenFriend,
    onFriendNameChange,
    preselectedFriendId,
    preselectedFriendName,
  ]);

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
      rated: false,
      playAs,
      timeControl,
    });
  };

  useEffect(() => {
    setCustomBaseMinutes(String(Math.max(1, Math.round(timeControl.initial / 60))));
    setCustomIncrementSeconds(String(Math.max(0, Math.round(timeControl.increment))));
  }, [timeControl.initial, timeControl.increment]);

  const applyCustomTimeControl = () => {
    const baseMinutes = Math.max(1, Math.round(Number(customBaseMinutes) || 0));
    const incrementSeconds = Math.max(
      0,
      Math.round(Number(customIncrementSeconds) || 0),
    );
    onTimeControlChange({
      initial: baseMinutes * 60,
      increment: incrementSeconds,
    });
    setIsTimeControlOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className="relative h-screen w-full bg-transparent overflow-hidden"
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
            className="theme-glass-panel-strong rounded-2xl overflow-hidden"
            style={{ width: boardWidth, height: boardWidth }}
          >
            <Chessboard
              boardWidth={boardWidth}
              position="start"
              arePiecesDraggable={false}
              customSquareStyles={
                selectedGameType.id === "kingOfHill"
                  ? {
                      d4: {
                        boxShadow:
                          "inset 0 0 0 9999px rgba(250, 204, 21, 0.16)",
                      },
                      e4: {
                        boxShadow:
                          "inset 0 0 0 9999px rgba(250, 204, 21, 0.16)",
                      },
                      d5: {
                        boxShadow:
                          "inset 0 0 0 9999px rgba(250, 204, 21, 0.16)",
                      },
                      e5: {
                        boxShadow:
                          "inset 0 0 0 9999px rgba(250, 204, 21, 0.16)",
                      },
                    }
                  : undefined
              }
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
                <div className="w-full h-full bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center">
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
        <div className="theme-glass-panel-strong min-w-0 w-full rounded-none border-l-0 flex flex-col h-full overflow-hidden">
          <div className="flex-1 flex flex-col gap-3 px-3 py-3 overflow-y-auto min-h-0">
            {!hasChosenFriend ? (
              <div className="theme-glass-panel-soft rounded-2xl p-3 flex-shrink-0">
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
                    className="w-full pl-10 pr-3 py-2 rounded-xl bg-white/60 dark:bg-white/10 text-gray-900 dark:text-white text-[12px] border border-white/10 focus:outline-none focus:ring-2 focus:ring-brand-500"
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
                              ? "bg-brand-500/15 ring-1 ring-brand-500/70"
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
                <div className="theme-glass-panel-soft rounded-2xl p-3">
                  <div className="flex items-center gap-2 text-[12px] font-semibold text-gray-900 dark:text-white">
                    <Users className="w-4 h-4 text-brand-500" />
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
                    className="mt-3 w-full py-2 rounded-xl border border-white/10 bg-white/55 dark:bg-white/10 text-[12px] font-semibold text-gray-700 dark:text-gray-300 hover:bg-white/75 dark:hover:bg-white/15 transition-colors"
                  >
                    Change Friend
                  </button>
                </div>

                <div className="theme-glass-panel-soft rounded-2xl p-3">
                  <div className="text-[12px] font-semibold text-gray-900 dark:text-white mb-2">
                    Game Type
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsGameTypeOpen((value) => !value)}
                    className="w-full py-3 px-3 rounded-xl bg-white/55 dark:bg-white/10 border border-white/10 text-gray-800 dark:text-gray-100 flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2 text-[13px] font-semibold">
                      {selectedGameType.label}
                    </span>
                    {isGameTypeOpen ? (
                      <ChevronUp className="w-4 h-4 opacity-80" />
                    ) : (
                      <ChevronDown className="w-4 h-4 opacity-80" />
                    )}
                  </button>

                  {isGameTypeOpen && (
                    <div className="mt-2 rounded-xl border border-white/10 overflow-hidden">
                      {GAME_TYPE_OPTIONS.map((option) => {
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
                                ? "bg-brand-500/15 text-brand-600 dark:text-brand-300"
                                : "bg-white/55 dark:bg-white/10 hover:bg-white/75 dark:hover:bg-white/15 text-gray-700 dark:text-gray-200"
                            }`}
                          >
                            <span className="flex items-center gap-2 text-[13px] font-medium">
                              <span>{option.label}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="theme-glass-panel-soft rounded-2xl p-3">
                  <button
                    type="button"
                    onClick={() => setIsTimeControlOpen((value) => !value)}
                    className="w-full py-3 px-3 rounded-xl bg-white/55 dark:bg-white/10 border border-white/10 text-gray-800 dark:text-gray-100 flex items-center justify-between"
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
                      {TIME_GROUPS.map((group) => (
                        <div key={group.id}>
                            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-800 dark:text-gray-200">
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
                                        ? "bg-brand-500/20 text-brand-600 dark:text-brand-300 ring-2 ring-brand-500"
                                        : "bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 ring-1 ring-gray-200 dark:ring-slate-700 hover:ring-gray-300 dark:hover:ring-slate-600"
                                    }`}
                                  >
                                    {option.label}
                                  </button>
                                );
                              })}
                            </div>
                        </div>
                      ))}
                      <div className="theme-glass-panel-soft rounded-xl p-2.5">
                        <div className="text-[12px] font-semibold text-gray-800 dark:text-gray-200">
                          Custom
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <label className="text-[11px] text-gray-600 dark:text-gray-300">
                            Base (min)
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={customBaseMinutes}
                              onChange={(event) =>
                                setCustomBaseMinutes(event.target.value)
                              }
                              className="mt-1 w-full rounded-lg border border-white/10 bg-white/60 dark:bg-white/10 px-2 py-1.5 text-[12px] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                            />
                          </label>
                          <label className="text-[11px] text-gray-600 dark:text-gray-300">
                            Increment (sec)
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={customIncrementSeconds}
                              onChange={(event) =>
                                setCustomIncrementSeconds(event.target.value)
                              }
                              className="mt-1 w-full rounded-lg border border-white/10 bg-white/60 dark:bg-white/10 px-2 py-1.5 text-[12px] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          onClick={applyCustomTimeControl}
                          className="mt-2 w-full rounded-lg bg-brand-500/20 text-brand-700 dark:text-brand-300 py-1.5 text-[12px] font-semibold ring-1 ring-brand-500/40 hover:bg-brand-500/25 transition-colors"
                        >
                          Apply Custom
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <p className="px-1 text-[11px] text-gray-500 dark:text-gray-400">
                  Friend games are always unrated. Elo does not change.
                </p>

                <div className="theme-glass-panel-soft rounded-2xl p-3">
                  <div className="text-[12px] font-semibold text-gray-900 dark:text-white mb-2">
                    I play as
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {PLAY_AS_OPTIONS.map((option) => {
                      const active = playAs === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => onPlayAsChange(option.id)}
                          className={`py-2.5 rounded-xl text-[11px] font-semibold transition-all border ${
                            active
                              ? "bg-brand-500/20 border-brand-500 text-brand-600 dark:text-brand-300"
                              : "bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300"
                          }`}
                        >
                          {option.label}
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
                  <div className="rounded-xl border border-brand-200 dark:border-brand-500/30 bg-brand-50 dark:bg-brand-500/10 px-3 py-2 text-[12px] text-brand-700 dark:text-brand-300">
                    {challengeInfo}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Play Button */}
          <div className="p-3 border-t border-theme-glass flex-shrink-0">
            {hasChosenFriend ? (
              <button
                onClick={handleSendChallenge}
                disabled={
                  isSendingChallenge || !selectedFriend || !isRealtimeConnected
                }
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-brand-500 to-cyan-500 hover:from-brand-600 hover:to-cyan-600 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold text-[15px] transition-all shadow-lg hover:shadow-xl active:scale-[0.98] disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
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

