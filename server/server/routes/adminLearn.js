import { Router } from "express";
import multer from "multer";
import { adminAuthMiddleware } from "../middleware/index.js";
import adminLearnController from "../controllers/adminLearnController.js";
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

router.get("/courses", adminLearnController.listCourses);
router.post("/import-from-mn", adminLearnController.importFromMn);
router.post("/courses", adminLearnController.createCourse);
router.patch("/courses/:courseId", adminLearnController.updateCourse);
router.post(
  "/courses/:courseId/cover-image",
  uploadCoverImageFile,
  adminLearnController.uploadCourseCoverImage,
);
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
