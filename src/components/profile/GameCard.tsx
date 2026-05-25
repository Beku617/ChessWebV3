import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { GameHistory } from "../../historyTypes";
import { GameCardHeader } from "./GameCardHeader";
import { GameCardDetails } from "./GameCardDetails";
import { GameCardMoveHistory } from "./GameCardMoveHistory";
import { GameCardActions } from "./GameCardActions";
import { openAnalyzeWindow } from "../../utils/analyzeNavigation";
import { isLikelyChess960Game } from "../../utils/chessVariantDetection";

interface GameCardProps {
  game: GameHistory;
  isExpanded: boolean;
  onToggle: () => void;
  analyzeBaseUrl?: string;
  gameIndex?: number;
  onShare?: (game: GameHistory) => void;
}

function isChess960Game(game: GameHistory): boolean {
  return isLikelyChess960Game(game);
}

function formatDuration(ms?: number): string {
  if (!ms) return "-";
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function GameCard({
  game,
  isExpanded,
  onToggle,
  analyzeBaseUrl = "/analyze",
  gameIndex,
  onShare,
}: GameCardProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const playerIsWhite = game.playAs === "white";
  const resultKey =
    game.result === "1-0"
      ? playerIsWhite
        ? "win"
        : "loss"
      : game.result === "0-1"
        ? playerIsWhite
          ? "loss"
          : "win"
        : "draw";
  const resultText = t(`profileGames.results.${resultKey}`, resultKey);

  const resultColor =
    resultKey === "win"
      ? "text-green-500"
      : resultKey === "loss"
        ? "text-red-500"
        : "text-yellow-500";
  const resultBg =
    resultKey === "win"
      ? "bg-green-500/10"
      : resultKey === "loss"
        ? "bg-red-500/10"
        : "bg-yellow-500/10";
  const borderColor =
    resultKey === "win"
      ? "border-l-4 border-l-green-500"
      : resultKey === "loss"
        ? "border-l-4 border-l-red-500"
        : "border-l-4 border-l-yellow-500";

  const copyPgn = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard.writeText(game.pgn);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    },
    [game.pgn],
  );

  const downloadPgn = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const blob = new Blob([game.pgn], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `neongambit_${game.date.replace(/\./g, "-")}_${game._id.slice(-6)}.pgn`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [game],
  );

  const handleAnalyze = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const resolvedAnalyzeBase =
        analyzeBaseUrl === "/analyze" && isChess960Game(game)
          ? "/analyze960"
          : analyzeBaseUrl;
      openAnalyzeWindow(`${resolvedAnalyzeBase}/${game._id}`);
    },
    [game, analyzeBaseUrl],
  );

  const formattedMoves = game.moves.reduce((acc: string[], move, idx) => {
    if (idx % 2 === 0) {
      acc.push(`${Math.floor(idx / 2) + 1}. ${move}`);
    } else {
      acc[acc.length - 1] += ` ${move}`;
    }
    return acc;
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-theme-panel rounded-xl border border-theme-glass overflow-hidden hover:shadow-md transition-all ${borderColor}`}
    >
      <GameCardHeader
        game={game}
        isExpanded={isExpanded}
        onToggle={onToggle}
        resultText={resultText}
        resultBg={resultBg}
        resultColor={resultColor}
        playerIsWhite={playerIsWhite}
        formatDuration={formatDuration}
        gameIndex={gameIndex}
        onShare={onShare ? () => onShare(game) : undefined}
      />

      {isExpanded && (
        <div className="border-t border-theme-glass bg-theme-surface p-6 space-y-6">
          <GameCardDetails game={game} />
          <GameCardMoveHistory
            formattedMoves={formattedMoves}
            result={game.result}
          />
          <GameCardActions
            copied={copied}
            onAnalyze={handleAnalyze}
            onCopyPgn={copyPgn}
            onDownloadPgn={downloadPgn}
          />
        </div>
      )}
    </motion.div>
  );
}
