import React, { useEffect, useState, useCallback, useRef } from "react";
import { useChessStore } from "../store/chessStore";

interface ChessTimerProps {
  initialTime: number; // seconds
  increment: number; // seconds
  isActive: boolean;
  isPlayerTimer: boolean;
  onTimeOut: () => void;
}

const ChessTimer: React.FC<ChessTimerProps> = ({
  initialTime,
  increment,
  isActive,
  isPlayerTimer,
  onTimeOut,
}) => {
  const [timeLeft, setTimeLeft] = useState(initialTime);
  const gameOver = useChessStore((state) => state.gameOver);
  const intervalRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const onTimeOutRef = useRef(onTimeOut);
  const hasTimedOutRef = useRef(false);

  useEffect(() => {
    onTimeOutRef.current = onTimeOut;
  }, [onTimeOut]);

  useEffect(() => {
    setTimeLeft(initialTime);
    hasTimedOutRef.current = false;
  }, [initialTime]);

  // Format time as MM:SS or M:SS.d for under 10 seconds
  const formatTime = (seconds: number): string => {
    if (seconds <= 0) return "0:00";

    if (seconds < 10) {
      return `0:0${seconds.toFixed(1)}`;
    }

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Timer logic
  useEffect(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!isActive || gameOver || initialTime === 0 || hasTimedOutRef.current) {
      return undefined;
    }

    intervalRef.current = window.setInterval(() => {
      setTimeLeft((prev) => {
        const newTime = prev - 0.1;
        if (newTime <= 0) {
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
        return Math.round(newTime * 10) / 10;
      });
    }, 100);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive, gameOver, initialTime]);

  // Add increment after move
  const addIncrement = useCallback(() => {
    if (increment > 0) {
      setTimeLeft((prev) => prev + increment);
    }
  }, [increment]);

  // Reset timer
  const resetTimer = useCallback(() => {
    setTimeLeft(initialTime);
  }, [initialTime]);

  // Register functions to store only once on mount (not on every timeLeft change)
  useEffect(() => {
    if (isPlayerTimer) {
      useChessStore.setState({
        playerAddIncrement: addIncrement,
        playerResetTimer: resetTimer,
      });
    } else {
      useChessStore.setState({
        opponentAddIncrement: addIncrement,
        opponentResetTimer: resetTimer,
      });
    }
  }, [isPlayerTimer, addIncrement, resetTimer]);

  // Don't render for unlimited games
  if (initialTime === 0) {
    return (
      <div className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-slate-700 text-gray-900 dark:text-white font-mono text-xl">
        ∞
      </div>
    );
  }

  const isLowTime = timeLeft < 30;
  const isCriticalTime = timeLeft < 10;

  return (
    <div
      className={`
        px-4 py-2 rounded-lg font-mono text-2xl font-bold min-w-[100px] text-center
        transition-all duration-300
        ${
          isActive
            ? isCriticalTime
              ? "bg-red-600 text-white animate-pulse"
              : isLowTime
                ? "bg-orange-500 text-white"
                : "bg-green-600 text-white"
            : "bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-300"
        }
        ${isActive ? "shadow-lg scale-105" : ""}
      `}
    >
      {formatTime(timeLeft)}
    </div>
  );
};

export default ChessTimer;
