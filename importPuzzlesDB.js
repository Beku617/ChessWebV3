import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/neongambit';

// Define Puzzle schema
const puzzleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  fen: { type: String, required: true },
  solution: { type: String, required: true },
  difficulty: { type: String, default: 'Medium' },
  rating: { type: Number, default: 1200 },
  description: { type: String },
  themes: [String],
  motifs: [String],
  quality: {
    attempts: { type: Number, default: 0 },
    avgRating: { type: Number, default: 0 }
  },
  createdAt: { type: Date, default: Date.now }
});

const Puzzle = mongoose.model('Puzzle', puzzleSchema, 'puzzles');

async function importPuzzles() {
  try {
    console.log(`📡 Connecting to MongoDB: ${MONGODB_URL}`);
    await mongoose.connect(MONGODB_URL);
    console.log('✅ Connected to MongoDB\n');

    // Read the parsed puzzles
    const puzzlesData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'puzzles-import-test-50.json'), 'utf8')
    );

    console.log(`📤 Importing ${puzzlesData.length} puzzles to MongoDB\n`);

    let imported = 0;
    let failed = 0;

    for (const puzzle of puzzlesData) {
      try {
        // Check if puzzle already exists
        const existing = await Puzzle.findOne({ fen: puzzle.fen });
        if (existing) {
          console.log(`⏭️  [Skipped] ${puzzle.title} (already exists)`);
          continue;
        }

        // Create new puzzle
        const newPuzzle = new Puzzle(puzzle);
        await newPuzzle.save();
        imported++;
        console.log(`✅ [${imported}/${puzzlesData.length}] ${puzzle.title}`);
      } catch (error) {
        failed++;
        console.log(`❌ [${failed}] ${puzzle.title} - ${error.message}`);
      }
    }

    console.log(`\n📊 Import Summary:`);
    console.log(`   ✅ Successfully imported: ${imported}/${puzzlesData.length}`);
    console.log(`   ⏭️  Skipped (duplicates): ${puzzlesData.length - imported - failed}`);
    console.log(`   ❌ Failed: ${failed}/${puzzlesData.length}`);
    console.log(`   📈 Success rate: ${((imported / puzzlesData.length) * 100).toFixed(1)}%\n`);

    // Get total count
    const totalPuzzles = await Puzzle.countDocuments();
    console.log(`📚 Total puzzles in database: ${totalPuzzles}`);

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Import failed:', error.message);
    process.exit(1);
  }
}

importPuzzles();
