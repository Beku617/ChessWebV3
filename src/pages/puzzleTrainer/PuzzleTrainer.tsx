import { useEffect, useId, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import {
  ArrowRight,
  Bookmark,
  Clock3,
  Lightbulb,
  Loader2,
  RefreshCcw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import Sidebar from "../../components/Sidebar";
import { usePuzzleTrainer } from "./usePuzzleTrainer";
import { TRAINER_MODES } from "./types";
import { formatTime } from "./utils";
import { useGameplayPreferences } from "../../hooks/useGameplayPreferences";

const RIGHT_PANEL_MIN_WIDTH = 460;
const LEFT_SECTION_X_PADDING = 12;
const LEFT_SECTION_Y_PADDING = 6;
const BOARD_FRAME_PADDING = 4;
const BOARD_MIN_SIZE = 280;
const BOARD_MAX_SIZE = 1600;

const surfaceClass = "rounded-2xl border border-white/10 bg-[#0f1b31]";
const statCardClass = `${surfaceClass} px-4 py-3`;
const cardClass = `${surfaceClass} p-4`;

const secondaryButtonClass =
  "inline-flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#13203a] px-3.5 text-xs font-semibold text-slate-100 transition-colors hover:bg-[#182742] disabled:cursor-not-allowed disabled:opacity-50";

const primaryButtonClass =
  "inline-flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-3.5 text-xs font-semibold text-emerald-100 transition-colors hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50";

function ratingDeltaClass(delta: number) {
  if (delta > 0) return "text-emerald-300";
  if (delta < 0) return "text-red-300";
  return "text-slate-300";
}

export default function PuzzleTrainer() {
  const { t } = useTranslation();
  const { allowClickInput, allowDragInput } = useGameplayPreferences();
  const puzzleTrainerBoardId = useId().replace(/:/g, "");
  const {
    loading,
    status,
    hintLevel,
    elapsedTime,
    game,
    fenError,
    networkError,
    currentPuzzle,
    solutionMoves,
    puzzleElo,
    streak,
    attemptFeedback,
    selectionReason,
    activeMode,
    customSquareStyles,
    puzzleStartsWithWhite,
    solutionLineVisible,
    isSolutionAnimating,
    onDrop,
    handleSquareClick,
    handleSquareRightClick,
    nextPuzzle,
    retryPuzzle,
    useHint,
    showSolution,
    toggleBookmark,
    openMode,
    navigate,
  } = usePuzzleTrainer();

  const mainLayoutRef = useRef<HTMLDivElement | null>(null);
  const [boardSize, setBoardSize] = useState(640);

  useEffect(() => {
    document.documentElement.classList.add("puzzle-trainer-lock");
    document.body.classList.add("puzzle-trainer-lock");

    return () => {
      document.documentElement.classList.remove("puzzle-trainer-lock");
      document.body.classList.remove("puzzle-trainer-lock");
    };
  }, []);

  useEffect(() => {
    const mainLayout = mainLayoutRef.current;
    if (!mainLayout) return;

    const updateSize = () => {
      const rect = mainLayout.getBoundingClientRect();

      const availableHeight =
        rect.height - LEFT_SECTION_Y_PADDING * 2 - BOARD_FRAME_PADDING * 2;

      const availableWidth =
        rect.width -
        RIGHT_PANEL_MIN_WIDTH -
        LEFT_SECTION_X_PADDING * 2 -
        BOARD_FRAME_PADDING * 2;

      const nextBoard = Math.max(
        BOARD_MIN_SIZE,
        Math.floor(Math.min(availableWidth, availableHeight, BOARD_MAX_SIZE)),
      );

      setBoardSize((prev) => (prev === nextBoard ? prev : nextBoard));
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(mainLayout);
    window.addEventListener("resize", updateSize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  const leftColumnWidth =
    boardSize + LEFT_SECTION_X_PADDING * 2 + BOARD_FRAME_PADDING * 2;
  const ratingDelta = attemptFeedback?.ratingChange ?? 0;
  const showRatingDelta = ratingDelta !== 0;
  const sideToMoveLabel = puzzleStartsWithWhite
    ? t("puzzles.trainer.whiteToMove", "White to move")
    : t("puzzles.trainer.blackToMove", "Black to move");

  return (
    <div className="h-screen overflow-hidden bg-[#070b14] text-white">
      <div className="flex h-full overflow-hidden">
        <Sidebar />

        <main className="ml-[60px] min-h-0 min-w-0 flex-1 overflow-hidden md:ml-72">
          <div className="grid h-full grid-rows-[54px_minmax(0,1fr)] overflow-hidden bg-[#0d1322]">
            <div className="flex items-stretch gap-[2px] overflow-x-auto overflow-y-hidden border-b border-white/10 bg-[#0c1630] px-5 no-scrollbar">
              {TRAINER_MODES.map((tab) => {
                const active = tab.mode === activeMode;

                return (
                  <button
                    key={tab.mode}
                    type="button"
                    onClick={() => openMode(tab.mode)}
                    className={`relative h-full px-3.5 text-[12.5px] font-medium transition-colors ${
                      active
                        ? "text-emerald-300 after:absolute after:bottom-0 after:left-[10px] after:right-[10px] after:h-0.5 after:rounded-t-[2px] after:bg-emerald-300"
                        : "text-slate-400 hover:text-slate-100"
                    }`}
                  >
                    {t(`puzzles.modeLabels.${tab.mode}`, tab.label)}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => navigate("/puzzles/history")}
                className="relative h-full px-3.5 text-[12.5px] font-medium text-slate-400 transition-colors hover:text-slate-100"
              >
                {t("puzzles.trainer.historyTab", "History")}
              </button>
            </div>

            <div
              ref={mainLayoutRef}
              className="grid min-h-0 overflow-hidden"
              style={{
                gridTemplateColumns: `${leftColumnWidth}px minmax(${RIGHT_PANEL_MIN_WIDTH}px, 1fr)`,
              }}
            >
              <section
                className="min-h-0 overflow-hidden bg-[#0b1222] pt-1.5 pb-1.5"
                style={{
                  paddingLeft: LEFT_SECTION_X_PADDING,
                  paddingRight: LEFT_SECTION_X_PADDING,
                }}
              >
                <div
                  className="h-full overflow-hidden rounded-3xl border border-white/10 bg-[#0d1629]"
                  style={{ padding: BOARD_FRAME_PADDING }}
                >
                  <div className="flex h-full w-full items-start justify-start overflow-hidden">
                    {loading ? (
                      <div className="flex h-full w-full flex-col items-center justify-center px-4 text-center">
                        <Loader2 className="mb-3 h-10 w-10 animate-spin text-emerald-400" />
                        <p className="text-sm text-slate-300">
                          {t("puzzles.trainer.loading", "Loading puzzle...")}
                        </p>
                      </div>
                    ) : networkError ? (
                      <div className="max-w-[680px] rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                        {networkError}
                      </div>
                    ) : !currentPuzzle ? (
                      <div className="flex h-full w-full items-center justify-center px-6">
                        <div className="max-w-md text-center">
                          <p className="text-lg font-semibold text-slate-100">
                            {activeMode === "review"
                              ? t(
                                  "puzzles.trainer.noReviewTitle",
                                  "No review puzzles right now",
                                )
                              : t(
                                  "puzzles.trainer.noPuzzleTitle",
                                  "No puzzle available",
                                )}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-slate-400">
                            {activeMode === "review"
                              ? t(
                                  "puzzles.trainer.noReviewDescription",
                                  "You are all caught up. Solve a rated puzzle to generate new reviews.",
                                )
                              : selectionReason ||
                                t(
                                  "puzzles.trainer.noPuzzleDescription",
                                  "Please try again in a moment.",
                                )}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-start">
                        <div
                          className="aspect-square overflow-hidden rounded-[22px] border border-white/10 bg-[#0f1b2d] shadow-[0_16px_38px_rgba(0,0,0,0.34)]"
                          style={{ width: boardSize, height: boardSize }}
                        >
                          <Chessboard
                            id={`puzzle-trainer-board-${puzzleTrainerBoardId}`}
                            allowDragOutsideBoard={false}
                            position={game.fen()}
                            onPieceDrop={(sourceSquare, targetSquare) => {
                              if (!allowDragInput) return false;
                              return onDrop(sourceSquare, targetSquare);
                            }}
                            onSquareClick={(square) => {
                              if (!allowClickInput) return;
                              handleSquareClick(square);
                            }}
                            onSquareRightClick={handleSquareRightClick}
                            boardOrientation={
                              puzzleStartsWithWhite ? "white" : "black"
                            }
                            customSquareStyles={customSquareStyles}
                            customDarkSquareStyle={{
                              backgroundColor: "#7f9f59",
                            }}
                            customLightSquareStyle={{
                              backgroundColor: "#e7e3c7",
                            }}
                            animationDuration={isSolutionAnimating ? 850 : 200}
                            boardWidth={boardSize}
                            arePiecesDraggable={
                              allowDragInput &&
                              status === "solving" &&
                              !isSolutionAnimating
                            }
                            dropOffBoardAction="snapback"
                          />
                        </div>

                        {fenError && (
                          <p className="mt-2 px-1 text-xs text-red-300">
                            {fenError}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <aside className="min-h-0 overflow-y-auto overflow-x-hidden border-l border-white/10 bg-[#0d172b] px-4 py-3">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className={statCardClass}>
                      <p className="text-slate-400">
                        {t("puzzles.trainer.puzzleElo", "Puzzle Elo")}
                      </p>
                      <p className="mt-1 flex items-baseline gap-2 text-[30px] font-semibold leading-none text-emerald-200">
                        {puzzleElo}
                        {showRatingDelta ? (
                          <span
                            className={`text-base font-medium ${ratingDeltaClass(
                              ratingDelta,
                            )}`}
                          >
                            ({ratingDelta > 0 ? "+" : ""}
                            {ratingDelta})
                          </span>
                        ) : null}
                      </p>
                    </div>

                    <div className={statCardClass}>
                      <p className="text-slate-400">
                        {t("puzzles.trainer.streak", "Streak")}
                      </p>
                      <p className="mt-1 text-[30px] font-semibold leading-none text-amber-200">
                        {streak}
                      </p>
                    </div>
                  </div>

                  <div className={cardClass}>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                      {t("puzzles.trainer.sideToMove", "Side to move")}
                    </p>

                    {currentPuzzle ? (
                      <div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-[#101d33] px-3.5 py-3">
                        <span
                          className={`h-4 w-4 rounded-full border ${
                            puzzleStartsWithWhite
                              ? "border-slate-200 bg-white"
                              : "border-slate-500 bg-slate-900"
                          }`}
                          aria-hidden="true"
                        />
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {sideToMoveLabel}
                          </p>
                          <p className="text-xs text-slate-400">
                            {puzzleStartsWithWhite
                              ? t(
                                  "puzzles.trainer.playFirstMoveWhite",
                                  "Play the first move for White.",
                                )
                              : t(
                                  "puzzles.trainer.playFirstMoveBlack",
                                  "Play the first move for Black.",
                                )}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-slate-500">
                        {t(
                          "puzzles.trainer.waitingForPuzzle",
                          "Waiting for puzzle...",
                        )}
                      </p>
                    )}
                  </div>

                  <div className={cardClass}>
                    <p className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                      <Clock3 className="h-2 w-3.5 text-slate-300" />
                      {t("puzzles.trainer.timer", "Timer")}
                    </p>
                    <p className="mt-2 text-3xl font-mono leading-none text-white">
                      {formatTime(elapsedTime)}
                    </p>
                  </div>

                  <div className={cardClass}>
                    <div className="grid grid-cols-1 gap-2">
                      <button
                        type="button"
                        onClick={toggleBookmark}
                        disabled={!currentPuzzle || isSolutionAnimating}
                        className={secondaryButtonClass}
                      >
                        <span className="inline-flex items-center gap-2">
                          <Bookmark className="h-3.5 w-3.5" />
                          {currentPuzzle?.userState?.isBookmarked
                            ? t("puzzles.trainer.bookmarked", "Bookmarked")
                            : t("puzzles.trainer.bookmark", "Bookmark")}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={useHint}
                        disabled={
                          isSolutionAnimating ||
                          hintLevel >= 1 ||
                          status !== "solving"
                        }
                        className={secondaryButtonClass}
                      >
                        <span className="inline-flex items-center gap-2">
                          <Lightbulb className="h-3.5 w-3.5 text-amber-300" />
                          {hintLevel >= 1
                            ? t("puzzles.trainer.hintUsed", "Hint Used")
                            : t("puzzles.trainer.useHint", "Use Hint")}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={showSolution}
                        disabled={
                          isSolutionAnimating ||
                          status !== "solving"
                        }
                        className={secondaryButtonClass}
                      >
                        <span className="inline-flex items-center gap-2">
                          {t(
                            "puzzles.trainer.showSolution",
                            "Show Solution",
                          )}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={retryPuzzle}
                        disabled={isSolutionAnimating}
                        className={secondaryButtonClass}
                      >
                        <span className="inline-flex items-center gap-2">
                          <RefreshCcw className="h-3.5 w-3.5" />
                          {t("puzzles.trainer.tryAgain", "Try Again")}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={nextPuzzle}
                        disabled={isSolutionAnimating}
                        className={primaryButtonClass}
                      >
                        <span className="inline-flex items-center gap-2">
                          {activeMode === "random"
                            ? t(
                                "puzzles.trainer.shufflePuzzle",
                                "Shuffle Puzzle",
                              )
                            : t("puzzles.trainer.nextPuzzle", "Next Puzzle")}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className={cardClass}>
                    <p className="mb-3 text-xs uppercase tracking-[0.16em] text-slate-400">
                      {t("puzzles.trainer.line", "Line")}
                    </p>

                    {!solutionLineVisible ? (
                      <p className="text-xs leading-5 text-slate-500">
                        {t(
                          "puzzles.trainer.revealLine",
                          "Click Show Solution to reveal the line.",
                        )}
                      </p>
                    ) : solutionMoves.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        {t("puzzles.trainer.noStoredLine", "No stored line.")}
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {solutionMoves.map((move, index) => (
                          <span
                            key={`${move}-${index}`}
                            className="rounded-lg border border-white/10 bg-[#101a2f] px-2.5 py-1 text-[11px] font-mono text-slate-200"
                          >
                            {move}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
