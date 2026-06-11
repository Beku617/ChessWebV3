import type {
  PuzzleAttemptResponse,
  PuzzleHistoryResponse,
  PuzzleItem,
  PuzzleLibraryResponse,
  PuzzleMode,
  PuzzleSelectionResponse,
  PuzzleUserStats,
} from "./types";

export const API_URL = import.meta.env.VITE_API_URL;

const DB_RETRY_DELAYS_MS = [250, 750];

type ApiErrorPayload = {
  error?: string;
  message?: string;
};

class ApiRequestError extends Error {
  status: number;
  payload: ApiErrorPayload;

  constructor(status: number, payload: ApiErrorPayload) {
    super(
      String(
        payload.error ||
          payload.message ||
          `Request failed with status ${status}`,
      ),
    );
    this.name = "ApiRequestError";
    this.status = status;
    this.payload = payload;
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new ApiRequestError(response.status, data);
  }

  return data;
}

function isDbNotReadyError(error: unknown): error is ApiRequestError {
  if (!(error instanceof ApiRequestError)) return false;
  if (error.status !== 503) return false;
  return /database connection is not ready/i.test(String(error.message || ""));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson<T>(
  input: string,
  init?: RequestInit,
  options: { retryDbNotReady?: boolean } = {},
): Promise<T> {
  const maxAttempts = options.retryDbNotReady
    ? DB_RETRY_DELAYS_MS.length + 1
    : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(input, init);
    try {
      return await parseJson<T>(response);
    } catch (error) {
      const shouldRetry =
        options.retryDbNotReady &&
        attempt < maxAttempts - 1 &&
        isDbNotReadyError(error);
      if (!shouldRetry) throw error;

      await delay(DB_RETRY_DELAYS_MS[attempt] ?? 500);
    }
  }

  throw new Error("Request failed");
}

export async function fetchPuzzleStats(): Promise<PuzzleUserStats> {
  return fetchJson<PuzzleUserStats>(`${API_URL}/api/puzzles/me/stats`, {
    credentials: "include",
  }, {
    retryDbNotReady: true,
  });
}

export async function fetchPuzzleById(puzzleId: string): Promise<PuzzleItem> {
  return fetchJson<PuzzleItem>(`${API_URL}/api/puzzles/${puzzleId}`, {
    credentials: "include",
  }, {
    retryDbNotReady: true,
  });
}

export async function fetchPuzzleSelection(
  mode: PuzzleMode,
  options: {
    includeMastered?: boolean;
    localDateKey?: string;
  } = {},
): Promise<PuzzleSelectionResponse> {
  const params = new URLSearchParams();
  params.set("mode", mode);
  if (options.includeMastered) params.set("includeMastered", "true");
  if (options.localDateKey) params.set("dateKey", options.localDateKey);

  return fetchJson<PuzzleSelectionResponse>(`${API_URL}/api/puzzles/select?${params}`, {
    credentials: "include",
  }, {
    retryDbNotReady: true,
  });
}

export async function fetchPuzzleLibrary(params: {
  query?: string;
  difficulty?: "Easy" | "Medium" | "Hard" | "";
  status?:
    | "all"
    | "new"
    | "solved"
    | "failed_before"
    | "review_due"
    | "mastered"
    | "bookmarked";
  includeMastered?: boolean;
  minRating?: number;
  maxRating?: number;
}): Promise<PuzzleLibraryResponse> {
  const query = new URLSearchParams();
  if (params.query?.trim()) query.set("query", params.query.trim());
  if (params.difficulty) query.set("difficulty", params.difficulty);
  if (params.status) query.set("status", params.status);
  if (params.includeMastered) query.set("includeMastered", "true");
  if (Number.isFinite(params.minRating))
    query.set("minRating", String(params.minRating));
  if (Number.isFinite(params.maxRating))
    query.set("maxRating", String(params.maxRating));

  return fetchJson<PuzzleLibraryResponse>(`${API_URL}/api/puzzles/library?${query}`, {
    credentials: "include",
  }, {
    retryDbNotReady: true,
  });
}

export async function fetchPuzzleReviewQueue(): Promise<{
  items: PuzzleItem[];
  total: number;
  message?: string | null;
}> {
  return fetchJson(`${API_URL}/api/puzzles/review`, {
    credentials: "include",
  }, {
    retryDbNotReady: true,
  });
}

export async function fetchPuzzleHistory(
  limit = 50,
): Promise<PuzzleHistoryResponse> {
  return fetchJson<PuzzleHistoryResponse>(`${API_URL}/api/puzzles/history?limit=${limit}`, {
    credentials: "include",
  }, {
    retryDbNotReady: true,
  });
}

export async function submitPuzzleAttempt(
  puzzleId: string,
  payload: {
    mode: PuzzleMode;
    result: "SOLVED" | "FAILED" | "SKIPPED" | "ABANDONED";
    movesPlayed?: string[];
    timeMs?: number;
    hintsUsed?: number;
    solutionShown?: boolean;
    localDateKey?: string;
  },
): Promise<PuzzleAttemptResponse> {
  return fetchJson<PuzzleAttemptResponse>(`${API_URL}/api/puzzles/${puzzleId}/attempt`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }, {
    retryDbNotReady: true,
  });
}

export async function togglePuzzleBookmark(
  puzzleId: string,
  isBookmarked?: boolean,
): Promise<{ success: boolean; isBookmarked: boolean }> {
  return fetchJson(`${API_URL}/api/puzzles/${puzzleId}/bookmark`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      typeof isBookmarked === "boolean" ? { isBookmarked } : {},
    ),
  }, {
    retryDbNotReady: true,
  });
}

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
