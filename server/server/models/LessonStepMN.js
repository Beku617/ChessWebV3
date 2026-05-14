import mongoose from "mongoose";

export const LEARN_STEP_VALIDATION_MODES = ["exact", "one_of_many"];

const LessonStepMNSchema = new mongoose.Schema(
  {
    lessonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LessonMN",
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
    boardOrientation: {
      type: String,
      enum: ["white", "black"],
      default: "white",
    },
    acceptedMoves: {
      type: [String],
      required: true,
      validate: {
        validator: (value) => Array.isArray(value) && value.length > 0,
        message: "At least one accepted move is required.",
      },
    },
    validationMode: {
      type: String,
      enum: LEARN_STEP_VALIDATION_MODES,
      default: "one_of_many",
    },
    feedbackCorrect: { type: String, default: "", trim: true },
    feedbackWrong: { type: String, default: "", trim: true },
    successMessage: { type: String, default: "", trim: true },
    wrongMoveMessage: { type: String, default: "", trim: true },
    nextFen: { type: String, default: "", trim: true },
    hintText: { type: String, default: "", trim: true },
    successCondition: {
      type: String,
      default: "accepted_move",
      trim: true,
    },
    allowRetry: { type: Boolean, default: true },
    autoAdvance: { type: Boolean, default: false },
    keepPositionOnWrong: { type: Boolean, default: false },
    annotations: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isPublished: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

LessonStepMNSchema.index({ lessonId: 1, orderIndex: 1 }, { unique: true });

const LessonStepMN =
  mongoose.models.LessonStepMN ||
  mongoose.model("LessonStepMN", LessonStepMNSchema, "lessonstepmn");

export default LessonStepMN;
