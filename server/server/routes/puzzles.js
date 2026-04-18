import { Router } from "express";
import {
  DailyPuzzleState,
  Puzzle,
  PuzzleAttempt,
  User,
  UserPuzzleMotifStats,
  UserPuzzleState,
  UserPuzzleStats,
} from "../models/index.js";
import { authMiddleware, optionalAuthMiddleware } from "../middleware/index.js";

const router = Router();

const ATTEMPT_RESULTS = new Set(["SOLVED", "FAILED", "SKIPPED", "ABANDONED"]);
const MODE_VALUES = new Set(["rated", "review", "random", "daily", "library"]);
const DEFAULT_USER_PUZZLE_RATING = 1200;
const DEFAULT_PUZZLE_RATING = 1200;
const USER_PROVISIONAL_K = 40;
const USER_STABLE_K = 20;
const PUZZLE_PROVISIONAL_K = 20;
const PUZZLE_STABLE_K = 10;
const PROVISIONAL_WINDOW = 20;
const MIN_RATING = 100;
const SOLVE_ELO_BASE = 20;
const SOLVE_ELO_MIN = 5;

function normalizeResult(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  return ATTEMPT_RESULTS.has(normalized) ? normalized : null;
}

function normalizeMode(value, fallback = "rated") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return MODE_VALUES.has(normalized) ? normalized : fallback;
}

function normalizeMovesPlayed(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .slice(0, 300);
}

function normalizeTimeMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed);
}

function normalizeHintsUsed(value, usedHintFallback = false) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return Math.max(0, Math.min(2, Math.round(parsed)));
  }
  return usedHintFallback ? 1 : 0;
}

function normalizeDateKey(value, fallback = toLocalDateKey()) {
  const str = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  return fallback;
}

function toLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toUtcDateMs(dateKey) {
  const [year, month, day] = String(dateKey || "")
    .split("-")
    .map((value) => Number(value));
  if (!year || !month || !day) return Date.now();
  return Date.UTC(year, month - 1, day);
}

function dayDiff(fromDateKey, toDateKey) {
  const diffMs = toUtcDateMs(toDateKey) - toUtcDateMs(fromDateKey);
  return Math.round(diffMs / 86400000);
}

function monthKey(dateKey) {
  return String(dateKey || "").slice(0, 7);
}

function expectedUserScore(userRating, puzzleRating) {
  return 1 / (1 + 10 ** ((puzzleRating - userRating) / 400));
}

function resolveUserK(userAttempts) {
  return userAttempts < PROVISIONAL_WINDOW ? USER_PROVISIONAL_K : USER_STABLE_K;
}

function resolvePuzzleK(puzzleAttempts) {
  return puzzleAttempts < PROVISIONAL_WINDOW
    ? PUZZLE_PROVISIONAL_K
    : PUZZLE_STABLE_K;
}

function applyEloDelta(currentRating, k, score, expectedScore) {
  return Math.max(
    MIN_RATING,
    Math.round(currentRating + k * (score - expectedScore)),
  );
}

function resolveTimeScaledSolveEloGain(timeMs) {
  const secondsTaken = Math.floor(Math.max(0, Number(timeMs || 0)) / 1000);
  const timeBonus = Math.max(0, SOLVE_ELO_BASE - Math.floor(secondsTaken / 10));
  return Math.max(SOLVE_ELO_MIN, timeBonus);
}

function repeatDecayMultiplier(solveCountBefore) {
  if (solveCountBefore <= 0) return 1;
  if (solveCountBefore === 1) return 0.5;
  if (solveCountBefore === 2) return 0.25;
  return 0.1;
}

function hintXpMultiplier({ hintsUsed, solutionShown }) {
  if (solutionShown) return 0;
  if (hintsUsed >= 2) return 0.5;
  if (hintsUsed === 1) return 0.8;
  return 1;
}

function resolveXpAward({ result, solveCountBefore, hintsUsed, solutionShown }) {
  if (result !== "SOLVED") return 0;

  const repeatMultiplier = repeatDecayMultiplier(solveCountBefore);
  const hintMultiplierValue = hintXpMultiplier({ hintsUsed, solutionShown });
  const baseXp = 100;

  if (solutionShown) return 0;

  let xp = Math.round(baseXp * repeatMultiplier * hintMultiplierValue);

  if (solveCountBefore >= 3) {
    xp = Math.max(10, xp);
  }

  return xp;
}

function addHours(date, hours) {
  const output = new Date(date);
  output.setHours(output.getHours() + hours);
  return output;
}

function addMinutes(date, minutes) {
  const output = new Date(date);
  output.setMinutes(output.getMinutes() + minutes);
  return output;
}

function addDays(date, days) {
  const output = new Date(date);
  output.setDate(output.getDate() + days);
  return output;
}

function shouldCountTowardStreak(mode, result) {
  if (result !== "SOLVED") return false;
  return mode === "rated" || mode === "daily" || mode === "review";
}

