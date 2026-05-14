import mongoose from "mongoose";
import {
  FeaturedEvent,
  LearnCourse,
  LearnLesson,
  LearnLessonStep,
  LearnMN,
  LessonMN,
  LessonStepMN,
} from "../models/index.js";
import EventMN from "../models/EventMN.js";

const PAIR_ID_PATTERN = /^\d{5}$/;

class AdminContentImportError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "AdminContentImportError";
    this.status = status;
  }
}

function toId(value) {
  return value ? String(value) : "";
}

function asObjectId(value, label = "id") {
  const raw = toId(value).trim();
  if (!mongoose.Types.ObjectId.isValid(raw)) {
    throw new AdminContentImportError(`Invalid ${label}.`, 400);
  }
  return new mongoose.Types.ObjectId(raw);
}

function ensureString(value) {
  return String(value || "").trim();
}

function normalizePairId(value) {
  const normalized = ensureString(value);
  if (!normalized) return "";
  return PAIR_ID_PATTERN.test(normalized) ? normalized : "";
}

function generateRandomPairId() {
  return String(Math.floor(Math.random() * 90000) + 10000);
}

function stripMeta(doc = {}) {
  const clone = { ...doc };
  delete clone._id;
  delete clone.__v;
  delete clone.createdAt;
  delete clone.updatedAt;
  return clone;
}

async function generateUniquePairId(models = [], maxAttempts = 300) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = generateRandomPairId();
    const checks = await Promise.all(
      models.map((model) => model.exists({ pairId: candidate })),
    );
    if (checks.every((entry) => !entry)) {
      return candidate;
    }
  }

  throw new AdminContentImportError(
    "Unable to generate a unique Pair ID. Please try again.",
    500,
  );
}

async function resolveCoursePairId({
  sourceCourse,
  sourceCourseModel,
  targetCourseModel,
}) {
  const existingPairId = normalizePairId(sourceCourse?.pairId);
  if (existingPairId) return existingPairId;

  const generated = await generateUniquePairId([
    sourceCourseModel,
    targetCourseModel,
  ]);
  await sourceCourseModel.updateOne(
    { _id: sourceCourse._id },
    { $set: { pairId: generated } },
  );
  return generated;
}

async function resolveLessonPairId({
  sourceLesson,
  sourceLessonModel,
  targetLessonModel,
}) {
  const existingPairId = normalizePairId(sourceLesson?.pairId);
  if (existingPairId) return existingPairId;

  const generated = await generateUniquePairId([
    sourceLessonModel,
    targetLessonModel,
  ]);
  await sourceLessonModel.updateOne(
    { _id: sourceLesson._id },
    { $set: { pairId: generated } },
  );
  return generated;
}

async function importLearnCourses({
  sourceCourseModel,
  sourceLessonModel,
  sourceStepModel,
  targetCourseModel,
  targetLessonModel,
  targetStepModel,
  sourceCourseIds = [],
}) {
  const safeIds = Array.from(
    new Set(
      (sourceCourseIds || [])
        .map((entry) => {
          try {
            return toId(asObjectId(entry, "course id"));
          } catch {
            return "";
          }
        })
        .filter(Boolean),
    ),
  );

  if (!safeIds.length) {
    throw new AdminContentImportError("Please select at least one course.", 400);
  }

  const warnings = [];
  let importedCount = 0;

  for (const rawCourseId of safeIds) {
    const sourceCourse = await sourceCourseModel
      .findById(asObjectId(rawCourseId, "course id"))
      .lean();
    if (!sourceCourse) {
      continue;
    }

    const title = ensureString(sourceCourse.title) || "Untitled course";
    const coursePairId = await resolveCoursePairId({
      sourceCourse,
      sourceCourseModel,
      targetCourseModel,
    });

    const targetExistingCourse = await targetCourseModel
      .findOne({ pairId: coursePairId })
      .select("_id")
      .lean();
    if (targetExistingCourse) {
      warnings.push(`Already imported: ${title}`);
      continue;
    }

    const sourceLessons = await sourceLessonModel
      .find({ courseId: sourceCourse._id })
      .sort({ orderIndex: 1, createdAt: 1 })
      .lean();

    const sourceLessonIds = sourceLessons.map((lesson) => lesson._id);
    const sourceSteps = sourceLessonIds.length
      ? await sourceStepModel
          .find({ lessonId: { $in: sourceLessonIds } })
          .sort({ lessonId: 1, orderIndex: 1, createdAt: 1 })
          .lean()
      : [];

    const lessonPairMap = new Map();
    for (const lesson of sourceLessons) {
      const pairId = await resolveLessonPairId({
        sourceLesson: lesson,
        sourceLessonModel,
        targetLessonModel,
      });
      lessonPairMap.set(toId(lesson._id), pairId);
    }

    const lessonPairIds = Array.from(
      new Set(Array.from(lessonPairMap.values()).filter(Boolean)),
    );
    if (lessonPairIds.length > 0) {
      const existingTargetLesson = await targetLessonModel
        .findOne({ pairId: { $in: lessonPairIds } })
        .select("_id")
        .lean();
      if (existingTargetLesson) {
        warnings.push(`Already imported: ${title}`);
        continue;
      }
    }

    let createdCourseId = null;
    let createdLessonIds = [];

    try {
      const targetCoursePayload = {
        ...stripMeta(sourceCourse),
        pairId: coursePairId,
      };
      const createdCourse = await targetCourseModel.create(targetCoursePayload);
      createdCourseId = createdCourse._id;

      const sourceToTargetLessonId = new Map();
      for (const lesson of sourceLessons) {
        const targetLessonPayload = {
          ...stripMeta(lesson),
          courseId: createdCourse._id,
          pairId: lessonPairMap.get(toId(lesson._id)) || "",
        };
        const createdLesson = await targetLessonModel.create(targetLessonPayload);
        createdLessonIds.push(createdLesson._id);
        sourceToTargetLessonId.set(toId(lesson._id), createdLesson._id);
      }

      if (sourceSteps.length > 0) {
        const targetStepPayloads = sourceSteps
          .map((step) => {
            const targetLessonId = sourceToTargetLessonId.get(toId(step.lessonId));
            if (!targetLessonId) return null;
            return {
              ...stripMeta(step),
              lessonId: targetLessonId,
            };
          })
          .filter(Boolean);
        if (targetStepPayloads.length > 0) {
          await targetStepModel.insertMany(targetStepPayloads, { ordered: true });
        }
      }

      importedCount += 1;
    } catch (error) {
      if (createdLessonIds.length > 0) {
        await targetStepModel
          .deleteMany({ lessonId: { $in: createdLessonIds } })
          .catch(() => null);
      }
      if (createdCourseId) {
        await targetLessonModel
          .deleteMany({ courseId: createdCourseId })
          .catch(() => null);
        await targetCourseModel.deleteOne({ _id: createdCourseId }).catch(() => null);
      }
      warnings.push(`Already imported: ${title}`);
    }
  }

  return {
    importedCount,
    warnings,
  };
}

