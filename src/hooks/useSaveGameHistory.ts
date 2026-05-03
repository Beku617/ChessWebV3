import { useCallback, useEffect, useRef } from "react";
import { API_URL, GameHistoryPayload } from "./useStockfishGameTypes";
import { MIN_STORED_MOVES } from "./gameHistorySaver/historyPersistence";

let historyErrorLogged = false;
const CHESS960_EVENT_FALLBACK = "Live Chess960";
const CHESS960_SITE_FALLBACK = "NeonGambit";
const HISTORY_SAVE_QUEUE_KEY = "neongambit:history-save-queue:v1";
const MAX_QUEUE_ITEMS = 25;
const MAX_QUEUE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const UNRATED_VARIANTS = new Set([
  "chess960",
  "threeCheck",
  "kingOfHill",
  "atomic",
]);
const SAVE_RETRY_DELAYS_MS = [400, 1200, 2500];
const CHESS960_STRIPPED_FIELDS: Array<keyof GameHistoryPayload> = [
  "ratingBefore",
  "ratingAfter",
  "ratingDelta",
  "ratingDeviationBefore",
  "ratingDeviationAfter",
  "ratingDeviationDelta",
  "volatilityBefore",
  "volatilityAfter",
  "volatilityDelta",
  "opponentRatingBefore",
  "opponentRatingAfter",
  "opponentRatingDelta",
  "opponentRatingDeviationBefore",
  "opponentRatingDeviationAfter",
  "opponentRatingDeviationDelta",
  "opponentVolatilityBefore",
  "opponentVolatilityAfter",
  "opponentVolatilityDelta",
  "ratingPool",
];

type SaveAttemptResult = {
  historyId: string | null;
  status: number;
  error: string;
  networkError: boolean;
};

type QueuedHistoryPayload = {
  payload: GameHistoryPayload;
  queuedAt: number;
};

function hasLocalStorageAccess(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !!window.localStorage;
  } catch {
    return false;
  }
}

function hashSaveFingerprint(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return Math.abs(hash >>> 0).toString(36);
}

function normalizeSaveKey(key: unknown): string {
  const normalized = String(key || "").trim();
  return normalized.slice(0, 120);
}

function ensureClientSaveKey(payload: GameHistoryPayload): GameHistoryPayload {
  const existingKey = normalizeSaveKey(payload.clientSaveKey);
  if (existingKey) {
    return { ...payload, clientSaveKey: existingKey };
  }

  const fingerprint = [
    payload.variant || "standard",
    payload.playAs,
    payload.white,
    payload.black,
    payload.result,
    payload.date || "",
    payload.startTime || "",
    payload.endTime || "",
    payload.link || "",
    payload.timeControl || "",
    Array.isArray(payload.moves) ? payload.moves.join(" ") : "",
    payload.pgn || "",
  ]
    .map((value) => String(value || "").trim())
    .join("|");

  return {
    ...payload,
    clientSaveKey: `hsv1_${hashSaveFingerprint(fingerprint)}`,
  };
}

