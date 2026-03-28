import { Chess } from "chess.js";
import mongoose from "mongoose";
import {
  LearnCourse,
  LearnLesson,
  LearnLessonStep,
  UserLearnProgress,
} from "../models/index.js";
import {
  LEARN_CATEGORIES,
  LEARN_DIFFICULTIES,
} from "../models/LearnCourse.js";
import { LEARN_STEP_VALIDATION_MODES } from "../models/LearnLessonStep.js";
import { deleteMediaAsset, extractMediaAssetId } from "../utils/mediaStorage.js";

const COURSE_STATUS = new Set(["all", "published", "unpublished"]);
const LESSON_STATUS = new Set(["all", "published", "unpublished"]);
const STEP_SUCCESS_CONDITIONS = new Set(["accepted_move"]);
const STEP_VALIDATION_MODES = new Set(LEARN_STEP_VALIDATION_MODES);

class AdminLearnError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "AdminLearnError";
    this.status = status;
  }
}

function toId(value) {
  return value ? String(value) : "";
}

function asObjectId(value, label = "id") {
  const raw = toId(value).trim();
  if (!mongoose.Types.ObjectId.isValid(raw)) {
    throw new AdminLearnError(`Invalid ${label}.`, 400);
  }
  return new mongoose.Types.ObjectId(raw);
}

function ensureString(value) {
  return String(value || "").trim();
}

function normalizeSlug(raw, fallback = "") {
  const base = ensureString(raw) || ensureString(fallback);
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeTags(rawTags) {
  if (Array.isArray(rawTags)) {
    return rawTags
      .map((entry) => ensureString(entry).toLowerCase())
      .filter(Boolean)
      .filter((entry, index, list) => list.indexOf(entry) === index);
  }

  if (typeof rawTags === "string") {
    return normalizeTags(
      rawTags
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    );
  }

  return [];
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function normalizePositiveInteger(value, fallback, min = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min) {
    throw new AdminLearnError(`Value must be at least ${min}.`, 400);
  }
  return Math.floor(parsed);
}

function normalizeStatus(value, allowedSet) {
  const normalized = ensureString(value).toLowerCase() || "all";
  return allowedSet.has(normalized) ? normalized : "all";
}

function parseAcceptedMoves(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => ensureString(entry))
      .filter(Boolean)
      .filter((entry, index, list) => list.indexOf(entry) === index);
  }

  if (typeof value === "string") {
    return value
      .split(/[\n,]/g)
      .map((entry) => ensureString(entry))
      .filter(Boolean)
      .filter((entry, index, list) => list.indexOf(entry) === index);
  }

  return [];
}

function normalizeSideToMove(value) {
  const normalized = ensureString(value).toLowerCase();
  if (normalized === "white" || normalized === "black") return normalized;
  throw new AdminLearnError("Side to move must be white or black.", 400);
}

function normalizeBoardOrientation(value, fallback = "white") {
  const normalized = ensureString(value).toLowerCase();
  if (normalized === "white" || normalized === "black") return normalized;
  return fallback;
}

function normalizeValidationMode(value, fallback = "one_of_many") {
  const normalized = ensureString(value).toLowerCase();
  if (STEP_VALIDATION_MODES.has(normalized)) return normalized;
  return fallback;
}

function normalizeAnnotations(value) {
  if (value == null || value === "") return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      throw new AdminLearnError("Annotations must be a valid JSON object.", 400);
    }
  }
  throw new AdminLearnError("Annotations must be an object.", 400);
}

function validateFenAndMoves({ fen, sideToMove, acceptedMoves }) {
  const safeFen = ensureString(fen);
  if (!safeFen) {
    throw new AdminLearnError("FEN is required.", 400);
  }

  let baseChess;
  try {
    baseChess = new Chess(safeFen);
  } catch {
    throw new AdminLearnError("Invalid FEN format.", 400);
  }

  const fenTurn = safeFen.split(/\s+/)[1];
  const expectedTurn = sideToMove === "white" ? "w" : "b";
  if (fenTurn !== expectedTurn) {
    throw new AdminLearnError(
      "Side to move does not match FEN active color.",
      400,
    );
  }

  const parsedMoves = parseAcceptedMoves(acceptedMoves);
  if (parsedMoves.length === 0) {
    throw new AdminLearnError("At least one accepted move is required.", 400);
  }

  const uciPattern = /^[a-h][1-8][a-h][1-8][qrbn]?$/i;
  parsedMoves.forEach((move) => {
    const probe = new Chess(baseChess.fen());
    let result = null;
    if (uciPattern.test(move)) {
      const normalized = move.toLowerCase();
      result = probe.move({
        from: normalized.slice(0, 2),
        to: normalized.slice(2, 4),
        promotion: normalized[4] || undefined,
      });
    } else {
      result = probe.move(move, { sloppy: true });
    }
    if (!result) {
      throw new AdminLearnError(`Accepted move "${move}" is not legal in FEN.`, 400);
    }
  });

  return parsedMoves;
}

