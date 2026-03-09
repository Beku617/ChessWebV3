import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    avatar: { type: String, default: "" },
    rating: { type: Number, default: 1200 },
    bulletRating: { type: Number, default: 1200 },
    blitzRating: { type: Number, default: 1200 },
    rapidRating: { type: Number, default: 1200 },
    classicalRating: { type: Number, default: 1200 },
    bulletRd: { type: Number, default: 350 },
    blitzRd: { type: Number, default: 350 },
    rapidRd: { type: Number, default: 350 },
    classicalRd: { type: Number, default: 350 },
    bulletVolatility: { type: Number, default: 0.06 },
    blitzVolatility: { type: Number, default: 0.06 },
    rapidVolatility: { type: Number, default: 0.06 },
    classicalVolatility: { type: Number, default: 0.06 },
    bulletLastRatedAt: { type: Date, default: null },
    blitzLastRatedAt: { type: Date, default: null },
    rapidLastRatedAt: { type: Date, default: null },
    classicalLastRatedAt: { type: Date, default: null },
    bulletGames: { type: Number, default: 0 },
    blitzGames: { type: Number, default: 0 },
    rapidGames: { type: Number, default: 0 },
    classicalGames: { type: Number, default: 0 },
    gamesPlayed: { type: Number, default: 0 },
    gamesWon: { type: Number, default: 0 },
    puzzleElo: { type: Number, default: 1200 },
    puzzleBestElo: { type: Number, default: 1200 },
    puzzleAttempts: { type: Number, default: 0 },
    puzzleSolved: { type: Number, default: 0 },
    puzzleFailed: { type: Number, default: 0 },
    puzzleSkipped: { type: Number, default: 0 },
    puzzleLastAttemptAt: { type: Date, default: null },
    presenceStatus: {
      type: String,
      enum: ["online", "offline", "searching_match", "in_game", "away"],
      default: "offline",
    },
    lastSeenAt: { type: Date, default: null },
    lastActiveAt: { type: Date, default: null },
    banned: { type: Boolean, default: false },
    bannedAt: { type: Date, default: null },
    banReason: { type: String, default: "" },
    communityPostingRestrictedForever: { type: Boolean, default: false },
    communityPostingRestrictedUntil: { type: Date, default: null },
    communityPostingRestrictionReason: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300,
    },
    communityPostingRestrictionUpdatedAt: { type: Date, default: null },
    communityPostingRestrictionUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    communityPostingRateLimitBypass: {
      type: Boolean,
      default: false,
    },
    communitySubmissionTimestamps: {
      type: [Date],
      default: [],
    },
    communityLastSubmissionReservationToken: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true },
);

UserSchema.index({ bulletRating: -1 });
UserSchema.index({ blitzRating: -1 });
UserSchema.index({ rapidRating: -1 });
UserSchema.index({ classicalRating: -1 });
UserSchema.index({ communityPostingRestrictedForever: 1 });
UserSchema.index({ communityPostingRestrictedUntil: 1 });

const User = mongoose.models.User || mongoose.model("User", UserSchema);

export default User;
