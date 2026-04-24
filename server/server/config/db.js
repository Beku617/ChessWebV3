import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envCandidates = [
  join(__dirname, "..", "..", "..", ".env"),
  join(__dirname, "..", "..", ".env"),
  join(process.cwd(), ".env"),
];

const envPath = envCandidates.find((candidate) => existsSync(candidate));
dotenv.config(envPath ? { path: envPath } : undefined);

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
