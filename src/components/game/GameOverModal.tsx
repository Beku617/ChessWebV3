import { motion } from "framer-motion";
import {
  BarChart3,
  RotateCcw,
  Swords,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import {
  canAnalyzeSavedGame,
  getHistoryStatusNote,
  type HistoryPersistenceStatus,
} from "../../hooks/gameHistorySaver/historyPersistence";
import { openAnalyzeWindow } from "../../utils/analyzeNavigation";

type ModalTone = "win" | "loss" | "draw" | "neutral";

interface ParsedResult {
  title: string;
  subtitle: string | null;
  tone: ModalTone;
}

interface GameOverModalProps {
  isOpen: boolean;
  result: string | null;
  onTryAgain: () => void;
  onNewGame: () => void;
  savedGameId: string | null;
  analyzeBasePath?: string;
  tournamentMode?: boolean;
  onBackToTournament?: () => void;
  opponentName?: string;
  playerColor?: "w" | "b";
  historyStatus?: HistoryPersistenceStatus;
  elo?: {
    rated?: boolean;
    applied?: boolean;
    white?: { oldRating?: number; newRating?: number; delta?: number } | null;
    black?: { oldRating?: number; newRating?: number; delta?: number } | null;
  } | null;
}

type ResultReason =
  | "checkmate"
  | "stalemate"
  | "repetition"
  | "insufficientMaterial"
  | "timeForfeit"
  | "resignation"
  | "abandonment"
  | "aborted";

const RESULT_REASON_DEFAULTS: Record<ResultReason, string> = {
  checkmate: "Checkmate",
  stalemate: "Stalemate",
  repetition: "Repetition",
  insufficientMaterial: "Insufficient Material",
  timeForfeit: "Time Forfeit",
  resignation: "Resignation",
  abandonment: "Abandonment",
  aborted: "Aborted",
};

function extractReasonKey(raw: string): ResultReason | null {
  const lower = raw.toLowerCase();

  if (lower.includes("checkmate")) return "checkmate";
  if (lower.includes("stalemate")) return "stalemate";
  if (lower.includes("threefold") || lower.includes("repetition"))
    return "repetition";
  if (lower.includes("insufficient")) return "insufficientMaterial";
  if (lower.includes("time")) return "timeForfeit";
  if (lower.includes("resign")) return "resignation";
  if (
    (lower.includes("stockfish wins!") || lower === "you win!") &&
    !lower.includes("time")
  ) {
    return "checkmate";
  }
  if (lower.includes("opponent left") || lower.includes("disconnect"))
    return "abandonment";
  if (lower.includes("aborted")) return "aborted";
  return null;
}

function parseGameResult(
  result: string | null,
  t: (key: string, defaultValueOrOptions?: unknown, options?: unknown) => string,
  opponentName?: string,
): ParsedResult {
  const fallbackGameOver = t("quickMatch.gameOver.title.default", "Game Over");
  const raw = String(result || fallbackGameOver).trim();
  const lower = raw.toLowerCase();
  const reasonKey = extractReasonKey(raw);
  const reasonLabel = reasonKey
    ? t(
        `quickMatch.gameOver.reason.${reasonKey}`,
        RESULT_REASON_DEFAULTS[reasonKey],
      )
    : null;
  const parenthetical = raw.match(/\(([^)]+)\)/)?.[1]?.trim() || null;
  const cleanOpponent = String(opponentName || "")
    .trim()
    .replace(/\s+/g, " ");

  if (lower.includes("you resigned")) {
    return {
      title: t("quickMatch.gameOver.title.youResigned", "You Resigned"),
      subtitle:
        parenthetical ||
        t("quickMatch.gameOver.reason.resignation", "Resignation"),
      tone: "loss",
    };
  }

  if (lower.includes("draw")) {
    return {
      title: t("quickMatch.gameOver.title.draw", "Draw"),
      subtitle:
        parenthetical ||
        (reasonLabel
          ? t("quickMatch.gameOver.byReason", {
              reason: reasonLabel,
              defaultValue: "by {{reason}}",
            })
          : null),
      tone: "draw",
    };
  }

  const isWin = lower.includes("you win") || lower.includes("you won");
  const isLoss =
    lower.includes("you lose") ||
    lower.includes("you lost") ||
    lower.includes("stockfish wins");

  if (isWin) {
    return {
      title: cleanOpponent
        ? t("quickMatch.gameOver.title.youBeat", {
            opponent: cleanOpponent,
            defaultValue: "You Beat {{opponent}}",
          })
        : t("quickMatch.gameOver.title.youWon", "You Won"),
      subtitle:
        parenthetical ||
        (reasonLabel
          ? t("quickMatch.gameOver.victoryByReason", {
              reason: reasonLabel,
              defaultValue: "Victory by {{reason}}",
            })
          : null),
      tone: "win",
    };
  }

  if (isLoss) {
    return {
      title: t("quickMatch.gameOver.title.youLost", "You Lost"),
      subtitle:
        parenthetical ||
        (reasonLabel
          ? t("quickMatch.gameOver.byReason", {
              reason: reasonLabel,
              defaultValue: "by {{reason}}",
            })
          : null),
      tone: "loss",
    };
  }

  if (lower.includes("aborted")) {
    return {
      title: t("quickMatch.gameOver.title.gameAborted", "Game Aborted"),
      subtitle: parenthetical || null,
      tone: "neutral",
    };
  }

  return {
    title: raw || fallbackGameOver,
    subtitle:
      parenthetical ||
      (reasonLabel
        ? t("quickMatch.gameOver.byReason", {
            reason: reasonLabel,
            defaultValue: "by {{reason}}",
          })
        : null),
    tone: "neutral",
  };
}

