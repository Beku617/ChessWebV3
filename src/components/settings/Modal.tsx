import type { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-md",
}: ModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            onClick={(e) => e.stopPropagation()}
            className={`${maxWidth} theme-glass-panel-strong flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-2xl`}
          >
            <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-theme-glass">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {title}
              </h3>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white/45 dark:hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto overscroll-contain px-6 py-5 premium-scrollbar">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
