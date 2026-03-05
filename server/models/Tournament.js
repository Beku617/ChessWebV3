import mongoose from "mongoose";

const TournamentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    type: {
      type: String,
      enum: ["swiss", "roundRobin", "knockout"],
      required: true,
    },
    timeControl: {
      baseMs: { type: Number, required: true, min: 1000 },
      incMs: { type: Number, required: true, min: 0, default: 0 },
      label: { type: String, default: "" },
    },
    ratingMin: { type: Number, default: null },
    ratingMax: { type: Number, default: null },
    status: {
      type: String,
      enum: ["draft", "registering", "running", "finished"],
      default: "registering",
    },
    roundsPlanned: { type: Number, min: 1, default: 1 },
    currentRound: { type: Number, min: 0, default: 0 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    managerIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

TournamentSchema.index({ status: 1, createdAt: -1 });
TournamentSchema.index({ type: 1, status: 1 });

const Tournament =
  mongoose.models.Tournament || mongoose.model("Tournament", TournamentSchema);

export default Tournament;
