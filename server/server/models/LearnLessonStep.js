import mongoose from "mongoose";

const LearnLessonStepSchema = new mongoose.Schema(
  {
    lessonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LearnLesson",
      required: true,
      index: true,
    },
    orderIndex: { type: Number, required: true, min: 0 },
    title: { type: String, default: "", trim: true },
    instructionText: { type: String, default: "", trim: true },
    explanationBeforeMove: { type: String, default: "", trim: true },
    fen: { type: String, required: true, trim: true },
    sideToMove: {
      type: String,
      enum: ["white", "black"],
      required: true,
    },
    acceptedMoves: {
      type: [String],
      required: true,
      validate: {
        validator: (value) => Array.isArray(value) && value.length > 0,
        message: "At least one accepted move is required.",
      },
    },
    feedbackCorrect: { type: String, default: "", trim: true },
    feedbackWrong: { type: String, default: "", trim: true },
    nextFen: { type: String, default: "", trim: true },
    hintText: { type: String, default: "", trim: true },
    successCondition: {
      type: String,
      default: "accepted_move",
      trim: true,
    },
    autoAdvance: { type: Boolean, default: false },
    keepPositionOnWrong: { type: Boolean, default: false },
  },
  { timestamps: true },
);

LearnLessonStepSchema.index({ lessonId: 1, orderIndex: 1 }, { unique: true });

const LearnLessonStep =
  mongoose.models.LearnLessonStep ||
  mongoose.model("LearnLessonStep", LearnLessonStepSchema);

export default LearnLessonStep;
