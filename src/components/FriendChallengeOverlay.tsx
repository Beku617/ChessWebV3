import { Trans } from "react-i18next";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useFriendChallengeStore } from "../store/friendChallengeStore";

function formatGameTypeLabel(value: string): string {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "chess960") return "Chess960";
  if (
    normalized === "atomic" ||
    normalized === "atomicchess" ||
    normalized === "atomic-chess" ||
    normalized === "atomic_chess"
  ) {
    return "Atomic Chess";
  }
  if (
    normalized === "threecheck" ||
    normalized === "three-check" ||
    normalized === "three_check"
  ) {
    return "Three-Check";
  }
  if (
    normalized === "kingofhill" ||
    normalized === "kingofthehill" ||
    normalized === "king-of-hill" ||
    normalized === "king_of_hill" ||
    normalized === "king-of-the-hill" ||
    normalized === "king_of_the_hill"
  ) {
    return "King of the Hill";
  }
  if (normalized === "standard") return "Standard";
  return value || "Standard";
}

export default function FriendChallengeOverlay() {
  const navigate = useNavigate();
  const location = useLocation();
  const challenge = useFriendChallengeStore(
    (state) => state.incomingChallenges[0] || null,
  );
  const activeGame = useFriendChallengeStore((state) => state.activeGame);
  const lastError = useFriendChallengeStore((state) => state.lastError);
  const clearError = useFriendChallengeStore((state) => state.clearError);
  const respondToChallenge = useFriendChallengeStore(
    (state) => state.respondToChallenge,
  );
  const dismissChallenge = useFriendChallengeStore((state) => state.dismissChallenge);
  const [isResponding, setIsResponding] = useState(false);
  const lastAutoRoutedGameIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeGame) {
      lastAutoRoutedGameIdRef.current = null;
      return;
    }

    if (lastAutoRoutedGameIdRef.current === activeGame.gameId) return;
    if (location.pathname === "/play/friend") {
      lastAutoRoutedGameIdRef.current = activeGame.gameId;
      return;
    }

    lastAutoRoutedGameIdRef.current = activeGame.gameId;
    navigate("/play/friend");
  }, [activeGame, location.pathname, navigate]);

  if (!challenge) return null;

  const timeLabel = `${Math.max(0, Math.floor(challenge.timeControl.initial / 60))} min${
    challenge.timeControl.increment > 0 ? ` | ${challenge.timeControl.increment}` : ""
  }`;

  return (
    <div className="fixed right-4 bottom-4 z-[80] w-[320px] max-w-[calc(100vw-2rem)] rounded-2xl border border-gray-200 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 shadow-2xl p-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white"> <Trans>Friend Challenge</Trans> </h3>
      </div>

      <p className="mt-2 text-[13px] text-gray-700 dark:text-gray-200">
        <span className="font-semibold">{challenge.fromName}</span> <Trans>challenged you to play.</Trans> </p>

      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg bg-gray-100 dark:bg-slate-800 px-2 py-1 text-gray-700 dark:text-gray-300">
          {formatGameTypeLabel(challenge.gameType)}
        </div>
        <div className="rounded-lg bg-gray-100 dark:bg-slate-800 px-2 py-1 text-gray-700 dark:text-gray-300">
          {timeLabel}
        </div>
      </div>

      {lastError && (
        <p className="mt-2 text-[11px] text-red-600 dark:text-red-300">{lastError}</p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={isResponding}
          onClick={async () => {
            try {
              setIsResponding(true);
              clearError();
              await respondToChallenge(challenge.id, false);
              dismissChallenge(challenge.id);
            } finally {
              setIsResponding(false);
            }
          }}
          className="py-2 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-200 font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-1"
        > <Trans>Decline</Trans> </button>
        <button
          type="button"
          disabled={isResponding}
          onClick={async () => {
            try {
              setIsResponding(true);
              clearError();
              const result = await respondToChallenge(challenge.id, true);
              if (result.success) {
                navigate("/play/friend");
              }
            } finally {
              setIsResponding(false);
            }
          }}
          className="py-2 rounded-xl bg-brand-500 text-white font-semibold hover:bg-brand-600 transition-colors flex items-center justify-center gap-1"
        > <Trans>Accept</Trans> </button>
      </div>
    </div>
  );
}


