import mongoose from "mongoose";

const BotSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      minlength: 2,
      maxlength: 50,
      trim: true,
    },
    avatar: {
      type: String,
      default: "🤖",
    },
    avatarUrl: {
      type: String,
      default: "",
    },
    eloRating: {
      type: Number,
      required: true,
      min: 100,
      max: 3000,
      default: 1200,
    },
    difficulty: {
      type: String,
      required: true,
      enum: ["beginner", "casual", "intermediate", "advanced", "master"],
      default: "beginner",
    },
    category: {
      type: String,
      default: "general",
      trim: true,
    },
    title: {
      type: String,
      default: "",
      trim: true,
    },
    quote: {
      type: String,
      maxlength: 200,
      default: "",
    },
    description: {
      type: String,
      maxlength: 500,
      default: "",
    },
    personality: {
      type: String,
      maxlength: 200,
      default: "",
    },
    countryCode: {
      type: String,
      default: "",
      maxlength: 5,
    },
    playStyle: {
      type: String,
      enum: ["aggressive", "defensive", "balanced", "random"],
      default: "balanced",
    },
    skillLevel: {
      type: Number,
      min: 0,
      max: 20,
      default: 5,
    },
    depth: {
      type: Number,
      min: 1,
      max: 25,
      default: 10,
    },
    thinkTimeMs: {
      type: Number,
      min: 100,
      max: 10000,
      default: 2000,
    },
    blunderChance: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.1,
    },
    aggressiveness: {
      type: Number,
      min: -100,
      max: 100,
      default: 0,
    },
    openingBook: {
      type: Boolean,
      default: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

// Index for faster queries
BotSchema.index({ difficulty: 1, isActive: 1 });
BotSchema.index({ category: 1 });
BotSchema.index({ name: "text" });

const Bot = mongoose.models.Bot || mongoose.model("Bot", BotSchema);

export default Bot;
