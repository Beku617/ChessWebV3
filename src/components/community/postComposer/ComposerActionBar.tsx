import { Gamepad2, Image as ImageIcon, Send, Video } from "lucide-react";
import type {
  CommunityGroup,
  CommunityShareableGameSummary,
} from "../types";

interface ComposerActionBarProps {
  availableGroups: CommunityGroup[];
  selectedGroupId: string;
  selectedGroup: CommunityGroup | null;
  lockGroupSelection: boolean;
  mediaControlsDisabled: boolean;
  isGamePickerOpen: boolean;
  selectedGameSummary: CommunityShareableGameSummary | null;
  submissionBlockedMessage: string;
  contentLength: number;
  canSubmitNow: boolean;
  isSubmitting: boolean;
  isSubmissionBlocked: boolean;
  onSelectedGroupIdChange: (value: string) => void;
  onOpenImagePicker: () => void;
  onOpenVideoPicker: () => void;
  onToggleGamePicker: () => void;
  onSubmit: () => void;
}

export function ComposerActionBar({
  availableGroups,
  selectedGroupId,
  selectedGroup,
  lockGroupSelection,
  mediaControlsDisabled,
  isGamePickerOpen,
  selectedGameSummary,
  submissionBlockedMessage,
  contentLength,
  canSubmitNow,
  isSubmitting,
  isSubmissionBlocked,
  onSelectedGroupIdChange,
  onOpenImagePicker,
  onOpenVideoPicker,
  onToggleGamePicker,
  onSubmit,
}: ComposerActionBarProps) {
  return (
    <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        {(availableGroups.length > 0 || selectedGroupId) &&
          (lockGroupSelection ? (
            <div className="inline-flex items-center gap-2 rounded-lg bg-brand-500/12 px-3.5 py-2 text-sm text-brand-100">
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand-200/70">
                Group
              </span>
              <span className="font-medium">
                {selectedGroup?.name || "Selected group"}
              </span>
            </div>
          ) : (
            <label className="inline-flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-white/[0.08]">
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-500">
                Group
              </span>
              <select
                value={selectedGroupId}
                onChange={(event) => onSelectedGroupIdChange(event.target.value)}
                className="min-w-[150px] bg-transparent text-sm text-gray-200 focus:outline-none"
              >
                <option value="" className="bg-[#0d192c] text-white">
                  General community
                </option>
                {availableGroups.map((group) => (
                  <option
                    key={group.id}
                    value={group.id}
                    className="bg-[#0d192c] text-white"
                  >
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
          ))}

        <button
          type="button"
          disabled={mediaControlsDisabled}
          onClick={onOpenImagePicker}
          className="inline-flex items-center gap-2 rounded-lg bg-white/[0.04] px-3.5 py-2 text-sm text-gray-300 transition-colors hover:bg-white/[0.08] hover:text-brand-200 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ImageIcon className="h-4 w-4" />
          Image
        </button>
        <button
          type="button"
          disabled={mediaControlsDisabled}
          onClick={onOpenVideoPicker}
          className="inline-flex items-center gap-2 rounded-lg bg-white/[0.04] px-3.5 py-2 text-sm text-gray-300 transition-colors hover:bg-white/[0.08] hover:text-brand-200 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Video className="h-4 w-4" />
          Video
        </button>
        <button
          type="button"
          disabled={mediaControlsDisabled}
          onClick={() => {
            if (mediaControlsDisabled && submissionBlockedMessage) return;
            onToggleGamePicker();
          }}
          className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
            isGamePickerOpen || selectedGameSummary
              ? "bg-brand-500/16 text-brand-100 hover:bg-brand-500/22"
              : "bg-white/[0.04] text-gray-300 hover:bg-white/[0.08] hover:text-brand-200"
          }`}
        >
          <Gamepad2 className="h-4 w-4" />
          {selectedGameSummary ? "Change Game" : "Share Game"}
        </button>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs tabular-nums text-gray-500">{contentLength}</span>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmitNow}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
            canSubmitNow
              ? "bg-brand-600 text-white shadow-[0_12px_30px_rgba(13,148,136,0.28)] hover:bg-brand-500"
              : "cursor-not-allowed bg-white/[0.06] text-gray-500"
          }`}
        >
          <Send className="h-4 w-4" />
          {isSubmitting ? "Submitting..." : isSubmissionBlocked ? "Unavailable" : "Submit"}
        </button>
      </div>
    </div>
  );
}

