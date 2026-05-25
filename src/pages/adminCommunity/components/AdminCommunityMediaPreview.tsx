import { Trans, useTranslation } from "react-i18next";
import { Image as ImageIcon, PlayCircle } from "lucide-react";
import { CommunityGameViewer } from "../../../components/community/CommunityGameViewer";
import { CommunityImageGrid } from "../../../components/community/CommunityImageGrid";
import { formatFileSize } from "../../../components/community/types";
import type { AdminCommunityPost } from "../types";

interface ResolvedAdminImageItem {
  url: string;
  originalName?: string;
}

interface AdminCommunityMediaPreviewProps {
  post: AdminCommunityPost;
  mediaUrl: string;
  imageItems: ResolvedAdminImageItem[];
  contentTypeLabel: string;
  onOpenGallery: (items: { src: string; alt: string }[], index: number) => void;
}

export function AdminCommunityMediaPreview({
  post,
  mediaUrl,
  imageItems,
  contentTypeLabel,
  onOpenGallery,
}: AdminCommunityMediaPreviewProps) {
  const { t } = useTranslation();
  const isGamePost = post.postType === "game";

  if (isGamePost) {
    return (
      <div className="mt-4 rounded-[20px] bg-theme-panel p-1.5">
        <CommunityGameViewer
          game={post.game}
          analyzeHref={post.game?.sourceGameId ? `/admin/analyze/${post.game.sourceGameId}` : ""}
        />
      </div>
    );
  }

  if (post.mediaType === "none" || imageItems.length === 0 && post.mediaType !== "video") {
    return null;
  }

  const galleryItems = imageItems.map((item) => ({
    src: item.url,
    alt:
      item.originalName || t("admin.community.media.postMediaAlt", "Community post media"),
  }));

  return (
    <div className="mt-4 rounded-[20px] border border-theme-glass bg-theme-panel p-3">
      {post.mediaType === "video" ? (
        <div className="overflow-hidden rounded-[16px] bg-theme-panel/55">
          <video
            src={mediaUrl}
            controls
            playsInline
            preload="metadata"
            className="w-full max-h-[420px] bg-theme-panel object-contain"
          />
        </div>
      ) : imageItems.length === 1 ? (
        <div className="overflow-hidden rounded-[16px] bg-theme-panel/55">
          <img
            src={imageItems[0].url}
            alt={
              imageItems[0].originalName ||
              t("admin.community.media.postMediaAlt", "Community post media")
            }
            className="w-full max-h-[420px] cursor-zoom-in bg-theme-panel object-contain"
            onClick={() => onOpenGallery(galleryItems, 0)}
          />
        </div>
      ) : (
        <div className="rounded-[16px] bg-theme-panel/18 p-1.5">
          <CommunityImageGrid
            items={imageItems.map((item) => ({
              url: item.url,
              alt:
                item.originalName ||
                t("admin.community.media.postImageAlt", "Community post image"),
            }))}
            onImageClick={(index) => {
              if (!galleryItems[index]) return;
              onOpenGallery(galleryItems, index);
            }}
          />
        </div>
      )}

      <div className="mt-3 flex items-center justify-between rounded-[14px] bg-theme-panel/[0.03] px-3.5 py-2.5 text-xs text-theme-muted">
        <div className="inline-flex items-center gap-2">
          {post.mediaType === "video" ? (
            <>
              <PlayCircle className="h-3.5 w-3.5 text-brand-300" />
              <span><Trans>Video preview</Trans></span>
            </>
          ) : post.mediaType === "image" ? (
            <>
              <ImageIcon className="h-3.5 w-3.5 text-brand-300" />
              <span>
                {imageItems.length > 1
                  ? t("admin.community.media.imageSet", "Image set")
                  : t("admin.community.media.imagePreview", "Image preview")}
              </span>
            </>
          ) : (
            <span>{contentTypeLabel}</span>
          )}
        </div>
        {post.mediaType !== "none" && (
          <span>
            {imageItems.length > 1 ? `${imageItems.length} images` : formatFileSize(post.mediaSize)}
          </span>
        )}
      </div>
    </div>
  );
}

