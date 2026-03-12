import mongoose from "mongoose";

const TournamentPlayerSchema = new mongoose.Schema(
  {
    tournamentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    score: { type: Number, default: 0, min: 0 },
    buchholz: { type: Number, default: 0, min: 0 },
    seed: { type: Number, default: null, min: 1 },
    gamesPlayed: { type: Number, default: 0, min: 0 },
    hadBye: { type: Boolean, default: false },
    joinedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

TournamentPlayerSchema.index({ tournamentId: 1, userId: 1 }, { unique: true });
TournamentPlayerSchema.index({ tournamentId: 1, score: -1, buchholz: -1, seed: 1 });

const TournamentPlayer =
  mongoose.models.TournamentPlayer ||
  mongoose.model("TournamentPlayer", TournamentPlayerSchema);

export default TournamentPlayer;
