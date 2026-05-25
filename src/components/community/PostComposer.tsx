import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Gamepad2,
  Image as ImageIcon,
  Search,
  Send,
  ShieldCheck,
  Video,
  X,
} from "lucide-react";
import type { GameHistory } from "../../historyTypes";
import { useAuthStore } from "../../store/authStore";
import { CommunityGameViewer } from "./CommunityGameViewer";
import { CommunityImageGrid } from "./CommunityImageGrid";
import { Avatar } from "./CommunityUI";
import { useTranslation } from "react-i18next";
import {
  API_URL,
  CommunityGroup,
  CommunityPostingAccess,
  CommunityShareableGameSummary,
  CommunityShareableGamesResponse,
  CommunitySharedGame,
  communityGameFromHistory,
  formatCommunityPerspectiveResult,
  formatCommunityTimeControl,
  formatGamePlayedAt,
  getCommunityOpeningLabel,
  getInitials,
} from "./types";

const MAX_CHARS = 1200;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_COUNT = 10;
const MAX_TOTAL_IMAGE_BYTES = 40 * 1024 * 1024;

interface SelectedComposerImage {
  id: string;
  file: File;
  previewUrl: string;
}

interface ComposerSummary {
  pending: number;
  approved: number;
  rejected: number;
  removed: number;
}

interface PostComposerProps {
  summary?: ComposerSummary | null;
  postingAccess?: CommunityPostingAccess | null;
  availableGroups?: CommunityGroup[];
  defaultGroupId?: string | null;
  lockGroupSelection?: boolean;
  onSubmitted?: () => void | Promise<void>;
}

