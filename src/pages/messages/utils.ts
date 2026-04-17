import { API_URL, Message, MessageAttachment, Conversation } from "./types";

function formatTime(input: string) {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatConversationTime(input: string) {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function isArchivedConversation(conversation: Conversation) {
  return (
    conversation.archived === true ||
    conversation.isArchived === true ||
    !!conversation.archivedAt ||
    conversation.status === "archived" ||
    conversation.folder === "archived"
  );
}

function normalizePotentialUploadPath(value = "") {
  const raw = String(value || "").trim().replace(/\\/g, "/");
  if (!raw) return "";
  const marker = "/uploads/";
  const index = raw.toLowerCase().indexOf(marker);
  if (index < 0) return raw;
  return raw.slice(index);
}

function resolveMediaUrl(url?: string) {
  const normalized = normalizePotentialUploadPath(url || "");
  if (!normalized) return "";
  if (
    normalized.startsWith("http://") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("blob:") ||
    normalized.startsWith("data:")
  ) {
    return normalized;
  }
  return `${API_URL}${normalized.startsWith("/") ? "" : "/"}${normalized}`;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

const isVideoAttachment = (attachment?: MessageAttachment | null) =>
  !!attachment &&
  (attachment.type === "video" ||
    (attachment.mimeType || "").startsWith("video/"));

const isImageAttachment = (attachment?: MessageAttachment | null) =>
  !!attachment &&
  (attachment.type === "image" ||
    (attachment.mimeType || "").startsWith("image/"));

function messagePreviewLabel(
  message: Pick<Message, "content" | "attachments" | "sharedGame">,
) {
  if (message.sharedGame?.gameId) return "Shared a game";
  const text = (message.content || "").trim();
  const attachments = Array.isArray(message.attachments)
    ? message.attachments
    : [];
  const videos = attachments.filter(isVideoAttachment).length;
  const images = attachments.filter(isImageAttachment).length;

  let label = "";
  if (videos > 0) label = videos > 1 ? `${videos} Videos` : "Video";
  else if (images > 0) label = images > 1 ? `${images} Photos` : "Photo";

  if (!label) return text;
  if (!text) return label;
  return `${text} · ${label}`;
}

export {
  formatBytes,
  formatConversationTime,
  formatTime,
  getInitials,
  isArchivedConversation,
  isImageAttachment,
  isVideoAttachment,
  messagePreviewLabel,
  resolveMediaUrl,
};
