import { MoveNotation } from "../game";
import { useTranslation } from "react-i18next";

interface GameCardMoveHistoryProps {
  formattedMoves: string[];
  result: string;
}

export function GameCardMoveHistory({
  formattedMoves,
  result,
}: GameCardMoveHistoryProps) {
  const { t } = useTranslation();
  return (
    <div>
      <h4 className="text-xs uppercase tracking-wider text-theme-muted font-semibold mb-3">
        {t("profileGames.card.moveHistory", "Move History")}
      </h4>
      <div className="bg-theme-panel rounded-lg border border-theme-glass p-4 max-h-48 overflow-y-auto">
        <p className="font-mono text-sm text-theme-muted leading-relaxed">
          {formattedMoves.map((m, i) => (
            <span
              key={i}
              className="mr-2 hover:bg-theme-hover rounded px-1 cursor-pointer transition-colors"
            >
              <MoveNotation notation={m} />
            </span>
          ))}
          <span className="font-bold text-brand-600 ml-2">
            {result}
          </span>
        </p>
      </div>
    </div>
  );
}