function assertCategory(category) {
  if (!LEARN_CATEGORIES.includes(category)) {
    throw new AdminLearnError("Invalid category.", 400);
  }
}

function assertDifficulty(difficulty) {
  if (!LEARN_DIFFICULTIES.includes(difficulty)) {
    throw new AdminLearnError("Invalid difficulty.", 400);
  }
}

function serializeCourse(course, counts = {}) {
  return {
    id: toId(course?._id || course?.id),
    slug: ensureString(course?.slug),
    title: ensureString(course?.title),
    subtitle: ensureString(course?.subtitle),
    description: ensureString(course?.description),
    category: ensureString(course?.category),
    difficulty: ensureString(course?.difficulty),
    instructorName: ensureString(course?.instructorName),
    coverImage: ensureString(course?.coverImage),
    badge: ensureString(course?.badge),
    icon: ensureString(course?.icon),
    tags: Array.isArray(course?.tags) ? course.tags : [],
    totalLessons: Number(counts.totalLessons ?? course?.totalLessons ?? 0),
    publishedLessons: Number(counts.publishedLessons ?? 0),
    sortOrder: Number(course?.sortOrder || 0),
    isPublished: !!course?.isPublished,
    createdAt: course?.createdAt || null,
    updatedAt: course?.updatedAt || null,
  };
}

function serializeLesson(lesson, stepCount = 0) {
  return {
    id: toId(lesson?._id),
    courseId: toId(lesson?.courseId),
    slug: ensureString(lesson?.slug),
    title: ensureString(lesson?.title),
    subtitle: ensureString(lesson?.subtitle),
    description: ensureString(lesson?.description),
    shortDescription: ensureString(lesson?.description),
    orderIndex: Number(lesson?.orderIndex || 0),
    order: Number(lesson?.orderIndex || 0),
    estimatedMinutes: Number(lesson?.estimatedMinutes || 0),
    durationMinutes: Number(lesson?.estimatedMinutes || 0),
    isPublished: !!lesson?.isPublished,
    stepCount: Number(stepCount || 0),
    createdAt: lesson?.createdAt || null,
    updatedAt: lesson?.updatedAt || null,
  };
}

function serializeStep(step) {
  const acceptedMoves = Array.isArray(step?.acceptedMoves) ? step.acceptedMoves : [];
  const successMessage = ensureString(step?.successMessage) || ensureString(step?.feedbackCorrect);
  const wrongMoveMessage = ensureString(step?.wrongMoveMessage) || ensureString(step?.feedbackWrong);

  return {
    id: toId(step?._id),
    lessonId: toId(step?.lessonId),
    orderIndex: Number(step?.orderIndex || 0),
    title: ensureString(step?.title),
    instructionText: ensureString(step?.instructionText),
    explanationBeforeMove: ensureString(step?.explanationBeforeMove),
    explanationText: ensureString(step?.explanationBeforeMove),
    fen: ensureString(step?.fen),
    sideToMove: step?.sideToMove === "black" ? "black" : "white",
    boardOrientation: normalizeBoardOrientation(step?.boardOrientation, "white"),
    acceptedMoves,
    correctMoves: acceptedMoves,
    validationMode: normalizeValidationMode(step?.validationMode, "one_of_many"),
    feedbackCorrect: ensureString(step?.feedbackCorrect),
    feedbackWrong: ensureString(step?.feedbackWrong),
    successMessage,
    wrongMoveMessage,
    hintText: ensureString(step?.hintText),
    allowRetry: step?.allowRetry !== false,
    autoAdvance: !!step?.autoAdvance,
    keepPositionOnWrong: !!step?.keepPositionOnWrong,
    nextFen: ensureString(step?.nextFen),
    successCondition: ensureString(step?.successCondition || "accepted_move"),
    annotations:
      step?.annotations && typeof step.annotations === "object"
        ? step.annotations
        : {},
    isPublished: step?.isPublished !== false,
    createdAt: step?.createdAt || null,
    updatedAt: step?.updatedAt || null,
  };
}

async function getLessonCountMap(courseIds = []) {
  if (!courseIds.length) return {};
  const rows = await LearnLesson.aggregate([
    { $match: { courseId: { $in: courseIds } } },
    {
      $group: {
        _id: "$courseId",
        totalLessons: { $sum: 1 },
        publishedLessons: {
          $sum: {
            $cond: [{ $eq: ["$isPublished", true] }, 1, 0],
          },
        },
      },
    },
  ]);
  return rows.reduce((acc, row) => {
    acc[toId(row._id)] = {
      totalLessons: Number(row.totalLessons || 0),
      publishedLessons: Number(row.publishedLessons || 0),
    };
    return acc;
  }, {});
}

async function getStepCountMap(lessonIds = []) {
  if (!lessonIds.length) return {};
  const rows = await LearnLessonStep.aggregate([
    { $match: { lessonId: { $in: lessonIds } } },
    { $group: { _id: "$lessonId", count: { $sum: 1 } } },
  ]);
  return rows.reduce((acc, row) => {
    acc[toId(row._id)] = Number(row.count || 0);
    return acc;
  }, {});
}

