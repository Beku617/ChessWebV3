interface PuzzleProgressBarProps {
  streak: number;
  puzzleElo: number;
}

export function PuzzleProgressBar({
  streak,
  puzzleElo,
}: PuzzleProgressBarProps) {
  return (
    <>
      {/* Progress Bar */}
      <div className="px-3 py-1">
        <div className="flex items-center justify-between">
          <span className="text-xl font-bold text-white">{streak}</span>
          <div className="flex-1 mx-3 h-1.5 bg-[#1f2633] rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-all duration-300"
              style={{ width: `${Math.min(streak * 20, 100)}%` }}
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-amber-500 text-lg"></span>
            <span className="font-bold text-sm">5</span>
          </div>
        </div>
      </div>

      {/* Puzzle Elo */}
      <div className="px-3 pb-2 text-sm text-gray-300 flex items-center gap-2">
        <span className="text-gray-400">Puzzle Elo</span>
        <span className="font-semibold text-amber-300 font-mono">
          {puzzleElo}
        </span>
      </div>
    </>
  );
}