function validateFile(file: File, expectedKind: "image" | "video") {
  if (expectedKind === "image") {
    if (!file.type.startsWith("image/")) {
      return "communityComposer.errors.supportedImage";
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return "communityComposer.errors.imageTooLarge";
    }
    return null;
  }

  if (!file.type.startsWith("video/")) {
    return "communityComposer.errors.supportedVideo";
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return "communityComposer.errors.videoTooLarge";
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

function getImageSelectionId(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function totalImageBytes(items: Pick<SelectedComposerImage, "file">[]) {
  return items.reduce((total, item) => total + Number(item.file.size || 0), 0);
}

function buildSubmissionBlockedMessage(
  postingAccess: CommunityPostingAccess | null | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (!postingAccess || postingAccess.canSubmit) return "";

  if (postingAccess.reason === "restricted") {
    if (postingAccess.restriction?.forever) {
      return postingAccess.restriction.reason
        ? t("communityComposer.errors.restrictedWithReason", {
            reason: postingAccess.restriction.reason,
          })
        : t("communityComposer.errors.restricted");
    }

    const untilLabel = formatDateTime(postingAccess.restriction?.until);
    const base = untilLabel
      ? t("communityComposer.errors.temporarilyRestrictedUntil", {
          until: untilLabel,
        })
      : t("communityComposer.errors.temporarilyRestricted");
    return postingAccess.restriction.reason
      ? t("communityComposer.errors.temporarilyRestrictedWithReason", {
          base,
          reason: postingAccess.restriction.reason,
        })
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
      remainingMs > 0
        ? t("communityComposer.errors.tryAgainIn", {
            duration: formatDuration(remainingMs),
          })
        : "";
    return t("communityComposer.errors.rateLimited", {
      maxPosts: postingAccess.rateLimit.maxPosts,
      waitText,
    });
  }

  return t("communityComposer.errors.unavailable");
}

function perspectiveTone(value: CommunityShareableGameSummary["perspectiveResult"]) {
  if (value === "win") return "bg-brand-500/12 text-brand-200";
  if (value === "loss") return "bg-red-500/12 text-red-200";
  if (value === "draw") return "bg-theme-surface/14 text-theme-foreground";
  return "bg-theme-panel/[0.06] text-theme-muted";
}

async function fetchGameDetail(gameId: string) {
  const res = await fetch(`${API_URL}/api/history/${gameId}`, {
    credentials: "include",
  });
  const data: { game?: GameHistory; error?: string } = await res.json().catch(() => ({}));
  if (!res.ok || !data.game) {
    throw new Error(data.error || "communityComposer.errors.loadSelectedGame");
  }
  return data.game;
}

export function PostComposer({
  postingAccess,
  availableGroups = [],
  defaultGroupId = "",
  lockGroupSelection = false,
  onSubmitted,
}: PostComposerProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [content, setContent] = useState("");
  const [selectedImages, setSelectedImages] = useState<SelectedComposerImage[]>([]);
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [selectedVideoPreviewUrl, setSelectedVideoPreviewUrl] = useState("");
  const [selectedGameSummary, setSelectedGameSummary] =
    useState<CommunityShareableGameSummary | null>(null);
  const [selectedGame, setSelectedGame] = useState<CommunitySharedGame | null>(null);
  const [isLoadingSelectedGame, setIsLoadingSelectedGame] = useState(false);
  const [isGamePickerOpen, setIsGamePickerOpen] = useState(false);
  const [gameSearch, setGameSearch] = useState("");
  const [availableGames, setAvailableGames] = useState<CommunityShareableGameSummary[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [gamesError, setGamesError] = useState("");
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState(String(defaultGroupId || ""));
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const selectedImagesRef = useRef<SelectedComposerImage[]>([]);
  const selectedVideoPreviewRef = useRef("");

  const resetFileInputs = () => {
    if (imageInputRef.current) imageInputRef.current.value = "";
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  const openFilePicker = (kind: "image" | "video") => {
    if (isSubmitting) return;
    const input = kind === "image" ? imageInputRef.current : videoInputRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  };

  const clearSelectedGame = () => {
    setSelectedGameSummary(null);
    setSelectedGame(null);
    setIsLoadingSelectedGame(false);
  };

  useEffect(() => {
    selectedImagesRef.current = selectedImages;
  }, [selectedImages]);

  useEffect(() => {
    selectedVideoPreviewRef.current = selectedVideoPreviewUrl;
  }, [selectedVideoPreviewUrl]);

  useEffect(() => {
    return () => {
      selectedImagesRef.current.forEach((image) => {
        URL.revokeObjectURL(image.previewUrl);
      });
      if (selectedVideoPreviewRef.current) {
        URL.revokeObjectURL(selectedVideoPreviewRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const hasText = content.trim().length > 0;
    const hasSelectedMedia = selectedImages.length > 0 || !!selectedVideoFile;
    const minHeight = hasSelectedMedia || selectedGameSummary ? (hasText ? 30 : 48) : 124;
    textarea.style.height = `${Math.max(textarea.scrollHeight, minHeight)}px`;
  }, [content, selectedGameSummary, selectedImages.length, selectedVideoFile]);

  useEffect(() => {
    if (!isGamePickerOpen) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setGamesLoading(true);
      setGamesError("");
      try {
        const params = new URLSearchParams({ limit: "16" });
        if (gameSearch.trim()) params.set("search", gameSearch.trim());

        const res = await fetch(`${API_URL}/api/community/shareable-games?${params}`, {
          credentials: "include",
          signal: controller.signal,
        });
        const data: CommunityShareableGamesResponse & { error?: string } =
          await res.json().catch(() => ({ games: [], total: 0 }));
        if (!res.ok) {
          throw new Error(data.error || t("communityComposer.errors.loadGamesFailed"));
        }
        setAvailableGames(data.games || []);
      } catch (err) {
        if (controller.signal.aborted) return;
        setGamesError(
          err instanceof Error
            ? err.message
            : t("communityComposer.errors.loadGamesFailed"),
        );
      } finally {
        if (!controller.signal.aborted) {
          setGamesLoading(false);
        }
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [gameSearch, isGamePickerOpen]);

  useEffect(() => {
    const nextDefault = String(defaultGroupId || "");
    if (lockGroupSelection) {
      setSelectedGroupId(nextDefault);
      return;
    }

    if (nextDefault && !selectedGroupId) {
      setSelectedGroupId(nextDefault);
    }
  }, [defaultGroupId, lockGroupSelection, selectedGroupId]);

  useEffect(() => {
    if (lockGroupSelection) return;
    if (!selectedGroupId) return;
    if (!availableGroups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId("");
    }
  }, [availableGroups, lockGroupSelection, selectedGroupId]);

  const remainingChars = MAX_CHARS - content.length;
  const isOverLimit = remainingChars < 0;
  const hasSelectedGame = Boolean(selectedGameSummary && selectedGame);
  const hasSelectedImages = selectedImages.length > 0;
  const hasSelectedVideo = Boolean(selectedVideoFile);
  const canSubmit =
    !isSubmitting &&
    !isOverLimit &&
    (hasSelectedGame ||
      content.trim().length > 0 ||
      hasSelectedImages ||
      hasSelectedVideo);
  const selectedMediaType = useMemo(() => {
    if (selectedVideoFile) return "video";
    if (selectedImages.length > 0) return "image";
    return "none";
  }, [selectedImages.length, selectedVideoFile]);
  const submissionBlockedMessage = useMemo(
    () => buildSubmissionBlockedMessage(postingAccess, t),
    [postingAccess, t],
  );
  const isSubmissionBlocked = submissionBlockedMessage.length > 0;
  const canSubmitNow = canSubmit && !isSubmissionBlocked && !isLoadingSelectedGame;
  const mediaControlsDisabled = isSubmissionBlocked || isSubmitting;
  const openingLabel = selectedGameSummary
    ? getCommunityOpeningLabel(selectedGameSummary.eco, selectedGameSummary.event)
    : "";
  const selectedGroup = availableGroups.find((group) => group.id === selectedGroupId) || null;

  const clearSelectedImages = () => {
    setSelectedImages((current) => {
      current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      return [];
    });
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const clearSelectedVideo = () => {
    if (selectedVideoPreviewUrl) {
      URL.revokeObjectURL(selectedVideoPreviewUrl);
    }
    setSelectedVideoFile(null);
    setSelectedVideoPreviewUrl("");
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  const clearSelectedMedia = () => {
    clearSelectedImages();
    clearSelectedVideo();
    resetFileInputs();
  };

  const handleRemoveSelectedImage = (index: number) => {
    if (isSubmitting) return;
    setSelectedImages((current) => {
      const image = current[index];
      if (!image) return current;
      URL.revokeObjectURL(image.previewUrl);
      const next = current.filter((_, currentIndex) => currentIndex !== index);
      if (next.length === 0 && imageInputRef.current) {
        imageInputRef.current.value = "";
      }
      return next;
    });
  };

  const handlePickImages = (fileList?: FileList | null) => {
    if (isSubmitting) return;
    if (isSubmissionBlocked) {
      setError(submissionBlockedMessage);
      return;
    }

    const incomingFiles = Array.from(fileList || []).filter(Boolean);
    if (incomingFiles.length === 0) return;

    for (const file of incomingFiles) {
      const validationError = validateFile(file, "image");
      if (validationError) {
        setError(t(validationError));
        return;
      }
    }

    const existingById = new Map(selectedImages.map((image) => [image.id, image]));
    const nextImages = [...selectedImages];

    for (const file of incomingFiles) {
      const id = getImageSelectionId(file);
      if (existingById.has(id)) continue;
      nextImages.push({
        id,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    if (nextImages.length > MAX_IMAGE_COUNT) {
      nextImages
        .slice(selectedImages.length)
        .forEach((image) => URL.revokeObjectURL(image.previewUrl));
      setError(t("communityComposer.errors.imageLimit", { count: MAX_IMAGE_COUNT }));
      return;
    }

    if (totalImageBytes(nextImages) > MAX_TOTAL_IMAGE_BYTES) {
      nextImages
        .slice(selectedImages.length)
        .forEach((image) => URL.revokeObjectURL(image.previewUrl));
      setError(t("communityComposer.errors.totalImageTooLarge"));
      return;
    }

    clearSelectedGame();
    clearSelectedVideo();
    setIsGamePickerOpen(false);
    setError("");
    setSuccessMessage("");
    setSelectedImages(nextImages);
  };

  const handlePickVideo = (file?: File | null) => {
    if (isSubmitting) return;
    if (isSubmissionBlocked) {
      setError(submissionBlockedMessage);
      return;
    }
    if (!file) return;
    const validationError = validateFile(file, "video");
    if (validationError) {
      setError(t(validationError));
      return;
    }

    clearSelectedGame();
    clearSelectedImages();
    setIsGamePickerOpen(false);
    setError("");
    setSuccessMessage("");
    clearSelectedVideo();
    setSelectedVideoFile(file);
    setSelectedVideoPreviewUrl(URL.createObjectURL(file));
  };

  const resetComposer = () => {
    setContent("");
    clearSelectedMedia();
    clearSelectedGame();
    setGameSearch("");
    setIsGamePickerOpen(false);
    setSelectedGroupId(String(defaultGroupId || ""));
  };

  const handleChooseGame = async (gameSummary: CommunityShareableGameSummary) => {
    if (isSubmitting) return;
    if (isSubmissionBlocked) {
      setError(submissionBlockedMessage);
      return;
    }

    setError("");
    setSuccessMessage("");
    setIsLoadingSelectedGame(true);
    setSelectedGameSummary(gameSummary);
    setSelectedGame(null);
    try {
      const game = await fetchGameDetail(gameSummary.id);
      clearSelectedMedia();
      setSelectedGame(communityGameFromHistory(game));
      setIsGamePickerOpen(false);
    } catch (err) {
      setSelectedGameSummary(null);
      setSelectedGame(null);
      setError(
        err instanceof Error
          ? t(err.message, { defaultValue: err.message })
          : t("communityComposer.errors.loadSelectedGame"),
      );
    } finally {
      setIsLoadingSelectedGame(false);
    }
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
      if (hasSelectedGame && selectedGameSummary) {
        formData.append("postType", "game");
        formData.append("gameId", selectedGameSummary.id);
      } else {
        formData.append("postType", "standard");
      }
      if (selectedGroupId) {
        formData.append("groupId", selectedGroupId);
      }
      if (selectedVideoFile) {
        formData.append("media", selectedVideoFile);
      }
      if (selectedImages.length > 0) {
        selectedImages.forEach((image) => formData.append("media", image.file));
      }

      const res = await fetch(`${API_URL}/api/community`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || t("communityComposer.errors.submitFailed"));
      }

      resetComposer();
      setSuccessMessage(t("communityComposer.submittedForReview"));
      await onSubmitted?.();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("communityComposer.errors.submitFailed"),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section
      className={`relative overflow-hidden rounded-2xl backdrop-blur-xl transition-all duration-300 ${
        focused
          ? "bg-theme-panel shadow-[0_26px_70px_rgba(0,0,0,0.3)] ring-1 ring-brand-400/25"
          : "bg-theme-panel shadow-[0_20px_58px_rgba(0,0,0,0.24)]"
      }`}
    >
      <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-brand-400/35 to-transparent" />

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
              placeholder={
                hasSelectedGame
                  ? t("communityComposer.addCaption")
                  : t("communityComposer.composePlaceholder")
              }
              className={`w-full bg-transparent border-none focus:ring-0 focus:outline-none text-sm text-theme-foreground placeholder:text-theme-disabled resize-none premium-scrollbar ${
                hasSelectedImages || hasSelectedVideo || selectedGameSummary
                  ? content.trim().length > 0
                    ? "min-h-[30px] leading-6"
                    : "min-h-[48px] leading-6"
                  : "min-h-[124px] leading-8"
              }`}
            />

            {selectedMediaType === "video" && selectedVideoPreviewUrl && (
              <div className="mt-2">
                <div className="relative overflow-hidden rounded-xl border border-theme-glass bg-theme-panel/55">
                  <button
                    type="button"
                    onClick={clearSelectedMedia}
                    disabled={isSubmitting}
                    className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-theme-panel/60 text-theme-muted hover:bg-theme-panel/80 hover:text-theme-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                    title={t("communityComposer.removeMedia")}
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <video
                    src={selectedVideoPreviewUrl}
                    controls
                    className="w-full max-h-[420px] bg-theme-panel object-contain"
                  />
                </div>
              </div>
            )}

            {selectedMediaType === "image" && selectedImages.length === 1 && (
              <div className="mt-2">
                <div className="relative overflow-hidden rounded-xl border border-theme-glass bg-theme-panel/55">
                  <button
                    type="button"
                    onClick={clearSelectedMedia}
                    disabled={isSubmitting}
                    className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-theme-panel/60 text-theme-muted hover:bg-theme-panel/80 hover:text-theme-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                    title={t("communityComposer.removeMedia")}
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <img
                    src={selectedImages[0].previewUrl}
                    alt={selectedImages[0].file.name || t("communityComposer.selectedPreview")}
                    className="w-full max-h-[420px] object-contain bg-theme-panel"
                  />
                </div>
              </div>
            )}

            {selectedMediaType === "image" && selectedImages.length > 1 && (
              <div className="mt-2 overflow-hidden rounded-2xl border border-theme-glass bg-theme-panel/[0.025] p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-brand-200/70">
                      {t("communityComposer.imageSet")}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-theme-foreground">
                      {t("communityComposer.imagesSelected", {
                        count: selectedImages.length,
                      })}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={clearSelectedImages}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-2 rounded-lg bg-theme-panel/[0.06] px-3 py-2 text-xs font-semibold text-theme-muted transition-colors hover:bg-theme-panel/[0.12] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <X className="h-4 w-4" />
                    {t("communityComposer.clearAll")}
                  </button>
                </div>

                <CommunityImageGrid
                  items={selectedImages.map((image) => ({
                    url: image.previewUrl,
                    alt: image.file.name || t("communityComposer.selectedPreview"),
                  }))}
                  onRemoveImage={handleRemoveSelectedImage}
                />

                {selectedImages.length > 5 && (
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1 premium-scrollbar">
                    {selectedImages.map((image, index) => (
                      <div
                        key={image.id}
                        className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-theme-panel/60"
                      >
                        <img
                          src={image.previewUrl}
                          alt={
                            image.file.name ||
                            t("communityComposer.selectedImageAlt", {
                              index: index + 1,
                            })
                          }
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveSelectedImage(index)}
                          disabled={isSubmitting}
                          className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-theme-panel/70 text-theme-foreground hover:bg-theme-panel/85 disabled:cursor-not-allowed disabled:opacity-45"
                          aria-label={t("communityComposer.removeImageAria", {
                            index: index + 1,
                          })}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedGameSummary && (
              <div className="mt-2 overflow-hidden rounded-2xl border border-theme-glass bg-theme-panel/[0.025]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-theme-glass px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-brand-200/70">
                      {t("communityComposer.shareGame")}
                    </div>
                    <div className="mt-1 truncate text-sm font-semibold text-theme-foreground">
                      {t("communityComposer.vsOpponent", {
                        opponent: selectedGameSummary.opponent,
                      })}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-theme-muted">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 font-semibold ${perspectiveTone(
                          selectedGameSummary.perspectiveResult,
                        )}`}
                      >
                        {formatCommunityPerspectiveResult(
                          selectedGameSummary.perspectiveResult,
                        )}
                      </span>
                      <span>{formatCommunityTimeControl(selectedGameSummary.timeControl)}</span>
                      {openingLabel && <span className="truncate">{openingLabel}</span>}
                      {selectedGameSummary.playedAt && (
                        <span>{formatGamePlayedAt(selectedGameSummary.playedAt)}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isLoadingSelectedGame || isSubmitting}
                      onClick={() => setIsGamePickerOpen((value) => !value)}
                      className="inline-flex items-center gap-2 rounded-lg bg-theme-panel/[0.06] px-3 py-2 text-xs font-semibold text-theme-muted hover:bg-theme-panel/[0.12] disabled:opacity-50"
                    >
                      <Gamepad2 className="h-4 w-4" />
                      {t("communityComposer.change")}
                    </button>
                    <button
                      type="button"
                      disabled={isLoadingSelectedGame || isSubmitting}
                      onClick={clearSelectedGame}
                      className="inline-flex items-center gap-2 rounded-lg bg-theme-panel/[0.06] px-3 py-2 text-xs font-semibold text-theme-muted hover:bg-theme-panel/[0.12] disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                      {t("communityComposer.remove")}
                    </button>
                  </div>
                </div>

                <div className="px-4 pb-4">
                  {isLoadingSelectedGame || !selectedGame ? (
                    <div className="mt-3 rounded-[20px] border border-theme-glass bg-theme-panel/[0.03] p-4">
                      <div className="h-[320px] animate-pulse rounded-[18px] bg-theme-panel/[0.06]" />
                    </div>
                  ) : (
                    <CommunityGameViewer game={selectedGame} />
                  )}
                </div>
              </div>
            )}

            {isGamePickerOpen && (
              <div className="mt-3 overflow-hidden rounded-2xl border border-theme-glass bg-theme-panel shadow-[0_20px_50px_rgba(0,0,0,0.28)]">
                <div className="flex items-center justify-between gap-3 border-b border-theme-glass px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-theme-foreground">
                      {t("communityComposer.chooseGame")}
                    </div>
                    <div className="mt-1 text-xs text-theme-muted">
                      {t("communityComposer.chooseGameDescription")}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsGamePickerOpen(false)}
                    disabled={isSubmitting}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-theme-panel/[0.06] text-theme-muted hover:bg-theme-panel/[0.12] disabled:cursor-not-allowed disabled:opacity-45"
                    aria-label={t("communityComposer.closeGamePicker")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="border-b border-theme-glass px-4 py-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-muted" />
                    <input
                      value={gameSearch}
                      disabled={isSubmitting}
                      onChange={(e) => setGameSearch(e.target.value)}
                      placeholder={t("communityComposer.gameSearchPlaceholder")}
                      className="w-full rounded-xl bg-theme-panel/[0.05] py-2.5 pl-10 pr-4 text-sm text-theme-foreground placeholder:text-theme-disabled focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed disabled:opacity-45"
                    />
                  </div>
                </div>

                <div className="max-h-[420px] overflow-y-auto premium-scrollbar p-3">
                  {gamesLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 4 }, (_, index) => (
                        <div
                          key={`game-skeleton-${index}`}
                          className="h-24 animate-pulse rounded-2xl bg-theme-panel/[0.05]"
                        />
                      ))}
                    </div>
                  ) : gamesError ? (
                    <div className="rounded-2xl bg-red-500/10 px-4 py-4 text-sm text-red-200">
                      {gamesError}
                    </div>
                  ) : availableGames.length === 0 ? (
                    <div className="rounded-2xl bg-theme-panel/[0.04] px-4 py-8 text-center">
                      <div className="text-sm font-medium text-theme-foreground">
                        {t("communityComposer.noGamesFound")}
                      </div>
                      <div className="mt-2 text-xs leading-6 text-theme-muted">
                        {t("communityComposer.noGamesFoundDescription")}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {availableGames.map((gameOption) => {
                        const isSelected = selectedGameSummary?.id === gameOption.id;
                        const optionOpening = getCommunityOpeningLabel(
                          gameOption.eco,
                          gameOption.event,
                        );

                        return (
                          <button
                            key={gameOption.id}
                            type="button"
                            onClick={() => void handleChooseGame(gameOption)}
                            disabled={isLoadingSelectedGame || isSubmitting}
                            className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${
                              isSelected
                                ? "border-brand-400/35 bg-brand-500/10"
                                : "border-theme-glass bg-theme-panel/[0.03] hover:border-theme-border hover:bg-theme-panel/[0.05]"
                            } disabled:opacity-60`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="truncate text-sm font-semibold text-theme-foreground">
                                    {t("communityComposer.vsOpponent", {
                                      opponent: gameOption.opponent,
                                    })}
                                  </span>
                                  <span
                                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${perspectiveTone(
                                      gameOption.perspectiveResult,
                                    )}`}
                                  >
                                    {formatCommunityPerspectiveResult(
                                      gameOption.perspectiveResult,
                                    )}
                                  </span>
                                </div>
                                <div className="mt-1 text-xs text-theme-muted">
                                  {t("communityComposer.vsLabel", {
                                    white: gameOption.white,
                                    black: gameOption.black,
                                  })}
                                </div>
                              </div>

                              <div className="shrink-0 text-right text-xs text-theme-muted">
                                <div>{formatGamePlayedAt(gameOption.playedAt)}</div>
                                <div className="mt-1">
                                  {t("communityComposer.movesCount", {
                                    count: gameOption.totalMoves,
                                  })}
                                </div>
                              </div>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-theme-muted">
                              <span className="rounded-full bg-theme-panel/[0.05] px-2.5 py-1">
                                {formatCommunityTimeControl(gameOption.timeControl)}
                              </span>
                              <span className="rounded-full bg-theme-panel/[0.05] px-2.5 py-1">
                                {gameOption.variant === "chess960"
                                  ? t("Chess960")
                                  : gameOption.variant === "kingOfHill"
                                    ? t("King of the Hill")
                                  : gameOption.variant === "threeCheck"
                                    ? t("Three-Check")
                                    : t("Standard")}
                              </span>
                              {optionOpening && (
                                <span className="rounded-full bg-theme-panel/[0.05] px-2.5 py-1">
                                  {optionOpening}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
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
                      : "bg-brand-500/10 text-brand-100"
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

            <input
              ref={imageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={(e) => handlePickImages(e.target.files)}
            />
            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              className="hidden"
              onChange={(e) => handlePickVideo(e.target.files?.[0])}
            />

            <div className="mt-4 flex items-center justify-between border-t border-theme-glass pt-3">
              <div className="flex flex-wrap items-center gap-2">
                {(availableGroups.length > 0 || selectedGroupId) && (
                  lockGroupSelection ? (
                    <div className="inline-flex items-center gap-2 rounded-lg bg-brand-500/12 px-3.5 py-2 text-sm text-brand-100">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand-200/70">
                        {t("communityComposer.group")}
                      </span>
                      <span className="font-medium">
                        {selectedGroup?.name || t("communityComposer.selectedGroup")}
                      </span>
                    </div>
                  ) : (
                    <label className="inline-flex items-center gap-2 rounded-lg bg-theme-panel/[0.04] px-3 py-2 text-sm text-theme-muted transition-colors hover:bg-theme-panel/[0.08]">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-theme-muted">
                        {t("communityComposer.group")}
                      </span>
                      <select
                        value={selectedGroupId}
                        onChange={(e) => setSelectedGroupId(e.target.value)}
                        className="min-w-[150px] bg-transparent text-sm text-theme-muted focus:outline-none"
                      >
                        <option value="" className="bg-theme-panel text-theme-foreground">
                          {t("communityComposer.generalCommunity")}
                        </option>
                        {availableGroups.map((group) => (
                          <option
                            key={group.id}
                            value={group.id}
                            className="bg-theme-panel text-theme-foreground"
                          >
                            {group.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )
                )}
                <button
                  type="button"
                  disabled={mediaControlsDisabled}
                  onClick={() => openFilePicker("image")}
                  className="inline-flex items-center gap-2 rounded-lg bg-theme-panel/[0.04] px-3.5 py-2 text-sm text-theme-muted transition-colors hover:bg-theme-panel/[0.08] hover:text-brand-200 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <ImageIcon className="w-4 h-4" />
                  {t("communityComposer.image")}
                </button>
                <button
                  type="button"
                  disabled={mediaControlsDisabled}
                  onClick={() => openFilePicker("video")}
                  className="inline-flex items-center gap-2 rounded-lg bg-theme-panel/[0.04] px-3.5 py-2 text-sm text-theme-muted transition-colors hover:bg-theme-panel/[0.08] hover:text-brand-200 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Video className="w-4 h-4" />
                  {t("communityComposer.video")}
                </button>
                <button
                  type="button"
                  disabled={mediaControlsDisabled}
                  onClick={() => {
                    if (mediaControlsDisabled) {
                      setError(submissionBlockedMessage);
                      return;
                    }
                    setError("");
                    setSuccessMessage("");
                    setIsGamePickerOpen((value) => !value);
                  }}
                  className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                    isGamePickerOpen || selectedGameSummary
                      ? "bg-brand-500/16 text-brand-100 hover:bg-brand-500/22"
                      : "bg-theme-panel/[0.04] text-theme-muted hover:bg-theme-panel/[0.08] hover:text-brand-200"
                  }`}
                >
                  <Gamepad2 className="w-4 h-4" />
                  {selectedGameSummary
                    ? t("communityComposer.changeGame")
                    : t("communityComposer.shareGame")}
                </button>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs tabular-nums text-theme-muted">
                  {content.length}/{MAX_CHARS}
                </span>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmitNow}
                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                    canSubmitNow
                      ? "bg-brand-600 text-theme-on-accent shadow-[0_12px_30px_rgba(13,148,136,0.28)] hover:bg-brand-500"
                      : "cursor-not-allowed bg-theme-panel/[0.06] text-theme-muted"
                  }`}
                >
                  <Send className="w-4 h-4" />
                  {isSubmitting
                    ? t("communityComposer.submitting")
                    : isSubmissionBlocked
                      ? t("communityComposer.unavailable")
                      : t("communityComposer.submit")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