async function ensureUniqueCourseSlug(slug, excludeCourseId = null) {
  const query = {
    slug: { $regex: `^${slug}$`, $options: "i" },
  };
  if (excludeCourseId) {
    query._id = { $ne: asObjectId(excludeCourseId, "course id") };
  }

  const existing = await LearnCourse.findOne(query).select("_id").lean();
  if (existing) {
    throw new AdminLearnError("Course slug already exists.", 409);
  }
}

async function ensureUniqueLessonSlug({ courseId, slug, excludeLessonId = null }) {
  const query = {
    courseId: asObjectId(courseId, "course id"),
    slug: { $regex: `^${slug}$`, $options: "i" },
  };
  if (excludeLessonId) {
    query._id = { $ne: asObjectId(excludeLessonId, "lesson id") };
  }
  const existing = await LearnLesson.findOne(query).select("_id").lean();
  if (existing) {
    throw new AdminLearnError("Lesson slug already exists in this course.", 409);
  }
}

async function refreshCourseTotalLessons(courseId) {
  const totalLessons = await LearnLesson.countDocuments({
    courseId: asObjectId(courseId, "course id"),
  });
  await LearnCourse.updateOne(
    { _id: asObjectId(courseId, "course id") },
    { $set: { totalLessons } },
  );
}

async function fetchCourseOrThrow(courseId) {
  const course = await LearnCourse.findById(asObjectId(courseId, "course id"));
  if (!course) {
    throw new AdminLearnError("Course not found.", 404);
  }
  return course;
}

async function fetchLessonOrThrow(lessonId) {
  const lesson = await LearnLesson.findById(asObjectId(lessonId, "lesson id"));
  if (!lesson) {
    throw new AdminLearnError("Lesson not found.", 404);
  }
  return lesson;
}

async function fetchStepOrThrow(stepId) {
  const step = await LearnLessonStep.findById(asObjectId(stepId, "step id"));
  if (!step) {
    throw new AdminLearnError("Step not found.", 404);
  }
  return step;
}

async function applyLessonOrder(courseId, orderedLessonIds) {
  const safeCourseId = asObjectId(courseId, "course id");
  const lessons = await LearnLesson.find({ courseId: safeCourseId })
    .sort({ orderIndex: 1, createdAt: 1 })
    .lean();

  const currentIds = lessons.map((lesson) => toId(lesson._id));
  const desiredIds = (orderedLessonIds || []).map((entry) => toId(entry));
  if (currentIds.length !== desiredIds.length) {
    throw new AdminLearnError("Lesson reorder payload is incomplete.", 400);
  }

  const currentSet = new Set(currentIds);
  if (desiredIds.some((entry) => !currentSet.has(entry))) {
    throw new AdminLearnError("Lesson reorder payload contains invalid ids.", 400);
  }

  const tempOps = desiredIds.map((id, index) => ({
    updateOne: {
      filter: { _id: asObjectId(id, "lesson id") },
      update: { $set: { orderIndex: 10000 + index } },
    },
  }));
  const finalOps = desiredIds.map((id, index) => ({
    updateOne: {
      filter: { _id: asObjectId(id, "lesson id") },
      update: { $set: { orderIndex: index } },
    },
  }));

  if (tempOps.length) {
    await LearnLesson.bulkWrite(tempOps);
    await LearnLesson.bulkWrite(finalOps);
  }

  return LearnLesson.find({ courseId: safeCourseId })
    .sort({ orderIndex: 1, createdAt: 1 })
    .lean();
}

async function applyStepOrder(lessonId, orderedStepIds) {
  const safeLessonId = asObjectId(lessonId, "lesson id");
  const steps = await LearnLessonStep.find({ lessonId: safeLessonId })
    .sort({ orderIndex: 1, createdAt: 1 })
    .lean();

  const currentIds = steps.map((step) => toId(step._id));
  const desiredIds = (orderedStepIds || []).map((entry) => toId(entry));
  if (currentIds.length !== desiredIds.length) {
    throw new AdminLearnError("Step reorder payload is incomplete.", 400);
  }
  const currentSet = new Set(currentIds);
  if (desiredIds.some((entry) => !currentSet.has(entry))) {
    throw new AdminLearnError("Step reorder payload contains invalid ids.", 400);
  }

  const tempOps = desiredIds.map((id, index) => ({
    updateOne: {
      filter: { _id: asObjectId(id, "step id") },
      update: { $set: { orderIndex: 10000 + index } },
    },
  }));
  const finalOps = desiredIds.map((id, index) => ({
    updateOne: {
      filter: { _id: asObjectId(id, "step id") },
      update: { $set: { orderIndex: index } },
    },
  }));

  if (tempOps.length) {
    await LearnLessonStep.bulkWrite(tempOps);
    await LearnLessonStep.bulkWrite(finalOps);
  }

  return LearnLessonStep.find({ lessonId: safeLessonId })
    .sort({ orderIndex: 1, createdAt: 1 })
    .lean();
}

