import mongoose from "mongoose";

const CompletedStepSchema = new mongoose.Schema(
  {
    lessonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LearnLesson",
      required: true,
    },
    stepIndex: { type: Number, required: true, min: 0 },
    completedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const UserLearnProgressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LearnCourse",
      required: true,
      index: true,
    },
    lessonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LearnLesson",
      required: true,
      index: true,
    },
    currentStepIndex: { type: Number, default: 0, min: 0 },
    completedSteps: { type: [CompletedStepSchema], default: [] },
    completedLessons: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "LearnLesson",
      default: [],
    },
    startedAt: { type: Date, default: Date.now },
    lastViewedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    percentComplete: { type: Number, default: 0, min: 0, max: 100 },
    activityDays: { type: [String], default: [] },
    lastInteractionAt: { type: Date, default: null },
  },
  { timestamps: true },
);

UserLearnProgressSchema.index({ userId: 1, courseId: 1 }, { unique: true });
UserLearnProgressSchema.index({ userId: 1, lastViewedAt: -1 });

const UserLearnProgress =
  mongoose.models.UserLearnProgress ||
  mongoose.model("UserLearnProgress", UserLearnProgressSchema);

export default UserLearnProgress;
