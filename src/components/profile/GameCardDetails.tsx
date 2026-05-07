import { GameHistory } from "../../historyTypes";

interface GameCardDetailsProps {
  game: GameHistory;
}

function formatClock(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatTimeControlDisplay(value?: string | null): string {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  if (raw === "-") return "Unlimited";

  const normalized = raw.replace("|", "+");
  const [initialRaw, incrementRaw] = normalized.split("+");
  const initialSeconds = Number(initialRaw);

  if (!Number.isFinite(initialSeconds)) {
    return raw;
  }

  const treatAsSeconds = !normalized.includes("+") || initialSeconds >= 60;
  if (!treatAsSeconds) {
    return raw;
  }

  const baseLabel = formatClock(initialSeconds);
  if (incrementRaw == null) {
    return baseLabel;
  }

  const incrementSeconds = Number(incrementRaw);
  if (!Number.isFinite(incrementSeconds)) {
    return raw;
  }

  const safeIncrement = Math.max(0, Math.round(incrementSeconds));
  return safeIncrement > 0 ? `${baseLabel} + ${safeIncrement}s` : baseLabel;
}

export function GameCardDetails({ game }: GameCardDetailsProps) {
  const isThreeCheckGame =
    game.variant === "threeCheck" ||
    /three[\s_-]?check|3[\s_-]?check/i.test(String(game.event || ""));
  const whiteChecks = Math.max(0, Math.floor(Number(game.whiteCheckCount || 0)));
  const blackChecks = Math.max(0, Math.floor(Number(game.blackCheckCount || 0)));

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
      <div className="space-y-1">
        <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
          Opening
        </span>
        <p
          className="text-sm font-medium text-gray-900 dark:text-white truncate"
          title={game.eco}
        >
          {game.eco || "Unknown"}
        </p>
      </div>
      <div className="space-y-1">
        <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
          Time Control
        </span>
        <p className="text-sm font-medium text-gray-900 dark:text-white">
          {formatTimeControlDisplay(game.timeControl)}
        </p>
      </div>
      <div className="space-y-1">
        <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
          Termination
        </span>
        <p className="text-sm font-medium text-gray-900 dark:text-white">
          {game.termination}
        </p>
      </div>
      <div className="space-y-1">
        <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
          Opponent Level
        </span>
        <p className="text-sm font-medium text-gray-900 dark:text-white">
          {game.opponentLevel || "N/A"}
        </p>
      </div>
      {isThreeCheckGame && (
        <div className="space-y-1">
          <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
            3-Check
          </span>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            White {whiteChecks}/3 • Black {blackChecks}/3
          </p>
        </div>
      )}
    </div>
  );
}
