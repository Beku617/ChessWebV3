import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read the parsed puzzles
const puzzlesData = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'puzzles-import-test-50.json'), 'utf8')
);

const API_URL = process.env.API_URL || 'http://localhost:3001';

console.log(`📤 Starting import of ${puzzlesData.length} puzzles to ${API_URL}\n`);

async function importPuzzles() {
  try {
    // Send puzzles in batches of 10
    const batchSize = 10;
    let imported = 0;
    let failed = 0;

    for (let i = 0; i < puzzlesData.length; i += batchSize) {
      const batch = puzzlesData.slice(i, i + batchSize);
      
      console.log(`📦 Batch ${Math.floor(i / batchSize) + 1}: Importing puzzles ${i + 1}-${Math.min(i + batchSize, puzzlesData.length)}...`);

      for (const puzzle of batch) {
        try {
          const response = await fetch(`${API_URL}/api/admin/puzzles`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include', // Include cookies for auth
            body: JSON.stringify(puzzle),
          });

          if (response.ok) {
            imported++;
            console.log(`   ✅ [${imported}/${puzzlesData.length}] ${puzzle.title}`);
          } else {
            failed++;
            const error = await response.text();
            console.log(`   ❌ [Failed] ${puzzle.title} - ${response.status} ${error}`);
          }
        } catch (error) {
          failed++;
          console.log(`   ❌ [Error] ${puzzle.title} - ${error.message}`);
        }
      }

      // Small delay between batches
      if (i + batchSize < puzzlesData.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`\n📊 Import Summary:`);
    console.log(`   ✅ Successfully imported: ${imported}/${puzzlesData.length}`);
    console.log(`   ❌ Failed: ${failed}/${puzzlesData.length}`);
    console.log(`   📈 Success rate: ${((imported / puzzlesData.length) * 100).toFixed(1)}%`);
    
  } catch (error) {
    console.error('❌ Import failed:', error.message);
    process.exit(1);
  }
}

importPuzzles();
