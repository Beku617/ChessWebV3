import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { writePuzzle3Dataset } from "../../src/data/Puzzle3/buildPuzzleDataset.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const puzzles = writePuzzle3Dataset();
const first50 = puzzles.slice(0, 50);
const outputPath = path.join(__dirname, "puzzles-import-test-50.json");

fs.writeFileSync(outputPath, `${JSON.stringify(first50, null, 2)}\n`);

console.log(`Saved ${first50.length} normalized puzzles to ${outputPath}`);

if (first50.length > 0) {
  console.log(
    JSON.stringify(
      {
        first: first50[0].title,
        last: first50[first50.length - 1].title,
      },
      null,
      2,
    ),
  );
}
