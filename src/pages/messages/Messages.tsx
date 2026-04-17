import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Check,
  Clock3,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Search,
  Send,
  Smile,
  Archive,
  ArchiveRestore,
  Trash2,
  Swords,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Video,
  Crown,
  ExternalLink,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import Sidebar from "../../components/Sidebar";
import { useAuthStore } from "../../store/authStore";
import { useMessageStore } from "../../store/messageStore";
import { useFriendStore } from "../../store/friendStore";
import { useFriendChallengeStore } from "../../store/friendChallengeStore";
import {
  PresenceStatus,
  presenceText,
  presenceDotClass,
} from "../../utils/presence";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_ATTACHMENTS = 10;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB
const MAX_TOTAL_IMAGE_BYTES = 32 * 1024 * 1024; // 32MB total images
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50MB per video

interface Conversation {
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

interface MessageAttachment {
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

interface SharedGame {
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

interface Message {
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

type FetchMessagesOptions = {
  preferUnread?: boolean;
  scrollToBottom?: boolean;
};

type PendingImage = {
  id: string;
  file: File;
  previewUrl: string;
  name: string;
  size: number;
  type: string;
};

type PendingVideo = {
  id: string;
  file: File;
  previewUrl: string;
  name: string;
  size: number;
  type: string;
};

function formatTime(input: string) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatConversationTime(input: string) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "";

  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return d.toLocaleDateString([], { month: "short", day: "numeric" });
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

function resolveMediaUrl(url?: string) {
  if (!url) return "";
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("blob:") ||
    url.startsWith("data:")
  ) {
    return url;
  }
  return `${API_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

const isVideoAttachment = (att?: MessageAttachment | null) =>
  !!att && (att.type === "video" || (att.mimeType || "").startsWith("video/"));

const isImageAttachment = (att?: MessageAttachment | null) =>
  !!att && (att.type === "image" || (att.mimeType || "").startsWith("image/"));

function messagePreviewLabel(message: Pick<Message, "content" | "attachments" | "sharedGame">) {
  if (message.sharedGame?.gameId) return "Shared a game";
  const text = (message.content || "").trim();
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const videos = attachments.filter(isVideoAttachment).length;
  const images = attachments.filter(isImageAttachment).length;

  let label = "";
  if (videos > 0) label = videos > 1 ? `${videos} Videos` : "Video";
  else if (images > 0) label = images > 1 ? `${images} Photos` : "Photo";

  if (!label) return text;
  if (!text) return label;
  return `${text} · ${label}`;
}

export default function Messages() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const setUnreadCount = useMessageStore((state) => state.setUnreadCount);
  const refreshUnread = useMessageStore((state) => state.refreshUnread);
  const archiveConversationApi = useMessageStore((state) => state.archiveConversation);
  const deleteConversationApi = useMessageStore((state) => state.deleteConversation);
  const friends = useFriendStore((state) => state.friends);
  const loadFriends = useFriendStore((state) => state.loadAll);
  const socket = useFriendChallengeStore((state) => state.socket);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeChatId = searchParams.get("chat") || searchParams.get("to") || "";
  const presetName = searchParams.get("name") || "";

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState("");
  const [chatTab, setChatTab] = useState<"conversations" | "archived">("conversations");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const actionButtonRef = useRef<HTMLButtonElement | null>(null);
  const [pendingScroll, setPendingScroll] = useState<
    | { type: "message"; id: string }
    | { type: "bottom" }
    | null
  >(null);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<"archive" | "delete" | null>(null);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [pendingVideo, setPendingVideo] = useState<PendingVideo | null>(null);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const [viewer, setViewer] = useState<{ attachments: MessageAttachment[]; index: number } | null>(null);
  const totalPendingImageBytes = useMemo(
    () => pendingImages.reduce((sum, img) => sum + (img.size || 0), 0),
    [pendingImages],
  );

  const fetchConversations = useCallback(async () => {
    const res = await fetch(`${API_URL}/api/messages/conversations`, {
      credentials: "include",
    });
    if (!res.ok) return;
    const data = await res.json();
    const list: Conversation[] = Array.isArray(data.conversations)
      ? data.conversations
      : [];

    setConversations(list);

    const totalUnread = list.reduce((sum, c) => sum + (Number(c.unreadCount) || 0), 0);
    setUnreadCount(totalUnread);

    if (user?.id) {
      const autoUnarchive = list.filter((c) => {
        if (!isArchivedConversation(c)) return false;

        const unread = Number(c.unreadCount) || 0;
        const archivedAtTs = c.archivedAt ? new Date(c.archivedAt).getTime() : 0;
        const lastMessageAtTs = c.lastMessageAt ? new Date(c.lastMessageAt).getTime() : 0;
        const fromOther = String(c.lastSender || "") !== String(user.id);
        const newerThanArchive = archivedAtTs > 0 && lastMessageAtTs > archivedAtTs;

        return fromOther && (unread > 0 || newerThanArchive);
      });

      autoUnarchive.forEach((c) => {
        const partnerId = String(c.partnerId);
        void archiveConversationApi(partnerId, false).then((ok) => {
          if (ok) {
            setConversations((prev) =>
              prev.map((conv) =>
                conv.partnerId === partnerId
                  ? {
                      ...conv,
                      archived: false,
                      isArchived: false,
                      archivedAt: null,
                      folder: undefined,
                    }
                  : conv,
              ),
            );
          }
        });
      });
    }
  }, [archiveConversationApi, setUnreadCount, user?.id]);

  const fetchMessages = useCallback(
    async (partnerId: string, options: FetchMessagesOptions = {}) => {
      if (!partnerId) {
        setMessages([]);
        return;
      }

      const res = await fetch(`${API_URL}/api/messages/${partnerId}`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = await res.json();
      const list: Message[] = Array.isArray(data.messages) ? data.messages : [];
      setMessages(list);

      if (options.scrollToBottom) {
        setPendingScroll({ type: "bottom" });
      } else if (options.preferUnread) {
        const firstUnread = list.find(
          (m) => !m.read && m.receiver === user?.id,
        );
        if (firstUnread) {
          setPendingScroll({ type: "message", id: firstUnread._id });
        } else if (list.length > 0) {
          setPendingScroll({ type: "bottom" });
        }
      }

      await fetch(`${API_URL}/api/messages/read/${partnerId}`, {
        method: "PATCH",
        credentials: "include",
      })
        .then(() => {
          setConversations((prev) =>
            prev.map((c) =>
              c.partnerId === partnerId ? { ...c, unreadCount: 0 } : c,
            ),
          );
          return refreshUnread();
        })
        .catch(() => null);
    },
    [refreshUnread, user?.id],
  );

  useEffect(() => {
    fetchConversations()
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [fetchConversations]);

  useEffect(() => {
    if (friends.length === 0) {
      void loadFriends();
    }
  }, [friends.length, loadFriends]);

  useEffect(() => {
    if (!activeChatId) return;
    void fetchMessages(activeChatId, { preferUnread: true });
  }, [activeChatId, fetchMessages]);

  useEffect(() => {
    setError(null);
    setInfo(null);
  }, [activeChatId]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void fetchConversations();
      if (activeChatId) void fetchMessages(activeChatId, { preferUnread: false });
    }, 5000);
    return () => window.clearInterval(id);
  }, [activeChatId, fetchConversations, fetchMessages]);

  useEffect(() => {
    if (!socket) return;

    const handleIncoming = (payload: any) => {
      const normalized: Message = {
        _id: String(payload._id || payload.id || ""),
        sender: String(payload.sender || payload.fromUserId || ""),
        receiver: String(payload.receiver || payload.toUserId || ""),
        content: String(payload.content || payload.body || ""),
        attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
        sharedGame: payload.sharedGame || null,
        read: !!payload.read,
        status: payload.status || "delivered",
        createdAt: payload.createdAt || new Date().toISOString(),
      };

      const partnerId =
        normalized.sender === user?.id ? normalized.receiver : normalized.sender;
      if (!partnerId) return;

      const isReceiver = normalized.receiver === user?.id;
      let conversationExists = false;

      setConversations((prev) => {
        const preview = messagePreviewLabel(normalized);
        const exists = prev.some((c) => c.partnerId === partnerId);
        conversationExists = exists;
        if (!exists) return prev;
        return prev.map((c) => {
          if (c.partnerId !== partnerId) return c;
          const shouldIncrement = isReceiver && partnerId !== activeChatId;
          return {
            ...c,
            lastMessage: preview || c.lastMessage,
            lastAttachmentCount: normalized.attachments?.length || 0,
            lastMessageAt: normalized.createdAt || c.lastMessageAt,
            lastSender: normalized.sender,
            unreadCount: shouldIncrement ? (Number(c.unreadCount) || 0) + 1 : 0,
          };
        });
      });

      if (partnerId === activeChatId) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === normalized._id)) return prev;
          return [...prev, normalized];
        });
        setPendingScroll({ type: "bottom" });
        if (isReceiver) {
          void fetch(`${API_URL}/api/messages/read/${partnerId}`, {
            method: "PATCH",
            credentials: "include",
          }).catch(() => null);
          setConversations((prev) =>
            prev.map((c) => (c.partnerId === partnerId ? { ...c, unreadCount: 0 } : c)),
          );
          void refreshUnread();
        }
      } else if (isReceiver) {
        void refreshUnread();
      }

      // If conversation is missing locally, refresh the list to surface it.
      if (!conversationExists) {
        void fetchConversations();
      }
    };

    socket.on("message:new", handleIncoming);
    return () => {
      socket.off("message:new", handleIncoming);
    };
  }, [socket, activeChatId, user?.id, refreshUnread, fetchConversations]);

  useEffect(() => {
    if (!actionMenuOpen && !deleteConfirmOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideMenu = actionMenuRef.current?.contains(target);
      const insideButton = actionButtonRef.current?.contains(target);
      if (actionMenuOpen && !insideMenu && !insideButton) {
        setActionMenuOpen(false);
      }
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (actionMenuOpen) setActionMenuOpen(false);
        if (deleteConfirmOpen) setDeleteConfirmOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [actionMenuOpen, deleteConfirmOpen]);

  useEffect(() => {
    if (!pendingScroll) return;
    const container = messageListRef.current;
    if (!container) return;

    const scrollToTarget = () => {
      if (pendingScroll.type === "message") {
        const el = document.getElementById(`message-${pendingScroll.id}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          setPendingScroll(null);
          return;
        }
      }

      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      setPendingScroll(null);
    };

