import { useEffect, useRef } from "react";
import { MoveRow } from "../../hooks/useGameReplay";
import { MoveQualityPill } from "./MoveQualityPill";

interface ReplayMoveListProps {
  moveRows: MoveRow[];
  currentPly: number;
  onJumpTo: (ply: number) => void;
  opening?: string;
}

export function ReplayMoveList({
  moveRows,
  currentPly,
  onJumpTo,
  opening,
}: ReplayMoveListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const setRowRef =
    (whitePly: number, blackPly?: number) => (el: HTMLDivElement | null) => {
      if (!el) {
        rowRefs.current.delete(whitePly);
        if (blackPly) rowRefs.current.delete(blackPly);
      } else {
        rowRefs.current.set(whitePly, el);
        if (blackPly) rowRefs.current.set(blackPly, el);
      }
    };

  // Auto-scroll to active move (or nearest) whenever ply changes
  useEffect(() => {
    const target =
      rowRefs.current.get(currentPly) ||
      rowRefs.current.get(currentPly - 1) ||
      rowRefs.current.get(currentPly + 1);

    if (target && scrollContainerRef.current) {
      requestAnimationFrame(() => {
        target.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });
      });
    }
  }, [currentPly, moveRows]);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Moves
        </h3>
      </div>

      {/* Column Headers */}
      <div className="flex-shrink-0 grid grid-cols-[40px_1fr_1fr] text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
        <div className="px-3 py-2">#</div>
        <div className="px-3 py-2">White</div>
        <div className="px-3 py-2">Black</div>
      </div>

      {/* Opening Name */}
      {opening && (
        <div className="flex-shrink-0 px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
          <span className="text-xs text-gray-600 dark:text-gray-400">
            {opening}
          </span>
        </div>
      )}

      {/* Moves List */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto no-scrollbar"
      >
        {moveRows.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
            No moves recorded
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800/50">
            {moveRows.map((row) => (
              <div
                key={row.moveNumber}
                ref={setRowRef(row.plyWhite, row.plyBlack)}
                className="grid grid-cols-[40px_1fr_1fr] hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
              >
                {/* Move Number */}
                <div className="px-3 py-2.5 text-sm font-mono text-gray-400 dark:text-gray-500">
                  {row.moveNumber}.
                </div>

                {/* White Move */}
                <div
                  className={`px-3 py-2.5 cursor-pointer transition-all ${
                    currentPly === row.plyWhite
                      ? "bg-brand-500/20 dark:bg-brand-500/20"
                      : "hover:bg-gray-100 dark:hover:bg-gray-700/50"
                  }`}
                  onClick={() => onJumpTo(row.plyWhite)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`font-mono text-sm ${
                        currentPly === row.plyWhite
                          ? "text-brand-700 dark:text-brand-300 font-semibold"
                          : "text-gray-800 dark:text-gray-200"
                      }`}
                    >
                      {row.white || "—"}
                    </span>
                    {row.whiteQuality && (
                      <MoveQualityPill quality={row.whiteQuality} />
                    )}
                  </div>
                </div>

                {/* Black Move */}
                <div
                  className={`px-3 py-2.5 cursor-pointer transition-all ${
                    row.plyBlack && currentPly === row.plyBlack
                      ? "bg-brand-500/20 dark:bg-brand-500/20"
                      : row.black
                        ? "hover:bg-gray-100 dark:hover:bg-gray-700/50"
                        : ""
                  }`}
                  onClick={() => row.plyBlack && onJumpTo(row.plyBlack)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`font-mono text-sm ${
                        row.plyBlack && currentPly === row.plyBlack
                          ? "text-brand-700 dark:text-brand-300 font-semibold"
                          : "text-gray-800 dark:text-gray-200"
                      }`}
                    >
                      {row.black || "—"}
                    </span>
                    {row.blackQuality && (
                      <MoveQualityPill quality={row.blackQuality} />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer with navigation hints */}
      <div className="flex-shrink-0 px-4 py-2 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
        <span className="text-[11px] text-gray-400 dark:text-gray-500">
          ← → Navigate • Space Play • F Flip
        </span>
      </div>
    </div>
  );
}