function safeArray(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function normalizedPuzzleMotifs(puzzle) {
  const merged = [
    ...safeArray(puzzle?.motifs),
    ...safeArray(puzzle?.themes),
  ];
  const seen = new Set();
  const output = [];
  for (const item of merged) {
    const normalized = item.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(item);
  }
  return output;
}

function normalizeFenKey(fen) {
  const parts = String(fen || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length < 2) return String(fen || "").trim().toLowerCase();
  return `${parts[0]} ${parts[1]}`.toLowerCase();
}

function stableHash(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash >>> 0;
}

function ratingMatchCloseness(puzzleRating, userRating) {
  const diff = Math.abs(
    Number(puzzleRating || DEFAULT_PUZZLE_RATING) -
      Number(userRating || DEFAULT_USER_PUZZLE_RATING),
  );
  return 1 - Math.min(diff / 400, 1);
}

function daysSinceLastSeen(lastSeenAt) {
  if (!lastSeenAt) return 30;
  const diff = Date.now() - new Date(lastSeenAt).getTime();
  if (!Number.isFinite(diff) || diff <= 0) return 0;
  return Math.floor(diff / 86400000);
}

function noveltyScore({ puzzle, state, userRating }) {
  const daysSinceSeen = daysSinceLastSeen(state?.lastSeenAt);
  const daysNormalized = Math.min(daysSinceSeen / 30, 1);
  const neverSeenBonus = !state || Number(state.seenCount || 0) === 0 ? 1 : 0;
  const closeness = ratingMatchCloseness(puzzle.rating, userRating);

  return daysNormalized * 0.4 + neverSeenBonus * 0.4 + closeness * 0.2;
}

function isStateInReviewFlow(state) {
  if (!state) return false;
  if (state.reviewEnabled === true) return true;
  if (state.status === "review_due" || state.status === "failed") return true;
  if (Number(state.failCount || 0) > 0) return true;
  if (Number(state.hintCount || 0) > 0) return true;
  if (state.lastModePlayed === "review") return true;
  return false;
}

function isStateReviewDue(state, now = new Date()) {
  if (!state) return false;
  if (!isStateInReviewFlow(state)) return false;

  if (state.nextReviewAt) {
    return new Date(state.nextReviewAt).getTime() <= now.getTime();
  }

  // Fallback for older state rows that entered review flow before nextReviewAt existed.
  return state.status === "review_due" || state.status === "failed";
}

function stateDescriptor(state, now = new Date()) {
  const unseen = !state || Number(state.seenCount || 0) === 0;
  const solved = !!state && Number(state.solveCount || 0) > 0;
  const failedBefore = !!state && Number(state.failCount || 0) > 0;
  const mastered =
    !!state &&
    (state.status === "mastered" ||
      !!state.masteredAt ||
      Number(state.solveCount || 0) >= 3);
  const reviewDue = isStateReviewDue(state, now);
  const bookmarked = !!state?.isBookmarked;

  let badge = "new";
  if (mastered) badge = "mastered";
  else if (reviewDue) badge = "review_due";
  else if (failedBefore) badge = "failed_before";
  else if (solved) badge = "solved";
  else if (bookmarked) badge = "bookmarked";

  return {
    unseen,
    solved,
    failedBefore,
    mastered,
    reviewDue,
    bookmarked,
    badge,
  };
}

function puzzleMatchesSearch(puzzle, query) {
  const text = String(puzzle?.title || "").toLowerCase();
  return text.includes(String(query || "").trim().toLowerCase());
}

function toPublicPuzzle(puzzle, state = null, stats = null) {
  const base = puzzle.toObject ? puzzle.toObject() : { ...puzzle };
  const descriptor = stateDescriptor(state);
  const attempts = Number(stats?.attempts || 0);
  const solved = Number(stats?.solved || 0);
  const failed = Number(stats?.failed || 0);
  const avgTimeMs = Number(stats?.avgTimeMs || 0);

  return {
    ...base,
    motifs: normalizedPuzzleMotifs(base),
    userState: state
      ? {
          status: state.status,
          seenCount: Number(state.seenCount || 0),
          solveCount: Number(state.solveCount || 0),
          failCount: Number(state.failCount || 0),
          hintCount: Number(state.hintCount || 0),
          nextReviewAt: state.nextReviewAt,
          isBookmarked: !!state.isBookmarked,
          isHidden: !!state.isHidden,
          masteredAt: state.masteredAt,
          badge: descriptor.badge,
          reviewDue: descriptor.reviewDue,
          mastered: descriptor.mastered,
        }
      : {
          status: "unseen",
          seenCount: 0,
          solveCount: 0,
          failCount: 0,
          hintCount: 0,
          nextReviewAt: null,
          isBookmarked: false,
          isHidden: false,
          masteredAt: null,
          badge: "new",
          reviewDue: false,
          mastered: false,
        },
    quality: {
      attempts,
      solved,
      failed,
      solveRate: attempts > 0 ? Math.round((solved / attempts) * 100) : 0,
      failRate: attempts > 0 ? Math.round((failed / attempts) * 100) : 0,
      avgSolveTimeMs: Math.round(avgTimeMs),
    },
  };
}

async function ensureUserPuzzleStats(user) {
  let stats = await UserPuzzleStats.findOne({ userId: user._id });
  if (!stats) {
    stats = await UserPuzzleStats.create({
      userId: user._id,
      puzzleRating: Number(user.puzzleElo || DEFAULT_USER_PUZZLE_RATING),
      dailyGoal: 10,
      graceTokens: 1,
      graceTokenMonthKey: monthKey(toLocalDateKey()),
      solvedTodayDate: toLocalDateKey(),
      solvedToday: 0,
      reviewDueCount: 0,
    });
  }
  return stats;
}

async function ensureUserPuzzleState(userId, puzzleId) {
  return UserPuzzleState.findOneAndUpdate(
    { userId, puzzleId },
    {
      $setOnInsert: {
        status: "unseen",
        seenCount: 0,
        solveCount: 0,
        failCount: 0,
        hintCount: 0,
        ratedAttemptCount: 0,
        reviewEnabled: false,
        reviewStage: 0,
      },
    },
    { upsert: true, new: true },
  );
}

function applyMonthlyAndDailyResets(stats, dateKey) {
  const targetMonth = monthKey(dateKey);
  if (stats.graceTokenMonthKey !== targetMonth) {
    stats.graceTokenMonthKey = targetMonth;
    stats.graceTokens = 1;
  }

  if (stats.solvedTodayDate !== dateKey) {
    stats.solvedTodayDate = dateKey;
    stats.solvedToday = 0;
  }
}

function applyStreakProgress(stats, dateKey, shouldCount) {
  const result = {
    usedGraceToken: false,
    streakChanged: false,
  };

  if (!shouldCount) return result;

  const previousDate = String(stats.lastPracticeDate || "");

  if (!previousDate) {
    stats.currentStreak = 1;
    stats.longestStreak = Math.max(Number(stats.longestStreak || 0), 1);
    stats.lastPracticeDate = dateKey;
    result.streakChanged = true;
    return result;
  }

  if (previousDate === dateKey) {
    return result;
  }

  const diff = dayDiff(previousDate, dateKey);
  if (diff === 1) {
    stats.currentStreak = Number(stats.currentStreak || 0) + 1;
    stats.lastPracticeDate = dateKey;
    stats.longestStreak = Math.max(
      Number(stats.longestStreak || 0),
      Number(stats.currentStreak || 0),
    );
    result.streakChanged = true;
    return result;
  }

  if (diff === 2 && Number(stats.graceTokens || 0) > 0) {
    stats.graceTokens = Number(stats.graceTokens || 0) - 1;
    stats.currentStreak = Number(stats.currentStreak || 0) + 1;
    stats.lastPracticeDate = dateKey;
    stats.longestStreak = Math.max(
      Number(stats.longestStreak || 0),
      Number(stats.currentStreak || 0),
    );
    result.usedGraceToken = true;
    result.streakChanged = true;
    return result;
  }

  stats.currentStreak = 1;
  stats.longestStreak = Math.max(Number(stats.longestStreak || 0), 1);
  stats.lastPracticeDate = dateKey;
  result.streakChanged = true;
  return result;
}

async function countReviewDue(userId) {
  const states = await UserPuzzleState.find({
    userId,
    isHidden: { $ne: true },
  })
    .select(
      "status nextReviewAt reviewEnabled failCount hintCount lastModePlayed",
    )
    .lean();

  const now = new Date();
  return states.reduce(
    (count, state) => count + (isStateReviewDue(state, now) ? 1 : 0),
    0,
  );
}

async function updateMotifStats({ userId, motifs, result, hintsUsed, timeMs }) {
  const normalized = Array.from(
    new Set(
      safeArray(motifs)
        .map((motif) => motif.toLowerCase())
        .filter(Boolean),
    ),
  );

  if (normalized.length === 0) return;

  const currentDocs = await UserPuzzleMotifStats.find({
    userId,
    motif: { $in: normalized },
  });
  const currentMap = new Map(currentDocs.map((doc) => [doc.motif, doc]));

  const solvedIncrement = result === "SOLVED" ? 1 : 0;
  const failedIncrement = result === "FAILED" ? 1 : 0;
  const hintIncrement = Number(hintsUsed || 0);

  for (const motif of normalized) {
    const existing = currentMap.get(motif);
    if (!existing) {
      const attempts = 1;
      const solved = solvedIncrement;
      const failed = failedIncrement;
      const averageTime = Math.round(timeMs);
      const accuracy = solved > 0 ? 100 : 0;

      await UserPuzzleMotifStats.create({
        userId,
        motif,
        attempts,
        solved,
        failed,
        hintsUsed: hintIncrement,
        averageTime,
        accuracy,
      });
      continue;
    }

    const nextAttempts = Number(existing.attempts || 0) + 1;
    const nextSolved = Number(existing.solved || 0) + solvedIncrement;
    const nextFailed = Number(existing.failed || 0) + failedIncrement;
    const totalTime =
      Number(existing.averageTime || 0) * Number(existing.attempts || 0) +
      Number(timeMs || 0);

    existing.attempts = nextAttempts;
    existing.solved = nextSolved;
    existing.failed = nextFailed;
    existing.hintsUsed = Number(existing.hintsUsed || 0) + hintIncrement;
    existing.averageTime = Math.round(totalTime / nextAttempts);
    existing.accuracy = Number(((nextSolved / nextAttempts) * 100).toFixed(2));
    await existing.save();
  }
}

async function getWeakMotifs(userId, limit = 3) {
  const motifs = await UserPuzzleMotifStats.find({ userId, attempts: { $gte: 3 } })
    .sort({ accuracy: 1, attempts: -1 })
    .limit(limit)
    .lean();

  return motifs.map((entry) => ({
    motif: entry.motif,
    accuracy: Number(entry.accuracy || 0),
    attempts: Number(entry.attempts || 0),
  }));
}

async function getDailyPuzzleForUser({ userId, dateKey }) {
  const existingState = await DailyPuzzleState.findOne({ userId, dateKey }).lean();
  if (existingState) {
    const existingPuzzle = await Puzzle.findById(existingState.puzzleId).lean();
    if (existingPuzzle && existingPuzzle.isActive !== false) {
      return {
        puzzle: existingPuzzle,
        solved: !!existingState.solved,
        solvedAt: existingState.solvedAt,
      };
    }
  }

  const activePuzzles = await Puzzle.find({ isActive: { $ne: false } })
    .select("_id")
    .sort({ rating: 1, _id: 1 })
    .lean();

  if (activePuzzles.length === 0) {
    return { puzzle: null, solved: false, solvedAt: null };
  }

  const seed = stableHash(`${String(userId)}:${dateKey}`);
  const picked = activePuzzles[seed % activePuzzles.length];

  const dailyState = await DailyPuzzleState.findOneAndUpdate(
    { userId, dateKey },
    {
      $setOnInsert: {
        puzzleId: picked._id,
        solved: false,
        solvedAt: null,
      },
    },
    { upsert: true, new: true },
  );

  const puzzle = await Puzzle.findById(dailyState.puzzleId).lean();
  return {
    puzzle,
    solved: !!dailyState.solved,
    solvedAt: dailyState.solvedAt,
  };
}

async function puzzleStatsByPuzzleIds(puzzleIds) {
  if (!Array.isArray(puzzleIds) || puzzleIds.length === 0) return new Map();

  const rows = await PuzzleAttempt.aggregate([
    { $match: { puzzleId: { $in: puzzleIds } } },
    {
      $group: {
        _id: "$puzzleId",
        attempts: { $sum: 1 },
        solved: {
          $sum: {
            $cond: [{ $eq: ["$result", "SOLVED"] }, 1, 0],
          },
        },
        failed: {
          $sum: {
            $cond: [{ $eq: ["$result", "FAILED"] }, 1, 0],
          },
        },
        avgTimeMs: { $avg: "$timeMs" },
      },
    },
  ]);

  const map = new Map();
  for (const row of rows) {
    map.set(String(row._id), {
      attempts: Number(row.attempts || 0),
      solved: Number(row.solved || 0),
      failed: Number(row.failed || 0),
      avgTimeMs: Number(row.avgTimeMs || 0),
    });
  }
  return map;
}

async function selectPuzzleForMode({
  userId,
  mode,
  userRating,
  includeMastered,
  dateKey,
}) {
  if (mode === "daily") {
    const daily = await getDailyPuzzleForUser({ userId, dateKey });
    if (!daily.puzzle) {
      return { puzzle: null, reason: "No active puzzles available" };
    }
    return {
      puzzle: daily.puzzle,
      reason: daily.solved
        ? "Daily puzzle already solved today"
        : "Daily featured puzzle",
      daily,
    };
  }

  const allPuzzles = await Puzzle.find({ isActive: { $ne: false } }).lean();
  if (allPuzzles.length === 0) {
    return { puzzle: null, reason: "No active puzzles available" };
  }

  const puzzleIds = allPuzzles.map((puzzle) => puzzle._id);
  const [states, attempts, weakMotifs] = await Promise.all([
    UserPuzzleState.find({ userId, puzzleId: { $in: puzzleIds } }).lean(),
    PuzzleAttempt.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("puzzleId createdAt")
      .lean(),
    getWeakMotifs(userId, 5),
  ]);

  const stateMap = new Map(states.map((state) => [String(state.puzzleId), state]));
  const lastPuzzleId = attempts[0] ? String(attempts[0].puzzleId) : "";
  const recentSet = new Set(
    attempts.slice(0, 10).map((entry) => String(entry.puzzleId)),
  );
  const reviewNow = new Date();

  let candidates = allPuzzles.filter((puzzle) => {
    const state = stateMap.get(String(puzzle._id));
    if (state?.isHidden) return false;

    const descriptor = stateDescriptor(state);
    if (!includeMastered && descriptor.mastered && mode !== "review") {
      return false;
    }

    return true;
  });

  if (mode === "rated") {
    candidates = candidates.filter((puzzle) => {
      const state = stateMap.get(String(puzzle._id));
      return Number(state?.ratedAttemptCount || 0) === 0;
    });

    const nearRange = candidates.filter((puzzle) => {
      const diff = Math.abs(
        Number(puzzle.rating || DEFAULT_PUZZLE_RATING) - Number(userRating),
      );
      return diff <= 250;
    });

    if (nearRange.length > 0) {
      candidates = nearRange;
    }
  } else if (mode === "review") {
    candidates = candidates.filter((puzzle) => {
      const state = stateMap.get(String(puzzle._id));
      if (!state) return false;
      return isStateReviewDue(state, reviewNow);
    });
  } else if (mode === "random") {
    const nearRange = candidates.filter((puzzle) => {
      const diff = Math.abs(
        Number(puzzle.rating || DEFAULT_PUZZLE_RATING) - Number(userRating),
      );
      return diff <= 200;
    });
    if (nearRange.length > 0) {
      candidates = nearRange;
    }
  }

  if (candidates.length === 0) {
    if (mode === "review") {
      return {
        puzzle: null,
        reason: "No reviews due. Try a new rated puzzle.",
        weakMotifs,
      };
    }
    candidates = allPuzzles;
  }

  const withoutLast = candidates.filter(
    (puzzle) => String(puzzle._id) !== lastPuzzleId,
  );
  if (withoutLast.length > 0) {
    candidates = withoutLast;
  }

  if (mode === "random") {
    const withoutRecent = candidates.filter(
      (puzzle) => !recentSet.has(String(puzzle._id)),
    );
    if (withoutRecent.length > 0) {
      candidates = withoutRecent;
    }
  }

  const scored = candidates.map((puzzle) => {
    const state = stateMap.get(String(puzzle._id));
    const descriptor = stateDescriptor(state, reviewNow);
    let score = noveltyScore({ puzzle, state, userRating });

    if (mode === "review" && descriptor.reviewDue) {
      score += 0.45;
      const overdueDays = state?.nextReviewAt
        ? Math.max(
            0,
            (reviewNow.getTime() - new Date(state.nextReviewAt).getTime()) /
              86400000,
          )
        : 0;
      score += Math.min(overdueDays, 7) * 0.12;
      if (state?.status === "failed") score += 0.25;
      if (Number(state?.failCount || 0) > 0) score += 0.1;
      if (Number(state?.hintCount || 0) > 0) score += 0.08;
      if (state?.reviewEnabled === true) score += 0.1;
    }
    if (
      mode === "rated" &&
      (!state || Number(state.ratedAttemptCount || 0) === 0)
    )
      score += 0.2;
    if (mode === "random") {
      score += Math.random() * 0.35;
    }
    if (descriptor.mastered) score -= 0.25;

    return { puzzle, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const topSlice = scored.slice(0, Math.min(5, scored.length));
  let selected = topSlice[0]?.puzzle || scored[0]?.puzzle || null;

  if (mode === "random" && topSlice.length > 1) {
    selected = topSlice[Math.floor(Math.random() * topSlice.length)].puzzle;
  }

  if (!selected) {
    return { puzzle: null, reason: "No puzzle available" };
  }

  let reason = "New rated puzzle near your level";

  if (mode === "review") {
    reason = "Review due";
  } else if (mode === "random") {
    reason = "Random unrated puzzle near your Elo";
  }

  return {
    puzzle: selected,
    reason,
    weakMotifs,
  };
}

async function recordPuzzleAttempt({
  userId,
  puzzleId,
  result,
  mode,
  movesPlayed,
  timeMs,
  hintsUsed,
  solutionShown,
  dateKey,
}) {
  const [puzzle, user] = await Promise.all([
    Puzzle.findById(puzzleId),
    User.findById(userId),
  ]);

  if (!puzzle) {
    return { error: { status: 404, message: "Puzzle not found" } };
  }
  if (!user) {
    return { error: { status: 404, message: "User not found" } };
  }

  const [state, stats] = await Promise.all([
    ensureUserPuzzleState(user._id, puzzle._id),
    ensureUserPuzzleStats(user),
  ]);

  applyMonthlyAndDailyResets(stats, dateKey);

  const now = new Date();
  const userRatingBefore = Number(
    user.puzzleElo ?? stats.puzzleRating ?? DEFAULT_USER_PUZZLE_RATING,
  );
  const puzzleRatingBefore = Number(puzzle.rating ?? DEFAULT_PUZZLE_RATING);
  const userAttemptsBefore = Number(user.puzzleAttempts ?? 0);
  const puzzleAttemptsBefore = Number(puzzle.timesPlayed ?? 0);
  const solveCountBefore = Number(state.solveCount || 0);
  const solutionShownCountBefore = Number(state.solutionShownCount || 0);
  const reviewStageBefore = Number(state.reviewStage || 0);
  const wasInReviewFlow = isStateInReviewFlow(state);
  const ratedAttemptCountBefore = Number(state.ratedAttemptCount || 0);
  const hasSeenSolutionBefore = solutionShownCountBefore > 0;
  const isFirstRatedAttempt =
    mode === "rated" && ratedAttemptCountBefore === 0;
  const solvedClean = result === "SOLVED" && hintsUsed === 0 && !solutionShown;
  const solvedWithHint =
    result === "SOLVED" && hintsUsed > 0 && !solutionShown;
  const failedClean = result === "FAILED" && hintsUsed === 0 && !solutionShown;
  const revealPenaltyAttempt = isFirstRatedAttempt && solutionShown;
  const ratedSolveAttempt =
    isFirstRatedAttempt &&
    !hasSeenSolutionBefore &&
    (solvedClean || solvedWithHint);
  const ratedFailAttempt = isFirstRatedAttempt && failedClean;
  const ratedImpactApplied =
    ratedSolveAttempt || ratedFailAttempt || revealPenaltyAttempt;

  const repeatSolve = result === "SOLVED" && solveCountBefore > 0;

  const expectedScore = expectedUserScore(userRatingBefore, puzzleRatingBefore);
  const kUser = resolveUserK(userAttemptsBefore);
  const kPuzzle = resolvePuzzleK(puzzleAttemptsBefore);

  let score = 0;
  let userRatingAfter = userRatingBefore;
  let puzzleRatingAfter = puzzleRatingBefore;

  const solvedUserRatingAfterFull = applyEloDelta(
    userRatingBefore,
    kUser,
    1,
    expectedScore,
  );
  const solvedPuzzleRatingAfterFull = applyEloDelta(
    puzzleRatingBefore,
    kPuzzle,
    0,
    1 - expectedScore,
  );
  const failedUserRatingAfterFull = applyEloDelta(
    userRatingBefore,
    kUser,
    0,
    expectedScore,
  );
  const failedPuzzleRatingAfterFull = applyEloDelta(
    puzzleRatingBefore,
    kPuzzle,
    1,
    1 - expectedScore,
  );

  if (ratedSolveAttempt) {
    score = 1;
    const fullUserSolveDelta = Math.max(
      1,
      solvedUserRatingAfterFull - userRatingBefore,
    );
    const fullPuzzleSolveDelta = solvedPuzzleRatingAfterFull - puzzleRatingBefore;
    const normalSolveGain = resolveTimeScaledSolveEloGain(timeMs);
    const targetSolveGain = solvedWithHint
      ? Math.max(1, Math.round(normalSolveGain * 0.5))
      : normalSolveGain;
    const scale = targetSolveGain / fullUserSolveDelta;
    const scaledPuzzleDelta = Math.round(fullPuzzleSolveDelta * scale);

    userRatingAfter = Math.max(MIN_RATING, userRatingBefore + targetSolveGain);
    puzzleRatingAfter = Math.max(MIN_RATING, puzzleRatingBefore + scaledPuzzleDelta);
  } else if (ratedFailAttempt) {
    score = 0;
    userRatingAfter = failedUserRatingAfterFull;
    puzzleRatingAfter = failedPuzzleRatingAfterFull;
  } else if (revealPenaltyAttempt) {
    score = 0;
    const fullUserFailDelta = failedUserRatingAfterFull - userRatingBefore;
    const fullPuzzleFailDelta = failedPuzzleRatingAfterFull - puzzleRatingBefore;

    userRatingAfter = Math.max(
      MIN_RATING,
      userRatingBefore + Math.round(fullUserFailDelta * 0.5),
    );
    puzzleRatingAfter = Math.max(
      MIN_RATING,
      puzzleRatingBefore + Math.round(fullPuzzleFailDelta * 0.5),
    );
  }

  const ratingChange = userRatingAfter - userRatingBefore;
  const decayMultiplier = repeatDecayMultiplier(solveCountBefore);
  const xpAwarded = resolveXpAward({
    result,
    solveCountBefore,
    hintsUsed,
    solutionShown,
  });

  const solvedIncrement = result === "SOLVED" ? 1 : 0;
  const failedIncrement = result === "FAILED" ? 1 : 0;
  const skippedIncrement =
    result === "SKIPPED" || result === "ABANDONED" ? 1 : 0;

  const solveCountAfter = solveCountBefore + solvedIncrement;

  let statusAfter = state.status || "seen";
  let nextReviewAt = state.nextReviewAt || null;
  let reviewEnabled = state.reviewEnabled === true || wasInReviewFlow;
  let reviewStage = reviewStageBefore;

  const shouldEnterReviewNow =
    result === "FAILED" || solutionShown || hintsUsed > 0;

  if (shouldEnterReviewNow) {
    statusAfter = "review_due";
    reviewEnabled = true;
    reviewStage = 0;
    nextReviewAt =
      result === "FAILED" ? addMinutes(now, 10) : addDays(now, 1);
  } else if (result === "SOLVED") {
    if (reviewEnabled) {
      reviewStage += 1;
      if (reviewStage >= 4) {
        statusAfter = "mastered";
        reviewEnabled = false;
        nextReviewAt = null;
      } else {
        statusAfter = "solved";
        if (reviewStage === 1) nextReviewAt = addDays(now, 3);
        else if (reviewStage === 2) nextReviewAt = addDays(now, 7);
        else nextReviewAt = addDays(now, 21);
      }
    } else if (solveCountAfter >= 3) {
      statusAfter = "mastered";
      nextReviewAt = null;
    } else {
      statusAfter = "solved";
      nextReviewAt = null;
    }
  } else if (result === "SKIPPED" && statusAfter === "unseen") {
    statusAfter = "seen";
  }

  state.seenCount = Number(state.seenCount || 0) + 1;
  state.lastSeenAt = now;
  state.lastModePlayed = mode;
  state.hintCount = Number(state.hintCount || 0) + hintsUsed;
  state.solutionShownCount =
    Number(state.solutionShownCount || 0) + (solutionShown ? 1 : 0);
  state.reviewEnabled = reviewEnabled;
  state.reviewStage = reviewStage;
  if (mode === "rated") {
    state.ratedAttemptCount = Number(state.ratedAttemptCount || 0) + 1;
  }

  if (solvedIncrement > 0) {
    state.solveCount = solveCountAfter;
    state.lastSolvedAt = now;
    if (!state.firstSolvedAt) {
      state.firstSolvedAt = now;
    }
  }

  if (failedIncrement > 0) {
    state.failCount = Number(state.failCount || 0) + 1;
  }

  if (statusAfter === "mastered") {
    if (!state.masteredAt) state.masteredAt = now;
  } else {
    state.masteredAt = null;
  }

  state.status = statusAfter;
  state.nextReviewAt = nextReviewAt;

  user.puzzleElo = userRatingAfter;
  user.puzzleBestElo = Math.max(
    Number(user.puzzleBestElo || userRatingBefore),
    userRatingAfter,
  );
  user.puzzleAttempts = userAttemptsBefore + 1;
  user.puzzleSolved = Number(user.puzzleSolved || 0) + solvedIncrement;
  user.puzzleFailed = Number(user.puzzleFailed || 0) + failedIncrement;
  user.puzzleSkipped = Number(user.puzzleSkipped || 0) + skippedIncrement;
  user.puzzleLastAttemptAt = now;

  puzzle.timesPlayed = puzzleAttemptsBefore + 1;
  puzzle.timesSolved = Number(puzzle.timesSolved || 0) + solvedIncrement;
  if (ratedImpactApplied) {
    puzzle.rating = puzzleRatingAfter;
  }

  stats.puzzleRating = userRatingAfter;
  stats.puzzleXP = Number(stats.puzzleXP || 0) + xpAwarded;

  if (solvedIncrement > 0 && stats.solvedTodayDate === dateKey) {
    stats.solvedToday = Number(stats.solvedToday || 0) + 1;
  }

  const streakUpdate = applyStreakProgress(
    stats,
    dateKey,
    shouldCountTowardStreak(mode, result),
  );

  await Promise.all([user.save(), puzzle.save(), state.save()]);

  if (mode === "daily") {
    await DailyPuzzleState.findOneAndUpdate(
      { userId, dateKey },
      {
        $set: {
          puzzleId: puzzle._id,
          solved: result === "SOLVED",
          solvedAt: result === "SOLVED" ? now : null,
        },
      },
      { upsert: true },
    );
  }

  await updateMotifStats({
    userId,
    motifs: normalizedPuzzleMotifs(puzzle),
    result,
    hintsUsed,
    timeMs,
  });

  const reviewDueCount = await countReviewDue(userId);
  stats.reviewDueCount = Number(reviewDueCount || 0);
  await stats.save();

  const attempt = await PuzzleAttempt.create({
    userId,
    puzzleId: puzzle._id,
    result,
    mode,
    movesPlayed,
    timeMs,
    usedHint: hintsUsed > 0,
    hintsUsed,
    solutionShown,
    xpAwarded,
    ratingChange,
    isRated: ratedImpactApplied,
    isRepeat: repeatSolve,
    repeatDecayMultiplier: decayMultiplier,
    attemptIndex: Number(state.seenCount || 1),
    statusAfter,
    score,
    expectedScore,
    kUser,
    kPuzzle,
    userRatingBefore,
    userRatingAfter,
    puzzleRatingBefore,
    puzzleRatingAfter,
  });

  const messages = [];

  if (repeatSolve) {
    messages.push("Repeat solve: XP reduced by decay. Puzzle Elo unchanged.");
  }

  if (hintsUsed > 0) {
    messages.push("Hint used: XP reduced. Puzzle added to review.");
  }

  if (solutionShown && revealPenaltyAttempt) {
    messages.push("Solution viewed: half rating penalty applied.");
  } else if (solutionShown) {
    messages.push("Solution viewed: this puzzle is no longer rated for gains.");
  }

  if (mode === "review") {
    messages.push("Review mode: Puzzle Elo unchanged.");
  }

  if (streakUpdate.usedGraceToken) {
    messages.push("Streak saved. 1 grace token used.");
  }

  return {
    attempt: {
      id: String(attempt._id),
      result: attempt.result,
      mode: attempt.mode,
      createdAt: attempt.createdAt,
      timeMs: attempt.timeMs,
      movesPlayed: attempt.movesPlayed,
      usedHint: attempt.usedHint,
      hintsUsed: attempt.hintsUsed,
      solutionShown: attempt.solutionShown,
      xpAwarded: attempt.xpAwarded,
      ratingChange: attempt.ratingChange,
      isRated: attempt.isRated,
      isRepeat: attempt.isRepeat,
      repeatDecayMultiplier: attempt.repeatDecayMultiplier,
      statusAfter: attempt.statusAfter,
      userRatingBefore,
      userRatingAfter,
      puzzleRatingBefore,
      puzzleRatingAfter,
    },
    user: {
      id: String(user._id),
      puzzleElo: Number(user.puzzleElo || DEFAULT_USER_PUZZLE_RATING),
      puzzleBestElo: Number(
        user.puzzleBestElo || user.puzzleElo || DEFAULT_USER_PUZZLE_RATING,
      ),
      puzzleAttempts: Number(user.puzzleAttempts || 0),
      puzzleSolved: Number(user.puzzleSolved || 0),
      puzzleFailed: Number(user.puzzleFailed || 0),
      puzzleSkipped: Number(user.puzzleSkipped || 0),
      delta: ratingChange,
      provisional: Number(user.puzzleAttempts || 0) < PROVISIONAL_WINDOW,
    },
    state: {
      status: state.status,
      seenCount: Number(state.seenCount || 0),
      solveCount: Number(state.solveCount || 0),
      failCount: Number(state.failCount || 0),
      hintCount: Number(state.hintCount || 0),
      nextReviewAt: state.nextReviewAt,
      masteredAt: state.masteredAt,
      isBookmarked: !!state.isBookmarked,
    },
    stats: {
      puzzleRating: Number(stats.puzzleRating || DEFAULT_USER_PUZZLE_RATING),
      puzzleXP: Number(stats.puzzleXP || 0),
      currentStreak: Number(stats.currentStreak || 0),
      longestStreak: Number(stats.longestStreak || 0),
      dailyGoal: Number(stats.dailyGoal || 10),
      solvedToday: Number(stats.solvedToday || 0),
      reviewDueCount: Number(stats.reviewDueCount || 0),
      graceTokens: Number(stats.graceTokens || 0),
    },
    puzzle: {
      id: String(puzzle._id),
      title: puzzle.title,
      difficulty: puzzle.difficulty,
      rating: Number(puzzle.rating || DEFAULT_PUZZLE_RATING),
      delta: puzzleRatingAfter - puzzleRatingBefore,
      timesPlayed: Number(puzzle.timesPlayed || 0),
      timesSolved: Number(puzzle.timesSolved || 0),
      motifs: normalizedPuzzleMotifs(puzzle),
    },
    meta: {
      mode,
      isFreshRatedAttempt: isFirstRatedAttempt,
      isRepeat: repeatSolve,
      xpAwarded,
      ratingChange,
      messages,
    },
  };
}

router.get("/", optionalAuthMiddleware, async (req, res) => {
  try {
    const puzzles = await Puzzle.find({ isActive: { $ne: false } })
      .sort({ rating: 1 })
      .lean();

    if (!req.user?.userId) {
      return res.json(
        puzzles.map((puzzle) => ({
          ...puzzle,
          motifs: normalizedPuzzleMotifs(puzzle),
        })),
      );
    }

    const puzzleIds = puzzles.map((puzzle) => puzzle._id);
    const [states, statsMap] = await Promise.all([
      UserPuzzleState.find({
        userId: req.user.userId,
        puzzleId: { $in: puzzleIds },
      }).lean(),
      puzzleStatsByPuzzleIds(puzzleIds),
    ]);

    const stateByPuzzleId = new Map(
      states.map((state) => [String(state.puzzleId), state]),
    );

    return res.json(
      puzzles.map((puzzle) =>
        toPublicPuzzle(
          puzzle,
          stateByPuzzleId.get(String(puzzle._id)) || null,
          statsMap.get(String(puzzle._id)) || null,
        ),
      ),
    );
  } catch (error) {
    console.error("Puzzle list error:", error);
    return res.status(500).json({ error: "Failed to fetch puzzles" });
  }
});

router.get("/me/stats", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select(
      "puzzleElo puzzleBestElo puzzleAttempts puzzleSolved puzzleFailed puzzleSkipped",
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const stats = await ensureUserPuzzleStats(user);
    applyMonthlyAndDailyResets(stats, toLocalDateKey());
    stats.reviewDueCount = await countReviewDue(user._id);
    await stats.save();

    const weakMotifs = await getWeakMotifs(user._id, 4);

    return res.json({
      rating: Number(user.puzzleElo ?? DEFAULT_USER_PUZZLE_RATING),
      bestRating: Number(
        user.puzzleBestElo ?? user.puzzleElo ?? DEFAULT_USER_PUZZLE_RATING,
      ),
      attempts: Number(user.puzzleAttempts || 0),
      solved: Number(user.puzzleSolved || 0),
      failed: Number(user.puzzleFailed || 0),
      skipped: Number(user.puzzleSkipped || 0),
      solvedToday: Number(stats.solvedToday || 0),
      streak: Number(stats.currentStreak || 0),
      provisional: Number(user.puzzleAttempts || 0) < PROVISIONAL_WINDOW,
      dailyGoal: Number(stats.dailyGoal || 10),
      puzzleXP: Number(stats.puzzleXP || 0),
      reviewDueCount: Number(stats.reviewDueCount || 0),
      graceTokens: Number(stats.graceTokens || 0),
      weakMotifs,
    });
  } catch (error) {
    console.error("Puzzle stats error:", error);
    return res.status(500).json({ error: "Failed to fetch puzzle stats" });
  }
});

router.patch("/me/daily-goal", authMiddleware, async (req, res) => {
  try {
    const goal = Number(req.body?.dailyGoal);
    if (![5, 10, 15].includes(goal)) {
      return res.status(400).json({ error: "dailyGoal must be 5, 10, or 15" });
    }

    const user = await User.findById(req.user.userId).select("_id puzzleElo");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const stats = await ensureUserPuzzleStats(user);
    stats.dailyGoal = goal;
    await stats.save();

    return res.json({
      success: true,
      dailyGoal: Number(stats.dailyGoal || 10),
    });
  } catch (error) {
    console.error("Daily goal update error:", error);
    return res.status(500).json({ error: "Failed to update daily goal" });
  }
});

router.get("/featured", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 6;
    const puzzles = await Puzzle.find({
      featured: true,
      isActive: { $ne: false },
    })
      .sort({ rating: 1 })
      .limit(limit);
    return res.json(puzzles);
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch featured puzzles" });
  }
});

router.get("/library", authMiddleware, async (req, res) => {
  try {
    const query = String(req.query.query || "").trim();
    const difficulty = String(req.query.difficulty || "").trim();
    const status = String(req.query.status || "all").trim().toLowerCase();
    const includeMastered =
      String(req.query.includeMastered || "false").toLowerCase() === "true";

    const minRating = Number(req.query.minRating);
    const maxRating = Number(req.query.maxRating);

    const puzzleFilter = { isActive: { $ne: false } };
    if (["Easy", "Medium", "Hard"].includes(difficulty)) {
      puzzleFilter.difficulty = difficulty;
    }

    if (Number.isFinite(minRating) || Number.isFinite(maxRating)) {
      puzzleFilter.rating = {};
      if (Number.isFinite(minRating)) puzzleFilter.rating.$gte = minRating;
      if (Number.isFinite(maxRating)) puzzleFilter.rating.$lte = maxRating;
    }

    const puzzles = await Puzzle.find(puzzleFilter).sort({ rating: 1 }).lean();

    const filteredByText = puzzles.filter((puzzle) => {
      if (query && !puzzleMatchesSearch(puzzle, query)) return false;
      return true;
    });

    const puzzleIds = filteredByText.map((puzzle) => puzzle._id);

    const [states, qualityStats] = await Promise.all([
      UserPuzzleState.find({
        userId: req.user.userId,
        puzzleId: { $in: puzzleIds },
      }).lean(),
      puzzleStatsByPuzzleIds(puzzleIds),
    ]);

    const stateMap = new Map(states.map((entry) => [String(entry.puzzleId), entry]));

    const now = new Date();
    const items = filteredByText
      .map((puzzle) => {
        const state = stateMap.get(String(puzzle._id)) || null;
        return toPublicPuzzle(
          puzzle,
          state,
          qualityStats.get(String(puzzle._id)) || null,
        );
      })
      .filter((item) => {
        const descriptor = stateDescriptor(item.userState, now);

        if (!includeMastered && descriptor.mastered && status !== "mastered")
          return false;

        if (status === "all") return true;
        if (status === "new") return descriptor.unseen;
        if (status === "solved") return descriptor.solved && !descriptor.mastered;
        if (status === "failed_before") return descriptor.failedBefore;
        if (status === "review_due") return descriptor.reviewDue;
        if (status === "mastered") return descriptor.mastered;
        if (status === "bookmarked") return descriptor.bookmarked;
        return true;
      });

    return res.json({
      items,
      total: items.length,
    });
  } catch (error) {
    console.error("Puzzle library error:", error);
    return res.status(500).json({ error: "Failed to fetch puzzle library" });
  }
});

router.get("/select", authMiddleware, async (req, res) => {
  try {
    const mode = normalizeMode(req.query.mode, "rated");
    const includeMastered =
      String(req.query.includeMastered || "false").toLowerCase() === "true";
    const dateKey = normalizeDateKey(req.query.dateKey);

    const user = await User.findById(req.user.userId).select("_id puzzleElo");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const selection = await selectPuzzleForMode({
      userId: user._id,
      mode,
      userRating: Number(user.puzzleElo || DEFAULT_USER_PUZZLE_RATING),
      includeMastered,
      dateKey,
    });

    if (!selection.puzzle) {
      if (mode === "review") {
        return res.json({
          mode,
          reason: selection.reason || "No reviews due. Try a new rated puzzle.",
          puzzle: null,
          weakMotifs: selection.weakMotifs || [],
          daily: selection.daily || null,
        });
      }

      return res
        .status(404)
        .json({ error: selection.reason || "No puzzle available" });
    }

    const state = await UserPuzzleState.findOne({
      userId: user._id,
      puzzleId: selection.puzzle._id,
    }).lean();

    const qualityStats = await puzzleStatsByPuzzleIds([selection.puzzle._id]);

    return res.json({
      mode,
      reason: selection.reason,
      puzzle: toPublicPuzzle(
        selection.puzzle,
        state,
        qualityStats.get(String(selection.puzzle._id)) || null,
      ),
      weakMotifs: selection.weakMotifs || [],
      daily: selection.daily || null,
    });
  } catch (error) {
    console.error("Puzzle select error:", error);
    return res.status(500).json({ error: "Failed to select puzzle" });
  }
});

router.get("/review", authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const candidateStates = await UserPuzzleState.find({
      userId: req.user.userId,
      isHidden: { $ne: true },
      $or: [
        { reviewEnabled: true },
        { status: "review_due" },
        { status: "failed" },
        { failCount: { $gt: 0 } },
        { hintCount: { $gt: 0 } },
        { lastModePlayed: "review" },
      ],
    })
      .sort({ nextReviewAt: 1, updatedAt: -1 })
      .limit(200)
      .lean();

    const states = candidateStates
      .filter((state) => isStateReviewDue(state, now))
      .sort((a, b) => {
        const aTime = a.nextReviewAt ? new Date(a.nextReviewAt).getTime() : 0;
        const bTime = b.nextReviewAt ? new Date(b.nextReviewAt).getTime() : 0;
        return aTime - bTime;
      })
      .slice(0, 100);

    if (states.length === 0) {
      return res.json({
        items: [],
        total: 0,
        message: "No reviews due. Try a new rated puzzle.",
      });
    }

    const puzzleIds = states.map((state) => state.puzzleId);
    const [puzzles, qualityStats] = await Promise.all([
      Puzzle.find({ _id: { $in: puzzleIds }, isActive: { $ne: false } }).lean(),
      puzzleStatsByPuzzleIds(puzzleIds),
    ]);

    const puzzleMap = new Map(puzzles.map((puzzle) => [String(puzzle._id), puzzle]));

    const items = states
      .map((state) => {
        const puzzle = puzzleMap.get(String(state.puzzleId));
        if (!puzzle) return null;
        return toPublicPuzzle(
          puzzle,
          state,
          qualityStats.get(String(puzzle._id)) || null,
        );
      })
      .filter(Boolean);

    return res.json({
      items,
      total: items.length,
      message:
        items.length === 0 ? "No reviews due. Try a new rated puzzle." : null,
    });
  } catch (error) {
    console.error("Puzzle review queue error:", error);
    return res.status(500).json({ error: "Failed to fetch review queue" });
  }
});

