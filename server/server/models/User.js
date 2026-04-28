import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    googleId: { type: String, default: "", index: true },
    facebookId: { type: String, default: "", index: true },
    authProvider: {
      type: String,
      enum: ["local", "google", "facebook"],
      default: "local",
    },
    emailVerified: { type: Boolean, default: false },
    emailVerificationCodeHash: { type: String, default: "" },
    emailVerificationCodeExpiresAt: { type: Date, default: null },
    emailVerificationCodeSentAt: { type: Date, default: null },
    avatar: { type: String, default: "" },
    rating: { type: Number, default: 1200 },
    bulletRating: { type: Number, default: 1200 },
    blitzRating: { type: Number, default: 1200 },
    rapidRating: { type: Number, default: 1200 },
    classicalRating: { type: Number, default: 1200 },
    chess960BulletRating: { type: Number, default: 1200 },
    chess960BlitzRating: { type: Number, default: 1200 },
    chess960RapidRating: { type: Number, default: 1200 },
    chess960ClassicalRating: { type: Number, default: 1200 },
    bulletRd: { type: Number, default: 350 },
    blitzRd: { type: Number, default: 350 },
    rapidRd: { type: Number, default: 350 },
    classicalRd: { type: Number, default: 350 },
    chess960BulletRd: { type: Number, default: 350 },
    chess960BlitzRd: { type: Number, default: 350 },
    chess960RapidRd: { type: Number, default: 350 },
    chess960ClassicalRd: { type: Number, default: 350 },
    bulletVolatility: { type: Number, default: 0.06 },
    blitzVolatility: { type: Number, default: 0.06 },
    rapidVolatility: { type: Number, default: 0.06 },
    classicalVolatility: { type: Number, default: 0.06 },
    chess960BulletVolatility: { type: Number, default: 0.06 },
    chess960BlitzVolatility: { type: Number, default: 0.06 },
    chess960RapidVolatility: { type: Number, default: 0.06 },
    chess960ClassicalVolatility: { type: Number, default: 0.06 },
    bulletLastRatedAt: { type: Date, default: null },
    blitzLastRatedAt: { type: Date, default: null },
    rapidLastRatedAt: { type: Date, default: null },
    classicalLastRatedAt: { type: Date, default: null },
    chess960BulletLastRatedAt: { type: Date, default: null },
    chess960BlitzLastRatedAt: { type: Date, default: null },
    chess960RapidLastRatedAt: { type: Date, default: null },
    chess960ClassicalLastRatedAt: { type: Date, default: null },
    bulletGames: { type: Number, default: 0 },
    blitzGames: { type: Number, default: 0 },
    rapidGames: { type: Number, default: 0 },
    classicalGames: { type: Number, default: 0 },
    chess960BulletGames: { type: Number, default: 0 },
    chess960BlitzGames: { type: Number, default: 0 },
    chess960RapidGames: { type: Number, default: 0 },
    chess960ClassicalGames: { type: Number, default: 0 },
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
    accountStatus: {
      type: String,
      enum: ["offline", "active", "playing"],
      default: "offline",
    },
    lastSeenAt: { type: Date, default: null },
    lastActiveAt: { type: Date, default: null },
    pendingDeletion: { type: Boolean, default: false, index: true },
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
    communityJoinedGroupIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "CommunityGroup",
      default: [],
      index: true,
    },
    blockedUsers: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    ],
  },
  { timestamps: true },
);

UserSchema.index({ bulletRating: -1 });
UserSchema.index({ blitzRating: -1 });
UserSchema.index({ rapidRating: -1 });
UserSchema.index({ classicalRating: -1 });
UserSchema.index({ chess960BulletRating: -1 });
UserSchema.index({ chess960BlitzRating: -1 });
UserSchema.index({ chess960RapidRating: -1 });
UserSchema.index({ chess960ClassicalRating: -1 });
UserSchema.index({ communityPostingRestrictedForever: 1 });
UserSchema.index({ communityPostingRestrictedUntil: 1 });
UserSchema.index({ blockedUsers: 1 });

const User = mongoose.models.User || mongoose.model("User", UserSchema);

export default User;
