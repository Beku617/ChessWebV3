import { Router } from "express";
import multer from "multer";
import { adminAuthMiddleware } from "../middleware/index.js";
import adminLearnMnController from "../controllers/adminLearnMnController.js";
import {
  createMediaUploadStorage,
  deleteMediaAsset,
} from "../utils/mediaStorage.js";

const router = Router();

const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
    return;
  }
  cb(
    new Error("Invalid file type. Only JPG, PNG, GIF, and WebP are allowed."),
    false,
  );
};

const upload = multer({
  storage: createMediaUploadStorage({
    category: "learn-course-cover",
  }),
  fileFilter,
  limits: { fileSize: 8 * 1024 * 1024 },
});

const uploadCoverImageFile = (req, res, next) =>
  upload.single("coverImageFile")(req, res, async (error) => {
    if (!error) {
      return next();
    }

    if (req.file?.assetId) {
      await deleteMediaAsset(req.file.assetId).catch(() => null);
    }

    let message = "Failed to upload cover image.";
    if (error instanceof multer.MulterError) {
      message =
        error.code === "LIMIT_FILE_SIZE"
          ? "Cover image is too large. Maximum size is 8MB."
          : error.message || message;
    } else if (error instanceof Error && error.message) {
      message = error.message;
    }

    return res.status(400).json({ error: message });
  });

router.use(adminAuthMiddleware);

router.get("/courses", adminLearnMnController.listCourses);
router.post("/import-from-en", adminLearnMnController.importFromEn);
router.post("/courses", adminLearnMnController.createCourse);
router.patch("/courses/:courseId", adminLearnMnController.updateCourse);
router.post(
  "/courses/:courseId/cover-image",
  uploadCoverImageFile,
  adminLearnMnController.uploadCourseCoverImage,
);
router.delete("/courses/:courseId", adminLearnMnController.deleteCourse);

router.get("/courses/:courseId/lessons", adminLearnMnController.listLessons);
router.post("/courses/:courseId/lessons", adminLearnMnController.createLesson);
router.patch("/lessons/:lessonId", adminLearnMnController.updateLesson);
router.delete("/lessons/:lessonId", adminLearnMnController.deleteLesson);
router.post("/lessons/reorder", adminLearnMnController.reorderLessons);

router.get("/lessons/:lessonId/steps", adminLearnMnController.listSteps);
router.post("/lessons/:lessonId/steps", adminLearnMnController.createStep);
router.patch("/steps/:stepId", adminLearnMnController.updateStep);
router.delete("/steps/:stepId", adminLearnMnController.deleteStep);
router.post("/steps/reorder", adminLearnMnController.reorderSteps);

export default router;

