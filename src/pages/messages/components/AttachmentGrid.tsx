import { useTranslation } from "react-i18next";
import { MessageAttachment } from "../types";
import { formatBytes, isVideoAttachment, resolveMediaUrl } from "../utils";

type AttachmentGridProps = {
  attachments?: MessageAttachment[];
  messageId: string;
  mine: boolean;
  onOpenViewer: (attachments: MessageAttachment[], index: number) => void;
};

export function AttachmentGrid({
  attachments = [],
  messageId,
  mine,
  onOpenViewer,
}: AttachmentGridProps) {
  const { t } = useTranslation();
  if (attachments.length === 0) return null;

  const videos = attachments.filter(isVideoAttachment);
  const images = attachments.filter(
    (attachment) => !isVideoAttachment(attachment),
  );
  const containerTint = mine
    ? "border-white/10 bg-white/5"
    : "border-[#1f2d45] bg-[#0d1729]/80";

  const videoBlock =
    videos.length > 0 ? (
      <div className={`mt-2 rounded-xl border ${containerTint} p-2`}>
        <div className="relative overflow-hidden rounded-lg bg-[#0b1424] shadow-[0_10px_26px_rgba(0,0,0,0.28)]">
          <video
            key={`${messageId}-video`}
            src={resolveMediaUrl(videos[0].url)}
            poster={
              videos[0].thumbnail
                ? resolveMediaUrl(videos[0].thumbnail || "")
                : undefined
            }
            controls
            preload="metadata"
            className="h-full max-h-[360px] w-full rounded-lg bg-black/60 object-contain"
            onDoubleClick={(event) => {
              event.stopPropagation();
              onOpenViewer(attachments, attachments.indexOf(videos[0]));
            }}
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 via-black/15 to-transparent" />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[12px] text-slate-200/90">
          <span className="truncate">
            {videos[0].filename || t("messages.videoFileFallback", "Video")}
          </span>
          <span className="text-slate-400">
            {formatBytes(videos[0].size || 0)}
          </span>
        </div>
      </div>
    ) : null;

  const imageBlock =
    images.length > 0 ? (
      <div className={`mt-2 rounded-xl border ${containerTint} p-2`}>
        {(() => {
          const count = images.length;
          const display = count > 5 ? images.slice(0, 5) : images;
          const extra = count - display.length;
          const gridCols = (() => {
            if (count === 1) return "grid-cols-1";
            if (count === 2) return "grid-cols-2";
            if (count === 3) return "grid-cols-2 grid-rows-2";
            if (count === 4) return "grid-cols-2";
            return "grid-cols-3";
          })();

          return (
            <div className={`grid ${gridCols} gap-2`}>
              {display.map((attachment, index) => {
                const originalIndex = attachments.indexOf(attachment);
                const isOverlay = extra > 0 && index === display.length - 1;
                const layoutClass =
                  count === 1
                    ? "aspect-[4/3] md:aspect-[16/10]"
                    : count === 3 && index === 0
                      ? "row-span-2 aspect-[3/4] md:aspect-[2/3]"
                      : count >= 3
                        ? "aspect-square"
                        : "aspect-[4/3]";

                return (
                  <button
                    type="button"
                    key={`${messageId}-att-${index}`}
                    onClick={() => onOpenViewer(attachments, originalIndex)}
                    className={`group relative overflow-hidden rounded-xl ${layoutClass} shadow-[0_10px_26px_rgba(0,0,0,0.28)]`}
                  >
                    <img
                      src={resolveMediaUrl(attachment.url)}
                      alt={
                        attachment.filename ||
                        t("messages.attachmentFallback", "attachment")
                      }
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                    {isOverlay && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-lg font-semibold text-white backdrop-blur-sm">
                        +{extra}
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-black/10 to-black/30 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                  </button>
                );
              })}
            </div>
          );
        })()}
      </div>
    ) : null;

  if (videoBlock && imageBlock) {
    return (
      <div className="space-y-3">
        {videoBlock}
        {imageBlock}
      </div>
    );
  }

  return videoBlock || imageBlock;
}
