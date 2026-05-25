import { GameHistory } from "../../historyTypes";
import { useTranslation } from "react-i18next";

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
  if (raw === "-") return "-";

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

function normalizeKey(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function GameCardDetails({ game }: GameCardDetailsProps) {
  const { t } = useTranslation();
  const isThreeCheckGame =
    game.variant === "threeCheck" ||
    /three[\s_-]?check|3[\s_-]?check/i.test(String(game.event || ""));
  const whiteChecks = Math.max(0, Math.floor(Number(game.whiteCheckCount || 0)));
  const blackChecks = Math.max(0, Math.floor(Number(game.blackCheckCount || 0)));

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
      <div className="space-y-1">
        <span className="text-xs uppercase tracking-wider text-theme-muted font-semibold">
          {t("profileGames.card.opening", "Opening")}
        </span>
        <p
          className="text-sm font-medium text-theme-foreground truncate"
          title={game.eco}
        >
          {game.eco || t("profilePage.unknown", "Unknown")}
        </p>
      </div>
      <div className="space-y-1">
        <span className="text-xs uppercase tracking-wider text-theme-muted font-semibold">
          {t("profileGames.card.timeControl", "Time Control")}
        </span>
        <p className="text-sm font-medium text-theme-foreground ">
          {game.timeControl === "-"
            ? t("profileGames.card.unlimited", "Unlimited")
            : formatTimeControlDisplay(game.timeControl)}
        </p>
      </div>
      <div className="space-y-1">
        <span className="text-xs uppercase tracking-wider text-theme-muted font-semibold">
          {t("profileGames.card.termination", "Termination")}
        </span>
        <p className="text-sm font-medium text-theme-foreground ">
          {t(
            `profileGames.termination.${normalizeKey(String(game.termination || ""))}`,
            String(game.termination || t("profilePage.unknown", "Unknown")),
          )}
        </p>
      </div>
      <div className="space-y-1">
        <span className="text-xs uppercase tracking-wider text-theme-muted font-semibold">
          {t("profileGames.card.opponentLevel", "Opponent Level")}
        </span>
        <p className="text-sm font-medium text-theme-foreground ">
          {game.opponentLevel || t("profileGames.card.notAvailable", "N/A")}
        </p>
      </div>
      {isThreeCheckGame && (
        <div className="space-y-1">
          <span className="text-xs uppercase tracking-wider text-theme-muted font-semibold">
            {t("profileGames.card.threeCheck", "3-Check")}
          </span>
          <p className="text-sm font-medium text-theme-foreground ">
            {t("profileGames.card.threeCheckScore", {
              white: t("profileGames.card.white", "White"),
              black: t("profileGames.card.black", "Black"),
              whiteChecks,
              blackChecks,
              defaultValue: "{{white}} {{whiteChecks}}/3 • {{black}} {{blackChecks}}/3",
            })}
          </p>
        </div>
      )}
    </div>
  );
}
