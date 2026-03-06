/* ═══════════════════════════════════════════════════════
   Community — Shared small components
   ═══════════════════════════════════════════════════════ */
import type { ReactNode } from "react";
import { Crown, CheckCircle2, Circle, Wifi } from "lucide-react";
import { useTranslation } from "react-i18next";

/* ─── Title Badge (GM, IM, etc.) ─── */
export function TitleBadge({ title }: { title: string }) {
  const colors: Record<string, string> = {
    GM: "bg-amber-500/15 text-amber-500 border-amber-500/20",
    IM: "bg-orange-500/15 text-orange-400 border-orange-500/20",
    FM: "bg-sky-500/15 text-sky-400 border-sky-500/20",
    WGM: "bg-pink-500/15 text-pink-400 border-pink-500/20",
    CM: "bg-violet-500/15 text-violet-400 border-violet-500/20",
  };
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black tracking-wider border ${
        colors[title] || "bg-gray-500/15 text-gray-400 border-gray-500/20"
      }`}
    >
      {title}
    </span>
  );
}

/* ─── Verified Check ─── */
export function VerifiedBadge() {
  return (
    <CheckCircle2 className="w-3.5 h-3.5 text-teal-400 fill-teal-400/20 shrink-0" />
  );
}

/* ─── Rating Pill ─── */
export function RatingPill({ rating }: { rating: number }) {
  if (!rating) return null;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800/80 text-[10px] font-bold text-gray-500 dark:text-gray-400 tabular-nums">
      <Crown className="w-2.5 h-2.5" />
      {rating}
    </span>
  );
}

/* ─── Avatar ─── */
interface AvatarProps {
  initials: string;
  src?: string;
  size?: "sm" | "md" | "lg";
  online?: boolean;
}

export function Avatar({ initials, src, size = "md", online }: AvatarProps) {
  const sizeMap = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-12 h-12 text-base",
  };
  return (
    <div className="relative shrink-0">
      <div
        className={`${sizeMap[size]} rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white font-bold shadow-lg shadow-teal-900/10 overflow-hidden ring-2 ring-white/10`}
      >
        {src ? (
          <img
            src={src}
            alt={initials}
            className="w-full h-full object-cover"
          />
        ) : (
          initials
        )}
      </div>
      {online && (
        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-950" />
      )}
    </div>
  );
}

/* ─── Tag Chip ─── */
export function TagChip({ tag }: { tag: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-teal-500/10 text-teal-500 hover:bg-teal-500/20 transition-colors cursor-pointer">
      {tag}
    </span>
  );
}

/* ─── Sidebar Card Shell ─── */
interface SidebarCardProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}

export function SidebarCard({
  title,
  icon,
  children,
  action,
}: SidebarCardProps) {
  return (
    <div className="rounded-2xl border border-gray-200/50 dark:border-gray-800/60 bg-white/60 dark:bg-gray-900/50 backdrop-blur-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">
            {title}
          </h3>
        </div>
        {action}
      </div>
      <div className="px-4 pb-4">{children}</div>
    </div>
  );
}

/* ─── Online Status Dot ─── */
export function StatusDot({
  status,
}: {
  status: "playing" | "idle" | "streaming";
}) {
  const { t } = useTranslation();
  const map = {
    playing: "bg-green-500",
    idle: "bg-yellow-500",
    streaming: "bg-red-500",
  };
  const labels = {
    playing: "Playing",
    idle: "Online",
    streaming: "Live",
  };
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`w-1.5 h-1.5 rounded-full ${map[status]}`} />
      <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">
        {t(labels[status])}
      </span>
    </span>
  );
}

/* ─── Follow Button ─── */
export function FollowButton({
  compact = false,
  following = false,
  onClick,
}: {
  compact?: boolean;
  following?: boolean;
  onClick?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      className={`rounded-full font-bold transition-all duration-200 ${
        following
          ? "bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-red-100 dark:hover:bg-red-900/20 hover:text-red-500"
          : "bg-teal-600 hover:bg-teal-500 text-white shadow-md shadow-teal-900/20 hover:shadow-lg"
      } ${compact ? "text-[11px] px-3 py-1" : "text-xs px-4 py-1.5"}`}
    >
      {following ? t("Following") : t("Follow")}
    </button>
  );
}

/* ─── Format number (1500 → 1.5k) ─── */
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
