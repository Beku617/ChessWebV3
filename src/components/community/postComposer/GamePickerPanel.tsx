import { Search, X } from "lucide-react";
import { useTranslation, Trans } from "react-i18next";
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
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-theme-glass bg-theme-panel shadow-[0_20px_50px_rgba(0,0,0,0.28)]">
      <div className="flex items-center justify-between gap-3 border-b border-theme-glass px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-theme-foreground">
            {t("communityComposer.chooseGame")}
          </div>
          <div className="mt-1 text-xs text-theme-muted">
            {t("communityComposer.chooseGameDescription")}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-theme-panel/[0.06] text-theme-muted hover:bg-theme-panel/[0.12] disabled:cursor-not-allowed disabled:opacity-45"
          aria-label={t("communityComposer.closeGamePicker")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="border-b border-theme-glass px-4 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-muted" />
          <input
            value={gameSearch}
            disabled={isSubmitting}
            onChange={(event) => onGameSearchChange(event.target.value)}
            placeholder={t("communityComposer.gameSearchPlaceholder")}
            className="w-full rounded-xl bg-theme-panel/[0.05] py-2.5 pl-10 pr-4 text-sm text-theme-foreground placeholder:text-theme-disabled focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed disabled:opacity-45"
          />
        </div>
      </div>

      <div className="max-h-[420px] overflow-y-auto premium-scrollbar p-3">
        {gamesLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={`game-skeleton-${index}`}
                className="h-24 animate-pulse rounded-2xl bg-theme-panel/[0.05]"
              />
            ))}
          </div>
        ) : gamesError ? (
          <div className="rounded-2xl bg-red-500/10 px-4 py-4 text-sm text-red-200">
            {gamesError}
          </div>
        ) : availableGames.length === 0 ? (
          <div className="rounded-2xl bg-theme-panel/[0.04] px-4 py-8 text-center">
            <div className="text-sm font-medium text-theme-foreground">
              {t("communityComposer.noGamesFound")}
            </div>
            <div className="mt-2 text-xs leading-6 text-theme-muted">
              {t("communityComposer.noGamesFoundDescription")}
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
                      : "border-theme-glass bg-theme-panel/[0.03] hover:border-theme-border hover:bg-theme-panel/[0.05]"
                  } disabled:opacity-60`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-theme-foreground">
                          {t("communityComposer.vsOpponent", {
                            opponent: gameOption.opponent,
                          })}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${perspectiveTone(
                            gameOption.perspectiveResult,
                          )}`}
                        >
                          {formatCommunityPerspectiveResult(gameOption.perspectiveResult)}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-theme-muted">
                        {gameOption.white} <Trans>vs</Trans> {gameOption.black}
                      </div>
                    </div>

                    <div className="shrink-0 text-right text-xs text-theme-muted">
                      <div>{formatGamePlayedAt(gameOption.playedAt)}</div>
                      <div className="mt-1">
                        {t("communityComposer.movesCount", {
                          count: gameOption.totalMoves,
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-theme-muted">
                    <span className="rounded-full bg-theme-panel/[0.05] px-2.5 py-1">
                      {formatCommunityTimeControl(gameOption.timeControl)}
                    </span>
                    <span className="rounded-full bg-theme-panel/[0.05] px-2.5 py-1">
                      {gameOption.variant === "chess960"
                        ? t("Chess960")
                        : gameOption.variant === "kingOfHill"
                          ? t("King of the Hill")
                        : gameOption.variant === "threeCheck"
                          ? t("Three-Check")
                          : t("Standard")}
                    </span>
                    {optionOpening && (
                      <span className="rounded-full bg-theme-panel/[0.05] px-2.5 py-1">
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

