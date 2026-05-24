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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white"> <Trans>Delete Bot</Trans> </h2>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          > <Trans>Close</Trans> </button>
        </div>

        {/* Content */}
        <div className="mb-6">
          <p className="text-gray-600 dark:text-gray-400 mb-4"> <Trans>Are you sure you want to delete</Trans>{" "}
            <strong className="text-gray-900 dark:text-white">
              {bot.name}
            </strong>
            ?
          </p>

          {/* Bot Preview */}
          <div className="flex items-center gap-3 p-4 rounded-xl bg-gray-100 dark:bg-slate-800">
            <div>
              <div className="font-semibold text-gray-900 dark:text-white">
                {bot.name}
              </div>
              <div className="text-sm text-gray-500">
                {bot.eloRating} <Trans>ELO -</Trans> {bot.difficulty}
              </div>
            </div>
          </div>

          {bot.isActive && (
            <div className="mt-4 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
              <p className="text-sm text-yellow-800 dark:text-yellow-200"> <Trans>This bot is currently active and visible to users.</Trans> </p>
            </div>
          )}

          <p className="text-sm text-gray-500 mt-4"> <Trans>This action cannot be undone. The bot will be permanently removed from the system.</Trans> </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          > <Trans>Cancel</Trans> </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2 rounded-lg bg-red-500 text-white font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete Bot"}
          </button>
        </div>
      </div>
    </div>
  );
}
