const fs = require('fs');
const path = require('path');
const file = process.argv[2];
const term = process.argv[3] || '';
if (!file || !term) { console.error('Usage: node tools/search.js <file> <term>'); process.exit(1); }
const s = fs.readFileSync(path.resolve(file), 'utf8').split(/\r?\n/);
const m = [];
s.forEach((l,i)=>{ if (l.includes(term)) m.push(i); });
m.forEach((i)=>{
  const start = Math.max(0, i-5); const end = Math.min(s.length, i+6);
  console.log(`--- ${i+1} matches '${term}'`);
  for (let j=start;j<end;j++) console.log(String(j+1).padStart(5,' ')+': '+s[j]);
});

