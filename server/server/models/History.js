import mongoose from "mongoose";

const HistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // PGN Headers
    event: { type: String, default: "NeonGambit Game" },
    site: { type: String, default: "NeonGambit" },
    date: { type: String },
    round: { type: String, default: "-" },
    white: { type: String, required: true },
    black: { type: String, required: true },
    result: { type: String, required: true },
    variant: {
      type: String,
      enum: ["standard", "chess960"],
      default: "standard",
    },

    // Position
    currentPosition: { type: String },
    startingFen: { type: String, default: "" },

    // Time
    timeControl: { type: String },
    utcDate: { type: String },
    utcTime: { type: String },
    startTime: { type: String },
    endDate: { type: String },
    endTime: { type: String },

    // Ratings
    whiteElo: { type: Number, default: 1200 },
    blackElo: { type: Number, default: 1200 },
    rated: { type: Boolean, default: false },
    ratingBefore: { type: Number },
    ratingAfter: { type: Number },
    ratingDelta: { type: Number },
    ratingDeviationBefore: { type: Number },
    ratingDeviationAfter: { type: Number },
    ratingDeviationDelta: { type: Number },
    volatilityBefore: { type: Number },
    volatilityAfter: { type: Number },
    volatilityDelta: { type: Number },
    isProvisional: { type: Boolean, default: false },
    opponentRatingBefore: { type: Number },
    opponentRatingAfter: { type: Number },
    opponentRatingDelta: { type: Number },
    opponentRatingDeviationBefore: { type: Number },
    opponentRatingDeviationAfter: { type: Number },
    opponentRatingDeviationDelta: { type: Number },
    opponentVolatilityBefore: { type: Number },
    opponentVolatilityAfter: { type: Number },
    opponentVolatilityDelta: { type: Number },
    opponentIsProvisional: { type: Boolean, default: false },
    ratingPool: {
      type: String,
      enum: ["bullet", "blitz", "rapid", "classical"],
    },

    // Game info
    timezone: { type: String, default: "UTC" },
    eco: { type: String, default: "" },
    ecoUrl: { type: String, default: "" },
    link: { type: String, default: "" },
    termination: { type: String },
    whiteUrl: { type: String, default: "" },
    whiteCountry: { type: String, default: "" },
    whiteTitle: { type: String, default: "" },
    blackUrl: { type: String, default: "" },
    blackCountry: { type: String, default: "" },
    blackTitle: { type: String, default: "" },

    // Moves
    moves: {
      type: [String],
      default: [],
      validate: {
        validator: (moves) => Array.isArray(moves) && moves.length >= 3,
        message: "Game must contain at least 3 moves to be stored",
      },
    },
    moveText: { type: String, default: "" },
    pgn: { type: String },
    analysis: [
      {
        ply: { type: Number, required: true },
        cp: { type: Number },
        mate: { type: Number },
      },
    ],
    moveTimes: { type: [Number], default: [] },

    // Additional metadata
    playAs: { type: String, enum: ["white", "black"], required: true },
    opponent: { type: String, default: "Stockfish" },
    opponentLevel: { type: Number },
    durationMs: { type: Number },
  },
  { timestamps: true },
);

const History =
  mongoose.models.History || mongoose.model("History", HistorySchema);

export default History;
