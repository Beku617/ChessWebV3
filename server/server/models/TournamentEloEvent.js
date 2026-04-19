import mongoose from "mongoose";

const TournamentEloEventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    opponentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    tournamentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
      index: true,
    },
    gameId: { type: String, required: true, index: true },
    result: {
      type: String,
      enum: ["W", "L", "D"],
      required: true,
    },
    reason: {
      type: String,
      enum: ["result", "forfeit", "bye", "withdrawal"],
      default: "result",
    },
    eloBefore: { type: Number, required: true },
    eloAfter: { type: Number, required: true },
    delta: { type: Number, required: true },
    kFactor: { type: Number, required: true },
    at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

TournamentEloEventSchema.index({ userId: 1, at: 1 });
TournamentEloEventSchema.index({ tournamentId: 1, at: 1 });

const TournamentEloEvent =
  mongoose.models.TournamentEloEvent ||
  mongoose.model("TournamentEloEvent", TournamentEloEventSchema);

export default TournamentEloEvent;
