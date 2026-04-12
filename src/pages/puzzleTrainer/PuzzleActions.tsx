import { ChevronRight, Lightbulb, ChevronLeft, Settings } from "lucide-react";
import { PuzzleStatus } from "./types";
import { formatTime } from "./utils";

interface PuzzleActionsProps {
  status: PuzzleStatus;
  showHint: boolean;
  elapsedTime: number;
  onNextPuzzle: () => void;
  onPrevPuzzle: () => void;
  onUseHint: () => void;
}

export function PuzzleActions({
  status,
  showHint,
  elapsedTime,
  onNextPuzzle,
  onPrevPuzzle,
  onUseHint,
}: PuzzleActionsProps) {
  return (
    <>
      {/* Timer */}
      <div className="px-3 py-2 flex items-center gap-2 text-gray-300">
        <div className="w-3 h-3 rounded-full border-2 border-gray-500" />
        <span className="font-mono">{formatTime(elapsedTime)}</span>
      </div>

      {/* Action Button */}
      <div className="p-3">
        {status === "correct" || status === "showingSolution" ? (
          <button
            onClick={onNextPuzzle}
            className="w-full flex items-center justify-center gap-1 py-2 rounded-lg font-bold text-sm bg-brand-600 hover:bg-brand-500 transition-colors"
          >
            Next Puzzle <ChevronRight size={18} />
          </button>
        ) : (
          <button
            onClick={onUseHint}
            disabled={showHint}
            className={`w-full flex items-center justify-center gap-1 py-2 rounded-lg font-bold text-sm transition-colors ${
              showHint
                ? "bg-[#1f2633] text-gray-500 cursor-not-allowed"
                : "bg-[#161b25] hover:bg-[#1f222e] text-white"
            }`}
          >
            <Lightbulb
              size={16}
              className={showHint ? "" : "text-yellow-400"}
            />
            {showHint ? "Hint Used" : "Hint"}
          </button>
        )}
      </div>

      {/* Bottom Nav */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-[#1f2633]">
        <button className="text-gray-500 hover:text-white transition-colors">
          <Settings size={18} />
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={onPrevPuzzle}
            className="text-gray-400 hover:text-white transition-colors p-1"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={onNextPuzzle}
            className="text-gray-400 hover:text-white transition-colors p-1"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </>
  );
}

