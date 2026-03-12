import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 600,
    },
    link: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    readAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

NotificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });

const Notification =
  mongoose.models.Notification || mongoose.model("Notification", NotificationSchema);

export default Notification;
