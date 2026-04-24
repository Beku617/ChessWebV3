export type ActiveOnlineGameKind = "classic" | "fourPlayer";
export type ActiveOnlineGameMode =
  | "quick"
  | "friend"
  | "tournament"
  | "fourPlayer";

export interface ActiveOnlineGameRecord {
  version: 1;
  gameId: string;
  kind: ActiveOnlineGameKind;
  mode: ActiveOnlineGameMode;
  variant?: string;
  opponentName?: string;
  timeControl?: {
    initial: number;
    increment: number;
  };
  updatedAt: number;
}

export interface ActiveOnlineGameSessionResponse {
  active: boolean;
  session?: {
    gameId: string;
    kind: ActiveOnlineGameKind;
    mode: ActiveOnlineGameMode;
    variant?: string;
    opponentName?: string;
    timeControl?: {
      initial: number;
      increment: number;
    };
    reconnectGraceMs?: number;
    reconnectDeadlineAt?: string | null;
    status?: string;
  } | null;
}

const ACTIVE_ONLINE_GAME_KEY = "neongambit:activeOnlineGame";
const ACTIVE_GAME_NOTICE_KEY = "neongambit:activeGameRedirectNotice";
const ACTIVE_GAME_STORAGE_KEY = "neongambit:activeGameId";
const ACTIVE_FRIEND_GAME_STORAGE_KEY = "neongambit:activeFriendGameId";
const ACTIVE_FOUR_PLAYER_GAME_STORAGE_KEY =
  "neongambit:activeFourPlayerGameId";

function safeStorageGet(key: string) {
  if (typeof window === "undefined") return "";
  try {
    return String(window.localStorage.getItem(key) || "").trim();
  } catch {
    return "";
  }
}

function safeStorageSet(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
}

function safeStorageRemove(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
}

function safeSessionGet(key: string) {
  if (typeof window === "undefined") return "";
  try {
    return String(window.sessionStorage.getItem(key) || "").trim();
  } catch {
    return "";
  }
}

function safeSessionSet(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
}

function safeSessionRemove(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
}

export function normalizeActiveOnlineGameRecord(
  value: Partial<ActiveOnlineGameRecord> | null | undefined,
): ActiveOnlineGameRecord | null {
  const gameId = String(value?.gameId || "").trim();
  if (!gameId) return null;

  const kind = value?.kind === "fourPlayer" ? "fourPlayer" : "classic";
  const mode =
    value?.mode === "friend" ||
    value?.mode === "tournament" ||
    value?.mode === "fourPlayer"
      ? value.mode
      : "quick";
  const initial = Number(value?.timeControl?.initial);
  const increment = Number(value?.timeControl?.increment);

  return {
    version: 1,
    gameId,
    kind,
    mode,
    variant: typeof value?.variant === "string" ? value.variant : undefined,
    opponentName:
      typeof value?.opponentName === "string" ? value.opponentName : undefined,
    timeControl:
      Number.isFinite(initial) && Number.isFinite(increment)
        ? {
            initial: Math.max(0, Math.round(initial)),
            increment: Math.max(0, Math.round(increment)),
          }
        : undefined,
    updatedAt: Number.isFinite(Number(value?.updatedAt))
      ? Number(value?.updatedAt)
      : Date.now(),
  };
}

export function readActiveOnlineGame() {
  const raw = safeStorageGet(ACTIVE_ONLINE_GAME_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<ActiveOnlineGameRecord>;
      const normalized = normalizeActiveOnlineGameRecord(parsed);
      if (normalized) return normalized;
    } catch {
      // ignore malformed values
    }
  }

  const classicGameId = safeStorageGet(ACTIVE_GAME_STORAGE_KEY);
  if (classicGameId) {
    return normalizeActiveOnlineGameRecord({
      gameId: classicGameId,
      kind: "classic",
      mode: "quick",
      updatedAt: Date.now(),
    });
  }

  const friendGameId = safeStorageGet(ACTIVE_FRIEND_GAME_STORAGE_KEY);
  if (friendGameId) {
    return normalizeActiveOnlineGameRecord({
      gameId: friendGameId,
      kind: "classic",
      mode: "friend",
      updatedAt: Date.now(),
    });
  }

  const fourPlayerGameId = safeStorageGet(ACTIVE_FOUR_PLAYER_GAME_STORAGE_KEY);
  if (fourPlayerGameId) {
    return normalizeActiveOnlineGameRecord({
      gameId: fourPlayerGameId,
      kind: "fourPlayer",
      mode: "fourPlayer",
      updatedAt: Date.now(),
    });
  }

  return null;
}

