const API_URL = import.meta.env.VITE_API_URL;

export interface OAuthConfig {
  googleClientId: string;
  facebookAppId: string;
}

let cachedOAuthConfig: OAuthConfig | null = null;
let pendingOAuthConfigRequest: Promise<OAuthConfig> | null = null;

function normalizeOAuthConfig(input: unknown): OAuthConfig {
  const payload =
    input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  return {
    googleClientId: String(payload.googleClientId || "").trim(),
    facebookAppId: String(payload.facebookAppId || "").trim(),
  };
}

export async function loadOAuthConfig(forceRefresh = false): Promise<OAuthConfig> {
  if (!forceRefresh && cachedOAuthConfig) {
    return cachedOAuthConfig;
  }

  if (!forceRefresh && pendingOAuthConfigRequest) {
    return pendingOAuthConfigRequest;
  }

  pendingOAuthConfigRequest = fetch(`${API_URL}/api/oauth/config`, {
    credentials: "include",
  })
    .then(async (res) => {
      if (!res.ok) {
        throw new Error("Failed to load OAuth config");
      }

      const json = await res.json().catch(() => ({}));
      const normalized = normalizeOAuthConfig(json);
      cachedOAuthConfig = normalized;
      return normalized;
    })
    .catch(() => {
      const fallback = {
        googleClientId: "",
        facebookAppId: "",
      };
      cachedOAuthConfig = fallback;
      return fallback;
    })
    .finally(() => {
      pendingOAuthConfigRequest = null;
    });

  return pendingOAuthConfigRequest;
}
