import mongoose from "mongoose";

const LearnLessonSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LearnCourse",
      required: true,
      index: true,
    },
    slug: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, default: "", trim: true },
    description: { type: String, default: "", trim: true },
    orderIndex: { type: Number, required: true, min: 0 },
    estimatedMinutes: { type: Number, default: 10, min: 1 },
    isPublished: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

LearnLessonSchema.index({ courseId: 1, slug: 1 }, { unique: true });
LearnLessonSchema.index({ courseId: 1, orderIndex: 1 }, { unique: true });

const LearnLesson =
  mongoose.models.LearnLesson ||
  mongoose.model("LearnLesson", LearnLessonSchema);

export default LearnLesson;
