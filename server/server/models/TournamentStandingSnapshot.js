import mongoose from "mongoose";

const StandingRowSchema = new mongoose.Schema(
  {
    rank: { type: Number, required: true, min: 1 },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    score: { type: Number, default: 0 },
    buchholz: { type: Number, default: 0 },
    buchholzCut1: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    draws: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    directEncounter: { type: Number, default: 0 },
    sonnebornBerger: { type: Number, default: 0 },
    koya: { type: Number, default: 0 },
    colorBalance: { type: Number, default: 0 },
    status: { type: String, enum: ["active", "withdrawn"], default: "active" },
  },
  { _id: false },
);

const TournamentStandingSnapshotSchema = new mongoose.Schema(
  {
    tournamentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
      index: true,
    },
    roundNumber: { type: Number, required: true, min: 1 },
    isOfficial: { type: Boolean, default: true, index: true },
    rows: { type: [StandingRowSchema], default: [] },
    label: { type: String, default: "" },
  },
  { timestamps: true },
);

TournamentStandingSnapshotSchema.index(
  { tournamentId: 1, roundNumber: 1, isOfficial: 1 },
  { unique: true },
);

const TournamentStandingSnapshot =
  mongoose.models.TournamentStandingSnapshot ||
  mongoose.model("TournamentStandingSnapshot", TournamentStandingSnapshotSchema);

export default TournamentStandingSnapshot;
