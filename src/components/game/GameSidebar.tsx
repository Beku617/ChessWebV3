import { Trans, useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      : "bg-theme-surface/10 text-theme-muted border border-theme-border/20";

  const statusLabel = gameOver
    ? t("game.sidebar.status.gameOver", "Game over")
    : gameStarted
      ? t("game.sidebar.status.inProgress", "In progress")
      : t("game.sidebar.status.waiting", "Waiting");

  return (
    <div className="w-full h-full min-h-0 rounded-3xl border border-theme-glass/70 bg-theme-panel/70 shadow-2xl overflow-hidden backdrop-blur-xl flex flex-col">
      <div className="px-5 py-4 border-b border-theme-glass/60 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-brand-600 font-semibold"> <Trans>Game log</Trans> </p>
          <h3 className="text-lg font-semibold text-theme-foreground "> <Trans>Moves &amp; opening</Trans> </h3>
          <p className="text-xs text-theme-muted"> <Trans>A clean timeline of your current game.</Trans> </p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusTone}`}>
          {statusLabel}
        </span>
      </div>

      <div className="px-5 py-4 border-b border-theme-glass/60 bg-theme-panel/70">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-brand-500/15 text-brand-600">
            <Compass className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-theme-foreground flex items-center gap-2">
              <span>
                {opening
                  ? opening.variation
                    ? `${opening.name}: ${opening.variation}`
                    : opening.name
                  : gameStarted
                    ? openingLoading
                      ? t("game.sidebar.opening.detecting", "Detecting opening...")
                      : t("game.sidebar.opening.makeMoveToDetect", "Make a move to detect")
                    : t("game.sidebar.opening.waitingFirstMove", "Waiting for your first move")}
              </span>
              {openingLoading && (
                <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
              )}
            </div>
            <div className="text-xs text-theme-muted">
              {opening?.eco
                ? t("game.sidebar.opening.ecoLabel", {
                    defaultValue: "ECO {{eco}}",
                    eco: opening.eco,
                  })
                : t("game.sidebar.opening.bookPending", "Book pending")}
              {opening?.nextMoves?.length
                ? t("game.sidebar.opening.nextMoves", {
                    defaultValue: " • Next: {{moves}}",
                    moves: opening.nextMoves.join(" • "),
                  })
                : ""}
            </div>
            {opening?.line && (
              <div className="text-xs text-theme-muted mt-1 overflow-hidden text-ellipsis whitespace-nowrap">
                {opening.line}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-2">
        {formattedMoves.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-theme-glass px-4 py-6 text-center text-sm text-theme-muted">
            {gameStarted
              ? t("game.sidebar.log.firstMovePrompt", "Make your first move to populate the log.")
              : t("game.sidebar.log.startPrompt", "Start a game to see your move list.")}
          </div>
        ) : (
          formattedMoves.map((move, i) => (
            <div
              key={i}
              className="grid grid-cols-[auto_1fr_1fr] gap-x-3 items-center rounded-xl bg-theme-surface/90 px-3 py-2 shadow-sm"
            >
              <span className="text-xs font-semibold text-theme-muted">
                {t("common.moveNumberDot", {
                  defaultValue: "{{num}}.",
                  num: i + 1,
                })}
              </span>
              <span className="font-semibold text-theme-foreground ">
                {move.white}
              </span>
              <span className="font-semibold text-theme-foreground ">
                {move.black}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

