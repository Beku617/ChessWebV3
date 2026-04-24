import { useEffect, useState } from "react";
import { ChessTimer } from "./ChessTimer";

interface PlayerInfoProps {
  name: string;
  subtitle?: string;
  avatarLetter: string;
  avatarImage?: string;
  flag?: string;
  rating?: number | null;
  avatarStyle: "opponent" | "player";
  initialTime: number;
  increment: number;
  isTimerActive: boolean;
  onTimeOut: () => void;
  onTimeChange: (time: number) => void;
  timerResetToken?: string | number;
  showTimer?: boolean;
}

export function PlayerInfo({
  name,
  subtitle = "",
  avatarLetter,
  avatarImage,
  flag,
  rating,
  avatarStyle,
  initialTime,
  increment,
  isTimerActive,
  onTimeOut,
  onTimeChange,
  timerResetToken,
  showTimer = true,
}: PlayerInfoProps) {
  const [hasImageError, setHasImageError] = useState(false);
  const displayRating =
    Number.isFinite(Number(rating)) && rating !== null && rating !== undefined
      ? Math.round(Number(rating))
      : null;
  const shouldShowTimer = showTimer && initialTime > 0;

  useEffect(() => {
    setHasImageError(false);
  }, [avatarImage]);

  return (
    <div className="theme-glass-panel-soft w-full rounded-2xl px-3 py-2.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center text-base font-semibold text-white shadow-sm overflow-hidden flex-shrink-0 ${
            avatarStyle === "opponent"
              ? "bg-gradient-to-br from-gray-600 to-gray-700 ring-1 ring-white/10"
              : "bg-gradient-to-br from-brand-500 to-brand-500 ring-2 ring-brand-200/60 dark:ring-brand-500/50 shadow-brand-500/30"
          }`}
        >
          {avatarImage && !hasImageError ? (
            <img
              src={avatarImage}
              alt={name}
              className="w-full h-full object-cover"
              onError={() => setHasImageError(true)}
            />
          ) : (
            avatarLetter
          )}
        </div>
        <div className="leading-tight min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base truncate">
              {name}
            </div>
            {displayRating !== null && (
              <span className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-300">
                ({displayRating})
              </span>
            )}
          </div>
          {subtitle ? (
            <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <span className="truncate">{subtitle}</span>
            </div>
          ) : null}
        </div>
      </div>

      {shouldShowTimer && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {increment > 0 && (
            <span className="h-8 px-2 rounded-full text-[11px] font-semibold tracking-wide text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/40 border border-brand-100 dark:border-brand-800 inline-flex items-center">
              +{increment}s
            </span>
          )}
          <ChessTimer
            initialTime={initialTime}
            increment={increment}
            isActive={isTimerActive}
            onTimeOut={onTimeOut}
            onTimeChange={onTimeChange}
            resetToken={timerResetToken}
            className="h-12"
          />
        </div>
      )}
    </div>
  );
}