async function importEvents({
  sourceEventModel,
  targetEventModel,
  sourceEventIds = [],
}) {
  const safeIds = Array.from(
    new Set(
      (sourceEventIds || [])
        .map((entry) => {
          try {
            return toId(asObjectId(entry, "event id"));
          } catch {
            return "";
          }
        })
        .filter(Boolean),
    ),
  );

  if (!safeIds.length) {
    throw new AdminContentImportError("Please select at least one event.", 400);
  }

  const warnings = [];
  let importedCount = 0;

  for (const rawEventId of safeIds) {
    const sourceEvent = await sourceEventModel
      .findById(asObjectId(rawEventId, "event id"))
      .lean();
    if (!sourceEvent) continue;

    const title = ensureString(sourceEvent.title) || "Untitled event";
    let pairId = normalizePairId(sourceEvent.pairId);
    if (!pairId) {
      pairId = await generateUniquePairId([sourceEventModel, targetEventModel]);
      await sourceEventModel.updateOne(
        { _id: sourceEvent._id },
        { $set: { pairId } },
      );
    }

    const existing = await targetEventModel
      .findOne({ pairId })
      .select("_id")
      .lean();
    if (existing) {
      warnings.push(`Already imported: ${title}`);
      continue;
    }

    try {
      const targetPayload = {
        ...stripMeta(sourceEvent),
        pairId,
      };
      await targetEventModel.create(targetPayload);
      importedCount += 1;
    } catch {
      warnings.push(`Already imported: ${title}`);
    }
  }

  return {
    importedCount,
    warnings,
  };
}

async function importLearnToMn({ sourceCourseIds = [] }) {
  return importLearnCourses({
    sourceCourseModel: LearnCourse,
    sourceLessonModel: LearnLesson,
    sourceStepModel: LearnLessonStep,
    targetCourseModel: LearnMN,
    targetLessonModel: LessonMN,
    targetStepModel: LessonStepMN,
    sourceCourseIds,
  });
}

async function importLearnToEn({ sourceCourseIds = [] }) {
  return importLearnCourses({
    sourceCourseModel: LearnMN,
    sourceLessonModel: LessonMN,
    sourceStepModel: LessonStepMN,
    targetCourseModel: LearnCourse,
    targetLessonModel: LearnLesson,
    targetStepModel: LearnLessonStep,
    sourceCourseIds,
  });
}

async function importEventsToMn({ sourceEventIds = [] }) {
  return importEvents({
    sourceEventModel: FeaturedEvent,
    targetEventModel: EventMN,
    sourceEventIds,
  });
}

async function importEventsToEn({ sourceEventIds = [] }) {
  return importEvents({
    sourceEventModel: EventMN,
    targetEventModel: FeaturedEvent,
    sourceEventIds,
  });
}

export {
  AdminContentImportError,
  importEventsToEn,
  importEventsToMn,
  importLearnToEn,
  importLearnToMn,
};