function readQueuedHistoryPayloads(): QueuedHistoryPayload[] {
  if (!hasLocalStorageAccess()) return [];

  try {
    const raw = window.localStorage.getItem(HISTORY_SAVE_QUEUE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const now = Date.now();
    const normalized = parsed
      .map((entry) => {
        const payload = ensureClientSaveKey(
          (entry?.payload || {}) as GameHistoryPayload,
        );
        const queuedAt = Number(entry?.queuedAt);
        if (!payload.clientSaveKey) return null;
        return {
          payload,
          queuedAt: Number.isFinite(queuedAt) ? queuedAt : now,
        };
      })
      .filter((entry): entry is QueuedHistoryPayload => !!entry)
      .filter((entry) => now - entry.queuedAt <= MAX_QUEUE_AGE_MS)
      .sort((a, b) => a.queuedAt - b.queuedAt);

    const dedupedByKey = new Map<string, QueuedHistoryPayload>();
    for (const entry of normalized) {
      dedupedByKey.set(entry.payload.clientSaveKey as string, entry);
    }

    return Array.from(dedupedByKey.values()).slice(-MAX_QUEUE_ITEMS);
  } catch {
    return [];
  }
}

function writeQueuedHistoryPayloads(items: QueuedHistoryPayload[]): void {
  if (!hasLocalStorageAccess()) return;
  try {
    if (items.length === 0) {
      window.localStorage.removeItem(HISTORY_SAVE_QUEUE_KEY);
      return;
    }
    window.localStorage.setItem(HISTORY_SAVE_QUEUE_KEY, JSON.stringify(items));
  } catch {
    // Ignore local storage quota/serialization failures.
  }
}

function enqueueHistoryPayload(payload: GameHistoryPayload): void {
  const normalizedPayload = ensureClientSaveKey(payload);
  if (!normalizedPayload.clientSaveKey) return;

  const queue = readQueuedHistoryPayloads();
  const next = queue.filter(
    (entry) => entry.payload.clientSaveKey !== normalizedPayload.clientSaveKey,
  );
  next.push({ payload: normalizedPayload, queuedAt: Date.now() });
  writeQueuedHistoryPayloads(next.slice(-MAX_QUEUE_ITEMS));
}

function removeQueuedHistoryPayload(saveKey: unknown): void {
  const normalizedKey = normalizeSaveKey(saveKey);
  if (!normalizedKey) return;

  const queue = readQueuedHistoryPayloads().filter(
    (entry) => entry.payload.clientSaveKey !== normalizedKey,
  );
  writeQueuedHistoryPayloads(queue);
}

function normalizePayload(payload: GameHistoryPayload): GameHistoryPayload {
  if (!UNRATED_VARIANTS.has(String(payload.variant || "standard"))) {
    return ensureClientSaveKey(payload);
  }

  const normalized: GameHistoryPayload = {
    ...payload,
    variant:
      payload.variant === "threeCheck"
        ? "threeCheck"
        : payload.variant === "kingOfHill"
          ? "kingOfHill"
          : payload.variant === "atomic"
            ? "atomic"
          : "chess960",
    rated: false,
    isProvisional: false,
    opponentIsProvisional: false,
    eco: payload.variant === "chess960" ? "" : payload.eco,
    ecoUrl: payload.variant === "chess960" ? "" : payload.ecoUrl,
  };

  for (const field of CHESS960_STRIPPED_FIELDS) {
    normalized[field] = undefined;
  }

  return ensureClientSaveKey(normalized);
}

function buildChess960FallbackPayload(
  payload: GameHistoryPayload,
): GameHistoryPayload {
  return {
    event: payload.event || CHESS960_EVENT_FALLBACK,
    variant: "chess960",
    site: payload.site || CHESS960_SITE_FALLBACK,
    date: payload.date,
    round: payload.round,
    white: payload.white,
    black: payload.black,
    result: payload.result,
    currentPosition: payload.currentPosition,
    startingFen: payload.startingFen,
    timeControl: payload.timeControl,
    utcDate: payload.utcDate,
    utcTime: payload.utcTime,
    startTime: payload.startTime,
    endDate: payload.endDate,
    endTime: payload.endTime,
    whiteElo: payload.whiteElo,
    blackElo: payload.blackElo,
    rated: false,
    timezone: payload.timezone || "UTC",
    termination: payload.termination,
    moves: payload.moves,
    moveText: payload.moveText,
    pgn: payload.pgn,
    playAs: payload.playAs,
    opponent: payload.opponent,
    opponentLevel: payload.opponentLevel,
    durationMs: payload.durationMs,
    clientSaveKey: payload.clientSaveKey,
  };
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.error === "string" && data.error.trim()) {
      return data.error.trim();
    }
    return JSON.stringify(data);
  } catch {
    try {
      const text = await res.text();
      return text.trim();
    } catch {
      return "";
    }
  }
}

function shouldRetrySaveAttempt(result: {
  status: number;
  networkError: boolean;
}): boolean {
  if (result.networkError) return true;
  if (result.status === 429) return true;
  return result.status >= 500;
}

function shouldQueueSaveAttempt(result: SaveAttemptResult): boolean {
  if (result.networkError) return true;
  if (result.status === 0) return true;
  if (result.status === 401) return true;
  if (result.status === 429) return true;
  if (result.status === 503) return true;
  return result.status >= 500;
}

function shouldDiscardQueuedPayload(result: SaveAttemptResult): boolean {
  if (result.networkError) return false;
  if (result.status === 401 || result.status === 429) return false;
  return result.status >= 400 && result.status < 500;
}

