import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Image as ImageIcon, PlayCircle, Trash2, X } from "lucide-react";
import { motion } from "framer-motion";
import { Avatar, RatingPill } from "./CommunityUI";
import {
  CommunityPost,
  formatFileSize,
  formatRelativeTime,
  getInitials,
  resolveAssetUrl,
} from "./types";

interface PostCardProps {
  post: CommunityPost;
  index: number;
  canDelete?: boolean;
  onDelete?: (postId: string) => Promise<void> | void;
  showModerationStatus?: boolean;
  preferCreatedTimestamp?: boolean;
}

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
  showModerationStatus = false,
  preferCreatedTimestamp = false,
}: PostCardProps) {
  const authorName = post.author?.fullName || "Chess Player";
  const mediaUrl = resolveAssetUrl(post.mediaUrl);
  const hasMedia = post.mediaType !== "none" && !!mediaUrl;
  const timestamp = formatRelativeTime(
    preferCreatedTimestamp ? post.createdAt : post.approvedAt || post.createdAt,
  );
  const [isImageOpen, setIsImageOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hasVideoInteraction, setHasVideoInteraction] = useState(false);

  useEffect(() => {
    if (!isImageOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsImageOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isImageOpen]);

  useEffect(() => {
    if (post.mediaType !== "video") return;
    const video = videoRef.current;
    if (!video) return;

    const tryPlay = async () => {
      try {
        if (video.paused) await video.play();
      } catch {
        // autoplay can be blocked by browser policy
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
  }, [post.mediaType, mediaUrl]);

  const handleVideoClick = () => {
    if (post.mediaType !== "video") return;
    const video = videoRef.current;
    if (!video) return;

    if (!hasVideoInteraction) {
      setHasVideoInteraction(true);
    }
    if (video.muted) {
      video.muted = false;
    }
    if (video.paused) {
      void video.play().catch(() => null);
    }
  };

  const handleDeleteClick = () => {
    if (!canDelete || !onDelete || isDeleting) return;
    setDeleteError("");
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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.32, ease: "easeOut" }}
      className="group relative overflow-hidden rounded-xl bg-[#0c1728]/84 backdrop-blur-xl shadow-[0_18px_48px_rgba(0,0,0,0.22)] transition-colors duration-300 hover:bg-[#0f1c31]/88"
    >
      <div className="relative px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar
              initials={getInitials(authorName)}
              src={post.author?.avatar}
              size="sm"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white">{authorName}</h3>
                <RatingPill rating={Number(post.author?.rating || 0)} />
              </div>
              <div className="mt-0.5 text-xs text-gray-500">{timestamp}</div>
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
          <div className="mt-2.5 whitespace-pre-wrap text-sm leading-6 text-gray-200">
            {post.text}
          </div>
        )}

        {showModerationStatus && post.status === "rejected" && post.rejectionReason && (
          <div className="mt-3 rounded-xl bg-red-500/10 px-3.5 py-2.5 text-xs text-red-200">
            <span className="font-semibold">Reason:</span> {post.rejectionReason}
          </div>
        )}
      </div>

      {hasMedia && (
        <div className="px-4 pb-3">
          <div className="relative overflow-hidden rounded-[14px] bg-black/50">
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white/5 via-transparent to-black/30" />
            {post.mediaType === "video" ? (
              <video
                ref={videoRef}
                src={mediaUrl}
                muted={!hasVideoInteraction}
                loop
                controls={hasVideoInteraction}
                playsInline
                preload="metadata"
                onClick={handleVideoClick}
                className="relative w-full max-h-[420px] bg-black object-contain"
              />
            ) : (
              <img
                src={mediaUrl}
                alt={post.mediaOriginalName || "Community post media"}
                className="relative w-full max-h-[420px] object-contain bg-black cursor-zoom-in"
                onClick={() => setIsImageOpen(true)}
              />
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 px-4 pb-4 pt-1 text-xs text-gray-500">
        <div className="inline-flex items-center gap-2 text-gray-400">
          {post.mediaType === "video" ? (
            <>
              <PlayCircle className="w-3.5 h-3.5 text-teal-300" />
              <span>Video</span>
            </>
          ) : post.mediaType === "image" ? (
            <>
              <ImageIcon className="w-3.5 h-3.5 text-teal-300" />
              <span>Image</span>
            </>
          ) : (
            <span>Text only</span>
          )}
        </div>

        {hasMedia && <span className="text-gray-500">{formatFileSize(post.mediaSize)}</span>}
      </div>

      {deleteError && (
        <div className="px-4 pb-4 -mt-1 text-xs text-red-300">{deleteError}</div>
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

      {isImageOpen &&
        post.mediaType === "image" &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[160] bg-black/95"
            onClick={() => setIsImageOpen(false)}
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
                onClick={() => setIsImageOpen(false)}
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
                src={mediaUrl}
                alt={post.mediaOriginalName || "Community post media"}
                className="w-[94vw] h-[90vh] object-contain"
              />
            </div>
          </div>,
          document.body,
        )}
    </motion.article>
  );
}
