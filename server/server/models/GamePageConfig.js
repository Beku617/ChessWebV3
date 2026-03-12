import mongoose from "mongoose";

const GamePageConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    timeOptions: [
      {
        label: { type: String, required: true },
        initial: { type: Number, required: true },
        increment: { type: Number, required: true },
      },
    ],
    quickActions: [
      {
        id: { type: String, required: true },
        title: { type: String, required: true },
        description: { type: String, required: true },
        icon: { type: String, required: true },
        accent: { type: String, required: true },
        route: { type: String, default: "" },
        action: { type: String, default: "" },
        disabled: { type: Boolean, default: false },
      },
    ],
  },
  { timestamps: true },
);

const GamePageConfig =
  mongoose.models.GamePageConfig ||
  mongoose.model("GamePageConfig", GamePageConfigSchema);

export default GamePageConfig;
