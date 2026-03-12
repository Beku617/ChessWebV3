import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Heart, Trash2, X } from "lucide-react";
import { motion } from "framer-motion";
import { CommunityImageGrid } from "./CommunityImageGrid";
import { Avatar } from "./CommunityUI";
import { CommunityGameViewer } from "./CommunityGameViewer";
import {
  API_URL,
  CommunityPost,
  formatFileSize,
  formatRelativeTime,
  getCommunityMediaItems,
  getInitials,
  resolveAssetUrl,
} from "./types";
import { useAuthStore } from "../../store/authStore";
import {
  useBlockingModalLock,
  useBlockingModalState,
} from "../../hooks/useBlockingModal";

interface PostCardProps {
  post: CommunityPost;
  index: number;
  canDelete?: boolean;
  onDelete?: (postId: string) => Promise<void> | void;
  onLikeChanged?: () => Promise<void> | void;
  showModerationStatus?: boolean;
  preferCreatedTimestamp?: boolean;
}

const SOUND_UNLOCK_SESSION_KEY = "communityVideoSoundUnlocked";

function moderationStatusClass(status: CommunityPost["status"]) {
  if (status === "approved") return "bg-teal-500/12 text-teal-200";
  if (status === "rejected") return "bg-red-500/12 text-red-200";
  if (status === "removed") return "bg-gray-500/15 text-gray-300";
  return "bg-amber-500/12 text-amber-200";
}