export function useSaveGameHistory() {
  const flushInFlightRef = useRef(false);

  const submit = useCallback(
    async (bodyPayload: GameHistoryPayload): Promise<SaveAttemptResult> => {
      try {
        const res = await fetch(`${API_URL}/api/history`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(bodyPayload),
        });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          return {
            historyId: data?.historyId || null,
            status: res.status,
            error: "",
            networkError: false,
          };
        }
        return {
          historyId: null,
          status: res.status,
          error: await readErrorMessage(res),
          networkError: false,
        };
      } catch {
        return {
          historyId: null,
          status: 0,
          error: "Network error",
          networkError: true,
        };
      }
    },
    [],
  );

  const submitWithRetry = useCallback(
    async (bodyPayload: GameHistoryPayload): Promise<SaveAttemptResult> => {
      let lastResult = await submit(bodyPayload);
      if (lastResult.historyId) return lastResult;

      for (const delayMs of SAVE_RETRY_DELAYS_MS) {
        if (!shouldRetrySaveAttempt(lastResult)) break;
        await new Promise((resolve) => window.setTimeout(resolve, delayMs));
        lastResult = await submit(bodyPayload);
        if (lastResult.historyId) return lastResult;
      }

      return lastResult;
    },
    [submit],
  );

  const flushQueuedHistorySaves = useCallback(async (): Promise<void> => {
    if (flushInFlightRef.current) return;
    flushInFlightRef.current = true;

    try {
      const queue = readQueuedHistoryPayloads();
      for (const item of queue) {
        const attempt = await submitWithRetry(item.payload);
        if (attempt.historyId || shouldDiscardQueuedPayload(attempt)) {
          removeQueuedHistoryPayload(item.payload.clientSaveKey);
          continue;
        }
        break;
      }
    } finally {
      flushInFlightRef.current = false;
    }
  }, [submitWithRetry]);

  useEffect(() => {
    void flushQueuedHistorySaves();
    if (typeof window === "undefined") return;

    const handleOnline = () => {
      void flushQueuedHistorySaves();
    };

    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [flushQueuedHistorySaves]);

  const saveGameHistory = useCallback(
    async (payload: GameHistoryPayload): Promise<string | null> => {
      if ((payload.moves?.length || 0) < MIN_STORED_MOVES) {
        return null;
      }

      const normalized = normalizePayload(payload);

      try {
        await flushQueuedHistorySaves();

        const firstAttempt = await submitWithRetry(normalized);
        if (firstAttempt.historyId) {
          removeQueuedHistoryPayload(normalized.clientSaveKey);
          historyErrorLogged = false;
          return firstAttempt.historyId;
        }

        if (normalized.variant === "chess960") {
          const fallbackPayload = buildChess960FallbackPayload(normalized);
          const retryAttempt = await submitWithRetry(fallbackPayload);
          if (retryAttempt.historyId) {
            removeQueuedHistoryPayload(fallbackPayload.clientSaveKey);
            historyErrorLogged = false;
            return retryAttempt.historyId;
          }

          if (
            shouldQueueSaveAttempt(firstAttempt) ||
            shouldQueueSaveAttempt(retryAttempt)
          ) {
            enqueueHistoryPayload(fallbackPayload);
          }

          if (!historyErrorLogged) {
            const primaryMsg = firstAttempt.error || firstAttempt.status || "N/A";
            const retryMsg = retryAttempt.error || retryAttempt.status || "N/A";
            console.warn(
              `Chess960 history save failed (primary: ${primaryMsg}, retry: ${retryMsg}).`,
            );
            historyErrorLogged = true;
          }
          return null;
        }

        if (shouldQueueSaveAttempt(firstAttempt)) {
          enqueueHistoryPayload(normalized);
        }

        if (!historyErrorLogged) {
          const reason = firstAttempt.error || firstAttempt.status || "N/A";
          console.warn(`History save failed (${reason}).`);
          historyErrorLogged = true;
        }
        return null;
      } catch {
        enqueueHistoryPayload(normalized);
        if (!historyErrorLogged) {
          console.warn(
            "History save skipped (API unavailable). Game continues locally.",
          );
          historyErrorLogged = true;
        }
        return null;
      }
    },
    [flushQueuedHistorySaves, submitWithRetry],
  );

  return saveGameHistory;
}
