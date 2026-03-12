import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { History } from "../models/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", "..", ".env") });

const MONGODB_URL = process.env.MONGODB_URL;
const MIN_STORED_MOVES = 3;

if (!MONGODB_URL) {
  console.error("MONGODB_URL is not defined in .env");
  process.exit(1);
}

const shortGamesQuery = {
  $or: [
    { moves: { $exists: false } },
    {
      $expr: {
        $lt: [{ $size: { $ifNull: ["$moves", []] } }, MIN_STORED_MOVES],
      },
    },
  ],
};

async function cleanupShortGames() {
  await mongoose.connect(MONGODB_URL);

  const totalBefore = await History.countDocuments();
  const shortBefore = await History.countDocuments(shortGamesQuery);

  if (shortBefore === 0) {
    console.log(
      `No games found with fewer than ${MIN_STORED_MOVES} moves. Nothing to clean.`,
    );
    console.log(`Total games unchanged: ${totalBefore}`);
    return;
  }

  const result = await History.deleteMany(shortGamesQuery);
  const totalAfter = await History.countDocuments();

  console.log(
    `Deleted ${result.deletedCount} game(s) with fewer than ${MIN_STORED_MOVES} moves.`,
  );
  console.log(`Total games before: ${totalBefore}`);
  console.log(`Total games after: ${totalAfter}`);
}

cleanupShortGames()
  .catch((error) => {
    console.error("Failed to clean short games:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
