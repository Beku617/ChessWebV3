import { Trans } from "react-i18next";
import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

import { SharedGame } from "../types";

type SharedGameCardProps = {
  game: SharedGame;
  mine: boolean;
};

export function SharedGameCard({ game, mine }: SharedGameCardProps) {
  const gameResultText =
    game.result === "1-0"
      ? "White wins"
      : game.result === "0-1"
        ? "Black wins"
        : game.result === "1/2-1/2"
          ? "Draw"
          : game.result || "—";
  const resultAccent =
    game.result === "1-0" || game.result === "0-1"
      ? "text-brand-300"
      : "text-amber-300";
  const variant = game.variant === "chess960" ? "960" : "";
  const analyzeUrl =
    game.variant === "chess960"
      ? `/analyze960/${game.gameId}`
      : `/analyze/${game.gameId}`;
  const cardBg = mine
    ? "border-theme-glass bg-theme-panel/10 hover:bg-theme-panel/15"
    : "border-theme-glass bg-theme-panel hover:bg-theme-panel";

  return (
    <Link
      to={analyzeUrl}
      className={`mt-1 block cursor-pointer rounded-xl border ${cardBg} p-3 transition-colors group`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold">
            <span className={mine ? "text-theme-on-accent" : "text-theme-foreground"}>
              {game.white}
            </span>
            {game.whiteElo != null && (
              <span
                className={`text-[11px] font-normal ${
                  mine ? "text-theme-muted" : "text-theme-muted"
                }`}
              >
                ({game.whiteElo})
              </span>
            )}
            <span className={mine ? "text-theme-muted" : "text-theme-muted"}> <Trans>vs</Trans> </span>
            <span className={mine ? "text-theme-on-accent" : "text-theme-foreground"}>
              {game.black}
            </span>
            {game.blackElo != null && (
              <span
                className={`text-[11px] font-normal ${
                  mine ? "text-theme-muted" : "text-theme-muted"
                }`}
              >
                ({game.blackElo})
              </span>
            )}
          </div>
          <div
            className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] ${
              mine ? "text-theme-muted" : "text-theme-muted"
            }`}
          >
            <span className={`font-semibold ${resultAccent}`}>
              {gameResultText}
            </span>
            {game.timeControl && (
              <>
                <span className={mine ? "text-theme-muted/70" : "text-theme-muted"}>
                  ·
                </span>
                <span>
                  {game.timeControl}
                  {variant && ` ${variant}`}
                </span>
              </>
            )}
            {game.eco && (
              <>
                <span className={mine ? "text-theme-muted/70" : "text-theme-muted"}>
                  ·
                </span>
                <span>{game.eco}</span>
              </>
            )}
            {game.moves != null && game.moves > 0 && (
              <>
                <span className={mine ? "text-theme-muted/70" : "text-theme-muted"}>
                  ·
                </span>
                <span>{game.moves} <Trans>moves</Trans></span>
              </>
            )}
            {game.rated && (
              <>
                <span className={mine ? "text-theme-muted/70" : "text-theme-muted"}>
                  ·
                </span>
                <span><Trans>Rated</Trans></span>
              </>
            )}
          </div>
          <div
            className={`mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium ${
              mine
                ? "text-theme-muted group-hover:text-theme-on-accent"
                : "text-brand-400/80 group-hover:text-brand-300"
            } transition-colors`}
          >
            <ExternalLink className="h-3 w-3" /> <Trans>View Game</Trans> </div>
        </div>
      </div>
    </Link>
  );
}

