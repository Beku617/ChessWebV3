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
        type: {
          type: String,
          enum: ["image", "video"],
          default: "image",
        },
        url: { type: String, required: true },
        filename: { type: String, required: true },
        mimeType: { type: String, required: true },
        size: { type: Number, required: true },
        width: { type: Number, default: null },
        height: { type: Number, default: null },
        duration: { type: Number, default: null },
        thumbnail: { type: String, default: null },
      },
    ],
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

const Message = mongoose.models.Message || mongoose.model("Message", MessageSchema);

export default Message;
