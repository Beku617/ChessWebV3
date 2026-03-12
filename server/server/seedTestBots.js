import mongoose from "mongoose";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Bot from "./models/Bot.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, "..", ".env") });

const MONGODB_URL =
  process.env.MONGODB_URL || "mongodb://localhost:27017/neongambit";

const TARGET_COUNT = 30;
const DIFFICULTIES = [
  "beginner",
  "casual",
  "intermediate",
  "advanced",
  "master",
];

function buildBot(index) {
  const difficulty = DIFFICULTIES[(index - 1) % DIFFICULTIES.length];
  const tierConfig = {
    beginner: { baseElo: 500, skill: 2, depth: 4, think: 700, blunder: 0.35 },
    casual: { baseElo: 900, skill: 5, depth: 7, think: 1100, blunder: 0.2 },
    intermediate: {
      baseElo: 1300,
      skill: 9,
      depth: 10,
      think: 1600,
      blunder: 0.12,
    },
    advanced: {
      baseElo: 1700,
      skill: 13,
      depth: 13,
      think: 2200,
      blunder: 0.06,
    },
    master: { baseElo: 2150, skill: 18, depth: 18, think: 3000, blunder: 0.02 },
  };
  const playStyles = ["balanced", "aggressive", "defensive", "random"];
  const style = playStyles[(index - 1) % playStyles.length];
  const conf = tierConfig[difficulty];

  return {
    name: `Test Bot ${String(index).padStart(2, "0")}`,
    eloRating: conf.baseElo + ((index * 13) % 120),
    difficulty,
    category: "test",
    title: "",
    quote: `Test bot #${index} ready for quick matches.`,
    description: `Auto-generated test bot ${index} for QA and UI testing.`,
    personality: `Plays a ${style} style at ${difficulty} difficulty.`,
    countryCode: "US",
    playStyle: style,
    skillLevel: conf.skill,
    depth: conf.depth,
    thinkTimeMs: conf.think,
    blunderChance: conf.blunder,
    aggressiveness:
      style === "aggressive" ? 35 : style === "defensive" ? -30 : 0,
    openingBook: true,
    isActive: true,
    sortOrder: 1000 + index,
  };
}

async function seedTestBots() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URL);
    console.log("Connected.");

    const existingNames = new Set(
      (await Bot.find({}, { name: 1, _id: 0 }).lean()).map((b) =>
        String(b.name).toLowerCase(),
      ),
    );

    const candidates = [];
    for (let i = 1; i <= TARGET_COUNT; i++) {
      const bot = buildBot(i);
      if (!existingNames.has(bot.name.toLowerCase())) {
        candidates.push(bot);
      }
    }

    if (candidates.length === 0) {
      console.log("No new test bots inserted. Test Bot 01-30 already exist.");
      return;
    }

    const inserted = await Bot.insertMany(candidates, { ordered: false });
    console.log(`Inserted ${inserted.length} test bots.`);

    const total = await Bot.countDocuments({
      name: { $regex: /^Test Bot \d{2}$/i },
    });
    console.log(`Total 'Test Bot XX' records in DB: ${total}`);
  } catch (error) {
    console.error("Failed to seed test bots:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

seedTestBots();
