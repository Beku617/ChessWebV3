import { useCallback } from "react";
import { API_URL, GameHistoryPayload } from "./useStockfishGameTypes";
import { MIN_STORED_MOVES } from "./gameHistorySaver/historyPersistence";

let historyErrorLogged = false;
const CHESS960_EVENT_FALLBACK = "Live Chess960";
const CHESS960_SITE_FALLBACK = "NeonGambit";
const UNRATED_VARIANTS = new Set([
  "chess960",
  "threeCheck",
  "kingOfHill",
  "atomic",
]);
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

function normalizePayload(payload: GameHistoryPayload): GameHistoryPayload {
  if (!UNRATED_VARIANTS.has(String(payload.variant || "standard"))) {
    return payload;
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

  return normalized;
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

export function useSaveGameHistory() {
  const saveGameHistory = useCallback(
    async (payload: GameHistoryPayload): Promise<string | null> => {
      if ((payload.moves?.length || 0) < MIN_STORED_MOVES) {
        return null;
      }

      const submit = async (
        bodyPayload: GameHistoryPayload,
      ): Promise<{
        historyId: string | null;
        status: number;
        error: string;
        networkError: boolean;
      }> => {
        try {
          const res = await fetch(`${API_URL}/api/history`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(bodyPayload),
          });
          if (res.ok) {
            const data = await res.json();
            return {
              historyId: data.historyId || null,
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
      };

      try {
        const normalized = normalizePayload(payload);
        const firstAttempt = await submit(normalized);
        if (firstAttempt.historyId) {
          historyErrorLogged = false;
          return firstAttempt.historyId;
        }

        if (normalized.variant === "chess960") {
          const fallbackPayload = buildChess960FallbackPayload(normalized);
          const retryAttempt = await submit(fallbackPayload);
          if (retryAttempt.historyId) {
            historyErrorLogged = false;
            return retryAttempt.historyId;
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

        if (!historyErrorLogged) {
          const reason = firstAttempt.error || firstAttempt.status || "N/A";
          console.warn(`History save failed (${reason}).`);
          historyErrorLogged = true;
        }
        return null;
      } catch {
        if (!historyErrorLogged) {
          console.warn(
            "History save skipped (API unavailable). Game continues locally.",
          );
          historyErrorLogged = true;
        }
        return null;
      }
    },
    [],
  );

  return saveGameHistory;
}
