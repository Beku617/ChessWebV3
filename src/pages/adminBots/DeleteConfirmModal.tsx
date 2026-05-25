import { Trans } from "react-i18next";
import type { BotData } from "./types";

interface DeleteConfirmModalProps {
  isOpen: boolean;
  bot: BotData | null;
  onClose: () => void;
  onConfirm: () => void;
  deleting: boolean;
}

export function DeleteConfirmModal({
  isOpen,
  bot,
  onClose,
  onConfirm,
  deleting,
}: DeleteConfirmModalProps) {
  if (!isOpen || !bot) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-theme-panel/50 backdrop-blur-sm">
      <div className="bg-theme-panel rounded-2xl shadow-2xl w-full max-w-md p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-theme-foreground "> <Trans>Delete Bot</Trans> </h2>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-theme-muted hover:bg-theme-surface transition-colors"
          > <Trans>Close</Trans> </button>
        </div>

        {/* Content */}
        <div className="mb-6">
          <p className="text-theme-muted mb-4"> <Trans>Are you sure you want to delete</Trans>{" "}
            <strong className="text-theme-foreground ">
              {bot.name}
            </strong>
            ?
          </p>

          {/* Bot Preview */}
          <div className="flex items-center gap-3 p-4 rounded-xl bg-theme-surface">
            <div>
              <div className="font-semibold text-theme-foreground ">
                {bot.name}
              </div>
              <div className="text-sm text-theme-muted">
                {bot.eloRating} <Trans>ELO -</Trans> {bot.difficulty}
              </div>
            </div>
          </div>

          {bot.isActive && (
            <div className="mt-4 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
              <p className="text-sm text-yellow-800"> <Trans>This bot is currently active and visible to users.</Trans> </p>
            </div>
          )}

          <p className="text-sm text-theme-muted mt-4"> <Trans>This action cannot be undone. The bot will be permanently removed from the system.</Trans> </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-theme-glass text-theme-muted hover:bg-theme-surface transition-colors"
          > <Trans>Cancel</Trans> </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2 rounded-lg bg-red-500 text-theme-on-accent font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete Bot"}
          </button>
        </div>
      </div>
    </div>
  );
}