async function listAdminCourses({
  search = "",
  category = "",
  difficulty = "",
  status = "all",
}) {
  const filter = {};
  const safeSearch = ensureString(search);
  const safeCategory = ensureString(category);
  const safeDifficulty = ensureString(difficulty);
  const safeStatus = normalizeStatus(status, COURSE_STATUS);

  if (safeSearch) {
    const regex = new RegExp(safeSearch, "i");
    filter.$or = [
      { title: regex },
      { subtitle: regex },
      { description: regex },
      { badge: regex },
      { slug: regex },
      { tags: regex },
    ];
  }
  if (safeCategory && LEARN_CATEGORIES.includes(safeCategory)) {
    filter.category = safeCategory;
  }
  if (safeDifficulty && LEARN_DIFFICULTIES.includes(safeDifficulty)) {
    filter.difficulty = safeDifficulty;
  }
  if (safeStatus === "published") filter.isPublished = true;
  if (safeStatus === "unpublished") filter.isPublished = false;

  const courses = await LearnCourse.find(filter)
    .sort({ sortOrder: 1, updatedAt: -1, createdAt: -1 })
    .lean();
  const courseIds = courses.map((course) => asObjectId(course._id, "course id"));
  const [lessonCounts, totalCourses, totalLessons, totalPublished] =
    await Promise.all([
      getLessonCountMap(courseIds),
      LearnCourse.countDocuments(),
      LearnLesson.countDocuments(),
      LearnCourse.countDocuments({ isPublished: true }),
    ]);

  const serializedCourses = courses.map((course) =>
    serializeCourse(course, lessonCounts[toId(course._id)]),
  );

  return {
    courses: serializedCourses,
    stats: {
      totalCourses,
      totalLessons,
      totalPublished,
    },
    options: {
      categories: LEARN_CATEGORIES,
      difficulties: LEARN_DIFFICULTIES,
    },
  };
}

async function createAdminCourse(payload = {}) {
  const title = ensureString(payload.title);
  const category = ensureString(payload.category);
  const difficulty = ensureString(payload.difficulty);
  const slug = normalizeSlug(payload.slug, title);

  if (!title) throw new AdminLearnError("Course title is required.", 400);
  if (!slug) throw new AdminLearnError("Course slug is required.", 400);
  assertCategory(category);
  assertDifficulty(difficulty);

  await ensureUniqueCourseSlug(slug);

  const created = await LearnCourse.create({
    slug,
    title,
    subtitle: ensureString(payload.subtitle),
    description: ensureString(payload.description),
    category,
    difficulty,
    coverImage: ensureString(payload.coverImage),
    badge: ensureString(payload.badge),
    icon: ensureString(payload.icon),
    instructorName: ensureString(payload.instructorName),
    tags: normalizeTags(payload.tags),
    totalLessons: 0,
    sortOrder: normalizePositiveInteger(payload.sortOrder, 0, 0),
    isPublished: normalizeBoolean(payload.isPublished, false),
  });

  return serializeCourse(created.toObject());
}

async function updateAdminCourse(courseId, payload = {}) {
  const course = await fetchCourseOrThrow(courseId);

  if (payload.slug !== undefined || payload.title !== undefined) {
    const slug = normalizeSlug(payload.slug, payload.title || course.title);
    if (!slug) throw new AdminLearnError("Course slug is required.", 400);
    if (slug.toLowerCase() !== String(course.slug || "").toLowerCase()) {
      await ensureUniqueCourseSlug(slug, course._id);
    }
    course.slug = slug;
  }

  if (payload.title !== undefined) {
    const title = ensureString(payload.title);
    if (!title) throw new AdminLearnError("Course title is required.", 400);
    course.title = title;
  }

  if (payload.subtitle !== undefined) course.subtitle = ensureString(payload.subtitle);
  if (payload.description !== undefined) {
    course.description = ensureString(payload.description);
  }
  if (payload.coverImage !== undefined) course.coverImage = ensureString(payload.coverImage);
  if (payload.badge !== undefined) course.badge = ensureString(payload.badge);
  if (payload.icon !== undefined) course.icon = ensureString(payload.icon);
  if (payload.instructorName !== undefined) {
    course.instructorName = ensureString(payload.instructorName);
  }
  if (payload.tags !== undefined) course.tags = normalizeTags(payload.tags);
  if (payload.sortOrder !== undefined) {
    course.sortOrder = normalizePositiveInteger(
      payload.sortOrder,
      Number(course.sortOrder || 0),
      0,
    );
  }
  if (payload.category !== undefined) {
    const category = ensureString(payload.category);
    assertCategory(category);
    course.category = category;
  }
  if (payload.difficulty !== undefined) {
    const difficulty = ensureString(payload.difficulty);
    assertDifficulty(difficulty);
    course.difficulty = difficulty;
  }
  if (payload.isPublished !== undefined) {
    course.isPublished = normalizeBoolean(payload.isPublished, course.isPublished);
  }

  await course.save();
  await refreshCourseTotalLessons(course._id);

  const lessonCountMap = await getLessonCountMap([asObjectId(course._id, "course id")]);
  return serializeCourse(course.toObject(), lessonCountMap[toId(course._id)]);
}

