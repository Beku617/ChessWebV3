import mongoose from "mongoose";

const featuredEventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: ["tournament", "match", "broadcast", "event"],
      default: "event",
    },
    // For embedded games/broadcasts
    lichessUrl: {
      type: String,
      trim: true,
    },
    // Custom image for the event
    imageUrl: {
      type: String,
      trim: true,
    },
    // Players involved (for matches)
    players: [
      {
        name: String,
        rating: Number,
        title: String, // GM, IM, FM, etc.
        country: String,
      },
    ],
    // Event timing
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    // Status
    status: {
      type: String,
      enum: ["upcoming", "live", "completed"],
      default: "upcoming",
    },
    // Display settings
    featured: {
      type: Boolean,
      default: false,
    },
    priority: {
      type: Number,
      default: 0, // Higher = shows first
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Stats
    viewers: {
      type: Number,
      default: 0,
    },
    // Metadata
    tags: [String],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  {
    timestamps: true,
  },
);

// Index for efficient queries
featuredEventSchema.index({ status: 1, isActive: 1, priority: -1 });
featuredEventSchema.index({ featured: 1, isActive: 1 });

export default mongoose.model("FeaturedEvent", featuredEventSchema);
