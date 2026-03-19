import { useState, useEffect, useRef } from "react";
import { Chessboard } from "react-chessboard";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  LayoutGrid,
  Timer,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/authStore";
import { BOARD_FRAME } from "./types";
import { useBoardTheme } from "../../hooks/useBoardTheme";

type MatchVariant = "standard" | "chess960";

interface QuickMatchSetupProps {
  timeControl: { initial: number; increment: number };
  onTimeControlChange: (value: { initial: number; increment: number }) => void;
  variant: MatchVariant;
  onVariantChange: (value: MatchVariant) => void;
  onOpenVariantPage: (variantKey: string) => void;
  onStart: () => void;
  isSearching: boolean;
  queueStatus?: string | null;
  isConnected: boolean;
  onCancel: () => void;
  tournamentMode?: boolean;
}

interface GameTypeOption {
  id: string;
  label: string;
  source: "quick" | "variants";
}

interface QuickTimeOption {
  label: string;
  initial: number;
  increment: number;
}

interface QuickTimeGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  options: QuickTimeOption[];
}

const QUICK_TIME_GROUPS: QuickTimeGroup[] = [
  {
    id: "bullet",
    label: "Bullet",
    icon: Zap,
    options: [
      { label: "1 min", initial: 60, increment: 0 },
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
      { label: "5 | 3", initial: 300, increment: 3 },
    ],
  },
  {
    id: "rapid",
    label: "Rapid",
    icon: Clock,
    options: [
      { label: "10 min", initial: 600, increment: 0 },
      { label: "10 | 5", initial: 600, increment: 5 },
      { label: "15 | 10", initial: 900, increment: 10 },
      { label: "30 min", initial: 1800, increment: 0 },
    ],
  },
  {
    id: "classical",
    label: "Classical",
    icon: Clock,
    options: [
      { label: "30 | 20", initial: 1800, increment: 20 },
    ],
  },
];

const GAME_TYPE_OPTIONS: GameTypeOption[] = [
  { id: "standard", label: "Standard", source: "quick" },
  { id: "chess960", label: "Chess960", source: "quick" },
  { id: "kingOfHill", label: "King of the Hill", source: "variants" },
  { id: "threeCheck", label: "Three-Check", source: "variants" },
  { id: "atomic", label: "Atomic", source: "variants" },
  { id: "fourPlayer", label: "4-Player Chess", source: "variants" },
];

function getTimeGroupLabel(timeControl: {
  initial: number;
  increment: number;
}): string {
  const estimatedSeconds = timeControl.initial + timeControl.increment * 40;
  if (estimatedSeconds < 180) return "Bullet";
  if (estimatedSeconds < 600) return "Blitz";
  if (estimatedSeconds < 1800) return "Rapid";
  return "Classical";
}

function formatTimeLabel(timeControl: {
  initial: number;
  increment: number;
}): string {
  const minutes =
    Number.isFinite(timeControl.initial) && timeControl.initial >= 0
      ? Math.round(timeControl.initial / 60)
      : 0;
  if (timeControl.increment > 0) {
    return `${minutes} | ${timeControl.increment}`;
  }
  return `${minutes} min`;
}

