import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check } from "lucide-react";

interface ToastProps {
  message: string;
  type?: "success" | "error";
  visible: boolean;
  onClose: () => void;
}

export function Toast({
  message,
  type = "success",
  visible,
  onClose,
}: ToastProps) {
  useEffect(() => {
    if (visible) {
      const t = setTimeout(onClose, 3000);
      return () => clearTimeout(t);
    }
  }, [visible, onClose]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -30 }}
          className="fixed top-6 right-6 z-[9999]"
        >
          <div
            className={`flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl border backdrop-blur-xl ${
              type === "success"
                ? "bg-brand-500/90 border-brand-400/30 text-white"
                : "bg-red-500/90 border-red-400/30 text-white"
            }`}
          >
            {type === "success" ? (
              <Check className="w-4 h-4" />
            ) : (
              <X className="w-4 h-4" />
            )}
            <span className="text-sm font-semibold">{message}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

