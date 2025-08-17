const fs = require('fs');

if (process.argv.length < 5) {
  console.error('Usage: node tools/print_lines.js <file> <startLine> <endLine>');
  process.exit(1);
}

const [,, file, startStr, endStr] = process.argv;
const start = parseInt(startStr, 10);
const end = parseInt(endStr, 10);

if (!fs.existsSync(file)) {
  console.error('File not found:', file);
  process.exit(1);
}

const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
const from = Math.max(1, start);
const to = Math.min(lines.length, end);
for (let i = from; i <= to; i++) {
  const ln = String(i).padStart(5, ' ');
  console.log(`${ln}: ${lines[i-1]}`);
}

