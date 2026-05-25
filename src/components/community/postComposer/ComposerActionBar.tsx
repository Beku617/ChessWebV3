import { Gamepad2, Image as ImageIcon, Send, Video } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();

  return (
    <div className="mt-4 flex items-center justify-between border-t border-theme-glass pt-3">
      <div className="flex flex-wrap items-center gap-2">
        {(availableGroups.length > 0 || selectedGroupId) &&
          (lockGroupSelection ? (
            <div className="inline-flex items-center gap-2 rounded-lg bg-brand-500/12 px-3.5 py-2 text-sm text-brand-100">
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand-200/70">
                {t("communityComposer.group")}
              </span>
              <span className="font-medium">
                {selectedGroup?.name || t("communityComposer.selectedGroup")}
              </span>
            </div>
          ) : (
            <label className="inline-flex items-center gap-2 rounded-lg bg-theme-panel/[0.04] px-3 py-2 text-sm text-theme-muted transition-colors hover:bg-theme-panel/[0.08]">
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-theme-muted">
                {t("communityComposer.group")}
              </span>
              <select
                value={selectedGroupId}
                onChange={(event) => onSelectedGroupIdChange(event.target.value)}
                className="min-w-[150px] bg-transparent text-sm text-theme-muted focus:outline-none"
              >
                <option value="" className="bg-theme-panel text-theme-foreground">
                  {t("communityComposer.generalCommunity")}
                </option>
                {availableGroups.map((group) => (
                  <option
                    key={group.id}
                    value={group.id}
                    className="bg-theme-panel text-theme-foreground"
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
          className="inline-flex items-center gap-2 rounded-lg bg-theme-panel/[0.04] px-3.5 py-2 text-sm text-theme-muted transition-colors hover:bg-theme-panel/[0.08] hover:text-brand-200 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ImageIcon className="h-4 w-4" />
          {t("communityComposer.image")}
        </button>
        <button
          type="button"
          disabled={mediaControlsDisabled}
          onClick={onOpenVideoPicker}
          className="inline-flex items-center gap-2 rounded-lg bg-theme-panel/[0.04] px-3.5 py-2 text-sm text-theme-muted transition-colors hover:bg-theme-panel/[0.08] hover:text-brand-200 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Video className="h-4 w-4" />
          {t("communityComposer.video")}
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
              : "bg-theme-panel/[0.04] text-theme-muted hover:bg-theme-panel/[0.08] hover:text-brand-200"
          }`}
        >
          <Gamepad2 className="h-4 w-4" />
          {selectedGameSummary
            ? t("communityComposer.changeGame")
            : t("communityComposer.shareGame")}
        </button>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs tabular-nums text-theme-muted">{contentLength}</span>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmitNow}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
            canSubmitNow
              ? "bg-brand-600 text-theme-on-accent shadow-[0_12px_30px_rgba(13,148,136,0.28)] hover:bg-brand-500"
              : "cursor-not-allowed bg-theme-panel/[0.06] text-theme-muted"
          }`}
        >
          <Send className="h-4 w-4" />
          {isSubmitting
            ? t("communityComposer.submitting")
            : isSubmissionBlocked
              ? t("communityComposer.unavailable")
              : t("communityComposer.submit")}
        </button>
      </div>
    </div>
  );
}

