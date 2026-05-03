import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { MoveRow } from "../../hooks/useGameReplay";
import { ChessMoveList } from "../../components/game";
import type { ChessMoveRow } from "../../components/game";
import { MoveQualityPill } from "./MoveQualityPill";

interface ReplayMoveListProps {
  moveRows: MoveRow[];
  currentPly: number;
  onJumpTo: (ply: number) => void;
  opening?: string;
  aiExplainedPlies?: Set<number>;
}

export function ReplayMoveList({
  moveRows,
  currentPly,
  onJumpTo,
  opening,
  aiExplainedPlies,
}: ReplayMoveListProps) {
  const { t } = useTranslation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const sharedRows = useMemo<ChessMoveRow[]>(
    () =>
      moveRows.map((row) => ({
        key: row.moveNumber,
        moveNumber: row.moveNumber,
        white: row.white || null,
        black: row.black || null,
        whitePly: row.plyWhite,
        blackPly: row.plyBlack ?? null,
        whiteAccessory: row.whiteQuality ? (
          <MoveQualityPill
            quality={row.whiteQuality}
            showAiBadge={Boolean(aiExplainedPlies?.has(row.plyWhite))}
          />
        ) : null,
        blackAccessory: row.blackQuality ? (
          <MoveQualityPill
            quality={row.blackQuality}
            showAiBadge={Boolean(
              row.plyBlack && aiExplainedPlies?.has(row.plyBlack),
            )}
          />
        ) : null,
      })),
    [aiExplainedPlies, moveRows],
  );

  const getRowRef =
    (row: ChessMoveRow) => (element: HTMLDivElement | null) => {
      const whitePly = Number(row.whitePly || 0);
      const blackPly = Number(row.blackPly || 0);

      if (!element) {
        if (whitePly > 0) rowRefs.current.delete(whitePly);
        if (blackPly > 0) rowRefs.current.delete(blackPly);
        return;
      }

      if (whitePly > 0) rowRefs.current.set(whitePly, element);
      if (blackPly > 0) rowRefs.current.set(blackPly, element);
    };

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
  }, [currentPly, sharedRows]);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          {t("analysis.moves", "Moves")}
        </h3>
      </div>

      <div className="flex-shrink-0 grid grid-cols-[40px_1fr_1fr] text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
        <div className="px-3 py-2">#</div>
        <div className="px-3 py-2">{t("analysis.moveListWhite", "White")}</div>
        <div className="px-3 py-2">{t("analysis.moveListBlack", "Black")}</div>
      </div>

      {opening && (
        <div className="flex-shrink-0 px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
          <span className="text-xs text-gray-600 dark:text-gray-400">{opening}</span>
        </div>
      )}

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto no-scrollbar px-1 py-1">
        <ChessMoveList
          rows={sharedRows}
          emptyMessage={t("analysis.noMovesYet", "No moves yet")}
          activePly={currentPly}
          onSelectPly={onJumpTo}
          rowClassName="rounded-sm py-0.5 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
          moveNumberClassName="w-10 px-3 py-2 text-sm"
          moveCellClassName="rounded-md px-3 py-2 text-sm"
          activeMoveClassName="bg-brand-500/20 text-brand-700 dark:text-brand-300"
          inactiveMoveClassName="text-gray-800 dark:text-gray-200"
          showMissingMoveCell
          getRowRef={getRowRef}
        />
      </div>

      <div className="flex-shrink-0 px-4 py-2 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
        <span className="text-[11px] text-gray-400 dark:text-gray-500">
          {t("analysis.moveListHints", "← → Navigate • Space Play • F Flip")}
        </span>
      </div>
    </div>
  );
}
