import type {
  AdminLearnImportResponse,
  AdminLearnLessonsResponse,
  AdminLearnOverviewResponse,
  AdminLearnStepsResponse,
  CoursePayload,
  LessonPayload,
  StepPayload,
} from "./types";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  const isFormDataBody =
    typeof FormData !== "undefined" && options.body instanceof FormData;
  if (!isFormDataBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers,
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
  return request<AdminLearnOverviewResponse>(`/api/admin/learn-mn/courses${query}`);
}

export async function importAdminLearnCoursesFromEn(courseIds: string[]) {
  return request<AdminLearnImportResponse>("/api/admin/learn-mn/import-from-en", {
    method: "POST",
    body: JSON.stringify({ courseIds }),
  });
}

export async function fetchAdminLearnEnCoursesForImport() {
  return request<AdminLearnOverviewResponse>("/api/admin/learn/courses");
}

export async function createAdminLearnCourse(payload: CoursePayload) {
  return request<{ course: AdminLearnOverviewResponse["courses"][number] }>(
    "/api/admin/learn-mn/courses",
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
    `/api/admin/learn-mn/courses/${courseId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteAdminLearnCourse(courseId: string) {
  return request<{ success: boolean }>(`/api/admin/learn-mn/courses/${courseId}`, {
    method: "DELETE",
  });
}

export async function uploadAdminLearnCourseCoverImage(
  courseId: string,
  file: File,
) {
  const form = new FormData();
  form.append("coverImageFile", file);
  return request<{ course: AdminLearnOverviewResponse["courses"][number] }>(
    `/api/admin/learn-mn/courses/${courseId}/cover-image`,
    {
      method: "POST",
      body: form,
    },
  );
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
    `/api/admin/learn-mn/courses/${params.courseId}/lessons${query}`,
  );
}

export async function createAdminLearnLesson(
  courseId: string,
  payload: LessonPayload,
) {
  return request<{ lesson: AdminLearnLessonsResponse["lessons"][number] }>(
    `/api/admin/learn-mn/courses/${courseId}/lessons`,
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
    `/api/admin/learn-mn/lessons/${lessonId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteAdminLearnLesson(lessonId: string) {
  return request<{ success: boolean }>(`/api/admin/learn-mn/lessons/${lessonId}`, {
    method: "DELETE",
  });
}

export async function reorderAdminLearnLessons(
  courseId: string,
  lessonIds: string[],
) {
  return request<AdminLearnLessonsResponse>("/api/admin/learn-mn/lessons/reorder", {
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
    `/api/admin/learn-mn/lessons/${params.lessonId}/steps${query}`,
  );
}

export async function createAdminLearnStep(
  lessonId: string,
  payload: StepPayload,
) {
  return request<{ step: AdminLearnStepsResponse["steps"][number] }>(
    `/api/admin/learn-mn/lessons/${lessonId}/steps`,
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
    `/api/admin/learn-mn/steps/${stepId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteAdminLearnStep(stepId: string) {
  return request<{ success: boolean }>(`/api/admin/learn-mn/steps/${stepId}`, {
    method: "DELETE",
  });
}

export async function reorderAdminLearnSteps(lessonId: string, stepIds: string[]) {
  return request<{
    lesson: AdminLearnLessonsResponse["lessons"][number];
    steps: AdminLearnStepsResponse["steps"];
  }>("/api/admin/learn-mn/steps/reorder", {
    method: "POST",
    body: JSON.stringify({ lessonId, stepIds }),
  });
}