async function updateAdminCourseCoverImage(courseId, file) {
  const course = await fetchCourseOrThrow(courseId);
  const uploadUrl = ensureString(file?.url);
  if (!uploadUrl) {
    throw new AdminLearnError("Cover image upload failed.", 400);
  }

  const previousCoverImage = ensureString(course.coverImage);
  const previousAssetId = extractMediaAssetId(previousCoverImage);
  const nextAssetId = extractMediaAssetId(uploadUrl);

  course.coverImage = uploadUrl;
  await course.save();

  if (previousAssetId && previousAssetId !== nextAssetId) {
    await deleteMediaAsset(previousAssetId).catch(() => null);
  }

  const lessonCountMap = await getLessonCountMap([asObjectId(course._id, "course id")]);
  return serializeCourse(course.toObject(), lessonCountMap[toId(course._id)]);
}

async function deleteAdminCourse(courseId) {
  const safeCourseId = asObjectId(courseId, "course id");
  const course = await LearnCourse.findById(safeCourseId).lean();
  if (!course) throw new AdminLearnError("Course not found.", 404);
  const courseCoverAssetId = extractMediaAssetId(course.coverImage);

  const lessons = await LearnLesson.find({ courseId: safeCourseId })
    .select("_id")
    .lean();
  const lessonIds = lessons.map((entry) => asObjectId(entry._id, "lesson id"));

  if (lessonIds.length > 0) {
    await LearnLessonStep.deleteMany({ lessonId: { $in: lessonIds } });
  }
  await LearnLesson.deleteMany({ courseId: safeCourseId });
  await UserLearnProgress.deleteMany({ courseId: safeCourseId });
  await LearnCourse.deleteOne({ _id: safeCourseId });
  if (courseCoverAssetId) {
    await deleteMediaAsset(courseCoverAssetId).catch(() => null);
  }

  return { success: true };
}

async function listAdminLessons({
  courseId,
  search = "",
  status = "all",
}) {
  const course = await LearnCourse.findById(asObjectId(courseId, "course id")).lean();
  if (!course) throw new AdminLearnError("Course not found.", 404);

  const filter = { courseId: asObjectId(courseId, "course id") };
  const safeSearch = ensureString(search);
  const safeStatus = normalizeStatus(status, LESSON_STATUS);

  if (safeStatus === "published") filter.isPublished = true;
  if (safeStatus === "unpublished") filter.isPublished = false;
  if (safeSearch) {
    const regex = new RegExp(safeSearch, "i");
    filter.$or = [
      { title: regex },
      { subtitle: regex },
      { description: regex },
      { slug: regex },
    ];
  }

  const lessons = await LearnLesson.find(filter)
    .sort({ orderIndex: 1, createdAt: 1 })
    .lean();
  const stepCounts = await getStepCountMap(
    lessons.map((lesson) => asObjectId(lesson._id, "lesson id")),
  );

  return {
    course: serializeCourse(course),
    lessons: lessons.map((lesson) =>
      serializeLesson(lesson, stepCounts[toId(lesson._id)] || 0),
    ),
  };
}

async function createAdminLesson(courseId, payload = {}) {
  const course = await fetchCourseOrThrow(courseId);
  const title = ensureString(payload.title);
  const slug = normalizeSlug(payload.slug, title);

  if (!title) throw new AdminLearnError("Lesson title is required.", 400);
  if (!slug) throw new AdminLearnError("Lesson slug is required.", 400);
  await ensureUniqueLessonSlug({ courseId: course._id, slug });

  const [maxOrder] = await LearnLesson.find({ courseId: course._id })
    .sort({ orderIndex: -1 })
    .limit(1)
    .select("orderIndex")
    .lean();
  const nextOrder = Number(maxOrder?.orderIndex ?? -1) + 1;

  const lesson = await LearnLesson.create({
    courseId: course._id,
    slug,
    title,
    subtitle: ensureString(payload.subtitle),
    description: ensureString(payload.shortDescription ?? payload.description),
    orderIndex: nextOrder,
    estimatedMinutes: normalizePositiveInteger(
      payload.durationMinutes ?? payload.estimatedMinutes,
      10,
      1,
    ),
    isPublished: normalizeBoolean(payload.isPublished, false),
  });

  await refreshCourseTotalLessons(course._id);
  return serializeLesson(lesson.toObject(), 0);
}

