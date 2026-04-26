import { create } from "zustand";
import type { Socket } from "socket.io-client";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

function resolveAvatarUrl(avatar?: string) {
  if (!avatar) return "";
  if (
    avatar.startsWith("http://") ||
    avatar.startsWith("https://") ||
    avatar.startsWith("data:") ||
    avatar.startsWith("blob:")
  ) {
    return avatar;
  }
  return `${API_URL}${avatar.startsWith("/") ? "" : "/"}${avatar}`;
}

export type FriendRelationship =
  | "self"
  | "friends"
  | "incoming_pending"
  | "outgoing_pending"
  | "none";

export type FriendRequestStatus =
  | "pending"
  | "accepted"
  | "denied"
  | "ignored"
  | "canceled";

export interface FriendListItem {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  rating?: number;
  presenceStatus?: string;
  lastActiveAt?: string | null;
  isWatchableInGame?: boolean;
  watchableGame?: {
    gameId: string;
    kind: "classic" | "fourPlayer";
    mode: "quick" | "friend" | "tournament" | "fourPlayer";
    variant?: string;
    status?: "active" | "temporarily_disconnected";
    participantCount?: number;
  } | null;
  since?: string;
}

export interface FriendRequestItem {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  userRating?: number;
  direction: "incoming" | "outgoing";
  status: FriendRequestStatus;
  createdAt?: string;
  updatedAt?: string;
  respondedAt?: string | null;
}

interface FriendStoreState {
  friends: FriendListItem[];
  incoming: FriendRequestItem[];
  outgoing: FriendRequestItem[];
  loading: boolean;
  error: string | null;
  socketId: string | null;
  loadAll: () => Promise<void>;
  sendRequest: (targetUserId: string) => Promise<{ status: string; requestId?: string | null }>;
  acceptRequest: (requestId: string) => Promise<void>;
  denyRequest: (requestId: string) => Promise<void>;
  cancelRequest: (requestId: string) => Promise<void>;
  removeFriend: (friendId: string) => Promise<void>;
  bindSocket: (socket: Socket | null) => void;
  getRelationship: (userId: string) => FriendRelationship;
  pendingIncomingCount: () => number;
  reset: () => void;
}

function toRequestItem(dto: any): FriendRequestItem {
  return {
    id: String(dto.id || dto._id || ""),
    userId: String(dto.user?.id || dto.userId || dto.partnerId || ""),
    userName: dto.user?.name || dto.userName || "Player",
    userAvatar: resolveAvatarUrl(dto.user?.avatar || dto.userAvatar),
    userRating: dto.user?.rating ?? dto.userRating ?? 1200,
    direction: dto.direction === "incoming" ? "incoming" : "outgoing",
    status: dto.status || "pending",
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    respondedAt: dto.respondedAt ?? null,
  };
}

function toFriendItem(dto: any): FriendListItem {
  const watchableGame =
    dto?.watchableGame && typeof dto.watchableGame === "object"
      ? {
          gameId: String(dto.watchableGame.gameId || ""),
          kind: dto.watchableGame.kind === "fourPlayer" ? "fourPlayer" : "classic",
          mode:
            dto.watchableGame.mode === "friend" ||
            dto.watchableGame.mode === "tournament" ||
            dto.watchableGame.mode === "fourPlayer"
              ? dto.watchableGame.mode
              : "quick",
          variant: dto.watchableGame.variant
            ? String(dto.watchableGame.variant)
            : undefined,
          status:
            dto.watchableGame.status === "temporarily_disconnected"
              ? "temporarily_disconnected"
              : "active",
          participantCount: Number.isFinite(Number(dto.watchableGame.participantCount))
            ? Number(dto.watchableGame.participantCount)
            : undefined,
        }
      : null;

  return {
    id: String(dto.id || dto._id || ""),
    name: dto.name || dto.fullName || "Friend",
    email: dto.email || "",
    avatar: resolveAvatarUrl(dto.avatar),
    rating: dto.rating,
    presenceStatus: dto.presenceStatus,
    lastActiveAt: dto.lastActiveAt ?? dto.lastSeenAt ?? null,
    isWatchableInGame: dto.isWatchableInGame === true || !!watchableGame,
    watchableGame,
    since: dto.since,
  };
}

function upsertRequest(list: FriendRequestItem[], item: FriendRequestItem) {
  const filtered = list.filter((req) => req.id !== item.id);
  return [item, ...filtered];
}

function upsertFriend(list: FriendListItem[], item: FriendListItem) {
  const filtered = list.filter((f) => f.id !== item.id);
  return [item, ...filtered];
}

let boundSocket: Socket | null = null;
let boundHandlers: Array<{ event: string; handler: (...args: any[]) => void }> = [];

function detachSocketHandlers() {
  if (boundSocket) {
    boundHandlers.forEach(({ event, handler }) => boundSocket!.off(event, handler));
  }
  boundSocket = null;
  boundHandlers = [];
}

