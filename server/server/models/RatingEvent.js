import mongoose from "mongoose";

const RatingEventSchema = new mongoose.Schema(
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
      required: true,
    },
    pool: {
      type: String,
      enum: ["bullet", "blitz", "rapid", "classical"],
      required: true,
      index: true,
    },
    gameId: { type: String, required: true, index: true },
    ts: { type: Date, required: true, default: Date.now, index: true },
    result: {
      type: String,
      enum: ["W", "L", "D"],
      required: true,
    },
    reason: {
      type: String,
      enum: ["checkmate", "draw", "resign", "timeout", "opponent_left"],
      required: true,
    },
    ratingBefore: { type: Number, required: true },
    ratingAfter: { type: Number, required: true },
    delta: { type: Number, required: true },
    rdBefore: { type: Number, required: true },
    rdAfter: { type: Number, required: true },
    volBefore: { type: Number, required: true },
    volAfter: { type: Number, required: true },
    opponentRating: { type: Number, required: true },
    opponentRd: { type: Number, required: true },
    isProvisional: { type: Boolean, default: false },
    poolGamesBefore: { type: Number, default: 0 },
    poolGamesAfter: { type: Number, default: 0 },
  },
  { timestamps: true },
);

RatingEventSchema.index({ userId: 1, pool: 1, ts: 1 });
RatingEventSchema.index({ pool: 1, ts: -1 });

const RatingEvent =
  mongoose.models.RatingEvent ||
  mongoose.model("RatingEvent", RatingEventSchema);

export default RatingEvent;
