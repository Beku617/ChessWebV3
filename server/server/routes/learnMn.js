import { Router } from "express";
import { authMiddleware } from "../middleware/index.js";
import learnMnController from "../controllers/learnMnController.js";

const router = Router();

router.use(authMiddleware);

router.get("/courses", learnMnController.listCourses);
router.get("/pair/:pairId", learnMnController.getByPairId);
router.get("/courses/:courseSlug", learnMnController.getCourse);
router.get("/lessons/:courseSlug/:lessonSlug", learnMnController.getLesson);
router.get("/progress/me", learnMnController.getMyProgress);
router.get(
  "/progress/:courseSlug/:lessonSlug",
  learnMnController.getLessonProgress,
);
router.post(
  "/progress/:courseSlug/:lessonSlug/step",
  learnMnController.submitStep,
);
router.post(
  "/progress/:courseSlug/:lessonSlug/complete",
  learnMnController.complete,
);
router.get("/search", learnMnController.search);

export default router;

