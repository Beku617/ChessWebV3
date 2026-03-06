/* ═══════════════════════════════════════════════════════
   Post Composer — Premium glass card
   ═══════════════════════════════════════════════════════ */
import { useState, useRef, useEffect } from "react";
import {
  Image as ImageIcon,
  FileText,
  BarChart3,
  Smile,
  Send,
  Puzzle,
  Trophy,
  X,
  Bold,
  Italic,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar } from "./CommunityUI";
import { useAuthStore } from "../../store/authStore";

const MAX_CHARS = 500;

interface ComposerProps {
  onPost?: (content: string) => void;
}

export function PostComposer({ onPost }: ComposerProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [content, setContent] = useState("");
  const [focused, setFocused] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.max(el.scrollHeight, 64)}px`;
    }
  }, [content]);

  const handlePost = () => {
    if (!content.trim()) return;
    onPost?.(content);
    setContent("");
    setAttachments([]);
  };

  const remaining = MAX_CHARS - content.length;
  const isOverLimit = remaining < 0;
  const initials = user?.fullName?.substring(0, 2).toUpperCase() || "U";

  const actionButtons = [
    {
      icon: ImageIcon,
      label: t("Image"),
      color: "text-blue-400 hover:bg-blue-500/10",
    },
    {
      icon: FileText,
      label: t("PGN"),
      color: "text-teal-400 hover:bg-teal-500/10",
    },
    {
      icon: BarChart3,
      label: t("Poll"),
      color: "text-purple-400 hover:bg-purple-500/10",
    },
    {
      icon: Puzzle,
      label: t("Puzzle"),
      color: "text-amber-400 hover:bg-amber-500/10",
    },
    {
      icon: Trophy,
      label: t("Game"),
      color: "text-emerald-400 hover:bg-emerald-500/10",
    },
    {
      icon: Smile,
      label: t("Emoji"),
      color: "text-yellow-400 hover:bg-yellow-500/10",
    },
  ];

  return (
    <div
      className={`relative rounded-2xl border transition-all duration-300 overflow-hidden ${
        focused
          ? "border-teal-500/40 bg-white/80 dark:bg-gray-900/80 shadow-lg shadow-teal-500/5"
          : "border-gray-200/50 dark:border-gray-800/60 bg-white/60 dark:bg-gray-900/50"
      } backdrop-blur-xl`}
    >
      {/* Glow accent when focused */}
      {focused && (
        <div className="absolute inset-0 bg-gradient-to-br from-teal-500/[0.03] via-transparent to-purple-500/[0.02] pointer-events-none" />
      )}

      <div className="relative p-5">
        <div className="flex gap-4">
          <Avatar initials={initials} src={user?.avatar} size="md" online />
          <div className="flex-1 min-w-0">
            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={t("Share a game, puzzle, or thought...")}
              className="w-full bg-transparent border-none focus:ring-0 focus:outline-none text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 resize-none min-h-[64px] leading-relaxed"
              rows={2}
            />

            {/* Action Bar */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-800/50">
              <div className="flex items-center gap-0.5">
                {actionButtons.map(({ icon: Icon, label, color }) => (
                  <button
                    key={label}
                    type="button"
                    title={label}
                    className={`p-2 rounded-lg ${color} transition-all duration-150`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3">
                {/* Character counter */}
                {content.length > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="relative w-6 h-6">
                      <svg className="w-6 h-6 -rotate-90" viewBox="0 0 24 24">
                        <circle
                          cx="12"
                          cy="12"
                          r="10"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="text-gray-200 dark:text-gray-800"
                        />
                        <circle
                          cx="12"
                          cy="12"
                          r="10"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeDasharray={`${Math.min((content.length / MAX_CHARS) * 62.83, 62.83)} 62.83`}
                          className={
                            isOverLimit
                              ? "text-red-500"
                              : remaining <= 50
                                ? "text-amber-500"
                                : "text-teal-500"
                          }
                        />
                      </svg>
                    </div>
                    {remaining <= 50 && (
                      <span
                        className={`text-xs font-bold tabular-nums ${
                          isOverLimit ? "text-red-500" : "text-amber-500"
                        }`}
                      >
                        {remaining}
                      </span>
                    )}
                  </div>
                )}

                {/* Post button */}
                <button
                  onClick={handlePost}
                  disabled={!content.trim() || isOverLimit}
                  className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all duration-200 ${
                    content.trim() && !isOverLimit
                      ? "bg-teal-600 hover:bg-teal-500 text-white shadow-lg shadow-teal-900/20 hover:shadow-teal-900/30 hover:scale-[1.02] active:scale-[0.98]"
                      : "bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  <span>{t("Post")}</span>
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
