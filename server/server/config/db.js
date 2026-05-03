import mongoose from "mongoose";
import { envCandidates, loadServerEnv } from "./env.js";

loadServerEnv();

const MONGODB_URL = process.env.MONGODB_URL;

if (!MONGODB_URL) {
  console.error(
    `MONGODB_URL is not defined in .env. Checked: ${envCandidates.join(", ")}`,
  );
  process.exit(1);
}

export const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URL);
    console.log(" MongoDB connected");
  } catch (err) {
    console.error(" MongoDB connection error:", err);
    process.exit(1);
  }
};

export default mongoose;
