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
      required: true,
      maxlength: 2000,
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

const Message = mongoose.models.Message || mongoose.model("Message", MessageSchema);

export default Message;