function formatModerationStatus(status: CommunityPost["status"]) {
  if (!status) return "Pending";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function PostCard({
  post,
  index,
  canDelete = false,
  onDelete,
  onLikeChanged,
  showModerationStatus = false,
  preferCreatedTimestamp = false,
}: PostCardProps) {
  const { user } = useAuthStore();
  const authorName = post.author?.fullName || "Chess Player";
  const mediaItems = getCommunityMediaItems(post);
  const primaryMedia = mediaItems[0] || null;
  const mediaUrl = resolveAssetUrl(primaryMedia?.url || post.mediaUrl);
  const imageItems = mediaItems
    .filter((item) => item.type === "image")
    .map((item) => ({
      ...item,
      url: resolveAssetUrl(item.url),
    }));
  const isGamePost = post.postType === "game";
  const gameAnalyzeHref = post.game?.sourceGameId
    ? post.game.variant === "chess960"
      ? `/analyze960/${post.game.sourceGameId}`
      : `/analyze/${post.game.sourceGameId}`
    : "";
  const hasMedia = post.mediaType !== "none" && mediaItems.length > 0;
  const hasSingleImage = post.mediaType === "image" && imageItems.length === 1;
  const hasMultiImage = post.mediaType === "image" && imageItems.length > 1;
  const timestamp = formatRelativeTime(
    preferCreatedTimestamp ? post.createdAt : post.approvedAt || post.createdAt,
  );
  const isOwnPost = Boolean(user?.id && post.author?.id === user.id);
  const footerMediaLabel = hasMedia
    ? hasMultiImage
      ? `${imageItems.length} images`
      : formatFileSize(post.mediaSize)
    : "";
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [actionError, setActionError] = useState("");
  const [likeCount, setLikeCount] = useState(Math.max(0, Number(post.likeCount || 0)));
  const [likedByMe, setLikedByMe] = useState(Boolean(post.likedByMe));
  const [isLikeUpdating, setIsLikeUpdating] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isBlockingModalOpen = useBlockingModalState();
  const [hasVideoInteraction, setHasVideoInteraction] = useState(false);
  const [soundUnlocked, setSoundUnlocked] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(SOUND_UNLOCK_SESSION_KEY) === "1";
  });
  const currentImage =
    activeImageIndex !== null && imageItems[activeImageIndex]
      ? imageItems[activeImageIndex]
      : null;
  useBlockingModalLock(showDeleteConfirm || activeImageIndex !== null);
  const showLikeAction = post.status === "approved" || likeCount > 0 || likedByMe;
  const canToggleLike = post.status === "approved" && !isOwnPost;
  const footerHasContent = showLikeAction || Boolean(footerMediaLabel);

  useEffect(() => {
    setLikeCount(Math.max(0, Number(post.likeCount || 0)));
    setLikedByMe(Boolean(post.likedByMe));
  }, [post.id, post.likeCount, post.likedByMe]);

  useEffect(() => {
    if (activeImageIndex === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveImageIndex(null);
        return;
      }

      if (event.key === "ArrowRight" && imageItems.length > 1) {
        setActiveImageIndex((current) => {
          if (current === null) return 0;
          return (current + 1) % imageItems.length;
        });
      }

      if (event.key === "ArrowLeft" && imageItems.length > 1) {
        setActiveImageIndex((current) => {
          if (current === null) return 0;
          return (current - 1 + imageItems.length) % imageItems.length;
        });
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeImageIndex, imageItems.length]);

  useEffect(() => {
    if (post.mediaType !== "video") return;
    if (soundUnlocked || typeof window === "undefined") return;

    const unlockSound = () => {
      window.sessionStorage.setItem(SOUND_UNLOCK_SESSION_KEY, "1");
      setSoundUnlocked(true);
    };

    window.addEventListener("pointerdown", unlockSound, { once: true });
    window.addEventListener("keydown", unlockSound, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlockSound);
      window.removeEventListener("keydown", unlockSound);
    };
  }, [post.mediaType, soundUnlocked]);

  useEffect(() => {
    if (post.mediaType !== "video") return;
    const video = videoRef.current;
    if (!video) return;
    if (isBlockingModalOpen) {
      video.pause();
      return;
    }

    const tryPlay = async () => {
      const shouldPlayWithSound = soundUnlocked || hasVideoInteraction;
      video.muted = !shouldPlayWithSound;
      try {
        if (video.paused) await video.play();
      } catch {
        // Fallback to muted playback if autoplay with sound is blocked.
        video.muted = true;
        if (video.paused) {
          try {
            await video.play();
          } catch {
            // playback blocked entirely, keep current state
          }
        }
      }
    };

    const pause = () => {
      if (!video.paused) video.pause();
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
          void tryPlay();
          return;
        }
        pause();
      },
      { threshold: [0, 0.25, 0.45, 0.65, 0.85] },
    );

    observer.observe(video);

    return () => {
      observer.disconnect();
      pause();
    };
  }, [post.mediaType, mediaUrl, hasVideoInteraction, soundUnlocked, isBlockingModalOpen]);

  useEffect(() => {
    if (post.mediaType !== "video") return;
    if (!soundUnlocked) return;
    const video = videoRef.current;
    if (!video) return;
    if (isBlockingModalOpen) {
      video.pause();
      return;
    }
    video.muted = false;
  }, [post.mediaType, soundUnlocked, isBlockingModalOpen]);

  const handleVideoClick = () => {
    if (post.mediaType !== "video") return;
    const video = videoRef.current;
    if (!video) return;

    if (!hasVideoInteraction) {
      setHasVideoInteraction(true);
    }
    if (!soundUnlocked && typeof window !== "undefined") {
      window.sessionStorage.setItem(SOUND_UNLOCK_SESSION_KEY, "1");
      setSoundUnlocked(true);
    }
    if (video.muted) {
      video.muted = false;
    }
    if (video.paused) {
      void video.play().catch(() => null);
    }
  };

  const handleToggleLike = async () => {
    if (!showLikeAction || !canToggleLike || isLikeUpdating) return;

    const previousLikeCount = likeCount;
    const previousLiked = likedByMe;
    const nextLiked = !likedByMe;
    setActionError("");
    setIsLikeUpdating(true);
    setLikedByMe(nextLiked);
    setLikeCount((current) => Math.max(0, current + (nextLiked ? 1 : -1)));

    try {
      const res = await fetch(`${API_URL}/api/community/${post.id}/like`, {
        method: nextLiked ? "POST" : "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to update like.");
      }

      setLikedByMe(Boolean(data.likedByMe));
      setLikeCount(Math.max(0, Number(data.likeCount || 0)));
      await onLikeChanged?.();
    } catch (err) {
      setLikedByMe(previousLiked);
      setLikeCount(previousLikeCount);
      setActionError(err instanceof Error ? err.message : "Failed to update like.");
    } finally {
      setIsLikeUpdating(false);
    }
  };

  const handleDeleteClick = () => {
    if (!canDelete || !onDelete || isDeleting) return;
    setDeleteError("");
    setActionError("");
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!canDelete || !onDelete || isDeleting) return;

    setIsDeleting(true);
    setDeleteError("");
    try {
      await onDelete(post.id);
      setShowDeleteConfirm(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete post.";
      setDeleteError(message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <motion.article
      id={`post-${post.id}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.32, ease: "easeOut" }}
      className="group relative overflow-hidden rounded-xl bg-[#0c1728]/84 backdrop-blur-xl shadow-[0_18px_48px_rgba(0,0,0,0.22)] transition-colors duration-300 hover:bg-[#0f1c31]/88"
    >
      <div className={`relative px-4 pt-4 ${isGamePost ? "pb-0" : "pb-3"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar
              initials={getInitials(authorName)}
              src={post.author?.avatar}
              size="sm"
            />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white">{authorName}</h3>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span>{timestamp}</span>
                {post.group?.slug && (
                  <Link
                    to={`/community/groups/${post.group.slug}`}
                    className="rounded-full bg-teal-500/10 px-2.5 py-1 text-[11px] font-medium text-teal-100 transition-colors hover:bg-teal-500/18"
                  >
                    {post.group.name}
                  </Link>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {showModerationStatus && (
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${moderationStatusClass(
                  post.status,
                )}`}
              >
                {formatModerationStatus(post.status)}
              </span>
            )}
            {canDelete && (
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteClick}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-red-500/15 hover:text-red-200 transition-colors disabled:opacity-50"
                title="Delete your post"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {post.text && (
          <div
            className={`whitespace-pre-wrap text-sm leading-6 text-gray-200 ${
              isGamePost ? "mt-1" : "mt-2.5"
            }`}
          >
            {post.text}
          </div>
        )}

        {showModerationStatus && post.status === "rejected" && post.rejectionReason && (
          <div className="mt-3 rounded-xl bg-red-500/10 px-3.5 py-2.5 text-xs text-red-200">
            <span className="font-semibold">Reason:</span> {post.rejectionReason}
          </div>
        )}
      </div>

      {isGamePost && (
        <div className="px-4 pb-1">
          <CommunityGameViewer game={post.game} analyzeHref={gameAnalyzeHref} />
        </div>
      )}

      {hasMedia && (
        <div className="px-4 pb-3">
          {post.mediaType === "video" ? (
            <div className="relative overflow-hidden rounded-[14px] bg-black/50">
              <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white/5 via-transparent to-black/30" />
              <video
                ref={videoRef}
                src={mediaUrl}
                muted={!(soundUnlocked || hasVideoInteraction)}
                loop
                controls={hasVideoInteraction}
                playsInline
                preload="metadata"
                onClick={handleVideoClick}
                className="relative w-full max-h-[420px] bg-black object-contain"
              />
            </div>
          ) : hasSingleImage ? (
            <div className="relative overflow-hidden rounded-[14px] bg-black/50">
              <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white/5 via-transparent to-black/30" />
              <img
                src={imageItems[0].url}
                alt={imageItems[0].originalName || "Community post media"}
                className="relative w-full max-h-[420px] object-contain bg-black cursor-zoom-in"
                onClick={() => setActiveImageIndex(0)}
              />
            </div>
          ) : hasMultiImage ? (
            <div className="rounded-[20px] bg-black/26 p-1.5">
              <CommunityImageGrid
                items={imageItems.map((item) => ({
                  url: item.url,
                  alt: item.originalName || "Community post image",
                }))}
                onImageClick={(index) => setActiveImageIndex(index)}
              />
            </div>
          ) : null}
        </div>
      )}

      {footerHasContent && (
        <div
          className={`flex items-center gap-3 px-4 pb-4 pt-1 text-xs ${
            showLikeAction && footerMediaLabel
              ? "justify-between"
              : showLikeAction
                ? "justify-start"
                : "justify-end"
          }`}
        >
          {showLikeAction && (
            <button
              type="button"
              disabled={!canToggleLike || isLikeUpdating}
              onClick={() => void handleToggleLike()}
              title={
                isOwnPost
                  ? "You can't like your own post."
                  : likedByMe
                    ? "Unlike post"
                    : "Like post"
              }
              className={`inline-flex items-center gap-2 rounded-full px-3 py-2 transition-all ${
                likedByMe
                  ? "bg-teal-500/12 text-teal-100"
                  : "bg-white/[0.04] text-gray-400 hover:bg-white/[0.08] hover:text-gray-200"
              } disabled:cursor-not-allowed disabled:hover:bg-white/[0.04] disabled:hover:text-gray-400 disabled:opacity-70`}
            >
              <Heart
                className={`h-4 w-4 ${likedByMe ? "fill-current opacity-80" : ""}`}
              />
              <span className="text-[12px] font-medium tabular-nums">{likeCount}</span>
            </button>
          )}

          {footerMediaLabel && <span className="text-gray-500">{footerMediaLabel}</span>}
        </div>
      )}

      {deleteError && (
        <div className="px-4 pb-4 -mt-1 text-xs text-red-300">{deleteError}</div>
      )}
      {actionError && (
        <div className="px-4 pb-4 -mt-1 text-xs text-red-300">{actionError}</div>
      )}

      {showDeleteConfirm &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[170] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => {
              if (isDeleting) return;
              setShowDeleteConfirm(false);
            }}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-[#0d192c]/95 border border-white/10 shadow-[0_28px_90px_rgba(0,0,0,0.45)] p-5"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="text-base font-semibold text-white">Delete post?</h3>
              <p className="mt-2 text-sm leading-6 text-gray-400">
                This removes your post from the community feed.
              </p>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setShowDeleteConfirm(false)}
                  className="rounded-lg bg-white/[0.08] px-4 py-2 text-sm text-gray-200 hover:bg-white/[0.14] transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  className="rounded-lg bg-red-500/80 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 transition-colors disabled:opacity-50"
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {currentImage &&
        post.mediaType === "image" &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[160] bg-black/95"
            onClick={() => setActiveImageIndex(null)}
          >
            <div
              className="absolute inset-x-0 top-0 h-16 flex items-center justify-between px-4 sm:px-6 bg-gradient-to-b from-black/70 to-transparent"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Avatar
                  initials={getInitials(authorName)}
                  src={post.author?.avatar}
                  size="sm"
                />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">
                    {authorName}
                  </div>
                  <div className="text-xs text-gray-400">{timestamp}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveImageIndex(null)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                aria-label="Close image preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div
              className="h-full w-full p-4 sm:p-8 flex items-center justify-center"
              onClick={(event) => event.stopPropagation()}
            >
              <img
                src={currentImage.url}
                alt={currentImage.originalName || "Community post media"}
                className="w-[94vw] h-[90vh] object-contain"
              />
            </div>

            {imageItems.length > 1 && (
              <div
                className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/88 to-transparent px-4 pb-5 pt-12"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 text-xs text-gray-400">
                  <span>
                    {activeImageIndex + 1} / {imageItems.length}
                  </span>
                  <span>Use keyboard arrows to browse</span>
                </div>
                <div className="mx-auto mt-3 flex max-w-4xl gap-2 overflow-x-auto pb-1 premium-scrollbar">
                  {imageItems.map((item, index) => (
                    <button
                      key={`${item.url}-${index}`}
                      type="button"
                      onClick={() => setActiveImageIndex(index)}
                      className={`h-14 w-14 shrink-0 overflow-hidden rounded-xl transition-all ${
                        index === activeImageIndex
                          ? "ring-2 ring-teal-400/60"
                          : "opacity-70 hover:opacity-100"
                      }`}
                    >
                      <img
                        src={item.url}
                        alt={item.originalName || `Community post image ${index + 1}`}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>,
          document.body,
        )}
    </motion.article>
  );
}
