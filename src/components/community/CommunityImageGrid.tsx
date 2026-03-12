import { X } from "lucide-react";

export interface CommunityImageGridItem {
  url: string;
  alt: string;
}

interface CommunityImageGridProps {
  items: CommunityImageGridItem[];
  className?: string;
  onImageClick?: (index: number) => void;
  onRemoveImage?: (index: number) => void;
}

function ImageTile({
  item,
  index,
  className,
  hiddenCount = 0,
  onImageClick,
  onRemoveImage,
}: {
  item: CommunityImageGridItem;
  index: number;
  className?: string;
  hiddenCount?: number;
  onImageClick?: (index: number) => void;
  onRemoveImage?: (index: number) => void;
}) {
  const isInteractive = typeof onImageClick === "function";

  return (
    <div className={`group/tile relative overflow-hidden rounded-[18px] bg-black/60 ${className || ""}`}>
      {isInteractive ? (
        <button
          type="button"
          onClick={() => onImageClick(index)}
          className="block h-full w-full text-left"
        >
          <img
            src={item.url}
            alt={item.alt}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover/tile:scale-[1.025]"
          />
        </button>
      ) : (
        <img
          src={item.url}
          alt={item.alt}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover/tile:scale-[1.025]"
        />
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/28 via-transparent to-transparent" />

      {hiddenCount > 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/58">
          <span className="text-[28px] font-semibold tracking-tight text-white">
            +{hiddenCount}
          </span>
        </div>
      )}

      {onRemoveImage && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemoveImage(index);
          }}
          className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/62 text-gray-100 transition-colors hover:bg-black/80 hover:text-white"
          aria-label="Remove image"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function CommunityImageGrid({
  items,
  className = "",
  onImageClick,
  onRemoveImage,
}: CommunityImageGridProps) {
  const visibleItems = items.slice(0, 5);
  const hiddenCount = Math.max(0, items.length - visibleItems.length);

  if (visibleItems.length === 0) return null;

  if (visibleItems.length === 1) {
    return (
      <div className={className}>
        <ImageTile
          item={visibleItems[0]}
          index={0}
          className="aspect-[16/11]"
          onImageClick={onImageClick}
          onRemoveImage={onRemoveImage}
        />
      </div>
    );
  }

  if (visibleItems.length === 2) {
    return (
      <div className={`grid grid-cols-2 gap-2.5 ${className}`}>
        {visibleItems.map((item, index) => (
          <ImageTile
            key={`${item.url}-${index}`}
            item={item}
            index={index}
            className="aspect-[4/3]"
            onImageClick={onImageClick}
            onRemoveImage={onRemoveImage}
          />
        ))}
      </div>
    );
  }

  if (visibleItems.length === 3) {
    return (
      <div
        className={`grid aspect-[15/10] grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] grid-rows-2 gap-2.5 ${className}`}
      >
        <ImageTile
          item={visibleItems[0]}
          index={0}
          className="row-span-2 h-full"
          onImageClick={onImageClick}
          onRemoveImage={onRemoveImage}
        />
        <ImageTile
          item={visibleItems[1]}
          index={1}
          className="h-full"
          onImageClick={onImageClick}
          onRemoveImage={onRemoveImage}
        />
        <ImageTile
          item={visibleItems[2]}
          index={2}
          className="h-full"
          onImageClick={onImageClick}
          onRemoveImage={onRemoveImage}
        />
      </div>
    );
  }

  if (visibleItems.length === 4) {
    return (
      <div className={`grid grid-cols-2 gap-2.5 ${className}`}>
        {visibleItems.map((item, index) => (
          <ImageTile
            key={`${item.url}-${index}`}
            item={item}
            index={index}
            className="aspect-[4/3]"
            onImageClick={onImageClick}
            onRemoveImage={onRemoveImage}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={`space-y-2.5 ${className}`}>
      <div className="grid grid-cols-2 gap-2.5">
        {visibleItems.slice(0, 2).map((item, index) => (
          <ImageTile
            key={`${item.url}-${index}`}
            item={item}
            index={index}
            className="aspect-[5/4]"
            onImageClick={onImageClick}
            onRemoveImage={onRemoveImage}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {visibleItems.slice(2, 5).map((item, rowIndex) => {
          const index = rowIndex + 2;
          const isOverflowTile = hiddenCount > 0 && index === 4;
          return (
            <ImageTile
              key={`${item.url}-${index}`}
              item={item}
              index={index}
              hiddenCount={isOverflowTile ? hiddenCount : 0}
              className="aspect-[5/4]"
              onImageClick={onImageClick}
              onRemoveImage={onRemoveImage}
            />
          );
        })}
      </div>
    </div>
  );
}
