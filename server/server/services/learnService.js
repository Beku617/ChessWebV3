import mongoose from "mongoose";
import {
  LearnCourse,
  LearnLesson,
  LearnLessonStep,
  UserLearnProgress,
} from "../models/index.js";
import { validateLessonMove } from "./learnMoveValidation.js";

const PUBLISHED_STEP_FILTER = {
  $or: [{ isPublished: true }, { isPublished: { $exists: false } }],
};

function escapeRegex(value = "") {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toUtcDayKey(dateValue = new Date()) {
  return new Date(dateValue).toISOString().slice(0, 10);
}

function toId(value) {
  return value ? String(value) : "";
}

function idEquals(a, b) {
  return toId(a) === toId(b);
}

function asObjectId(value) {
  return new mongoose.Types.ObjectId(String(value));
}

function uniqueIds(values = []) {
  return Array.from(new Set(values.map((entry) => toId(entry)).filter(Boolean)));
}

function countCompletedLessons(progress) {
  return uniqueIds(progress?.completedLessons || []).length;
}

function calculateCoursePercentComplete(progress, totalLessons) {
  const safeTotal = Math.max(0, Number(totalLessons) || 0);
  if (safeTotal <= 0) return 0;
  const completed = Math.min(countCompletedLessons(progress), safeTotal);
  return Math.max(0, Math.min(100, Math.round((completed / safeTotal) * 100)));
}

function calculateDayStreak(activityDays = []) {
  const daySet = new Set((activityDays || []).map((entry) => String(entry)));
  if (daySet.size === 0) return 0;

  let streak = 0;
  const cursor = new Date();
  while (true) {
    const key = toUtcDayKey(cursor);
    if (!daySet.has(key)) break;
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return streak;
}

function normalizeProgressStatus(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "not_started" ||
    normalized === "in_progress" ||
    normalized === "completed"
  ) {
    return normalized;
  }
  return "all";
}

function normalizeDifficulty(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "beginner") return "Beginner";
  if (raw === "intermediate") return "Intermediate";
  if (raw === "advanced") return "Advanced";
  return "";
}

function normalizeCategory(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "openings") return "Openings";
  if (raw === "middlegame") return "Middlegame";
  if (raw === "endgame") return "Endgame";
  if (raw === "strategy") return "Strategy";
  return "";
}

function clampStepIndex(index, stepCount) {
  if (!Number.isFinite(index) || index < 0) return 0;
  if (stepCount <= 0) return 0;
  return Math.min(stepCount - 1, Math.floor(index));
}

function getContiguousCompletedIndex(indexes = []) {
  const sorted = Array.from(new Set(indexes))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  let expected = 0;
  for (const value of sorted) {
    if (value !== expected) break;
    expected += 1;
  }
  return expected;
}

function getStepCountsMap(stepCountRows = []) {
  return stepCountRows.reduce((acc, row) => {
    acc[toId(row._id)] = Number(row.count || 0);
    return acc;
  }, {});
}

function buildLessonLookup(lessons = []) {
  return lessons.reduce((acc, lesson) => {
    acc[toId(lesson._id)] = lesson;
    return acc;
  }, {});
}

function getLessonCompletedStepIndexes(progress, lessonId) {
  if (!progress?.completedSteps?.length) return [];
  return progress.completedSteps
    .filter((entry) => idEquals(entry.lessonId, lessonId))
    .map((entry) => Number(entry.stepIndex))
    .filter((value) => Number.isFinite(value) && value >= 0);
}

function lessonIsCompleted(progress, lessonId) {
  if (!progress?.completedLessons?.length) return false;
  return progress.completedLessons.some((entry) => idEquals(entry, lessonId));
}

function ensureActivityDay(progress, now = new Date()) {
  const key = toUtcDayKey(now);
  const days = new Set((progress.activityDays || []).map((entry) => String(entry)));
  days.add(key);
  progress.activityDays = Array.from(days).sort();
}

