import { create } from "zustand";
import { io, Socket } from "socket.io-client";
import type { User } from "./authStore";

const socketBaseUrl =
  import.meta.env.VITE_SOCKET_URL ||
  import.meta.env.VITE_API_URL ||
  "http://localhost:3001";
const SOCKET_URL = socketBaseUrl.replace(/\/api\/?$/, "");

export type FriendColorChoice = "white" | "black" | "random";

export interface FriendChallenge {
  id: string;
  fromUserId: string;
  fromName: string;
  fromRating?: number;
  toUserId: string;
  toName: string;
  gameType: string;
  rated: boolean;
  playAs: FriendColorChoice;
  timeControl: { initial: number; increment: number };
  createdAt: number;
}

export interface FriendGameStartedPayload {
  challengeId: string;
  gameId: string;
  color: "w" | "b";
  fen: string;
  opponentUserId?: string;
  opponentName: string;
  playerRating?: number;
  opponentRating?: number;
  timeControl: { initial: number; increment: number };
  gameType?: string;
  variant?:
    | "standard"
    | "chess960"
    | "threeCheck"
    | "kingOfHill"
    | "atomic";
  whiteCheckCount?: number;
  blackCheckCount?: number;
  rated?: boolean;
}

export interface SendFriendChallengeInput {
  toUserId: string;
  toName: string;
  gameType: string;
  rated: boolean;
  playAs: FriendColorChoice;
  timeControl: { initial: number; increment: number };
  fromRating?: number;
}

export type PresenceStatus =
  | "online"
  | "offline"
  | "searching_match"
  | "in_game"
  | "away";

interface PresenceStatePayload {
  status?: PresenceStatus;
  lastSeenAt?: string | null;
  lastActiveAt?: string | null;
}

interface FriendChallengeAck {
  success: boolean;
  error?: string;
  challengeId?: string;
  challenge?: FriendChallenge;
  status?: "accepted" | "declined";
  gameId?: string;
  game?: FriendGameStartedPayload;
}

interface FriendChallengeState {
  socket: Socket | null;
  currentUserId: string | null;
  isConnected: boolean;
  presenceStatus: PresenceStatus | null;
  lastSeenAt: string | null;
  lastActiveAt: string | null;
  incomingChallenges: FriendChallenge[];
  activeGame: FriendGameStartedPayload | null;
  lastError: string | null;
  lastInfo: string | null;
  initialize: (user: User | null) => void;
  disconnect: () => void;
  clearError: () => void;
  clearInfo: () => void;
  clearActiveGame: () => void;
  dismissChallenge: (challengeId: string) => void;
  sendChallenge: (
    payload: SendFriendChallengeInput,
  ) => Promise<FriendChallengeAck>;
  respondToChallenge: (
    challengeId: string,
    accept: boolean,
  ) => Promise<FriendChallengeAck>;
}

function emitWithAck<TResponse>(
  socket: Socket,
  eventName: string,
  payload: unknown,
  timeoutMs = 10000,
): Promise<TResponse> {
  return new Promise((resolve) => {
    let settled = false;

    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({
        success: false,
        error: "Request timed out.",
      } as TResponse);
    }, timeoutMs);

    socket.emit(eventName, payload, (response: TResponse) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve(response);
    });
  });
}

let heartbeatTimer: number | null = null;

