import { MoveNotation } from "../game";

interface GameCardMoveHistoryProps {
  formattedMoves: string[];
  result: string;
}

export function GameCardMoveHistory({
  formattedMoves,
  result,
}: GameCardMoveHistoryProps) {
  return (
    <div>
      <h4 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">
        Move History
      </h4>
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 max-h-48 overflow-y-auto">
        <p className="font-mono text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          {formattedMoves.map((m, i) => (
            <span
              key={i}
              className="mr-2 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 rounded px-1 cursor-pointer transition-colors"
            >
              <MoveNotation notation={m} />
            </span>
          ))}
          <span className="font-bold text-brand-600 dark:text-brand-400 ml-2">
            {result}
          </span>
        </p>
      </div>
    </div>
  );
}

