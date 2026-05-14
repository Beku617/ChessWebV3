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

const DIFFICULTY_TONE = {
  beginner: {
    en: "beginner",
    mn: "эхлэгч",
    traitEn: "forgives mistakes but snaps up loose pieces",
    traitMn: "алдаа уучилдаг ч сул хүүг шууд авдаг",
  },
  casual: {
    en: "casual",
    mn: "сонирхогч",
    traitEn: "keeps things practical with simple plans",
    traitMn: "практик тоглож, энгийн төлөвлөгөө барьдаг",
  },
  intermediate: {
    en: "intermediate",
    mn: "дунд",
    traitEn: "spots common tactics and improves each move",
    traitMn: "түгээмэл тактикийг харж, нүүдэл бүрээр сайжирдаг",
  },
  advanced: {
    en: "advanced",
    mn: "ахисан",
    traitEn: "coordinates pieces quickly and squeezes small edges",
    traitMn: "хөлгүүдээ хурдан уялдуулж, жижиг давууг шахдаг",
  },
  master: {
    en: "master",
    mn: "мастер",
    traitEn: "calculates deeply and converts advantages precisely",
    traitMn: "гүн тооцоолж, давууг маш нарийн ялалт болгодог",
  },
};

const STYLE_TONE = {
  aggressive: { en: "aggressive attacker", mn: "довтолгоонд дуртай довтлогч" },
  defensive: { en: "defensive strategist", mn: "хамгаалалт төвтэй стратегич" },
  balanced: { en: "balanced all-rounder", mn: "тэнцвэртэй универсал" },
  random: { en: "unpredictable trickster", mn: "тааварлашгүй зальтан" },
};

function buildSeedBotDescription(difficulty, style) {
  const tone = DIFFICULTY_TONE[difficulty] || DIFFICULTY_TONE.beginner;
  const styleTone = STYLE_TONE[style] || STYLE_TONE.balanced;
  return `EN: A ${tone.en}-level ${styleTone.en} who ${tone.traitEn}. MN: ${tone.mn} түвшний ${styleTone.mn}; ${tone.traitMn}.`;
}

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
    description: buildSeedBotDescription(difficulty, style),
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
