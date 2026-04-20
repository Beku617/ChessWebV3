import { Search, X } from "lucide-react";
import {
  formatCommunityPerspectiveResult,
  formatCommunityTimeControl,
  formatGamePlayedAt,
  getCommunityOpeningLabel,
  type CommunityShareableGameSummary,
} from "../types";
import { perspectiveTone } from "./utils";

interface GamePickerPanelProps {
  isOpen: boolean;
  isSubmitting: boolean;
  gameSearch: string;
  gamesLoading: boolean;
  gamesError: string;
  availableGames: CommunityShareableGameSummary[];
  selectedGameSummary: CommunityShareableGameSummary | null;
  isLoadingSelectedGame: boolean;
  onClose: () => void;
  onGameSearchChange: (value: string) => void;
  onChooseGame: (gameSummary: CommunityShareableGameSummary) => void;
}

export function GamePickerPanel({
  isOpen,
  isSubmitting,
  gameSearch,
  gamesLoading,
  gamesError,
  availableGames,
  selectedGameSummary,
  isLoadingSelectedGame,
  onClose,
  onGameSearchChange,
  onChooseGame,
}: GamePickerPanelProps) {
  if (!isOpen) return null;

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-[#0b1424]/96 shadow-[0_20px_50px_rgba(0,0,0,0.28)]">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-white">Choose a game</div>
          <div className="mt-1 text-xs text-gray-500">
            Share one of your recent games with a caption and mini-board replay.
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] text-gray-300 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-45"
          aria-label="Close game picker"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="border-b border-white/[0.06] px-4 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            value={gameSearch}
            disabled={isSubmitting}
            onChange={(event) => onGameSearchChange(event.target.value)}
            placeholder="Search by opponent, opening, result, or time control..."
            className="w-full rounded-xl bg-white/[0.05] py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed disabled:opacity-45"
          />
        </div>
      </div>

      <div className="max-h-[420px] overflow-y-auto premium-scrollbar p-3">
        {gamesLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={`game-skeleton-${index}`}
                className="h-24 animate-pulse rounded-2xl bg-white/[0.05]"
              />
            ))}
          </div>
        ) : gamesError ? (
          <div className="rounded-2xl bg-red-500/10 px-4 py-4 text-sm text-red-200">
            {gamesError}
          </div>
        ) : availableGames.length === 0 ? (
          <div className="rounded-2xl bg-white/[0.04] px-4 py-8 text-center">
            <div className="text-sm font-medium text-white">No games found</div>
            <div className="mt-2 text-xs leading-6 text-gray-500">
              Finish a few games first, or try a broader search.
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {availableGames.map((gameOption) => {
              const isSelected = selectedGameSummary?.id === gameOption.id;
              const optionOpening = getCommunityOpeningLabel(
                gameOption.eco,
                gameOption.event,
              );

              return (
                <button
                  key={gameOption.id}
                  type="button"
                  onClick={() => onChooseGame(gameOption)}
                  disabled={isLoadingSelectedGame || isSubmitting}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${
                    isSelected
                      ? "border-brand-400/35 bg-brand-500/10"
                      : "border-white/[0.06] bg-white/[0.03] hover:border-white/[0.12] hover:bg-white/[0.05]"
                  } disabled:opacity-60`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-white">
                          vs {gameOption.opponent}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${perspectiveTone(
                            gameOption.perspectiveResult,
                          )}`}
                        >
                          {formatCommunityPerspectiveResult(gameOption.perspectiveResult)}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-gray-400">
                        {gameOption.white} vs {gameOption.black}
                      </div>
                    </div>

                    <div className="shrink-0 text-right text-xs text-gray-500">
                      <div>{formatGamePlayedAt(gameOption.playedAt)}</div>
                      <div className="mt-1">{gameOption.totalMoves} moves</div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                    <span className="rounded-full bg-white/[0.05] px-2.5 py-1">
                      {formatCommunityTimeControl(gameOption.timeControl)}
                    </span>
                    <span className="rounded-full bg-white/[0.05] px-2.5 py-1">
                      {gameOption.variant === "chess960"
                        ? "Chess960"
                        : gameOption.variant === "kingOfHill"
                          ? "King of the Hill"
                        : gameOption.variant === "threeCheck"
                          ? "Three-Check"
                          : "Standard"}
                    </span>
                    {optionOpening && (
                      <span className="rounded-full bg-white/[0.05] px-2.5 py-1">
                        {optionOpening}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

