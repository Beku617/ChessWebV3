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
  const isGamePost = post.postType === "game";

  if (isGamePost) {
    return (
      <div className="mt-4 rounded-[20px] bg-[#091321]/45 p-1.5">
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
    alt: item.originalName || "Community post media",
  }));

  return (
    <div className="mt-4 rounded-[20px] border border-gray-200 dark:border-white/[0.04] bg-[#091321]/78 p-3">
      {post.mediaType === "video" ? (
        <div className="overflow-hidden rounded-[16px] bg-black/55">
          <video
            src={mediaUrl}
            controls
            playsInline
            preload="metadata"
            className="w-full max-h-[420px] bg-black object-contain"
          />
        </div>
      ) : imageItems.length === 1 ? (
        <div className="overflow-hidden rounded-[16px] bg-black/55">
          <img
            src={imageItems[0].url}
            alt={imageItems[0].originalName || "Community post media"}
            className="w-full max-h-[420px] cursor-zoom-in bg-black object-contain"
            onClick={() => onOpenGallery(galleryItems, 0)}
          />
        </div>
      ) : (
        <div className="rounded-[16px] bg-black/18 p-1.5">
          <CommunityImageGrid
            items={imageItems.map((item) => ({
              url: item.url,
              alt: item.originalName || "Community post image",
            }))}
            onImageClick={(index) => {
              if (!galleryItems[index]) return;
              onOpenGallery(galleryItems, index);
            }}
          />
        </div>
      )}

      <div className="mt-3 flex items-center justify-between rounded-[14px] bg-white/[0.03] px-3.5 py-2.5 text-xs text-gray-500">
        <div className="inline-flex items-center gap-2">
          {post.mediaType === "video" ? (
            <>
              <PlayCircle className="h-3.5 w-3.5 text-teal-300" />
              <span>Video preview</span>
            </>
          ) : post.mediaType === "image" ? (
            <>
              <ImageIcon className="h-3.5 w-3.5 text-teal-300" />
              <span>{imageItems.length > 1 ? "Image set" : "Image preview"}</span>
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
