import { Router } from "express";
import bcrypt from "bcryptjs";
import { Admin, User, History, Puzzle } from "../models/index.js";
import { adminAuthMiddleware } from "../middleware/index.js";

const router = Router();
const IS_PRODUCTION = process.env.NODE_ENV === "production";

function buildAdminCookieOptions(overrides = {}) {
  return {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? "none" : "lax",
    path: "/",
    ...overrides,
  };
}

function serializeAdmin(admin) {
  if (!admin) return null;
  return {
    id: admin._id,
    email: admin.email,
    username: admin.username,
    puzzleElo: admin.puzzleElo,
    createdAt: admin.createdAt,
    updatedAt: admin.updatedAt,
  };
}

// Admin Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const tokenData = {
      adminId: admin._id,
      email: admin.email,
      username: admin.username,
      isAdmin: true,
    };

    res.cookie(
      "adminToken",
      JSON.stringify(tokenData),
      buildAdminCookieOptions({
        maxAge: 24 * 60 * 60 * 1000,
      }),
    );

    res.json({
      success: true,
      message: "Admin login successful",
      admin: serializeAdmin(admin),
    });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Admin Logout
router.post("/logout", (req, res) => {
  res.cookie(
    "adminToken",
    "",
    buildAdminCookieOptions({
      maxAge: 0,
    }),
  );
  res.json({ success: true, message: "Admin logged out successfully" });
});

// Get current admin
router.get("/me", adminAuthMiddleware, async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.adminId).select("-password");
    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }
    res.json({ admin: serializeAdmin(admin) });
  } catch (err) {
    console.error("Get admin error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get stats
router.get("/stats", adminAuthMiddleware, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalGames = await History.countDocuments();

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const newUsersThisWeek = await User.countDocuments({
      createdAt: { $gte: weekAgo },
    });
    const gamesThisWeek = await History.countDocuments({
      createdAt: { $gte: weekAgo },
    });

    res.json({
      totalUsers,
      totalGames,
      newUsersThisWeek,
      gamesThisWeek,
    });
  } catch (err) {
    console.error("Admin get stats error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
