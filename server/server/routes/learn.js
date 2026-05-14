import { Router } from "express";
import { authMiddleware } from "../middleware/index.js";
import learnController from "../controllers/learnController.js";

const router = Router();

router.use(authMiddleware);

router.get("/courses", learnController.listCourses);
router.get("/pair/:pairId", learnController.getByPairId);
router.get("/courses/:courseSlug", learnController.getCourse);
router.get("/lessons/:courseSlug/:lessonSlug", learnController.getLesson);
router.get("/progress/me", learnController.getMyProgress);
router.get(
  "/progress/:courseSlug/:lessonSlug",
  learnController.getLessonProgress,
);
router.post(
  "/progress/:courseSlug/:lessonSlug/step",
  learnController.submitStep,
);
router.post(
  "/progress/:courseSlug/:lessonSlug/complete",
  learnController.complete,
);
router.get("/search", learnController.search);

export default router;
