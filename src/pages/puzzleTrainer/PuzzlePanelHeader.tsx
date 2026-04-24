import { ArrowLeft } from "lucide-react";

interface PuzzlePanelHeaderProps {
  onBack: () => void;
}

export function PuzzlePanelHeader({ onBack }: PuzzlePanelHeaderProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-[#1f2633]">
      <button
        onClick={onBack}
        className="text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft size={20} />
      </button>
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 bg-amber-600 rounded flex items-center justify-center">
          <span className="text-white font-bold text-xs"></span>
        </div>
        <span className="text-lg font-bold">Puzzles</span>
      </div>
      <div className="w-5" /> {/* Spacer */}
    </div>
  );
}
