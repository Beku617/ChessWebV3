import { Router } from "express";
import { adminAuthMiddleware } from "../middleware/index.js";
import adminLearnController from "../controllers/adminLearnController.js";

const router = Router();

router.use(adminAuthMiddleware);

router.get("/courses", adminLearnController.listCourses);
router.post("/courses", adminLearnController.createCourse);
router.patch("/courses/:courseId", adminLearnController.updateCourse);
router.delete("/courses/:courseId", adminLearnController.deleteCourse);

router.get("/courses/:courseId/lessons", adminLearnController.listLessons);
router.post("/courses/:courseId/lessons", adminLearnController.createLesson);
router.patch("/lessons/:lessonId", adminLearnController.updateLesson);
router.delete("/lessons/:lessonId", adminLearnController.deleteLesson);
router.post("/lessons/reorder", adminLearnController.reorderLessons);

router.get("/lessons/:lessonId/steps", adminLearnController.listSteps);
router.post("/lessons/:lessonId/steps", adminLearnController.createStep);
router.patch("/steps/:stepId", adminLearnController.updateStep);
router.delete("/steps/:stepId", adminLearnController.deleteStep);
router.post("/steps/reorder", adminLearnController.reorderSteps);

export default router;
