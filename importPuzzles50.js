import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read the puzzle data file
const data = fs.readFileSync(path.join(__dirname, 'src/data/Puzzle3/PuzzleData.txt'), 'utf8');

// Split by game titles (pattern: Name vs Name, Location, Year)
// Look for lines that have " vs " and end with a year (1800-2099)
const lines = data.split('\n').map(l => l.trim());

let puzzles = [];
let currentPuzzle = null;
let fen = null;
let solution = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  // Skip empty lines
  if (!line) continue;
  
  // Check if this is a new puzzle (has " vs " and looks like a game title)
  if (line.includes(' vs ') && /\d{4}$/.test(line)) {
    // Save previous puzzle if exists
    if (currentPuzzle && fen) {
      puzzles.push({
        title: currentPuzzle,
        fen: fen,
        solution: solution.join(' '),
        difficulty: 'Medium',
        rating: 1200 + Math.random() * 800,
        description: currentPuzzle,
        themes: ['mate-in-2', 'tactical'],
        quality: { attempts: 0, avgRating: 0 }
      });
    }
    
    // Start new puzzle
    currentPuzzle = line;
    fen = null;
    solution = [];
  } 
  // FEN starts with rank indicators (8-1) or standard FEN pattern
  else if (/^[rnbqkpRNBQKP1-8]+\//.test(line)) {
    fen = line;
  }
  // Solution moves (contains dots and pieces)
  else if (line.match(/^\d+\..*[#×]|^1\.\.\..*[#×]/)) {
    solution.push(line);
  }
}

// Add last puzzle
if (currentPuzzle && fen) {
  puzzles.push({
    title: currentPuzzle,
    fen: fen,
    solution: solution.join(' '),
    difficulty: 'Medium',
    rating: 1200 + Math.random() * 800,
    description: currentPuzzle,
    themes: ['mate-in-2', 'tactical'],
    quality: { attempts: 0, avgRating: 0 }
  });
}

// Take first 50
const first50 = puzzles.slice(0, 50);

console.log(`\n✅ Parsed ${first50.length} puzzles for import test\n`);
if (first50.length > 0) {
  console.log('Sample puzzle (first):');
  console.log(JSON.stringify(first50[0], null, 2));
  console.log('\n...\n');
  if (first50.length > 1) {
    console.log('Sample puzzle (last of 50):');
    console.log(JSON.stringify(first50[49], null, 2));
  }
}

// Save to a JSON file for import
const outputPath = path.join(__dirname, 'puzzles-import-test-50.json');
fs.writeFileSync(outputPath, JSON.stringify(first50, null, 2));
console.log(`\n✅ Saved to: ${outputPath}`);
