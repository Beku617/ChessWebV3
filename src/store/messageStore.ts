import { create } from "zustand";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface MessageStoreState {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
  refreshUnread: () => Promise<number>;
  archiveConversation: (partnerId: string, archived?: boolean) => Promise<boolean>;
  deleteConversation: (partnerId: string) => Promise<boolean>;
}

export const useMessageStore = create<MessageStoreState>((set, get) => ({
  unreadCount: 0,
  setUnreadCount: (count) => set({ unreadCount: Math.max(0, Number(count) || 0) }),
  refreshUnread: async () => {
    try {
      const res = await fetch(`${API_URL}/api/messages/unread-count`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      const next = res.ok ? Number(data.count) || 0 : 0;
      set({ unreadCount: next });
      return next;
    } catch {
      return 0;
    }
  },
  archiveConversation: async (partnerId: string, archived: boolean = true) => {
    if (!partnerId) return false;

    try {
      const res = await fetch(`${API_URL}/api/messages/conversations/${partnerId}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ archived }),
      });

      if (!res.ok) return false;
      void get().refreshUnread();
      return true;
    } catch {
      return false;
    }
  },
  deleteConversation: async (partnerId: string) => {
    if (!partnerId) return false;

    try {
      const res = await fetch(`${API_URL}/api/messages/conversations/${partnerId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) return false;
      await get().refreshUnread();
      return true;
    } catch {
      return false;
    }
  },
}));
