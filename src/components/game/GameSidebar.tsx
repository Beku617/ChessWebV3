import { useMemo } from "react";
import { Compass } from "lucide-react";
import { OpeningMatch } from "../../utils/openingExplorer";

interface GameSidebarProps {
  moves: string[];
  gameStarted: boolean;
  gameOver: boolean;
  opening: OpeningMatch | null;
  openingLoading?: boolean;
}

export function GameSidebar({
  moves,
  gameStarted,
  gameOver,
  opening,
  openingLoading,
}: GameSidebarProps) {
  // Format moves for display
  const formattedMoves = useMemo(() => {
    const pairs: { white: string; black: string }[] = [];
    for (let i = 0; i < moves.length; i += 2) {
      pairs.push({
        white: moves[i] || "",
        black: moves[i + 1] || "",
      });
    }
    return pairs;
  }, [moves]);

  const statusTone = gameOver
    ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
    : gameStarted
      ? "bg-brand-500/10 text-brand-400 border border-brand-500/30"
      : "bg-gray-500/10 text-gray-500 border border-gray-500/20";

  const statusLabel = gameOver
    ? "Game over"
    : gameStarted
      ? "In progress"
      : "Waiting";

  return (
    <div className="w-full h-full min-h-0 rounded-3xl border border-gray-200/70 dark:border-white/5 bg-white/70 dark:bg-slate-900/70 shadow-2xl overflow-hidden backdrop-blur-xl flex flex-col">
      <div className="px-5 py-4 border-b border-gray-200/60 dark:border-white/5 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300 font-semibold">
            Game log
          </p>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Moves & opening
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            A clean timeline of your current game.
          </p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusTone}`}>
          {statusLabel}
        </span>
      </div>

      <div className="px-5 py-4 border-b border-gray-200/60 dark:border-white/5 bg-white/70 dark:bg-white/5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-brand-500/15 text-brand-600 dark:text-brand-200">
            <Compass className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <span>
                {opening
                  ? opening.variation
                    ? `${opening.name}: ${opening.variation}`
                    : opening.name
                  : gameStarted
                    ? openingLoading
                      ? "Detecting opening..."
                      : "Make a move to detect"
                    : "Waiting for your first move"}
              </span>
              {openingLoading && (
                <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
              )}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {opening?.eco ? `ECO ${opening.eco}` : "Book pending"}
              {opening?.nextMoves?.length
                ? ` • Next: ${opening.nextMoves.join(" • ")}`
                : ""}
            </div>
            {opening?.line && (
              <div className="text-xs text-gray-400 mt-1 overflow-hidden text-ellipsis whitespace-nowrap">
                {opening.line}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-2">
        {formattedMoves.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 dark:border-white/10 px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            {gameStarted
              ? "Make your first move to populate the log."
              : "Start a game to see your move list."}
          </div>
        ) : (
          formattedMoves.map((move, i) => (
            <div
              key={i}
              className="grid grid-cols-[auto_1fr_1fr] gap-x-3 items-center rounded-xl bg-gray-50/90 dark:bg-white/5 px-3 py-2 shadow-sm"
            >
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                {i + 1}.
              </span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {move.white}
              </span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {move.black}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

