import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env from parent's parent directory
dotenv.config({ path: join(__dirname, "..", "..", ".env") });

const MONGODB_URL = process.env.MONGODB_URL;

if (!MONGODB_URL) {
  console.error("MONGODB_URL is not defined in .env");
  process.exit(1);
}

export const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URL);
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  }
};

export default mongoose;