router.get("/daily", authMiddleware, async (req, res) => {
  try {
    const dateKey = normalizeDateKey(req.query.dateKey);
    const daily = await getDailyPuzzleForUser({
      userId: req.user.userId,
      dateKey,
    });

    if (!daily.puzzle) {
      return res.status(404).json({ error: "No daily puzzle available" });
    }

    const [state, qualityStats] = await Promise.all([
      UserPuzzleState.findOne({
        userId: req.user.userId,
        puzzleId: daily.puzzle._id,
      }).lean(),
      puzzleStatsByPuzzleIds([daily.puzzle._id]),
    ]);

    return res.json({
      date: dateKey,
      solved: !!daily.solved,
      solvedAt: daily.solvedAt,
      puzzle: toPublicPuzzle(
        daily.puzzle,
        state,
        qualityStats.get(String(daily.puzzle._id)) || null,
      ),
    });
  } catch (error) {
    console.error("Daily puzzle error:", error);
    return res.status(500).json({ error: "Failed to fetch daily puzzle" });
  }
});

router.get("/history", authMiddleware, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));

    const attempts = await PuzzleAttempt.find({ userId: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate(
        "puzzleId",
        "title themes motifs rating difficulty fen description isWhiteToMove",
      )
      .lean();

    const items = attempts.map((attempt) => ({
      id: String(attempt._id),
      puzzleId: String(attempt.puzzleId?._id || ""),
      puzzleTitle: attempt.puzzleId?.title || "Puzzle",
      motifs: normalizedPuzzleMotifs(attempt.puzzleId || {}),
      puzzleRating: Number(attempt.puzzleId?.rating || 0),
      puzzleDifficulty: String(attempt.puzzleId?.difficulty || "Medium"),
      puzzleFen: String(attempt.puzzleId?.fen || ""),
      puzzleDescription: String(attempt.puzzleId?.description || ""),
      isWhiteToMove:
        attempt.puzzleId?.isWhiteToMove === false ? false : true,
      date: attempt.createdAt,
      result: attempt.result,
      mode: attempt.mode || "rated",
      ratingChange: Number(attempt.ratingChange || 0),
      xpGained: Number(attempt.xpAwarded || 0),
      hintsUsed: Number(attempt.hintsUsed || 0),
      timeSpent: Number(attempt.timeMs || 0),
      statusAfter: attempt.statusAfter || "seen",
      isRepeat: !!attempt.isRepeat,
    }));

    return res.json({ items, total: items.length });
  } catch (error) {
    console.error("Puzzle history error:", error);
    return res.status(500).json({ error: "Failed to fetch puzzle history" });
  }
});