function markCompletedStep(progress, lessonId, stepIndex, now = new Date()) {
  const exists = (progress.completedSteps || []).some(
    (entry) => idEquals(entry.lessonId, lessonId) && Number(entry.stepIndex) === stepIndex,
  );
  if (!exists) {
    progress.completedSteps.push({
      lessonId: asObjectId(lessonId),
      stepIndex,
      completedAt: now,
    });
  }
}

function markLessonCompleted(progress, lessonId) {
  const exists = (progress.completedLessons || []).some((entry) =>
    idEquals(entry, lessonId),
  );
  if (!exists) {
    progress.completedLessons.push(asObjectId(lessonId));
  }
}

function resolveContinueLessonSlug({
  lessons,
  progress,
}) {
  if (!lessons.length) return "";
  const lessonById = buildLessonLookup(lessons);

  const current = lessonById[toId(progress?.lessonId)];
  if (current && !lessonIsCompleted(progress, current._id)) {
    return current.slug;
  }

  const completedLessonIdSet = new Set(
    (progress?.completedLessons || []).map((entry) => toId(entry)),
  );
  const firstIncomplete = lessons.find(
    (lesson) => !completedLessonIdSet.has(toId(lesson._id)),
  );
  return firstIncomplete?.slug || lessons[lessons.length - 1].slug;
}

function buildCourseProgressView({
  course,
  lessons,
  progress,
  stepCountsByLessonId,
}) {
  const totalLessons = lessons.length;
  const completedLessonsCount = countCompletedLessons(progress);
  const percentComplete = calculateCoursePercentComplete(progress, totalLessons);

  let status = "not_started";
  if (completedLessonsCount >= totalLessons && totalLessons > 0) {
    status = "completed";
  } else if (percentComplete > 0 || (progress?.completedSteps || []).length > 0) {
    status = "in_progress";
  }

  const continueLessonSlug = resolveContinueLessonSlug({ lessons, progress });

  return {
    percentComplete,
    completedLessonsCount,
    totalLessons,
    status,
    currentLessonSlug: (() => {
      const match = lessons.find((lesson) => idEquals(lesson._id, progress?.lessonId));
      return match?.slug || continueLessonSlug || lessons[0]?.slug || "";
    })(),
    continueLessonSlug: continueLessonSlug || lessons[0]?.slug || "",
    totalSteps: Object.values(stepCountsByLessonId).reduce(
      (sum, count) => sum + Number(count || 0),
      0,
    ),
  };
}

function serializeCatalogCourse({
  course,
  lessons,
  progressView,
}) {
  return {
    id: toId(course._id),
    slug: course.slug,
    title: course.title,
    subtitle: course.subtitle || "",
    description: course.description || "",
    category: course.category,
    difficulty: course.difficulty,
    coverImage: course.coverImage || "",
    badge: course.badge || "",
    icon: course.icon || "",
    instructorName: course.instructorName || "",
    tags: Array.isArray(course.tags) ? course.tags : [],
    sortOrder: Number(course.sortOrder || 0),
    totalLessons: lessons.length,
    isPublished: !!course.isPublished,
    lessons: lessons.map((lesson) => ({
      id: toId(lesson._id),
      slug: lesson.slug,
      title: lesson.title,
      subtitle: lesson.subtitle || "",
      orderIndex: Number(lesson.orderIndex || 0),
      estimatedMinutes: Number(lesson.estimatedMinutes || 0),
    })),
    progress: progressView,
  };
}

