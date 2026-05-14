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

const LearnMNSchema = new mongoose.Schema(
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
    badge: { type: String, default: "", trim: true },
    icon: { type: String, default: "", trim: true },
    instructorName: { type: String, default: "", trim: true },
    pairId: {
      type: String,
      trim: true,
      match: [/^\d{5}$/, "Pair ID must be exactly 5 digits."],
    },
    tags: { type: [String], default: [] },
    totalLessons: { type: Number, default: 0, min: 0 },
    sortOrder: { type: Number, default: 0, min: 0, index: true },
    isPublished: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

LearnMNSchema.index({
  category: 1,
  difficulty: 1,
  isPublished: 1,
  sortOrder: 1,
});
LearnMNSchema.index({ pairId: 1 }, { unique: true, sparse: true });

const LearnMN =
  mongoose.models.LearnMN ||
  mongoose.model("LearnMN", LearnMNSchema, "learnmn");

export default LearnMN;
