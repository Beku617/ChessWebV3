import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const extensions = ['.ts', '.tsx', '.js', '.jsx', '.css', '.json'];
const exclude = ['node_modules', '.git', 'dist', 'build', 'public', 'tmp', 'docx-render-check', 'docs'];

const stats = {};
let totalLines = 0;
let totalFiles = 0;

function walk(dir) {
  try {
    fs.readdirSync(dir).forEach(file => {
      const fullPath = path.join(dir, file);
      const relative = path.relative('.', fullPath);
      
      if (exclude.some(e => relative.includes(e))) return;
      
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else {
        const ext = path.extname(file);
        if (extensions.includes(ext)) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n').length;
          
          if (!stats[ext]) stats[ext] = { files: 0, lines: 0 };
          stats[ext].files++;
          stats[ext].lines += lines;
          totalLines += lines;
          totalFiles++;
        }
      }
    });
  } catch(e) {}
}

walk('.');

console.log('==========================================');
console.log('         CODE STATISTICS');
console.log('==========================================');
console.log('');
console.log('TOTAL:');
console.log('  Files: ' + totalFiles);
console.log('  Lines: ' + totalLines);
console.log('');
console.log('BY FILE TYPE:');
Object.keys(stats)
  .sort((a, b) => stats[b].lines - stats[a].lines)
  .forEach(ext => {
    const s = stats[ext];
    console.log('  ' + ext + ': ' + s.files + ' files, ' + s.lines + ' lines');
  });
console.log('==========================================');