async function updateAdminLesson(lessonId, payload = {}) {
  const lesson = await fetchLessonOrThrow(lessonId);

  if (payload.slug !== undefined || payload.title !== undefined) {
    const slug = normalizeSlug(payload.slug, payload.title || lesson.title);
    if (!slug) throw new AdminLearnError("Lesson slug is required.", 400);
    if (slug.toLowerCase() !== String(lesson.slug || "").toLowerCase()) {
      await ensureUniqueLessonSlug({
        courseId: lesson.courseId,
        slug,
        excludeLessonId: lesson._id,
      });
    }
    lesson.slug = slug;
  }

  if (payload.title !== undefined) {
    const title = ensureString(payload.title);
    if (!title) throw new AdminLearnError("Lesson title is required.", 400);
    lesson.title = title;
  }
  if (payload.subtitle !== undefined) lesson.subtitle = ensureString(payload.subtitle);
  if (payload.description !== undefined) {
    lesson.description = ensureString(payload.description);
  }
  if (payload.shortDescription !== undefined) {
    lesson.description = ensureString(payload.shortDescription);
  }
  if (payload.estimatedMinutes !== undefined) {
    lesson.estimatedMinutes = normalizePositiveInteger(
      payload.estimatedMinutes,
      lesson.estimatedMinutes,
      1,
    );
  }
  if (payload.durationMinutes !== undefined) {
    lesson.estimatedMinutes = normalizePositiveInteger(
      payload.durationMinutes,
      lesson.estimatedMinutes,
      1,
    );
  }
  if (payload.isPublished !== undefined) {
    lesson.isPublished = normalizeBoolean(payload.isPublished, lesson.isPublished);
  }

  await lesson.save();

  const targetOrderIndex =
    payload.order !== undefined ? payload.order : payload.orderIndex;
  if (targetOrderIndex !== undefined) {
    const allLessons = await LearnLesson.find({ courseId: lesson.courseId })
      .sort({ orderIndex: 1, createdAt: 1 })
      .lean();
    const currentIds = allLessons.map((entry) => toId(entry._id));
    const currentIndex = currentIds.findIndex((id) => id === toId(lesson._id));
    if (currentIndex >= 0) {
      const targetIndex = Math.max(
        0,
        Math.min(
          currentIds.length - 1,
          normalizePositiveInteger(targetOrderIndex, currentIndex, 0),
        ),
      );
      if (targetIndex !== currentIndex) {
        const [moved] = currentIds.splice(currentIndex, 1);
        currentIds.splice(targetIndex, 0, moved);
        await applyLessonOrder(lesson.courseId, currentIds);
      }
    }
  }

  const latest = await LearnLesson.findById(lesson._id).lean();
  const [stepCountRow] = await LearnLessonStep.aggregate([
    { $match: { lessonId: asObjectId(lesson._id, "lesson id") } },
    { $group: { _id: "$lessonId", count: { $sum: 1 } } },
  ]);
  return serializeLesson(latest, Number(stepCountRow?.count || 0));
}

async function deleteAdminLesson(lessonId) {
  const lesson = await fetchLessonOrThrow(lessonId);

  await LearnLessonStep.deleteMany({ lessonId: lesson._id });
  await LearnLesson.deleteOne({ _id: lesson._id });
  const currentLessonIds = (
    await LearnLesson.find({ courseId: lesson.courseId })
      .sort({ orderIndex: 1, createdAt: 1 })
      .select("_id")
      .lean()
  ).map((entry) => toId(entry._id));
  if (currentLessonIds.length) {
    await applyLessonOrder(lesson.courseId, currentLessonIds);
  }

  const fallbackLesson = await LearnLesson.findOne({ courseId: lesson.courseId })
    .sort({ orderIndex: 1, createdAt: 1 })
    .select("_id")
    .lean();

  await UserLearnProgress.updateMany(
    { courseId: lesson.courseId },
    {
      $pull: {
        completedLessons: lesson._id,
        completedSteps: { lessonId: lesson._id },
      },
    },
  );
  if (fallbackLesson?._id) {
    await UserLearnProgress.updateMany(
      { courseId: lesson.courseId, lessonId: lesson._id },
      {
        $set: {
          lessonId: fallbackLesson._id,
          currentStepIndex: 0,
        },
      },
    );
  } else {
    await UserLearnProgress.deleteMany({ courseId: lesson.courseId });
  }

  await refreshCourseTotalLessons(lesson.courseId);
  return { success: true };
}

async function reorderAdminLessons(courseId, lessonIds = []) {
  const course = await fetchCourseOrThrow(courseId);
  const lessons = await applyLessonOrder(course._id, lessonIds);
  const stepCounts = await getStepCountMap(
    lessons.map((lesson) => asObjectId(lesson._id, "lesson id")),
  );
  return {
    course: serializeCourse(course.toObject()),
    lessons: lessons.map((lesson) =>
      serializeLesson(lesson, stepCounts[toId(lesson._id)] || 0),
    ),
  };
}

async function listAdminSteps({ lessonId, search = "" }) {
  const lesson = await LearnLesson.findById(asObjectId(lessonId, "lesson id")).lean();
  if (!lesson) throw new AdminLearnError("Lesson not found.", 404);
  const course = await LearnCourse.findById(lesson.courseId).lean();
  if (!course) throw new AdminLearnError("Course not found.", 404);

  const filter = { lessonId: asObjectId(lessonId, "lesson id") };
  const safeSearch = ensureString(search);
  if (safeSearch) {
    const regex = new RegExp(safeSearch, "i");
    filter.$or = [
      { title: regex },
      { instructionText: regex },
      { explanationBeforeMove: regex },
      { feedbackCorrect: regex },
      { feedbackWrong: regex },
      { successMessage: regex },
      { wrongMoveMessage: regex },
    ];
  }

  const steps = await LearnLessonStep.find(filter)
    .sort({ orderIndex: 1, createdAt: 1 })
    .lean();

  return {
    course: serializeCourse(course),
    lesson: serializeLesson(lesson, steps.length),
    steps: steps.map(serializeStep),
  };
}

