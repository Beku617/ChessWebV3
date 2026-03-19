export type LearnCategory = "Openings" | "Middlegame" | "Endgame" | "Strategy";
export type LearnDifficulty = "Beginner" | "Intermediate" | "Advanced";
export type LearnProgressStatus = "not_started" | "in_progress" | "completed";

export interface LearnCourseLessonListItem {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  orderIndex: number;
  estimatedMinutes: number;
}

export interface LearnCourseProgressView {
  percentComplete: number;
  completedLessonsCount: number;
  totalLessons: number;
  status: LearnProgressStatus;
  currentLessonSlug: string;
  continueLessonSlug: string;
  totalSteps: number;
}

export interface LearnCatalogCourse {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  category: LearnCategory;
  difficulty: LearnDifficulty;
  coverImage: string;
  icon: string;
  instructorName: string;
  tags: string[];
  totalLessons: number;
  isPublished: boolean;
  lessons: LearnCourseLessonListItem[];
  progress: LearnCourseProgressView;
}

export interface LearnSummary {
  watchedLessons: number;
  completedLessons: number;
  dayStreak: number;
  inProgressCourses: number;
  completedCourses: number;
}

export interface LearnCatalogResponse {
  courses: LearnCatalogCourse[];
  summary: LearnSummary;
}

export interface LearnLessonSidebarItem {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  orderIndex: number;
  estimatedMinutes: number;
  stepCount: number;
  isCompleted: boolean;
}

export interface LearnLessonStep {
  id: string;
  orderIndex: number;
  title: string;
  instructionText: string;
  explanationBeforeMove: string;
  fen: string;
  sideToMove: "white" | "black";
  feedbackCorrect: string;
  feedbackWrong: string;
  hintText: string;
  autoAdvance: boolean;
  keepPositionOnWrong: boolean;
  nextFen: string;
}

export interface LearnLessonProgress {
  lessonCompleted: boolean;
  currentStepIndex: number;
  completedStepIndexes: number[];
  courseProgress: LearnCourseProgressView;
}

export interface LearnLessonDetail {
  course: {
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
  };
  lesson: {
    id: string;
    slug: string;
    title: string;
    subtitle: string;
    description: string;
    estimatedMinutes: number;
    orderIndex: number;
  };
  lessons: LearnLessonSidebarItem[];
  steps: LearnLessonStep[];
  progress: LearnLessonProgress;
}

export interface LearnSubmitStepResponse {
  isCorrect: boolean;
  isValid: boolean;
  reason: string | null;
  feedback: string;
  stepIndex: number;
  nextStepIndex: number;
  lessonCompleted: boolean;
  courseCompleted?: boolean;
  autoAdvance?: boolean;
  keepPositionOnWrong?: boolean;
  resetFen?: string;
  boardFenAfterMove?: string;
  move?: {
    san: string;
    from: string;
    to: string;
    promotion: string;
    uci: string;
  };
  progress: LearnLessonProgress;
}
