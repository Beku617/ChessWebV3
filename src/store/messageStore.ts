import { create } from "zustand";
import { API_URL } from "../config/network";

const SERVICE_UNAVAILABLE_COOLDOWN_MS = 30_000;
let unreadServiceUnavailableUntil = 0;

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
    const now = Date.now();
    if (now < unreadServiceUnavailableUntil) {
      return get().unreadCount;
    }

    try {
      const res = await fetch(`${API_URL}/api/messages/unread-count`, {
        credentials: "include",
      });
      if (res.status === 503) {
        unreadServiceUnavailableUntil = Date.now() + SERVICE_UNAVAILABLE_COOLDOWN_MS;
        return get().unreadCount;
      }

      unreadServiceUnavailableUntil = 0;
      const data = await res.json().catch(() => ({}));
      const next = res.ok ? Number(data.count) || 0 : get().unreadCount;
      set({ unreadCount: next });
      return next;
    } catch {
      return get().unreadCount;
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