function serializeLessonStep(step, index) {
  const acceptedMoves = Array.isArray(step.acceptedMoves) ? step.acceptedMoves : [];
  const successMessage =
    String(step.successMessage || "").trim() ||
    String(step.feedbackCorrect || "").trim();
  const wrongMoveMessage =
    String(step.wrongMoveMessage || "").trim() ||
    String(step.feedbackWrong || "").trim();

  return {
    id: toId(step._id),
    orderIndex: Number(step.orderIndex || index),
    title: step.title || "",
    instructionText: step.instructionText || "",
    explanationBeforeMove: step.explanationBeforeMove || "",
    explanationText: step.explanationBeforeMove || "",
    fen: step.fen,
    sideToMove: step.sideToMove,
    boardOrientation:
      String(step.boardOrientation || "").toLowerCase() === "black"
        ? "black"
        : "white",
    acceptedMoves,
    correctMoves: acceptedMoves,
    validationMode:
      String(step.validationMode || "").toLowerCase() === "exact"
        ? "exact"
        : "one_of_many",
    feedbackCorrect: successMessage,
    feedbackWrong: wrongMoveMessage,
    successMessage,
    wrongMoveMessage,
    hintText: step.hintText || "",
    allowRetry: step.allowRetry !== false,
    autoAdvance: !!step.autoAdvance,
    keepPositionOnWrong: !!step.keepPositionOnWrong,
    nextFen: step.nextFen || "",
    annotations:
      step.annotations && typeof step.annotations === "object"
        ? step.annotations
        : {},
  };
}

async function fetchPublishedCourseBySlug(courseSlug) {
  const safeSlug = String(courseSlug || "").trim();
  if (!safeSlug) return null;

  return LearnCourse.findOne({
    slug: { $regex: `^${escapeRegex(safeSlug)}$`, $options: "i" },
    isPublished: true,
  }).lean();
}

async function fetchLessonsForCourse(courseId) {
  return LearnLesson.find({
    courseId,
    isPublished: true,
  })
    .sort({ orderIndex: 1, createdAt: 1 })
    .lean();
}

async function fetchLessonStepsForLessons(lessonIds) {
  const ids = (lessonIds || []).map((entry) => asObjectId(entry));
  if (!ids.length) return [];

  return LearnLessonStep.find({
    lessonId: { $in: ids },
    ...PUBLISHED_STEP_FILTER,
  })
    .sort({ lessonId: 1, orderIndex: 1, createdAt: 1 })
    .lean();
}

async function fetchStepCounts(lessonIds) {
  const ids = (lessonIds || []).map((entry) => asObjectId(entry));
  if (!ids.length) return {};

  const rows = await LearnLessonStep.aggregate([
    {
      $match: {
        lessonId: { $in: ids },
        ...PUBLISHED_STEP_FILTER,
      },
    },
    { $group: { _id: "$lessonId", count: { $sum: 1 } } },
  ]);
  return getStepCountsMap(rows);
}

function bundleLessonsByCourse(lessons = []) {
  return lessons.reduce((acc, lesson) => {
    const key = toId(lesson.courseId);
    if (!acc[key]) acc[key] = [];
    acc[key].push(lesson);
    return acc;
  }, {});
}

function bundleStepsByLesson(steps = []) {
  return steps.reduce((acc, step) => {
    const key = toId(step.lessonId);
    if (!acc[key]) acc[key] = [];
    acc[key].push(step);
    return acc;
  }, {});
}

async function findOrCreateProgress({
  userId,
  courseId,
  fallbackLessonId,
  fallbackStepIndex = 0,
}) {
  const userObjectId = asObjectId(userId);
  const courseObjectId = asObjectId(courseId);
  const lessonObjectId = asObjectId(fallbackLessonId);

  let progress = await UserLearnProgress.findOne({
    userId: userObjectId,
    courseId: courseObjectId,
  });

  if (!progress) {
    progress = new UserLearnProgress({
      userId: userObjectId,
      courseId: courseObjectId,
      lessonId: lessonObjectId,
      currentStepIndex: Math.max(0, Number(fallbackStepIndex) || 0),
      completedSteps: [],
      completedLessons: [],
      startedAt: new Date(),
      lastViewedAt: new Date(),
      percentComplete: 0,
      activityDays: [],
      lastInteractionAt: null,
    });
  }

  return progress;
}

