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
import { API_URL, CommunityPostingAccess, getInitials } from "./types";

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
  postingAccess?: CommunityPostingAccess | null;
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

function formatDateTime(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(valueMs: number) {
  const totalMinutes = Math.max(1, Math.ceil(valueMs / (60 * 1000)));
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function buildSubmissionBlockedMessage(postingAccess?: CommunityPostingAccess | null) {
  if (!postingAccess || postingAccess.canSubmit) return "";

  if (postingAccess.reason === "restricted") {
    if (postingAccess.restriction?.forever) {
      return postingAccess.restriction.reason
        ? `Posting is restricted by moderation. Reason: ${postingAccess.restriction.reason}`
        : "Posting is currently restricted by moderation.";
    }

    const untilLabel = formatDateTime(postingAccess.restriction?.until);
    const base = untilLabel
      ? `Posting is temporarily restricted until ${untilLabel}.`
      : "Posting is temporarily restricted by moderation.";
    return postingAccess.restriction.reason
      ? `${base} Reason: ${postingAccess.restriction.reason}`
      : base;
  }

  if (postingAccess.reason === "rate_limited") {
    const retryAt = postingAccess.rateLimit?.retryAt
      ? new Date(postingAccess.rateLimit.retryAt)
      : null;
    const remainingMs =
      retryAt && Number.isFinite(retryAt.getTime())
        ? Math.max(0, retryAt.getTime() - Date.now())
        : 0;
    const waitText =
      remainingMs > 0 ? ` Try again in ${formatDuration(remainingMs)}.` : "";
    return `You've reached the posting limit (${postingAccess.rateLimit.maxPosts} posts every 3 hours).${waitText}`;
  }

  return "Posting is unavailable right now.";
}

export function PostComposer({
  summary,
  postingAccess,
  onSubmitted,
}: PostComposerProps) {
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

  const resetFileInputs = () => {
    if (imageInputRef.current) imageInputRef.current.value = "";
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  const openFilePicker = (kind: "image" | "video") => {
    const input = kind === "image" ? imageInputRef.current : videoInputRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  };

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const hasText = content.trim().length > 0;
    const minHeight = selectedFile ? (hasText ? 30 : 48) : 124;
    textarea.style.height = `${Math.max(textarea.scrollHeight, minHeight)}px`;
  }, [content, selectedFile]);

  const remainingChars = MAX_CHARS - content.length;
  const isOverLimit = remainingChars < 0;
  const canSubmit =
    !isSubmitting && !isOverLimit && (content.trim().length > 0 || !!selectedFile);
  const selectedMediaType = useMemo(() => {
    if (!selectedFile) return "none";
    return selectedFile.type.startsWith("video/") ? "video" : "image";
  }, [selectedFile]);
  const submissionBlockedMessage = useMemo(
    () => buildSubmissionBlockedMessage(postingAccess),
    [postingAccess],
  );
  const isSubmissionBlocked = submissionBlockedMessage.length > 0;
  const canSubmitNow = canSubmit && !isSubmissionBlocked;

  const handlePickFile = (kind: "image" | "video", file?: File | null) => {
    if (isSubmissionBlocked) {
      setError(submissionBlockedMessage);
      return;
    }
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
    resetFileInputs();
  };

  const resetComposer = () => {
    setContent("");
    clearSelectedMedia();
  };

  const handleSubmit = async () => {
    if (isSubmissionBlocked) {
      setError(submissionBlockedMessage);
      return;
    }
    if (!canSubmitNow) return;

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
              className={`w-full bg-transparent border-none focus:ring-0 focus:outline-none text-sm text-white placeholder:text-gray-500 resize-none premium-scrollbar ${
                selectedFile
                  ? content.trim().length > 0
                    ? "min-h-[30px] leading-6"
                    : "min-h-[48px] leading-6"
                  : "min-h-[124px] leading-8"
              }`}
            />

            {selectedFile && (
              <div className="mt-1.5">
                <div className="relative overflow-hidden rounded-xl border border-black/80 bg-black/55">
                  <button
                    type="button"
                    onClick={clearSelectedMedia}
                    className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-gray-200 hover:bg-black/80 hover:text-white transition-colors"
                    title="Remove media"
                  >
                    <X className="w-4 h-4" />
                  </button>
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

            {(error || successMessage || submissionBlockedMessage) && (
              <div
                className={`mt-3 flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-sm ${
                  error
                    ? "bg-red-500/10 text-red-200"
                    : submissionBlockedMessage
                      ? "bg-amber-500/10 text-amber-100"
                      : "bg-teal-500/10 text-teal-100"
                }`}
              >
                {error || submissionBlockedMessage ? (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <span>{error || submissionBlockedMessage || successMessage}</span>
              </div>
            )}

            {summary && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                <span className="rounded-full bg-white/[0.04] px-2.5 py-1">
                  Pending {summary.pending}
                </span>
                <span className="rounded-full bg-white/[0.04] px-2.5 py-1">
                  Approved {summary.approved}
                </span>
                <span className="rounded-full bg-white/[0.04] px-2.5 py-1">
                  Rejected {summary.rejected}
                </span>
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
                  disabled={isSubmissionBlocked}
                  onClick={() => openFilePicker("image")}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm text-gray-300 bg-white/[0.04] hover:bg-white/[0.08] hover:text-teal-200 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <ImageIcon className="w-4 h-4" />
                  Image
                </button>
                <button
                  type="button"
                  disabled={isSubmissionBlocked}
                  onClick={() => openFilePicker("video")}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm text-gray-300 bg-white/[0.04] hover:bg-white/[0.08] hover:text-teal-200 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
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
                  disabled={!canSubmitNow}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    canSubmitNow
                      ? "bg-teal-600 hover:bg-teal-500 text-white shadow-[0_12px_30px_rgba(13,148,136,0.28)]"
                      : "bg-white/[0.06] text-gray-500 cursor-not-allowed"
                  }`}
                >
                  <Send className="w-4 h-4" />
                  {isSubmitting
                    ? "Submitting..."
                    : isSubmissionBlocked
                      ? "Unavailable"
                      : "Submit"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
