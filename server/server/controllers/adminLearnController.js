import {
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
} from "../services/adminLearnService.js";
import { deleteMediaAsset } from "../utils/mediaStorage.js";

function handleError(res, action, error) {
  if (error instanceof AdminLearnError) {
    return res.status(error.status || 400).json({ error: error.message });
  }

  console.error(`Admin learn ${action} error:`, error);
  return res.status(500).json({ error: "Server error" });
}

async function listCourses(req, res) {
  try {
    const data = await listAdminCourses({
      search: req.query?.search,
      category: req.query?.category,
      difficulty: req.query?.difficulty,
      status: req.query?.status,
    });
    res.json(data);
  } catch (error) {
    handleError(res, "list courses", error);
  }
}

async function createCourse(req, res) {
  try {
    const course = await createAdminCourse(req.body || {});
    res.status(201).json({ course });
  } catch (error) {
    handleError(res, "create course", error);
  }
}

async function updateCourse(req, res) {
  try {
    const course = await updateAdminCourse(req.params.courseId, req.body || {});
    res.json({ course });
  } catch (error) {
    handleError(res, "update course", error);
  }
}

async function uploadCourseCoverImage(req, res) {
  try {
    const course = await updateAdminCourseCoverImage(req.params.courseId, req.file);
    res.json({ course });
  } catch (error) {
    if (req.file?.assetId) {
      await deleteMediaAsset(req.file.assetId).catch(() => null);
    }
    handleError(res, "upload course cover image", error);
  }
}

async function deleteCourse(req, res) {
  try {
    await deleteAdminCourse(req.params.courseId);
    res.json({ success: true });
  } catch (error) {
    handleError(res, "delete course", error);
  }
}

async function listLessons(req, res) {
  try {
    const data = await listAdminLessons({
      courseId: req.params.courseId,
      search: req.query?.search,
      status: req.query?.status,
    });
    res.json(data);
  } catch (error) {
    handleError(res, "list lessons", error);
  }
}

async function createLesson(req, res) {
  try {
    const lesson = await createAdminLesson(req.params.courseId, req.body || {});
    res.status(201).json({ lesson });
  } catch (error) {
    handleError(res, "create lesson", error);
  }
}

async function updateLesson(req, res) {
  try {
    const lesson = await updateAdminLesson(req.params.lessonId, req.body || {});
    res.json({ lesson });
  } catch (error) {
    handleError(res, "update lesson", error);
  }
}

async function deleteLesson(req, res) {
  try {
    await deleteAdminLesson(req.params.lessonId);
    res.json({ success: true });
  } catch (error) {
    handleError(res, "delete lesson", error);
  }
}

async function reorderLessons(req, res) {
  try {
    const data = await reorderAdminLessons(
      req.body?.courseId,
      req.body?.lessonIds || [],
    );
    res.json(data);
  } catch (error) {
    handleError(res, "reorder lessons", error);
  }
}

async function listSteps(req, res) {
  try {
    const data = await listAdminSteps({
      lessonId: req.params.lessonId,
      search: req.query?.search,
    });
    res.json(data);
  } catch (error) {
    handleError(res, "list steps", error);
  }
}

async function createStep(req, res) {
  try {
    const step = await createAdminStep(req.params.lessonId, req.body || {});
    res.status(201).json({ step });
  } catch (error) {
    handleError(res, "create step", error);
  }
}

async function updateStep(req, res) {
  try {
    const step = await updateAdminStep(req.params.stepId, req.body || {});
    res.json({ step });
  } catch (error) {
    handleError(res, "update step", error);
  }
}

async function deleteStep(req, res) {
  try {
    await deleteAdminStep(req.params.stepId);
    res.json({ success: true });
  } catch (error) {
    handleError(res, "delete step", error);
  }
}

async function reorderSteps(req, res) {
  try {
    const data = await reorderAdminSteps(
      req.body?.lessonId,
      req.body?.stepIds || [],
    );
    res.json(data);
  } catch (error) {
    handleError(res, "reorder steps", error);
  }
}

export default {
  listCourses,
  createCourse,
  updateCourse,
  uploadCourseCoverImage,
  deleteCourse,
  listLessons,
  createLesson,
  updateLesson,
  deleteLesson,
  reorderLessons,
  listSteps,
  createStep,
  updateStep,
  deleteStep,
  reorderSteps,
};