function toneClasses(tone: ModalTone): {
  border: string;
  glow: string;
  title: string;
} {
  if (tone === "win") {
    return {
      border: "border-slate-800/90",
      glow: "from-brand-500/15",
      title: "text-brand-700 dark:text-brand-100",
    };
  }
  if (tone === "loss") {
    return {
      border: "border-slate-800/90",
      glow: "from-slate-500/10",
      title: "text-rose-700 dark:text-rose-100",
    };
  }
  if (tone === "draw") {
    return {
      border: "border-slate-800/90",
      glow: "from-brand-500/12",
      title: "text-brand-700 dark:text-brand-100",
    };
  }
  return {
    border: "border-slate-800/90",
    glow: "from-violet-500/12",
    title: "text-violet-700 dark:text-violet-100",
  };
}

interface EloChange {
  oldRating: number;
  newRating: number;
  delta: number;
}

function toRoundedRating(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return `${delta}`;
}

function buildPlayerEloChange(
  elo?: {
    rated?: boolean;
    applied?: boolean;
    white?: { oldRating?: number; newRating?: number; delta?: number } | null;
    black?: { oldRating?: number; newRating?: number; delta?: number } | null;
  } | null,
  playerColor?: "w" | "b",
): EloChange | null {
  if (!elo || elo.rated !== true) return null;
  const side =
    playerColor === "b"
      ? elo.black || elo.white
      : playerColor === "w"
        ? elo.white || elo.black
        : elo.white || elo.black;

  const oldRating = toRoundedRating(side?.oldRating);
  const newRating = toRoundedRating(side?.newRating);
  const delta = toRoundedRating(side?.delta);
  if (oldRating === null || newRating === null || delta === null) return null;

  return { oldRating, newRating, delta };
}

