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

function requireOrigin(rawValue: unknown, envName: string): string {
  const normalized = normalizeOrigin(rawValue);
  if (normalized) return normalized;

  throw new Error(
    `[config] Missing or invalid ${envName}. Set ${envName} to the backend origin, for example https://api.example.com.`,
  );
}

function resolveOptionalOrigin(rawValue: unknown, envName: string): string | null {
  const value = String(rawValue || "").trim();
  if (!value) return null;

  const normalized = normalizeOrigin(value);
  if (normalized) return normalized;

  throw new Error(
    `[config] Invalid ${envName}. Set ${envName} to an absolute http(s) origin.`,
  );
}

export const REQUIRED_API_URL = requireOrigin(
  import.meta.env.VITE_API_URL,
  "VITE_API_URL",
);

export const OPTIONAL_SOCKET_URL = resolveOptionalOrigin(
  import.meta.env.VITE_SOCKET_URL,
  "VITE_SOCKET_URL",
);
