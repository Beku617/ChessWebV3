import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Image as ImageIcon,
  Send,
  ShieldCheck,
  Video,
  X,
} from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { Avatar } from "./CommunityUI";
import { API_URL, getInitials } from "./types";

const MAX_CHARS = 1200;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

interface ComposerSummary {
  pending: number;
  approved: number;
  rejected: number;
  removed: number;
}

interface PostComposerProps {
  summary?: ComposerSummary | null;
  onSubmitted?: () => void | Promise<void>;
}

function validateFile(file: File, expectedKind: "image" | "video") {
  if (expectedKind === "image") {
    if (!file.type.startsWith("image/")) {
      return "Please choose a supported image file.";
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return "Image is too large. Maximum size is 8MB.";
    }
    return null;
  }

  if (!file.type.startsWith("video/")) {
    return "Please choose a supported video file.";
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return "Video is too large. Maximum size is 50MB.";
  }
  return null;
}

export function PostComposer({ onSubmitted }: PostComposerProps) {
  const { user } = useAuthStore();
  const [content, setContent] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(textarea.scrollHeight, 124)}px`;
  }, [content]);

  const remainingChars = MAX_CHARS - content.length;
  const isOverLimit = remainingChars < 0;
  const canSubmit =
    !isSubmitting && !isOverLimit && (content.trim().length > 0 || !!selectedFile);
  const selectedMediaType = useMemo(() => {
    if (!selectedFile) return "none";
    return selectedFile.type.startsWith("video/") ? "video" : "image";
  }, [selectedFile]);

  const handlePickFile = (kind: "image" | "video", file?: File | null) => {
    if (!file) return;
    const validationError = validateFile(file, kind);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);

    setError("");
    setSuccessMessage("");
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const clearSelectedMedia = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl("");
  };

  const resetComposer = () => {
    setContent("");
    clearSelectedMedia();
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError("");
    setSuccessMessage("");

    try {
      const formData = new FormData();
      if (content.trim()) formData.append("text", content.trim());
      if (selectedFile) formData.append("media", selectedFile);

      const res = await fetch(`${API_URL}/api/community`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to submit post.");
      }

      resetComposer();
      setSuccessMessage(
        "Submitted for review. It will appear in the feed once approved.",
      );
      await onSubmitted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit post.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section
      className={`relative overflow-hidden rounded-2xl backdrop-blur-xl transition-all duration-300 ${
        focused
          ? "bg-[#0d192c]/90 shadow-[0_26px_70px_rgba(0,0,0,0.3)] ring-1 ring-teal-400/25"
          : "bg-[#0c1728]/82 shadow-[0_20px_58px_rgba(0,0,0,0.24)]"
      }`}
    >
      <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-teal-400/35 to-transparent" />

      <div className="p-5">
        <div className="flex gap-4">
          <Avatar initials={getInitials(user?.fullName)} src={user?.avatar} size="md" />

          <div className="flex-1 min-w-0">
            <textarea
              ref={textareaRef}
              value={content}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onChange={(e) => {
                setContent(e.target.value);
                if (error) setError("");
                if (successMessage) setSuccessMessage("");
              }}
              placeholder="Share a game idea, opening line, clip, puzzle moment, or tournament update..."
              className="w-full bg-transparent border-none focus:ring-0 focus:outline-none text-sm text-white placeholder:text-gray-500 resize-none min-h-[124px] leading-8 premium-scrollbar"
            />

            {selectedFile && (
              <div className="mt-3 space-y-3 rounded-xl bg-black/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate">
                      {selectedMediaType === "video" ? "Video attached" : "Image attached"}
                    </div>
                    <div className="mt-1 text-xs text-gray-500 truncate">
                      {selectedFile.name}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={clearSelectedMedia}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05] text-gray-400 hover:bg-red-500/15 hover:text-red-200 transition-colors"
                    title="Remove media"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="overflow-hidden rounded-xl bg-black/45">
                  {selectedMediaType === "video" ? (
                    <video
                      src={previewUrl}
                      controls
                      className="w-full max-h-[420px] bg-black object-contain"
                    />
                  ) : (
                    <img
                      src={previewUrl}
                      alt="Selected preview"
                      className="w-full max-h-[420px] object-contain bg-black"
                    />
                  )}
                </div>
              </div>
            )}

            {(error || successMessage) && (
              <div
                className={`mt-3 flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-sm ${
                  error
                    ? "bg-red-500/10 text-red-200"
                    : "bg-teal-500/10 text-teal-100"
                }`}
              >
                {error ? (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <span>{error || successMessage}</span>
              </div>
            )}

            <input
              ref={imageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => handlePickFile("image", e.target.files?.[0])}
            />
            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              className="hidden"
              onChange={(e) => handlePickFile("video", e.target.files?.[0])}
            />

            <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm text-gray-300 bg-white/[0.04] hover:bg-white/[0.08] hover:text-teal-200 transition-colors"
                >
                  <ImageIcon className="w-4 h-4" />
                  Image
                </button>
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm text-gray-300 bg-white/[0.04] hover:bg-white/[0.08] hover:text-teal-200 transition-colors"
                >
                  <Video className="w-4 h-4" />
                  Video
                </button>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs tabular-nums text-gray-500">
                  {content.length}/{MAX_CHARS}
                </span>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    canSubmit
                      ? "bg-teal-600 hover:bg-teal-500 text-white shadow-[0_12px_30px_rgba(13,148,136,0.28)]"
                      : "bg-white/[0.06] text-gray-500 cursor-not-allowed"
                  }`}
                >
                  <Send className="w-4 h-4" />
                  {isSubmitting ? "Submitting..." : "Submit"}
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
