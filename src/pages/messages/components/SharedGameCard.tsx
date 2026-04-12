import { Crown, ExternalLink } from "lucide-react";

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
    ? "border-white/20 bg-white/10 hover:bg-white/15"
    : "border-[#25344e] bg-[#0b1424]/80 hover:bg-[#0f1a2e]/90";

  return (
    <a
      href={analyzeUrl}
      onClick={(event) => {
        event.preventDefault();
        window.location.href = analyzeUrl;
      }}
      className={`mt-1 block cursor-pointer rounded-xl border ${cardBg} p-3 transition-colors group`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            mine ? "bg-white/15 text-white" : "bg-brand-500/10 text-brand-400"
          }`}
        >
          <Crown className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold">
            <span className={mine ? "text-white" : "text-slate-100"}>
              {game.white}
            </span>
            {game.whiteElo != null && (
              <span
                className={`text-[11px] font-normal ${
                  mine ? "text-cyan-100/70" : "text-slate-500"
                }`}
              >
                ({game.whiteElo})
              </span>
            )}
            <span className={mine ? "text-cyan-100/60" : "text-slate-500"}>
              vs
            </span>
            <span className={mine ? "text-white" : "text-slate-100"}>
              {game.black}
            </span>
            {game.blackElo != null && (
              <span
                className={`text-[11px] font-normal ${
                  mine ? "text-cyan-100/70" : "text-slate-500"
                }`}
              >
                ({game.blackElo})
              </span>
            )}
          </div>
          <div
            className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] ${
              mine ? "text-cyan-100/75" : "text-slate-400"
            }`}
          >
            <span className={`font-semibold ${resultAccent}`}>
              {gameResultText}
            </span>
            {game.timeControl && (
              <>
                <span className={mine ? "text-cyan-100/40" : "text-slate-600"}>
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
                <span className={mine ? "text-cyan-100/40" : "text-slate-600"}>
                  ·
                </span>
                <span>{game.eco}</span>
              </>
            )}
            {game.moves != null && game.moves > 0 && (
              <>
                <span className={mine ? "text-cyan-100/40" : "text-slate-600"}>
                  ·
                </span>
                <span>{game.moves} moves</span>
              </>
            )}
            {game.rated && (
              <>
                <span className={mine ? "text-cyan-100/40" : "text-slate-600"}>
                  ·
                </span>
                <span>Rated</span>
              </>
            )}
          </div>
          <div
            className={`mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium ${
              mine
                ? "text-white/80 group-hover:text-white"
                : "text-brand-400/80 group-hover:text-brand-300"
            } transition-colors`}
          >
            <ExternalLink className="h-3 w-3" />
            View Game
          </div>
        </div>
      </div>
    </a>
  );
}

