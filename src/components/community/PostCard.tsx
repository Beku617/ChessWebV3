/* ═══════════════════════════════════════════════════════
   Post Card — Premium community post
   ═══════════════════════════════════════════════════════ */
import { useState } from "react";
import {
  MessageSquare,
  Heart,
  Share2,
  Bookmark,
  MoreHorizontal,
  Swords,
} from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  Avatar,
  TitleBadge,
  VerifiedBadge,
  RatingPill,
  TagChip,
  FollowButton,
  formatCount,
} from "./CommunityUI";
import type { CommunityPost } from "../../data/communityData";

/* ─── Mini Board Preview ─── */
function MiniBoardPreview({ label }: { label?: string }) {
  const { t } = useTranslation();
  // 4x4 simplified chessboard pattern
  const squares = Array.from({ length: 16 }, (_, i) => {
    const row = Math.floor(i / 4);
    const col = i % 4;
    const isLight = (row + col) % 2 === 0;
    return isLight;
  });

  return (
    <div className="group/board relative mt-3 rounded-xl overflow-hidden border border-gray-200/40 dark:border-gray-800/40 cursor-pointer">
      <div className="grid grid-cols-4 w-full aspect-[2/1]">
        {squares.map((isLight, i) => (
          <div
            key={i}
            className={`${
              isLight
                ? "bg-[#eeeed2] dark:bg-[#4a4a3a]"
                : "bg-[#769656] dark:bg-[#5a7a42]"
            } transition-colors duration-300`}
          />
        ))}
      </div>
      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent flex items-end p-3 group-hover/board:from-black/70 transition-all">
        <div className="flex items-center gap-2">
          <Swords className="w-3.5 h-3.5 text-white/80" />
          <span className="text-xs font-semibold text-white/90">
            {label ? t(label) : t("View Game")}
          </span>
        </div>
      </div>
      {/* Hover glow */}
      <div className="absolute inset-0 opacity-0 group-hover/board:opacity-100 transition-opacity duration-300 bg-teal-500/5 pointer-events-none" />
    </div>
  );
}

/* ─── Poll Component ─── */
function PollView({
  poll,
}: {
  poll: { question: string; options: { label: string; votes: number }[] };
}) {
  const { t } = useTranslation();
  const [voted, setVoted] = useState<string | null>(null);
  const total = poll.options.reduce((s, o) => s + o.votes, 0);

  return (
    <div className="mt-3 space-y-2">
      {poll.options.map((opt) => {
        const pct = Math.round((opt.votes / total) * 100);
        const isSelected = voted === opt.label;
        return (
          <button
            key={opt.label}
            onClick={() => setVoted(opt.label)}
            className={`relative w-full text-left rounded-xl px-4 py-2.5 text-sm font-medium overflow-hidden transition-all duration-300 border ${
              isSelected
                ? "border-teal-500/40 bg-teal-500/5"
                : voted
                  ? "border-gray-200/40 dark:border-gray-800/40 bg-gray-50/50 dark:bg-gray-800/30"
                  : "border-gray-200/40 dark:border-gray-800/40 hover:border-teal-500/30 hover:bg-teal-500/5"
            }`}
          >
            {voted && (
              <div
                className={`absolute inset-y-0 left-0 rounded-xl transition-all duration-500 ${
                  isSelected
                    ? "bg-teal-500/15"
                    : "bg-gray-200/30 dark:bg-gray-700/20"
                }`}
                style={{ width: `${pct}%` }}
              />
            )}
            <div className="relative flex justify-between items-center">
              <span className="text-gray-800 dark:text-gray-200">
                {opt.label}
              </span>
              {voted && (
                <span className="text-xs font-bold text-gray-500 dark:text-gray-400 tabular-nums">
                  {pct}%
                </span>
              )}
            </div>
          </button>
        );
      })}
      <p className="text-xs text-gray-500 dark:text-gray-400 pl-1">
        {formatCount(total)} {t("votes")}
      </p>
    </div>
  );
}

