import { Gamepad2, X } from "lucide-react";
import { CommunityGameViewer } from "../CommunityGameViewer";
import {
  formatCommunityPerspectiveResult,
  formatCommunityTimeControl,
  formatGamePlayedAt,
  type CommunityShareableGameSummary,
  type CommunitySharedGame,
} from "../types";
import { perspectiveTone } from "./utils";

interface SelectedGamePreviewProps {
  selectedGameSummary: CommunityShareableGameSummary | null;
  selectedGame: CommunitySharedGame | null;
  openingLabel: string;
  isLoadingSelectedGame: boolean;
  isSubmitting: boolean;
  onToggleGamePicker: () => void;
  onClearSelectedGame: () => void;
}

export function SelectedGamePreview({
  selectedGameSummary,
  selectedGame,
  openingLabel,
  isLoadingSelectedGame,
  isSubmitting,
  onToggleGamePicker,
  onClearSelectedGame,
}: SelectedGamePreviewProps) {
  if (!selectedGameSummary) return null;

  return (
    <div className="mt-2 overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.025]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-teal-200/70">
            Share Game
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-white">
            vs {selectedGameSummary.opponent}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 font-semibold ${perspectiveTone(
                selectedGameSummary.perspectiveResult,
              )}`}
            >
              {formatCommunityPerspectiveResult(selectedGameSummary.perspectiveResult)}
            </span>
            <span>{formatCommunityTimeControl(selectedGameSummary.timeControl)}</span>
            {openingLabel && <span className="truncate">{openingLabel}</span>}
            {selectedGameSummary.playedAt && (
              <span>{formatGamePlayedAt(selectedGameSummary.playedAt)}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isLoadingSelectedGame || isSubmitting}
            onClick={onToggleGamePicker}
            className="inline-flex items-center gap-2 rounded-lg bg-white/[0.06] px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/[0.12] disabled:opacity-50"
          >
            <Gamepad2 className="h-4 w-4" />
            Change
          </button>
          <button
            type="button"
            disabled={isLoadingSelectedGame || isSubmitting}
            onClick={onClearSelectedGame}
            className="inline-flex items-center gap-2 rounded-lg bg-white/[0.06] px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/[0.12] disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            Remove
          </button>
        </div>
      </div>

      <div className="px-4 pb-4">
        {isLoadingSelectedGame || !selectedGame ? (
          <div className="mt-3 rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
            <div className="h-[320px] animate-pulse rounded-[18px] bg-white/[0.06]" />
          </div>
        ) : (
          <CommunityGameViewer game={selectedGame} />
        )}
      </div>
    </div>
  );
}
