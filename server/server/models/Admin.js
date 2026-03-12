import mongoose from "mongoose";

const AdminSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    puzzleElo: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const Admin = mongoose.models.Admin || mongoose.model("Admin", AdminSchema);

export default Admin;
