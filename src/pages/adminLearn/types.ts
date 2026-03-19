export type LearnCategory = "Openings" | "Middlegame" | "Endgame" | "Strategy";
export type LearnDifficulty = "Beginner" | "Intermediate" | "Advanced";

export interface AdminLearnCourse {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  category: LearnCategory;
  difficulty: LearnDifficulty;
  instructorName: string;
  coverImage: string;
  icon: string;
  tags: string[];
  totalLessons: number;
  publishedLessons: number;
  isPublished: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AdminLearnLesson {
  id: string;
  courseId: string;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  orderIndex: number;
  estimatedMinutes: number;
  isPublished: boolean;
  stepCount: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AdminLearnStep {
  id: string;
  lessonId: string;
  orderIndex: number;
  title: string;
  instructionText: string;
  explanationBeforeMove: string;
  fen: string;
  sideToMove: "white" | "black";
  acceptedMoves: string[];
  feedbackCorrect: string;
  feedbackWrong: string;
  hintText: string;
  autoAdvance: boolean;
  keepPositionOnWrong: boolean;
  nextFen: string;
  successCondition: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AdminLearnStats {
  totalCourses: number;
  totalLessons: number;
  totalPublished: number;
}

export interface AdminLearnOverviewResponse {
  courses: AdminLearnCourse[];
  stats: AdminLearnStats;
  options: {
    categories: LearnCategory[];
    difficulties: LearnDifficulty[];
  };
}

export interface AdminLearnLessonsResponse {
  course: AdminLearnCourse;
  lessons: AdminLearnLesson[];
}

export interface AdminLearnStepsResponse {
  course: AdminLearnCourse;
  lesson: AdminLearnLesson;
  steps: AdminLearnStep[];
}

export interface CoursePayload {
  title: string;
  slug?: string;
  subtitle?: string;
  description?: string;
  category: LearnCategory;
  difficulty: LearnDifficulty;
  instructorName?: string;
  tags?: string[] | string;
  coverImage?: string;
  icon?: string;
  isPublished?: boolean;
}

export interface LessonPayload {
  title: string;
  slug?: string;
  subtitle?: string;
  description?: string;
  estimatedMinutes?: number;
  orderIndex?: number;
  isPublished?: boolean;
}

export interface StepPayload {
  title?: string;
  orderIndex?: number;
  instructionText: string;
  explanationBeforeMove?: string;
  fen: string;
  sideToMove: "white" | "black";
  acceptedMoves: string[] | string;
  feedbackCorrect: string;
  feedbackWrong: string;
  hintText?: string;
  autoAdvance?: boolean;
  keepPositionOnWrong?: boolean;
  nextFen?: string;
  successCondition?: string;
}
