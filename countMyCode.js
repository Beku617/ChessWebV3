const fs = require('fs');
const path = require('path');

const ext = ['.ts', '.tsx', '.js', '.jsx', '.css', '.json', '.html'];
const skipDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'docs', 'tmp', 'docx-render-check'];

let files = 0;
let lines = 0;
const fileDetails = [];

function walk(dir) {
  try {
    fs.readdirSync(dir).forEach(f => {
      const fullPath = path.join(dir, f);
      const relPath = path.relative('.', fullPath);
      
      if (skipDirs.includes(f)) return;
      
      try {
        const s = fs.statSync(fullPath);
        if (s.isDirectory()) {
          walk(fullPath);
        } else if (ext.includes(path.extname(f))) {
          files++;
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lineCount = content.split('\n').length;
          lines += lineCount;
          fileDetails.push({ path: relPath, lines: lineCount });
        }
      } catch (e) {}
    });
  } catch (e) {}
}

walk('.');

console.log('\n=== YOUR CODE STATISTICS ===\n');
fileDetails.sort((a, b) => b.lines - a.lines).forEach(f => {
  console.log(`${f.path.padEnd(50)} ${f.lines.toString().padStart(6)} lines`);
});
console.log('\n' + '='.repeat(60));
console.log(`Total Files: ${files}`);
console.log(`Total Lines: ${lines}`);
console.log('='.repeat(60) + '\n');
