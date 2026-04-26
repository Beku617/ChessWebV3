import { useState, useEffect, useRef } from "react";
import { playGameplaySound } from "../../utils/moveSounds";

interface ChessTimerProps {
  initialTime: number;
  increment: number;
  isActive: boolean;
  onTimeOut: () => void;
  onTimeChange: (time: number) => void;
  resetToken?: string | number;
  managedExternally?: boolean;
  className?: string;
}

export function ChessTimer({
  initialTime,
  increment,
  isActive,
  onTimeOut,
  onTimeChange,
  resetToken,
  managedExternally = false,
  className = "",
}: ChessTimerProps) {
  const [timeLeft, setTimeLeft] = useState(initialTime);
  const intervalRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const onTimeOutRef = useRef(onTimeOut);
  const onTimeChangeRef = useRef(onTimeChange);
  const tenSecondWarningPlayedRef = useRef(false);
  const hasTimedOutRef = useRef(false);
  void increment;

  useEffect(() => {
    onTimeOutRef.current = onTimeOut;
  }, [onTimeOut]);

  useEffect(() => {
    onTimeChangeRef.current = onTimeChange;
  }, [onTimeChange]);

  // The server owns the real clock. Re-seed this display only from server data.
  useEffect(() => {
    setTimeLeft(initialTime);
    tenSecondWarningPlayedRef.current = false;
    hasTimedOutRef.current = false;
  }, [initialTime, resetToken]);

  useEffect(() => {
    onTimeChangeRef.current(timeLeft);
  }, [timeLeft]);

  useEffect(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (
      managedExternally ||
      !isActive ||
      initialTime <= 0 ||
      hasTimedOutRef.current
    ) {
      return undefined;
    }

    intervalRef.current = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 0.1) {
          if (intervalRef.current) {
            window.clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          if (!hasTimedOutRef.current) {
            hasTimedOutRef.current = true;
            onTimeOutRef.current();
          }
          return 0;
        }
        return Math.max(0, Math.round((prev - 0.1) * 10) / 10);
      });
    }, 100);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive, initialTime, managedExternally, resetToken]);

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

  if (initialTime <= 0) return null;

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

