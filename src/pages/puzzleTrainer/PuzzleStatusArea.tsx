import { Check, X, Eye, Lightbulb } from "lucide-react";
import { PuzzleStatus } from "./types";
import { formatTime } from "./utils";

interface PuzzleStatusAreaProps {
  status: PuzzleStatus;
  elapsedTime: number;
  showHint: boolean;
  solutionMoves: string[];
}

export function PuzzleStatusArea({
  status,
  elapsedTime,
  showHint,
  solutionMoves,
}: PuzzleStatusAreaProps) {
  if (status === "correct") {
    return (
      <div className="bg-brand-900/40 border border-brand-600 rounded-lg p-3 flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center flex-shrink-0">
          <Check size={18} strokeWidth={3} />
        </div>
        <div>
          <h3 className="font-bold text-brand-400 text-sm">Correct!</h3>
          <p className="text-brand-500 text-xs">
            Solved in {formatTime(elapsedTime)}
          </p>
        </div>
      </div>
    );
  }

  if (status === "wrong") {
    return (
      <div className="bg-red-900/40 border border-red-600 rounded-lg p-3 flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
          <X size={18} strokeWidth={3} />
        </div>
        <div>
          <h3 className="font-bold text-red-400 text-sm">Wrong move</h3>
          <p className="text-red-500 text-xs">Try again or view solution</p>
        </div>
      </div>
    );
  }

  if (status === "showingSolution") {
    return (
      <div className="bg-blue-900/40 border border-blue-600 rounded-lg p-3">
        <div className="flex items-center gap-2 text-blue-400 font-semibold text-sm mb-1">
          <Eye size={16} /> Solution
        </div>
        <div className="flex flex-wrap gap-1">
          {solutionMoves.map((move, idx) => (
            <span
              key={idx}
              className="px-1.5 py-0.5 bg-blue-800 rounded font-mono text-xs"
            >
              {move}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (status === "solving" && showHint) {
    return (
      <div className="bg-yellow-900/40 border border-yellow-600 rounded-lg p-3">
        <div className="flex items-center gap-2 text-yellow-400 font-semibold text-sm mb-1">
          <Lightbulb size={16} /> Hint
        </div>
        <p className="text-yellow-500 text-xs">
          First move:{" "}
          <span className="font-mono font-bold">
            {solutionMoves[0]?.slice(0, 2)}...
          </span>
        </p>
      </div>
    );
  }

  return null;
}

