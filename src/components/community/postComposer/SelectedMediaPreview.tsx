import { X } from "lucide-react";
import { CommunityImageGrid } from "../CommunityImageGrid";
import type { SelectedComposerImage } from "./types";

interface SelectedMediaPreviewProps {
  selectedImages: SelectedComposerImage[];
  selectedVideoPreviewUrl: string;
  isSubmitting: boolean;
  onClearSelectedImages: () => void;
  onClearSelectedMedia: () => void;
  onRemoveSelectedImage: (index: number) => void;
}

export function SelectedMediaPreview({
  selectedImages,
  selectedVideoPreviewUrl,
  isSubmitting,
  onClearSelectedImages,
  onClearSelectedMedia,
  onRemoveSelectedImage,
}: SelectedMediaPreviewProps) {
  if (selectedVideoPreviewUrl) {
    return (
      <div className="mt-2">
        <div className="relative overflow-hidden rounded-xl border border-black/80 bg-black/55">
          <button
            type="button"
            onClick={onClearSelectedMedia}
            disabled={isSubmitting}
            className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-gray-200 transition-colors hover:bg-black/80 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
            title="Remove media"
          >
            <X className="h-4 w-4" />
          </button>
          <video
            src={selectedVideoPreviewUrl}
            controls
            className="w-full max-h-[420px] bg-black object-contain"
          />
        </div>
      </div>
    );
  }

  if (selectedImages.length === 1) {
    return (
      <div className="mt-2">
        <div className="relative overflow-hidden rounded-xl border border-black/80 bg-black/55">
          <button
            type="button"
            onClick={onClearSelectedMedia}
            disabled={isSubmitting}
            className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-gray-200 transition-colors hover:bg-black/80 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
            title="Remove media"
          >
            <X className="h-4 w-4" />
          </button>
          <img
            src={selectedImages[0].previewUrl}
            alt={selectedImages[0].file.name || "Selected preview"}
            className="w-full max-h-[420px] bg-black object-contain"
          />
        </div>
      </div>
    );
  }

  if (selectedImages.length > 1) {
    return (
      <div className="mt-2 overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-brand-200/70">
              Image Set
            </div>
            <div className="mt-1 text-sm font-semibold text-white">
              {selectedImages.length} images selected
            </div>
          </div>

          <button
            type="button"
            onClick={onClearSelectedImages}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-lg bg-white/[0.06] px-3 py-2 text-xs font-semibold text-gray-200 transition-colors hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <X className="h-4 w-4" />
            Clear all
          </button>
        </div>

        <CommunityImageGrid
          items={selectedImages.map((image) => ({
            url: image.previewUrl,
            alt: image.file.name || "Selected preview",
          }))}
          onRemoveImage={onRemoveSelectedImage}
        />

        {selectedImages.length > 5 && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 premium-scrollbar">
            {selectedImages.map((image, index) => (
              <div
                key={image.id}
                className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-black/60"
              >
                <img
                  src={image.previewUrl}
                  alt={image.file.name || `Selected image ${index + 1}`}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => onRemoveSelectedImage(index)}
                  disabled={isSubmitting}
                  className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-45"
                  aria-label={`Remove image ${index + 1}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}

