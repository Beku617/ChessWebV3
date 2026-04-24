import { buildPuzzle3Dataset } from "./src/data/Puzzle3/buildPuzzleDataset.js";

const API_URL = process.env.API_URL || "http://localhost:3001";
const batchSize = 10;

async function importPuzzles() {
  const limit = Number.parseInt(process.argv[2], 10);
  const allPuzzles = buildPuzzle3Dataset();
  const puzzlesData =
    Number.isFinite(limit) && limit > 0 ? allPuzzles.slice(0, limit) : allPuzzles;

  console.log(`Starting import of ${puzzlesData.length} puzzles to ${API_URL}`);

  try {
    let imported = 0;
    let failed = 0;

    for (let index = 0; index < puzzlesData.length; index += batchSize) {
      const batch = puzzlesData.slice(index, index + batchSize);
      const batchNumber = Math.floor(index / batchSize) + 1;
      const batchEnd = Math.min(index + batchSize, puzzlesData.length);

      console.log(`Batch ${batchNumber}: puzzles ${index + 1}-${batchEnd}`);

      for (const puzzle of batch) {
        try {
          const response = await fetch(`${API_URL}/api/admin/puzzles`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            credentials: "include",
            body: JSON.stringify(puzzle),
          });

          if (!response.ok) {
            failed += 1;
            const errorText = await response.text();
            console.log(
              `[Failed] ${puzzle.title} - ${response.status} ${errorText}`,
            );
            continue;
          }

          imported += 1;
          console.log(`[Imported ${imported}/${puzzlesData.length}] ${puzzle.title}`);
        } catch (error) {
          failed += 1;
          console.log(`[Error] ${puzzle.title} - ${error.message}`);
        }
      }

      if (index + batchSize < puzzlesData.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    console.log("");
    console.log("Import Summary");
    console.log(`Imported: ${imported}`);
    console.log(`Failed: ${failed}`);
  } catch (error) {
    console.error("Import failed:", error.message);
    process.exit(1);
  }
}

importPuzzles();
