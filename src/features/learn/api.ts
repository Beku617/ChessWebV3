import type {
  LearnCatalogResponse,
  LearnLessonDetail,
  LearnLessonProgress,
  LearnPairMappingResponse,
  LearnSubmitStepResponse,
  LearnSummary,
} from "./types";

const API_URL = import.meta.env.VITE_API_URL;

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof data?.error === "string" ? data.error : "Request failed";
    throw new Error(message);
  }
  return data as T;
}

function toQueryString(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed) return;
    search.set(key, trimmed);
  });
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export async function fetchLearnCatalog(params: {
  q?: string;
  category?: string;
  difficulty?: string;
  progress?: string;
}): Promise<LearnCatalogResponse> {
  const query = toQueryString(params);
  const response = await fetch(`${API_URL}/api/learn/courses${query}`, {
    credentials: "include",
  });
  return parseResponse<LearnCatalogResponse>(response);
}

export async function fetchLearnCourse(courseSlug: string) {
  const response = await fetch(`${API_URL}/api/learn/courses/${courseSlug}`, {
    credentials: "include",
  });
  return parseResponse(response);
}

export async function fetchLearnLesson(
  courseSlug: string,
  lessonSlug: string,
): Promise<LearnLessonDetail> {
  const response = await fetch(
    `${API_URL}/api/learn/lessons/${courseSlug}/${lessonSlug}`,
    {
      credentials: "include",
    },
  );
  return parseResponse<LearnLessonDetail>(response);
}

export async function fetchLearnProgressSummary(): Promise<LearnSummary> {
  const response = await fetch(`${API_URL}/api/learn/progress/me`, {
    credentials: "include",
  });
  return parseResponse<LearnSummary>(response);
}

export async function fetchLearnLessonProgress(
  courseSlug: string,
  lessonSlug: string,
): Promise<LearnLessonProgress> {
  const response = await fetch(
    `${API_URL}/api/learn/progress/${courseSlug}/${lessonSlug}`,
    {
      credentials: "include",
    },
  );
  return parseResponse<LearnLessonProgress>(response);
}

export async function submitLearnLessonStep(
  courseSlug: string,
  lessonSlug: string,
  payload: {
    stepIndex: number;
    move?: string;
    san?: string;
    uci?: string;
    from?: string;
    to?: string;
    promotion?: string;
  },
): Promise<LearnSubmitStepResponse> {
  const response = await fetch(
    `${API_URL}/api/learn/progress/${courseSlug}/${lessonSlug}/step`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  return parseResponse<LearnSubmitStepResponse>(response);
}

export async function completeLearnLesson(
  courseSlug: string,
  lessonSlug: string,
) {
  const response = await fetch(
    `${API_URL}/api/learn/progress/${courseSlug}/${lessonSlug}/complete`,
    {
      method: "POST",
      credentials: "include",
    },
  );
  return parseResponse(response);
}

export async function searchLearnContent(query: string) {
  const qs = toQueryString({ q: query });
  const response = await fetch(`${API_URL}/api/learn/search${qs}`, {
    credentials: "include",
  });
  return parseResponse(response);
}

export async function fetchLearnPairMapping(
  pairId: string,
): Promise<LearnPairMappingResponse> {
  const response = await fetch(`${API_URL}/api/learn/pair/${pairId}`, {
    credentials: "include",
  });
  return parseResponse<LearnPairMappingResponse>(response);
}
