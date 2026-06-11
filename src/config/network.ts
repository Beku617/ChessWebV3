import { OPTIONAL_SOCKET_URL, REQUIRED_API_URL } from "./runtimeEnv";

const LOCAL_DEV_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function getBrowserOrigin(): string | null {
  if (typeof window === "undefined") return null;
  const { origin } = window.location;
  return typeof origin === "string" && origin.trim() ? origin : null;
}

function shouldUseDevProxyTarget(origin: string, browserOrigin: string | null): boolean {
  if (!import.meta.env.DEV || !browserOrigin) return false;

  try {
    const parsed = new URL(origin);
    if (!LOCAL_DEV_HOSTS.has(parsed.hostname)) return false;
    return parsed.origin !== browserOrigin;
  } catch {
    return false;
  }
}

function resolveOrigin(origin: string): string {
  const browserOrigin = getBrowserOrigin();
  if (shouldUseDevProxyTarget(origin, browserOrigin)) {
    return browserOrigin as string;
  }
  return origin;
}

export const API_URL = resolveOrigin(REQUIRED_API_URL);
export const SOCKET_URL = resolveOrigin(OPTIONAL_SOCKET_URL || REQUIRED_API_URL);
