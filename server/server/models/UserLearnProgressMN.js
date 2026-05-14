import mongoose from "mongoose";

const CompletedStepMNSchema = new mongoose.Schema(
  {
    lessonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LessonMN",
      required: true,
    },
    stepIndex: { type: Number, required: true, min: 0 },
    completedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const UserLearnProgressMNSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LearnMN",
      required: true,
      index: true,
    },
    lessonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LessonMN",
      required: true,
      index: true,
    },
    currentStepIndex: { type: Number, default: 0, min: 0 },
    completedSteps: { type: [CompletedStepMNSchema], default: [] },
    completedLessons: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "LessonMN",
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

UserLearnProgressMNSchema.index({ userId: 1, courseId: 1 }, { unique: true });
UserLearnProgressMNSchema.index({ userId: 1, lastViewedAt: -1 });

const UserLearnProgressMN =
  mongoose.models.UserLearnProgressMN ||
  mongoose.model(
    "UserLearnProgressMN",
    UserLearnProgressMNSchema,
    "userlearnprogressmn",
  );

export default UserLearnProgressMN;