/* ─── Game Result Badge ─── */
function GameResultBadge({
  result,
}: {
  result: { white: string; black: string; result: string; format: string };
}) {
  return (
    <div className="mt-3 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-gray-50/80 dark:bg-gray-800/40 border border-gray-200/40 dark:border-gray-800/40">
      <Swords className="w-4 h-4 text-teal-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-bold text-gray-800 dark:text-gray-200 truncate">
            {result.white}
          </span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
              result.result === "1-0"
                ? "bg-green-500/15 text-green-500"
                : result.result === "0-1"
                  ? "bg-red-500/15 text-red-500"
                  : "bg-gray-500/15 text-gray-500"
            }`}
          >
            {result.result}
          </span>
          <span className="font-bold text-gray-800 dark:text-gray-200 truncate">
            {result.black}
          </span>
        </div>
        <span className="text-[11px] text-gray-500 dark:text-gray-400">
          {result.format}
        </span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN POST CARD
   ═══════════════════════════════════════════════════════ */
interface PostCardProps {
  post: CommunityPost;
  index: number;
}

export function PostCard({ post, index }: PostCardProps) {
  const { t } = useTranslation();
  const [liked, setLiked] = useState(post.liked ?? false);
  const [bookmarked, setBookmarked] = useState(post.bookmarked ?? false);
  const [likeCount, setLikeCount] = useState(post.likes);

  const handleLike = () => {
    setLiked(!liked);
    setLikeCount((c) => (liked ? c - 1 : c + 1));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.35, ease: "easeOut" }}
      className="group relative rounded-2xl border border-gray-200/40 dark:border-gray-800/50 bg-white/60 dark:bg-gray-900/40 backdrop-blur-xl hover:bg-white/80 dark:hover:bg-gray-900/60 hover:shadow-lg hover:shadow-gray-900/5 dark:hover:shadow-black/20 hover:border-gray-300/50 dark:hover:border-gray-700/50 transition-all duration-300 overflow-hidden"
    >
      {/* Subtle hover glow */}
      <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full bg-teal-500/[0.03] blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      <div className="relative p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <Avatar
              initials={post.user.avatar}
              size="md"
              online={post.user.online}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                {post.user.title && <TitleBadge title={post.user.title} />}
                <span className="text-sm font-bold text-gray-900 dark:text-white truncate hover:underline cursor-pointer">
                  {post.user.name}
                </span>
                {post.user.verified && <VerifiedBadge />}
                <RatingPill rating={post.user.rating} />
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {post.user.handle}
                </span>
                <span className="text-gray-400 dark:text-gray-600">·</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {post.time}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <FollowButton compact />
            <button className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="mt-3 text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
          {post.content}
        </div>

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {post.tags.map((tag) => (
              <TagChip key={tag} tag={tag} />
            ))}
          </div>
        )}

        {/* Game Result */}
        {post.gameResult && <GameResultBadge result={post.gameResult} />}

        {/* PGN / FEN Mini Board */}
        {(post.pgn || post.fen) && !post.gameResult && (
          <MiniBoardPreview label="View Position" />
        )}
        {post.pgn && post.gameResult && (
          <MiniBoardPreview label="Replay Game" />
        )}

        {/* Poll */}
        {post.poll && <PollView poll={post.poll} />}

        {/* Image placeholder */}
        {post.image && !post.poll && (
          <div className="mt-3 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-800/60 h-48 flex items-center justify-center border border-gray-200/30 dark:border-gray-800/30 overflow-hidden group-hover:scale-[1.005] transition-transform duration-500">
            <div className="text-center">
              <div className="w-10 h-10 mx-auto rounded-full bg-gray-300/50 dark:bg-gray-700/50 flex items-center justify-center">
                <span className="text-lg">🏆</span>
              </div>
              <span className="text-xs text-gray-400 mt-2 block">
                {t("Tournament Banner")}
              </span>
            </div>
          </div>
        )}

        {/* Action Row */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100/80 dark:border-gray-800/40">
          <div className="flex items-center gap-1">
            {/* Comment */}
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-teal-500 hover:bg-teal-500/10 transition-all duration-150 group/btn">
              <MessageSquare className="w-4 h-4" />
              <span className="text-xs font-semibold tabular-nums">
                {formatCount(post.comments)}
              </span>
            </button>

            {/* Like */}
            <button
              onClick={handleLike}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all duration-150 group/btn ${
                liked
                  ? "text-pink-500 bg-pink-500/10"
                  : "text-gray-500 dark:text-gray-400 hover:text-pink-500 hover:bg-pink-500/10"
              }`}
            >
              <Heart
                className={`w-4 h-4 transition-transform duration-200 ${
                  liked
                    ? "fill-pink-500 scale-110"
                    : "group-hover/btn:scale-110"
                }`}
              />
              <span className="text-xs font-semibold tabular-nums">
                {formatCount(likeCount)}
              </span>
            </button>

            {/* Share */}
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-blue-500 hover:bg-blue-500/10 transition-all duration-150">
              <Share2 className="w-4 h-4" />
              <span className="text-xs font-semibold tabular-nums">
                {formatCount(post.shares)}
              </span>
            </button>
          </div>

          {/* Bookmark */}
          <button
            onClick={() => setBookmarked(!bookmarked)}
            className={`p-2 rounded-lg transition-all duration-150 ${
              bookmarked
                ? "text-amber-500 bg-amber-500/10"
                : "text-gray-400 dark:text-gray-500 hover:text-amber-500 hover:bg-amber-500/10"
            }`}
          >
            <Bookmark
              className={`w-4 h-4 ${bookmarked ? "fill-amber-500" : ""}`}
            />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
