import mongoose from "mongoose";

const TournamentTemplateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

TournamentTemplateSchema.index({ userId: 1, name: 1 }, { unique: true });

const TournamentTemplate =
  mongoose.models.TournamentTemplate ||
  mongoose.model("TournamentTemplate", TournamentTemplateSchema);

export default TournamentTemplate;
