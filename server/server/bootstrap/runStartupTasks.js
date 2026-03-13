import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import { seedPuzzles, seedGamePageConfig, seedBots } from "../seeds/index.js";
import { migrateLegacyRuntimeMedia } from "../utils/runtimeMediaMigration.js";

function runStartupTasks() {
  connectDB();

  mongoose.connection.once("open", () => {
    seedPuzzles().catch(console.error);
    seedGamePageConfig().catch(console.error);
    seedBots().catch(console.error);
    migrateLegacyRuntimeMedia()
      .then((result) => {
        const summaries = [
          ["community", result?.community],
          ["messages", result?.messages],
          ["bots", result?.bots],
        ];
        summaries.forEach(([label, summary]) => {
          if (Number(summary?.migrated || 0) > 0) {
            console.log(
              `Migrated ${summary.migrated}/${summary.scanned} legacy ${label} media records to persistent storage.`,
            );
          }
        });
      })
      .catch((error) => {
        console.error("Runtime media migration error:", error);
      });
  });
}

export { runStartupTasks };
