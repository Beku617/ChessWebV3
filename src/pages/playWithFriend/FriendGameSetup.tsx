import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import { useTranslation, Trans } from "react-i18next";
import {
  ChevronDown,
  ChevronUp,
  Play,
  Search,
  Timer,
  Users,
} from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { PlayerInfo } from "../../components/game";
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
  const { t } = useTranslation();
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
  const previewBoardId = useId().replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const topBarRef = useRef<HTMLDivElement>(null);
  const bottomBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = leftRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const styles = window.getComputedStyle(container);
      const paddingLeft = parseFloat(styles.paddingLeft || "0") || 0;
      const paddingRight = parseFloat(styles.paddingRight || "0") || 0;
      const paddingTop = parseFloat(styles.paddingTop || "0") || 0;
      const paddingBottom = parseFloat(styles.paddingBottom || "0") || 0;
      const rowGap = parseFloat(styles.rowGap || styles.gap || "0") || 0;
      const headerH = topBarRef.current?.offsetHeight ?? 36;
      const footerH = bottomBarRef.current?.offsetHeight ?? 32;
      const gapsBetweenSections = rowGap * 2;
      const verticalBreathingRoom = 8;
      const availableWidth =
        rect.width - (paddingLeft + paddingRight) - BOARD_FRAME;
      const availableHeight =
        Math.min(rect.height, window.innerHeight) -
        headerH -
        footerH -
        (paddingTop + paddingBottom) -
        gapsBetweenSections -
        verticalBreathingRoom;
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
            name: f.name || f.fullName || t("Friend"),
            avatar: resolveAvatarUrl(f.avatar),
            rating: typeof f.rating === "number" ? f.rating : undefined,
          }),
        );

        if (!isActive) return;
        setFriends(mappedFriends);
        setFriendsError(null);
      } catch {
        if (!isActive) return;
        setFriendsError(t("Failed to load friends list."));
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
    ? `${t(selectedTimeOption.label)} (${t(selectedTimeOption.groupLabel)})`
    : t("Select Time");

  const normalizedFriendName = friendName?.trim();
  const opponentLabel =
    normalizedFriendName &&
    normalizedFriendName.toLowerCase() !== "friend"
      ? normalizedFriendName
      : t("Friend");
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
      className="relative h-full min-h-0 w-full bg-transparent overflow-hidden"
    >
      <div className="h-full min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
        {/* Left Side - Board Preview */}
        <div
          ref={leftRef}
          className="min-w-0 flex flex-col items-center justify-center p-2 gap-2 h-full"
        >
          {/* Top Opponent Info Bar */}
          <div
            ref={topBarRef}
            className="w-full flex-shrink-0 z-10"
            style={{ width: boardWidth }}
          >
            <PlayerInfo
              name={opponentLabel}
              subtitle={selectedFriend ? t("Friend match") : t("Select friend")}
              rating={selectedFriend?.rating ?? null}
              avatarLetter={opponentLabel.substring(0, 2).toUpperCase() || "F"}
              avatarImage={selectedFriend?.avatar}
              avatarStyle="opponent"
              initialTime={0}
              increment={0}
              isTimerActive={false}
              onTimeOut={() => {}}
              onTimeChange={() => {}}
              showTimer={false}
            />
          </div>

          {/* Chess Board Preview */}
          <div
            className="theme-glass-panel-strong rounded-2xl overflow-hidden"
            style={{ width: boardWidth, height: boardWidth }}
          >
            <Chessboard
              id={`friend-game-setup-board-${previewBoardId}`}
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
            className="w-full flex-shrink-0 z-10"
            style={{ width: boardWidth }}
          >
            <PlayerInfo
              name={user?.fullName || t("You")}
              rating={user?.rating ?? null}
              avatarLetter={user?.fullName?.substring(0, 2).toUpperCase() || "Y"}
              avatarImage={playerAvatarUrl}
              avatarStyle="player"
              initialTime={0}
              increment={0}
              isTimerActive={false}
              onTimeOut={() => {}}
              onTimeChange={() => {}}
              showTimer={false}
            />
          </div>
        </div>

        {/* Right Side - Settings Panel */}
        <div className="theme-glass-panel-strong min-w-0 w-full rounded-none border-l-0 flex flex-col h-full overflow-hidden">
          <div className="flex-1 flex flex-col gap-3 px-3 py-3 overflow-y-auto min-h-0">
            {!hasChosenFriend ? (
              <div className="theme-glass-panel-soft rounded-2xl p-3 flex-shrink-0">
                <div className="relative">
                  <Search className="w-4 h-4 text-theme-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={friendSearch}
                    onChange={(e) => setFriendSearch(e.target.value)}
                    placeholder={t("common.searchByUsername")}
                    className="w-full pl-10 pr-3 py-2 rounded-xl bg-theme-panel/60 text-theme-foreground text-[12px] border border-theme-glass focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[12px] font-semibold text-theme-foreground ">
                    {t("Friends")}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-theme-surface text-theme-muted">
                    {filteredFriends.length}
                  </span>
                </div>

                <div className="mt-1 max-h-48 overflow-y-auto space-y-1 pr-1">
                  {loadingFriends ? (
                    <p className="text-[11px] text-theme-muted py-1">
                      {t("Loading friends...")}
                    </p>
                  ) : friendsError ? (
                    <p className="text-[11px] text-red-500 py-1">{friendsError}</p>
                  ) : filteredFriends.length === 0 ? (
                    <p className="text-[11px] text-theme-muted py-1">
                      {t("No friends found.")}
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
                              : "hover:bg-theme-surface/80"
                          }`}
                        >
                          <div className="w-7 h-7 rounded-md overflow-hidden bg-theme-surface flex-shrink-0">
                            {friend.avatar ? (
                              <img
                                src={friend.avatar}
                                alt={friend.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
                                <span className="text-theme-on-accent font-semibold text-[11px]">
                                  {friend.name.substring(0, 1).toUpperCase()}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[12px] font-semibold text-theme-foreground truncate">
                              {friend.name}
                              {typeof friend.rating === "number" && (
                                <span className="ml-1 text-[11px] font-normal text-theme-muted">
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
                  <div className="flex items-center gap-2 text-[12px] font-semibold text-theme-foreground ">
                    <Users className="w-4 h-4 text-brand-500" />
                    <span>{t("Play vs")}</span>
                  </div>

                  <div className="mt-3 flex flex-col items-center text-center">
                    <div className="w-20 h-20 rounded-lg overflow-hidden bg-theme-surface">
                      {selectedFriend?.avatar ? (
                        <img
                          src={selectedFriend.avatar}
                          alt={opponentLabel}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
                          <span className="text-theme-on-accent font-bold text-xl">
                            {opponentLabel.substring(0, 1).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="mt-2 text-[13px] font-semibold text-theme-foreground ">
                      {opponentLabel}
                      {typeof selectedFriend?.rating === "number" && (
                        <span className="ml-1 text-[12px] font-normal text-theme-muted">
                          ({selectedFriend.rating})
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setHasChosenFriend(false)}
                    className="mt-3 w-full py-2 rounded-xl border border-theme-glass bg-theme-panel/55 text-[12px] font-semibold text-theme-muted hover:bg-theme-panel/75 transition-colors"
                  >
                    {t("Change Friend")}
                  </button>
                </div>

                <div className="theme-glass-panel-soft rounded-2xl p-3">
                  <div className="text-[12px] font-semibold text-theme-foreground mb-2">
                    {t("Game Type")}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsGameTypeOpen((value) => !value)}
                    className="w-full py-3 px-3 rounded-xl bg-theme-panel/55 border border-theme-glass text-theme-foreground flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2 text-[13px] font-semibold">
                      {t(selectedGameType.label)}
                    </span>
                    {isGameTypeOpen ? (
                      <ChevronUp className="w-4 h-4 opacity-80" />
                    ) : (
                      <ChevronDown className="w-4 h-4 opacity-80" />
                    )}
                  </button>

                  {isGameTypeOpen && (
                    <div className="mt-2 rounded-xl border border-theme-glass overflow-hidden">
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
                                ? "bg-brand-500/15 text-brand-600"
                                : "bg-theme-panel/55 hover:bg-theme-panel/75 text-theme-muted "
                            }`}
                          >
                            <span className="flex items-center gap-2 text-[13px] font-medium">
                              <span>{t(option.label)}</span>
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
                    className="w-full py-3 px-3 rounded-xl bg-theme-panel/55 border border-theme-glass text-theme-foreground flex items-center justify-between"
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
                            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-theme-foreground ">
                              <span>{t(group.label)}</span>
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
                                        ? "bg-brand-500/20 text-brand-600 ring-2 ring-brand-500"
                                        : "bg-theme-surface text-theme-muted ring-1 ring-theme-border hover:ring-theme-border"
                                    }`}
                                  >
                                    {t(option.label)}
                                  </button>
                                );
                              })}
                            </div>
                        </div>
                      ))}
                      <div className="theme-glass-panel-soft rounded-xl p-2.5">
                        <div className="text-[12px] font-semibold text-theme-foreground ">
                          {t("Custom")}
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <label className="text-[11px] text-theme-muted">
                            {t("Base (min)")}
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={customBaseMinutes}
                              onChange={(event) =>
                                setCustomBaseMinutes(event.target.value)
                              }
                              className="mt-1 w-full rounded-lg border border-theme-glass bg-theme-panel/60 px-2 py-1.5 text-[12px] text-theme-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                            />
                          </label>
                          <label className="text-[11px] text-theme-muted">
                            {t("Increment (sec)")}
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={customIncrementSeconds}
                              onChange={(event) =>
                                setCustomIncrementSeconds(event.target.value)
                              }
                              className="mt-1 w-full rounded-lg border border-theme-glass bg-theme-panel/60 px-2 py-1.5 text-[12px] text-theme-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          onClick={applyCustomTimeControl}
                          className="mt-2 w-full rounded-lg bg-brand-500/20 text-brand-700 py-1.5 text-[12px] font-semibold ring-1 ring-brand-500/40 hover:bg-brand-500/25 transition-colors"
                        >
                          {t("Apply Custom")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <p className="px-1 text-[11px] text-theme-muted">
                  {t("Friend games are always unrated. Elo does not change.")}
                </p>

                <div className="theme-glass-panel-soft rounded-2xl p-3">
                  <div className="text-[12px] font-semibold text-theme-foreground mb-2"> <Trans>I play as</Trans> </div>
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
                              ? "bg-brand-500/20 border-brand-500 text-brand-600"
                              : "bg-theme-surface border-theme-glass text-theme-muted"
                          }`}
                        >
                          {t(option.label)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {challengeError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-600">
                    {challengeError}
                  </div>
                )}

                {challengeInfo && !challengeError && (
                  <div className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-[12px] text-brand-700">
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
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-brand-500 to-cyan-500 hover:from-brand-600 hover:to-cyan-600 disabled:from-theme-surface disabled:to-theme-surface text-theme-on-accent font-bold text-[15px] transition-all shadow-lg hover:shadow-xl active:scale-[0.98] disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
              >
                <Play className="w-5 h-5" />
                {isSendingChallenge
                  ? t("Sending...")
                  : isRealtimeConnected
                    ? t("Send Challenge")
                    : t("Server Offline")}
              </button>
            ) : (
              <button
                disabled
                className="w-full py-3 rounded-2xl bg-theme-surface text-theme-muted font-bold text-[15px] cursor-not-allowed flex items-center justify-center gap-2"
              >
                {t("Choose Friend First")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