export function GameOverModal({
  isOpen,
  result,
  onTryAgain,
  onNewGame,
  savedGameId,
  analyzeBasePath = "/analyze",
  tournamentMode = false,
  onBackToTournament,
  opponentName,
  playerColor,
  historyStatus = "idle",
  elo = null,
}: GameOverModalProps) {
  const { t } = useTranslation();
  if (!isOpen) return null;

  const parsed = parseGameResult(result, t, opponentName);
  const tone = toneClasses(parsed.tone);
  const canAnalyze = canAnalyzeSavedGame(savedGameId);
  const historyNote = getHistoryStatusNote(historyStatus);
  const showAnalyzeButton = canAnalyze || historyStatus === "saving";
  const showResultSubtitle =
    !!parsed.subtitle && parsed.tone !== "win" && parsed.tone !== "loss";
  const playerElo = buildPlayerEloChange(elo, playerColor);
  const showEloBlock = !!playerElo;

  const handleAnalyze = () => {
    if (!savedGameId) return;
    openAnalyzeWindow(`${analyzeBasePath}/${savedGameId}`);
  };

  const modal = (
    <div className="fixed inset-0 z-[170] bg-black/65 backdrop-blur-[2px] flex items-center justify-center p-4 pointer-events-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        role="dialog"
        aria-modal="true"
        className={`theme-glass-panel-strong w-full max-w-[440px] rounded-2xl ${tone.border} overflow-hidden pointer-events-auto`}
      >
        <div
          className={`h-1.5 w-full bg-gradient-to-r ${tone.glow} via-transparent to-transparent`}
        />
        <div className="px-6 pb-6 pt-5">
          <div className="flex flex-col items-center text-center gap-3 mb-5">
            <h2 className={`text-[30px] leading-tight font-semibold ${tone.title}`}>
              {parsed.title}
            </h2>

            {showResultSubtitle && (
              <p className="text-sm text-slate-700 dark:text-slate-300/95">
                {parsed.subtitle}
              </p>
            )}
          </div>

          {showEloBlock && (
            <div className="mb-4 rounded-xl border border-brand-500/25 bg-brand-500/10 px-3 py-2.5">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {t("quickMatch.gameOver.eloChange", {
                  old: playerElo?.oldRating,
                  new: playerElo?.newRating,
                  delta: formatDelta(playerElo?.delta || 0),
                  defaultValue: "Elo {{old}}->{{new}} ({{delta}})",
                })}
              </p>
            </div>
          )}

          <div className="space-y-2.5">
            {showAnalyzeButton && (
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={!canAnalyze}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-medium transition-all duration-150 flex items-center justify-center gap-2 shadow-[0_12px_28px_rgba(124,58,237,0.35)] disabled:opacity-75 disabled:cursor-wait"
              >
                <BarChart3 size={18} />
                {canAnalyze
                  ? t("quickMatch.actions.gameAnalyze", "Game Analyze")
                  : t("quickMatch.actions.preparingAnalyze", "Preparing Analyze...")}
              </button>
            )}

            {tournamentMode ? (
              <button
                type="button"
                onClick={() => onBackToTournament?.()}
                className="w-full h-11 rounded-xl border border-theme-glass bg-white/70 text-slate-800 font-medium transition-colors hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-60 disabled:text-slate-500 dark:border-white/10 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15 dark:disabled:text-slate-400"
              >
                {t("quickMatch.actions.backToTournament", "Back to Tournament")}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onTryAgain}
                  className="w-full h-11 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <RotateCcw size={16} />
                  {t("quickMatch.actions.tryAgain", "Try Again")}
                </button>
                <button
                  type="button"
                  onClick={onNewGame}
                  className="w-full h-11 rounded-xl border border-theme-glass bg-white/70 text-slate-800 font-medium transition-colors hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-60 disabled:text-slate-500 dark:border-white/10 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15 dark:disabled:text-slate-400 flex items-center justify-center gap-2"
                >
                  <Swords size={16} />
                  {t("quickMatch.actions.newGame", "New Game")}
                </button>
              </>
            )}
          </div>
          {!canAnalyze && historyNote && (
            <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
              {historyNote}
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );

  if (typeof document === "undefined") return modal;
  return createPortal(modal, document.body);
}