function computeLessonProgressView({
  lesson,
  lessons,
  lessonSteps,
  progress,
  stepCountsByLessonId,
}) {
  const stepCount = lessonSteps.length;
  const completedStepIndexes = getLessonCompletedStepIndexes(progress, lesson._id);
  const completedIndexSet = new Set(completedStepIndexes);
  const isCompleted =
    lessonIsCompleted(progress, lesson._id) ||
    (stepCount > 0 &&
      Array.from({ length: stepCount }).every((_, index) =>
        completedIndexSet.has(index),
      ));

  let currentStepIndex = 0;
  if (stepCount > 0) {
    if (idEquals(progress?.lessonId, lesson._id)) {
      currentStepIndex = clampStepIndex(progress?.currentStepIndex ?? 0, stepCount);
    } else if (isCompleted) {
      currentStepIndex = stepCount - 1;
    } else {
      const contiguous = getContiguousCompletedIndex(completedStepIndexes);
      currentStepIndex = clampStepIndex(contiguous, stepCount);
    }
  }

  const courseProgress = buildCourseProgressView({
    course: null,
    lessons,
    progress,
    stepCountsByLessonId,
  });

  return {
    lessonCompleted: isCompleted,
    currentStepIndex,
    completedStepIndexes: Array.from(completedIndexSet).sort((a, b) => a - b),
    courseProgress,
  };
}

async function getCourseCatalog({
  userId,
  query,
  category,
  difficulty,
  progressStatus,
}) {
  const normalizedCategory = normalizeCategory(category);
  const normalizedDifficulty = normalizeDifficulty(difficulty);
  const normalizedProgress = normalizeProgressStatus(progressStatus);

  const courseFilter = { isPublished: true };
  if (normalizedCategory) courseFilter.category = normalizedCategory;
  if (normalizedDifficulty) courseFilter.difficulty = normalizedDifficulty;

  let courses = await LearnCourse.find(courseFilter)
    .sort({ sortOrder: 1, updatedAt: -1, createdAt: -1 })
    .lean();

  if (!courses.length) return [];

  const courseIds = courses.map((course) => asObjectId(course._id));
  const lessons = await LearnLesson.find({
    courseId: { $in: courseIds },
    isPublished: true,
  })
    .sort({ orderIndex: 1, createdAt: 1 })
    .lean();

  const lessonsByCourseId = bundleLessonsByCourse(lessons);
  const safeQuery = String(query || "").trim().toLowerCase();
  if (safeQuery) {
    courses = courses.filter((course) => {
      const lessonEntries = lessonsByCourseId[toId(course._id)] || [];
      const courseText = [
        course.title,
        course.subtitle,
        course.description,
        course.instructorName,
        ...(Array.isArray(course.tags) ? course.tags : []),
      ]
        .join(" ")
        .toLowerCase();
      const lessonText = lessonEntries
        .map((lesson) => `${lesson.title} ${lesson.subtitle} ${lesson.description}`)
        .join(" ")
        .toLowerCase();
      return courseText.includes(safeQuery) || lessonText.includes(safeQuery);
    });
  }

  if (!courses.length) return [];

  const filteredCourseIds = courses.map((course) => asObjectId(course._id));
  const filteredLessons = lessons.filter((lesson) =>
    filteredCourseIds.some((entry) => idEquals(entry, lesson.courseId)),
  );
  const filteredLessonsByCourseId = bundleLessonsByCourse(filteredLessons);

  const lessonIds = filteredLessons.map((lesson) => lesson._id);
  const stepCountsByLessonId = await fetchStepCounts(lessonIds);

  const progressDocs = await UserLearnProgress.find({
    userId: asObjectId(userId),
    courseId: { $in: filteredCourseIds },
  }).lean();
  const progressByCourseId = progressDocs.reduce((acc, progress) => {
    acc[toId(progress.courseId)] = progress;
    return acc;
  }, {});

  const mapped = courses.map((course) => {
    const courseLessons = filteredLessonsByCourseId[toId(course._id)] || [];
    const progress = progressByCourseId[toId(course._id)] || null;
    const progressView = buildCourseProgressView({
      course,
      lessons: courseLessons,
      progress,
      stepCountsByLessonId,
    });

    return serializeCatalogCourse({
      course,
      lessons: courseLessons,
      progressView,
    });
  });

  if (normalizedProgress === "all") return mapped;
  return mapped.filter((course) => course.progress.status === normalizedProgress);
}

