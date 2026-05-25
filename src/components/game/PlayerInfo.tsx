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
  layout?: "default" | "focus" | "match";
  showConnectionDots?: boolean;
  connectionStrength?: number;
  initialTime: number;
  increment: number;
  isTimerActive: boolean;
  onTimeOut: () => void;
  onTimeChange: (time: number) => void;
  timerResetToken?: string | number;
  timerManagedExternally?: boolean;
  showTimer?: boolean;
  compactTimer?: boolean;
  timerVariant?: "default" | "snapshot";
  className?: string;
}

export function PlayerInfo({
  name,
  subtitle = "",
  avatarLetter,
  avatarImage,
  flag,
  rating,
  avatarStyle,
  layout = "default",
  showConnectionDots = false,
  connectionStrength = 4,
  initialTime,
  increment,
  isTimerActive,
  onTimeOut,
  onTimeChange,
  timerResetToken,
  timerManagedExternally = false,
  showTimer = true,
  compactTimer = false,
  timerVariant = "default",
  className = "",
}: PlayerInfoProps) {
  const [hasImageError, setHasImageError] = useState(false);
  const displayRating =
    Number.isFinite(Number(rating)) && rating !== null && rating !== undefined
      ? Math.round(Number(rating))
      : null;
  const shouldShowTimer = showTimer && initialTime > 0;
  const normalizedConnectionStrength = Math.max(0, Math.min(4, Math.floor(connectionStrength)));
  const isFocusLayout = layout === "focus";
  const isMatchLayout = layout === "match";
  const avatarSizeClass = isMatchLayout ? "h-11 w-11" : "h-10 w-10";
  const avatarToneClass =
    avatarStyle === "opponent"
      ? isMatchLayout
        ? "bg-gradient-to-b from-theme-surface to-theme-panel ring-1 ring-theme-border/40"
        : "bg-gradient-to-br from-theme-panel to-theme-base ring-1 ring-theme-border/30"
      : isMatchLayout
        ? "bg-gradient-to-b from-cyan-300 to-sky-500 ring-1 ring-cyan-200/75 shadow-cyan-500/25"
        : "bg-gradient-to-br from-brand-500 to-cyan-400 ring-2 ring-cyan-200/55 shadow-cyan-500/25";
  const avatarTextColorClass =
    avatarStyle === "opponent" ? "text-theme-foreground" : "text-theme-on-accent";

  useEffect(() => {
    setHasImageError(false);
  }, [avatarImage]);

  const compactRowSpacingClass = compactTimer ? "py-1.5" : "py-1";
  const nameTextClass = isMatchLayout
    ? "truncate text-[1.02rem] font-semibold text-theme-foreground"
    : "truncate text-sm font-semibold text-theme-foreground sm:text-base";
  const ratingTextClass = isMatchLayout
    ? "shrink-0 text-xs font-medium text-theme-muted"
    : "shrink-0 text-xs font-medium text-theme-muted sm:text-sm";

  return (
    <div
      className={`player-info-root w-full min-w-0 flex items-center gap-3 px-2 ${compactRowSpacingClass} ${className}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div
          className={`${avatarSizeClass} flex shrink-0 items-center justify-center overflow-hidden rounded-[14px] text-sm font-bold shadow-[0_10px_24px_rgba(2,6,23,0.28)] ${avatarTextColorClass} ${avatarToneClass}`}
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
        <div className="min-w-0 leading-tight">
          <div className="flex min-w-0 items-center gap-2">
            <div className={nameTextClass}>
              {name}
            </div>
            {displayRating !== null && (
              <span className={ratingTextClass}>
                ({displayRating})
              </span>
            )}
          </div>
          {subtitle && !shouldShowTimer ? (
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-theme-muted">
              <span className="truncate">{subtitle}</span>
            </div>
          ) : null}
          {isFocusLayout && (showConnectionDots || Boolean(flag)) && !shouldShowTimer ? (
            <div className="mt-2 flex items-center gap-2 text-[11px] text-theme-muted">
              {flag ? (
                <span className="inline-flex h-5 min-w-[30px] items-center justify-center rounded-md border border-theme-glass bg-theme-panel/5 px-1.5 text-[10px] font-medium tracking-wide text-theme-muted ">
                  {flag}
                </span>
              ) : null}
              {showConnectionDots ? (
                <span className="inline-flex items-center gap-1">
                  {[0, 1, 2, 3].map((index) => (
                    <span
                      key={`conn-${index}`}
                      className={`h-1.5 w-1.5 rounded-full ${
                        index < normalizedConnectionStrength
                          ? "bg-emerald-400"
                          : "bg-theme-panel/20"
                      }`}
                    />
                  ))}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {shouldShowTimer && (
        <div className="ml-auto shrink-0 flex items-center">
          <ChessTimer
            initialTime={initialTime}
            increment={increment}
            isActive={isTimerActive}
            onTimeOut={onTimeOut}
            onTimeChange={onTimeChange}
            resetToken={timerResetToken}
            managedExternally={timerManagedExternally}
            variant={timerVariant}
            className={compactTimer ? "h-9" : "h-12"}
          />
        </div>
      )}
    </div>
  );
}

