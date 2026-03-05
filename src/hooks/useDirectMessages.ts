import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useAuthStore } from "../store/authStore";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const socketBaseUrl =
  import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || "http://localhost:3001";
const SOCKET_URL = socketBaseUrl.replace(/\/api\/?$/, "");

export interface ThreadSummary {
  id: string;
  otherUserId: string;
  otherName: string;
  otherAvatar: string;
  lastMessage: string;
  lastSender: string;
  lastMessageAt: string;
  unread: number;
}

export interface DirectMessage {
  id: string;
  conversationId: string;
  fromUserId: string;
  toUserId: string;
  body: string;
  createdAt: string;
  readAt?: string | null;
}

export function useDirectMessages() {
  const { user } = useAuthStore();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [messages, setMessages] = useState<Record<string, DirectMessage[]>>({});
  const [activeThreadId, setActiveThreadId] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const fetchThreads = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/messages/threads`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load threads");
      const data = await res.json();
      setThreads(data.threads || []);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const fetchMessages = useCallback(
    async (threadId: string) => {
      if (!threadId) return;
      try {
        setLoading(true);
        const res = await fetch(`${API_URL}/api/messages/threads/${threadId}/messages`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to load messages");
        const data = await res.json();
        setMessages((prev) => ({ ...prev, [threadId]: data.messages || [] }));
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const connectSocket = useCallback(() => {
    if (socketRef.current) return;
    const socket = io(SOCKET_URL, { withCredentials: true });
    socketRef.current = socket;

    socket.on("dm:newMessage", (msg: DirectMessage) => {
      setMessages((prev) => {
        const existing = prev[msg.conversationId] || [];
        return {
          ...prev,
          [msg.conversationId]: [...existing, msg],
        };
      });
      setThreads((prev) => {
        const next = [...prev];
        const idx = next.findIndex((t) => t.id === msg.conversationId);
        if (idx !== -1) {
          next[idx] = {
            ...next[idx],
            lastMessage: msg.body,
            lastSender: msg.fromUserId,
            lastMessageAt: msg.createdAt,
            unread:
              msg.fromUserId === user?.id
                ? next[idx].unread
                : next[idx].unread + 1,
          };
        } else {
          next.unshift({
            id: msg.conversationId,
            otherUserId: msg.fromUserId === user?.id ? msg.toUserId : msg.fromUserId,
            otherName: "User",
            otherAvatar: "",
            lastMessage: msg.body,
            lastSender: msg.fromUserId,
            lastMessageAt: msg.createdAt,
            unread: msg.fromUserId === user?.id ? 0 : 1,
          });
        }
        return next.sort(
          (a, b) =>
            new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
        );
      });
    });

    socket.on("dm:read", (payload: { conversationId: string }) => {
      setThreads((prev) =>
        prev.map((t) =>
          t.id === payload.conversationId ? { ...t, unread: 0 } : t,
        ),
      );
    });
  }, [user?.id]);

  useEffect(() => {
    connectSocket();
    void fetchThreads();
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [connectSocket, fetchThreads]);

  const openThread = useCallback(
    (threadId: string) => {
      setActiveThreadId(threadId);
      void fetchMessages(threadId);
      if (socketRef.current) {
        socketRef.current.emit("dm:read", { conversationId: threadId });
      } else {
        fetch(`${API_URL}/api/messages/threads/${threadId}/read`, {
          method: "POST",
          credentials: "include",
        }).catch(() => {});
      }
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, unread: 0 } : t)),
      );
    },
    [fetchMessages],
  );

  const sendMessage = useCallback(
    async (toUserId: string, body: string) => {
      const trimmed = body.trim();
      if (!trimmed) return;
      setSending(true);
      setError(null);
      try {
        if (socketRef.current?.connected) {
          socketRef.current.emit(
            "dm:send",
            { toUserId, body: trimmed },
            (resp?: { success?: boolean; error?: string; message?: DirectMessage }) => {
              if (!resp?.success) setError(resp?.error || "Failed to send message");
              setSending(false);
            },
          );
        } else {
          const res = await fetch(`${API_URL}/api/messages/send`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ toUserId, body: trimmed }),
          });
          if (!res.ok) throw new Error("Failed to send message");
          const data = await res.json();
          const msg = data.message as DirectMessage;
          setMessages((prev) => ({
            ...prev,
            [msg.conversationId]: [...(prev[msg.conversationId] || []), msg],
          }));
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setSending(false);
      }
    },
    [],
  );

  const ensureThreadWithUser = useCallback(
    async (userId: string) => {
      if (!userId) return null;
      try {
        const res = await fetch(`${API_URL}/api/messages/with/${userId}`, {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.error || `Failed to open conversation (${res.status})`);
        }
        const data = await res.json();
        if (data?.thread?.id) {
          setThreads((prev) => {
            const filtered = prev.filter((t) => t.id !== data.thread.id);
            return [data.thread, ...filtered];
          });
          setActiveThreadId(data.thread.id);
          void fetchMessages(data.thread.id);
          return data.thread.id as string;
        }
      } catch (err) {
        setError((err as Error).message);
      }
      return null;
    },
    [fetchMessages],
  );

  const activeMessages = useMemo(
    () => (activeThreadId ? messages[activeThreadId] || [] : []),
    [activeThreadId, messages],
  );

  return {
    threads,
    activeThreadId,
    activeMessages,
    loading,
    sending,
    error,
    openThread,
    sendMessage,
    ensureThreadWithUser,
    refreshThreads: fetchThreads,
  };
}