async function getCourseBySlug({ userId, courseSlug }) {
  const course = await fetchPublishedCourseBySlug(courseSlug);
  if (!course) return null;

  const lessons = await fetchLessonsForCourse(course._id);
  const stepCountsByLessonId = await fetchStepCounts(lessons.map((lesson) => lesson._id));
  const progress = await UserLearnProgress.findOne({
    userId: asObjectId(userId),
    courseId: asObjectId(course._id),
  }).lean();

  const progressView = buildCourseProgressView({
    course,
    lessons,
    progress,
    stepCountsByLessonId,
  });

  return {
    id: toId(course._id),
    slug: course.slug,
    title: course.title,
    subtitle: course.subtitle || "",
    description: course.description || "",
    category: course.category,
    difficulty: course.difficulty,
    coverImage: course.coverImage || "",
    badge: course.badge || "",
    icon: course.icon || "",
    instructorName: course.instructorName || "",
    tags: Array.isArray(course.tags) ? course.tags : [],
    sortOrder: Number(course.sortOrder || 0),
    totalLessons: lessons.length,
    lessons: lessons.map((lesson) => ({
      id: toId(lesson._id),
      slug: lesson.slug,
      title: lesson.title,
      subtitle: lesson.subtitle || "",
      description: lesson.description || "",
      orderIndex: Number(lesson.orderIndex || 0),
      estimatedMinutes: Number(lesson.estimatedMinutes || 0),
    })),
    progress: progressView,
  };
}

async function resolveCourseLessonContext({ courseSlug, lessonSlug }) {
  const course = await fetchPublishedCourseBySlug(courseSlug);
  if (!course) return null;

  const lessons = await fetchLessonsForCourse(course._id);
  const targetLesson = lessons.find(
    (lesson) =>
      String(lesson.slug || "").toLowerCase() ===
      String(lessonSlug || "").toLowerCase(),
  );

  if (!targetLesson) return null;

  const lessonIds = lessons.map((lesson) => lesson._id);
  const [steps, stepCountsByLessonId] = await Promise.all([
    LearnLessonStep.find({
      lessonId: asObjectId(targetLesson._id),
      ...PUBLISHED_STEP_FILTER,
    })
      .sort({ orderIndex: 1, createdAt: 1 })
      .lean(),
    fetchStepCounts(lessonIds),
  ]);

  return {
    course,
    lessons,
    lesson: targetLesson,
    steps,
    stepCountsByLessonId,
  };
}

