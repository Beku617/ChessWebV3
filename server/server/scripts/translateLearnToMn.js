import mongoose from "mongoose";
import { loadServerEnv } from "../config/env.js";
import LearnCourse from "../models/LearnCourse.js";
import LearnLesson from "../models/LearnLesson.js";
import LearnLessonStep from "../models/LearnLessonStep.js";
import LearnMN from "../models/LearnMN.js";
import LessonMN from "../models/LessonMN.js";
import LessonStepMN from "../models/LessonStepMN.js";
import UserLearnProgressMN from "../models/UserLearnProgressMN.js";

loadServerEnv();

const TRANSLATE_URL = "https://translate.googleapis.com/translate_a/single";
const textCache = new Map();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function safeText(value) {
  return String(value || "").trim();
}

async function translateText(text) {
  const source = safeText(text);
  if (!source) return "";
  if (textCache.has(source)) return textCache.get(source);

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const url = new URL(TRANSLATE_URL);
      url.searchParams.set("client", "gtx");
      url.searchParams.set("sl", "en");
      url.searchParams.set("tl", "mn");
      url.searchParams.set("dt", "t");
      url.searchParams.set("q", source);

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      const translated = Array.isArray(payload?.[0])
        ? payload[0].map((segment) => String(segment?.[0] || "")).join("").trim()
        : "";

      if (!translated) {
        throw new Error("Empty translation payload");
      }

      textCache.set(source, translated);
      return translated;
    } catch (error) {
      lastError = error;
      await wait(attempt * 250);
    }
  }

  throw lastError || new Error("Translation failed");
}

async function translateTextArray(values = []) {
  const translated = [];
  for (const value of values) {
    translated.push(await translateText(value));
  }
  return translated.filter(Boolean);
}

async function run() {
  const mongoUrl = process.env.MONGODB_URL;
  if (!mongoUrl) {
    throw new Error("MONGODB_URL is not set");
  }

  await mongoose.connect(mongoUrl);

  const [englishCourses, englishLessons, englishSteps] = await Promise.all([
    LearnCourse.find({}).sort({ sortOrder: 1, createdAt: 1 }).lean(),
    LearnLesson.find({}).sort({ orderIndex: 1, createdAt: 1 }).lean(),
    LearnLessonStep.find({}).sort({ orderIndex: 1, createdAt: 1 }).lean(),
  ]);

  await Promise.all([
    LessonStepMN.deleteMany({}),
    LessonMN.deleteMany({}),
    LearnMN.deleteMany({}),
    UserLearnProgressMN.deleteMany({}),
  ]);

  const courseIdMap = new Map();
  const lessonIdMap = new Map();

  for (const course of englishCourses) {
    const translatedTags = await translateTextArray(Array.isArray(course.tags) ? course.tags : []);

    const translatedCourse = await LearnMN.create({
      slug: safeText(course.slug),
      title: await translateText(course.title),
      subtitle: await translateText(course.subtitle),
      description: await translateText(course.description),
      category: safeText(course.category),
      difficulty: safeText(course.difficulty),
      coverImage: safeText(course.coverImage),
      badge: await translateText(course.badge),
      icon: await translateText(course.icon),
      instructorName: await translateText(course.instructorName),
      tags: translatedTags,
      totalLessons: Number(course.totalLessons || 0),
      sortOrder: Number(course.sortOrder || 0),
      isPublished: !!course.isPublished,
      createdAt: course.createdAt || undefined,
      updatedAt: course.updatedAt || undefined,
    });

    courseIdMap.set(String(course._id), translatedCourse._id);
  }

  for (const lesson of englishLessons) {
    const mappedCourseId = courseIdMap.get(String(lesson.courseId));
    if (!mappedCourseId) continue;

    const translatedLesson = await LessonMN.create({
      courseId: mappedCourseId,
      slug: safeText(lesson.slug),
      title: await translateText(lesson.title),
      subtitle: await translateText(lesson.subtitle),
      description: await translateText(lesson.description),
      orderIndex: Number(lesson.orderIndex || 0),
      estimatedMinutes: Number(lesson.estimatedMinutes || 10),
      isPublished: !!lesson.isPublished,
      createdAt: lesson.createdAt || undefined,
      updatedAt: lesson.updatedAt || undefined,
    });

    lessonIdMap.set(String(lesson._id), translatedLesson._id);
  }

  for (const step of englishSteps) {
    const mappedLessonId = lessonIdMap.get(String(step.lessonId));
    if (!mappedLessonId) continue;

    await LessonStepMN.create({
      lessonId: mappedLessonId,
      orderIndex: Number(step.orderIndex || 0),
      title: await translateText(step.title),
      instructionText: await translateText(step.instructionText),
      explanationBeforeMove: await translateText(step.explanationBeforeMove),
      fen: safeText(step.fen),
      sideToMove: safeText(step.sideToMove),
      boardOrientation: safeText(step.boardOrientation || "white"),
      acceptedMoves: Array.isArray(step.acceptedMoves) ? step.acceptedMoves : [],
      validationMode: safeText(step.validationMode || "one_of_many"),
      feedbackCorrect: await translateText(step.feedbackCorrect),
      feedbackWrong: await translateText(step.feedbackWrong),
      successMessage: await translateText(step.successMessage),
      wrongMoveMessage: await translateText(step.wrongMoveMessage),
      nextFen: safeText(step.nextFen),
      hintText: await translateText(step.hintText),
      successCondition: safeText(step.successCondition || "accepted_move"),
      allowRetry: step.allowRetry !== false,
      autoAdvance: !!step.autoAdvance,
      keepPositionOnWrong: !!step.keepPositionOnWrong,
      annotations:
        step.annotations && typeof step.annotations === "object"
          ? step.annotations
          : {},
      isPublished: step.isPublished !== false,
      createdAt: step.createdAt || undefined,
      updatedAt: step.updatedAt || undefined,
    });
  }

  const [mnCourses, mnLessons, mnSteps] = await Promise.all([
    LearnMN.countDocuments(),
    LessonMN.countDocuments(),
    LessonStepMN.countDocuments(),
  ]);

  console.log(
    JSON.stringify(
      {
        success: true,
        englishSource: {
          courses: englishCourses.length,
          lessons: englishLessons.length,
          steps: englishSteps.length,
        },
        mongolianInserted: {
          courses: mnCourses,
          lessons: mnLessons,
          steps: mnSteps,
        },
        uniqueTranslatedStrings: textCache.size,
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error("Learn MN translation migration failed:", error);
  try {
    await mongoose.disconnect();
  } catch {
    // no-op
  }
  process.exit(1);
});