export const useFriendStore = create<FriendStoreState>((set, get) => ({
  friends: [],
  incoming: [],
  outgoing: [],
  loading: false,
  error: null,
  socketId: null,

  reset: () =>
    set({
      friends: [],
      incoming: [],
      outgoing: [],
      loading: false,
      error: null,
      socketId: null,
    }),

  getRelationship: (userId) => {
    const normalized = String(userId || "");
    if (!normalized) return "none";
    if (get().friends.some((f) => f.id === normalized)) return "friends";
    if (get().incoming.some((r) => r.userId === normalized && r.status === "pending")) {
      return "incoming_pending";
    }
    if (get().outgoing.some((r) => r.userId === normalized && r.status === "pending")) {
      return "outgoing_pending";
    }
    return "none";
  },

  loadAll: async () => {
    try {
      set({ loading: true, error: null });
      const [friendsRes, requestsRes] = await Promise.all([
        fetch(`${API_URL}/api/friends`, { credentials: "include" }),
        fetch(`${API_URL}/api/friends/requests`, { credentials: "include" }),
      ]);
      const friendsData = friendsRes.ok ? await friendsRes.json() : { friends: [] };
      const requestsData = requestsRes.ok ? await requestsRes.json() : { incoming: [], outgoing: [] };

      set({
        friends: Array.isArray(friendsData.friends)
          ? friendsData.friends.map(toFriendItem)
          : [],
        incoming: Array.isArray(requestsData.incoming)
          ? requestsData.incoming.map(toRequestItem)
          : [],
        outgoing: Array.isArray(requestsData.outgoing)
          ? requestsData.outgoing.map(toRequestItem)
          : [],
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error("loadAll friends error", error);
      set({ loading: false, error: "Failed to load friends." });
    }
  },

  sendRequest: async (targetUserId) => {
    const payload = { receiverId: targetUserId };
    const res = await fetch(`${API_URL}/api/friends/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Failed to send request");
    }

    if (data.status === "accepted") {
      if (data.friendship) {
        set((state) => ({
          friends: upsertFriend(state.friends, toFriendItem(data.friendship)),
          incoming: state.incoming.filter((r) => r.userId !== targetUserId),
          outgoing: state.outgoing.filter((r) => r.userId !== targetUserId),
        }));
      }
      return { status: "accepted", requestId: data.request?.id || null };
    }

    if (data.request) {
      const reqItem = toRequestItem(data.request);
      set((state) => ({
        outgoing: upsertRequest(state.outgoing, reqItem),
      }));
      return { status: data.status || "pending", requestId: reqItem.id };
    }

    return { status: data.status || "pending", requestId: null };
  },

  acceptRequest: async (requestId) => {
    if (!requestId) throw new Error("Missing request id");
    const res = await fetch(`${API_URL}/api/friends/requests/${requestId}/accept`, {
      method: "POST",
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail || data.error || "Failed to accept request");
    }
    const friendItem = data.friendship ? toFriendItem(data.friendship) : null;

    set((state) => ({
      incoming: state.incoming.filter((r) => r.id !== requestId),
      outgoing: state.outgoing.filter((r) => r.id !== requestId),
      friends: friendItem ? upsertFriend(state.friends, friendItem) : state.friends,
    }));
    // Refresh to avoid stale edge cases
    void get().loadAll();
  },

  denyRequest: async (requestId) => {
    if (!requestId) throw new Error("Missing request id");
    const res = await fetch(`${API_URL}/api/friends/requests/${requestId}/deny`, {
      method: "POST",
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail || data.error || "Failed to deny request");
    }
    set((state) => ({
      incoming: state.incoming.filter((r) => r.id !== requestId),
    }));
    void get().loadAll();
  },

  cancelRequest: async (requestId) => {
    if (!requestId) throw new Error("Missing request id");
    const res = await fetch(`${API_URL}/api/friends/requests/${requestId}/cancel`, {
      method: "POST",
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail || data.error || "Failed to cancel request");
    }
    set((state) => ({
      outgoing: state.outgoing.filter((r) => r.id !== requestId),
    }));
    void get().loadAll();
  },

  removeFriend: async (friendId) => {
    const res = await fetch(`${API_URL}/api/friends/${friendId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to remove friend");
    }
    set((state) => ({
      friends: state.friends.filter((f) => f.id !== friendId),
    }));
  },

  pendingIncomingCount: () =>
    get().incoming.filter((r) => r.status === "pending").length,

  bindSocket: (socket) => {
    if (socket && boundSocket && boundSocket.id === socket.id) {
      set({ socketId: socket.id });
      return;
    }

    detachSocketHandlers();

    if (!socket) {
      set({ socketId: null });
      return;
    }

    boundSocket = socket;
  const handlers = {
    friend_request_received: (dto: any) =>
      set((state) => ({
        incoming: upsertRequest(state.incoming, toRequestItem({ ...dto, direction: "incoming" })),
        outgoing: state.outgoing,
      })),
    friend_request_sent: (dto: any) =>
      set((state) => ({
        outgoing: upsertRequest(state.outgoing, toRequestItem({ ...dto, direction: "outgoing" })),
      })),
    friend_request_updated: (dto: any) =>
      set((state) => {
        const item = toRequestItem(dto);
        const isIncoming = item.direction === "incoming";
        let nextIncoming = state.incoming;
        let nextOutgoing = state.outgoing;

        if (isIncoming) {
          nextIncoming = state.incoming.filter((r) => r.id !== item.id);
          if (item.status === "pending") {
            nextIncoming = upsertRequest(nextIncoming, item);
          }
        } else {
          nextOutgoing = state.outgoing.filter((r) => r.id !== item.id);
          if (item.status === "pending") {
            nextOutgoing = upsertRequest(nextOutgoing, item);
          }
        }

        return {
          incoming: nextIncoming,
          outgoing: nextOutgoing,
        };
      }),
      friendship_created: (payload: any) =>
        set((state) => ({
          friends: upsertFriend(
            state.friends,
            toFriendItem(payload),
          ),
        })),
      friendship_removed: (payload: any) =>
        set((state) => ({
          friends: state.friends.filter(
            (f) => f.id !== String(payload.friendId || payload.id || payload),
          ),
        })),
    };

    boundHandlers = Object.entries(handlers).map(([event, handler]) => ({
      event,
      handler: handler as (...args: any[]) => void,
    }));
    boundHandlers.forEach(({ event, handler }) => socket.on(event, handler));
    set({ socketId: socket.id });
  },
}));
