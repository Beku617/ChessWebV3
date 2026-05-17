import { Router } from "express";
import { History, History960, User } from "../models/index.js";
import { adminAuthMiddleware } from "../middleware/index.js";
import {
  countGameHistories,
  getGameHistoryStatsByUserIds,
} from "../utils/gameHistoryStats.js";
import {
  deleteUserAccountById,
  isUserCurrentlyPlaying,
  markUserPendingDeletion,
} from "../services/userDeletion.js";

const router = Router();
const ALLOWED_SORT_FIELDS = new Set(["createdAt", "rating", "gamesPlayed"]);

function buildUserQuery(search) {
  const normalizedSearch = String(search || "").trim();
  if (!normalizedSearch) return {};

  return {
    $or: [
      { fullName: { $regex: normalizedSearch, $options: "i" } },
      { email: { $regex: normalizedSearch, $options: "i" } },
    ],
  };
}

function buildUserSort(sortBy, sortOrder) {
  const safeSortBy = ALLOWED_SORT_FIELDS.has(String(sortBy))
    ? String(sortBy)
    : "createdAt";
  const direction = String(sortOrder || "desc").toLowerCase() === "asc" ? 1 : -1;
  return { [safeSortBy]: direction, _id: -1 };
}

function withHistoryStats(users, statsByUserId) {
  return users.map((user) => {
    const stats = statsByUserId.get(String(user._id));
    if (!stats) return user;

    return {
      ...user,
      gamesPlayed: Math.max(
        Number(user.gamesPlayed || 0),
        Number(stats.gamesPlayed || 0),
      ),
      gamesWon: Math.max(
        Number(user.gamesWon || 0),
        Number(stats.gamesWon || 0),
      ),
      gamesLost: Math.max(
        Number(user.gamesLost || 0),
        Number(stats.gamesLost || 0),
      ),
      gamesDraw: Math.max(
        Number(user.gamesDraw || 0),
        Number(stats.gamesDraw || 0),
      ),
    };
  });
}

async function countGamesForUserQuery(query, hasSearch) {
  if (!hasSearch) {
    return countGameHistories();
  }

  const matchingUsers = await User.find(query).select("_id").lean();
  const userIds = matchingUsers.map((user) => user._id);
  if (userIds.length === 0) return 0;

  return countGameHistories({ userId: { $in: userIds } });
}

async function buildUserStats(query, hasSearch, totalUsers) {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [newUsersThisWeek, bannedUsers, topUser, totalGames] =
    await Promise.all([
      User.countDocuments({ ...query, createdAt: { $gte: weekAgo } }),
      User.countDocuments({ ...query, banned: true }),
      User.findOne(query).select("rating").sort({ rating: -1 }).lean(),
      countGamesForUserQuery(query, hasSearch),
    ]);

  return {
    totalUsers,
    totalGames,
    newUsersThisWeek,
    bannedUsers,
    topRating: Number(topUser?.rating || 0),
  };
}

// Get all users
router.get("/", adminAuthMiddleware, async (req, res) => {
  try {
    const {
      limit = 50,
      skip = 0,
      search = "",
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = buildUserQuery(search);
    const sort = buildUserSort(sortBy, sortOrder);

    const [users, total] = await Promise.all([
      User.find(query)
        .select("-password")
        .sort(sort)
        .skip(Number(skip))
        .limit(Number(limit))
        .lean(),
      User.countDocuments(query),
    ]);

    const [historyStatsByUserId, stats] = await Promise.all([
      getGameHistoryStatsByUserIds(users.map((user) => user._id)),
      buildUserStats(query, Boolean(String(search || "").trim()), total),
    ]);

    res.json({
      users: withHistoryStats(users, historyStatsByUserId),
      total,
      stats,
    });
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

    const statsByUserId = await getGameHistoryStatsByUserIds([user._id]);
    res.json({ user: withHistoryStats([user], statsByUserId)[0] });
  } catch (err) {
    console.error("Admin get user error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get user's games
router.get("/:id/games", adminAuthMiddleware, async (req, res) => {
  try {
    const { limit = 50, skip = 0 } = req.query;
    const userQuery = { userId: req.params.id };

    const [standardGames, chess960Games, standardTotal, chess960Total] =
      await Promise.all([
        History.find(userQuery).sort({ createdAt: -1 }).lean(),
        History960.find(userQuery).sort({ createdAt: -1 }).lean(),
        History.countDocuments(userQuery),
        History960.countDocuments(userQuery),
      ]);

    const offset = Number(skip);
    const pageSize = Number(limit);
    const games = [...standardGames, ...chess960Games]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(offset, offset + pageSize);

    res.json({ games, total: standardTotal + chess960Total });
  } catch (err) {
    console.error("Admin get user games error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Delete user
router.delete("/:id", adminAuthMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const playing = await isUserCurrentlyPlaying(user._id);
    if (playing) {
      const queuedUser = await markUserPendingDeletion(user, {
        reason: "Account scheduled for deletion after active game.",
      });
      return res.json({
        success: true,
        pendingDeletion: true,
        deleted: false,
        message:
          "User is in an active game and was scheduled for deletion after the match ends.",
        user: queuedUser
          ? {
              _id: queuedUser._id,
              banned: queuedUser.banned,
              bannedAt: queuedUser.bannedAt,
              banReason: queuedUser.banReason,
              pendingDeletion: queuedUser.pendingDeletion,
            }
          : null,
      });
    }

    await deleteUserAccountById(user._id);
    res.json({
      success: true,
      deleted: true,
      pendingDeletion: false,
      message: "User deleted",
    });
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

    if (banned) {
      const playing = await isUserCurrentlyPlaying(user._id);
      if (playing) {
        const queuedUser = await markUserPendingDeletion(user, {
          reason: reason || "Scheduled for deletion after active game.",
        });
        return res.json({
          success: true,
          deleted: false,
          pendingDeletion: true,
          message:
            "User is in an active game and will be deleted automatically when the game ends.",
          user: queuedUser
            ? {
                _id: queuedUser._id,
                banned: queuedUser.banned,
                bannedAt: queuedUser.bannedAt,
                banReason: queuedUser.banReason,
                pendingDeletion: queuedUser.pendingDeletion,
              }
            : null,
        });
      }

      await deleteUserAccountById(user._id);
      return res.json({
        success: true,
        deleted: true,
        pendingDeletion: false,
        message: "User deleted",
      });
    }

    user.banned = false;
    user.bannedAt = null;
    user.banReason = "";
    user.pendingDeletion = false;
    await user.save();

    res.json({
      success: true,
      deleted: false,
      pendingDeletion: false,
      message: "User unbanned successfully",
      user: {
        _id: user._id,
        banned: user.banned,
        bannedAt: user.bannedAt,
        banReason: user.banReason,
        pendingDeletion: user.pendingDeletion,
      },
    });
  } catch (err) {
    console.error("Admin ban user error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