async function getLessonBySlug({
  userId,
  courseSlug,
  lessonSlug,
}) {
  const context = await resolveCourseLessonContext({ courseSlug, lessonSlug });
  if (!context) return null;

  const progress = await UserLearnProgress.findOne({
    userId: asObjectId(userId),
    courseId: asObjectId(context.course._id),
  }).lean();

  const lessonProgress = computeLessonProgressView({
    lesson: context.lesson,
    lessons: context.lessons,
    lessonSteps: context.steps,
    progress,
    stepCountsByLessonId: context.stepCountsByLessonId,
  });

  return {
    course: {
      id: toId(context.course._id),
      slug: context.course.slug,
      title: context.course.title,
      subtitle: context.course.subtitle || "",
      description: context.course.description || "",
      category: context.course.category,
      difficulty: context.course.difficulty,
      instructorName: context.course.instructorName || "",
      coverImage: context.course.coverImage || "",
      badge: context.course.badge || "",
      icon: context.course.icon || "",
      tags: Array.isArray(context.course.tags) ? context.course.tags : [],
      sortOrder: Number(context.course.sortOrder || 0),
      totalLessons: context.lessons.length,
    },
    lesson: {
      id: toId(context.lesson._id),
      slug: context.lesson.slug,
      title: context.lesson.title,
      subtitle: context.lesson.subtitle || "",
      description: context.lesson.description || "",
      shortDescription: context.lesson.description || "",
      estimatedMinutes: Number(context.lesson.estimatedMinutes || 0),
      durationMinutes: Number(context.lesson.estimatedMinutes || 0),
      orderIndex: Number(context.lesson.orderIndex || 0),
      order: Number(context.lesson.orderIndex || 0),
    },
    lessons: context.lessons.map((lesson) => ({
      id: toId(lesson._id),
      slug: lesson.slug,
      title: lesson.title,
      subtitle: lesson.subtitle || "",
      orderIndex: Number(lesson.orderIndex || 0),
      estimatedMinutes: Number(lesson.estimatedMinutes || 0),
      stepCount: Number(context.stepCountsByLessonId[toId(lesson._id)] || 0),
      isCompleted: lessonIsCompleted(progress, lesson._id),
    })),
    steps: context.steps.map((step, index) => serializeLessonStep(step, index)),
    progress: lessonProgress,
  };
}

async function getLessonProgressBySlug({
  userId,
  courseSlug,
  lessonSlug,
}) {
  const context = await resolveCourseLessonContext({ courseSlug, lessonSlug });
  if (!context) return null;

  const progress = await UserLearnProgress.findOne({
    userId: asObjectId(userId),
    courseId: asObjectId(context.course._id),
  }).lean();

  return computeLessonProgressView({
    lesson: context.lesson,
    lessons: context.lessons,
    lessonSteps: context.steps,
    progress,
    stepCountsByLessonId: context.stepCountsByLessonId,
  });
}

