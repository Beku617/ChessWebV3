const DEFAULT_LOCAL_API_ORIGIN = "http://localhost:3001";
const LOCAL_DEV_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function normalizeOrigin(rawValue: unknown): string | null {
  const value = String(rawValue || "").trim();
  if (!value) return null;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    const normalizedPath = parsed.pathname
      .replace(/\/+$/, "")
      .replace(/\/api$/i, "");
    const base = `${parsed.protocol}//${parsed.host}${normalizedPath}`;
    return base.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

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
    if (parsed.port !== "3001") return false;
    return parsed.origin !== browserOrigin;
  } catch {
    return false;
  }
}

function resolveOrigin(rawValue: unknown, fallback: string): string {
  const normalized = normalizeOrigin(rawValue) || fallback;
  const browserOrigin = getBrowserOrigin();
  if (shouldUseDevProxyTarget(normalized, browserOrigin)) {
    return browserOrigin as string;
  }
  return normalized;
}

const browserOrigin = getBrowserOrigin();
const defaultOrigin = browserOrigin || DEFAULT_LOCAL_API_ORIGIN;

export const API_URL = resolveOrigin(import.meta.env.VITE_API_URL, defaultOrigin);
export const SOCKET_URL = resolveOrigin(
  import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL,
  API_URL,
);