router.post("/:id/bookmark", authMiddleware, async (req, res) => {
  try {
    const puzzle = await Puzzle.findById(req.params.id).select("_id");
    if (!puzzle) {
      return res.status(404).json({ error: "Puzzle not found" });
    }

    const state = await ensureUserPuzzleState(req.user.userId, puzzle._id);
    const nextValue =
      typeof req.body?.isBookmarked === "boolean"
        ? req.body.isBookmarked
        : !state.isBookmarked;
    state.isBookmarked = nextValue;
    await state.save();

    return res.json({ success: true, isBookmarked: state.isBookmarked });
  } catch (error) {
    console.error("Bookmark puzzle error:", error);
    return res.status(500).json({ error: "Failed to update bookmark" });
  }
});

router.patch("/:id/featured", async (req, res) => {
  try {
    const { featured } = req.body;
    const puzzle = await Puzzle.findByIdAndUpdate(
      req.params.id,
      { featured: !!featured },
      { new: true },
    );
    if (!puzzle) {
      return res.status(404).json({ error: "Puzzle not found" });
    }
    return res.json(puzzle);
  } catch (error) {
    return res.status(500).json({ error: "Failed to update puzzle" });
  }
});

router.post("/:id/attempt", authMiddleware, async (req, res) => {
  try {
    const mode = normalizeMode(req.body?.mode, "rated");
    const solutionShown = req.body?.solutionShown === true;

    let result = normalizeResult(req.body?.result);
    if (!result) {
      return res.status(400).json({
        error: "Invalid result. Expected SOLVED, FAILED, SKIPPED, or ABANDONED.",
      });
    }

    if (solutionShown && result === "SOLVED") {
      result = "ABANDONED";
    }

    const usedHint = req.body?.usedHint === true;
    const hintsUsed = normalizeHintsUsed(req.body?.hintsUsed, usedHint);

    const outcome = await recordPuzzleAttempt({
      userId: req.user.userId,
      puzzleId: req.params.id,
      result,
      mode,
      movesPlayed: normalizeMovesPlayed(req.body?.movesPlayed),
      timeMs: normalizeTimeMs(req.body?.timeMs),
      hintsUsed,
      solutionShown,
      dateKey: normalizeDateKey(req.body?.localDateKey),
    });

    if (outcome.error) {
      return res.status(outcome.error.status).json({ error: outcome.error.message });
    }

    return res.json({ success: true, ...outcome });
  } catch (error) {
    console.error("Puzzle attempt error:", error);
    return res.status(500).json({ error: "Failed to record puzzle attempt" });
  }
});