async function submitLessonStep({
  userId,
  courseSlug,
  lessonSlug,
  stepIndex,
  movePayload,
}) {
  const context = await resolveCourseLessonContext({ courseSlug, lessonSlug });
  if (!context) return { error: { status: 404, message: "Lesson not found." } };

  const safeStepIndex = Number(stepIndex);
  if (!Number.isInteger(safeStepIndex) || safeStepIndex < 0) {
    return { error: { status: 400, message: "Invalid step index." } };
  }
  if (safeStepIndex >= context.steps.length) {
    return { error: { status: 400, message: "Step index out of range." } };
  }

  const targetStep = context.steps[safeStepIndex];
  const validation = validateLessonMove({
    fen: targetStep.fen,
    sideToMove: targetStep.sideToMove,
    acceptedMoves: targetStep.acceptedMoves || [],
    validationMode: targetStep.validationMode || "one_of_many",
    payload: movePayload,
  });

  const now = new Date();
  const progress = await findOrCreateProgress({
    userId,
    courseId: context.course._id,
    fallbackLessonId: context.lesson._id,
    fallbackStepIndex: safeStepIndex,
  });

  progress.lessonId = asObjectId(context.lesson._id);
  progress.lastViewedAt = now;
  progress.lastInteractionAt = now;
  ensureActivityDay(progress, now);

  if (!validation.isValid || !validation.isCorrect) {
    progress.currentStepIndex = clampStepIndex(
      safeStepIndex,
      Math.max(1, context.steps.length),
    );
    progress.percentComplete = calculateCoursePercentComplete(
      progress,
      context.lessons.length,
    );
    await progress.save();

    const progressView = computeLessonProgressView({
      lesson: context.lesson,
      lessons: context.lessons,
      lessonSteps: context.steps,
      progress,
      stepCountsByLessonId: context.stepCountsByLessonId,
    });

    return {
      isCorrect: false,
      isValid: validation.isValid,
      reason: validation.reason,
      feedback:
        targetStep.wrongMoveMessage ||
        targetStep.feedbackWrong ||
        validation.reason ||
        "That move doesn't match this lesson idea yet. Try again.",
      stepIndex: safeStepIndex,
      nextStepIndex: safeStepIndex,
      lessonCompleted: progressView.lessonCompleted,
      allowRetry: targetStep.allowRetry !== false,
      keepPositionOnWrong: !!targetStep.keepPositionOnWrong,
      resetFen: targetStep.keepPositionOnWrong ? "" : targetStep.fen,
      boardFenAfterMove: validation.fenAfterMove,
      progress: progressView,
    };
  }

  markCompletedStep(progress, context.lesson._id, safeStepIndex, now);

  const completedForLesson = new Set(
    getLessonCompletedStepIndexes(progress, context.lesson._id),
  );
  const lessonAllStepsCompleted =
    context.steps.length > 0 &&
    Array.from({ length: context.steps.length }).every((_, index) =>
      completedForLesson.has(index),
    );

  if (lessonAllStepsCompleted) {
    markLessonCompleted(progress, context.lesson._id);
  }

  const nextStepIndex = Math.min(safeStepIndex + 1, context.steps.length - 1);
  progress.currentStepIndex = lessonAllStepsCompleted
    ? Math.max(0, context.steps.length - 1)
    : nextStepIndex;

  const uniqueCompletedLessons = uniqueIds(progress.completedLessons || []);
  const isCourseCompleted =
    uniqueCompletedLessons.length >= context.lessons.length &&
    context.lessons.length > 0;
  progress.percentComplete = calculateCoursePercentComplete(
    progress,
    context.lessons.length,
  );
  progress.completedAt = isCourseCompleted ? now : null;

  await progress.save();

  const progressView = computeLessonProgressView({
    lesson: context.lesson,
    lessons: context.lessons,
    lessonSteps: context.steps,
    progress,
    stepCountsByLessonId: context.stepCountsByLessonId,
  });

  return {
    isCorrect: true,
    isValid: true,
    reason: null,
    feedback:
      targetStep.successMessage ||
      targetStep.feedbackCorrect ||
      "Correct move. Continue to the next instructional step.",
    stepIndex: safeStepIndex,
    nextStepIndex,
    lessonCompleted: progressView.lessonCompleted,
    courseCompleted:
      progressView.courseProgress.completedLessonsCount >=
      progressView.courseProgress.totalLessons,
    autoAdvance: !!targetStep.autoAdvance,
    boardFenAfterMove: validation.fenAfterMove,
    move: validation.move,
    progress: progressView,
  };
}

async function completeLesson({
  userId,
  courseSlug,
  lessonSlug,
}) {
  const context = await resolveCourseLessonContext({ courseSlug, lessonSlug });
  if (!context) return { error: { status: 404, message: "Lesson not found." } };

  const now = new Date();
  const progress = await findOrCreateProgress({
    userId,
    courseId: context.course._id,
    fallbackLessonId: context.lesson._id,
    fallbackStepIndex: Math.max(0, context.steps.length - 1),
  });

  progress.lessonId = asObjectId(context.lesson._id);
  progress.currentStepIndex = Math.max(0, context.steps.length - 1);
  progress.lastViewedAt = now;
  progress.lastInteractionAt = now;
  ensureActivityDay(progress, now);

  for (let index = 0; index < context.steps.length; index += 1) {
    markCompletedStep(progress, context.lesson._id, index, now);
  }
  markLessonCompleted(progress, context.lesson._id);

  const uniqueCompletedLessons = uniqueIds(progress.completedLessons || []);
  const isCourseCompleted =
    uniqueCompletedLessons.length >= context.lessons.length &&
    context.lessons.length > 0;
  progress.percentComplete = calculateCoursePercentComplete(
    progress,
    context.lessons.length,
  );
  progress.completedAt = isCourseCompleted ? now : null;

  await progress.save();

  const progressView = computeLessonProgressView({
    lesson: context.lesson,
    lessons: context.lessons,
    lessonSteps: context.steps,
    progress,
    stepCountsByLessonId: context.stepCountsByLessonId,
  });

  return {
    lessonCompleted: true,
    courseCompleted:
      progressView.courseProgress.completedLessonsCount >=
      progressView.courseProgress.totalLessons,
    progress: progressView,
  };
}

