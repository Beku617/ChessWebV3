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

export function formatRelativeTime(input?: string | Date | null): string {
  const date = parseDate(input);
  if (!date) return "unknown";

  const diffMs = Math.max(0, Date.now() - date.getTime());
  const mins = Math.floor(diffMs / (60 * 1000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function presenceText(status: PresenceStatus, lastSeen?: string | Date | null) {
  if (status === "in_game") return "In game";
  if (status === "searching_match") return "Searching for match";
  if (status === "away") return "Away";
  if (status === "online") return "Online";
  const seen = formatRelativeTime(lastSeen);
  return seen === "unknown" ? "Offline" : `Last seen ${seen}`;
}

export function presenceDotClass(status: PresenceStatus) {
  if (status === "online") return "bg-emerald-500";
  if (status === "in_game") return "bg-amber-500";
  if (status === "searching_match") return "bg-sky-500";
  if (status === "away") return "bg-yellow-500";
  return "bg-gray-400";
}
