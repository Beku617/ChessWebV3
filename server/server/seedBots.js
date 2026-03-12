// Script to force reseed all bots
// Run with: node seedBots.js

import mongoose from "mongoose";
import { config } from "dotenv";
import Bot from "./models/Bot.js";
import { botSeedData } from "./seeds/bots.js";

config();

const MONGODB_URL =
  process.env.MONGODB_URL || "mongodb://localhost:27017/neongambit";

async function reseedBots() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URL);
    console.log("✅ Connected to MongoDB");

    // Delete all existing bots
    console.log("🗑️  Deleting existing bots...");
    const deleteResult = await Bot.deleteMany({});
    console.log(`   Deleted ${deleteResult.deletedCount} bots`);

    // Insert new bots
    console.log("🤖 Inserting bot seed data...");
    const result = await Bot.insertMany(botSeedData);
    console.log(`✅ Successfully seeded ${result.length} bots!`);

    // Show summary by difficulty
    const summary = {};
    result.forEach((bot) => {
      summary[bot.difficulty] = (summary[bot.difficulty] || 0) + 1;
    });
    console.log("\n📊 Summary by difficulty:");
    Object.entries(summary).forEach(([diff, count]) => {
      console.log(`   ${diff}: ${count} bots`);
    });

    await mongoose.disconnect();
    console.log("\n👋 Done!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

reseedBots();