async function getLearnSummary({ userId }) {
  const progressDocs = await UserLearnProgress.find({
    userId: asObjectId(userId),
  }).lean();

  const watchedLessonIds = new Set();
  const completedLessonIds = new Set();
  const activityDays = new Set();

  for (const progress of progressDocs) {
    if (progress.lessonId) watchedLessonIds.add(toId(progress.lessonId));
    (progress.completedSteps || []).forEach((entry) => {
      if (entry.lessonId) watchedLessonIds.add(toId(entry.lessonId));
    });
    (progress.completedLessons || []).forEach((entry) =>
      completedLessonIds.add(toId(entry)),
    );
    (progress.activityDays || []).forEach((entry) => activityDays.add(String(entry)));
  }

  const inProgressCourses = progressDocs.filter(
    (doc) => Number(doc.percentComplete || 0) > 0 && Number(doc.percentComplete || 0) < 100,
  ).length;
  const completedCourses = progressDocs.filter(
    (doc) => Number(doc.percentComplete || 0) >= 100,
  ).length;

  return {
    watchedLessons: watchedLessonIds.size,
    completedLessons: completedLessonIds.size,
    dayStreak: calculateDayStreak(Array.from(activityDays)),
    inProgressCourses,
    completedCourses,
  };
}

async function searchLearnContent({ query }) {
  const safeQuery = String(query || "").trim();
  if (!safeQuery) {
    return { courses: [], lessons: [] };
  }

  const regex = new RegExp(escapeRegex(safeQuery), "i");
  const [courses, lessons] = await Promise.all([
    LearnCourse.find({
      isPublished: true,
      $or: [
        { title: regex },
        { subtitle: regex },
        { description: regex },
        { tags: regex },
      ],
    })
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean(),
    LearnLesson.find({
      isPublished: true,
      $or: [{ title: regex }, { subtitle: regex }, { description: regex }],
    })
      .sort({ updatedAt: -1 })
      .limit(40)
      .lean(),
  ]);

  const courseById = courses.reduce((acc, course) => {
    acc[toId(course._id)] = course;
    return acc;
  }, {});

  if (lessons.length > 0) {
    const missingCourseIds = lessons
      .map((lesson) => toId(lesson.courseId))
      .filter((id) => !courseById[id]);
    if (missingCourseIds.length > 0) {
      const relatedCourses = await LearnCourse.find({
        _id: { $in: missingCourseIds.map((id) => asObjectId(id)) },
        isPublished: true,
      }).lean();
      for (const course of relatedCourses) {
        courseById[toId(course._id)] = course;
      }
    }
  }

  const filteredLessons = lessons
    .filter((lesson) => !!courseById[toId(lesson.courseId)])
    .map((lesson) => {
      const course = courseById[toId(lesson.courseId)];
      return {
        courseSlug: course.slug,
        lessonSlug: lesson.slug,
        title: lesson.title,
        subtitle: lesson.subtitle || "",
        description: lesson.description || "",
        courseTitle: course.title,
      };
    });

  const serializedCourses = Object.values(courseById).map((course) => ({
    slug: course.slug,
    title: course.title,
    subtitle: course.subtitle || "",
    category: course.category,
    difficulty: course.difficulty,
  }));

  return {
    courses: serializedCourses,
    lessons: filteredLessons,
  };
}

export {
  completeLesson,
  getCourseBySlug,
  getCourseCatalog,
  getLearnSummary,
  getLessonBySlug,
  getLessonProgressBySlug,
  searchLearnContent,
  submitLessonStep,
};
