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
const MONGODB_SERVER_SELECTION_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 5000),
);

mongoose.set("bufferCommands", false);
mongoose.set("bufferTimeoutMS", 3000);

if (!MONGODB_URL) {
  console.error(
    `MONGODB_URL is not defined in .env. Checked: ${envCandidates.join(", ")}`,
  );
  process.exit(1);
}

export const connectDB = async ({ exitOnFailure = true } = {}) => {
  try {
    await mongoose.connect(MONGODB_URL, {
      serverSelectionTimeoutMS: MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    });
    console.log(" MongoDB connected");
    return mongoose.connection;
  } catch (err) {
    console.error(" MongoDB connection error:", err);
    if (exitOnFailure) {
      process.exit(1);
    }
    return null;
  }
};

export default mongoose;
