import { X } from "lucide-react";

type PreviewGalleryModalProps = {
  gallery: {
    items: { src: string; alt: string }[];
    index: number;
  } | null;
  onClose: () => void;
  onSelect: (index: number) => void;
};

export function PreviewGalleryModal({
  gallery,
  onClose,
  onSelect,
}: PreviewGalleryModalProps) {
  if (!gallery) return null;

  return (
    <div
      className="fixed inset-0 z-[130] bg-black/90 backdrop-blur-sm p-4 sm:p-8 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        aria-label="Close image preview"
      >
        <X className="w-5 h-5" />
      </button>
      <img
        src={gallery.items[gallery.index]?.src}
        alt={gallery.items[gallery.index]?.alt}
        className="w-[94vw] h-[90vh] object-contain rounded-lg"
        onClick={(event) => event.stopPropagation()}
      />

      {gallery.items.length > 1 && (
        <div
          className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/88 to-transparent px-4 pb-5 pt-12"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 text-xs text-gray-400">
            <span>
              {gallery.index + 1} / {gallery.items.length}
            </span>
            <span>Use keyboard arrows to browse</span>
          </div>
          <div className="mx-auto mt-3 flex max-w-4xl gap-2 overflow-x-auto pb-1 premium-scrollbar">
            {gallery.items.map((item, index) => (
              <button
                key={`${item.src}-${index}`}
                type="button"
                onClick={() => onSelect(index)}
                className={`h-14 w-14 shrink-0 overflow-hidden rounded-xl transition-all ${
                  index === gallery.index
                    ? "ring-2 ring-teal-400/60"
                    : "opacity-70 hover:opacity-100"
                }`}
              >
                <img
                  src={item.src}
                  alt={item.alt}
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