async function createAdminStep(lessonId, payload = {}) {
  const lesson = await fetchLessonOrThrow(lessonId);

  const sideToMove = normalizeSideToMove(payload.sideToMove);
  const validationMode = normalizeValidationMode(payload.validationMode, "one_of_many");
  const boardOrientation = normalizeBoardOrientation(
    payload.boardOrientation,
    sideToMove === "black" ? "black" : "white",
  );
  const acceptedMoves = validateFenAndMoves({
    fen: payload.fen,
    sideToMove,
    acceptedMoves: payload.correctMoves ?? payload.acceptedMoves,
  });

  const instructionText = ensureString(payload.instructionText);
  const successMessage = ensureString(payload.successMessage || payload.feedbackCorrect);
  const wrongMoveMessage = ensureString(
    payload.wrongMoveMessage || payload.feedbackWrong,
  );

  if (!instructionText) {
    throw new AdminLearnError("Instruction text is required.", 400);
  }
  if (!successMessage) {
    throw new AdminLearnError("Correct feedback is required.", 400);
  }
  if (!wrongMoveMessage) {
    throw new AdminLearnError("Wrong feedback is required.", 400);
  }

  const [maxOrder] = await LearnLessonStep.find({ lessonId: lesson._id })
    .sort({ orderIndex: -1 })
    .limit(1)
    .select("orderIndex")
    .lean();
  const nextOrder = Number(maxOrder?.orderIndex ?? -1) + 1;

  const created = await LearnLessonStep.create({
    lessonId: lesson._id,
    orderIndex: nextOrder,
    title: ensureString(payload.title),
    instructionText,
    explanationBeforeMove: ensureString(
      payload.explanationText ?? payload.explanationBeforeMove,
    ),
    fen: ensureString(payload.fen),
    sideToMove,
    boardOrientation,
    acceptedMoves,
    validationMode,
    feedbackCorrect: successMessage,
    feedbackWrong: wrongMoveMessage,
    successMessage,
    wrongMoveMessage,
    hintText: ensureString(payload.hintText),
    allowRetry: normalizeBoolean(payload.allowRetry, true),
    autoAdvance: normalizeBoolean(payload.autoAdvance, false),
    keepPositionOnWrong: normalizeBoolean(payload.keepPositionOnWrong, false),
    nextFen: ensureString(payload.nextFen),
    annotations: normalizeAnnotations(payload.annotations),
    isPublished: normalizeBoolean(payload.isPublished, true),
    successCondition: STEP_SUCCESS_CONDITIONS.has(
      ensureString(payload.successCondition),
    )
      ? ensureString(payload.successCondition)
      : "accepted_move",
  });

  return serializeStep(created.toObject());
}

