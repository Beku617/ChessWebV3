/* ═══════════════════════════════════════════════════════
   Community Right Sidebar Widgets
   ═══════════════════════════════════════════════════════ */
import { memo } from "react";
import { Link } from "react-router-dom";
import {
  SidebarCard,
  Avatar,
  TitleBadge,
  StatusDot,
  FollowButton,
  formatCount,
} from "./CommunityUI";
import {
  LIVE_GAMES,
  TOP_PLAYERS_ONLINE,
  PUZZLE_LEADERBOARD,
  SUGGESTED_USERS,
  UPCOMING_EVENTS,
} from "../../data/communityData";
import {
  CommunityPost,
  formatRelativeTime,
  summarizeCommunityPost,
} from "./types";
import { useTranslation, Trans } from "react-i18next";

/* ─── Trending Topics ─── */
interface TrendingWidgetProps {
  posts?: CommunityPost[];
  mode?: "likes" | "latest";
  loading?: boolean;
  error?: string;
}

export const TrendingWidget = memo(function TrendingWidget({
  posts = [],
  mode = "latest",
  loading = false,
  error = "",
}: TrendingWidgetProps) {
  const { t } = useTranslation();
  return (
    <SidebarCard
      title={t("Trending in chess")}
      action={
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-theme-muted">
          {mode === "likes"
            ? t("communitySidebar.trendingMode.likes")
            : t("communitySidebar.trendingMode.fresh")}
        </span>
      }
    >
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={`trending-skeleton-${index}`}
              className="h-[74px] animate-pulse rounded-2xl bg-theme-panel/[0.05]"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-red-500/10 px-4 py-4 text-sm text-red-200">
          {error}
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl bg-theme-panel/[0.03] px-4 py-5 text-sm leading-6 text-theme-muted">
          {t("communityPage.empty.noApprovedTitle")}
        </div>
      ) : (
        <div className="space-y-2">
          {posts.slice(0, 3).map((post, index) => {
            const summary = summarizeCommunityPost(post);
            const authorLabel = post.author?.fullName || t("profileHeader.chessPlayer");
            const subline = [
              `${t("communitySidebar.byAuthor", { author: authorLabel })}`,
              post.group?.name || "",
              formatRelativeTime(post.createdAt),
            ]
              .filter(Boolean)
              .join(" · ");
            const showLikes = post.likeCount > 0 || mode === "likes";

            return (
              <Link
                key={post.id}
                to={`/community#post-${post.id}`}
                className="flex items-start gap-3 rounded-2xl px-3 py-3 text-left transition-all duration-150 hover:bg-theme-panel/[0.04] group"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-theme-panel/[0.05] text-[11px] font-semibold text-theme-muted">
                  #{index + 1}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-sm font-semibold leading-6 text-theme-foreground transition-colors group-hover:text-brand-200">
                    {summary}
                  </div>
                  <div className="mt-1 text-[11px] leading-5 text-theme-muted">
                    {subline}
                  </div>
                </div>

                <div className="shrink-0">
                  {showLikes ? (
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-2.5 py-1 text-[11px] font-medium text-brand-100">
                      {formatCount(post.likeCount)}
                    </div>
                  ) : (
                    <div className="rounded-full bg-theme-panel/[0.05] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-theme-muted">
                      {t("communitySidebar.new")}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </SidebarCard>
  );
});

export function CommunityGuidelinesWidget() {
  const { t } = useTranslation();
  return (
    <SidebarCard
      title={t("communitySidebar.notesTitle")}
    >
      <div className="space-y-3 text-sm text-theme-muted leading-6">
        <p className="text-theme-muted">
          {t("communitySidebar.notesDescription")}
        </p>
        <ul className="space-y-2 text-[13px] text-theme-muted">
          <li className="flex items-start gap-2">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-brand-400 shrink-0" />
            {t("communitySidebar.noteOne")}
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-brand-400 shrink-0" />
            {t("communitySidebar.noteTwo")}
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-brand-400 shrink-0" />
            {t("communitySidebar.noteThree")}
          </li>
        </ul>
      </div>
    </SidebarCard>
  );
}

/* ─── Live Games ─── */
export function LiveGamesWidget() {
  const { t } = useTranslation();
  return (
    <SidebarCard
      title={t("Live Now")}
      action={
        <span className="flex items-center gap-1 text-[10px] font-bold text-red-400">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          {LIVE_GAMES.length} {t("games")}
        </span>
      }
    >
      <div className="space-y-2">
        {LIVE_GAMES.map((game, i) => (
          <button
            key={i}
            className="w-full p-2.5 -mx-1 rounded-xl hover:bg-theme-surface/60 transition-all duration-150 text-left group"
          >
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs">
                  {game.white.title && (
                    <span className="text-[9px] font-black text-amber-500">
                      {game.white.title}
                    </span>
                  )}
                  <span className="font-semibold text-theme-foreground truncate">
                    {game.white.name}
                  </span>
                  <span className="text-theme-muted text-[10px]">
                    ({game.white.rating})
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs mt-0.5">
                  {game.black.title && (
                    <span className="text-[9px] font-black text-amber-500">
                      {game.black.title}
                    </span>
                  )}
                  <span className="font-semibold text-theme-foreground truncate">
                    {game.black.name}
                  </span>
                  <span className="text-theme-muted text-[10px]">
                    ({game.black.rating})
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0 ml-2">
                <div className="text-[10px] text-theme-muted">
                  {game.format}
                </div>
                <div className="flex items-center gap-1 text-[10px] text-theme-muted mt-0.5">
                  {formatCount(game.viewers)}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </SidebarCard>
  );
}

/* ─── Top Players Online ─── */
export function TopPlayersWidget() {
  const { t } = useTranslation();
  return (
    <SidebarCard
      title={t("Top Players")}
    >
      <div className="space-y-1.5">
        {TOP_PLAYERS_ONLINE.map((player) => (
          <div
            key={player.name}
            className="flex items-center gap-2.5 p-2 -mx-1 rounded-xl hover:bg-theme-surface/60 transition-all duration-150 cursor-pointer"
          >
            <Avatar initials={player.avatar} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                {player.title && (
                  <span className="text-[9px] font-black text-amber-500">
                    {player.title}
                  </span>
                )}
                <span className="text-xs font-semibold text-theme-foreground truncate">
                  {player.name}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] font-bold text-theme-muted tabular-nums">
                  {player.rating}
                </span>
                <StatusDot status={player.status} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </SidebarCard>
  );
}

/* ─── Puzzle Leaderboard ─── */
export function PuzzleLeaderboardWidget() {
  const { t } = useTranslation();
  return (
    <SidebarCard
      title={t("Puzzle Leaders")}
      action={
        <button className="text-[11px] font-semibold text-brand-500 hover:text-brand-400 transition-colors">
          {t("Full board")}
        </button>
      }
    >
      <div className="space-y-1">
        {PUZZLE_LEADERBOARD.map((leader) => (
          <div
            key={leader.rank}
            className="flex items-center gap-2.5 p-2 -mx-1 rounded-xl hover:bg-theme-surface/60 transition-all duration-150 cursor-pointer"
          >
            <div
              className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black ${
                leader.rank === 1
                  ? "bg-amber-500/15 text-amber-500"
                  : leader.rank === 2
                    ? "bg-theme-surface/20 text-theme-muted"
                    : leader.rank === 3
                      ? "bg-orange-500/15 text-orange-400"
                      : "bg-theme-surface text-theme-muted"
              }`}
            >
              {leader.rank}
            </div>
            <Avatar initials={leader.avatar} size="sm" />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-semibold text-theme-foreground truncate block">
                {leader.name}
              </span>
              <span className="text-[10px] text-theme-muted tabular-nums">
                {leader.rating} · {formatCount(leader.solved)} {t("solved")}
              </span>
            </div>
          </div>
        ))}
      </div>
    </SidebarCard>
  );
}

/* ─── Who to Follow ─── */
export function WhoToFollowWidget() {
  const { t } = useTranslation();
  return (
    <SidebarCard
      title={t("Who to Follow")}
    >
      <div className="space-y-3">
        {SUGGESTED_USERS.map((su) => (
          <div key={su.handle} className="flex items-start gap-2.5">
            <Avatar initials={su.avatar} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                {su.title && <TitleBadge title={su.title} />}
                <span className="text-xs font-bold text-theme-foreground truncate">
                  {su.name}
                </span>
              </div>
              <p className="text-[10px] text-theme-muted mt-0.5 truncate">
                {su.bio} · {su.followers} <Trans>followers</Trans> </p>
            </div>
            <FollowButton compact />
          </div>
        ))}
      </div>
    </SidebarCard>
  );
}

/* ─── Upcoming Events ─── */
export function EventsWidget() {
  const { t } = useTranslation();

  return (
    <SidebarCard
      title={t("Upcoming Events")}
    >
      <div className="space-y-2">
        {UPCOMING_EVENTS.map((event) => {
          return (
            <button
              key={event.name}
              className="w-full flex items-center p-2.5 -mx-1 rounded-xl hover:bg-theme-surface/60 transition-all duration-150 text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-theme-foreground truncate">
                  {event.name}
                </div>
                <div className="text-[10px] text-theme-muted flex items-center gap-1.5">
                  <span>{event.date}</span>
                  {event.participants && (
                    <>
                      <span>·</span>
                      <span>{event.participants}</span>
                    </>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </SidebarCard>
  );
}

/* ─── Daily Puzzle Shortcut ─── */
export function DailyPuzzleWidget() {
  const { t } = useTranslation();
  // 4x4 quick board
  const squares = Array.from({ length: 16 }, (_, i) => {
    const row = Math.floor(i / 4);
    const col = i % 4;
    return (row + col) % 2 === 0;
  });

  return (
    <SidebarCard
      title={t("Daily Puzzle")}
    >
      <button className="w-full group">
        <div className="rounded-xl overflow-hidden border border-theme-glass/30">
          <div className="grid grid-cols-4 w-full aspect-square">
            {squares.map((isLight, i) => (
              <div
                key={i}
                className={`${
                  isLight
                    ? "bg-[#eeeed2]"
                    : "bg-[#769656]"
                }`}
              />
            ))}
          </div>
        </div>
        <div className="mt-2 text-center">
          <span className="text-xs font-bold text-brand-500 group-hover:text-brand-400 transition-colors">
            {t("Solve Today's Puzzle")}
          </span>
        </div>
      </button>
    </SidebarCard>
  );
}

