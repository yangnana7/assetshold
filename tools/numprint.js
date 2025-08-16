const fs = require('fs');
const path = require('path');
const file = process.argv[2];
if (!file) { console.error('Usage: node tools/numprint.js <file>'); process.exit(1); }
const p = path.resolve(process.cwd(), file);
const data = fs.readFileSync(p, 'utf8').split(/\r?\n/);
data.forEach((line, i) => {
  const n = String(i+1).padStart(4,' ');
  process.stdout.write(`${n}: ${line}\n`);
});