router.post("/:id/solve", authMiddleware, async (req, res) => {
  try {
    const usedHint = req.body?.usedHint === true;
    const hintsUsed = normalizeHintsUsed(req.body?.hintsUsed, usedHint);

    const outcome = await recordPuzzleAttempt({
      userId: req.user.userId,
      puzzleId: req.params.id,
      result: "SOLVED",
      mode: normalizeMode(req.body?.mode, "rated"),
      movesPlayed: normalizeMovesPlayed(req.body?.movesPlayed),
      timeMs: normalizeTimeMs(req.body?.timeMs),
      hintsUsed,
      solutionShown: req.body?.solutionShown === true,
      dateKey: normalizeDateKey(req.body?.localDateKey),
    });

    if (outcome.error) {
      return res.status(outcome.error.status).json({ error: outcome.error.message });
    }

    return res.json({
      success: true,
      puzzleElo: outcome.user.puzzleElo,
      gain: outcome.user.delta,
      difficulty: outcome.puzzle.difficulty,
      ...outcome,
    });
  } catch (error) {
    console.error("Solve error:", error);
    return res.status(500).json({ error: "Failed to record puzzle solve" });
  }
});

router.patch("/:id/stats", async (req, res) => {
  try {
    const { solved } = req.body;
    const update = { $inc: { timesPlayed: 1 } };
    if (solved) {
      update.$inc.timesSolved = 1;
    }
    const puzzle = await Puzzle.findByIdAndUpdate(req.params.id, update, {
      new: true,
    });
    if (!puzzle) {
      return res.status(404).json({ error: "Puzzle not found" });
    }
    return res.json(puzzle);
  } catch (error) {
    return res.status(500).json({ error: "Failed to update puzzle stats" });
  }
});

router.get("/:id", optionalAuthMiddleware, async (req, res) => {
  try {
    const puzzle = await Puzzle.findById(req.params.id).lean();
    if (!puzzle) {
      return res.status(404).json({ error: "Puzzle not found" });
    }

    if (puzzle.isActive === false) {
      return res.status(404).json({ error: "Puzzle not found" });
    }

    if (!req.user?.userId) {
      return res.json({ ...puzzle, motifs: normalizedPuzzleMotifs(puzzle) });
    }

    const [state, qualityStats] = await Promise.all([
      UserPuzzleState.findOne({
        userId: req.user.userId,
        puzzleId: puzzle._id,
      }).lean(),
      puzzleStatsByPuzzleIds([puzzle._id]),
    ]);

    return res.json(
      toPublicPuzzle(
        puzzle,
        state,
        qualityStats.get(String(puzzle._id)) || null,
      ),
    );
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch puzzle" });
  }
});

export default router;

