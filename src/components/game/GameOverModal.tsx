import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  RotateCcw,
  Swords,
} from "lucide-react";
import {
  canAnalyzeSavedGame,
  getHistoryStatusNote,
  type HistoryPersistenceStatus,
} from "../../hooks/gameHistorySaver/historyPersistence";

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
  historyStatus?: HistoryPersistenceStatus;
}

function extractReasonLabel(raw: string): string | null {
  const lower = raw.toLowerCase();

  if (lower.includes("checkmate")) return "Checkmate";
  if (lower.includes("stalemate")) return "Stalemate";
  if (lower.includes("threefold") || lower.includes("repetition"))
    return "Repetition";
  if (lower.includes("insufficient")) return "Insufficient Material";
  if (lower.includes("time")) return "Time Forfeit";
  if (lower.includes("resign")) return "Resignation";
  if (
    (lower.includes("stockfish wins!") || lower === "you win!") &&
    !lower.includes("time")
  ) {
    return "Checkmate";
  }
  if (lower.includes("opponent left") || lower.includes("disconnect"))
    return "Abandonment";
  if (lower.includes("aborted")) return "Aborted";
  return null;
}

function parseGameResult(
  result: string | null,
  opponentName?: string,
): ParsedResult {
  const raw = String(result || "Game Over").trim();
  const lower = raw.toLowerCase();
  const reasonLabel = extractReasonLabel(raw);
  const parenthetical = raw.match(/\(([^)]+)\)/)?.[1]?.trim() || null;
  const cleanOpponent = String(opponentName || "")
    .trim()
    .replace(/\s+/g, " ");

  if (lower.includes("you resigned")) {
    return {
      title: "You Resigned",
      subtitle: parenthetical || "Resignation",
      tone: "loss",
    };
  }

  if (lower.includes("draw")) {
    return {
      title: "Draw",
      subtitle: parenthetical || (reasonLabel ? `by ${reasonLabel}` : null),
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
      title: cleanOpponent ? `You Beat ${cleanOpponent}` : "You Won",
      subtitle:
        parenthetical || (reasonLabel ? `Victory by ${reasonLabel}` : null),
      tone: "win",
    };
  }

  if (isLoss) {
    return {
      title: "You Lost",
      subtitle: parenthetical || (reasonLabel ? `by ${reasonLabel}` : null),
      tone: "loss",
    };
  }

  if (lower.includes("aborted")) {
    return {
      title: "Game Aborted",
      subtitle: parenthetical || null,
      tone: "neutral",
    };
  }

  return {
    title: raw || "Game Over",
    subtitle: parenthetical || (reasonLabel ? `by ${reasonLabel}` : null),
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
      title: "text-brand-100",
    };
  }
  if (tone === "loss") {
    return {
      border: "border-slate-800/90",
      glow: "from-slate-500/10",
      title: "text-rose-100",
    };
  }
  if (tone === "draw") {
    return {
      border: "border-slate-800/90",
      glow: "from-brand-500/12",
      title: "text-brand-100",
    };
  }
  return {
    border: "border-slate-800/90",
    glow: "from-violet-500/12",
    title: "text-violet-100",
  };
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
  historyStatus = "idle",
}: GameOverModalProps) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const parsed = parseGameResult(result, opponentName);
  const tone = toneClasses(parsed.tone);
  const canAnalyze = canAnalyzeSavedGame(savedGameId);
  const historyNote = getHistoryStatusNote(historyStatus);
  const showAnalyzeButton = canAnalyze || historyStatus === "saving";
  const showResultSubtitle =
    !!parsed.subtitle && parsed.tone !== "win" && parsed.tone !== "loss";

  const handleAnalyze = () => {
    if (!savedGameId) return;
    navigate(`${analyzeBasePath}/${savedGameId}`);
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/65 backdrop-blur-[2px] flex items-center justify-center p-4 pointer-events-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        role="dialog"
        aria-modal="true"
        className={`w-full max-w-[440px] rounded-2xl border ${tone.border} bg-slate-950/95 shadow-[0_24px_80px_rgba(2,6,23,0.8)] overflow-hidden pointer-events-auto`}
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
              <p className="text-sm text-slate-300/95">{parsed.subtitle}</p>
            )}
          </div>

          <div className="space-y-2.5">
            {showAnalyzeButton && (
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={!canAnalyze}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-medium transition-all duration-150 flex items-center justify-center gap-2 shadow-[0_12px_28px_rgba(124,58,237,0.35)] disabled:opacity-75 disabled:cursor-wait"
              >
                <BarChart3 size={18} />
                {canAnalyze ? "Game Analyze" : "Preparing Analyze..."}
              </button>
            )}

            {tournamentMode ? (
              <button
                type="button"
                onClick={() => onBackToTournament?.()}
                className="w-full h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium transition-colors"
              >
                Back to Tournament
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onTryAgain}
                  className="w-full h-11 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <RotateCcw size={16} />
                  Try Again
                </button>
                <button
                  type="button"
                  onClick={onNewGame}
                  className="w-full h-11 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-100 font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Swords size={16} />
                  New Game
                </button>
              </>
            )}
          </div>
          {!canAnalyze && historyNote && (
            <p className="mt-3 text-xs text-slate-400 text-center">
              {historyNote}
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}


