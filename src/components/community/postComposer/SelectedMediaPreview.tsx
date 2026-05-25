import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();

  if (selectedVideoPreviewUrl) {
    return (
      <div className="mt-2">
        <div className="relative overflow-hidden rounded-xl border border-theme-glass bg-theme-panel/55">
          <button
            type="button"
            onClick={onClearSelectedMedia}
            disabled={isSubmitting}
            className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-theme-panel/60 text-theme-muted transition-colors hover:bg-theme-panel/80 hover:text-theme-foreground disabled:cursor-not-allowed disabled:opacity-45"
            title={t("communityComposer.removeMedia")}
          >
            <X className="h-4 w-4" />
          </button>
          <video
            src={selectedVideoPreviewUrl}
            controls
            className="w-full max-h-[420px] bg-theme-panel object-contain"
          />
        </div>
      </div>
    );
  }

  if (selectedImages.length === 1) {
    return (
      <div className="mt-2">
        <div className="relative overflow-hidden rounded-xl border border-theme-glass bg-theme-panel/55">
          <button
            type="button"
            onClick={onClearSelectedMedia}
            disabled={isSubmitting}
            className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-theme-panel/60 text-theme-muted transition-colors hover:bg-theme-panel/80 hover:text-theme-foreground disabled:cursor-not-allowed disabled:opacity-45"
            title={t("communityComposer.removeMedia")}
          >
            <X className="h-4 w-4" />
          </button>
          <img
            src={selectedImages[0].previewUrl}
            alt={selectedImages[0].file.name || t("communityComposer.selectedPreview")}
            className="w-full max-h-[420px] bg-theme-panel object-contain"
          />
        </div>
      </div>
    );
  }

  if (selectedImages.length > 1) {
    return (
      <div className="mt-2 overflow-hidden rounded-2xl border border-theme-glass bg-theme-panel/[0.025] p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-brand-200/70">
              {t("communityComposer.imageSet")}
            </div>
            <div className="mt-1 text-sm font-semibold text-theme-foreground">
              {t("communityComposer.imagesSelected", { count: selectedImages.length })}
            </div>
          </div>

          <button
            type="button"
            onClick={onClearSelectedImages}
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
          onRemoveImage={onRemoveSelectedImage}
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
                    t("communityComposer.selectedImageAlt", { index: index + 1 })
                  }
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => onRemoveSelectedImage(index)}
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
    );
  }

  return null;
}

