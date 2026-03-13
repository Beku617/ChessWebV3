import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trophy, Crown, Medal } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { type RatingPool, useLeaderboard } from "../../hooks/useRatingsData";

const POOLS: Array<{ id: RatingPool; label: string }> = [
  { id: "bullet", label: "Bullet" },
  { id: "blitz", label: "Blitz" },
  { id: "rapid", label: "Rapid" },
  { id: "classical", label: "Classical" },
];

/** Rank accent colours for top-3 */
function rankAccent(rank: number) {
  if (rank === 1)
    return {
      bg: "bg-amber-500/10 dark:bg-amber-500/10",
      ring: "ring-1 ring-amber-400/30",
      text: "text-amber-400",
      icon: <Crown size={14} className="text-amber-400" />,
    };
  if (rank === 2)
    return {
      bg: "bg-gray-300/10 dark:bg-gray-400/10",
      ring: "ring-1 ring-gray-400/20",
      text: "text-slate-500 dark:text-gray-300",
      icon: <Medal size={14} className="text-slate-500 dark:text-gray-300" />,
    };
  if (rank === 3)
    return {
      bg: "bg-orange-400/10 dark:bg-orange-500/10",
      ring: "ring-1 ring-orange-400/20",
      text: "text-orange-400",
      icon: <Medal size={14} className="text-orange-400" />,
    };
  return null;
}

export function PoolLeaderboardCard() {
  const [pool, setPool] = useState<RatingPool>("blitz");
  const { user } = useAuthStore();
  const { entries, loading, error } = useLeaderboard(pool, 50);
  const navigate = useNavigate();

  return (
    <div className="bg-white dark:bg-gray-800/80 rounded-2xl p-6 border border-gray-200/60 dark:border-gray-700/40 shadow-lg dark:shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight">
          Leaderboard
        </h3>
        <Trophy className="w-5 h-5 text-amber-500" />
      </div>

      {/* Pool tabs */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {POOLS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setPool(option.id)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
              pool === option.id
                ? "bg-amber-500 text-white shadow-md shadow-amber-500/25"
                : "bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* List container — softer border, inner glow */}
      <div className="mt-4 rounded-xl border border-gray-200/50 dark:border-gray-700/30 bg-gray-50 dark:bg-gray-900/40 overflow-hidden shadow-inner dark:shadow-[inset_0_1px_4px_rgba(0,0,0,0.2)]">
        {loading ? (
          <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Loading leaderboard...
          </div>
        ) : error ? (
          <div className="py-8 text-center text-sm text-red-500">{error}</div>
        ) : entries.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No rated players yet.
          </div>
        ) : (
          <div className="leaderboard-mask">
            <div className="max-h-[420px] overflow-y-auto premium-scrollbar py-1">
              {entries.map((entry, idx) => {
                const isYou = !!user?.fullName && entry.name === user.fullName;
                const accent = rankAccent(entry.rank);
                const isLast = idx === entries.length - 1;

                return (
                  <div
                    key={`${pool}-${entry.rank}-${entry.name}`}
                    className={[
                      "grid grid-cols-[48px_1fr_auto] items-center gap-2 px-3 py-2.5",
                      "transition-all duration-200 ease-out",
                      "hover:bg-white/5 hover:translate-x-[2px]",
                      isYou
                        ? "bg-teal-50 dark:bg-teal-500/10 ring-1 ring-teal-400/20"
                        : "",
                      accent ? `${accent.bg} ${accent.ring}` : "",
                      !isLast
                        ? "border-b border-gray-200/40 dark:border-gray-700/20"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {/* Rank */}
                    <div className="flex items-center gap-1.5">
                      {accent?.icon}
                      <span
                        className={`text-sm font-bold tabular-nums ${
                          accent
                            ? accent.text
                            : "text-gray-500 dark:text-gray-500"
                        }`}
                      >
                        #{entry.rank}
                      </span>
                    </div>

                    {/* Player info */}
                    <div
                      className="min-w-0 cursor-pointer group/name"
                      onClick={() => {
                        if (isYou) {
                          navigate("/profile");
                        } else if (entry.id) {
                          navigate(`/u/${entry.id}`);
                        }
                      }}
                    >
                      <div
                        className={`truncate text-sm ${
                          accent ? "font-semibold" : "font-medium"
                        } text-gray-900 dark:text-white group-hover/name:text-teal-500 dark:group-hover/name:text-teal-400 transition-colors`}
                      >
                        {entry.name}
                        {isYou && (
                          <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-teal-500 dark:text-teal-400">
                            you
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-400 dark:text-gray-500">
                        {entry.isProvisional
                          ? `Provisional (${entry.games}/10)`
                          : `${entry.games} games`}
                      </div>
                    </div>

                    {/* Rating — dominant */}
                    <div
                      className={`text-base font-extrabold tabular-nums ${
                        accent
                          ? accent.text
                          : "text-gray-800 dark:text-gray-100"
                      }`}
                    >
                      {entry.rating}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
        Showing top 50 players in this pool (minimum 10 rated games).
      </p>
    </div>
  );
}
