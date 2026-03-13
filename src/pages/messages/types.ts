export const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3001";

export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

export const ACCEPTED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

export const MAX_ATTACHMENTS = 10;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_TOTAL_IMAGE_BYTES = 32 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export interface Conversation {
  partnerId: string;
  partnerName: string;
  partnerAvatar: string;
  lastMessage: string;
  lastMessageAt: string;
  lastSender?: string;
  lastAttachmentCount?: number;
  unreadCount: number;
  archived?: boolean;
  isArchived?: boolean;
  archivedAt?: string | null;
  deletedAt?: string | null;
  status?: string;
  folder?: string;
}

export interface MessageAttachment {
  type?: "image" | "video";
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  thumbnail?: string | null;
}

export interface SharedGame {
  gameId: string;
  white: string;
  black: string;
  result: string;
  whiteElo?: number | null;
  blackElo?: number | null;
  timeControl?: string;
  eco?: string;
  playedAt?: string;
  rated?: boolean;
  moves?: number;
  variant?: string;
  termination?: string;
}

export interface Message {
  _id: string;
  sender: string;
  receiver: string;
  content: string;
  attachments?: MessageAttachment[];
  sharedGame?: SharedGame | null;
  read: boolean;
  status?: string;
  createdAt: string;
}

export type FetchMessagesOptions = {
  preferUnread?: boolean;
  scrollToBottom?: boolean;
};

export type PendingImage = {
  id: string;
  file: File;
  previewUrl: string;
  name: string;
  size: number;
  type: string;
};

export type PendingVideo = {
  id: string;
  file: File;
  previewUrl: string;
  name: string;
  size: number;
  type: string;
};
