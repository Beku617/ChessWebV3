import { Calendar, Clock, ChevronDown, ChevronUp, Swords, Share2 } from "lucide-react";
import { GameHistory } from "../../historyTypes";

interface GameCardHeaderProps {
  game: GameHistory;
  isExpanded: boolean;
  onToggle: () => void;
  resultText: string;
  resultBg: string;
  resultColor: string;
  playerIsWhite: boolean;
  formatDuration: (ms?: number) => string;
  gameIndex?: number;
  onShare?: () => void;
}

export function GameCardHeader({
  game,
  isExpanded,
  onToggle,
  resultText,
  resultBg,
  resultColor,
  playerIsWhite,
  formatDuration,
  gameIndex,
  onShare,
}: GameCardHeaderProps) {
  return (
    <div
      onClick={onToggle}
      className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {gameIndex != null && (
            <span className="inline-flex h-7 min-w-[28px] items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800 text-xs font-semibold text-gray-500 dark:text-gray-400 tabular-nums" title={`Game #${gameIndex}`}>
              {gameIndex}
            </span>
          )}
          <div
            className={`px-3 py-1.5 rounded-lg font-bold text-sm ${resultBg} ${resultColor} w-16 text-center`}
          >
            {resultText}
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${game.white === "Stockfish" ? "bg-gray-400" : "bg-teal-500"}`}
              ></div>
              <span
                className={`font-medium ${playerIsWhite ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"}`}
              >
                {game.white}{" "}
                <span className="text-xs text-gray-400">({game.whiteElo})</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${game.black === "Stockfish" ? "bg-gray-400" : "bg-teal-500"}`}
              ></div>
              <span
                className={`font-medium ${!playerIsWhite ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"}`}
              >
                {game.black}{" "}
                <span className="text-xs text-gray-400">({game.blackElo})</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6 text-sm text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-1.5" title="Date">
            <Calendar size={14} />
            <span>{game.date}</span>
          </div>
          <div className="flex items-center gap-1.5" title="Duration">
            <Clock size={14} />
            <span>{formatDuration(game.durationMs)}</span>
          </div>
          <div className="flex items-center gap-1.5" title="Moves">
            <Swords size={14} />
            <span>{game.moves.length}</span>
          </div>
          {onShare && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onShare();
              }}
              title="Share game"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 transition-colors hover:border-teal-400 dark:hover:border-teal-600 hover:text-teal-500 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-500/10"
            >
              <Share2 size={14} />
            </button>
          )}
          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </div>
    </div>
  );
}
