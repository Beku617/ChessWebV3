import { Router } from "express";
import { User, History } from "../models/index.js";
import { adminAuthMiddleware } from "../middleware/index.js";

const router = Router();

// Get all users
router.get("/", adminAuthMiddleware, async (req, res) => {
  try {
    const { limit = 50, skip = 0, search = "" } = req.query;

    const query = search
      ? {
          $or: [
            { fullName: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const users = await User.find(query)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .lean();

    const total = await User.countDocuments(query);

    res.json({ users, total });
  } catch (err) {
    console.error("Admin get users error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get single user
router.get("/:id", adminAuthMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password").lean();
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ user });
  } catch (err) {
    console.error("Admin get user error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get user's games
router.get("/:id/games", adminAuthMiddleware, async (req, res) => {
  try {
    const { limit = 50, skip = 0 } = req.query;

    const games = await History.find({ userId: req.params.id })
      .sort({ createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .lean();

    const total = await History.countDocuments({ userId: req.params.id });

    res.json({ games, total });
  } catch (err) {
    console.error("Admin get user games error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Delete user
router.delete("/:id", adminAuthMiddleware, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    await History.deleteMany({ userId: req.params.id });
    res.json({ success: true, message: "User deleted" });
  } catch (err) {
    console.error("Admin delete user error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Ban/Unban user
router.patch("/:id/ban", adminAuthMiddleware, async (req, res) => {
  try {
    const { banned, reason } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.banned = banned;
    user.bannedAt = banned ? new Date() : null;
    user.banReason = banned ? reason || "No reason provided" : "";
    await user.save();

    res.json({
      success: true,
      message: banned
        ? "User banned successfully"
        : "User unbanned successfully",
      user: {
        _id: user._id,
        banned: user.banned,
        bannedAt: user.bannedAt,
        banReason: user.banReason,
      },
    });
  } catch (err) {
    console.error("Admin ban user error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
