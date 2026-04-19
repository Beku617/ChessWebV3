import mongoose from "mongoose";

const TournamentTransitionLogSchema = new mongoose.Schema(
  {
    tournamentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
      index: true,
    },
    fromState: { type: String, required: true },
    toState: { type: String, required: true },
    action: { type: String, required: true, trim: true },
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

TournamentTransitionLogSchema.index({ tournamentId: 1, createdAt: -1 });

const TournamentTransitionLog =
  mongoose.models.TournamentTransitionLog ||
  mongoose.model("TournamentTransitionLog", TournamentTransitionLogSchema);

export default TournamentTransitionLog;
