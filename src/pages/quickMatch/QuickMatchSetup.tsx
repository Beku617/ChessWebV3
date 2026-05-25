import { useState, useEffect, useId, useRef } from "react";
import { Chessboard } from "react-chessboard";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  LayoutGrid,
  Timer,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/authStore";
import { PlayerInfo } from "../../components/game";
import { BOARD_FRAME } from "./types";
import { useBoardTheme } from "../../hooks/useBoardTheme";

type MatchVariant =
  | "standard"
  | "chess960"
  | "threeCheck"
  | "kingOfHill"
  | "atomic";

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
  options: QuickTimeOption[];
}

const QUICK_TIME_GROUPS: QuickTimeGroup[] = [
  {
    id: "bullet",
    label: "Bullet",
    options: [
      { label: "1 min", initial: 60, increment: 0 },
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
      { label: "5 | 3", initial: 300, increment: 3 },
    ],
  },
  {
    id: "rapid",
    label: "Rapid",
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
    options: [
      { label: "90 | 30", initial: 5400, increment: 30 },
    ],
  },
];

const GAME_TYPE_OPTIONS: GameTypeOption[] = [
  { id: "standard", label: "Standard", source: "quick" },
  { id: "chess960", label: "Chess960", source: "quick" },
  { id: "kingOfHill", label: "King of the Hill", source: "variants" },
  { id: "threeCheck", label: "Three-Check", source: "variants" },
  { id: "atomic", label: "Atomic Chess", source: "variants" },
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
  const [customBaseMinutes, setCustomBaseMinutes] = useState(() =>
    String(Math.max(1, Math.round(timeControl.initial / 60))),
  );
  const [customIncrementSeconds, setCustomIncrementSeconds] = useState(() =>
    String(Math.max(0, Math.round(timeControl.increment))),
  );

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

  useEffect(() => {
    setCustomBaseMinutes(String(Math.max(1, Math.round(timeControl.initial / 60))));
    setCustomIncrementSeconds(String(Math.max(0, Math.round(timeControl.increment))));
  }, [timeControl.initial, timeControl.increment]);

  // Responsive board width
  const [boardWidth, setBoardWidth] = useState(640);
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
      const containerStyles = window.getComputedStyle(container);
      const paddingLeft = parseFloat(containerStyles.paddingLeft || "0") || 0;
      const paddingRight = parseFloat(containerStyles.paddingRight || "0") || 0;
      const paddingTop = parseFloat(containerStyles.paddingTop || "0") || 0;
      const paddingBottom = parseFloat(containerStyles.paddingBottom || "0") || 0;
      const rowGap = parseFloat(containerStyles.rowGap || containerStyles.gap || "0") || 0;
      const headerH = topBarRef.current?.offsetHeight ?? 60;
      const footerH = bottomBarRef.current?.offsetHeight ?? 48;
      const gapsBetweenSections = rowGap * 2;
      const availableWidth =
        rect.width - (paddingLeft + paddingRight) - BOARD_FRAME;
      const availableHeight =
        rect.height -
        headerH -
        footerH -
        (paddingTop + paddingBottom) -
        gapsBetweenSections;
      const size = Math.floor(Math.min(availableWidth, availableHeight));
      setBoardWidth(Math.max(320, Math.min(size, 720)));
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
  const variantLabel =
    variant === "chess960"
      ? t("Chess960")
      : variant === "kingOfHill"
        ? t("King of the Hill")
      : variant === "threeCheck"
        ? t("Three-Check")
        : variant === "atomic"
          ? t("Atomic Chess")
        : "";
  const selectedGameType =
    GAME_TYPE_OPTIONS.find((option) => option.id === variant) ||
    GAME_TYPE_OPTIONS[0];
  const timeGroupLabel =
    t(selectedTimeOption?.groupLabel || getTimeGroupLabel(timeControl));
  const timeOptionLabel = selectedTimeOption
    ? t(selectedTimeOption.label)
    : formatTimeLabel(timeControl);
  const selectedTimeLabel = selectedTimeOption
    ? `${t(selectedTimeOption.label)} (${t(selectedTimeOption.groupLabel)})`
    : `${timeOptionLabel} (${timeGroupLabel})`;
  const isUnratedVariant =
    variant === "chess960" ||
    variant === "threeCheck" ||
    variant === "kingOfHill" ||
    variant === "atomic";
  const searchingForOpponentLabel = t(
    "quickMatch.search.searchingForOpponent",
    "Searching for opponent...",
  );
  const waitingForOpponentLabel = t(
    "quickMatch.search.waitingForOpponent",
    "Waiting for opponent...",
  );
  const waitingForTournamentOpponentLabel = t(
    "quickMatch.search.waitingTournamentOpponent",
    "Waiting for your tournament opponent to open the game link...",
  );
  const tournamentPairingInfoLabel = t(
    "quickMatch.search.tournamentPairingInfo",
    "This is a tournament pairing. The game will start automatically once both players join this link. You can keep this tab open; no extra matchmaking is needed.",
  );
  const searchingStatusLabel = t(
    "quickMatch.search.statusSearching",
    "Searching...",
  );
  const searchingStatusLabelBase = searchingStatusLabel.replace(
    /\s*\.{3}\s*$/,
    "",
  );
  const localizedQueueStatus = (() => {
    if (!queueStatus) return null;
    const trimmedStatus = queueStatus.trim();

    if (/^Searching for opponent\.\.\.$/i.test(trimmedStatus)) {
      return searchingForOpponentLabel;
    }

    const rangeMatch = trimmedStatus.match(
      /^Searching for opponent\s*\((?:\u00B1|\+\/-)?\s*(\d+)\)\.\.\.$/i,
    );
    if (rangeMatch) {
      return `${searchingForOpponentLabel.replace(/\.\.\.$/, "")} (+/-${rangeMatch[1]})...`;
    }

    if (/^Waiting for opponent\.\.\.$/i.test(trimmedStatus)) {
      return waitingForOpponentLabel;
    }

    if (/^Waiting for your tournament opponent\.\.\.$/i.test(trimmedStatus)) {
      return waitingForTournamentOpponentLabel;
    }

    if (
      /^Waiting for your tournament opponent to open the game link\.\.\.$/i.test(
        trimmedStatus,
      )
    ) {
      return waitingForTournamentOpponentLabel;
    }

    return queueStatus;
  })();
  const searchingGameText = tournamentMode
    ? localizedQueueStatus || waitingForTournamentOpponentLabel
    : `${searchingStatusLabelBase} ${timeOptionLabel} ${timeGroupLabel}${variantLabel ? " " + variantLabel : ""} ${t("Game")}`;
  const expandedRange = Math.min(
    500,
    50 + Math.floor(searchElapsedSeconds / 5) * 25,
  );
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
      className="relative h-full min-h-0 w-full bg-theme-primary"
    >
      <div className="relative h-full min-h-0 grid grid-cols-1 lg:grid-cols-2">
        {/* Left Side - Board Preview with Player Info */}
        <div
          ref={leftRef}
          className="flex flex-col items-center justify-center p-4 gap-4 h-full min-h-0 bg-theme-primary"
        >
          {/* Top Opponent Info Bar */}
          <div
            ref={topBarRef}
            className="w-full flex-shrink-0 z-10"
            style={{ width: boardWidth, backgroundColor: "var(--bg-panel)" }}
          >
            <PlayerInfo
              name={isSearching ? searchingStatusLabel : ""}
              subtitle={isSearching ? searchingGameText : ""}
              avatarLetter="?"
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
            className="rounded-2xl overflow-hidden shadow-2xl border border-theme-glass/60 "
            style={{ width: boardWidth, height: boardWidth }}
          >
            <Chessboard
              id={`quick-match-setup-board-${previewBoardId}`}
              boardWidth={boardWidth}
              position="start"
              arePiecesDraggable={false}
              customSquareStyles={
                variant === "kingOfHill"
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
            style={{ width: boardWidth, backgroundColor: "var(--bg-panel)" }}
          >
            <PlayerInfo
              name={user?.fullName || t("You")}
              rating={isUnratedVariant ? null : (user?.rating ?? null)}
              avatarLetter={user?.fullName?.substring(0, 2).toUpperCase() || "Y"}
              avatarImage={user?.avatar}
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

        {/* Right Side - Quick Match Panel */}
        <div
          className="theme-glass-panel-strong w-full h-full min-h-0 rounded-2xl overflow-hidden flex flex-col"
          style={{ backgroundColor: "var(--bg-base)" }}
        >
          {isSearching ? (
            <>
              <div className="relative flex-1 overflow-hidden">
                <div
                  className="theme-glass-panel-soft absolute inset-5 lg:inset-6 rounded-2xl"
                  style={{ backgroundColor: "var(--bg-surface)" }}
                />

                <div className="absolute inset-0 flex items-center justify-center px-6">
                  <div
                    className="theme-glass-panel-strong w-full max-w-[300px] rounded-2xl p-7 text-center"
                    style={{ backgroundColor: "var(--bg-panel)" }}
                  >
                    <Timer className="w-10 h-10 mx-auto text-theme-muted " />
                    <p className="mt-3 text-2xl font-semibold text-theme-foreground ">
                      {searchElapsedSeconds} {t("tournamentsPage.units.secAbbr", "s")}
                    </p>
                    <p className="mt-2 text-lg text-theme-muted">
                      {searchingGameText}
                    </p>
                    <p className="mt-1 text-sm text-theme-muted">
                      {tournamentMode
                        ? localizedQueueStatus || waitingForOpponentLabel
                        : localizedQueueStatus ||
                          (isUnratedVariant
                            ? searchingForOpponentLabel
                            : `${t("Rating range:")} +/-${expandedRange}`)}
                    </p>
                    <button
                      type="button"
                      onClick={onCancel}
                      className="mt-7 text-base font-medium text-theme-muted hover:text-theme-foreground transition-colors"
                    >
                      {t("Cancel")}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4">
                {!tournamentMode && (
                  <>
                    {/* Game Type */}
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
                          <LayoutGrid className="w-4 h-4 text-theme-muted" />
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
                                    ? "bg-brand-500/15 text-brand-600"
                                    : "bg-theme-panel/55 hover:bg-theme-panel/75 text-theme-muted "
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
                          {QUICK_TIME_GROUPS.map((group) => {
                            return (
                              <div key={group.id}>
                                <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-theme-foreground ">
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
                                            ? "bg-brand-500/20 text-brand-600 ring-2 ring-brand-500"
                                            : "bg-theme-surface text-theme-muted ring-1 ring-theme-border hover:ring-theme-border"
                                        }`}
                                      >
                                        {t(opt.label)}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
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
                  </>
                )}

                {tournamentMode && (
                  <div className="theme-glass-panel-soft rounded-2xl p-3 text-sm text-theme-muted ">
                    {tournamentPairingInfoLabel}
                  </div>
                )}
              </div>

              {!tournamentMode && (
                <div className="p-4 pt-3 border-t border-theme-glass pb-[calc(1rem+env(safe-area-inset-bottom))]">
                  <button
                    onClick={onStart}
                    disabled={isSearching || !isConnected}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-brand-500 to-brand-500 hover:from-brand-600 hover:to-brand-600 disabled:from-theme-surface disabled:to-theme-surface text-theme-on-accent font-bold text-lg transition-all shadow-lg hover:shadow-xl active:scale-[0.98] disabled:cursor-not-allowed disabled:shadow-none"
                  >
                    {isSearching
                      ? searchingStatusLabel
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