async function updateAdminStep(stepId, payload = {}) {
  const step = await fetchStepOrThrow(stepId);

  const payloadAcceptedMoves =
    payload.correctMoves !== undefined ? payload.correctMoves : payload.acceptedMoves;
  const merged = {
    fen: payload.fen !== undefined ? payload.fen : step.fen,
    sideToMove:
      payload.sideToMove !== undefined ? payload.sideToMove : step.sideToMove,
    acceptedMoves:
      payloadAcceptedMoves !== undefined ? payloadAcceptedMoves : step.acceptedMoves,
  };

  const sideToMove = normalizeSideToMove(merged.sideToMove);
  const acceptedMoves = validateFenAndMoves({
    fen: merged.fen,
    sideToMove,
    acceptedMoves: merged.acceptedMoves,
  });

  const instructionText =
    payload.instructionText !== undefined
      ? ensureString(payload.instructionText)
      : step.instructionText;
  const nextSuccessMessage =
    payload.successMessage !== undefined
      ? ensureString(payload.successMessage)
      : payload.feedbackCorrect !== undefined
        ? ensureString(payload.feedbackCorrect)
        : ensureString(step.successMessage || step.feedbackCorrect);
  const nextWrongMoveMessage =
    payload.wrongMoveMessage !== undefined
      ? ensureString(payload.wrongMoveMessage)
      : payload.feedbackWrong !== undefined
        ? ensureString(payload.feedbackWrong)
        : ensureString(step.wrongMoveMessage || step.feedbackWrong);

  if (!instructionText) {
    throw new AdminLearnError("Instruction text is required.", 400);
  }
  if (!nextSuccessMessage) {
    throw new AdminLearnError("Correct feedback is required.", 400);
  }
  if (!nextWrongMoveMessage) {
    throw new AdminLearnError("Wrong feedback is required.", 400);
  }

  if (payload.title !== undefined) step.title = ensureString(payload.title);
  if (payload.instructionText !== undefined) step.instructionText = instructionText;
  if (payload.explanationBeforeMove !== undefined) {
    step.explanationBeforeMove = ensureString(payload.explanationBeforeMove);
  }
  if (payload.explanationText !== undefined) {
    step.explanationBeforeMove = ensureString(payload.explanationText);
  }
  if (payload.fen !== undefined) step.fen = ensureString(payload.fen);
  if (payload.sideToMove !== undefined) step.sideToMove = sideToMove;
  if (payload.boardOrientation !== undefined) {
    step.boardOrientation = normalizeBoardOrientation(
      payload.boardOrientation,
      normalizeBoardOrientation(step.boardOrientation, "white"),
    );
  }
  step.acceptedMoves = acceptedMoves;
  if (payload.validationMode !== undefined) {
    step.validationMode = normalizeValidationMode(
      payload.validationMode,
      normalizeValidationMode(step.validationMode, "one_of_many"),
    );
  }
  if (
    payload.feedbackCorrect !== undefined ||
    payload.successMessage !== undefined ||
    step.feedbackCorrect !== nextSuccessMessage
  ) {
    step.feedbackCorrect = nextSuccessMessage;
    step.successMessage = nextSuccessMessage;
  }
  if (
    payload.feedbackWrong !== undefined ||
    payload.wrongMoveMessage !== undefined ||
    step.feedbackWrong !== nextWrongMoveMessage
  ) {
    step.feedbackWrong = nextWrongMoveMessage;
    step.wrongMoveMessage = nextWrongMoveMessage;
  }
  if (payload.hintText !== undefined) step.hintText = ensureString(payload.hintText);
  if (payload.allowRetry !== undefined) {
    step.allowRetry = normalizeBoolean(payload.allowRetry, step.allowRetry !== false);
  }
  if (payload.autoAdvance !== undefined) {
    step.autoAdvance = normalizeBoolean(payload.autoAdvance, step.autoAdvance);
  }
  if (payload.keepPositionOnWrong !== undefined) {
    step.keepPositionOnWrong = normalizeBoolean(
      payload.keepPositionOnWrong,
      step.keepPositionOnWrong,
    );
  }
  if (payload.nextFen !== undefined) step.nextFen = ensureString(payload.nextFen);
  if (payload.annotations !== undefined) {
    step.annotations = normalizeAnnotations(payload.annotations);
  }
  if (payload.isPublished !== undefined) {
    step.isPublished = normalizeBoolean(payload.isPublished, !!step.isPublished);
  }
  if (payload.successCondition !== undefined) {
    const safeCondition = ensureString(payload.successCondition);
    step.successCondition = STEP_SUCCESS_CONDITIONS.has(safeCondition)
      ? safeCondition
      : "accepted_move";
  }

  await step.save();

  if (payload.orderIndex !== undefined) {
    const allSteps = await LearnLessonStep.find({ lessonId: step.lessonId })
      .sort({ orderIndex: 1, createdAt: 1 })
      .lean();
    const currentIds = allSteps.map((entry) => toId(entry._id));
    const currentIndex = currentIds.findIndex((id) => id === toId(step._id));
    if (currentIndex >= 0) {
      const targetIndex = Math.max(
        0,
        Math.min(
          currentIds.length - 1,
          normalizePositiveInteger(payload.orderIndex, currentIndex, 0),
        ),
      );
      if (targetIndex !== currentIndex) {
        const [moved] = currentIds.splice(currentIndex, 1);
        currentIds.splice(targetIndex, 0, moved);
        await applyStepOrder(step.lessonId, currentIds);
      }
    }
  }

  const latest = await LearnLessonStep.findById(step._id).lean();
  return serializeStep(latest);
}

async function deleteAdminStep(stepId) {
  const step = await fetchStepOrThrow(stepId);
  await LearnLessonStep.deleteOne({ _id: step._id });

  const remainingIds = (
    await LearnLessonStep.find({ lessonId: step.lessonId })
      .sort({ orderIndex: 1, createdAt: 1 })
      .select("_id")
      .lean()
  ).map((entry) => toId(entry._id));

  if (remainingIds.length) {
    await applyStepOrder(step.lessonId, remainingIds);
  }

  return { success: true };
}

async function reorderAdminSteps(lessonId, stepIds = []) {
  const lesson = await fetchLessonOrThrow(lessonId);
  const steps = await applyStepOrder(lesson._id, stepIds);
  return {
    lesson: serializeLesson(lesson.toObject(), steps.length),
    steps: steps.map(serializeStep),
  };
}

export {
  AdminLearnError,
  createAdminCourse,
  createAdminLesson,
  createAdminStep,
  deleteAdminCourse,
  deleteAdminLesson,
  deleteAdminStep,
  listAdminCourses,
  listAdminLessons,
  listAdminSteps,
  reorderAdminLessons,
  reorderAdminSteps,
  updateAdminCourse,
  updateAdminCourseCoverImage,
  updateAdminLesson,
  updateAdminStep,
};
