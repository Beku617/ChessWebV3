import useSWR, { mutate as globalMutate } from "swr";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export interface BlockStatus {
  isBlocked: boolean;
  isBlockedByTarget?: boolean;
  isAnyBlocked?: boolean;
}

export interface BlockedUserItem {
  id: string;
  fullName: string;
  avatar?: string;
  rating?: number;
  blockedAt?: string | null;
}

const BLOCKED_USERS_KEY = "blocking:blocked-users";

function blockStatusKey(userId?: string | null) {
  const normalized = String(userId || "").trim();
  return normalized ? `blocking:status:${normalized}` : null;
}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((data as any)?.error || "Request failed"));
  }
  return data as T;
}

async function fetchBlockStatusRequest(userId: string): Promise<BlockStatus> {
  const response = await fetch(`${API_URL}/api/users/${userId}/block-status`, {
    credentials: "include",
  });
  return readJson<BlockStatus>(response);
}

export async function fetchBlockStatus(userId: string): Promise<BlockStatus> {
  const normalized = String(userId || "").trim();
  if (!normalized) {
    return { isBlocked: false, isBlockedByTarget: false, isAnyBlocked: false };
  }
  return fetchBlockStatusRequest(normalized);
}

async function fetchBlockedUsersRequest(): Promise<{ blocks: BlockedUserItem[] }> {
  const response = await fetch(`${API_URL}/api/users/blocks`, {
    credentials: "include",
  });
  return readJson<{ blocks: BlockedUserItem[] }>(response);
}

export function useBlockStatus(userId?: string | null) {
  const normalized = String(userId || "").trim();
  return useSWR<BlockStatus>(
    blockStatusKey(normalized),
    () => fetchBlockStatusRequest(normalized),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );
}

export function useBlockedUsers() {
  return useSWR<{ blocks: BlockedUserItem[] }>(
    BLOCKED_USERS_KEY,
    fetchBlockedUsersRequest,
    {
      revalidateOnFocus: false,
    },
  );
}

export async function blockUser(userId: string) {
  const response = await fetch(`${API_URL}/api/users/${userId}/block`, {
    method: "POST",
    credentials: "include",
  });
  return readJson<{ success: boolean; isBlocked: boolean; blockedUserId: string }>(
    response,
  );
}

export async function unblockUser(userId: string) {
  const response = await fetch(`${API_URL}/api/users/${userId}/unblock`, {
    method: "POST",
    credentials: "include",
  });
  return readJson<{ success: boolean; isBlocked: boolean; blockedUserId: string }>(
    response,
  );
}

export function mutateBlockStatus(userId: string, next: BlockStatus) {
  const key = blockStatusKey(userId);
  if (!key) return Promise.resolve();
  return globalMutate(key, next, false);
}

export async function refreshBlockingCaches(userId?: string | null) {
  const key = blockStatusKey(userId);
  if (key) {
    await globalMutate(key);
  }
  await globalMutate(BLOCKED_USERS_KEY);
}

export function getBlockStatusKey(userId?: string | null) {
  return blockStatusKey(userId);
}

export function getBlockedUsersKey() {
  return BLOCKED_USERS_KEY;
}
