import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

type DeleteConversationModalProps = {
  actionLoading: "archive" | "delete" | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function DeleteConversationModal({
  actionLoading,
  isOpen,
  onClose,
  onConfirm,
}: DeleteConversationModalProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-theme-panel/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="relative mx-4 w-full max-w-md rounded-2xl border border-theme-glass bg-theme-panel p-5 shadow-[0_20px_40px_rgba(0,0,0,0.6)] ring-1 ring-black/40"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-rose-600/35 via-amber-500/35 to-pink-500/35 text-rose-100 ring-1 ring-rose-500/30">
            <Trash2 className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h4 className="text-lg font-semibold text-theme-foreground">
              {t("messages.deleteConfirmTitle", "Delete conversation?")}
            </h4>
            <p className="mt-1 text-sm text-theme-muted">
              {t("messages.deleteConfirmBody")}
            </p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-theme-glass bg-theme-panel px-4 text-sm font-medium text-theme-foreground transition-colors hover:bg-theme-panel focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
            type="button"
            disabled={actionLoading === "delete"}
            onClick={onConfirm}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-gradient-to-r from-rose-600 via-amber-500 to-pink-500 px-4 text-sm font-semibold text-theme-on-accent shadow-[0_12px_32px_rgba(225,29,72,0.35)] transition-transform hover:translate-y-[-1px] focus:outline-none focus:ring-2 focus:ring-rose-400/40 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {t("messages.confirmDelete", "Delete")}
          </button>
        </div>
      </div>
    </div>
  );
}

