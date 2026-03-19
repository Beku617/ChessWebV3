import type {
  AdminLearnLessonsResponse,
  AdminLearnOverviewResponse,
  AdminLearnStepsResponse,
  CoursePayload,
  LessonPayload,
  StepPayload,
} from "./types";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data?.error === "string" ? data.error : "Request failed.",
    );
  }

  return data as T;
}

function toQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    const safe = String(value || "").trim();
    if (!safe) return;
    query.set(key, safe);
  });
  const raw = query.toString();
  return raw ? `?${raw}` : "";
}

export async function fetchAdminLearnCourses(params: {
  search?: string;
  category?: string;
  difficulty?: string;
  status?: string;
}) {
  const query = toQuery(params);
  return request<AdminLearnOverviewResponse>(`/api/admin/learn/courses${query}`);
}

export async function createAdminLearnCourse(payload: CoursePayload) {
  return request<{ course: AdminLearnOverviewResponse["courses"][number] }>(
    "/api/admin/learn/courses",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function updateAdminLearnCourse(
  courseId: string,
  payload: Partial<CoursePayload>,
) {
  return request<{ course: AdminLearnOverviewResponse["courses"][number] }>(
    `/api/admin/learn/courses/${courseId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteAdminLearnCourse(courseId: string) {
  return request<{ success: boolean }>(`/api/admin/learn/courses/${courseId}`, {
    method: "DELETE",
  });
}

export async function fetchAdminLearnLessons(params: {
  courseId: string;
  search?: string;
  status?: string;
}) {
  const query = toQuery({
    search: params.search,
    status: params.status,
  });
  return request<AdminLearnLessonsResponse>(
    `/api/admin/learn/courses/${params.courseId}/lessons${query}`,
  );
}

export async function createAdminLearnLesson(
  courseId: string,
  payload: LessonPayload,
) {
  return request<{ lesson: AdminLearnLessonsResponse["lessons"][number] }>(
    `/api/admin/learn/courses/${courseId}/lessons`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function updateAdminLearnLesson(
  lessonId: string,
  payload: Partial<LessonPayload>,
) {
  return request<{ lesson: AdminLearnLessonsResponse["lessons"][number] }>(
    `/api/admin/learn/lessons/${lessonId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteAdminLearnLesson(lessonId: string) {
  return request<{ success: boolean }>(`/api/admin/learn/lessons/${lessonId}`, {
    method: "DELETE",
  });
}

export async function reorderAdminLearnLessons(
  courseId: string,
  lessonIds: string[],
) {
  return request<AdminLearnLessonsResponse>("/api/admin/learn/lessons/reorder", {
    method: "POST",
    body: JSON.stringify({ courseId, lessonIds }),
  });
}

export async function fetchAdminLearnSteps(params: {
  lessonId: string;
  search?: string;
}) {
  const query = toQuery({ search: params.search });
  return request<AdminLearnStepsResponse>(
    `/api/admin/learn/lessons/${params.lessonId}/steps${query}`,
  );
}

export async function createAdminLearnStep(
  lessonId: string,
  payload: StepPayload,
) {
  return request<{ step: AdminLearnStepsResponse["steps"][number] }>(
    `/api/admin/learn/lessons/${lessonId}/steps`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function updateAdminLearnStep(
  stepId: string,
  payload: Partial<StepPayload>,
) {
  return request<{ step: AdminLearnStepsResponse["steps"][number] }>(
    `/api/admin/learn/steps/${stepId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteAdminLearnStep(stepId: string) {
  return request<{ success: boolean }>(`/api/admin/learn/steps/${stepId}`, {
    method: "DELETE",
  });
}

export async function reorderAdminLearnSteps(lessonId: string, stepIds: string[]) {
  return request<{
    lesson: AdminLearnLessonsResponse["lessons"][number];
    steps: AdminLearnStepsResponse["steps"];
  }>("/api/admin/learn/steps/reorder", {
    method: "POST",
    body: JSON.stringify({ lessonId, stepIds }),
  });
}
