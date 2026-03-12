import mongoose from "mongoose";

const TournamentGameSchema = new mongoose.Schema(
  {
    tournamentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
      index: true,
    },
    roundNumber: { type: Number, required: true, min: 1 },
    matchIndex: { type: Number, default: 0, min: 0 },
    whiteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    blackId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    result: {
      type: String,
      enum: ["1-0", "0-1", "1/2-1/2", "*"],
      default: "*",
      index: true,
    },
    gameId: { type: String, required: true, index: true },
    winnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    liveStatus: {
      type: String,
      enum: ["pending", "started", "completed"],
      default: "pending",
      index: true,
    },
    startedAt: { type: Date, default: null },
    isBye: { type: Boolean, default: false },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

TournamentGameSchema.index({ tournamentId: 1, roundNumber: 1, matchIndex: 1 });
TournamentGameSchema.index({ tournamentId: 1, gameId: 1 }, { unique: true });

const TournamentGame =
  mongoose.models.TournamentGame ||
  mongoose.model("TournamentGame", TournamentGameSchema);

export default TournamentGame;
