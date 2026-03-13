import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { MessageAttachment } from "../types";
import { formatBytes, isVideoAttachment, resolveMediaUrl } from "../utils";

type MediaViewerModalProps = {
  viewer: { attachments: MessageAttachment[]; index: number } | null;
  onClose: () => void;
  onStep: (direction: 1 | -1) => void;
};

export function MediaViewerModal({
  viewer,
  onClose,
  onStep,
}: MediaViewerModalProps) {
  if (!viewer || viewer.attachments.length === 0) return null;

  const current = viewer.attachments[viewer.index] || viewer.attachments[0];
  const video = isVideoAttachment(current);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        className="absolute right-6 top-6 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white shadow-lg backdrop-blur transition hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>
      {viewer.attachments.length > 1 && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onStep(-1);
          }}
          className="absolute left-6 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white shadow-lg backdrop-blur transition hover:bg-white/20"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      <div className="mx-auto max-w-5xl px-6" onClick={(event) => event.stopPropagation()}>
        {video ? (
          <video
            src={resolveMediaUrl(current?.url)}
            poster={current?.thumbnail ? resolveMediaUrl(current.thumbnail) : undefined}
            controls
            preload="metadata"
            className="max-h-[80vh] w-full rounded-2xl border border-white/10 bg-black/70 object-contain shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
          />
        ) : (
          <img
            src={resolveMediaUrl(current?.url)}
            alt={current?.filename || "attachment"}
            className="max-h-[80vh] w-full rounded-2xl border border-white/10 bg-[#0b1424] object-contain shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
          />
        )}
        <div className="mt-3 flex items-center justify-center gap-3 text-sm text-slate-200">
          <span className="max-w-[60vw] truncate">
            {current?.filename || (video ? "Video" : "Photo")}
          </span>
          <span className="text-slate-400">{formatBytes(current?.size || 0)}</span>
        </div>
      </div>
      {viewer.attachments.length > 1 && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onStep(1);
          }}
          className="absolute right-6 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white shadow-lg backdrop-blur transition hover:bg-white/20"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