function stopHeartbeat() {
  if (heartbeatTimer !== null) {
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function startHeartbeat(socket: Socket) {
  stopHeartbeat();
  const sendPing = () => {
    if (!socket.connected) return;
    socket.emit("presence:ping");
  };

  sendPing();
  heartbeatTimer = window.setInterval(sendPing, 30_000);
}

export const useFriendChallengeStore = create<FriendChallengeState>(
  (set, get) => ({
    socket: null,
    currentUserId: null,
    isConnected: false,
    presenceStatus: null,
    lastSeenAt: null,
    lastActiveAt: null,
    incomingChallenges: [],
    activeGame: null,
    lastError: null,
    lastInfo: null,

    initialize: (user) => {
      const nextUserId = user?.id ? String(user.id) : null;
      const currentSocket = get().socket;
      const currentUserId = get().currentUserId;

      if (!nextUserId) {
        get().disconnect();
        return;
      }

      if (currentSocket && currentUserId === nextUserId) {
        return;
      }

      if (currentSocket) {
        const previousSocket = currentSocket as Socket & { __probeTimer?: number };
        if (previousSocket.__probeTimer !== undefined) {
          window.clearTimeout(previousSocket.__probeTimer);
          previousSocket.__probeTimer = undefined;
        }
        currentSocket.io.off("reconnect_attempt");
        currentSocket.removeAllListeners();
        currentSocket.disconnect();
      }

      const socket = io(SOCKET_URL, {
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
        autoConnect: false,
      });
      const socketWithProbe = socket as Socket & { __probeTimer?: number };
      const clearProbeTimer = () => {
        if (socketWithProbe.__probeTimer !== undefined) {
          window.clearTimeout(socketWithProbe.__probeTimer);
          socketWithProbe.__probeTimer = undefined;
        }
      };
      const scheduleConnectProbe = () => {
        clearProbeTimer();
        socketWithProbe.__probeTimer = window.setTimeout(async () => {
          socketWithProbe.__probeTimer = undefined;
          if (get().socket !== socket || socket.connected) return;
          try {
            const response = await fetch(`${SOCKET_URL}/healthz`, {
              credentials: "include",
            });
            if (!response.ok) throw new Error("Server unavailable");
            if (get().socket === socket && !socket.connected) {
              socket.connect();
            }
          } catch {
            if (get().socket !== socket) return;
            set({
              isConnected: false,
              presenceStatus: "offline",
              lastError: "Unable to connect to realtime server. Reconnecting...",
            });
            scheduleConnectProbe();
          }
        }, 1500);
      };

      socket.on("connect", () => {
        clearProbeTimer();
        startHeartbeat(socket);
        set({ isConnected: true, lastError: null });
      });

      socket.on("disconnect", () => {
        stopHeartbeat();
        set({ isConnected: false, presenceStatus: "offline" });
        scheduleConnectProbe();
      });

      socket.on("connect_error", () => {
        stopHeartbeat();
        set({
          isConnected: false,
          presenceStatus: "offline",
          lastError: "Unable to connect to realtime server. Reconnecting...",
        });
        scheduleConnectProbe();
      });

      socket.io.on("reconnect_attempt", () => {
        set({
          isConnected: false,
          presenceStatus: "offline",
          lastError: "Realtime disconnected. Reconnecting...",
        });
      });

      socket.on("presenceState", (payload: PresenceStatePayload) => {
        set({
          presenceStatus: payload?.status || null,
          lastSeenAt: payload?.lastSeenAt ?? null,
          lastActiveAt: payload?.lastActiveAt ?? null,
        });
      });

      socket.on("friendChallengeReceived", (challenge: FriendChallenge) => {
        set((state) => ({
          incomingChallenges: [
            challenge,
            ...state.incomingChallenges.filter((c) => c.id !== challenge.id),
          ],
          lastError: null,
        }));
      });

      socket.on(
        "friendChallengeDeclined",
        (payload: { byName?: string; reason?: string }) => {
          set({
            lastInfo:
              payload?.reason ||
              `${payload?.byName || "Friend"} declined your challenge.`,
          });
        },
      );

      socket.on(
        "friendChallengeCancelled",
        (payload: { challengeId?: string; reason?: string }) => {
          set((state) => ({
            incomingChallenges: payload?.challengeId
              ? state.incomingChallenges.filter(
                  (challenge) => challenge.id !== payload.challengeId,
                )
              : state.incomingChallenges,
            lastInfo: payload?.reason || "Challenge was cancelled.",
          }));
        },
      );

      socket.on("friendChallengeError", (payload: { error?: string }) => {
        set({
          lastError: payload?.error || "Challenge failed.",
        });
      });

      socket.on("friendGameStarted", (payload: FriendGameStartedPayload) => {
        set((state) => ({
          activeGame: payload,
          incomingChallenges: state.incomingChallenges.filter(
            (challenge) => challenge.id !== payload.challengeId,
          ),
          lastError: null,
          lastInfo: null,
        }));
      });

      set({
        socket,
        currentUserId: nextUserId,
        isConnected: socket.connected,
        presenceStatus: null,
        lastSeenAt: null,
        lastActiveAt: null,
        incomingChallenges: [],
        activeGame: null,
        lastError: null,
        lastInfo: null,
      });
      scheduleConnectProbe();
    },

    disconnect: () => {
      const socket = get().socket;
      stopHeartbeat();
      if (socket) {
        const activeSocket = socket as Socket & { __probeTimer?: number };
        if (activeSocket.__probeTimer !== undefined) {
          window.clearTimeout(activeSocket.__probeTimer);
          activeSocket.__probeTimer = undefined;
        }
        socket.io.off("reconnect_attempt");
        socket.removeAllListeners();
        socket.disconnect();
      }
      set({
        socket: null,
        currentUserId: null,
        isConnected: false,
        presenceStatus: null,
        lastSeenAt: null,
        lastActiveAt: null,
        incomingChallenges: [],
        activeGame: null,
        lastError: null,
        lastInfo: null,
      });
    },

    clearError: () => set({ lastError: null }),
    clearInfo: () => set({ lastInfo: null }),
    clearActiveGame: () => set({ activeGame: null }),
    dismissChallenge: (challengeId) =>
      set((state) => ({
        incomingChallenges: state.incomingChallenges.filter(
          (challenge) => challenge.id !== challengeId,
        ),
      })),

    sendChallenge: async (payload) => {
      const socket = get().socket;
      if (!socket || !socket.connected) {
        const error = "Realtime server is offline.";
        set({ lastError: error });
        return { success: false, error };
      }

      const response = await emitWithAck<FriendChallengeAck>(
        socket,
        "sendFriendChallenge",
        payload,
      );

      if (!response?.success) {
        set({ lastError: response?.error || "Failed to send challenge." });
      } else {
        set({ lastError: null, lastInfo: "Challenge sent." });
      }

      return response;
    },

    respondToChallenge: async (challengeId, accept) => {
      const socket = get().socket;
      if (!socket || !socket.connected) {
        const error = "Realtime server is offline.";
        set({ lastError: error });
        return { success: false, error };
      }

      const response = await emitWithAck<FriendChallengeAck>(
        socket,
        "respondFriendChallenge",
        { challengeId, accept },
      );

      if (!response?.success) {
        set({ lastError: response?.error || "Unable to respond to challenge." });
        return response;
      }

      if (!accept) {
        get().dismissChallenge(challengeId);
        set({ lastInfo: "Challenge declined.", lastError: null });
      } else {
        set((state) => ({
          activeGame: response.game || state.activeGame,
          incomingChallenges: state.incomingChallenges.filter(
            (challenge) => challenge.id !== challengeId,
          ),
          lastError: null,
          lastInfo: null,
        }));
      }

      return response;
    },
  }),
);
