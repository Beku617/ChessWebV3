import { Calendar, Clock, ChevronDown, ChevronUp, Swords, Share2 } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  return (
    <div
      onClick={onToggle}
      className="p-4 cursor-pointer hover:bg-theme-surface transition-colors"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          {gameIndex != null && (
            <span
              className="inline-flex h-7 min-w-[28px] items-center justify-center rounded-md bg-theme-surface text-xs font-semibold text-theme-muted tabular-nums"
              title={t("profileGames.card.gameNumber", {
                index: gameIndex,
                defaultValue: "Game #{{index}}",
              })}
            >
              {gameIndex}
            </span>
          )}
          <div
            className={`inline-flex min-w-[4rem] shrink-0 items-center justify-center rounded-lg px-3 py-1.5 text-center text-sm font-bold ${resultBg} ${resultColor}`}
          >
            {resultText}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${game.white === "Stockfish" ? "bg-theme-surface" : "bg-brand-500"}`}
              ></div>
              <div className="flex min-w-0 items-center gap-1">
                <span
                  className={`min-w-0 truncate font-medium ${playerIsWhite ? "text-theme-foreground " : "text-theme-muted"}`}
                  title={String(game.white || "")}
                >
                  {game.white}
                </span>
                {game.whiteElo != null && (
                  <span className="shrink-0 text-xs text-theme-muted">({game.whiteElo})</span>
                )}
              </div>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${game.black === "Stockfish" ? "bg-theme-surface" : "bg-brand-500"}`}
              ></div>
              <div className="flex min-w-0 items-center gap-1">
                <span
                  className={`min-w-0 truncate font-medium ${!playerIsWhite ? "text-theme-foreground " : "text-theme-muted"}`}
                  title={String(game.black || "")}
                >
                  {game.black}
                </span>
                {game.blackElo != null && (
                  <span className="shrink-0 text-xs text-theme-muted">({game.blackElo})</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-6 text-sm text-theme-muted">
          <div
            className="flex items-center gap-1.5"
            title={t("profileGames.columns.date", "Date")}
          >
            <Calendar size={14} />
            <span>{game.date}</span>
          </div>
          <div
            className="flex items-center gap-1.5"
            title={t("profileGames.card.duration", "Duration")}
          >
            <Clock size={14} />
            <span>{formatDuration(game.durationMs)}</span>
          </div>
          <div
            className="flex items-center gap-1.5"
            title={t("profileGames.card.moves", "Moves")}
          >
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
              title={t("profileGames.card.shareGame", "Share game")}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-theme-glass text-theme-muted transition-colors hover:border-brand-400 hover:text-brand-500 hover:bg-brand-50"
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

