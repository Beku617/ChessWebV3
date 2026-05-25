import { Trans } from "react-i18next";
import { PuzzleItem } from "./types";

interface PuzzleInfoCardProps {
  puzzle: PuzzleItem;
  isWhiteToMove: boolean;
}

export function PuzzleInfoCard({ puzzle, isWhiteToMove }: PuzzleInfoCardProps) {
  return (
    <div className="p-3">
      <div className="bg-theme-panel rounded-lg p-3">
        <div className="flex items-start gap-2">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-xl flex-shrink-0">
            {puzzle.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div
                className={`w-3 h-3 rounded border-2 ${
                  isWhiteToMove
                    ? "bg-theme-panel border-theme-glass"
                    : "bg-theme-surface border-theme-border"
                }`}
              />
              <span className="font-semibold text-xs">
                {isWhiteToMove ? "White" : "Black"} <Trans>to move</Trans> </span>
            </div>
            <p className="text-theme-muted text-xs leading-relaxed line-clamp-2">
              {puzzle.description ||
                `Find the best move! Rating: ${puzzle.rating}`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

