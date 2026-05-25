import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
      bg: "bg-brand-500/10",
      ring: "ring-1 ring-brand-400/30",
      text: "text-theme-accent",
    };
  if (rank === 2)
    return {
      bg: "bg-brand-500/10",
      ring: "ring-1 ring-brand-400/20",
      text: "text-theme-accent",
    };
  if (rank === 3)
    return {
      bg: "bg-brand-400/10",
      ring: "ring-1 ring-brand-400/20",
      text: "text-theme-accent",
    };
  return null;
}

export function PoolLeaderboardCard() {
  const { t } = useTranslation();
  const [pool, setPool] = useState<RatingPool>("blitz");
  const { user } = useAuthStore();
  const { entries, currentUser, loading, error } = useLeaderboard(pool, 50);
  const navigate = useNavigate();

  return (
    <div className="h-full bg-theme-panel rounded-2xl p-6 border border-theme-glass/40 shadow-lg flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-theme-foreground tracking-tight">
          {t("profileWidgets.leaderboardTitle", "Leaderboard")}
        </h3>
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
                ? "bg-brand-500 text-theme-on-accent shadow-md shadow-brand-500/25"
                : "bg-theme-surface text-theme-muted hover:bg-theme-surface/80"
            }`}
          >
            {t(`profileGames.pools.${option.id}`, option.label)}
          </button>
        ))}
      </div>

      {/* List container — softer border, inner glow */}
      <div className="mt-4 rounded-xl border border-theme-glass/30 bg-theme-surface overflow-hidden shadow-inner flex-1 min-h-0">
        {loading ? (
          <div className="py-8 text-center text-sm text-theme-muted">
            {t("profileWidgets.loadingLeaderboard", "Loading leaderboard...")}
          </div>
        ) : error ? (
          <div className="py-8 text-center text-sm text-red-500">{error}</div>
        ) : entries.length === 0 ? (
          <div className="py-8 text-center text-sm text-theme-muted">
            {t("profileWidgets.noRatedPlayers", "No rated players yet.")}
          </div>
        ) : (
          <div className="leaderboard-mask">
            <div className="max-h-[420px] overflow-y-auto premium-scrollbar py-1">
              {entries.map((entry, idx) => {
                const isYou =
                  (!!user?.id && entry.id === user.id) ||
                  (!!user?.fullName && entry.name === user.fullName);
                const accent = rankAccent(entry.rank);
                const isLast = idx === entries.length - 1;

                return (
                  <div
                    key={`${pool}-${entry.rank}-${entry.name}`}
                    className={[
                      "grid grid-cols-[48px_1fr_auto] items-center gap-2 px-3 py-2.5",
                      "transition-all duration-200 ease-out",
                      "hover:bg-theme-panel/5 hover:translate-x-[2px]",
                      isYou
                        ? "bg-brand-50 ring-1 ring-brand-400/20"
                        : "",
                      accent ? `${accent.bg} ${accent.ring}` : "",
                      !isLast ? "border-b border-theme-glass/20" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {/* Rank */}
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-sm font-bold tabular-nums ${
                          accent
                            ? accent.text
                            : "text-theme-muted"
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
                        } text-theme-foreground group-hover/name:text-brand-500 transition-colors`}
                      >
                        {entry.name}
                        {isYou && (
                          <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-brand-500">
                            {t("profileWidgets.youTag", "you")}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-theme-muted">
                        {entry.isProvisional
                          ? t("profileGames.provisionalGames", {
                              count: entry.games,
                              total: 10,
                              defaultValue: "Provisional ({{count}}/{{total}})",
                            })
                          : t("profileGames.gamesCount", {
                              count: entry.games,
                              defaultValue: "{{count}} games",
                            })}
                      </div>
                    </div>

                    {/* Rating — dominant */}
                    <div
                      className={`text-base font-extrabold tabular-nums ${
                        accent
                          ? accent.text
                          : "text-theme-foreground "
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
      <div className="mt-2 space-y-1">
        <p className="text-[11px] text-theme-muted">
          {t("profileWidgets.topPlayersHint", {
            top: 50,
            minimum: 10,
            defaultValue:
              "Showing top {{top}} players in this pool (minimum {{minimum}} rated games).",
          })}
        </p>
        {currentUser && (
          <p className="text-[12px] text-theme-muted">
            {currentUser.qualifies && currentUser.rank ? (
              <>
                {t("profileWidgets.yourPosition", "Your position")}:{" "}
                <span className="font-semibold text-brand-600">
                  #{currentUser.rank}
                </span>{" "}
                ({currentUser.rating})
              </>
            ) : (
              <>
                {t("profileWidgets.yourPosition", "Your position")}:{" "}
                <span className="font-semibold text-theme-muted">
                  {t("profileWidgets.unranked", "Unranked")}
                </span>{" "}
                {t("profileWidgets.unrankedGamesSuffix", {
                  count: currentUser.games,
                  total: 10,
                  defaultValue: "({{count}}/{{total}} games)",
                })}
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

