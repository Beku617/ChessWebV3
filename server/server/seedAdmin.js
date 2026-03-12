import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env from parent directory
dotenv.config({ path: join(__dirname, "..", ".env") });

const MONGODB_URL = process.env.MONGODB_URL;

if (!MONGODB_URL) {
  console.error("MONGODB_URL is not defined in .env");
  process.exit(1);
}

// Admin Schema
const AdminSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
  },
  { timestamps: true },
);

const Admin = mongoose.model("Admin", AdminSchema);

async function seedAdmin() {
  try {
    await mongoose.connect(MONGODB_URL);
    console.log("✅ MongoDB connected");

    // Default admin credentials - CHANGE THESE!
    const adminData = {
      username: "admin",
      email: "admin@neongambit.com",
      password: "admin123", // Change this password!
    };

    // Delete existing admin if exists
    await Admin.deleteOne({ email: adminData.email });
    console.log("🗑️ Removed existing admin (if any)");

    // Hash password
    const hashedPassword = await bcrypt.hash(adminData.password, 10);

    // Create admin
    const admin = await Admin.create({
      username: adminData.username,
      email: adminData.email,
      password: hashedPassword,
    });

    console.log("✅ Admin created successfully!");
    console.log("📧 Email:", admin.email);
    console.log("👤 Username:", admin.username);
    console.log("🔑 Password: admin123");
    console.log("");
    console.log("Login at: http://localhost:5173/admin/login");

    process.exit(0);
  } catch (err) {
    console.error("❌ Error creating admin:", err);
    process.exit(1);
  }
}

seedAdmin();
