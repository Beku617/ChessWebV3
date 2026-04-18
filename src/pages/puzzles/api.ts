import type {
  PuzzleAttemptResponse,
  PuzzleHistoryResponse,
  PuzzleItem,
  PuzzleLibraryResponse,
  PuzzleMode,
  PuzzleSelectionResponse,
  PuzzleUserStats,
} from "./types";

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

async function parseJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(
      String((data as { error?: string }).error || "Request failed"),
    );
  }

  return data;
}

export async function fetchPuzzleStats(): Promise<PuzzleUserStats> {
  const response = await fetch(`${API_URL}/api/puzzles/me/stats`, {
    credentials: "include",
  });
  return parseJson<PuzzleUserStats>(response);
}

export async function fetchPuzzleById(puzzleId: string): Promise<PuzzleItem> {
  const response = await fetch(`${API_URL}/api/puzzles/${puzzleId}`, {
    credentials: "include",
  });
  return parseJson<PuzzleItem>(response);
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

  const response = await fetch(`${API_URL}/api/puzzles/select?${params}`, {
    credentials: "include",
  });
  return parseJson<PuzzleSelectionResponse>(response);
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

  const response = await fetch(`${API_URL}/api/puzzles/library?${query}`, {
    credentials: "include",
  });
  return parseJson<PuzzleLibraryResponse>(response);
}

export async function fetchPuzzleReviewQueue(): Promise<{
  items: PuzzleItem[];
  total: number;
  message?: string | null;
}> {
  const response = await fetch(`${API_URL}/api/puzzles/review`, {
    credentials: "include",
  });
  return parseJson(response);
}

export async function fetchPuzzleHistory(
  limit = 50,
): Promise<PuzzleHistoryResponse> {
  const response = await fetch(`${API_URL}/api/puzzles/history?limit=${limit}`, {
    credentials: "include",
  });
  return parseJson<PuzzleHistoryResponse>(response);
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
  const response = await fetch(`${API_URL}/api/puzzles/${puzzleId}/attempt`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson<PuzzleAttemptResponse>(response);
}

export async function togglePuzzleBookmark(
  puzzleId: string,
  isBookmarked?: boolean,
): Promise<{ success: boolean; isBookmarked: boolean }> {
  const response = await fetch(`${API_URL}/api/puzzles/${puzzleId}/bookmark`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      typeof isBookmarked === "boolean" ? { isBookmarked } : {},
    ),
  });
  return parseJson(response);
}

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
