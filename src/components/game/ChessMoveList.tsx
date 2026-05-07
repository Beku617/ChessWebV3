import type { ReactNode } from "react";
import { MoveNotation } from "./MoveNotation";

function joinClasses(...classes: Array<string | undefined | null | false>) {
  return classes.filter(Boolean).join(" ");
}

export interface ChessMoveRow {
  key?: string | number;
  moveNumber: number;
  white?: string | null;
  black?: string | null;
  whitePly?: number | null;
  blackPly?: number | null;
  whiteAccessory?: ReactNode;
  blackAccessory?: ReactNode;
}

interface ChessMoveListProps {
  rows: ChessMoveRow[];
  emptyMessage: string;
  activePly?: number | null;
  onSelectPly?: (ply: number) => void;
  className?: string;
  listClassName?: string;
  rowClassName?: string;
  moveNumberClassName?: string;
  moveCellClassName?: string;
  activeMoveClassName?: string;
  inactiveMoveClassName?: string;
  getRowRef?: (row: ChessMoveRow) => (element: HTMLDivElement | null) => void;
  missingMoveText?: string;
  showMissingMoveCell?: boolean;
  footer?: ReactNode;
}

function MoveCell({
  notation,
  ply,
  accessory,
  activePly,
  onSelectPly,
  moveCellClassName,
  activeMoveClassName,
  inactiveMoveClassName,
  showMissingMoveCell,
  missingMoveText,
}: {
  notation?: string | null;
  ply?: number | null;
  accessory?: ReactNode;
  activePly?: number | null;
  onSelectPly?: (ply: number) => void;
  moveCellClassName?: string;
  activeMoveClassName?: string;
  inactiveMoveClassName?: string;
  showMissingMoveCell: boolean;
  missingMoveText: string;
}) {
  if (!notation) {
    if (!showMissingMoveCell) {
      return (
        <span
          aria-hidden="true"
          className={joinClasses(
            "flex-1 px-2",
            moveCellClassName,
            "opacity-0 pointer-events-none select-none",
          )}
        />
      );
    }
    return (
      <span
        className={joinClasses(
          "flex-1 px-2 text-gray-400 dark:text-gray-500",
          moveCellClassName,
        )}
      >
        {missingMoveText}
      </span>
    );
  }

  const isActive = Number.isFinite(ply) && Number(activePly) === Number(ply);
  const canSelect = typeof onSelectPly === "function" && Number.isFinite(ply);
  const moveCellTone = isActive
    ? activeMoveClassName || "text-emerald-500"
    : inactiveMoveClassName || "text-gray-800 dark:text-gray-200";

  const content = (
    <span className="flex min-w-0 items-center justify-between gap-2">
      <MoveNotation notation={notation} textClassName="truncate" />
      {accessory}
    </span>
  );

  if (!canSelect) {
    return (
      <span
        className={joinClasses(
          "flex-1 px-2",
          moveCellClassName,
          moveCellTone,
          isActive ? "font-semibold" : null,
        )}
      >
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelectPly?.(Number(ply))}
      className={joinClasses(
        "flex-1 px-2 text-left transition-colors hover:text-brand-400",
        moveCellClassName,
        moveCellTone,
        isActive ? "font-semibold" : null,
      )}
    >
      {content}
    </button>
  );
}

export function buildChessMoveRows(
  moves: string[],
  options?: {
    startMoveNumber?: number;
    startPly?: number;
  },
): ChessMoveRow[] {
  const startMoveNumber = Math.max(1, Number(options?.startMoveNumber || 1));
  const startPly = Math.max(1, Number(options?.startPly || 1));

  const rows: ChessMoveRow[] = [];
  for (let index = 0; index < moves.length; index += 2) {
    rows.push({
      moveNumber: startMoveNumber + Math.floor(index / 2),
      white: moves[index] || null,
      black: moves[index + 1] || null,
      whitePly: startPly + index,
      blackPly: moves[index + 1] ? startPly + index + 1 : null,
    });
  }

  return rows;
}

export function ChessMoveList({
  rows,
  emptyMessage,
  activePly,
  onSelectPly,
  className,
  listClassName,
  rowClassName,
  moveNumberClassName,
  moveCellClassName,
  activeMoveClassName,
  inactiveMoveClassName,
  getRowRef,
  missingMoveText = "—",
  showMissingMoveCell = false,
  footer,
}: ChessMoveListProps) {
  if (!rows.length) {
    return (
      <div
        className={joinClasses(
          "text-center text-gray-400 dark:text-gray-500 text-sm py-6",
          className,
        )}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={joinClasses("space-y-1", className, listClassName)}>
      {rows.map((row, index) => (
        <div
          key={row.key ?? `${row.moveNumber}-${index}`}
          ref={getRowRef ? getRowRef(row) : undefined}
          className={joinClasses(
            "flex items-center text-sm font-mono leading-6",
            rowClassName,
          )}
        >
          <span
            className={joinClasses(
              "w-9 text-gray-400 dark:text-gray-500",
              moveNumberClassName,
            )}
          >
            {row.moveNumber}.
          </span>

          <MoveCell
            notation={row.white}
            ply={row.whitePly}
            accessory={row.whiteAccessory}
            activePly={activePly}
            onSelectPly={onSelectPly}
            moveCellClassName={moveCellClassName}
            activeMoveClassName={activeMoveClassName}
            inactiveMoveClassName={inactiveMoveClassName}
            showMissingMoveCell={showMissingMoveCell}
            missingMoveText={missingMoveText}
          />

          <MoveCell
            notation={row.black}
            ply={row.blackPly}
            accessory={row.blackAccessory}
            activePly={activePly}
            onSelectPly={onSelectPly}
            moveCellClassName={moveCellClassName}
            activeMoveClassName={activeMoveClassName}
            inactiveMoveClassName={inactiveMoveClassName}
            showMissingMoveCell={showMissingMoveCell}
            missingMoveText={missingMoveText}
          />
        </div>
      ))}
      {footer}
    </div>
  );
}

