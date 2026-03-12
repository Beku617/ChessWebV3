import mongoose from "mongoose";
import { connectDB } from "./config/db.js";
import { User } from "./models/index.js";
import {
  DEFAULT_GLICKO_RD,
  DEFAULT_GLICKO_VOLATILITY,
} from "./utils/glicko2.js";

const MIN_RATING = 100;
const MAX_RATING = 4000;

function normalizeRating(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1200;
  if (parsed < MIN_RATING) return MIN_RATING;
  if (parsed > MAX_RATING) return MAX_RATING;
  return Math.round(parsed);
}

function needsBackfill(value) {
  return !Number.isFinite(Number(value));
}

async function migrateRatingsToPools() {
  const dryRun = process.argv.includes("--dry-run");
  const startedAt = Date.now();

  console.log("Starting rating pool backfill...");
  console.log(`Mode: ${dryRun ? "DRY RUN (no writes)" : "WRITE"}`);

  await connectDB();

  let scanned = 0;
  let changed = 0;

  const cursor = User.find({})
    .select(
      "_id rating bulletRating blitzRating rapidRating classicalRating gamesPlayed bulletGames blitzGames rapidGames classicalGames bulletRd blitzRd rapidRd classicalRd bulletVolatility blitzVolatility rapidVolatility classicalVolatility",
    )
    .cursor();

  try {
    for await (const user of cursor) {
      scanned += 1;

      const baseRating = normalizeRating(user.rating);
      const baseGames = Math.max(0, Number(user.gamesPlayed) || 0);
      const poolGamesSeed = Math.min(10, baseGames);
      const patch = {};

      if (needsBackfill(user.rating)) {
        patch.rating = baseRating;
      }
      if (needsBackfill(user.bulletRating)) {
        patch.bulletRating = baseRating;
      }
      if (needsBackfill(user.blitzRating)) {
        patch.blitzRating = baseRating;
      }
      if (needsBackfill(user.rapidRating)) {
        patch.rapidRating = baseRating;
      }
      if (needsBackfill(user.classicalRating)) {
        patch.classicalRating = baseRating;
      }
      if (needsBackfill(user.bulletGames)) {
        patch.bulletGames = poolGamesSeed;
      }
      if (needsBackfill(user.blitzGames)) {
        patch.blitzGames = poolGamesSeed;
      }
      if (needsBackfill(user.rapidGames)) {
        patch.rapidGames = poolGamesSeed;
      }
      if (needsBackfill(user.classicalGames)) {
        patch.classicalGames = poolGamesSeed;
      }
      if (needsBackfill(user.bulletRd)) {
        patch.bulletRd = DEFAULT_GLICKO_RD;
      }
      if (needsBackfill(user.blitzRd)) {
        patch.blitzRd = DEFAULT_GLICKO_RD;
      }
      if (needsBackfill(user.rapidRd)) {
        patch.rapidRd = DEFAULT_GLICKO_RD;
      }
      if (needsBackfill(user.classicalRd)) {
        patch.classicalRd = DEFAULT_GLICKO_RD;
      }
      if (needsBackfill(user.bulletVolatility)) {
        patch.bulletVolatility = DEFAULT_GLICKO_VOLATILITY;
      }
      if (needsBackfill(user.blitzVolatility)) {
        patch.blitzVolatility = DEFAULT_GLICKO_VOLATILITY;
      }
      if (needsBackfill(user.rapidVolatility)) {
        patch.rapidVolatility = DEFAULT_GLICKO_VOLATILITY;
      }
      if (needsBackfill(user.classicalVolatility)) {
        patch.classicalVolatility = DEFAULT_GLICKO_VOLATILITY;
      }

      if (Object.keys(patch).length === 0) continue;

      changed += 1;
      if (!dryRun) {
        await User.updateOne({ _id: user._id }, { $set: patch });
      }
    }
  } finally {
    await cursor.close();
    await mongoose.disconnect();
  }

  const elapsedMs = Date.now() - startedAt;
  console.log(`Scanned users: ${scanned}`);
  console.log(`${dryRun ? "Would update" : "Updated"} users: ${changed}`);
  console.log(`Done in ${elapsedMs}ms`);
}

migrateRatingsToPools().catch(async (error) => {
  console.error("Rating pool backfill failed:", error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect errors in failure path
  }
  process.exit(1);
});
