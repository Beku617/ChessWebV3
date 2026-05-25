import type { KeyboardEvent, RefObject } from "react";
import {
  ArchiveRestore,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Send,
  Video,
  X,
} from "lucide-react";
import { useTranslation, Trans } from "react-i18next";

import {
  ACCEPTED_IMAGE_TYPES,
  ACCEPTED_VIDEO_TYPES,
  PendingImage,
  PendingVideo,
} from "../types";
import { formatBytes } from "../utils";

type MessageComposerProps = {
  actionLoading: "archive" | "delete" | null;
  activeConversationArchived: boolean;
  clearPendingImages: () => void;
  clearPendingVideo: () => void;
  draft: string;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onDraftChange: (value: string) => void;
  onImageInputChange: (files: FileList | null) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onRemoveImage: (id: string) => void;
  onSend: () => void;
  onUnarchive: () => void;
  onVideoInputChange: (files: FileList | null) => void;
  pendingImages: PendingImage[];
  pendingVideo: PendingVideo | null;
  sending: boolean;
  totalPendingImageBytes: number;
  videoInputRef: RefObject<HTMLInputElement | null>;
};

export function MessageComposer({
  actionLoading,
  activeConversationArchived,
  clearPendingImages,
  clearPendingVideo,
  draft,
  fileInputRef,
  onDraftChange,
  onImageInputChange,
  onKeyDown,
  onRemoveImage,
  onSend,
  onUnarchive,
  onVideoInputChange,
  pendingImages,
  pendingVideo,
  sending,
  totalPendingImageBytes,
  videoInputRef,
}: MessageComposerProps) {
  const { t } = useTranslation();

  if (activeConversationArchived) {
    return (
      <div className="shrink-0 border-t border-theme-glass bg-theme-panel px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-theme-glass bg-theme-panel px-3 py-3">
          <div className="text-sm text-theme-foreground">
            {t(
              "messages.archivedReadOnly",
              "This conversation is archived. Unarchive to reply.",
            )}
          </div>
          <button
            type="button"
            onClick={onUnarchive}
            disabled={actionLoading === "archive"}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-theme-on-accent shadow-[0_10px_20px_rgba(13,148,136,0.35)] transition-all hover:bg-brand-500 disabled:cursor-not-allowed disabled:bg-theme-surface disabled:text-theme-muted disabled:shadow-none"
          >
            <ArchiveRestore className="h-4 w-4" />
            <span>{t("messages.unarchive", "Unarchive")}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-theme-glass bg-theme-panel px-4 py-3 backdrop-blur-xl">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={(event) => {
          onImageInputChange(event.target.files);
          if (event.target) event.target.value = "";
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept={ACCEPTED_VIDEO_TYPES.join(",")}
        className="hidden"
        onChange={(event) => {
          onVideoInputChange(event.target.files);
          if (event.target) event.target.value = "";
        }}
      />

      {pendingVideo && (
        <div className="mb-2 rounded-2xl border border-theme-glass bg-theme-panel px-3 py-3">
          <div className="mb-2 flex items-center justify-between text-[12px] text-theme-foreground">
            <span className="inline-flex items-center gap-2">
              <Video className="h-4 w-4 text-brand-300" />
              <span><Trans>1 video selected ·</Trans> {formatBytes(pendingVideo.size)}</span>
            </span>
            <button
              type="button"
              onClick={clearPendingVideo}
              className="rounded-lg px-2 py-1 text-[11px] text-theme-muted transition-colors hover:bg-theme-panel hover:text-theme-foreground"
            >
              {t("messages.clearAttachments", "Remove all")}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative h-24 w-40 overflow-hidden rounded-xl border border-theme-glass bg-theme-panel shadow-[0_10px_24px_rgba(0,0,0,0.28)]">
              <video
                src={pendingVideo.previewUrl}
                className="h-full w-full object-cover"
                controls
                muted
              />
              <button
                type="button"
                onClick={clearPendingVideo}
                className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-theme-panel/70 text-theme-foreground opacity-80 transition hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <span className="absolute bottom-1 left-1 rounded-full bg-theme-panel/55 px-2 py-0.5 text-[10px] text-theme-foreground">
                {formatBytes(pendingVideo.size)}
              </span>
            </div>
            <div className="min-w-0 flex-1 text-[12px] text-theme-foreground">
              <div className="truncate font-medium">{pendingVideo.name}</div>
              <div className="text-theme-muted">{pendingVideo.type}</div>
            </div>
          </div>
        </div>
      )}

      {pendingImages.length > 0 && (
        <div className="mb-2 rounded-2xl border border-theme-glass bg-theme-panel px-3 py-3">
          <div className="mb-2 flex items-center justify-between text-[12px] text-theme-foreground">
            <span className="inline-flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-brand-300" />
              <span>
                {pendingImages.length}{" "}
                {pendingImages.length === 1
                  ? t("messages.imageSelected", "image selected")
                  : t("messages.imagesSelected", "images selected")} -{" "}
                {formatBytes(totalPendingImageBytes)}
              </span>
            </span>
            <button
              type="button"
              onClick={clearPendingImages}
              className="rounded-lg px-2 py-1 text-[11px] text-theme-muted transition-colors hover:bg-theme-panel hover:text-theme-foreground"
            >
              {t("messages.clearAttachments", "Remove all")}
            </button>
          </div>
          <div
            className={`grid gap-2 ${
              pendingImages.length > 3
                ? "grid-cols-3 md:grid-cols-4"
                : "grid-cols-2 md:grid-cols-3"
            }`}
          >
            {pendingImages.map((image) => (
              <div
                key={image.id}
                className="group relative overflow-hidden rounded-lg border border-theme-glass bg-theme-panel"
              >
                <img
                  src={image.previewUrl}
                  alt={image.name}
                  className="h-24 w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
                <button
                  type="button"
                  onClick={() => onRemoveImage(image.id)}
                  className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-theme-panel/70 text-theme-foreground opacity-80 transition hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <span className="absolute bottom-1 left-1 rounded-full bg-theme-panel/55 px-2 py-0.5 text-[10px] text-theme-foreground">
                  {formatBytes(image.size)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/^\/game\d*$/i.test(draft.trim()) &&
        pendingImages.length === 0 &&
        !pendingVideo && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-brand-500/20 bg-brand-500/5 px-3 py-2">
            <span className="text-xs text-brand-300/90"> <Trans>Type</Trans> <span className="font-mono font-semibold"><Trans>/game1</Trans></span>,{" "}
              <span className="font-mono font-semibold"><Trans>/game2</Trans></span><Trans>, etc. to share a game from your profile history</Trans> </span>
          </div>
        )}

      <div className="flex items-center gap-2 rounded-2xl border border-theme-glass bg-theme-panel p-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-theme-muted transition-colors hover:bg-theme-panel hover:text-theme-foreground"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => videoInputRef.current?.click()}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-theme-muted transition-colors hover:bg-theme-panel hover:text-theme-foreground"
        >
          <Video className="h-4 w-4" />
        </button>
        <input
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t("messages.composePlaceholder", "Type a message...")}
          className="flex-1 bg-transparent px-2 py-2 text-sm text-theme-foreground placeholder:text-theme-disabled outline-none"
        />

        <button
          onClick={onSend}
          disabled={
            sending ||
            (!draft.trim() && pendingImages.length === 0 && !pendingVideo)
          }
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-theme-on-accent shadow-[0_10px_20px_rgba(13,148,136,0.35)] transition-all hover:bg-brand-500 disabled:cursor-not-allowed disabled:bg-theme-surface disabled:text-theme-muted disabled:shadow-none"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}

