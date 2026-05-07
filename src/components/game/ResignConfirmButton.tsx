import {
  type ButtonHTMLAttributes,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useState,
} from "react";
import { createPortal } from "react-dom";

interface ResignConfirmButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  children: ReactNode;
  onConfirm: () => void;
}

export function ResignConfirmButton({
  children,
  disabled,
  onConfirm,
  type = "button",
  ...buttonProps
}: ResignConfirmButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  const handleOpen = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
  }, [disabled]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleConfirm = useCallback(() => {
    setIsOpen(false);
    onConfirm();
  }, [onConfirm]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const confirmDialog = isOpen ? (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="theme-glass-panel-strong w-full max-w-[420px] overflow-hidden rounded-2xl border border-theme-glass shadow-[0_28px_90px_rgba(0,0,0,0.35)]"
      >
        <div className="px-6 pt-6 pb-5">
          <h2
            id={titleId}
            className="text-lg font-semibold text-gray-900 dark:text-white"
          >
            Resign Game?
          </h2>
          <p
            id={descriptionId}
            className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300"
          >
            Are you sure you want to resign this game? This will count as a
            loss.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2.5 border-t border-theme-glass px-6 py-4">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-theme-glass bg-white/70 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-white/80 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500"
          >
            Resign
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        {...buttonProps}
        type={type}
        disabled={disabled}
        onClick={handleOpen}
      >
        {children}
      </button>

      {confirmDialog && typeof document !== "undefined"
        ? createPortal(confirmDialog, document.body)
        : confirmDialog}
    </>
  );
}