export function QuickMatchSetup({
  timeControl,
  onTimeControlChange,
  variant,
  onVariantChange,
  onOpenVariantPage,
  onStart,
  isSearching,
  queueStatus,
  isConnected,
  onCancel,
  tournamentMode = false,
}: QuickMatchSetupProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { colors } = useBoardTheme();

  const [searchElapsedSeconds, setSearchElapsedSeconds] = useState(0);
  const [isGameTypeOpen, setIsGameTypeOpen] = useState(false);
  const [isTimeControlOpen, setIsTimeControlOpen] = useState(false);

  useEffect(() => {
    if (!isSearching) {
      setSearchElapsedSeconds(0);
      return;
    }

    const startedAt = Date.now();
    setSearchElapsedSeconds(0);
    const intervalId = window.setInterval(() => {
      setSearchElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isSearching]);

  // Responsive board width
  const [boardWidth, setBoardWidth] = useState(640);
  const containerRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const topBarRef = useRef<HTMLDivElement>(null);
  const bottomBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = leftRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const padding = 24;
      const headerH = topBarRef.current?.offsetHeight ?? 60;
      const footerH = bottomBarRef.current?.offsetHeight ?? 48;
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

  const selectedTimeOption = (() => {
    for (const group of QUICK_TIME_GROUPS) {
      const option = group.options.find(
        (item) =>
          item.initial === timeControl.initial &&
          item.increment === timeControl.increment,
      );
      if (option) return { ...option, groupLabel: group.label };
    }
    return null;
  })();
  const variantLabel = variant === "chess960" ? t("Chess960") : "";
  const selectedGameType =
    GAME_TYPE_OPTIONS.find((option) => option.id === variant) ||
    GAME_TYPE_OPTIONS[0];
  const timeGroupLabel =
    t(selectedTimeOption?.groupLabel || getTimeGroupLabel(timeControl));
  const timeOptionLabel = selectedTimeOption?.label || formatTimeLabel(timeControl);
  const selectedTimeLabel = selectedTimeOption
    ? `${selectedTimeOption.label} (${t(selectedTimeOption.groupLabel)})`
    : `${timeOptionLabel} (${timeGroupLabel})`;
  const searchingGameText = tournamentMode
    ? queueStatus ||
      t("Waiting for your tournament opponent to open the game link...")
    : `${t("Searching")} ${timeOptionLabel} ${timeGroupLabel}${variantLabel ? " " + variantLabel : ""} ${t("Game")}`;
  const expandedRange = Math.min(
    500,
    50 + Math.floor(searchElapsedSeconds / 5) * 25,
  );

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-0 w-full bg-slate-100 dark:bg-gradient-to-b dark:from-slate-950 dark:via-slate-900 dark:to-slate-950"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(20,184,166,0.14),transparent_48%),radial-gradient(circle_at_85%_10%,rgba(56,189,248,0.08),transparent_42%)]" />
      <div className="relative h-full min-h-0 grid grid-cols-1 lg:grid-cols-2">
        {/* Left Side - Board Preview with Player Info */}
        <div
          ref={leftRef}
          className="flex flex-col items-center justify-center p-4 gap-4 h-full min-h-0"
        >
          {/* Top Opponent Info Bar */}
          <div
            ref={topBarRef}
            className="w-full max-w-[900px] flex items-center gap-3 px-2"
          >
            <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-700 flex-shrink-0">
              <div className="w-full h-full bg-gradient-to-br from-gray-500 to-gray-600 flex items-center justify-center">
                <span className="text-white font-bold text-sm">?</span>
              </div>
            </div>
            <div className="flex-1">
              {isSearching ? (
                  <div className="font-semibold text-gray-900 dark:text-white text-base sm:text-lg">
                  {t("Searching...")}
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-gray-900 dark:text-white text-sm">
                    {t("Opponent")}
                  </span>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">
                    ({t("Waiting...")})
                  </span>
                </div>
              )}
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
            className="w-full max-w-[900px] flex items-center gap-3 px-2 justify-start"
          >
            <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-700 flex-shrink-0">
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.fullName || t("You")}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center">
                  <span className="text-white font-bold text-sm">
                    {user?.fullName?.substring(0, 1).toUpperCase() || t("Y")}
                  </span>
                </div>
              )}
            </div>
            <div className="flex-1">
              <span className="font-semibold text-gray-900 dark:text-white text-sm">
                {user?.fullName || t("You")}
              </span>
            </div>
          </div>
        </div>

        {/* Right Side - Quick Match Panel */}
        <div className="w-full h-full min-h-0 rounded-2xl overflow-hidden bg-white/85 dark:bg-slate-900/75 border border-gray-200/60 dark:border-white/10 shadow-[0_16px_36px_rgba(0,0,0,0.32)] backdrop-blur-md flex flex-col">
          {isSearching ? (
            <>
              <div className="relative flex-1 overflow-hidden">
                <div className="absolute inset-5 lg:inset-6 rounded-2xl border border-gray-200/45 dark:border-white/10 bg-gray-50/20 dark:bg-slate-800/25" />

                <div className="absolute inset-0 flex items-center justify-center px-6">
                  <div className="w-full max-w-[300px] rounded-2xl border border-gray-200/70 dark:border-white/10 bg-white/90 dark:bg-slate-900/85 p-7 text-center shadow-[0_20px_40px_rgba(0,0,0,0.35)]">
                    <Timer className="w-10 h-10 mx-auto text-gray-700 dark:text-gray-200" />
                    <p className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">
                      {searchElapsedSeconds} sec
                    </p>
                    <p className="mt-2 text-lg text-gray-600 dark:text-gray-300">
                      {searchingGameText}
                    </p>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {tournamentMode
                        ? queueStatus || t("Waiting for opponent...")
                        : queueStatus || `${t("Rating range:")} ±${expandedRange}`}
                    </p>
                    <button
                      type="button"
                      onClick={onCancel}
                      className="mt-7 text-base font-medium text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                      {t("Cancel")}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Panel Header */}
              <div className="px-4 py-3 border-b border-gray-200/55 dark:border-white/10">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-teal-500" />
                    <h2 className="font-bold text-base text-gray-900 dark:text-white">
                      {tournamentMode
                        ? t("Tournament Game")
                        : `${t("Quick Match")}${variant === "chess960" ? ` — ${t("Chess960")}` : ""}`}
                    </h2>
                  </div>
                  {!tournamentMode && (
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300 px-2 py-0.5 text-[11px] font-semibold">
                        {timeOptionLabel}
                      </span>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        {timeGroupLabel}
                      </span>
                    </div>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  {tournamentMode
                    ? t("Your tournament pairing will start as soon as both players join.")
                    : t("Find an opponent and start playing instantly.")}
                </p>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4">
                {!tournamentMode && (
                  <>
                    {/* Game Type */}
                    <div className="rounded-2xl border border-gray-200/55 dark:border-white/10 bg-white/60 dark:bg-slate-900/45 p-3">
                      <div className="text-[12px] font-semibold text-gray-900 dark:text-white mb-2">
                        {t("Game Type")}
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsGameTypeOpen((value) => !value)}
                        className="w-full py-3 px-3 rounded-xl bg-gray-100 dark:bg-slate-800 border border-gray-200/70 dark:border-white/10 text-gray-800 dark:text-gray-100 flex items-center justify-between"
                      >
                        <span className="flex items-center gap-2 text-[13px] font-semibold">
                          <LayoutGrid className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                          {t(selectedGameType.label)}
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
                            const isActive = selectedGameType.id === option.id;
                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => {
                                  if (option.source === "quick") {
                                    onVariantChange(option.id as MatchVariant);
                                  } else {
                                    onOpenVariantPage(option.id);
                                  }
                                  setIsGameTypeOpen(false);
                                }}
                                className={`w-full px-3 py-2.5 flex items-center justify-between text-left transition-colors ${
                                  isActive
                                    ? "bg-teal-500/15 text-teal-600 dark:text-teal-300"
                                    : "bg-white dark:bg-slate-900 hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-gray-200"
                                }`}
                              >
                                <span className="text-[13px] font-medium">
                                  {t(option.label)}
                                </span>
                                {option.source === "variants" ? (
                                  <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Time Control */}
                    <div className="rounded-2xl border border-gray-200/55 dark:border-white/10 bg-white/60 dark:bg-slate-900/45 p-3">
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
                          {QUICK_TIME_GROUPS.map((group) => {
                            const GroupIcon = group.icon;
                            return (
                              <div key={group.id}>
                                <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-gray-800 dark:text-gray-200">
                                  <GroupIcon className="w-4 h-4 text-yellow-500" />
                                  <span>{t(group.label)}</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                  {group.options.map((opt) => {
                                    const isSelected =
                                      timeControl.initial === opt.initial &&
                                      timeControl.increment === opt.increment;
                                    return (
                                      <button
                                        key={`${group.id}-${opt.label}`}
                                        onClick={() => {
                                          onTimeControlChange({
                                            initial: opt.initial,
                                            increment: opt.increment,
                                          });
                                          setIsTimeControlOpen(false);
                                        }}
                                        className={`py-2 rounded-lg text-[12px] font-semibold transition-all ${
                                          isSelected
                                            ? "bg-teal-500/20 text-teal-600 dark:text-teal-300 ring-2 ring-teal-500"
                                            : "bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 ring-1 ring-gray-200 dark:ring-slate-700 hover:ring-gray-300 dark:hover:ring-slate-600"
                                        }`}
                                      >
                                        {opt.label}
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
                  </>
                )}

                {tournamentMode && (
                  <div className="rounded-2xl border border-gray-200/55 dark:border-white/10 bg-white/60 dark:bg-slate-900/45 p-3 text-sm text-gray-700 dark:text-gray-200">
                    {t("This is a tournament pairing. The game will start automatically once both players join this link. You can keep this tab open; no extra matchmaking is needed.")}
                  </div>
                )}
              </div>

              {!tournamentMode && (
                <div className="p-4 pt-3 border-t border-gray-200/55 dark:border-white/10 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                  <button
                    onClick={onStart}
                    disabled={isSearching || !isConnected}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold text-lg transition-all shadow-lg hover:shadow-xl active:scale-[0.98] disabled:cursor-not-allowed disabled:shadow-none"
                  >
                    {isSearching
                      ? t("Searching...")
                      : isConnected
                        ? t("Play")
                        : t("Server Offline")}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
