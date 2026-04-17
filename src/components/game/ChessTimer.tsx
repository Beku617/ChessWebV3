import { useState, useEffect, useRef } from "react";
import { playGameplaySound } from "../../utils/moveSounds";

interface ChessTimerProps {
  initialTime: number;
  increment: number;
  isActive: boolean;
  onTimeOut: () => void;
  onTimeChange: (time: number) => void;
  resetToken?: string | number;
  className?: string;
}

export function ChessTimer({
  initialTime,
  increment,
  isActive,
  onTimeOut,
  onTimeChange,
  resetToken,
  className = "",
}: ChessTimerProps) {
  if (initialTime <= 0) return null;

  const [timeLeft, setTimeLeft] = useState(initialTime);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const tenSecondWarningPlayedRef = useRef(false);
  const wasActiveRef = useRef(isActive);

  // Only reinitialize from base time when a new game/time control is started.
  // Do not reset on turn switches.
  useEffect(() => {
    setTimeLeft(initialTime);
    tenSecondWarningPlayedRef.current = false;
    wasActiveRef.current = false;
  }, [initialTime, resetToken]);

  useEffect(() => {
    onTimeChange(timeLeft);
  }, [timeLeft, onTimeChange]);

  useEffect(() => {
    if (isActive && initialTime > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 0.1) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            onTimeOut();
            return 0;
          }
          return prev - 0.1;
        });
      }, 100);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive, onTimeOut]);

  useEffect(() => {
    if (!isActive) {
      tenSecondWarningPlayedRef.current = false;
      return;
    }

    if (timeLeft > 10) {
      tenSecondWarningPlayedRef.current = false;
      return;
    }

    if (timeLeft <= 0) return;
    if (tenSecondWarningPlayedRef.current) return;

    tenSecondWarningPlayedRef.current = true;
    playGameplaySound("tenSeconds");
  }, [isActive, timeLeft]);

  // Apply increment when this timer stops because the player just moved.
  useEffect(() => {
    const wasActive = wasActiveRef.current;
    if (wasActive && !isActive && increment > 0) {
      setTimeLeft((prev) => (prev > 0 ? prev + increment : prev));
    }
    wasActiveRef.current = isActive;
  }, [isActive, increment]);

  const formatTime = (seconds: number): string => {
    if (seconds <= 0) return "0:00";
    if (seconds < 10) {
      return `0:0${seconds.toFixed(1)}`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const isLowTime = timeLeft < 30 && timeLeft > 0;

  return (
    <div
      className={`h-12 min-w-[108px] px-3 rounded-xl font-mono text-base sm:text-lg font-semibold text-white text-center shadow-inner shadow-black/20 flex items-center justify-center transition-colors ${
        isLowTime && isActive
          ? "bg-gradient-to-r from-amber-500 to-rose-500 animate-pulse"
          : "bg-gradient-to-r from-brand-500 to-brand-500"
      } ${className}`}
    >
      {formatTime(timeLeft)}
    </div>
  );
}

