import mongoose from "mongoose";

export const LEARN_CATEGORIES = [
  "Openings",
  "Middlegame",
  "Endgame",
  "Strategy",
];

export const LEARN_DIFFICULTIES = [
  "Beginner",
  "Intermediate",
  "Advanced",
];

const LearnCourseSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, default: "", trim: true },
    description: { type: String, default: "", trim: true },
    category: {
      type: String,
      enum: LEARN_CATEGORIES,
      required: true,
      index: true,
    },
    difficulty: {
      type: String,
      enum: LEARN_DIFFICULTIES,
      required: true,
      index: true,
    },
    coverImage: { type: String, default: "", trim: true },
    icon: { type: String, default: "", trim: true },
    instructorName: { type: String, default: "", trim: true },
    tags: { type: [String], default: [] },
    totalLessons: { type: Number, default: 0, min: 0 },
    isPublished: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

LearnCourseSchema.index({ category: 1, difficulty: 1, isPublished: 1 });

const LearnCourse =
  mongoose.models.LearnCourse ||
  mongoose.model("LearnCourse", LearnCourseSchema);

export default LearnCourse;
