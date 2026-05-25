import i18n from "../i18n";

export type PresenceStatus =
  | "online"
  | "offline"
  | "searching_match"
  | "in_game"
  | "away";

function parseDate(input?: string | Date | null): Date | null {
  if (!input) return null;
  const parsed = input instanceof Date ? input : new Date(input);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function tr(
  key: string,
  defaultValue: string,
  options?: Record<string, unknown>,
): string {
  return i18n.t(key, { defaultValue, ...(options ?? {}) });
}

function currentLocale(): string {
  const language = i18n.resolvedLanguage || i18n.language || "en";
  return language === "mn" ? "mn-MN" : "en-US";
}

export function formatRelativeTime(input?: string | Date | null): string {
  const date = parseDate(input);
  if (!date) return tr("presence.unknown", "unknown");

  const diffMs = Math.max(0, Date.now() - date.getTime());
  const mins = Math.floor(diffMs / (60 * 1000));
  if (mins < 1) return tr("presence.justNow", "just now");
  if (mins < 60) {
    return tr("presence.minutesAgo", "{{count}}m ago", { count: mins });
  }

  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return tr("presence.hoursAgo", "{{count}}h ago", { count: hours });
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return tr("presence.daysAgo", "{{count}}d ago", { count: days });
  }

  return date.toLocaleDateString(currentLocale(), {
    month: "short",
    day: "numeric",
  });
}

export function presenceText(
  status: PresenceStatus,
  lastSeen?: string | Date | null,
) {
  if (status === "in_game") return tr("presence.status.inGame", "In game");
  if (status === "searching_match") {
    return tr("presence.status.searchingMatch", "Searching for match");
  }
  if (status === "away") return tr("presence.status.away", "Away");
  if (status === "online") return tr("presence.status.online", "Online");

  const seen = formatRelativeTime(lastSeen);
  return seen === tr("presence.unknown", "unknown")
    ? tr("presence.status.offline", "Offline")
    : tr("presence.lastSeen", "Last seen {{time}}", { time: seen });
}

export function presenceDotClass(status: PresenceStatus) {
  if (status === "online") return "bg-brand-500";
  if (status === "in_game") return "bg-amber-500";
  if (status === "searching_match") return "bg-brand-500";
  if (status === "away") return "bg-yellow-500";
  return "bg-theme-surface";
}
