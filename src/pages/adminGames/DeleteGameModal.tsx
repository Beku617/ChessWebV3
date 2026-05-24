import { Trans } from "react-i18next";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { AdminGame } from "./types";

interface DeleteGameModalProps {
  isOpen: boolean;
  game: AdminGame | null;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}

export function DeleteGameModal({
  isOpen,
  game,
  deleting,
  onClose,
  onConfirm,
}: DeleteGameModalProps) {
  if (!isOpen || !game) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-gray-800 shadow-2xl p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white"> <Trans>Delete Game</Trans> </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1"> <Trans>This will permanently remove the game record and cannot be undone.</Trans> </p>
            <p className="text-sm text-gray-700 dark:text-gray-300 mt-3 font-medium">
              {game.white} <Trans>vs</Trans> {game.black}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
          > <Trans>Cancel</Trans> </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {deleting && <Loader2 className="w-4 h-4 animate-spin" />} <Trans>Delete</Trans> </button>
        </div>
      </div>
    </div>
  );
}
