import mongoose from "mongoose";

const LessonMNSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LearnMN",
      required: true,
      index: true,
    },
    slug: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, default: "", trim: true },
    description: { type: String, default: "", trim: true },
    pairId: {
      type: String,
      trim: true,
      match: [/^\d{5}$/, "Pair ID must be exactly 5 digits."],
    },
    orderIndex: { type: Number, required: true, min: 0 },
    estimatedMinutes: { type: Number, default: 10, min: 1 },
    isPublished: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

LessonMNSchema.index({ courseId: 1, slug: 1 }, { unique: true });
LessonMNSchema.index({ courseId: 1, orderIndex: 1 }, { unique: true });
LessonMNSchema.index({ pairId: 1 }, { unique: true, sparse: true });

const LessonMN =
  mongoose.models.LessonMN ||
  mongoose.model("LessonMN", LessonMNSchema, "lessonmn");

export default LessonMN;
