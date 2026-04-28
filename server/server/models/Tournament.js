import mongoose from "mongoose";

const TournamentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    type: {
      type: String,
      enum: ["swiss", "arena"],
      required: true,
    },
    rated: { type: Boolean, default: true },
    gameType: {
      type: String,
      enum: ["standard", "chess960"],
      default: "standard",
    },
    setup: { type: String, default: "standard", maxlength: 80 },
    pairingLogic: { type: String, default: "", maxlength: 120 },
    durationMinutes: { type: Number, min: 1, default: null },
    timezone: { type: String, default: "", maxlength: 120 },
    timeControl: {
      baseMs: { type: Number, required: true, min: 1000 },
      incMs: { type: Number, required: true, min: 0, default: 0 },
      label: { type: String, default: "" },
    },
    ratingMin: { type: Number, default: null },
    ratingMax: { type: Number, default: null },
    ratingFilterMode: {
      type: String,
      enum: ["none", "min", "max", "range"],
      default: "none",
    },
    status: {
      type: String,
      enum: [
        "DRAFT",
        "REGISTRATION_OPEN",
        "LIVE_ROUND",
        "ROUND_CLOSED",
        "CANCELLED",
        "FINISHED",
        "draft",
        "registering",
        "running",
        "cancelled",
        "finished",
      ],
      default: "DRAFT",
    },
    roundsPlanned: { type: Number, min: 1, default: 1 },
    currentRound: { type: Number, min: 0, default: 0 },
    latestPublishedRound: { type: Number, min: 0, default: 0 },
    minPlayers: { type: Number, min: 2, default: 2 },
    maxPlayers: { type: Number, min: 2, default: null },
    registrationDeadline: { type: Date, default: null },
    startType: {
      type: String,
      enum: ["manual", "scheduled"],
      default: "manual",
    },
    scheduledStartAt: { type: Date, default: null },
    description: { type: String, default: "", maxlength: 2000 },
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
    championUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    finalTop3: {
      type: [
        {
          userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
          },
          placement: { type: Number, min: 1, max: 3, required: true },
          score: { type: Number, default: 0 },
          eloBefore: { type: Number, default: 1200 },
          eloAfter: { type: Number, default: 1200 },
          eloDelta: { type: Number, default: 0 },
        },
      ],
      default: [],
    },
    stateVersion: { type: Number, min: 0, default: 0 },
    autoStartGraceEndsAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, default: "", maxlength: 240 },
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