    const animation = window.requestAnimationFrame(scrollToTarget);
    const fallback = window.setTimeout(scrollToTarget, 120);
    return () => {
      window.cancelAnimationFrame(animation);
      window.clearTimeout(fallback);
    };
  }, [pendingScroll, messages]);

  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [conversations]);

  const pickFallbackConversation = useCallback(
    (list: Conversation[], excludeId?: string) => {
      const ordered = [...list]
        .filter((c) => !excludeId || c.partnerId !== excludeId)
        .sort((a, b) => {
          const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
          const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
          return bTime - aTime;
        });

      const nextActive = ordered.find((c) => !isArchivedConversation(c));
      return nextActive || ordered[0] || null;
    },
    [],
  );

  const unreadConversations = useMemo(
    () => sortedConversations.filter((c) => (Number(c.unreadCount) || 0) > 0),
    [sortedConversations],
  );

  const friendPresenceMap = useMemo(() => {
    const map = new Map<string, { status: PresenceStatus; lastActiveAt: string | null }>();
    friends.forEach((f) => {
      const status =
        f.presenceStatus === "in_game" ||
        f.presenceStatus === "searching_match" ||
        f.presenceStatus === "away" ||
        f.presenceStatus === "online"
          ? (f.presenceStatus as PresenceStatus)
          : "offline";
      map.set(f.id, {
        status,
        lastActiveAt: f.lastActiveAt ?? null,
      });
    });
    return map;
  }, [friends]);

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedConversations;
    return sortedConversations.filter((c) =>
      c.partnerName.toLowerCase().includes(q),
    );
  }, [sortedConversations, search]);

  const tabbedConversations = useMemo(() => {
    const active = filteredConversations.filter((conversation) => !isArchivedConversation(conversation));
    const archived = filteredConversations.filter((conversation) => isArchivedConversation(conversation));
    return { active, archived };
  }, [filteredConversations]);

  const activeConversation = conversations.find((c) => c.partnerId === activeChatId);
  const activeConversationArchived = activeConversation ? isArchivedConversation(activeConversation) : false;
  const visibleConversations = chatTab === "archived" ? tabbedConversations.archived : tabbedConversations.active;
  const hasConversations = sortedConversations.length > 0;

  useEffect(() => {
    if (!activeConversation) return;
    const nextTab = isArchivedConversation(activeConversation) ? "archived" : "conversations";
    setChatTab((prev) => (prev === nextTab ? prev : nextTab));
  }, [activeConversation]);

  useEffect(() => {
    if (loading) return;
    if (!activeChatId) return;
    if (activeConversation) return;

    const isFriendTarget = friends.some((f) => f.id === activeChatId);
    const hasPresetName = Boolean(presetName);
    if (isFriendTarget || hasPresetName) {
      // Allow starting or reviving a conversation even if it isn't in the list yet.
      return;
    }

    const fallback = pickFallbackConversation(conversations, activeChatId);
    if (fallback?.partnerId) {
      setSearchParams({ chat: fallback.partnerId });
      setChatTab(isArchivedConversation(fallback) ? "archived" : "conversations");
    } else {
      setSearchParams({});
      setChatTab("conversations");
    }
  }, [activeChatId, activeConversation, conversations, friends, loading, pickFallbackConversation, presetName, setSearchParams]);

  // When there is no active chat selected, automatically open the most recent conversation (prefer non-archived).
  useEffect(() => {
    if (loading) return;
    if (activeChatId) return;

    const next =
      unreadConversations[0] ||
      tabbedConversations.active[0] ||
      tabbedConversations.archived[0] ||
      null;
    if (next?.partnerId) {
      setSearchParams({ chat: next.partnerId });
    }
  }, [loading, activeChatId, tabbedConversations, unreadConversations, setSearchParams]);

  useEffect(
    () => () => {
      pendingImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      if (pendingVideo) URL.revokeObjectURL(pendingVideo.previewUrl);
    },
    [pendingImages, pendingVideo],
  );

  const handleImageSelection = useCallback(
    (list: FileList | null) => {
      if (!list) return;
      const files = Array.from(list);
      if (files.length === 0) return;

      if (pendingVideo) {
        setError("Remove the selected video before adding images.");
        return;
      }

      const availableSlots = Math.max(0, MAX_ATTACHMENTS - pendingImages.length);
      if (availableSlots <= 0) {
        setError(`You can attach up to ${MAX_ATTACHMENTS} images per message.`);
        return;
      }

      const accepted: PendingImage[] = [];
      const rejected: string[] = [];

      files.slice(0, availableSlots).forEach((file) => {
        if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
          rejected.push(`${file.name} is not a supported image type.`);
          return;
        }
        if (file.size > MAX_IMAGE_BYTES) {
          rejected.push(`${file.name} is too large (max 8MB).`);
          return;
        }

        accepted.push({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          file,
          previewUrl: URL.createObjectURL(file),
          name: file.name,
          size: file.size,
          type: file.type,
        });
      });

      const combined = [...pendingImages, ...accepted];
      const combinedSize = combined.reduce((sum, img) => sum + img.size, 0);
      if (combinedSize > MAX_TOTAL_IMAGE_BYTES) {
        accepted.forEach((img) => URL.revokeObjectURL(img.previewUrl));
        setError(
          `Images exceed the ${Math.round(MAX_TOTAL_IMAGE_BYTES / (1024 * 1024))}MB total limit.`,
        );
        return;
      }

      if (accepted.length > 0) {
        setPendingImages(combined);
        setInfo(null);
      }

      if (files.length > availableSlots) {
        setInfo(`Only ${availableSlots} more image(s) can be attached.`);
      }

      if (rejected.length > 0) {
        setError(rejected[0]);
      } else if (accepted.length > 0) {
        setError(null);
      }
    },
    [pendingImages, pendingVideo],
  );

  const removePendingImage = useCallback((id: string) => {
    setPendingImages((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((img) => img.id !== id);
    });
  }, []);

  const clearPendingImages = useCallback(() => {
    setPendingImages((prev) => {
      prev.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      return [];
    });
    setInfo(null);
    setError(null);
  }, []);

  const clearPendingVideo = useCallback(() => {
    setPendingVideo((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setInfo(null);
    setError(null);
  }, []);

  const handleVideoSelection = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      const file = list[0];

      if (pendingImages.length > 0) {
        setError("Remove selected images before attaching a video.");
        return;
      }

      if (!ACCEPTED_VIDEO_TYPES.includes(file.type)) {
        setError("Unsupported video format. Use mp4, webm, or mov.");
        return;
      }

      if (file.size > MAX_VIDEO_BYTES) {
        setError(`Video is too large (max ${Math.round(MAX_VIDEO_BYTES / (1024 * 1024))}MB).`);
        return;
      }

      setPendingVideo((prev) => {
        if (prev) URL.revokeObjectURL(prev.previewUrl);
        return {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          file,
          previewUrl: URL.createObjectURL(file),
          name: file.name,
          size: file.size,
          type: file.type,
        };
      });
      setInfo(null);
      setError(null);
    },
    [pendingImages],
  );

  useEffect(() => {
    clearPendingImages();
    clearPendingVideo();
  }, [activeChatId, clearPendingImages, clearPendingVideo]);

  const stepViewer = useCallback((direction: 1 | -1) => {
    setViewer((prev) => {
      if (!prev) return prev;
      const count = prev.attachments.length;
      if (count === 0) return null;
      const nextIndex = (prev.index + direction + count) % count;
      return { ...prev, index: nextIndex };
    });
  }, []);

  const closeViewer = useCallback(() => setViewer(null), []);

  const renderAttachmentGrid = (
    attachments: MessageAttachment[] = [],
    messageId: string,
    mine: boolean,
  ) => {
    if (!attachments || attachments.length === 0) return null;

    const videos = attachments.filter(isVideoAttachment);
    const images = attachments.filter((att) => !isVideoAttachment(att));
    const containerTint = mine
      ? "border-white/10 bg-white/5"
      : "border-[#1f2d45] bg-[#0d1729]/80";

    const videoBlock =
      videos.length > 0 ? (
        <div className={`mt-2 rounded-xl border ${containerTint} p-2`}>
          <div className="relative overflow-hidden rounded-lg bg-[#0b1424] shadow-[0_10px_26px_rgba(0,0,0,0.28)]">
            <video
              key={`${messageId}-video`}
              src={resolveMediaUrl(videos[0].url)}
              poster={videos[0].thumbnail ? resolveMediaUrl(videos[0].thumbnail || "") : undefined}
              controls
              preload="metadata"
              className="h-full max-h-[360px] w-full rounded-lg bg-black/60 object-contain"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setViewer({ attachments, index: attachments.indexOf(videos[0]) });
              }}
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 via-black/15 to-transparent" />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-[12px] text-slate-200/90">
            <span className="truncate">{videos[0].filename || "Video"}</span>
            <span className="text-slate-400">{formatBytes(videos[0].size || 0)}</span>
          </div>
        </div>
      ) : null;

    const imageBlock =
      images.length > 0 ? (
        <div className={`mt-2 rounded-xl border ${containerTint} p-2`}>
          {(() => {
            const count = images.length;
            const display = count > 5 ? images.slice(0, 5) : images;
            const extra = count - display.length;
            const gridCols = (() => {
              if (count === 1) return "grid-cols-1";
              if (count === 2) return "grid-cols-2";
              if (count === 3) return "grid-cols-2 grid-rows-2";
              if (count === 4) return "grid-cols-2";
              return "grid-cols-3";
            })();

            return (
              <div className={`grid ${gridCols} gap-2`}>
                {display.map((att, idx) => {
                  const originalIndex = attachments.indexOf(att);
                  const isOverlay = extra > 0 && idx === display.length - 1;
                  const layoutClass =
                    count === 1
                      ? "aspect-[4/3] md:aspect-[16/10]"
                      : count === 3 && idx === 0
                        ? "row-span-2 aspect-[3/4] md:aspect-[2/3]"
                        : count >= 3
                          ? "aspect-square"
                          : "aspect-[4/3]";

                  return (
                    <button
                      type="button"
                      key={`${messageId}-att-${idx}`}
                      onClick={() => setViewer({ attachments, index: originalIndex })}
                      className={`group relative overflow-hidden rounded-xl ${layoutClass} shadow-[0_10px_26px_rgba(0,0,0,0.28)]`}
                    >
                      <img
                        src={resolveMediaUrl(att.url)}
                        alt={att.filename || "attachment"}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                      {isOverlay && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-lg font-semibold text-white backdrop-blur-sm">
                          +{extra}
                        </div>
                      )}
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-black/10 to-black/30 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </div>
      ) : null;

    if (videoBlock && imageBlock) {
      return (
        <div className="space-y-3">
          {videoBlock}
          {imageBlock}
        </div>
      );
    }

    return videoBlock || imageBlock;
  };

  const sendMessage = async () => {
    if (sending) return;
    if (activeConversationArchived) {
      setInfo(t("messages.archivedReadOnly", "This conversation is archived. Unarchive to reply."));
      return;
    }

    const content = draft.trim();
    const hasImages = pendingImages.length > 0;
    const hasVideo = !!pendingVideo;
    if (!activeChatId) return;
    if (!content && !hasImages && !hasVideo) return;

    // Detect /gameN command (only when no attachments and full message matches)
    const gameCommandMatch = content.match(/^\/game(\d+)$/i);
    if (gameCommandMatch && !hasImages && !hasVideo) {
      const gameIndex = parseInt(gameCommandMatch[1], 10);
      if (!Number.isFinite(gameIndex) || gameIndex < 1) {
        setError("Invalid game number. Use /game1, /game2, etc.");
        return;
      }

      setError(null);
      setInfo(null);
      setSending(true);

      try {
        const res = await fetch(`${API_URL}/api/messages/share-game`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            receiverId: activeChatId,
            gameIndex,
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || "Failed to share game.");
          return;
        }

        setDraft("");
        setPendingScroll({ type: "bottom" });

        await Promise.all([
          fetchConversations(),
          fetchMessages(activeChatId, { scrollToBottom: true }),
        ]);
      } catch {
        setError("Failed to share game. Please try again.");
      } finally {
        setSending(false);
      }
      return;
    }
    if (hasImages && hasVideo) {
      setError("Send either images or one video per message.");
      return;
    }

    setError(null);
    setInfo(null);
    setSending(true);

    try {
      let res: Response;
      if (hasImages || hasVideo) {
        const form = new FormData();
        form.append("receiverId", activeChatId);
        form.append("content", content);
        pendingImages.forEach((img) => form.append("attachments", img.file, img.name));
        if (pendingVideo) {
          form.append("attachments", pendingVideo.file, pendingVideo.name);
        }

        res = await fetch(`${API_URL}/api/messages`, {
          method: "POST",
          credentials: "include",
          body: form,
        });
      } else {
        res = await fetch(`${API_URL}/api/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ receiverId: activeChatId, content }),
        });
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || t("messages.errors.send", "Failed to send message."));
        return;
      }

      setDraft("");
      clearPendingImages();
      clearPendingVideo();
      setPendingScroll({ type: "bottom" });

      await Promise.all([
        fetchConversations(),
        fetchMessages(activeChatId, { scrollToBottom: true }),
      ]);
    } catch (err) {
      console.error(err);
      setError(t("messages.errors.send", "Failed to send message."));
    } finally {
      setSending(false);
    }
  };

  const handleArchiveConversation = async () => {
    await handleArchiveToggle(true);
  };

  const handleUnarchiveConversation = async () => {
    await handleArchiveToggle(false);
  };

  const handleArchiveToggle = async (shouldArchive: boolean) => {
    if (!activeChatId) return;
    setActionMenuOpen(false);
    setActionLoading("archive");
    setError(null);
    setInfo(null);

    const ok = await archiveConversationApi(activeChatId, shouldArchive);
    setActionLoading(null);

    if (!ok) {
      setError(
        shouldArchive
          ? t("messages.errors.archive", "Unable to archive this conversation right now.")
          : t("messages.errors.unarchive", "Unable to unarchive this conversation right now."),
      );
      return;
    }

    setConversations((prev) =>
      prev.map((c) =>
        c.partnerId === activeChatId
          ? {
              ...c,
              archived: shouldArchive,
              isArchived: shouldArchive,
              archivedAt: shouldArchive ? new Date().toISOString() : null,
              folder: shouldArchive ? "archived" : undefined,
            }
          : c,
      ),
    );

    if (shouldArchive) {
      setChatTab("archived");
      setInfo(t("messages.archived", "Conversation moved to Archived."));
    } else {
      setChatTab("conversations");
      setInfo(t("messages.unarchived", "Conversation restored to Conversations."));
    }
  };

  const handleDeleteRequest = () => {
    setActionMenuOpen(false);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!activeChatId) {
      setDeleteConfirmOpen(false);
      return;
    }

    setActionLoading("delete");
    setError(null);
    setInfo(null);

    const ok = await deleteConversationApi(activeChatId);
    setActionLoading(null);
    setDeleteConfirmOpen(false);

    if (!ok) {
      setError(t("messages.errors.delete", "Unable to delete this conversation right now."));
      return;
    }

    const nextList = conversations.filter((c) => c.partnerId !== activeChatId);
    setConversations(nextList);
    setMessages([]);

    const fallback = pickFallbackConversation(nextList, activeChatId);
    if (fallback?.partnerId) {
      setSearchParams({ chat: fallback.partnerId });
      setChatTab(isArchivedConversation(fallback) ? "archived" : "conversations");
    } else {
      setSearchParams({});
      setChatTab("conversations");
    }
  };

  const activeTitle = activeConversation?.partnerName || presetName || t("messages.conversation", "Conversation");
  const activePresence = activeChatId ? friendPresenceMap.get(activeChatId) : null;
  const activePresenceStatus: PresenceStatus = activePresence?.status || "offline";
  const activeStatus = presenceText(activePresenceStatus, activePresence?.lastActiveAt || null);

  return (
    <div className="min-h-screen h-screen bg-[#060b16] text-slate-100 flex transition-colors duration-300">
      <Sidebar />

      <div className="flex-1 ml-[60px] md:ml-72 grid h-screen min-h-0 grid-cols-12 overflow-hidden">
        <aside className="col-span-4 min-w-0 min-h-0 overflow-y-auto premium-scrollbar border-r border-[#1b2740] bg-[#0d1525]/92 backdrop-blur-xl">
          <div className="sticky top-0 z-20 bg-[#101a2d]/92 p-5 backdrop-blur-xl">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("messages.search", "Search conversations")}
                className="w-full rounded-xl border border-[#25344e] bg-[#0c1629]/90 py-2.5 pl-10 pr-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-all focus:border-brand-400/80 focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
          </div>

          <div className="p-4 pt-0">
            <section className="overflow-hidden rounded-xl border border-[#25344e] bg-[#0c1629]/60 shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
              <div className="flex border-b border-[#25344e] bg-[#0c1629]/65">
                <button
                  type="button"
                  onClick={() => setChatTab("conversations")}
                  className={`flex flex-1 items-center justify-between gap-2 border-r border-[#25344e] px-4 py-3 text-[12px] font-semibold leading-4 transition-all ${
                    chatTab === "conversations"
                      ? "relative -mb-px border-b border-[#0c1629] bg-[#0c1629] text-brand-300 shadow-[inset_0_1px_0_rgba(37,52,78,0.8)]"
                      : "border-b border-[#25344e] bg-[#0c1629]/40 text-slate-400 hover:bg-[#13223a]/65 hover:text-slate-200"
                  }`}
                >
                  <span>{t("messages.tabConversations", "Conversations")}</span>
                  <span
                    className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] ${
                      chatTab === "conversations"
                        ? "bg-brand-500/15 text-brand-200"
                        : "bg-[#1b2d45] text-slate-300"
                    }`}
                  >
                    {tabbedConversations.active.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setChatTab("archived")}
                  className={`flex flex-1 items-center justify-between gap-2 border-l border-[#25344e] px-4 py-3 text-[12px] font-semibold leading-4 transition-all ${
                    chatTab === "archived"
                      ? "relative -mb-px border-b border-[#0c1629] bg-[#0c1629] text-brand-300 shadow-[inset_0_1px_0_rgba(37,52,78,0.8)]"
                      : "border-b border-[#25344e] bg-[#0c1629]/40 text-slate-400 hover:bg-[#13223a]/65 hover:text-slate-200"
                  }`}
                >
                  <span>{t("messages.tabArchived", "Archived")}</span>
                  <span
                    className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] ${
                      chatTab === "archived"
                        ? "bg-brand-500/15 text-brand-200"
                        : "bg-[#1b2d45] text-slate-300"
                    }`}
                  >
                    {tabbedConversations.archived.length}
                  </span>
                </button>
              </div>

              <div className="p-3">
                {loading ? (
                  <div className="rounded-xl border border-dashed border-[#27354f] bg-[#0f192b]/65 px-3 py-4 text-center text-xs text-slate-500">
                    {t("messages.loading", "Loading conversations...")}
                  </div>
                ) : visibleConversations.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#27354f] bg-[#0f192b]/65 px-3 py-4 text-center text-xs text-slate-500">
                  {chatTab === "archived"
                    ? t("messages.archivedEmpty", "No archived chats.")
                    : t("messages.conversationsEmpty", "No conversations yet.")}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {visibleConversations.map((c) => {
                    const selected = activeChatId === c.partnerId;
                    const presence = friendPresenceMap.get(c.partnerId);
                    const presenceStatus: PresenceStatus = presence?.status || "offline";
                    const presenceLabel = presenceText(presenceStatus, presence?.lastActiveAt || null);
                    return (
                      <button
                        key={c.partnerId}
                        onClick={() => setSearchParams({ chat: c.partnerId })}
                        className={`group w-full rounded-[14px] border px-3 py-2.5 text-left transition-all duration-200 ${
                          selected
                            ? "border-brand-400/45 bg-[#10253a]/95 shadow-[inset_0_0_0_1px_rgba(45,212,191,0.12),0_8px_18px_rgba(8,145,178,0.12)]"
                            : "border-[#24334d]/45 bg-[#0d1729]/72 hover:border-[#314664] hover:bg-[#111e32]/90"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="relative h-9 w-9 shrink-0 rounded-full bg-[#1a2940] text-xs font-semibold text-slate-100 ring-1 ring-[#2a3a57]">
                            {c.partnerAvatar ? (
                              <img
                                src={c.partnerAvatar}
                                alt={c.partnerName}
                                className="h-full w-full rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                {getInitials(c.partnerName)}
                              </div>
                            )}
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-[#0f1828] ${
                                presenceDotClass(presenceStatus)
                              }`}
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <span className="truncate pr-1 text-[15px] font-semibold leading-5 text-slate-100">
                                {c.partnerName}
                              </span>
                              <span className="shrink-0 pt-0.5 text-[11px] leading-4 text-slate-500">
                                {formatConversationTime(c.lastMessageAt)}
                              </span>
                            </div>
                            <div className="mt-0.5 flex items-center justify-between gap-2">
                              <span className="truncate text-[12px] leading-4 text-slate-400">
                                {c.lastMessage || t("messages.noMessages", "No messages yet.")}
                              </span>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="inline-flex items-center gap-1 text-[11px] leading-4 text-slate-400">
                                  <span
                                    className={`h-2 w-2 rounded-full ${presenceDotClass(
                                      presenceStatus,
                                    )}`}
                                  />
                                  <span className="truncate max-w-[110px]">{presenceLabel}</span>
                                </span>
                                {c.unreadCount > 0 && (
                                  <span className="inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[10px] font-semibold text-white">
                                    {c.unreadCount > 99 ? "99+" : c.unreadCount}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                )}
              </div>
            </section>
          </div>
        </aside>

        <section className="col-span-8 min-w-0 min-h-0 flex flex-col overflow-hidden bg-[#08101d]/85">
          {!activeChatId ? (
            loading ? (
              <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
                {t("messages.loadingConversation", "Loading conversations...")}
              </div>
            ) : hasConversations ? (
              <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
                {t("messages.openingLatest", "Opening your latest conversation...")}
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8">
                <div className="w-full max-w-md rounded-3xl border border-[#26344c] bg-[#101a2d]/88 p-8 text-center shadow-[0_28px_52px_rgba(0,0,0,0.3)]">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-brand-400/30 bg-brand-500/10 text-brand-300">
                    <MessageSquare className="h-8 w-8" />
                  </div>
                  <h3 className="text-xl font-semibold tracking-tight text-slate-100">
                    {t("messages.emptyTitle", "No conversations")}
                  </h3>
                  <p className="mx-auto mt-2 max-w-xs text-sm text-slate-400">
                    {t("messages.emptySubtitle", "Choose a player from your list to start a focused, real-time chat.")}
                  </p>
                </div>
              </div>
            )
          ) : (
            <>
              <header className="flex shrink-0 items-center justify-between border-b border-[#1f2c45] bg-[#111b2f]/94 px-5 py-3.5 backdrop-blur-xl">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="relative h-11 w-11 shrink-0 rounded-full bg-[#1a2940] ring-1 ring-[#2a3a57]">
                    {activeConversation?.partnerAvatar ? (
                      <img
                        src={activeConversation.partnerAvatar}
                        alt={activeTitle}
                        className="h-full w-full rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-slate-100">
                        {getInitials(activeTitle)}
                      </div>
                    )}
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#111b2f] ${presenceDotClass(
                        activePresenceStatus,
                      )}`}
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-slate-100">{activeTitle}</div>
                    <div className="truncate text-xs text-slate-400">
                      <span className="truncate">{activeStatus}</span>
                    </div>
                  </div>
                </div>

                <div className="relative flex items-center gap-1.5">
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#2a3a57] bg-[#152238] text-slate-400 transition-colors hover:text-brand-300 hover:bg-brand-500/10"
                  >
                    <Swords className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    ref={actionButtonRef}
                    aria-expanded={actionMenuOpen}
                    onClick={() => setActionMenuOpen((v) => !v)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#2a3a57] bg-[#152238] text-slate-300 transition-colors hover:text-slate-100 hover:bg-[#1b2a41] focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>

                  {actionMenuOpen && (
                    <div
                      ref={actionMenuRef}
                      className="absolute right-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-xl border border-[#22334f] bg-[#0b1323]/95 shadow-[0_18px_38px_rgba(0,0,0,0.45)] backdrop-blur-xl ring-1 ring-black/30"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          void (activeConversationArchived ? handleUnarchiveConversation() : handleArchiveConversation())
                        }
                        disabled={actionLoading === "archive"}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm text-slate-100 transition-colors hover:bg-[#13223a] focus:bg-[#13223a] disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        <span className="inline-flex items-center gap-2">
                          {activeConversationArchived ? (
                            <ArchiveRestore className="h-4 w-4 text-slate-300" />
                          ) : (
                            <Archive className="h-4 w-4 text-slate-300" />
                          )}
                          {activeConversationArchived
                            ? t("messages.unarchive", "Unarchive")
                            : t("messages.archive", "Archive")}
                        </span>
                        {actionLoading === "archive" && (
                          <span className="text-[11px] text-brand-300">{t("messages.action", "Working...")}</span>
                        )}
                      </button>
                      <div className="h-px bg-gradient-to-r from-transparent via-[#243556] to-transparent" />
                      <button
                        type="button"
                        onClick={handleDeleteRequest}
                        disabled={actionLoading === "delete"}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm text-rose-200 transition-colors hover:bg-[#1d1523] focus:bg-[#1d1523] disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        <span className="inline-flex items-center gap-2">
                          <Trash2 className="h-4 w-4 text-rose-300" />
                          {t("messages.delete", "Delete")}
                        </span>
                        {actionLoading === "delete" && (
                          <span className="text-[11px] text-rose-200">{t("messages.action", "Working...")}</span>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </header>

              <div
                ref={messageListRef}
                className="flex-1 min-h-0 overflow-y-auto premium-scrollbar px-5 py-4"
              >
                {info && !activeConversationArchived && (
                  <div className="mb-3 rounded-xl border border-brand-500/30 bg-brand-500/12 px-3 py-2 text-xs font-medium text-brand-300">
                    {info}
                  </div>
                )}
                {error && (
                  <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300">
                    {error}
                  </div>
                )}

                {messages.length === 0 ? (
                  <div className="flex h-full min-h-[260px] items-center justify-center">
                    <div className="rounded-2xl border border-dashed border-[#27354f] bg-[#0f192b]/65 px-6 py-8 text-center">
                      <Clock3 className="mx-auto mb-2 h-6 w-6 text-slate-500" />
                      <p className="text-sm text-slate-300">
                        {t("messages.startConversation", "No messages yet. Start the conversation.")}
                      </p>
                    </div>
                  </div>
                ) : (
                  messages.map((m, index) => {
                    const mine = m.sender === user?.id;
                    const previous = messages[index - 1];
                    const grouped = previous && previous.sender === m.sender;
                    const spacing = index === 0 ? "mt-0" : grouped ? "mt-1.5" : "mt-4";
                    const attachments = Array.isArray(m.attachments) ? m.attachments : [];
                    const hasAttachments = attachments.length > 0;
                    const hasText = Boolean(m.content && m.content.trim().length > 0);
                    const hasSharedGame = !!(m.sharedGame?.gameId);

                    return (
                      <div
                        key={m._id}
                        id={`message-${m._id}`}
                        className={`flex ${mine ? "justify-end" : "justify-start"} ${spacing}`}
                      >
                        <div
                          className={`max-w-[76%] rounded-2xl text-sm leading-relaxed ${
                            mine
                              ? "rounded-br-md bg-gradient-to-br from-brand-500 to-cyan-500 text-white shadow-[0_10px_24px_rgba(20,184,166,0.28)]"
                              : "rounded-bl-md border border-[#27354f] bg-[#132036] text-slate-100 shadow-[0_8px_20px_rgba(0,0,0,0.22)]"
                          } ${
                            hasAttachments || hasSharedGame ? "px-3 py-3" : "px-4 py-2.5"
                          }`}
                        >
                          {hasText && (
                            <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                              {m.content}
                            </div>
                          )}
                          {hasSharedGame && (() => {
                            const sg = m.sharedGame!;
                            const gameResultText =
                              sg.result === "1-0" ? "White wins" : sg.result === "0-1" ? "Black wins" : sg.result === "1/2-1/2" ? "Draw" : sg.result || "—";
                            const resultAccent =
                              sg.result === "1-0" || sg.result === "0-1" ? "text-brand-300" : "text-amber-300";
                            const variant = sg.variant === "chess960" ? "960" : "";
                            const analyzeUrl = sg.variant === "chess960" ? `/analyze960/${sg.gameId}` : `/analyze/${sg.gameId}`;
                            const cardBg = mine
                              ? "border-white/20 bg-white/10 hover:bg-white/15"
                              : "border-[#25344e] bg-[#0b1424]/80 hover:bg-[#0f1a2e]/90";

                            return (
                              <Link
                                to={analyzeUrl}
                                className={`mt-1 block rounded-xl border ${cardBg} p-3 transition-colors cursor-pointer group`}
                              >
                                <div className="flex items-start gap-3">
                                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${mine ? "bg-white/15 text-white" : "bg-brand-500/10 text-brand-400"}`}>
                                    <Crown className="h-4.5 w-4.5" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 text-[13px] font-semibold">
                                      <span className={mine ? "text-white" : "text-slate-100"}>{sg.white}</span>
                                      {sg.whiteElo != null && <span className={`text-[11px] font-normal ${mine ? "text-cyan-100/70" : "text-slate-500"}`}>({sg.whiteElo})</span>}
                                      <span className={mine ? "text-cyan-100/60" : "text-slate-500"}>vs</span>
                                      <span className={mine ? "text-white" : "text-slate-100"}>{sg.black}</span>
                                      {sg.blackElo != null && <span className={`text-[11px] font-normal ${mine ? "text-cyan-100/70" : "text-slate-500"}`}>({sg.blackElo})</span>}
                                    </div>
                                    <div className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] ${mine ? "text-cyan-100/75" : "text-slate-400"}`}>
                                      <span className={`font-semibold ${mine ? resultAccent : resultAccent}`}>{gameResultText}</span>
                                      {sg.timeControl && (
                                        <>
                                          <span className={mine ? "text-cyan-100/40" : "text-slate-600"}>·</span>
                                          <span>{sg.timeControl}{variant && ` ${variant}`}</span>
                                        </>
                                      )}
                                      {sg.eco && (
                                        <>
                                          <span className={mine ? "text-cyan-100/40" : "text-slate-600"}>·</span>
                                          <span>{sg.eco}</span>
                                        </>
                                      )}
                                      {sg.moves != null && sg.moves > 0 && (
                                        <>
                                          <span className={mine ? "text-cyan-100/40" : "text-slate-600"}>·</span>
                                          <span>{sg.moves} moves</span>
                                        </>
                                      )}
                                      {sg.rated && (
                                        <>
                                          <span className={mine ? "text-cyan-100/40" : "text-slate-600"}>·</span>
                                          <span>Rated</span>
                                        </>
                                      )}
                                    </div>
                                    <div className={`mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium ${mine ? "text-white/80 group-hover:text-white" : "text-brand-400/80 group-hover:text-brand-300"} transition-colors`}>
                                      <ExternalLink className="h-3 w-3" />
                                      View Game
                                    </div>
                                  </div>
                                </div>
                              </Link>
                            );
                          })()}
                          {hasAttachments && renderAttachmentGrid(attachments, m._id, mine)}
                          <div
                            className={`mt-1.5 inline-flex items-center gap-1 text-[10px] ${
                              mine ? "text-cyan-100/90" : "text-slate-400"
                            }`}
                          >
                            {formatTime(m.createdAt)}
                            {mine && m.read && <Check className="h-3 w-3" />}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {activeConversationArchived ? (
                <div className="shrink-0 border-t border-[#1f2c45] bg-[#0f182a]/95 px-4 py-3 backdrop-blur-xl">
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#27354f] bg-[#121e31]/92 px-3 py-3">
                    <div className="text-sm text-slate-200">
                      {t("messages.archivedReadOnly", "This conversation is archived. Unarchive to reply.")}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleUnarchiveConversation()}
                      disabled={actionLoading === "archive"}
                      className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(13,148,136,0.35)] transition-all hover:bg-brand-500 disabled:cursor-not-allowed disabled:bg-[#1e2a40] disabled:text-slate-500 disabled:shadow-none"
                    >
                      <ArchiveRestore className="h-4 w-4" />
                      <span>{t("messages.unarchive", "Unarchive")}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="shrink-0 border-t border-[#1f2c45] bg-[#0f182a]/95 px-4 py-3 backdrop-blur-xl">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={ACCEPTED_IMAGE_TYPES.join(",")}
                    className="hidden"
                    onChange={(e) => {
                      handleImageSelection(e.target.files);
                      if (e.target) e.target.value = "";
                    }}
                  />
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept={ACCEPTED_VIDEO_TYPES.join(",")}
                    className="hidden"
                    onChange={(e) => {
                      handleVideoSelection(e.target.files);
                      if (e.target) e.target.value = "";
                    }}
                  />

                  {pendingVideo && (
                    <div className="mb-2 rounded-2xl border border-[#27354f] bg-[#0f1829]/92 px-3 py-3">
                      <div className="mb-2 flex items-center justify-between text-[12px] text-slate-200">
                        <span className="inline-flex items-center gap-2">
                          <Video className="h-4 w-4 text-brand-300" />
                          <span>1 video selected · {formatBytes(pendingVideo.size)}</span>
                        </span>
                        <button
                          type="button"
                          onClick={clearPendingVideo}
                          className="rounded-lg px-2 py-1 text-[11px] text-slate-300 transition-colors hover:bg-[#18273f] hover:text-white"
                        >
                          {t("messages.clearAttachments", "Remove all")}
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="relative h-24 w-40 overflow-hidden rounded-xl border border-[#23334f] bg-[#0b1424] shadow-[0_10px_24px_rgba(0,0,0,0.28)]">
                          <video
                            src={pendingVideo.previewUrl}
                            className="h-full w-full object-cover"
                            controls
                            muted
                          />
                          <button
                            type="button"
                            onClick={clearPendingVideo}
                            className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white opacity-80 transition hover:opacity-100"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                          <span className="absolute bottom-1 left-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-slate-100">
                            {formatBytes(pendingVideo.size)}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1 text-[12px] text-slate-200">
                          <div className="truncate font-medium">{pendingVideo.name}</div>
                          <div className="text-slate-400">{pendingVideo.type}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {pendingImages.length > 0 && (
                    <div className="mb-2 rounded-2xl border border-[#27354f] bg-[#0f1829]/92 px-3 py-3">
                      <div className="mb-2 flex items-center justify-between text-[12px] text-slate-200">
                        <span className="inline-flex items-center gap-2">
                          <ImageIcon className="h-4 w-4 text-brand-300" />
                          <span>
                            {pendingImages.length}{" "}
                            {pendingImages.length === 1 ? "image selected" : "images selected"} -{" "}
                            {formatBytes(totalPendingImageBytes)}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={clearPendingImages}
                          className="rounded-lg px-2 py-1 text-[11px] text-slate-300 transition-colors hover:bg-[#18273f] hover:text-white"
                        >
                          {t("messages.clearAttachments", "Remove all")}
                        </button>
                      </div>
                      <div
                        className={`grid gap-2 ${
                          pendingImages.length > 3 ? "grid-cols-3 md:grid-cols-4" : "grid-cols-2 md:grid-cols-3"
                        }`}
                      >
                        {pendingImages.map((img) => (
                          <div
                            key={img.id}
                            className="group relative overflow-hidden rounded-lg border border-[#23334f] bg-[#0b1424]"
                          >
                            <img
                              src={img.previewUrl}
                              alt={img.name}
                              className="h-24 w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                            />
                            <button
                              type="button"
                              onClick={() => removePendingImage(img.id)}
                              className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white opacity-80 transition hover:opacity-100"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                            <span className="absolute bottom-1 left-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-slate-100">
                              {formatBytes(img.size)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* /gameN command hint */}
                  {/^\/game\d*$/i.test(draft.trim()) && !pendingImages.length && !pendingVideo && (
                    <div className="mb-2 flex items-center gap-2 rounded-xl border border-brand-500/20 bg-brand-500/5 px-3 py-2">
                      <Crown className="h-4 w-4 shrink-0 text-brand-400" />
                      <span className="text-xs text-brand-300/90">
                        Type <span className="font-mono font-semibold">/game1</span>, <span className="font-mono font-semibold">/game2</span>, etc. to share a game from your profile history
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 rounded-2xl border border-[#27354f] bg-[#121e31]/92 p-2">
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setInfo(null);
                        fileInputRef.current?.click();
                      }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-[#1b2a41] hover:text-slate-100"
                    >
                      <Paperclip className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setInfo(null);
                        videoInputRef.current?.click();
                      }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-[#1b2a41] hover:text-slate-100"
                    >
                      <Video className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-[#1b2a41] hover:text-slate-100"
                    >
                      <Smile className="h-4 w-4" />
                    </button>

                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !sending) {
                          e.preventDefault();
                          void sendMessage();
                        }
                      }}
                      placeholder={t("messages.composePlaceholder", "Type a message...")}
                      className="flex-1 bg-transparent px-2 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none"
                    />

                    <button
                      onClick={() => void sendMessage()}
                      disabled={sending || (!draft.trim() && pendingImages.length === 0 && !pendingVideo)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-[0_10px_20px_rgba(13,148,136,0.35)] transition-all hover:bg-brand-500 disabled:cursor-not-allowed disabled:bg-[#1e2a40] disabled:text-slate-600 disabled:shadow-none"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {viewer && viewer.attachments.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={closeViewer}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              closeViewer();
            }}
            className="absolute right-6 top-6 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white shadow-lg backdrop-blur transition hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          {viewer.attachments.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                stepViewer(-1);
              }}
              className="absolute left-6 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white shadow-lg backdrop-blur transition hover:bg-white/20"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <div
            className="mx-auto max-w-5xl px-6"
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const current =
                viewer.attachments[viewer.index] || viewer.attachments[0];
              const video = isVideoAttachment(current);
              return (
                <>
                  {video ? (
                    <video
                      src={resolveMediaUrl(current?.url)}
                      poster={
                        current?.thumbnail ? resolveMediaUrl(current.thumbnail) : undefined
                      }
                      controls
                      preload="metadata"
                      className="max-h-[80vh] w-full rounded-2xl border border-white/10 bg-black/70 object-contain shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
                    />
                  ) : (
                    <img
                      src={resolveMediaUrl(current?.url)}
                      alt={current?.filename || "attachment"}
                      className="max-h-[80vh] w-full rounded-2xl border border-white/10 bg-[#0b1424] object-contain shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
                    />
                  )}
                  <div className="mt-3 flex items-center justify-center gap-3 text-sm text-slate-200">
                    <span className="max-w-[60vw] truncate">
                      {current?.filename || (video ? "Video" : "Photo")}
                    </span>
                    <span className="text-slate-400">{formatBytes(current?.size || 0)}</span>
                  </div>
                </>
              );
            })()}
          </div>
          {viewer.attachments.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                stepViewer(1);
              }}
              className="absolute right-6 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white shadow-lg backdrop-blur transition hover:bg-white/20"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>
      )}

      {deleteConfirmOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setDeleteConfirmOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative mx-4 w-full max-w-md rounded-2xl border border-[#27354f] bg-[#0c1627]/95 p-5 shadow-[0_20px_40px_rgba(0,0,0,0.6)] ring-1 ring-black/40"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-rose-600/35 via-amber-500/35 to-pink-500/35 text-rose-100 ring-1 ring-rose-500/30">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h4 className="text-lg font-semibold text-slate-100">
                  {t("messages.deleteConfirmTitle", "Delete conversation?")}
                </h4>
                <p className="mt-1 text-sm text-slate-400">
                  {t(
                    "messages.deleteConfirmBody",
                    "This will remove the conversation from your messages. It will not erase it for the other participant.",
                  )}
                </p>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-[#25344e] bg-[#0e1727] px-4 text-sm font-medium text-slate-200 transition-colors hover:bg-[#162237] focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              >
                {t("common.cancel", "Cancel")}
              </button>
              <button
                type="button"
                disabled={actionLoading === "delete"}
                onClick={() => void handleDeleteConfirm()}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-gradient-to-r from-rose-600 via-amber-500 to-pink-500 px-4 text-sm font-semibold text-white shadow-[0_12px_32px_rgba(225,29,72,0.35)] transition-transform hover:translate-y-[-1px] focus:outline-none focus:ring-2 focus:ring-rose-400/40 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {t("messages.confirmDelete", "Delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

