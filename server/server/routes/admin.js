import { Router } from "express";
import bcrypt from "bcryptjs";
import { Admin, User } from "../models/index.js";
import { adminAuthMiddleware } from "../middleware/index.js";
import {
  ADMIN_MAX_AGE_1_DAY_MS,
  buildAdminCookieOptions,
  clearAdminCookie,
} from "../utils/cookies.js";
import { countGameHistories } from "../utils/gameHistoryStats.js";

const router = Router();

function serializeAdmin(admin) {
  if (!admin) return null;
  return {
    id: admin._id,
    email: admin.email,
    username: admin.username,
    avatar: admin.avatar || "",
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
        maxAge: ADMIN_MAX_AGE_1_DAY_MS,
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
  clearAdminCookie(res);
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

// Update current admin profile
router.put("/profile", adminAuthMiddleware, async (req, res) => {
  try {
    const { username, avatar } = req.body || {};
    const update = {};

    if (typeof username === "string") {
      const cleanUsername = username.trim().slice(0, 80);
      if (!cleanUsername) {
        return res.status(400).json({ error: "Username cannot be empty" });
      }

      const existing = await Admin.findOne({
        username: cleanUsername,
        _id: { $ne: req.admin.adminId },
      }).lean();
      if (existing) {
        return res.status(400).json({ error: "Username already in use" });
      }
      update.username = cleanUsername;
    }

    if (typeof avatar === "string") {
      update.avatar = avatar.trim();
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: "No valid profile fields provided" });
    }

    const admin = await Admin.findByIdAndUpdate(
      req.admin.adminId,
      { $set: update },
      { new: true },
    ).select("-password");

    return res.json({ success: true, admin: serializeAdmin(admin) });
  } catch (err) {
    console.error("Admin update profile error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/change-password", adminAuthMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};

    if (
      !currentPassword ||
      typeof currentPassword !== "string" ||
      !newPassword ||
      typeof newPassword !== "string"
    ) {
      return res.status(400).json({
        error: "Current password and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        error: "New password must be at least 6 characters",
      });
    }

    const admin = await Admin.findById(req.admin.adminId);
    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, admin.password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    admin.password = await bcrypt.hash(newPassword, 10);
    await admin.save();

    return res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (err) {
    console.error("Admin change password error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Get stats
router.get("/stats", adminAuthMiddleware, async (req, res) => {
  try {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [totalUsers, totalGames, newUsersThisWeek, gamesThisWeek] =
      await Promise.all([
        User.countDocuments(),
        countGameHistories(),
        User.countDocuments({ createdAt: { $gte: weekAgo } }),
        countGameHistories({ createdAt: { $gte: weekAgo } }),
      ]);

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
