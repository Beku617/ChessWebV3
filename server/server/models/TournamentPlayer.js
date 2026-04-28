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
    buchholzCut1: { type: Number, default: 0, min: 0 },
    sonnebornBerger: { type: Number, default: 0, min: 0 },
    directEncounter: { type: Number, default: 0, min: 0 },
    koya: { type: Number, default: 0, min: 0 },
    colorBalance: { type: Number, default: 0 },
    seed: { type: Number, default: null, min: 1 },
    gamesPlayed: { type: Number, default: 0, min: 0 },
    hadBye: { type: Boolean, default: false },
    byeCount: { type: Number, default: 0, min: 0 },
    wins: { type: Number, default: 0, min: 0 },
    draws: { type: Number, default: 0, min: 0 },
    losses: { type: Number, default: 0, min: 0 },
    whiteGames: { type: Number, default: 0, min: 0 },
    blackGames: { type: Number, default: 0, min: 0 },
    arenaReady: { type: Boolean, default: false, index: true },
    arenaReadyAt: { type: Date, default: null },
    waitTicks: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["active", "withdrawn"],
      default: "active",
      index: true,
    },
    withdrawnAt: { type: Date, default: null },
    withdrawnReason: { type: String, default: "", maxlength: 300 },
    tournamentEloStart: { type: Number, default: 1200 },
    tournamentEloCurrent: { type: Number, default: 1200 },
    tournamentEloDelta: { type: Number, default: 0 },
    placement: { type: Number, default: null, min: 1 },
    joinedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

TournamentPlayerSchema.index({ tournamentId: 1, userId: 1 }, { unique: true });
TournamentPlayerSchema.index({ tournamentId: 1, score: -1, buchholz: -1, seed: 1 });
TournamentPlayerSchema.index({ tournamentId: 1, arenaReady: 1, waitTicks: -1 });

const TournamentPlayer =
  mongoose.models.TournamentPlayer ||
  mongoose.model("TournamentPlayer", TournamentPlayerSchema);

export default TournamentPlayer;
