import {
  completeLesson,
  getCourseBySlug,
  getCourseCatalog,
  getCourseOrLessonByPairId,
  getLearnSummary,
  getLessonBySlug,
  getLessonProgressBySlug,
  searchLearnContent,
  submitLessonStep,
} from "../services/learnMnService.js";

function getUserId(req) {
  return String(req.user?.userId || "");
}

async function listCourses(req, res) {
  try {
    const userId = getUserId(req);
    const [courses, summary] = await Promise.all([
      getCourseCatalog({
        userId,
        query: req.query?.q,
        category: req.query?.category,
        difficulty: req.query?.difficulty,
        progressStatus: req.query?.progress,
      }),
      getLearnSummary({ userId }),
    ]);
    res.json({ courses, summary });
  } catch (error) {
    console.error("Learn MN list courses error:", error);
    res.status(500).json({ error: "Failed to load Learn MN catalog." });
  }
}

async function getCourse(req, res) {
  try {
    const userId = getUserId(req);
    const data = await getCourseBySlug({
      userId,
      courseSlug: req.params.courseSlug,
    });
    if (!data) {
      return res.status(404).json({ error: "Course not found." });
    }
    res.json(data);
  } catch (error) {
    console.error("Learn MN get course error:", error);
    res.status(500).json({ error: "Failed to load course." });
  }
}

async function getByPairId(req, res) {
  try {
    const data = await getCourseOrLessonByPairId({
      pairId: req.params.pairId,
    });
    if (data?.error) {
      return res.status(data.error.status || 400).json({ error: data.error.message });
    }
    res.json(data);
  } catch (error) {
    console.error("Learn MN get by pairId error:", error);
    res.status(500).json({ error: "Failed to load pair mapping." });
  }
}

async function getLesson(req, res) {
  try {
    const userId = getUserId(req);
    const data = await getLessonBySlug({
      userId,
      courseSlug: req.params.courseSlug,
      lessonSlug: req.params.lessonSlug,
    });
    if (!data) {
      return res.status(404).json({ error: "Lesson not found." });
    }
    res.json(data);
  } catch (error) {
    console.error("Learn MN get lesson error:", error);
    res.status(500).json({ error: "Failed to load lesson." });
  }
}

async function getMyProgress(req, res) {
  try {
    const summary = await getLearnSummary({ userId: getUserId(req) });
    res.json(summary);
  } catch (error) {
    console.error("Learn MN summary error:", error);
    res.status(500).json({ error: "Failed to load progress summary." });
  }
}

async function getLessonProgress(req, res) {
  try {
    const data = await getLessonProgressBySlug({
      userId: getUserId(req),
      courseSlug: req.params.courseSlug,
      lessonSlug: req.params.lessonSlug,
    });
    if (!data) {
      return res.status(404).json({ error: "Lesson not found." });
    }
    res.json(data);
  } catch (error) {
    console.error("Learn MN lesson progress error:", error);
    res.status(500).json({ error: "Failed to load lesson progress." });
  }
}

async function submitStep(req, res) {
  try {
    const result = await submitLessonStep({
      userId: getUserId(req),
      courseSlug: req.params.courseSlug,
      lessonSlug: req.params.lessonSlug,
      stepIndex: req.body?.stepIndex,
      movePayload: {
        move: req.body?.move,
        san: req.body?.san,
        uci: req.body?.uci,
        from: req.body?.from,
        to: req.body?.to,
        promotion: req.body?.promotion,
      },
    });

    if (result?.error) {
      return res.status(result.error.status || 400).json({ error: result.error.message });
    }

    res.json(result);
  } catch (error) {
    console.error("Learn MN submit step error:", error);
    res.status(500).json({ error: "Failed to submit lesson step." });
  }
}

async function complete(req, res) {
  try {
    const result = await completeLesson({
      userId: getUserId(req),
      courseSlug: req.params.courseSlug,
      lessonSlug: req.params.lessonSlug,
    });
    if (result?.error) {
      return res.status(result.error.status || 400).json({ error: result.error.message });
    }
    res.json(result);
  } catch (error) {
    console.error("Learn MN complete lesson error:", error);
    res.status(500).json({ error: "Failed to complete lesson." });
  }
}

async function search(req, res) {
  try {
    const query = String(req.query?.q || "").trim();
    const data = await searchLearnContent({ query });
    res.json(data);
  } catch (error) {
    console.error("Learn MN search error:", error);
    res.status(500).json({ error: "Failed to search Learn MN content." });
  }
}

export default {
  listCourses,
  getCourse,
  getByPairId,
  getLesson,
  getMyProgress,
  getLessonProgress,
  submitStep,
  complete,
  search,
};