export function storeActiveOnlineGame(
  value: Partial<ActiveOnlineGameRecord> | null | undefined,
) {
  const normalized = normalizeActiveOnlineGameRecord(value);
  if (!normalized) {
    clearActiveOnlineGame();
    return;
  }

  safeStorageSet(ACTIVE_ONLINE_GAME_KEY, JSON.stringify(normalized));
  if (normalized.kind === "fourPlayer") {
    safeStorageSet(ACTIVE_FOUR_PLAYER_GAME_STORAGE_KEY, normalized.gameId);
    safeStorageRemove(ACTIVE_GAME_STORAGE_KEY);
    safeStorageRemove(ACTIVE_FRIEND_GAME_STORAGE_KEY);
    return;
  }

  if (normalized.mode === "friend") {
    safeStorageSet(ACTIVE_FRIEND_GAME_STORAGE_KEY, normalized.gameId);
    safeStorageRemove(ACTIVE_GAME_STORAGE_KEY);
  } else {
    safeStorageSet(ACTIVE_GAME_STORAGE_KEY, normalized.gameId);
    safeStorageRemove(ACTIVE_FRIEND_GAME_STORAGE_KEY);
  }
  safeStorageRemove(ACTIVE_FOUR_PLAYER_GAME_STORAGE_KEY);
}

export function clearActiveOnlineGame() {
  safeStorageRemove(ACTIVE_ONLINE_GAME_KEY);
  safeStorageRemove(ACTIVE_GAME_STORAGE_KEY);
  safeStorageRemove(ACTIVE_FRIEND_GAME_STORAGE_KEY);
  safeStorageRemove(ACTIVE_FOUR_PLAYER_GAME_STORAGE_KEY);
}

export function setActiveGameRedirectNotice(message: string | null | undefined) {
  const normalized = String(message || "").trim();
  if (!normalized) {
    safeSessionRemove(ACTIVE_GAME_NOTICE_KEY);
    return;
  }
  safeSessionSet(ACTIVE_GAME_NOTICE_KEY, normalized);
}

export function consumeActiveGameRedirectNotice() {
  const value = safeSessionGet(ACTIVE_GAME_NOTICE_KEY);
  if (value) {
    safeSessionRemove(ACTIVE_GAME_NOTICE_KEY);
  }
  return value;
}

export function isOnlineGameRoute(pathname: string) {
  const normalized = String(pathname || "").toLowerCase();
  return (
    normalized.startsWith("/play/quick") ||
    normalized.startsWith("/play/friend") ||
    normalized.startsWith("/play/four-player")
  );
}

export function buildActiveOnlineGamePath(
  record: Partial<ActiveOnlineGameRecord> | null | undefined,
) {
  const normalized = normalizeActiveOnlineGameRecord(record);
  if (!normalized) return "/";

  const params = new URLSearchParams({
    reconnectGameId: normalized.gameId,
  });

  if (normalized.timeControl) {
    params.set("initial", String(normalized.timeControl.initial));
    params.set("increment", String(normalized.timeControl.increment));
  }
  if (normalized.variant && normalized.variant !== "standard") {
    params.set("variant", normalized.variant);
  }

  if (normalized.kind === "fourPlayer" || normalized.mode === "fourPlayer") {
    return `/play/four-player?${params.toString()}`;
  }
  if (normalized.mode === "friend") {
    return `/play/friend?${params.toString()}`;
  }
  return `/play/quick?${params.toString()}`;
}

export function sessionResponseToRecord(
  response: ActiveOnlineGameSessionResponse["session"] | null | undefined,
) {
  if (!response?.gameId) return null;
  return normalizeActiveOnlineGameRecord({
    gameId: response.gameId,
    kind: response.kind,
    mode: response.mode,
    variant: response.variant,
    opponentName: response.opponentName,
    timeControl: response.timeControl,
    updatedAt: Date.now(),
  });
}
