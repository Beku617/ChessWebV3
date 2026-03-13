import mongoose from "mongoose";

const MessageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    content: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000,
    },
    attachments: [
      {
        assetId: {
          type: String,
          default: "",
          trim: true,
        },
        type: {
          type: String,
          enum: ["image", "video"],
          default: "image",
        },
        url: { type: String, required: true },
        filename: { type: String, required: true },
        originalName: { type: String, default: "", trim: true },
        mimeType: { type: String, required: true },
        size: { type: Number, required: true },
        width: { type: Number, default: null },
        height: { type: Number, default: null },
        duration: { type: Number, default: null },
        thumbnail: { type: String, default: null },
      },
    ],
    sharedGame: {
      gameId: { type: String, default: null },
      white: { type: String, default: "" },
      black: { type: String, default: "" },
      result: { type: String, default: "" },
      whiteElo: { type: Number, default: null },
      blackElo: { type: Number, default: null },
      timeControl: { type: String, default: "" },
      eco: { type: String, default: "" },
      playedAt: { type: String, default: "" },
      rated: { type: Boolean, default: false },
      moves: { type: Number, default: 0 },
      variant: { type: String, default: "standard" },
      termination: { type: String, default: "" },
    },
    read: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["delivered", "request_pending", "request_accepted", "request_declined"],
      default: "delivered",
      index: true,
    },
  },
  { timestamps: true },
);

MessageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });
MessageSchema.index({ receiver: 1, read: 1 });
MessageSchema.index({ receiver: 1, status: 1, createdAt: -1 });
MessageSchema.index({ sender: 1, receiver: 1, createdAt: -1, "attachments.url": 1 });
MessageSchema.index({ "attachments.assetId": 1 });

const Message = mongoose.models.Message || mongoose.model("Message", MessageSchema);

export default Message;
