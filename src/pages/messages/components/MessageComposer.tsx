import type { KeyboardEvent, RefObject } from "react";
import {
  ArchiveRestore,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Send,
  Smile,
  Video,
  X,
  Crown,
} from "lucide-react";
import { useTranslation } from "react-i18next";

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
      <div className="shrink-0 border-t border-gray-200 dark:border-[#1f2c45] bg-[#0f182a]/95 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#27354f] bg-[#121e31]/92 px-3 py-3">
          <div className="text-sm text-slate-200">
            {t(
              "messages.archivedReadOnly",
              "This conversation is archived. Unarchive to reply.",
            )}
          </div>
          <button
            type="button"
            onClick={onUnarchive}
            disabled={actionLoading === "archive"}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(13,148,136,0.35)] transition-all hover:bg-brand-500 disabled:cursor-not-allowed disabled:bg-gray-200 dark:disabled:bg-[#1e2a40] disabled:text-slate-500 disabled:shadow-none"
          >
            <ArchiveRestore className="h-4 w-4" />
            <span>{t("messages.unarchive", "Unarchive")}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-gray-200 dark:border-[#1f2c45] bg-[#0f182a]/95 px-4 py-3 backdrop-blur-xl">
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
        <div className="mb-2 rounded-2xl border border-[#27354f] bg-[#0f1829]/92 px-3 py-3">
          <div className="mb-2 flex items-center justify-between text-[12px] text-slate-200">
            <span className="inline-flex items-center gap-2">
              <Video className="h-4 w-4 text-brand-300" />
              <span>1 video selected · {formatBytes(pendingVideo.size)}</span>
            </span>
            <button
              type="button"
              onClick={clearPendingVideo}
              className="rounded-lg px-2 py-1 text-[11px] text-slate-300 transition-colors hover:bg-[#18273f] hover:text-white"
            >
              {t("messages.clearAttachments", "Remove all")}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative h-24 w-40 overflow-hidden rounded-xl border border-[#23334f] bg-[#0b1424] shadow-[0_10px_24px_rgba(0,0,0,0.28)]">
              <video
                src={pendingVideo.previewUrl}
                className="h-full w-full object-cover"
                controls
                muted
              />
              <button
                type="button"
                onClick={clearPendingVideo}
                className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white opacity-80 transition hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <span className="absolute bottom-1 left-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-slate-100">
                {formatBytes(pendingVideo.size)}
              </span>
            </div>
            <div className="min-w-0 flex-1 text-[12px] text-slate-200">
              <div className="truncate font-medium">{pendingVideo.name}</div>
              <div className="text-slate-400">{pendingVideo.type}</div>
            </div>
          </div>
        </div>
      )}

      {pendingImages.length > 0 && (
        <div className="mb-2 rounded-2xl border border-[#27354f] bg-[#0f1829]/92 px-3 py-3">
          <div className="mb-2 flex items-center justify-between text-[12px] text-slate-200">
            <span className="inline-flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-brand-300" />
              <span>
                {pendingImages.length}{" "}
                {pendingImages.length === 1 ? "image selected" : "images selected"} -{" "}
                {formatBytes(totalPendingImageBytes)}
              </span>
            </span>
            <button
              type="button"
              onClick={clearPendingImages}
              className="rounded-lg px-2 py-1 text-[11px] text-slate-300 transition-colors hover:bg-[#18273f] hover:text-white"
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
                className="group relative overflow-hidden rounded-lg border border-[#23334f] bg-[#0b1424]"
              >
                <img
                  src={image.previewUrl}
                  alt={image.name}
                  className="h-24 w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
                <button
                  type="button"
                  onClick={() => onRemoveImage(image.id)}
                  className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white opacity-80 transition hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <span className="absolute bottom-1 left-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-slate-100">
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
            <Crown className="h-4 w-4 shrink-0 text-brand-400" />
            <span className="text-xs text-brand-300/90">
              Type <span className="font-mono font-semibold">/game1</span>,{" "}
              <span className="font-mono font-semibold">/game2</span>, etc. to
              share a game from your profile history
            </span>
          </div>
        )}

      <div className="flex items-center gap-2 rounded-2xl border border-[#27354f] bg-[#121e31]/92 p-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-[#1b2a41] hover:text-slate-100"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => videoInputRef.current?.click()}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-[#1b2a41] hover:text-slate-100"
        >
          <Video className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-[#1b2a41] hover:text-slate-100"
        >
          <Smile className="h-4 w-4" />
        </button>

        <input
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t("messages.composePlaceholder", "Type a message...")}
          className="flex-1 bg-transparent px-2 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none"
        />

        <button
          onClick={onSend}
          disabled={
            sending ||
            (!draft.trim() && pendingImages.length === 0 && !pendingVideo)
          }
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-[0_10px_20px_rgba(13,148,136,0.35)] transition-all hover:bg-brand-500 disabled:cursor-not-allowed disabled:bg-gray-200 dark:disabled:bg-[#1e2a40] disabled:text-gray-400 dark:disabled:text-slate-600 disabled:shadow-none"
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

