import mongoose from "mongoose";

const PlayerConnectionSchema = new mongoose.Schema(
  {
    userId: { type: String, default: "" },
    name: { type: String, default: "Player" },
    connected: { type: Boolean, default: false },
    disconnectedAt: { type: Date, default: null },
    socketId: { type: String, default: "" },
  },
  { _id: false },
);

const ActiveGameSessionSchema = new mongoose.Schema(
  {
    gameId: { type: String, required: true, unique: true, index: true },
    kind: {
      type: String,
      enum: ["classic", "fourPlayer"],
      required: true,
      index: true,
    },
    mode: {
      type: String,
      enum: ["quick", "friend", "tournament", "fourPlayer"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: [
        "active",
        "temporarily_disconnected",
        "completed",
        "aborted",
        "resigned",
      ],
      default: "active",
      index: true,
    },
    participantUserIds: { type: [String], default: [], index: true },
    variant: { type: String, default: "standard" },
    timeControl: {
      initial: { type: Number, default: 300 },
      increment: { type: Number, default: 0 },
    },
    rated: { type: Boolean, default: false },

    white: { type: PlayerConnectionSchema, default: () => ({}) },
    black: { type: PlayerConnectionSchema, default: () => ({}) },
    playersByColor: { type: mongoose.Schema.Types.Mixed, default: undefined },

    fen: { type: String, default: "start" },
    moves: { type: [String], default: [] },
    moveCount: { type: Number, default: 0 },
    turn: { type: String, default: "w" },
    state: { type: mongoose.Schema.Types.Mixed, default: undefined },
    chess960: { type: mongoose.Schema.Types.Mixed, default: undefined },
    whiteCheckCount: { type: Number, default: 0 },
    blackCheckCount: { type: Number, default: 0 },
    clockState: { type: mongoose.Schema.Types.Mixed, default: undefined },
    ratingByColor: { type: mongoose.Schema.Types.Mixed, default: undefined },

    disconnectedColor: { type: String, default: "" },
    disconnectedAt: { type: Date, default: null },
    reconnectDeadlineAt: { type: Date, default: null },
    reconnectGraceMs: { type: Number, default: 0 },

    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    terminalReason: { type: String, default: "" },
    winner: { type: String, default: "" },
  },
  { timestamps: true },
);

ActiveGameSessionSchema.index({ participantUserIds: 1, status: 1, updatedAt: -1 });

const ActiveGameSession =
  mongoose.models.ActiveGameSession ||
  mongoose.model("ActiveGameSession", ActiveGameSessionSchema);

export default ActiveGameSession;
