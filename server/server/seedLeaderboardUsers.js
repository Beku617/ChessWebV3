import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDB } from "./config/db.js";
import { User } from "./models/index.js";
import {
  DEFAULT_GLICKO_RD,
  DEFAULT_GLICKO_VOLATILITY,
} from "./utils/glicko2.js";

const NAME_PREFIX = "LB Seed";
const EMAIL_PATTERN = /^lb\.seed\.\d+@neongambit\.local$/i;

const FIRST_PARTS = [
  "Nova",
  "Storm",
  "Iron",
  "Silent",
  "Crimson",
  "Royal",
  "Frost",
  "Shadow",
  "Emerald",
  "Golden",
  "Rapid",
  "Tactical",
  "Atomic",
  "Zen",
  "Phantom",
];

const SECOND_PARTS = [
  "Knight",
  "Bishop",
  "Rook",
  "Queen",
  "King",
  "Gambit",
  "Check",
  "Fork",
  "Pin",
  "Castle",
  "Tempo",
  "Endgame",
  "Pawn",
  "Vision",
  "Attack",
];

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function getArgValue(name, fallback) {
  const key = `${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(key));
  if (!hit) return fallback;
  const raw = hit.slice(key.length).trim();
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function seeded(index, salt) {
  const x = Math.sin(index * 9283.123 + salt * 131.77) * 10000;
  return x - Math.floor(x);
}

function randomInt(index, salt, min, max) {
  const n = seeded(index, salt);
  return Math.floor(min + n * (max - min + 1));
}

function poolRating(base, index, salt) {
  const swing = randomInt(index, salt, -220, 220);
  return clamp(base + swing, 650, 2900);
}

function rdFromGames(games) {
  const safeGames = Math.max(0, Number(games) || 0);
  const rd = Math.round(DEFAULT_GLICKO_RD / Math.sqrt(1 + safeGames / 7));
  return clamp(rd, 35, DEFAULT_GLICKO_RD);
}

function volFromSeed(index, salt) {
  const value = 0.03 + seeded(index, salt) * 0.07;
  return Math.round(value * 10000) / 10000;
}

function daysAgoDate(index, salt, maxDays = 120) {
  const daysAgo = randomInt(index, salt, 0, maxDays);
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
}

function buildSeedUser(index, hashedPassword) {
  const base = randomInt(index, 1, 900, 2450);
  const bulletGames = randomInt(index, 2, 10, 380);
  const blitzGames = randomInt(index, 3, 10, 420);
  const rapidGames = randomInt(index, 4, 10, 300);
  const classicalGames = randomInt(index, 5, 10, 210);

  const bulletRating = poolRating(base, index, 6);
  const blitzRating = poolRating(base + 35, index, 7);
  const rapidRating = poolRating(base + 70, index, 8);
  const classicalRating = poolRating(base + 110, index, 9);

  const gamesPlayed = bulletGames + blitzGames + rapidGames + classicalGames;
  const winRatio = 0.34 + seeded(index, 10) * 0.36;
  const gamesWon = Math.round(gamesPlayed * winRatio);

  const first = FIRST_PARTS[index % FIRST_PARTS.length];
  const second = SECOND_PARTS[(index * 7) % SECOND_PARTS.length];
  const fullName = `${NAME_PREFIX} ${first}${second}${String(index).padStart(3, "0")}`;
  const email = `lb.seed.${index}@neongambit.local`;

  return {
    fullName,
    email,
    password: hashedPassword,
    rating: blitzRating,
    bulletRating,
    blitzRating,
    rapidRating,
    classicalRating,
    bulletRd: rdFromGames(bulletGames),
    blitzRd: rdFromGames(blitzGames),
    rapidRd: rdFromGames(rapidGames),
    classicalRd: rdFromGames(classicalGames),
    bulletVolatility: volFromSeed(index, 11),
    blitzVolatility: volFromSeed(index, 12),
    rapidVolatility: volFromSeed(index, 13),
    classicalVolatility: volFromSeed(index, 14),
    bulletLastRatedAt: daysAgoDate(index, 15),
    blitzLastRatedAt: daysAgoDate(index, 16),
    rapidLastRatedAt: daysAgoDate(index, 17),
    classicalLastRatedAt: daysAgoDate(index, 18),
    bulletGames,
    blitzGames,
    rapidGames,
    classicalGames,
    gamesPlayed,
    gamesWon,
    avatar: "",
  };
}

async function seedLeaderboardUsers() {
  const count = getArgValue("--count", 120);
  const dryRun = hasFlag("--dry-run");
  const noReset = hasFlag("--no-reset");
  const shouldReset = !noReset;

  console.log("Seeding leaderboard users...");
  console.log(`Count: ${count}`);
  console.log(`Mode: ${dryRun ? "DRY RUN (no writes)" : "WRITE"}`);
  console.log(`Reset existing seed users: ${shouldReset ? "yes" : "no"}`);

  await connectDB();

  try {
    const hashedPassword = await bcrypt.hash("leaderboard123", 10);
    const docs = [];
    for (let i = 1; i <= count; i += 1) {
      docs.push(buildSeedUser(i, hashedPassword));
    }

    if (dryRun) {
      const existing = await User.countDocuments({ email: EMAIL_PATTERN });
      console.log(`Existing seed users: ${existing}`);
      console.log(`Would upsert: ${docs.length}`);
      return;
    }

    if (shouldReset) {
      const removed = await User.deleteMany({ email: EMAIL_PATTERN });
      console.log(`Removed existing seed users: ${removed.deletedCount}`);
    }

    const operations = docs.map((doc) => ({
      updateOne: {
        filter: { email: doc.email },
        update: { $set: doc },
        upsert: true,
      },
    }));

    const result = await User.bulkWrite(operations, { ordered: false });
    const created = (result.upsertedCount ?? 0) + 0;
    const updated = result.modifiedCount ?? 0;

    console.log(`Seeded users: ${docs.length}`);
    console.log(`Created: ${created}`);
    console.log(`Updated: ${updated}`);
    console.log("Default password for seeded users: leaderboard123");
  } finally {
    await mongoose.disconnect();
  }
}

seedLeaderboardUsers().catch(async (error) => {
  console.error("Leaderboard seed failed:", error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect errors in failure path
  }
  process.exit(1);
});
